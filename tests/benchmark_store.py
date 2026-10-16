"""Disposable store benchmark. Optional --baseline-ref compares a git version.

Timing is for this machine and local files, not a Raspberry Pi or network test.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import statistics
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ready_store import ReadyStore


def measure(cls):
    with tempfile.TemporaryDirectory() as directory:
        store=cls(directory)
        rows=[]
        for i in range(1800):
            url=f'https://example.test/{i}'
            name=f'{i}.json'
            snapshot={'url':url,'original_url':url,'title':f'Article {i}',
                      'html':'<p>'+('prepared text '*80)+'</p>','assets':[]}
            (store.bodies/name).write_text(json.dumps(snapshot))
            rows.append((url,json.dumps({'link':url,'title':f'Article {i}'}),i,(1000+i)*1000,
                         'ready',name,33,float(1000+i) if i<800 else 0))
        rows.extend((f'https://example.test/history/{i}','{}',i,None,'evicted',None,33,0)
                    for i in range(20000))
        with store.connect() as c:
            c.execute("INSERT OR REPLACE INTO status VALUES ('new_buffer_cutoff','1499')")
            c.executemany('''INSERT INTO articles
                (url,item,source_time,ready_time,state,body_file,schema_version,release_time)
                VALUES (?,?,?,?,?,?,?,?)''',rows)
        operations={'new_state':store.new_buffer_status,'ready_list':store.list_ready,
                    'prepared_body':lambda:store.article('https://example.test/700'),
                    'progress':store.initial_progress}
        result={}
        for name,run in operations.items():
            for _ in range(3):run()
            values=[]
            for _ in range(30):
                start=time.perf_counter();run();values.append((time.perf_counter()-start)*1000)
            values.sort()
            result[name]={'median_ms':round(statistics.median(values),3),
                          'p95_ms':round(values[28],3),'samples':len(values)}
        writer=sqlite3.connect(store.db,check_same_thread=False)
        try:
            writer.execute('BEGIN IMMEDIATE')
            writer.execute("UPDATE articles SET title='busy' WHERE url='https://example.test/700'")
            release=threading.Timer(0.8,writer.commit)
            release.start()
            start=time.perf_counter();store.list_ready()
            result['ready_list_during_800ms_writer_ms']=round((time.perf_counter()-start)*1000,3)
            release.join()
        finally:writer.close()
        return result


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--baseline-ref')
    args=parser.parse_args()
    results={'scope':'local synthetic DB; not Pi/HTTP/network/device performance',
             'fixture':{'committed':500,'new':300,'hidden':1000,'old_metadata':20000}}
    if args.baseline_ref:
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'baseline.py'
            path.write_bytes(subprocess.check_output(['git','show',args.baseline_ref+':ready_store.py'],cwd=ROOT))
            spec=importlib.util.spec_from_file_location('matome_baseline',path)
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            results['baseline']=measure(module.ReadyStore)
    results['current']=measure(ReadyStore)
    print(json.dumps(results,ensure_ascii=False,indent=2))
