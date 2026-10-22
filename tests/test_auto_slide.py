"""Regression checks for full new-buffer atomic 20-for-20 rotations.

All tests use a temporary SQLite store. No live Pi files or services are touched.
"""
import json
import tempfile
import time
import unittest

from ready_store import (
    FULL_BUFFER_SWAP_BATCH,
    FULL_BUFFER_SWAP_INTERVAL_SECONDS,
    MAX_NEW_BUFFER,
    ReadyStore,
)


class AtomicFullBufferSwapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = ReadyStore(self.tmp.name)
        with self.store.connect() as c:
            c.execute("INSERT OR REPLACE INTO status(key,value) VALUES (?,?)",
                      ("new_buffer_cutoff", json.dumps(1499.0)))

    def seed(self, prefix, start, stop, hidden=False, state="ready"):
        with self.store.connect() as c:
            c.executemany("""INSERT INTO articles
                (url,item,source_time,ready_time,state,body_file,schema_version,release_time)
                VALUES (?,?,?,?,?,?,?,?)""",
                [(f"https://example.org/{prefix}/{i}", "{}", float(i), float(i),
                  state, f"{prefix}{i}.json", 33, 0.0 if hidden else float(i))
                 for i in range(start, stop)])

    def counts(self):
        with self.store.connect() as c:
            cutoff = self.store._buffer_cutoff(c)
            count = c.execute("""SELECT COUNT(*) FROM articles
                WHERE release_time>? AND state IN ('ready','retry','preparing')
                AND body_file IS NOT NULL""", (cutoff,)).fetchone()[0]
            base = [r["url"] for r in c.execute("""SELECT url FROM articles
                WHERE state='ready' AND release_time>0 AND release_time<=?
                ORDER BY release_time DESC LIMIT 500""", (cutoff,))]
            return count, base

    def test_config_has_20_in_swap_and_300_visible(self):
        self.assertEqual(FULL_BUFFER_SWAP_BATCH, 20)
        self.assertEqual(FULL_BUFFER_SWAP_INTERVAL_SECONDS, 30)
        self.assertEqual(MAX_NEW_BUFFER, 300)

    def test_20_old_to_base_and_20_standby_to_new_one_transaction(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1800)
        self.seed("standby", 2000, 2020, hidden=True)
        result = self.store.release_waiting()
        new_count, base = self.counts()
        self.assertEqual(result["slid_count"], 20)
        self.assertEqual(result["released_count"], 20)
        self.assertEqual((new_count, result["new_buffer"]), (300, 300))
        self.assertIn("https://example.org/new/1500", base)
        self.assertNotIn("https://example.org/base/1000", base)
        self.assertIn("https://example.org/base/1020", base)
        self.assertEqual(self.store.new_buffer_status()["standby_ready"], 0)

    def test_partial_stock_never_reduces_300(self):
        self.seed("new", 1500, 1800)
        self.seed("standby", 2000, 2019, hidden=True)
        self.assertEqual(self.store.release_waiting()["slid_count"], 0)
        self.assertEqual(self.counts()[0], 300)
        self.seed("standby", 2019, 2020, hidden=True)
        self.assertEqual(self.store.release_waiting()["slid_count"], 20)
        self.assertEqual(self.counts()[0], 300)

    def test_configured_standby_target_does_not_delay_ready_swap(self):
        self.store.set_standby_target(3000)
        self.seed("new", 1500, 1800)
        self.seed("standby", 2000, 2020, hidden=True)
        self.assertEqual(self.store.release_waiting()["slid_count"], 20)
        self.assertEqual(self.counts()[0], 300)

    def test_unfinished_articles_do_not_count_as_swap_stock(self):
        self.seed("new", 1500, 1800)
        self.seed("standby", 2000, 2020, hidden=True)
        with self.store.connect() as c:
            c.execute("UPDATE articles SET state='retry' WHERE url=?",
                      ("https://example.org/standby/2000",))
        result = self.store.release_waiting()
        self.assertEqual(result["slid_count"], 0)
        self.assertEqual(self.counts()[0], 300)

    def test_last_slot_fills_first_then_swaps_on_later_tick(self):
        self.seed("new", 1500, 1799)
        self.seed("standby", 2000, 2020, hidden=True)
        first = self.store.release_waiting()
        self.assertEqual(first["released_count"], 1)
        self.assertEqual(first["slid_count"], 0)
        self.assertEqual(first["new_buffer"], 300)
        # Nineteen standby bodies remain, so next tick waits.
        second = self.store.release_waiting()
        self.assertEqual(second["slid_count"], 0)
        self.assertEqual(second["new_buffer"], 300)

    def test_full_buffer_waits_without_stock_and_manual_ack_still_works(self):
        self.seed("new", 1500, 1800)
        self.assertEqual(self.store.release_waiting()["slid_count"], 0)
        state = self.store.new_buffer_status()
        self.assertTrue(state["auto_slide_waiting_for_standby"])
        self.assertFalse(state["auto_slide_eligible"])
        committed = self.store.consume_new_buffer(through=1799)
        self.assertEqual(committed["consumed_count"], 300)
        self.assertEqual(committed["new_buffer"], 0)

    def test_read_history_and_view_lease_survive_20_swap(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1800)
        self.seed("standby", 2000, 2020, hidden=True)
        viewed = "https://example.org/base/1000"
        with self.store.connect() as c:
            c.execute("INSERT INTO shared_reads(url,read_at) VALUES (?,?)", (viewed, time.time()))
            c.execute("UPDATE articles SET view_until=? WHERE url=?",
                      (time.time() + 3600, viewed))
        self.assertEqual(self.store.release_waiting()["slid_count"], 20)
        self.store.maintain()
        with self.store.connect() as c:
            self.assertIsNotNone(c.execute("SELECT url FROM shared_reads WHERE url=?",
                                           (viewed,)).fetchone())
            row = c.execute("SELECT state,body_file FROM articles WHERE url=?",
                            (viewed,)).fetchone()
            self.assertEqual(row["state"], "retired")
            self.assertIsNotNone(row["body_file"])


if __name__ == "__main__":
    unittest.main()
