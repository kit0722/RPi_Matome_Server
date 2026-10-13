"""Regression tests for the automatic 300-new -> 200-new slide."""
import json
import tempfile
import time
import unittest

from ready_store import ReadyStore


class AutoSlideTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = ReadyStore(self.tmp.name)
        with self.store.connect() as c:
            c.execute("INSERT OR REPLACE INTO status(key,value) VALUES (?,?)",
                      ("new_buffer_cutoff", json.dumps(1499.0)))

    def seed(self, prefix, start, end, hidden=False):
        with self.store.connect() as c:
            c.executemany("""INSERT INTO articles
                (url,item,source_time,ready_time,state,body_file,schema_version,release_time)
                VALUES (?,?,?,?,?,?,?,?)""",
                [(f"https://example.org/{prefix}/{i}", "{}", float(i), float(i),
                  "ready", f"{prefix}{i}.json", 33, 0.0 if hidden else float(i))
                 for i in range(start, end)])

    def counts(self):
        with self.store.connect() as c:
            cutoff = self.store._buffer_cutoff(c)
            new_count = c.execute("SELECT COUNT(*) FROM articles WHERE state='ready' AND release_time>?",
                                  (cutoff,)).fetchone()[0]
            base = [r["url"] for r in c.execute("""SELECT url FROM articles
                WHERE state='ready' AND release_time>0 AND release_time<=?
                ORDER BY release_time DESC LIMIT 500""", (cutoff,))]
            return new_count, base

    def test_promote_100_and_trim_base(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1800)
        with self.store.connect() as c:
            shifted = self.store._slide_full_new_buffer(c)
        new_count, base = self.counts()
        self.assertEqual((shifted, new_count, len(base)), (100, 200, 500))
        self.assertIn("https://example.org/new/1500", base)
        self.assertNotIn("https://example.org/base/1000", base)
        self.assertIn("https://example.org/base/1100", base)

    def test_standby_reaches_300_and_rolls(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1799)
        self.seed("standby", 2000, 2100, hidden=True)
        result = self.store.release_waiting()
        self.assertEqual(result["released_count"], 1)
        self.assertEqual(result["slid_count"], 100)
        self.assertEqual(result["new_buffer"], 200)

    def test_full_buffer_rolls_without_standby(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1800)
        result = self.store.release_waiting()
        self.assertFalse(result["released"])
        self.assertEqual(result["slid_count"], 100)
        self.assertEqual(self.counts()[0], 200)

    def test_read_history_and_active_view_lease_survive(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1800)
        viewed = "https://example.org/base/1000"
        with self.store.connect() as c:
            c.execute("INSERT INTO shared_reads(url,read_at) VALUES (?,?)", (viewed, time.time()))
            c.execute("UPDATE articles SET view_until=? WHERE url=?",
                      (time.time() + 3600, viewed))
            self.store._slide_full_new_buffer(c)
        self.store.maintain()
        with self.store.connect() as c:
            self.assertIsNotNone(c.execute("SELECT url FROM shared_reads WHERE url=?", (viewed,)).fetchone())
            row = c.execute("SELECT state,body_file FROM articles WHERE url=?", (viewed,)).fetchone()
            self.assertEqual(row["state"], "retired")
            self.assertIsNotNone(row["body_file"])


if __name__ == "__main__":
    unittest.main()
