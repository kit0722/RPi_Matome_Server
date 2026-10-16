"""Loopback HTTP integration with a disposable cache, no external requests."""
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch


class HTTPStabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        with patch.dict(os.environ,{'MATOME_CACHE_DIR':cls.temp.name}):
            spec=importlib.util.spec_from_file_location('matome_http_test',Path(__file__).resolve().parents[1]/'server.py')
            cls.module=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.module)
        class QuietHandler(cls.module.Handler):
            def log_message(self,*args):pass
        cls.http=cls.module.ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join(timeout=3)
        cls.module.MAINTENANCE.shutdown(wait=True)
        cls.module.REFRESH.shutdown(wait=True)
        cls.temp.cleanup()

    def setUp(self):
        self.store=self.module.READY
        with self.store.connect() as c:
            c.execute('DELETE FROM articles')
            c.execute("INSERT OR REPLACE INTO status VALUES ('new_buffer_cutoff','1499')")
        self.url='https://example.test/http-article'
        filename=hashlib.sha256(self.url.encode()).hexdigest()+'.json'
        (self.store.bodies/filename).write_text(json.dumps({'url':self.url,'original_url':self.url,'html':'<p>body</p>','title':'test','assets':[],'ready_time':1500000}))
        with self.store.connect() as c:
            c.execute('''INSERT INTO articles(url,item,source_time,ready_time,state,body_file,schema_version,release_time)
              VALUES (?,?,?,?,?,?,?,?)''',(self.url,json.dumps({'link':self.url,'title':'test'}),1500,1500000,'ready',filename,33,1500))

    def request(self,path,method='GET',body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=3)
        self.addCleanup(conn.close)
        conn.request(method,path,body=body,headers=headers or {})
        res=conn.getresponse();raw=res.read()
        return res.status,json.loads(raw)

    def test_article_list_and_small_state_agree(self):
        status,listing=self.request('/api/ready-list')
        self.assertEqual(status,200)
        self.assertEqual(len(listing['items']),1)
        status,state=self.request('/api/new-buffer-state')
        self.assertEqual(state['new_buffer'],1)
        status,body=self.request('/api/ready-article?url='+self.module.urllib.parse.quote(self.url,safe=''))
        self.assertEqual(status,200)
        self.assertEqual(body['article']['html'],'<p>body</p>')

    def test_bad_json_and_non_objects_do_not_consume_buffer(self):
        for body in ['{broken','[]','null','42','"text"']:
            with self.subTest(body=body):
                status,result=self.request('/api/consume-new-buffer','POST',body)
                self.assertEqual(status,400)
                self.assertFalse(result['ok'])
                self.assertEqual(self.store.new_buffer_status()['new_buffer'],1)

    def test_invalid_ack_bound_does_not_consume_and_valid_retry_is_idempotent(self):
        for bound in ['bad',0,-1]:
            status,_=self.request('/api/consume-new-buffer','POST',json.dumps({'through':bound}))
            self.assertEqual(status,400)
        for expected in [1,0]:
            status,result=self.request('/api/consume-new-buffer','POST','{"through":1500}')
            self.assertEqual(status,200)
            self.assertEqual(result['consumed_count'],expected)
            self.assertEqual(result['new_buffer'],0)
            self.assertEqual(len(result['items']),1)

    def test_invalid_length_is_rejected_before_read(self):
        for length,expected in [('-1',400),('bad',400),('2000001',413)]:
            with self.subTest(length=length):
                status,result=self.request('/api/consume-new-buffer','POST',headers={'Content-Length':length})
                self.assertEqual(status,expected)
                self.assertFalse(result['ok'])
