"""Regression tests for atomic new-buffer consumption and hidden Wi-Fi stock.

Run: python3 -m unittest discover -s tests -v
No user database, downloads, network calls, or systemd actions are involved.
"""
import concurrent.futures
import json
import tempfile
import unittest

from ready_store import MAX_BODY_CACHE, MAX_NEW_BUFFER, ReadyStore


class NewBufferFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = ReadyStore(self.temp.name)
        with self.store.connect() as db:
            db.execute("INSERT OR REPLACE INTO status(key,value) VALUES (?,?)",
                       ("new_buffer_cutoff", json.dumps(1499.0)))

    def seed(self, label, start, stop, *, hidden=False, state="ready"):
        data = []
        for number in range(start, stop):
            url = f"https://example.test/{label}/{number}"
            name = f"{label}-{number}.json"
            body = {"url": url, "title": f"Article {number}",
                    "html": "<p>Prepared body</p>", "assets": []}
            (self.store.bodies / name).write_text(json.dumps(body), encoding="utf-8")
            data.append((url, json.dumps({"link": url, "source": "Example"}),
                         float(number), float(number), state, name, 33,
                         0.0 if hidden else float(number)))
        with self.store.connect() as db:
            db.executemany("""INSERT INTO articles
                (url,item,source_time,ready_time,state,body_file,schema_version,release_time)
                VALUES (?,?,?,?,?,?,?,?)""", data)

    def test_partial_ack_is_atomic_idempotent_and_monotonic(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1519)
        before = self.store.initial_progress()
        self.assertEqual(before["new_buffer"], 19)
        self.assertEqual(before["latest_new_release_time"], 1518.0)

        a = self.store.consume_new_buffer(through=1508)
        self.assertEqual(a["consumed_count"], 9)
        self.assertEqual(a["new_buffer"], 10)
        self.assertEqual(a["new_buffer_cutoff"], 1508.0)

        repeat = self.store.consume_new_buffer(through=1508)
        self.assertEqual(repeat["consumed_count"], 0)
        self.assertEqual(repeat["new_buffer"], 10)
        self.assertEqual(repeat["new_buffer_cutoff"], 1508.0)

        finish = self.store.consume_new_buffer(through=before["latest_new_release_time"])
        self.assertEqual(finish["consumed_count"], 10)
        self.assertEqual(finish["new_buffer"], 0)
        self.assertEqual(finish["new_buffer_cutoff"], 1518.0)
        self.assertEqual(self.store.initial_progress()["new_buffer"], 0)

    def test_lightweight_poll_matches_19_then_zero_then_two(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1519)
        self.seed("hidden", 3000, 3010, hidden=True)
        before = self.store.new_buffer_status()
        self.assertEqual(before["new_buffer"], 19)
        self.assertEqual(before["latest_new_release_time"], 1518.0)
        self.assertEqual(before["standby_ready"], 10)
        self.store.consume_new_buffer(through=before["latest_new_release_time"])
        self.assertEqual(self.store.new_buffer_status()["new_buffer"], 0)
        self.store.release_waiting()
        self.assertEqual(self.store.new_buffer_status()["new_buffer"], 2)

    def test_new_buffer_zero_before_initial_500_cutoff(self):
        # Before first 500 are committed, their count must never be
        # reported as 300 new articles by the lightweight endpoint.
        with self.store.connect() as db:
            db.execute("DELETE FROM status WHERE key='new_buffer_cutoff'")
        self.seed("initial", 1000, 1019)
        lite = self.store.new_buffer_status()
        self.assertEqual(lite["new_buffer"], 0)
        self.assertEqual(lite["latest_new_release_time"], 0.0)
        self.assertEqual(self.store.initial_progress()["new_buffer"], 0)

    def test_simultaneous_retries_do_not_ack_twice(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1519)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            results = list(executor.map(
                lambda _: self.store.consume_new_buffer(through=1518), range(3)))
        self.assertEqual(sum(row["consumed_count"] for row in results), 19)
        self.assertTrue(all(row["new_buffer"] == 0 for row in results))
        self.assertTrue(all(row["new_buffer_cutoff"] == 1518.0 for row in results))

    def test_standby_releases_two_distinct_articles_and_stays_hidden_before(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1519)
        self.seed("hidden", 3000, 3020, hidden=True)
        before = self.store.app_manifest(scope="all")
        self.assertEqual([x["tier"] for x in before].count("standby"), 20)
        self.assertEqual(self.store.consume_new_buffer(through=1518)["new_buffer"], 0)
        release = self.store.release_waiting()
        self.assertTrue(release["released"])
        self.assertEqual(release["released_count"], 2)
        self.assertEqual(release["new_buffer"], 2)
        # Two new URLs, not the same consumed 19.
        self.assertEqual(self.store.initial_progress()["new_buffer"], 2)
        self.assertEqual(self.store.release_waiting()["released_count"], 0)

    def test_retrying_standby_is_not_fake_available_stock(self):
        self.seed("base", 1000, 1500)
        self.seed("hidden", 3000, 3010, hidden=True, state="retry")
        self.assertEqual(self.store.initial_progress()["standby_ready"], 0)
        release = self.store.release_waiting()
        self.assertFalse(release["released"])
        self.assertEqual(release["standby"], 0)

    def test_all_manifest_includes_private_stock_without_releasing(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1519)
        self.seed("hidden", 3000, 3020, hidden=True)
        ordinary = self.store.app_manifest()
        full = self.store.app_manifest(scope="all")
        self.assertEqual(len(ordinary), 500)
        self.assertEqual(len(full), 539)
        self.assertEqual([x["tier"] for x in full].count("new"), 19)
        self.assertEqual([x["tier"] for x in full].count("committed"), MAX_BODY_CACHE)
        self.assertEqual([x["tier"] for x in full].count("standby"), 20)
        self.assertEqual(self.store.initial_progress()["new_buffer"], 19)
        self.assertEqual(self.store.standby_count(), 20)

    def test_1000_ready_standby_is_a_distinct_stock_target(self):
        self.seed("base", 1000, 1500)
        self.seed("hidden", 3000, 4000, hidden=True)
        self.assertEqual(self.store.standby_target(), 1000)
        self.assertEqual(self.store.initial_progress()["standby_ready"], 1000)
        self.assertEqual(self.store.new_buffer_status()["standby_ready"], 1000)
        self.assertEqual(self.store.new_buffer_status()["new_buffer"], 0)
        released=self.store.release_waiting()
        self.assertEqual(released["released_count"], 2)
        self.assertEqual(self.store.initial_progress()["standby_ready"], 998)
        self.assertEqual(self.store.release_waiting()["released_count"], 0)

    def test_only_server_controller_drains_stock(self):
        # The old prepare_worker auto-release loop drained the hidden stock
        # even when nobody was viewing. The server is now the sole release
        # owner and must gate its five-second timer on viewer activity.
        from pathlib import Path
        root=Path(__file__).resolve().parents[1]
        worker=(root/"prepare_worker.py").read_text(encoding="utf-8")
        server=(root/"server.py").read_text(encoding="utf-8")
        self.assertNotIn("def _auto_release_standby(",worker)
        self.assertNotIn("name='standby-auto-release'",worker)
        self.assertIn("def standby_release_pump(stop_event):",server)
        self.assertIn("if not viewer_recently_active():",server)
        self.assertIn("READY.release_waiting()",server)

    def test_full_buffer_slide_still_keeps_300_max(self):
        self.seed("base", 1000, 1500)
        self.seed("new", 1500, 1800)
        result = self.store.release_waiting()
        self.assertEqual(result["slid_count"], 0)
        self.assertEqual(result["new_buffer"], 300)
        self.assertLessEqual(result["new_buffer"], MAX_NEW_BUFFER)


if __name__ == "__main__":
    unittest.main()
