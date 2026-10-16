"""Real temporary SQLite/WAL contention, retention and malformed-data tests."""
import concurrent.futures
import json
import sqlite3
import tempfile
import time
import unittest
from ready_store import ReadyStore


class StabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store=ReadyStore(self.temp.name)
        with self.store.connect() as c:
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',('new_buffer_cutoff','1499'))

    def seed(self,url,release=1500,state='ready',body=True):
        name=url.rsplit('/',1)[-1]+'.json'
        if body:
            (self.store.bodies/name).write_text(json.dumps({'html':'<p>Prepared body</p>','title':url,'assets':[],'url':url}))
        item=json.dumps({'link':url,'title':url,'source':'test'})
        with self.store.connect() as c:
            c.execute('''INSERT INTO articles(url,item,source_time,ready_time,state,body_file,schema_version,release_time)
              VALUES (?,?,?,?,?,?,?,?)''',(url,item,1500,1500 if body else None,state,name if body else None,33,release))

    def test_discovery_does_not_hide_completed_reprepare(self):
        url='https://example.test/saved'
        self.seed(url,state='retry')
        self.seed('https://example.test/unfinished',state='retry',body=False)
        self.store.discover([{'link':'https://example.test/latest','title':'fresh unique','timestamp':1600}],authoritative=True)
        self.assertIsNotNone(self.store.article(url))
        self.assertEqual([r['link'] for r in self.store.list_ready()],[url])
        with self.store.connect() as c:
            self.assertEqual(c.execute('SELECT state FROM articles WHERE url=?',('https://example.test/unfinished',)).fetchone()[0],'evicted')

    def test_malformed_feed_entries_do_not_stop_other_candidates(self):
        rows=[None,1,[],{'link':'https://example.test/bad-time','timestamp':'bad'},
              {'link':'https://example.test/infinity','timestamp':float('inf')},
              {'link':'https://example.test/good','timestamp':1600}]
        self.assertEqual(self.store.discover(rows),3)
        with self.store.connect() as c:
            found=dict(c.execute('SELECT url,source_time FROM articles'))
        self.assertEqual(found['https://example.test/good'],1600)
        self.assertEqual(found['https://example.test/bad-time'],0)
        self.assertEqual(found['https://example.test/infinity'],0)

    def test_list_and_body_remain_responsive_during_writer(self):
        url='https://example.test/saved'
        self.seed(url)
        writer=sqlite3.connect(self.store.db)
        self.addCleanup(writer.close)
        writer.execute('BEGIN IMMEDIATE')
        writer.execute("UPDATE articles SET title='uncommitted'")
        started=time.monotonic()
        rows=self.store.list_ready()
        body=self.store.article(url)
        elapsed=time.monotonic()-started
        self.assertLess(elapsed,1.0,'read path waited for a busy writer')
        self.assertEqual(len(rows),1)
        self.assertIsNotNone(body)
        writer.rollback()
        # Renewal still works normally and never shortens a longer lease.
        self.store.list_ready()
        with self.store.connect() as c:
            self.assertGreater(c.execute('SELECT view_until FROM articles').fetchone()[0],time.time()+500)
            c.execute('UPDATE articles SET view_until=?',(time.time()+7200,))
        self.store.list_ready()
        with self.store.connect() as c:
            self.assertGreater(c.execute('SELECT view_until FROM articles').fetchone()[0],time.time()+7100)

    def test_invalid_ack_does_not_consume_any_new_articles(self):
        self.seed('https://example.test/new')
        for value in ['bad',float('nan'),float('inf'),-1,0,[],{}]:
            with self.subTest(value=value),self.assertRaises(ValueError):
                self.store.consume_new_buffer(through=value)
        self.assertEqual(self.store.new_buffer_status()['new_buffer'],1)
        self.assertEqual(self.store.consume_new_buffer(through=1500)['consumed_count'],1)

    def test_parallel_releasers_only_publish_two_once(self):
        for i in range(8):self.seed('https://example.test/hidden'+str(i),release=0)
        peer=ReadyStore(self.temp.name)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda s:s.release_waiting(),[self.store,peer,self.store,peer]))
        self.assertEqual(sum(r['released_count'] for r in results),2)
        self.assertEqual(self.store.new_buffer_status()['new_buffer'],2)
        self.assertEqual(self.store.new_buffer_status()['standby_ready'],6)

    def test_restart_preserves_body_cutoff_and_hidden_stock(self):
        self.seed('https://example.test/new')
        self.seed('https://example.test/hidden',release=0)
        before=self.store.new_buffer_status()
        restarted=ReadyStore(self.temp.name)
        self.assertEqual(restarted.new_buffer_status(),before)
        self.assertIsNotNone(restarted.article('https://example.test/new'))

    def test_mixed_concurrent_readers_and_writer(self):
        for i in range(20):self.seed('https://example.test/article'+str(i),release=1500+i)
        peer=ReadyStore(self.temp.name)
        def write():
            for i in range(60):
                with peer.connect() as c:
                    c.execute("UPDATE articles SET title=? WHERE url=?",(str(i),'https://example.test/article0'))
        def read():
            for _ in range(20):
                self.assertEqual(len(self.store.list_ready()),20)
                self.assertIsNotNone(self.store.article('https://example.test/article0'))
                self.assertEqual(self.store.new_buffer_status()['new_buffer'],20)
        with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
            tasks=[pool.submit(write)]+[pool.submit(read) for _ in range(6)]
            for task in tasks:task.result(timeout=20)
