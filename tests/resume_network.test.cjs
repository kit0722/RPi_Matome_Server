// Run with Node; no browser, network, Pi data or iOS SDK is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function verify(path){
  const source=fs.readFileSync(path,'utf8');
  const start=source.indexOf('const liveRequests = new Set();');
  const end=source.indexOf('\nasync function ',source.indexOf("document.addEventListener('visibilitychange',()=>{",start));
  const listeners={};
  const context=vm.createContext({AbortController,Set,Promise,Error,clearTimeout,
    setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,25)),
    document:{hidden:false,addEventListener:(name,fn)=>{listeners[name]=fn;}}});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.request=fetchLiveJSON;globalThis.pending=liveRequests;',context);
  // A fetch implementation that ignores AbortSignal must still release the UI.
  context.fetch=()=>new Promise(()=>{});
  await assert.rejects(context.request('/never'),/通信/);
  assert.equal(context.pending.size,0);
  // Headers arrive, but a suspended response body never completes.
  context.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  await assert.rejects(context.request('/stalled-body'),/通信/);
  assert.equal(context.pending.size,0);
  // Device lock cancels outstanding work, then a new request succeeds on resume.
  context.fetch=()=>new Promise(()=>{});
  const interrupted=context.request('/lock');
  context.document.hidden=true;listeners.visibilitychange();
  await assert.rejects(interrupted,/通信/);
  assert.equal(context.pending.size,0);
  context.document.hidden=false;
  context.fetch=async(_url,opts)=>{
    assert.equal(opts.cache,'no-store');
    return {ok:true,json:async()=>({ok:true,new_buffer:2})};
  };
  assert.equal((await context.request('/resume')).new_buffer,2);
  assert.equal(context.pending.size,0);
  if(path.endsWith('index.js')){
    context.fetch=async()=>({ok:true,headers:{get:()=> '1'},json:async()=>({ok:true,items:[]})});
    assert.equal((await context.request('/api/ready-list'))._offlineSnapshot,true);
  }
  context.fetch=async()=>({ok:false,status:404});
  await assert.rejects(context.request('/missing'),error=>error.status===404);
  assert.equal(context.pending.size,0);
  console.log('PASS stalled fetch, stalled body, lock cancellation, resume, HTTP error:',path);
}
(async()=>{
  for(const path of process.argv.slice(2))await verify(path);
})().catch(error=>{console.error(error);process.exitCode=1;});
