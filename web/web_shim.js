(() => {
  const nativeFetch = window.fetch.bind(window);
  const origin = location.origin;

  function shouldProxy(url) {
    try {
      const u = new URL(url, location.href);
      if (!/^https?:$/.test(u.protocol)) return false;
      if (u.origin === origin) return false;
      // PC上のローカルAIサーバー等はそのPCから直接接続する。
      if ((u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.port) return false;
      return true;
    } catch { return false; }
  }

  function wrapResponse(res, upstreamUrl) {
    return new Proxy(res, {
      get(target, prop) {
        if (prop === "url") return upstreamUrl || target.url;
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
  }

  window.fetch = async function(input, init={}) {
    const raw = typeof input === "string" ? input : (input?.url || String(input || ""));
    if (!shouldProxy(raw)) return nativeFetch(input, init);
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    if (method !== "GET") return nativeFetch(input, init);
    const rid=(globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g,'');
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(new URL(raw, location.href).href)}&rid=${encodeURIComponent(rid)}`;
    const cleanInit = {...init, credentials:"same-origin"};
    delete cleanInit.referrerPolicy;
    const signal=cleanInit.signal || input?.signal || null;
    if(signal && !cleanInit.signal)cleanInit.signal=signal;
    if(signal){
      const cancel=()=>nativeFetch(`/api/cancel?rid=${encodeURIComponent(rid)}`,{cache:'no-store',credentials:'same-origin',keepalive:true}).catch(()=>{});
      if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
    }
    const res = await nativeFetch(proxyUrl, cleanInit);
    const upstream = res.headers.get("X-Upstream-URL") || raw;
    return wrapResponse(res, upstream);
  };

  async function bytesToBase64(buf) {
    const bytes = new Uint8Array(buf); let out = ""; const step = 0x8000;
    for (let i=0;i<bytes.length;i+=step) out += String.fromCharCode(...bytes.subarray(i, Math.min(i+step, bytes.length)));
    return btoa(out);
  }

  globalThis.chrome = globalThis.chrome || {};
  chrome.runtime = chrome.runtime || {};
  chrome.runtime.getURL = (path) => path;
  chrome.runtime.sendMessage = async (msg) => {
    if (!msg || msg.type !== "FETCH_IMAGE_DATA") return {ok:false,error:"unsupported"};
    try {
      const res = await window.fetch(String(msg.url || ""), {cache:"no-store"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      return {ok:true,type:res.headers.get("content-type")||"application/octet-stream",base64:await bytesToBase64(buf),finalUrl:res.url||msg.url};
    } catch (e) { return {ok:false,error:String(e?.message||e)}; }
  };

  window.MatomePi = {
    articleCacheUrl(articleUrl) {
      return `/api/article-cache?url=${encodeURIComponent(String(articleUrl || ""))}`;
    },
    articleThumbUrl(articleUrl) {
      return `/api/thumb?article=${encodeURIComponent(String(articleUrl || ""))}`;
    },
    assetUrl(url) {
      try {
        const u = new URL(String(url || ""), location.href);
        if (!/^https?:$/.test(u.protocol) || u.origin === origin) return u.href;
        return `/api/proxy?url=${encodeURIComponent(u.href)}`;
      } catch { return String(url || ""); }
    },
    async thumbMap() {
      try {
        const r = await nativeFetch('/api/thumb-map', {cache:'no-store'});
        if (!r.ok) return {};
        const j = await r.json();
        return j?.ok && j.map && typeof j.map === 'object' ? j.map : {};
      } catch { return {}; }
    },
    async prefetch(urls) {
      try {
        const clean = [...new Set((urls||[]).filter(x => /^https?:\/\//i.test(x)))];
        if (!clean.length) return;
        await nativeFetch('/api/prefetch', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:clean})});
      } catch {}
    },
    async loadSnapshot(name) {
      try {
        const r = await nativeFetch('/api/snapshot?name=' + encodeURIComponent(name), {cache:'no-store'});
        if (!r.ok) return null;
        const j = await r.json();
        return j?.ok ? j.data : null;
      } catch { return null; }
    },
    async saveSnapshot(name, data) {
      try {
        const r = await nativeFetch('/api/snapshot', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,data})});
        return r.ok;
      } catch { return false; }
    },
    async stats() { try { return await (await nativeFetch('/api/stats')).json(); } catch { return null; } }
  };
})();
