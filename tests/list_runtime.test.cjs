// Exercise the actual full-list parser, including native offline delivery.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 for(const path of process.argv.slice(2)){
  const source=fs.readFileSync(path,'utf8');
  const start=source.indexOf('async function fetchReadyList() {');
  const end=source.indexOf('\nconst MOBILE_READY_CACHE_INDEX',start);
  assert(start>=0&&end>start);
  for(const offline of [false,true]){
   const result={ok:true,_offlineSnapshot:offline,items:[{link:'https://example.test/article',ready:true,timestamp:1000}],preparation:{active_ready:1,initial_ready:1,initial_total:1}};
   const env={fetchLiveJSON:async()=>result,keepAllowedMatomeItems:x=>x,normalizeReadyListTime:x=>x,
    updatedEl:{textContent:''},statusEl:{textContent:''},isMobileLayout:()=>true};
   vm.createContext(env);
   vm.runInContext(source.slice(start,end)+'\nglobalThis.run=fetchReadyList;',env);
   const actual=await env.run();
   assert.equal(actual.items.length,1);
   assert.equal(actual._offlineSnapshot,offline);
   if(path.includes('WebUI'))assert.equal(env.updatedEl.textContent.includes('オフライン'),offline);
   assert.match(env.updatedEl.textContent,/完成 1件/);
  }
  console.log('PASS actual ready-list parser online/offline:',path);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
