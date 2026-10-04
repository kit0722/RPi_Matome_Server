(() => {
  const params = new URLSearchParams(location.search);
  const rawUrl = params.get('url') || '';
  const returnUrl = params.get('return') || '';
  const backBtn = document.getElementById('externalBack');
  const urlEl = document.getElementById('externalUrl');
  const statusEl = document.getElementById('externalStatus');
  const frame = document.getElementById('externalFrame');
  let currentUrl = '';

  function validHttpUrl(raw, base) {
    try {
      const u = new URL(raw, base || location.href);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch { return ''; }
  }
  function showStatus(text) {
    if (!text) { statusEl.hidden = true; statusEl.textContent = ''; return; }
    statusEl.textContent = text; statusEl.hidden = false;
  }
  function updateUrl(url) {
    currentUrl = url;
    urlEl.textContent = url;
    urlEl.title = url;
  }
  function sameDocumentUrl(a, b) {
    try {
      const ua = new URL(a, location.href);
      const ub = new URL(b, location.href);
      ua.hash = '';
      ub.hash = '';
      return ua.href === ub.href;
    } catch { return false; }
  }
  function returnToArticle() {
    const safeReturn = validHttpUrl(returnUrl);
    // v0.1.220: when this wrapper was entered from the article, go back to that
    // existing history entry instead of replacing this entry with a duplicate copy
    // of the same article.  That keeps the next article Back action one step away
    // from the thread/list page on iPhone/WKWebView.
    if (safeReturn) {
      const referrer = validHttpUrl(document.referrer);
      if (history.length > 1 && referrer && sameDocumentUrl(referrer, safeReturn)) {
        history.back();
        return;
      }
      location.replace(safeReturn);
      return;
    }
    if (history.length > 1) history.back();
    else location.replace('index.html');
  }
  backBtn.addEventListener('click', returnToArticle);

  function bridgeScript() {
    return `<script>(function(){
      function nav(raw){try{var u=new URL(raw,document.baseURI);if(/^https?:$/.test(u.protocol))parent.postMessage({type:'matome-external-nav',url:u.href},'*');}catch(e){}}
      document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var raw=a.getAttribute('href')||'';if(!raw||raw[0]==='#'||/^(?:javascript:|mailto:|tel:)/i.test(raw))return;e.preventDefault();e.stopPropagation();nav(raw);},true);
      document.addEventListener('submit',function(e){var f=e.target;if(!f||String(f.method||'get').toLowerCase()!=='get')return;e.preventDefault();try{var u=new URL(f.action||document.baseURI,document.baseURI);new FormData(f).forEach(function(v,k){u.searchParams.set(k,String(v));});nav(u.href);}catch(_){}},true);
    })();<\/script>`;
  }
  function prepareHtml(html, baseUrl) {
    // CSP inside copied HTML can block the navigation bridge.  Response headers from
    // the upstream site are not forwarded by /api/proxy, so only meta CSP needs removal.
    html = String(html || '').replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?content-security-policy\1?[^>]*>/ig, '');
    html = html.replace(/<base\b[^>]*>/ig, '');
    const prefix = `<base href="${baseUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${bridgeScript()}`;
    if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, m => m + prefix);
    return `<!doctype html><html><head>${prefix}</head><body>${html}</body></html>`;
  }
  async function loadExternal(url) {
    const target = validHttpUrl(url, currentUrl || undefined);
    if (!target) { showStatus('元サイトURLが不正です'); return; }
    updateUrl(target);
    showStatus('元サイトを読み込み中...');
    try {
      const res = await fetch('/api/proxy?url=' + encodeURIComponent(target), {cache:'no-store'});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const type = (res.headers.get('content-type') || '').toLowerCase();
      const finalUrl = validHttpUrl(res.headers.get('x-upstream-url') || target) || target;
      updateUrl(finalUrl);
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        frame.removeAttribute('srcdoc');
        frame.src = finalUrl;
        showStatus('');
        return;
      }
      const html = await res.text();
      frame.src = 'about:blank';
      frame.srcdoc = prepareHtml(html, finalUrl);
      showStatus('');
    } catch (e) {
      // Even when the Pi proxy cannot fetch a site, keep the return bar.  The direct
      // page may render in the frame; if the site refuses framing, the user can still
      // return to the article without terminating the app.
      frame.removeAttribute('srcdoc');
      frame.src = target;
      showStatus('直接表示に切り替えました');
      setTimeout(() => showStatus(''), 1800);
    }
  }
  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || e.data?.type !== 'matome-external-nav') return;
    const next = validHttpUrl(e.data.url, currentUrl);
    if (next) void loadExternal(next);
  });

  const first = validHttpUrl(rawUrl);
  if (!first) showStatus('元サイトURLがありません');
  else void loadExternal(first);
})();
