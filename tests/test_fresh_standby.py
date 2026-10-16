"""Verify fresh articles enter hidden standby after initial publication.

These tests use a temporary SQLite DB and fake thumbnail bytes, no network, Pi
service, original database or archive files are touched.
"""
import json
import tempfile
import time
import unittest

from ready_store import ReadyStore, SCHEMA


class FreshStandbyTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store=ReadyStore(temp.name)

    def publish_current_article(self, suffix):
        now_ms=int(time.time()*1000)
        url="https://example.test/current-"+suffix
        item={"link":url,"title":"New article "+suffix,"source":"Example",
              "source_time":now_ms}
        with self.store.connect() as c:
            c.execute("INSERT INTO articles (url,item,source_time,state) VALUES (?,?,?,'pending')",
                      (url,json.dumps(item),now_ms))
        thumb=self.store.save_asset(b"dummy-thumb-"+suffix.encode(),"image/png")["path"]
        snapshot={"schema":SCHEMA,"complete":True,"title":item["title"],
                  "html":"<p>Fully prepared body</p>","assets":[thumb],"thumb":thumb}
        self.store.publish(url,snapshot)
        with self.store.connect() as c:
            return c.execute("SELECT state,release_time,body_file FROM articles WHERE url=?",
                             (url,)).fetchone()

    def test_fresh_article_is_hidden_after_500_committed(self):
        with self.store.connect() as c:
            c.execute("INSERT OR REPLACE INTO status(key,value) VALUES (?,?)",
                      ("new_buffer_cutoff",json.dumps(time.time()-1)))
        first=self.publish_current_article("1")
        second=self.publish_current_article("2")
        self.assertEqual(first["state"],"ready")
        self.assertEqual(second["state"],"ready")
        self.assertEqual(first["release_time"],0)
        self.assertEqual(second["release_time"],0)
        self.assertTrue(first["body_file"] and second["body_file"])
        self.assertEqual(self.store.initial_progress()["standby_ready"],2)
        self.assertEqual(self.store.new_buffer_status()["new_buffer"],0)
        self.assertEqual(self.store.release_waiting()["released_count"],2)
        self.assertEqual(self.store.new_buffer_status()["new_buffer"],2)
        self.assertEqual(self.store.initial_progress()["standby_ready"],0)

    def test_bootstrap_article_remains_visible(self):
        with self.store.connect() as c:
            c.execute("DELETE FROM status WHERE key='new_buffer_cutoff'")
        row=self.publish_current_article("bootstrap")
        self.assertEqual(row["state"],"ready")
        self.assertGreater(row["release_time"],0)
        self.assertEqual(self.store.initial_progress()["standby_ready"],0)
        self.assertEqual(self.store.new_buffer_status()["new_buffer"],0)

    def test_source_keeps_single_release_owner(self):
        from pathlib import Path
        root=Path(__file__).resolve().parents[1]
        worker=(root/"prepare_worker.py").read_text(encoding="utf-8")
        server=(root/"server.py").read_text(encoding="utf-8")
        store=(root/"ready_store.py").read_text(encoding="utf-8")
        self.assertNotIn("live_arrival=source_age",store)
        self.assertIn("release_time=0.0",store)
        self.assertNotIn("def _auto_release_standby(",worker)
        self.assertIn("if not viewer_recently_active():",server)


if __name__=="__main__":
    unittest.main()
