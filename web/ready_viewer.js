const PREPARING = new URLSearchParams(location.search).get('worker') === '1';
function readerIsMobile() {
  if (document.documentElement.classList.contains('tablet-ui')) return false;
  return document.documentElement.classList.contains('mobile-ui') || /iPhone|iPod/i.test(navigator.userAgent||'') || (/Android/i.test(navigator.userAgent||'') && /Mobile/i.test(navigator.userAgent||'')) || innerWidth <= 860;
}
function readerFontKey() { return readerIsMobile() ? 'matome_reader_font_size_mobile_v1' : 'matome_reader_font_size_pc_v1'; }
function articleDeviceIsDark(){
  const ua=navigator.userAgent||'';
  const ipad=/iPad/i.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const phone=/iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
  if(ipad || phone) return true;
  try{
    if(window.parent!==window && window.parent.document){
      const de=window.parent.document.documentElement;
      if(de.classList.contains('mobile-ui') || de.classList.contains('tablet-ui')) return true;
    }
  }catch(e){}
  return false;
}
function readerDarkKey(){ return 'matome_article_fixed_theme_v1'; }
function applyReaderDark(){
  const on=articleDeviceIsDark();
  document.documentElement.classList.toggle('setting-dark-mode',on);
  document.documentElement.classList.toggle('setting-light-mode',!on);
  document.body?.classList.toggle('setting-dark-mode',on);
  document.body?.classList.toggle('setting-light-mode',!on);
  return on;
}
applyReaderDark();
function clampReaderFont(v) { return Math.max(13, Math.min(41, Number(v) || 16)); }
function applyReaderFont(v, save=false) {
  const n=clampReaderFont(v);
  document.documentElement.style.setProperty('--reader-user-size', n+'px');
  document.body?.style.setProperty('--reader-user-size', n+'px');
  if (readerIsMobile()) {
    document.querySelectorAll('.content, .post-message').forEach(x => { x.style.fontSize = n+'px'; });
    updateMobileThreadMetaDisplay(n);
  }
  const el=document.getElementById('readerFontSizeInput');
  if (el) el.value=String(n);
  if (save) localStorage.setItem(readerFontKey(), String(n));
}
applyReaderFont(localStorage.getItem(readerFontKey()) || 16, false);
function readerLineKey() { return readerIsMobile() ? 'matome_reader_line_height_mobile_v1' : 'matome_reader_line_height_pc_v1'; }
function clampReaderLine(v) { const n=Number.parseFloat(v); return Math.max(1.3, Math.min(2.2, Number.isFinite(n)?n:1.6)); }
function applyReaderLine(v, save=false) {
  const n=Math.round(clampReaderLine(v)*10)/10;
  document.documentElement.style.setProperty('--reader-user-line-height', String(n));
  document.body?.style.setProperty('--reader-user-line-height', String(n));
  if(save) localStorage.setItem(readerLineKey(),String(n));
}
applyReaderLine(localStorage.getItem(readerLineKey()) || 1.6, false);
function readerMetaFontKey() { return readerIsMobile() ? 'matome_reader_meta_font_size_mobile_v1' : 'matome_reader_meta_font_size_pc_v1'; }
function clampReaderMetaFont(v) { const n=Number.parseInt(v,10); return Math.max(8,Math.min(18,Number.isFinite(n)?n:11)); }
function applyReaderMetaFont(v, save=false) {
  const n=clampReaderMetaFont(v);
  document.documentElement.style.setProperty('--reader-meta-size',n+'px');
  document.body?.style.setProperty('--reader-meta-size',n+'px');
  if(save) localStorage.setItem(readerMetaFontKey(),String(n));
  return n;
}
applyReaderMetaFont(localStorage.getItem(readerMetaFontKey()) || 11, false);
window.addEventListener('message',e=>{
  if(e.origin!==location.origin || e.data?.type!=='matome-display-settings') return;
  if(e.data.readerFont!=null) applyReaderFont(e.data.readerFont,false);
  if(e.data.readerLine!=null) applyReaderLine(e.data.readerLine,false);
  if(e.data.readerMetaFont!=null) applyReaderMetaFont(e.data.readerMetaFont,false);
  if(e.data.darkMode!=null) applyReaderDark();
});
window.addEventListener('storage',e=>{
  if(e.key===readerFontKey()) applyReaderFont(e.newValue||16,false);
  if(e.key===readerLineKey()) applyReaderLine(e.newValue||1.6,false);
  if(e.key===readerMetaFontKey()) applyReaderMetaFont(e.newValue||11,false);
  if(e.key===readerDarkKey()) applyReaderDark();
});


if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const params = new URLSearchParams(location.search);
const requestedUrl = params.get("url");
const requestedRevision = params.get("rev") || "";
const siteName = params.get("site") || "";
const embedded = params.get("embedded") === "1";
if (embedded) document.body.classList.add("embedded");

const READER_SCROLL_KEY = "matomeReaderScroll:" + encodeURIComponent(requestedUrl || "");

const EXTRACT_FAIL_KEY = "matome_extract_fail_sites_v1";
const EXTRACT_FAIL_TTL = 30 * 24 * 60 * 60 * 1000;
function recordExtractFailure(url, error) {
  try {
    const host = new URL(url || requestedUrl || "").hostname || "unknown";
    const now = Date.now();
    const data = JSON.parse(localStorage.getItem(EXTRACT_FAIL_KEY) || "{}");
    for (const [h,v] of Object.entries(data)) {
      if (!v?.lastAt || now - Number(v.lastAt) > EXTRACT_FAIL_TTL) delete data[h];
    }
    const prev = data[host] || {count:0};
    data[host] = {
      count: Number(prev.count || 0) + 1,
      lastAt: now,
      reason: String(error?.message || error || "unknown").slice(0,160)
    };
    const sorted = Object.entries(data).sort((a,b)=>(b[1].lastAt||0)-(a[1].lastAt||0)).slice(0,100);
    localStorage.setItem(EXTRACT_FAIL_KEY, JSON.stringify(Object.fromEntries(sorted)));
  } catch {}
}

function saveReaderScroll() {
  if (!requestedUrl) return;
  sessionStorage.setItem(READER_SCROLL_KEY, String(scrollY));
}

function restoreReaderScroll() {
  const y = Number(sessionStorage.getItem(READER_SCROLL_KEY) || "0");
  if (!(y > 0)) return;
  const apply = () => scrollTo({top: y, behavior: "auto"});
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  setTimeout(apply, 120);
  setTimeout(apply, 350);
}


const loadingEl = document.getElementById("loading");
const articleEl = document.getElementById("article");
const metaEl = document.getElementById("meta");
const titleEl = document.getElementById("title");
const contentEl = document.getElementById("content");
const errorEl = document.getElementById("error");
const originalLink = document.getElementById("originalLink");
const backBtn = document.getElementById("backBtn");

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const closeBtn = document.getElementById("closeBtn");
const readerFontSizeInput = document.getElementById("readerFontSizeInput");
readerFontSizeInput?.addEventListener("input", () => applyReaderFont(readerFontSizeInput.value, true));
readerFontSizeInput?.addEventListener("change", () => applyReaderFont(readerFontSizeInput.value, true));
document.querySelector('.reader-font-dec')?.addEventListener('click', () => applyReaderFont(clampReaderFont(readerFontSizeInput?.value) - 1, true));
document.querySelector('.reader-font-inc')?.addEventListener('click', () => applyReaderFont(clampReaderFont(readerFontSizeInput?.value) + 1, true));
if (readerIsMobile()) new MutationObserver(() => applyReaderFont(localStorage.getItem(readerFontKey()) || 16, false)).observe(document.body,{childList:true,subtree:true});



function visibleRatioInViewport(el) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!(r.width > 0 && r.height > 0 && vw > 0 && vh > 0)) return 0;
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(vw, r.right);
  const bottom = Math.min(vh, r.bottom);
  const iw = Math.max(0, right - left);
  const ih = Math.max(0, bottom - top);
  return Math.max(0, Math.min(1, (iw * ih) / (r.width * r.height)));
}

function watchGifFullVisibility(img, setPlaying) {
  const target = img?.closest?.(".prepared-gif-shell,.hover-gif-wrap") || img;
  if (!target) return {check:()=>{}, disconnect:()=>{}};
  let last = null;
  let raf = 0;
  let stopped = false;
  const apply = () => {
    raf = 0;
    if (stopped || !target.isConnected) return;
    const ratio = visibleRatioInViewport(target);
    // v0.1.150: iPhone/Safariの動的ツールバーで90%判定が外れやすいため、
    // mobileは55%見えていれば自動再生。PCは従来どおり90%。
    const threshold = readerIsMobile() ? 0.55 : 0.90;
    const next = ratio >= threshold;
    if (next === last) return;
    last = next;
    setPlaying(next, ratio);
  };
  const schedule = () => {
    if (stopped || raf) return;
    raf = requestAnimationFrame(apply);
  };
  let io = null;
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver(schedule, {threshold:[0,0.05,0.5,0.89,0.90,1]});
    io.observe(target);
  }
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(schedule);
    ro.observe(target);
  }
  const passive = {passive:true};
  window.addEventListener('scroll', schedule, passive);
  window.addEventListener('resize', schedule, passive);
  window.addEventListener('orientationchange', schedule, passive);
  window.addEventListener('pageshow', schedule, passive);
  document.addEventListener('visibilitychange', schedule, passive);
  img.addEventListener('load', schedule);
  for (const ms of [0,80,250,600,1200]) setTimeout(schedule, ms);
  return {
    check:schedule,
    disconnect:()=>{
      stopped=true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();ro?.disconnect();
      window.removeEventListener('scroll', schedule, passive);
      window.removeEventListener('resize', schedule, passive);
      window.removeEventListener('orientationchange', schedule, passive);
      window.removeEventListener('pageshow', schedule, passive);
      document.removeEventListener('visibilitychange', schedule, passive);
      img.removeEventListener('load', schedule);
    }
  };
}

function directGifCandidate(img) {
  if (!img) return '';
  const values=[
    img.dataset?.preparedGif,
    img.dataset?.hoverGifSrc,
    img.dataset?.originalSrc,
    img.getAttribute?.('data-src'),
    img.getAttribute?.('data-original'),
    img.getAttribute?.('data-lazy-src'),
    img.closest?.('a[href]')?.getAttribute?.('href'),
    img.getAttribute?.('src')
  ];
  for (const raw of values) {
    const v=String(raw||'').trim();
    if(!v) continue;
    let abs=v;
    try{abs=new URL(v, requestedUrl||location.href).href;}catch{}
    if(/\.gif(?:$|[?#])/i.test(abs) || /[?&](?:format|fmt|fm|type|ext)=gif(?:&|$)/i.test(abs)) return abs;
  }
  return '';
}

function sameGifResource(a,b) {
  const norm = v => {
    try {
      const u=new URL(String(v||''), requestedUrl||location.href);
      u.hash='';
      // Only ignore our own retry/cache-buster parameters. Keep all source query params.
      u.searchParams.delete('_gif_retry');
      return u.href;
    } catch { return String(v||''); }
  };
  return !!a && !!b && norm(a)===norm(b);
}

function ensurePreparedGifPlayback(img) {
  if(!img) return false;
  if(!img.dataset.preparedGif){
    const fallback=directGifCandidate(img);
    if(!fallback) return false;
    const poster=img.getAttribute('src')||img.currentSrc||'';
    img.dataset.preparedGif=fallback;
    // v0.1.156: if the current <img src> is already the GIF itself, do not save
    // that same URL as a "poster". Safari may already have completed this image
    // before our load listener is attached; reassigning the identical src then
    // produces no new load event and left "GIF読み込み中…" forever.
    if(poster && !sameGifResource(poster,fallback)) img.dataset.preparedPoster=poster;
    else img.removeAttribute('data-prepared-poster');
    img.dataset.gifFallbackDetected='1';
    console.info('GIF_FALLBACK_DETECTED',JSON.stringify({url:requestedUrl,gif:fallback,same_src:sameGifResource(poster,fallback)}));
  }
  setupPreparedGifPlayback(img);
  return true;
}

function setupPreparedGifPlayback(img) {
  if (!img || !img.dataset.preparedGif || img.dataset.gifControllerReady === '1') return;
  img.dataset.gifControllerReady = '1';
  const gifUrl = img.dataset.preparedGif;
  const posterUrl = img.dataset.preparedPoster || img.getAttribute('src') || '';
  img.classList.add('hover-gif');
  img.title = readerIsMobile() ? '画面内に入ると自動再生・タップで再読み込み' : '画面内に90%以上表示すると自動再生・タップで再読み込み';

  let shell = img.closest('.prepared-gif-shell');
  if (!shell) {
    shell = document.createElement('span');
    shell.className = 'prepared-gif-shell';
    img.parentNode?.insertBefore(shell, img);
    shell.appendChild(img);
  }
  const loading = document.createElement('span');
  loading.className = 'prepared-gif-loading';
  loading.setAttribute('aria-live','polite');
  loading.innerHTML = '<span class="prepared-gif-spinner" aria-hidden="true"></span><span class="prepared-gif-loading-text">GIF読み込み中…</span>';
  shell.appendChild(loading);
  const error = document.createElement('span');
  error.className = 'prepared-gif-error';
  error.textContent = '再生できません（タップで再試行）';
  error.setAttribute('aria-live','polite');
  shell.appendChild(error);

  let mode = 'poster';
  let manual = false;
  let loadTimer = 0;
  let slowTimer = 0;
  let retrySeq = 0;
  const loadingText = loading.querySelector('.prepared-gif-loading-text');
  const setLoadingText = text => { if (loadingText) loadingText.textContent = text; };
  const clearTimers = () => {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = 0; }
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = 0; }
  };
  const setPoster = (keepError=false) => {
    clearTimers();
    mode = 'poster';
    img.classList.remove('hover-gif-playing');
    shell.classList.remove('gif-loading');
    if (!keepError) shell.classList.remove('gif-error');
    if (posterUrl && img.getAttribute('src') !== posterUrl) img.setAttribute('src', posterUrl);
  };
  const fail = () => {
    if (mode !== 'gif') return;
    clearTimers();
    mode = 'failed';
    img.classList.remove('hover-gif-playing');
    shell.classList.remove('gif-loading');
    shell.classList.add('gif-error');
    if (posterUrl && img.getAttribute('src') !== posterUrl) img.setAttribute('src', posterUrl);
  };
  const markPlaying = () => {
    if (mode !== 'gif') return;
    clearTimers();
    shell.classList.remove('gif-loading','gif-error');
    img.classList.add('hover-gif-playing');
  };
  const start = (forceRetry=false) => {
    if (!gifUrl) { fail(); return; }
    if (!forceRetry && mode === 'gif') return;
    clearTimers();
    mode = 'gif';
    setLoadingText('GIF読み込み中…');
    shell.classList.remove('gif-error');
    shell.classList.add('gif-loading');
    img.classList.remove('hover-gif-playing');

    const current=img.currentSrc||img.getAttribute('src')||'';
    // v0.1.156: the display-time fallback can point at an <img> whose src is
    // already the exact GIF. If it has already loaded, there is nothing to wait
    // for and Safari may not dispatch another load event for the same URL.
    if (!forceRetry && sameGifResource(current,gifUrl) && img.complete && img.naturalWidth>0) {
      console.info('GIF_SAME_SRC_RECOVERED',JSON.stringify({url:requestedUrl,gif:gifUrl}));
      markPlaying();
      return;
    }

    let src = gifUrl;
    if (forceRetry) {
      retrySeq++;
      src += (src.includes('?') ? '&' : '?') + '_gif_retry=' + Date.now() + '_' + retrySeq;
    }
    img.setAttribute('src', src);
    // v0.1.157: 20 seconds is only a slow-network notice. Do NOT abort the
    // transfer here; throttled 4G and large GIFs can legitimately take longer.
    slowTimer = setTimeout(() => {
      if (mode !== 'gif') return;
      setLoadingText('GIF読み込み中（低速回線・継続中）…');
      console.info('GIF_SLOW_LOADING', JSON.stringify({url:requestedUrl,gif:gifUrl,elapsed_s:20}));
    }, 20000);
    // Keep a real final guard so a broken request cannot remain forever.
    loadTimer = setTimeout(fail, 120000);
    // Safari can paint a cached GIF before delivering load to a late listener.
    setTimeout(()=>{
      if(mode==='gif' && img.complete && img.naturalWidth>0 && sameGifResource(img.currentSrc||img.getAttribute('src')||'',src)) markPlaying();
    },250);
  };

  img.addEventListener('load', markPlaying);
  img.addEventListener('error', () => { if (mode === 'gif') fail(); });
  img.addEventListener('click', e => {
    e.preventDefault();e.stopPropagation();
    manual = true;
    // v0.1.150: 再生中扱いでもSafari側で静止している場合があるため、
    // タップは常にキャッシュバスター付きでGIFを再読込して再生を強制する。
    start(true);
  });

  watchGifFullVisibility(img, (auto, ratio) => {
    if (ratio < 0.05) manual = false;
    if (auto || manual) {
      if (mode === 'poster') start(false);
    } else if (mode !== 'failed') {
      setPoster(false);
    }
  });
}



// v0.1.211: one return path for the header back button and right-swipe gesture.
// Keep list restoration/history handling unchanged; animate only the article page leaving.
let readerBackInFlight = false;
function animatedReaderBack(){
  if(readerBackInFlight) return;
  readerBackInFlight = true;
  saveReaderScroll();
  const goBack=()=>{
    if(history.length>1) history.back();
    else location.href='index.html';
  };
  const body=document.body;
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!readerIsMobile() || window.parent!==window || !body || reduceMotion){
    goBack();
    return;
  }
  document.documentElement.classList.add('reader-back-underlay');
  body.classList.add('reader-back-animating');
  void body.offsetWidth;
  requestAnimationFrame(()=>body.classList.add('reader-back-exit'));
  window.setTimeout(goBack,230);
}
function resetReaderBackAnimation(){
  readerBackInFlight=false;
  document.documentElement.classList.remove('reader-back-underlay');
  document.body?.classList.remove('reader-back-animating','reader-back-exit');
}

backBtn.onclick = animatedReaderBack;

// v0.1.106: mobile full-width right-swipe back; lighter threshold for iPhone. Native iPhone back only starts at the left edge;
// this gesture works from the article body while avoiding controls/media and the image lightbox.
(function setupMobileSwipeBack(){
  if(!readerIsMobile() || PREPARING || window.parent!==window) return;
  let startX=0,startY=0,startAt=0,tracking=false;
  const isLightboxOpen=()=>lightbox && !lightbox.hidden;
  document.addEventListener('touchstart',e=>{
    // v0.1.150: article view accepts right-swipe back from anywhere on the page.
    // Only the enlarged-image lightbox owns its gestures and suppresses article back.
    if(e.touches.length!==1 || isLightboxOpen()) { tracking=false; return; }
    const t=e.touches[0];
    startX=t.clientX; startY=t.clientY; startAt=Date.now();
    tracking=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!tracking || isLightboxOpen()) { tracking=false; return; }
    tracking=false;
    const t=e.changedTouches?.[0]; if(!t) return;
    const dx=t.clientX-startX, dy=t.clientY-startY, dt=Date.now()-startAt;
    if(dx>=60 && Math.abs(dy)<=85 && dx>=Math.abs(dy)*1.20 && dt<=1200){
      animatedReaderBack();
    }
  },{passive:true});
})();

// v0.1.216: reader.html loads ready_viewer.js, not legacy reader.js.
// Put the compact reply metadata long-press handler on this active path so
// ID/date metadata enlarges only after an intentional hold on iPhone/iPad.
(function setupCompactMetaLongPress(){
  if(PREPARING) return;
  const selector='.mobile-thread-meta,.reply-meta,.gossip-reply-meta,.site-feedback-meta';
  const HOLD_MS=450;
  const MOVE_CANCEL_PX=10;
  let target=null,timer=0,startX=0,startY=0;
  const clear=()=>{
    if(timer){clearTimeout(timer);timer=0;}
    target?.classList.remove('meta-press-preview');
    target=null;
  };
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const el=e.target?.closest?.(selector);
    if(!el||!el.closest('.content'))return;
    clear();
    target=el;startX=e.clientX;startY=e.clientY;
    timer=setTimeout(()=>{timer=0;if(target===el)el.classList.add('meta-press-preview');},HOLD_MS);
  },{passive:true});
  document.addEventListener('pointermove',e=>{
    if(!target)return;
    if(Math.abs(e.clientX-startX)>MOVE_CANCEL_PX||Math.abs(e.clientY-startY)>MOVE_CANCEL_PX)clear();
  },{passive:true});
  document.addEventListener('pointerup',clear,{passive:true});
  document.addEventListener('pointercancel',clear,{passive:true});
  window.addEventListener('blur',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
})();

if (embedded) {
  originalLink.target = "_blank";
  originalLink.rel = "noopener noreferrer";
}
function handleOriginalLinkClick(e) {
  saveReaderScroll();
  // v0.1.220: iPhone/mobile top-level article pages keep a same-origin
  // return bar around the original site.  Desktop embedded readers retain
  // the existing _blank behavior, and preparation workers are untouched.
  if (PREPARING || embedded || !readerIsMobile() || window.parent !== window) return;
  const href = originalLink?.href || "";
  if (!/^https?:\/\//i.test(href)) return;
  e.preventDefault();
  const returnUrl = location.href;
  location.href = `external.html?url=${encodeURIComponent(href)}&return=${encodeURIComponent(returnUrl)}`;
}
originalLink.addEventListener("click", handleOriginalLinkClick);
window.addEventListener("pagehide", saveReaderScroll);
window.addEventListener("pageshow", e => {
  resetReaderBackAnimation();
  if (e.persisted) restoreReaderScroll();
});

let lightboxScale=1,lightboxX=0,lightboxY=0,lightboxTouchDistance=0,lightboxStartScale=1;
let lightboxPanStartX=0,lightboxPanStartY=0,lightboxPanBaseX=0,lightboxPanBaseY=0,lightboxSuppressClickUntil=0;
let lightboxGallery=[],lightboxIndex=-1,lightboxSwipeX=null,lightboxSwipeY=null;
const lightboxFallbackBySource=new Map();
let lightboxBaseW=0,lightboxBaseH=0,lightboxMouseDragging=false,lightboxMouseStartX=0,lightboxMouseStartY=0,lightboxMouseBaseX=0,lightboxMouseBaseY=0;
const lightboxPrev=document.getElementById('lightboxPrev');
const lightboxNext=document.getElementById('lightboxNext');
const lightboxCounter=document.getElementById('lightboxCounter');
function lightboxDistance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
function lightboxRemoteOriginal(img){
  const a=img?.closest?.('a[href]');if(!a)return '';
  let href=String(a.href||a.getAttribute('href')||'').trim();
  if(!/^https?:\/\//i.test(href))return '';
  try{
    const u=new URL(href,location.href),host=u.hostname.toLowerCase().replace(/^www\./,'');
    const path=(u.pathname+u.search).toLowerCase();
    const strongDirect=/\.(?:jpe?g|png|webp|avif|bmp)(?:$|[?#])/i.test(path) ||
      host==='pbs.twimg.com' || host==='i.imgur.com' || /\/(?:images?|photos?|media)\//i.test(u.pathname);
    if(!strongDirect || /\.(?:html?|php|aspx?|cgi)(?:$|[?#])/i.test(path))return '';
    if(host==='pbs.twimg.com' && /^\/media\//i.test(u.pathname))u.searchParams.set('name','orig');
    href=u.href;
  }catch{return '';}
  return window.MatomePi?.assetUrl?.(href)||href;
}
function lightboxImageSource(img){
  if(!img||img.dataset.preparedGif||img.dataset.gifClickMode==='1'||img.dataset.hoverGifReady==='1'||img.closest('.hover-gif-wrap,.youtube-inline-card,.prepared-video'))return '';
  // The article body intentionally uses a small WebP on iPhone.  The lightbox instead
  // prefers the image link/full source, then falls back to the locally saved original.
  const local=img.dataset.originalSrc||img.currentSrc||img.src||'';
  const remote=lightboxRemoteOriginal(img);
  if(remote&&local&&remote!==local)lightboxFallbackBySource.set(remote,local);
  return remote||local;
}
function rebuildLightboxGallery(preferred=''){
  const seen=new Set();lightboxGallery=[];lightboxFallbackBySource.clear();
  for(const img of contentEl?.querySelectorAll?.('img')||[]){
    if(img.closest('.instagram-static-card,[data-instagram-post-url]') && img.alt!=='Instagram投稿画像')continue;
    const src=lightboxImageSource(img);if(!src||seen.has(src))continue;seen.add(src);lightboxGallery.push(src);
  }
  if(preferred&&!seen.has(preferred))lightboxGallery.unshift(preferred);
  lightboxIndex=Math.max(0,lightboxGallery.indexOf(preferred));if(!lightboxGallery.length&&preferred){lightboxGallery=[preferred];lightboxIndex=0;}
}
function updateLightboxNav(){
  const many=lightboxGallery.length>1;
  if(lightboxPrev){lightboxPrev.hidden=!many;lightboxPrev.disabled=!many||lightboxIndex<=0;}
  if(lightboxNext){lightboxNext.hidden=!many;lightboxNext.disabled=!many||lightboxIndex>=lightboxGallery.length-1;}
  if(lightboxCounter){lightboxCounter.hidden=!lightboxGallery.length;lightboxCounter.textContent=lightboxGallery.length?`${lightboxIndex+1} / ${lightboxGallery.length}`:'';}
}
function clampLightboxPan(){
  const vw=Math.max(1,window.innerWidth||document.documentElement.clientWidth||1),vh=Math.max(1,window.innerHeight||document.documentElement.clientHeight||1);
  const sw=lightboxBaseW*lightboxScale,sh=lightboxBaseH*lightboxScale;
  const mx=Math.max(0,(sw-vw)/2+24),my=Math.max(0,(sh-vh)/2+24);
  lightboxX=Math.max(-mx,Math.min(mx,lightboxX));lightboxY=Math.max(-my,Math.min(my,lightboxY));
}
function applyLightboxTransform(){clampLightboxPan();lightboxImg.style.transform=`translate3d(${lightboxX}px,${lightboxY}px,0) scale(${lightboxScale})`;}
function resetLightboxTransform(){lightboxScale=1;lightboxX=0;lightboxY=0;lightboxTouchDistance=0;lightboxStartScale=1;applyLightboxTransform();}
function fitLightboxImage(){
  const nw=lightboxImg.naturalWidth||0,nh=lightboxImg.naturalHeight||0;if(!nw||!nh)return;
  const mobile=(window.innerWidth||0)<=860;const maxW=Math.max(120,(window.innerWidth||nw)-(mobile?20:84));const maxH=Math.max(120,(window.innerHeight||nh)-(mobile?28:64));
  const fit=Math.max(.05,Math.min(8,maxW/nw,maxH/nh));lightboxBaseW=Math.max(1,nw*fit);lightboxBaseH=Math.max(1,nh*fit);
  lightboxImg.style.width=`${lightboxBaseW}px`;lightboxImg.style.height=`${lightboxBaseH}px`;lightboxImg.style.maxWidth='none';lightboxImg.style.maxHeight='none';resetLightboxTransform();
}
function showLightboxIndex(i){
  if(!lightboxGallery.length)return;lightboxIndex=Math.max(0,Math.min(lightboxGallery.length-1,i));lightboxBaseW=lightboxBaseH=0;resetLightboxTransform();
  const src=lightboxGallery[lightboxIndex],fallback=lightboxFallbackBySource.get(src)||'';
  lightboxImg.onload=()=>fitLightboxImage();
  lightboxImg.onerror=()=>{if(fallback&&lightboxImg.getAttribute('src')!==fallback){lightboxImg.onerror=null;lightboxImg.src=fallback;return;}lightboxImg.onerror=null;};
  lightboxImg.src=src;updateLightboxNav();
}
function openLightbox(src){rebuildLightboxGallery(src);lightbox.hidden=false;document.body.style.overflow='hidden';showLightboxIndex(lightboxIndex);}
function closeLightbox(){lightbox.hidden=true;resetLightboxTransform();lightboxImg.onload=null;lightboxImg.onerror=null;lightboxImg.removeAttribute('src');lightboxImg.style.width='';lightboxImg.style.height='';document.body.style.overflow='';lightboxSwipeX=lightboxSwipeY=null;lightboxMouseDragging=false;}
function stepLightbox(delta){if(lightboxGallery.length<2)return;const next=lightboxIndex+delta;if(next<0||next>=lightboxGallery.length)return;showLightboxIndex(next);}
function setLightboxScale(next,cx=(window.innerWidth||0)/2,cy=(window.innerHeight||0)/2){
  const old=lightboxScale;next=Math.max(1,Math.min(6,next));if(Math.abs(next-old)<.001)return;
  const centerX=(window.innerWidth||0)/2+lightboxX,centerY=(window.innerHeight||0)/2+lightboxY;
  const localX=(cx-centerX)/old,localY=(cy-centerY)/old;lightboxScale=next;lightboxX=cx-(window.innerWidth||0)/2-localX*next;lightboxY=cy-(window.innerHeight||0)/2-localY*next;
  if(next<=1.001){lightboxScale=1;lightboxX=0;lightboxY=0;}applyLightboxTransform();
}
closeBtn.onclick=closeLightbox;
lightboxPrev?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();stepLightbox(-1);});
lightboxNext?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();stepLightbox(1);});
lightbox.addEventListener('wheel',e=>{if(lightbox.hidden)return;e.preventDefault();const factor=e.deltaY<0?1.18:(1/1.18);setLightboxScale(lightboxScale*factor,e.clientX,e.clientY);lightboxSuppressClickUntil=Date.now()+250;},{passive:false});
lightboxImg.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();if(lightboxScale>1.05)setLightboxScale(1);else setLightboxScale(2.5,e.clientX,e.clientY);lightboxSuppressClickUntil=Date.now()+300;});
lightboxImg.addEventListener('mousedown',e=>{if(e.button!==0||lightboxScale<=1)return;e.preventDefault();lightboxMouseDragging=true;lightboxMouseStartX=e.clientX;lightboxMouseStartY=e.clientY;lightboxMouseBaseX=lightboxX;lightboxMouseBaseY=lightboxY;lightboxImg.classList.add('is-panning');});
window.addEventListener('mousemove',e=>{if(!lightboxMouseDragging)return;e.preventDefault();lightboxX=lightboxMouseBaseX+(e.clientX-lightboxMouseStartX);lightboxY=lightboxMouseBaseY+(e.clientY-lightboxMouseStartY);applyLightboxTransform();lightboxSuppressClickUntil=Date.now()+250;});
window.addEventListener('mouseup',()=>{if(lightboxMouseDragging){lightboxMouseDragging=false;lightboxImg.classList.remove('is-panning');lightboxSuppressClickUntil=Date.now()+200;}});
lightbox.addEventListener('touchstart',e=>{if(lightbox.hidden)return;if(e.touches.length===2){lightboxSwipeX=lightboxSwipeY=null;lightboxTouchDistance=lightboxDistance(e.touches[0],e.touches[1]);lightboxStartScale=lightboxScale;}else if(e.touches.length===1){if(lightboxScale>1){lightboxPanStartX=e.touches[0].clientX;lightboxPanStartY=e.touches[0].clientY;lightboxPanBaseX=lightboxX;lightboxPanBaseY=lightboxY;}else{lightboxSwipeX=e.touches[0].clientX;lightboxSwipeY=e.touches[0].clientY;}}},{passive:true});
lightbox.addEventListener('touchmove',e=>{if(lightbox.hidden)return;if(e.touches.length===2&&lightboxTouchDistance>0){e.preventDefault();const d=lightboxDistance(e.touches[0],e.touches[1]);setLightboxScale(lightboxStartScale*(d/lightboxTouchDistance),(e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2);lightboxSuppressClickUntil=Date.now()+450;}else if(e.touches.length===1&&lightboxScale>1){e.preventDefault();lightboxX=lightboxPanBaseX+(e.touches[0].clientX-lightboxPanStartX);lightboxY=lightboxPanBaseY+(e.touches[0].clientY-lightboxPanStartY);applyLightboxTransform();lightboxSuppressClickUntil=Date.now()+450;}},{passive:false});
lightbox.addEventListener('touchend',e=>{if(e.touches.length<2)lightboxTouchDistance=0;if(e.touches.length===0&&lightboxScale===1&&lightboxSwipeX!==null&&e.changedTouches?.length){const dx=e.changedTouches[0].clientX-lightboxSwipeX,dy=e.changedTouches[0].clientY-lightboxSwipeY;if(Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.25){stepLightbox(dx<0?1:-1);lightboxSuppressClickUntil=Date.now()+350;}lightboxSwipeX=lightboxSwipeY=null;}else if(e.touches.length===1&&lightboxScale>1){lightboxPanStartX=e.touches[0].clientX;lightboxPanStartY=e.touches[0].clientY;lightboxPanBaseX=lightboxX;lightboxPanBaseY=lightboxY;}},{passive:true});
lightbox.addEventListener('click',e=>{if(Date.now()<lightboxSuppressClickUntil)return;if(e.target===lightbox)closeLightbox();});
window.addEventListener('resize',()=>{if(!lightbox.hidden&&lightboxImg.complete)fitLightboxImage();});
document.addEventListener('keydown',e=>{if(lightbox.hidden)return;if(e.key==='Escape')closeLightbox();else if(e.key==='ArrowLeft')stepLightbox(-1);else if(e.key==='ArrowRight')stepLightbox(1);});

function mobilePreparedCacheKey(url,rev=''){return 'matome_ready_prefetch_v147:'+encodeURIComponent(url||'')+'::'+encodeURIComponent(rev||'legacy');}
function consumePreparedPayload(){
  if(!readerIsMobile()||!requestedUrl)return null;
  try{const raw=sessionStorage.getItem(mobilePreparedCacheKey(requestedUrl,requestedRevision));return raw?JSON.parse(raw):null;}catch{return null;}
}
function markArticleReadAsync(){
  if (!requestedUrl || PREPARING) return;
  // PC uses reader.html inside the right-hand iframe and may auto-open the first article.
  // That must NOT count as read. Read state is created only by an explicit list click.
  if (window.parent !== window) return;
  // v0.1.213: top-level mobile articles become read only after the prepared body is first painted.
  // This keeps the list tap visually immediate; direct-open/bookmark uses the same safe path.
  try {
    const local=new Set(JSON.parse(localStorage.getItem('matome_read_v02')||'[]'));
    local.add(requestedUrl);
    localStorage.setItem('matome_read_v02',JSON.stringify([...local].slice(-3000)));
    localStorage.removeItem('matome_read_pending_v37');
  } catch {}
  // v0.1.218: share the read mark with PC/iPhone after first paint. This is
  // deliberately fire-and-forget so article rendering never waits for SQLite/network I/O.
  fetch('/api/read-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl}),cache:'no-store'}).catch(()=>{});
}

function normalizeThreadId(id){
  const v=String(id||'').trim();
  if(!v || /^(?:\?+|unknown|none|null|undefined|不明|なし|無し)$/i.test(v))return '';
  return v;
}

function makeMobileThreadMeta(num,date,time,id,tid=''){
  const meta=document.createElement('span');
  meta.className='mobile-thread-meta';
  meta.dataset.replyNum=String(num||'');
  meta.dataset.replyDate=String(date||'');
  meta.dataset.replyTime=String(time||'');
  meta.dataset.replyId=normalizeThreadId(id);
  meta.dataset.replyTid=String(tid||'').replace(/^TID\s*[:：]\s*/i,'').trim();
  return meta;
}

function mobileThreadMetaCandidates(meta){
  const num=meta.dataset.replyNum||'';
  const date=meta.dataset.replyDate||'';
  const time=meta.dataset.replyTime||'';
  const id=normalizeThreadId(meta.dataset.replyId||'');
  const tid=String(meta.dataset.replyTid||'').replace(/^TID\s*[:：]\s*/i,'').trim();
  const idPart=id?` ID:${id}`:'';
  const tidPart=tid?` TID:${tid}`:'';
  const full=`${num}:${date?` ${date}`:''}${time?` ${time}`:''}${idPart}${tidPart}`;
  const medium=`${num}:${time?` ${time}`:''}${idPart}${tidPart}`;
  const compact=id?`${num}: ID:${id}${tidPart}`:(tid?`${num}: TID:${tid}`:(time?`${num}: ${time}`:`${num}:`));
  // Always prefer the full line. Shorten only when the rendered metadata itself overflows.
  return [full,medium,compact];
}

let mobileMetaMeasureCanvas=null;
function mobileThreadMetaFits(meta,text){
  const content=meta.closest('.content');
  const viewport=(window.innerWidth||document.documentElement.clientWidth||0)-24;
  const available=Math.max(0,Math.min(content?.clientWidth||viewport,viewport));
  if(!available)return true;
  if(!mobileMetaMeasureCanvas)mobileMetaMeasureCanvas=document.createElement('canvas');
  const ctx=mobileMetaMeasureCanvas.getContext('2d');
  if(!ctx)return true;
  const style=getComputedStyle(meta);
  ctx.font=`${style.fontStyle||'normal'} ${style.fontWeight||'400'} ${style.fontSize||'11px'} ${style.fontFamily||'sans-serif'}`;
  // Small safety margin avoids clipping on Safari fractional font metrics.
  return ctx.measureText(text).width<=Math.max(0,available-4);
}

function updateMobileThreadMetaDisplay(){
  if(!readerIsMobile())return;
  for(const meta of document.querySelectorAll('.mobile-thread-meta')){
    const candidates=mobileThreadMetaCandidates(meta).filter((v,i,a)=>v&&a.indexOf(v)===i);
    let chosen=candidates[0]||'';
    for(const candidate of candidates){
      chosen=candidate;
      if(mobileThreadMetaFits(meta,candidate))break;
    }
    if(meta.textContent!==chosen)meta.textContent=chosen;
  }
}

let mobileMetaResizeTimer=0;
window.addEventListener('resize',()=>{
  clearTimeout(mobileMetaResizeTimer);
  mobileMetaResizeTimer=setTimeout(()=>updateMobileThreadMetaDisplay(),80);
},{passive:true});

function normalizeReaderTextSizing(root){
  if(!root)return;
  for(const el of root.querySelectorAll('[style],font[size]')){
    if(el.matches?.('[style]')){
      try{el.style.removeProperty('font-size');}catch{}
      if(!String(el.getAttribute('style')||'').trim())el.removeAttribute('style');
    }
    if(el.tagName==='FONT')el.removeAttribute('size');
  }
}

// v0.1.223: aggressively normalize source-site vertical spacers while preserving rich content.
// Source class CSS can leave margin/padding/min-height/height even after inline cleanup.
// Normalize only ordinary text flow. Media, AA/pre, embeds and generated cards stay protected.
function normalizeReaderArticleSpacing(root){
  if(!root)return;
  const protectedSel='pre,code,table,iframe,video,audio,picture,.hover-gif-wrap,.prepared-gif-shell,.prepared-video,.prepared-video-player,.youtube-inline-card,.x-static-card,.x-fallback-card,.x-official-embed-wrap,.instagram-static-card,.site-feedback-card';
  const mediaSel='img,picture,video,audio,source,iframe,table,pre,code,blockquote,hr,.hover-gif-wrap,.prepared-gif-shell,.prepared-video,.prepared-video-player,.youtube-inline-card,.x-static-card,.x-fallback-card,.x-official-embed-wrap,.instagram-static-card,.site-feedback-card';
  const flowSel='p,div,section,article,li,dd,dt,span,font';

  // Remove source-site vertical rhythm only from ordinary text containers.
  for(const el of root.querySelectorAll(flowSel)){
    if(el.matches(protectedSel)||el.closest(protectedSel))continue;
    if(el.querySelector?.(mediaSel))continue;
    el.classList.add('matome-normal-flow');
    try{
      el.style.setProperty('line-height','inherit','important');
      el.style.setProperty('margin-top','0','important');
      el.style.setProperty('margin-bottom','0','important');
      el.style.setProperty('padding-top','0','important');
      el.style.setProperty('padding-bottom','0','important');
      el.style.setProperty('min-height','0','important');
      el.style.setProperty('max-height','none','important');
      el.style.setProperty('height','auto','important');
    }catch{}
    if(!String(el.getAttribute('style')||'').trim())el.removeAttribute('style');
  }

  // Drop spacer-only wrappers (including NBSP / zero-width-space / BR-only boxes).
  for(const el of [...root.querySelectorAll(flowSel)].reverse()){
    if(el.matches(protectedSel)||el.closest(protectedSel))continue;
    const text=String(el.textContent||'').replace(/[\u00a0\u200b\ufeff]/g,' ').trim();
    const hasMedia=!!el.querySelector(mediaSel);
    if(!text&&!hasMedia)el.remove();
  }

  const trimBreaks=parent=>{
    if(!parent||parent.matches?.(protectedSel)||parent.closest?.(protectedSel))return;
    const significant=()=>[...parent.childNodes].filter(n=>!(n.nodeType===Node.TEXT_NODE&&!String(n.nodeValue||'').replace(/[\u00a0\u200b\ufeff]/g,' ').trim()));
    let nodes=significant();
    while(nodes[0]?.nodeType===Node.ELEMENT_NODE&&nodes[0].tagName==='BR'){nodes[0].remove();nodes=significant();}
    while(nodes.at(-1)?.nodeType===Node.ELEMENT_NODE&&nodes.at(-1).tagName==='BR'){nodes.at(-1).remove();nodes=significant();}
    let prevBr=false;
    for(const node of significant()){
      const isBr=node.nodeType===Node.ELEMENT_NODE&&node.tagName==='BR';
      if(isBr&&prevBr){node.remove();continue;}
      prevBr=isBr;
    }
  };
  trimBreaks(root);
  for(const parent of root.querySelectorAll('p,div,section,article,li,dd,dt,blockquote'))trimBreaks(parent);
}

function formatThreadHeadersForDevice(root){
  const mobile=readerIsMobile();
  const full=/(\b\d{1,5})\s*[:：]\s*[^\/\r\n]{0,180}?(\d{2,4}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)?(?:\s*ID[:：]\s*([A-Za-z0-9+_./-]{4,16}))?/g;

  // PC behavior stays exactly as before.
  if(!mobile){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(!node.parentElement || node.parentElement.closest('script,style,pre,code'))continue;
      const text=node.nodeValue||'';full.lastIndex=0;
      if(full.test(text)){full.lastIndex=0;node.nodeValue=text.replace(full,(_,num)=>`${num}:`);}
    }
    return;
  }

  // iPhone/mobile: normalize a complete header even when number/name/date/ID are split
  // across nested spans or links. Everything between the response number and date is
  // treated as the anonymous name field and removed.
  const header=/^\s*(\d{1,5})\s*[:：]\s*[\s\S]{0,220}?((?:\d{2}|\d{4})\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)?(?:\s*ID\s*[:：]\s*(?:ID\s*[:：]\s*)?([A-Za-z0-9+_./-]{2,32}))?/;

  const depth=el=>{let n=0;for(let p=el;p&&p!==root;p=p.parentElement)n++;return n;};
  const blocks=[...root.querySelectorAll('p,li,dd,dt,td,th,article,section,div')]
    .filter(el=>!el.closest('script,style,pre,code,.mobile-thread-meta'))
    .sort((a,b)=>depth(b)-depth(a));

  const textNodesOf=el=>{
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(node){
      if(!node.parentElement || node.parentElement.closest('script,style,pre,code,.mobile-thread-meta'))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const arr=[];while(w.nextNode())arr.push(w.currentNode);return arr;
  };

  const replaceHeaderAcrossNodes=el=>{
    const nodes=textNodesOf(el);if(!nodes.length)return false;
    let joined='';const map=[];
    for(const node of nodes){const begin=joined.length;joined+=node.nodeValue||'';map.push([node,begin,joined.length]);}
    const m=joined.match(header);if(!m)return false;
    // Avoid rewriting a large container holding several replies when a smaller child can own it.
    const fullText=joined.trim();
    if(fullText.length>900 && el.querySelectorAll('p,li,article,section,div').length>2)return false;
    const startOffset=m.index||0,endOffset=startOffset+m[0].length;
    const locate=(offset,isEnd=false)=>{
      for(const [node,a,b] of map){
        if(offset<b || (isEnd && offset===b))return [node,Math.max(0,Math.min((node.nodeValue||'').length,offset-a))];
      }
      const node=map.at(-1)[0];return [node,(node.nodeValue||'').length];
    };
    const [sn,so]=locate(startOffset),[en,eo]=locate(endOffset,true);
    const range=document.createRange();range.setStart(sn,so);range.setEnd(en,eo);range.deleteContents();
    const meta=makeMobileThreadMeta(m[1],m[2],m[3],m[4]);
    range.insertNode(meta);
    return true;
  };

  for(const el of blocks)replaceHeaderAcrossNodes(el);

  // v0.1.62: some matome sites render reply metadata as separate sibling blocks:
  //   14: / 2026/09/23(水) / 18:29:44.54 / ID:xxxx
  // Join those pieces into the same compact metadata line before the number-only fallback runs.
  const splitNum=/^\s*(\d{1,5})\s*[:：]\s*(?:[^0-9\r\n]{0,48})?\s*$/;
  const splitDate=/^((?:\d{2}|\d{4})\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)(?:\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?))?(?:\s+ID\s*[:：]\s*(?:ID\s*[:：]\s*)?([A-Za-z0-9+_./-]{2,32}))?$/i;
  const splitTime=/^(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s+ID\s*[:：]\s*(?:ID\s*[:：]\s*)?([A-Za-z0-9+_./-]{2,32}))?$/i;
  const splitId=/^(?:ID\s*[:：]\s*){1,2}([A-Za-z0-9+_./-]{2,32})$/i;
  const tidyMetaText=el=>String(el?.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const nextElementSiblingSkippingEmpty=el=>{
    let n=el?.nextSibling||null;
    while(n){
      if(n.nodeType===Node.TEXT_NODE){if(String(n.nodeValue||'').trim()){return null;} n=n.nextSibling;continue;}
      if(n.nodeType===Node.ELEMENT_NODE){
        if(!tidyMetaText(n) && !n.querySelector?.('img,video,iframe,table,pre')){n=n.nextSibling;continue;}
        return n;
      }
      n=n.nextSibling;
    }
    return null;
  };
  const splitStarts=[...root.querySelectorAll('p,li,dd,dt,td,th,div,span')]
    .filter(el=>el.isConnected && !el.closest('script,style,pre,code,.mobile-thread-meta') && splitNum.test(tidyMetaText(el)));
  for(const start of splitStarts){
    if(!start.isConnected || start.querySelector('.mobile-thread-meta'))continue;
    const nm=tidyMetaText(start).match(splitNum);if(!nm)continue;
    let date='',time='',id='',cur=start,consumed=[];
    for(let step=0;step<4;step++){
      const nx=nextElementSiblingSkippingEmpty(cur);if(!nx)break;
      const t=tidyMetaText(nx);
      let m=null,accepted=false;
      if(!date && (m=t.match(splitDate))){date=m[1]||'';time=m[2]||time;id=m[3]||id;accepted=true;}
      else if(!time && (m=t.match(splitTime))){time=m[1]||'';id=m[2]||id;accepted=true;}
      else if(!id && (m=t.match(splitId))){id=m[1]||'';accepted=true;}
      if(!accepted)break;
      consumed.push(nx);cur=nx;
      if(date && time && id)break;
    }
    if(!consumed.length || (!date && !time && !id))continue;
    const meta=makeMobileThreadMeta(nm[1],date,time,id);
    start.replaceWith(meta);
    for(const el of consumed)if(el.isConnected)el.remove();
  }

  // Fallback for legacy prepared cache where the whole header lives in one text node.
  // Mobile accepts both 2-digit and 4-digit years; PC behavior above remains unchanged.
  const mobileFull=/(\b\d{1,5})\s*[:：]\s*[^\/\r\n]{0,180}?((?:\d{2}|\d{4})\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)?(?:\s*ID\s*[:：]\s*(?:ID\s*[:：]\s*)?([A-Za-z0-9+_./-]{2,32}))?/g;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    if(!node.parentElement || node.parentElement.closest('.mobile-thread-meta,script,style,pre,code'))continue;
    const text=node.nodeValue||'';mobileFull.lastIndex=0;
    if(mobileFull.test(text)){
      mobileFull.lastIndex=0;const frag=document.createDocumentFragment();let pos=0,m;
      while((m=mobileFull.exec(text))){
        if(m.index>pos)frag.append(document.createTextNode(text.slice(pos,m.index)));
        const meta=makeMobileThreadMeta(m[1],m[2],m[3],m[4]);frag.append(meta);pos=mobileFull.lastIndex;
      }
      if(pos<text.length)frag.append(document.createTextNode(text.slice(pos)));node.replaceWith(frag);
    }
  }

  // Some sites leave a standalone duplicate ID line after the normalized metadata,
  // e.g. `ID : ID:CLWTwReJd`. Fold it into the small metadata line instead of
  // letting it inherit the large body font. Reply number is always preserved.
  const duplicateId=/^(?:ID\s*[:：]\s*){1,2}([A-Za-z0-9+_./-]{2,32})$/i;
  for(const meta of [...root.querySelectorAll('.mobile-thread-meta')]){
    let n=meta.nextSibling,steps=0;
    while(n && steps++<4){
      if(n.nodeType===Node.TEXT_NODE){
        const raw=String(n.nodeValue||'');const t=raw.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
        if(!t){n=n.nextSibling;continue;}
        const m=t.match(duplicateId);
        if(m){meta.dataset.replyId=m[1];n.remove();updateMobileThreadMetaDisplay();}
        break;
      }
      if(n.nodeType===Node.ELEMENT_NODE){
        if(n.matches?.('br')){n=n.nextSibling;continue;}
        const t=String(n.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
        if(!t){n=n.nextSibling;continue;}
        const m=t.match(duplicateId);
        if(m && !n.querySelector?.('img,video,iframe,a[href]')){meta.dataset.replyId=m[1];const nx=n.nextSibling;n.remove();n=nx;updateMobileThreadMetaDisplay();continue;}
        break;
      }
      n=n.nextSibling;
    }
  }

  // v0.1.142: sources without a real thread ID may emit ID:???.
  // Treat placeholder IDs as absent metadata and remove any leftover standalone ID line.
  const placeholderIdOnly=/^(?:ID\s*[:：]\s*)+\?+$/i;
  const placeholderWalker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const placeholderNodes=[];while(placeholderWalker.nextNode())placeholderNodes.push(placeholderWalker.currentNode);
  for(const node of placeholderNodes){
    if(!node.parentElement || node.parentElement.closest('.mobile-thread-meta,script,style,pre,code'))continue;
    const raw=String(node.nodeValue||'');
    const trimmed=raw.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
    if(placeholderIdOnly.test(trimmed)){node.remove();continue;}
    node.nodeValue=raw.replace(/^\s*(?:ID\s*[:：]\s*)+\?+\s*(?=(?:\r?\n|$))/i,'');
  }
  for(const el of [...root.querySelectorAll('p,div,span,li,dd,dt')]){
    if(!el.isConnected || el.closest('.mobile-thread-meta,script,style,pre,code'))continue;
    const t=String(el.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
    if(placeholderIdOnly.test(t) && !el.querySelector('img,video,iframe,a[href]'))el.remove();
  }

  // v0.1.150: Ushi32 and a few livedoor-derived pages may emit a placeholder
  // `ID:???` followed by a real `TID:...` outside the compact metadata line.
  // Keep the useful TID as compact metadata and drop the fake ID instead of
  // letting the whole tail inherit the large article-body font.
  const placeholderIdTid=/^(?:ID\s*[:：]\s*(?:\?+|unknown|none|null|undefined|不明|なし|無し)\s*)?TID\s*[:：]\s*([A-Za-z0-9+_./-]{1,64})$/i;
  const foldPlaceholderTid=(meta)=>{
    let n=meta.nextSibling,steps=0;
    while(n && steps++<6){
      if(n.nodeType===Node.TEXT_NODE){
        const t=String(n.nodeValue||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
        if(!t){n=n.nextSibling;continue;}
        const m=t.match(placeholderIdTid);
        if(m){meta.dataset.replyTid=m[1]||'';n.remove();return true;}
        return false;
      }
      if(n.nodeType===Node.ELEMENT_NODE){
        if(n.matches?.('br')){n=n.nextSibling;continue;}
        const t=String(n.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
        if(!t && !n.querySelector?.('img,video,iframe,a[href]')){n=n.nextSibling;continue;}
        const m=t.match(placeholderIdTid);
        if(m && !n.querySelector?.('img,video,iframe,a[href]')){meta.dataset.replyTid=m[1]||'';const nx=n.nextSibling;n.remove();n=nx;return true;}
        return false;
      }
      n=n.nextSibling;
    }
    return false;
  };
  let tidFolded=false;
  for(const meta of [...root.querySelectorAll('.mobile-thread-meta')]) if(foldPlaceholderTid(meta))tidFolded=true;
  if(tidFolded)updateMobileThreadMetaDisplay();

  // Very old cache can contain only the response number. Keep it visually subordinate.
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const old=[];
  while(w.nextNode())old.push(w.currentNode);
  for(const node of old){
    if(!node.parentElement || node.parentElement.closest('.mobile-thread-meta,script,style,pre,code'))continue;
    const m=(node.nodeValue||'').match(/^\s*(\d{1,5})\s*[:：](?!\d)\s*/);if(!m)continue;
    const frag=document.createDocumentFragment();
    const meta=makeMobileThreadMeta(m[1],'','','');frag.append(meta);
    frag.append(document.createTextNode((node.nodeValue||'').slice(m[0].length)));node.replaceWith(frag);
  }

  // v0.1.103: last-resort folding for old/prepared DOMs where the number was recognized
  // but date / time / ID live in separate outer siblings. This is the layout that used to
  // render `2:` at 11px while the following date/time/ID inherited the huge body font.
  // Only exact metadata-shaped blocks are consumed; ordinary reply body text is never matched.
  const metaDateOnly=/^((?:\d{2}|\d{4})\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)$/;
  const metaTimeOnly=/^(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)$/;
  const metaIdOnly=/^(?:ID\s*[:：]\s*){1,2}([A-Za-z0-9+_./-]{2,64})$/i;
  const metaCombined=/^((?:\d{2}|\d{4})\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)(?:\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?))?(?:\s+ID\s*[:：]\s*([A-Za-z0-9+_./-]{2,64}))?$/i;
  const metaTidy=node=>String(node?.textContent??node?.nodeValue??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const hasBodyMedia=node=>node?.nodeType===Node.ELEMENT_NODE && !!node.querySelector?.('img,video,iframe,table,pre,blockquote');
  const removableMetaNode=node=>{
    if(!node)return false;
    if(node.nodeType===Node.TEXT_NODE)return true;
    if(node.nodeType!==Node.ELEMENT_NODE)return false;
    return !hasBodyMedia(node);
  };
  const flowNext=(from,limitRoot)=>{
    let cur=from;
    while(cur&&cur!==limitRoot){
      let n=cur.nextSibling;
      while(n){
        if(n.nodeType===Node.TEXT_NODE && !String(n.nodeValue||'').trim()){n=n.nextSibling;continue;}
        if(n.nodeType===Node.ELEMENT_NODE && !metaTidy(n) && !hasBodyMedia(n)){n=n.nextSibling;continue;}
        return n;
      }
      cur=cur.parentNode;
    }
    return null;
  };
  const removeMetaNode=node=>{if(node?.remove)node.remove();else node?.parentNode?.removeChild(node);};
  for(const meta of [...root.querySelectorAll('.mobile-thread-meta')]){
    let anchor=meta;
    // Climb through wrappers that contain only this number/meta so outer sibling fragments are reachable.
    for(let i=0;i<4;i++){
      const p=anchor.parentElement;if(!p||p===root||p.closest('script,style,pre,code'))break;
      const t=metaTidy(p),mt=metaTidy(meta);
      if(t!==mt || hasBodyMedia(p))break;
      anchor=p;
    }
    let date=meta.dataset.replyDate||'',time=meta.dataset.replyTime||'',id=meta.dataset.replyId||'';
    let consumed=false;
    for(let step=0;step<5;step++){
      const n=flowNext(anchor,root);if(!n||!removableMetaNode(n))break;
      const t=metaTidy(n);if(!t)break;
      let m=t.match(metaCombined);
      if(m && (!date||!time||!id)){
        date=date||m[1]||'';time=time||m[2]||'';id=id||m[3]||'';removeMetaNode(n);consumed=true;continue;
      }
      if(!date && (m=t.match(metaDateOnly))){date=m[1];removeMetaNode(n);consumed=true;continue;}
      if(!time && (m=t.match(metaTimeOnly))){time=m[1];removeMetaNode(n);consumed=true;continue;}
      if(!id && (m=t.match(metaIdOnly))){id=m[1];removeMetaNode(n);consumed=true;continue;}
      // Anonymous/name field can be a separate block between number and date. Suppress it only
      // when the following visual node is unmistakably a date/time metadata fragment.
      if(!date && t.length<=80 && !/[。！？!?]{2,}/.test(t)){
        const look=flowNext(n,root),lt=metaTidy(look);
        if(look && (metaCombined.test(lt)||metaDateOnly.test(lt))){removeMetaNode(n);consumed=true;continue;}
      }
      break;
    }
    if(consumed){meta.dataset.replyDate=date;meta.dataset.replyTime=time;meta.dataset.replyId=id;}
  }
  updateMobileThreadMetaDisplay();
}



// v0.1.111: normalize reply metadata that is split across multiple DOM nodes.
// This runs for both PC and mobile and is intentionally conservative: it only
// rewrites metadata-only blocks near the start of a reply.

// v0.1.150: GOSSIP uses .ent_header for the whole reply header.  Convert it
// to the same compact number/date/ID metadata used by other 2ch-style sources.
function normalizeGossipReplyHeaders(root){
  if(!root)return 0;
  let host='';try{host=new URL(requestedUrl||location.href,location.href).hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const isGossip=host==='gossip1.net'||host.endsWith('.gossip1.net');
  const clean=v=>String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const re=/^\s*(\d{1,5})\s*(?:名前\s*[：:]\s*)?.*?(?:投稿日\s*[：:]?\s*)?((?:20)?\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]{1,8}\))?)\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s+ID\s*[：:]\s*([^\s<]+))?/;
  let changed=0;
  for(const h of [...root.querySelectorAll('[data-gossip-reply-unit] .ent_header,.ent_res > .ent_header')]){
    h.classList.add('reply-meta','gossip-reply-meta');
    const t=clean(h.textContent||'');
    const m=t.match(re);
    if(!m)continue;
    const id=normalizeThreadId(m[4]||'');
    h.textContent=[`${m[1]}:`,m[2],m[3],id?`ID:${id}`:''].filter(Boolean).join(' ');
    changed++;
  }

  // v0.1.150: GOSSIP has another legacy layout where number/name/date/time/ID
  // are written directly into the reply body and split by BRs instead of .ent_header.
  // Replace only the metadata prefix; links, images and reply body remain untouched.
  if(isGossip){
    const direct=/^\s*(\d{1,5})\s*(?:[：:]?\s*)[\s\S]{0,140}?((?:20)?\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]{1,8}\))?)\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s*ID\s*[：:]\s*(\?+|[A-Za-z0-9+_./-]{2,32}))?(?=\s*(?:\n|$))/;
    const depth=el=>{let n=0;for(let p=el;p&&p!==root;p=p.parentElement)n++;return n;};
    const blocks=[...root.querySelectorAll('p,li,dd,dt,td,div,section,article')]
      .filter(el=>!el.closest('script,style,pre,code,.reply-meta,.mobile-thread-meta,.site-feedback-card'))
      .sort((a,b)=>depth(b)-depth(a));
    for(const el of blocks){
      if(!el.isConnected||el.querySelector('.reply-meta,.mobile-thread-meta'))continue;
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(node){
        if(!node.parentElement||node.parentElement.closest('script,style,pre,code,.reply-meta,.mobile-thread-meta,.site-feedback-card'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }});
      const nodes=[];while(w.nextNode())nodes.push(w.currentNode);if(!nodes.length)continue;
      let joined='';const map=[];
      for(const node of nodes){if(joined)joined+='\n';const a=joined.length;joined+=node.nodeValue||'';map.push([node,a,joined.length]);}
      const m=joined.match(direct);if(!m)continue;
      const locate=(offset)=>{
        for(const [node,a,b] of map){
          if(offset>=a&&offset<=b)return [node,Math.max(0,Math.min((node.nodeValue||'').length,offset-a))];
          if(offset<a)return [node,0];
        }
        const node=map.at(-1)[0];return [node,(node.nodeValue||'').length];
      };
      const start=m.index||0,end=start+m[0].length;
      const [sn,so]=locate(start),[en,eo]=locate(end);
      try{
        const range=document.createRange();range.setStart(sn,so);range.setEnd(en,eo);range.deleteContents();
        const meta=document.createElement('span');meta.className='reply-meta gossip-reply-meta';
        const id=normalizeThreadId(m[4]||'');
        meta.textContent=[`${m[1]}:`,m[2],m[3],id?`ID:${id}`:''].filter(Boolean).join(' ');
        range.insertNode(meta);changed++;
      }catch{}
    }
  }
  return changed;
}

function normalizeSplitReplyMeta(root){
  if(!root)return 0;
  const clean=v=>String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const dateRe='(?:20\\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]{1,8}\))?)';
  const timeRe='(?:\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)';
  const idRe='(?:[A-Za-z0-9+_./-]{2,40})';
  const whole=new RegExp('^\\s*(\\d{1,5})\\s*(?:[：:]\\s*)?(?:名前[：:]\\s*)?(.{0,90}?)\\s*(?:投稿日[：:]?\\s*)?('+dateRe+')\\s*('+timeRe+')?(?:\\s*ID[：:]\\s*('+idRe+'))?\\s*$');
  const numOnly=/^\s*(\d{1,5})\s*[：:]?\s*$/;
  const nameOnly=/^\s*(?:名前[：:]\s*)?(.{1,90})\s*$/;
  const dateTime=new RegExp('^\\s*(?:投稿日[：:]?\\s*)?('+dateRe+')(?:\\s+('+timeRe+'))?\\s*$');
  const idOnly=new RegExp('^\\s*ID[：:]\\s*('+idRe+')\\s*$');
  const mediaSel='img,video,audio,iframe,table,pre,blockquote,.youtube-inline-card,.prepared-video,.x-static-card,.instagram-static-card';
  const blocks='p,li,dd,dt,div,span';
  const make=(num,name,date,time,id)=>{
    const el=document.createElement('div');
    el.className='reply-meta';
    const parts=[`${num}:`, clean(name).replace(/^名前[：:]\s*/,''), date, time, id?`ID:${id}`:''].filter(Boolean);
    el.textContent=parts.join(' ');
    return el;
  };
  let changed=0;
  // Case 1: all metadata is inside one small metadata-only element.
  for(const el of [...root.querySelectorAll(blocks)]){
    if(!el.isConnected||el.closest('script,style,pre,code,.reply-meta,.mobile-thread-meta,.site-feedback-card'))continue;
    if(el.querySelector(mediaSel))continue;
    const t=clean(el.textContent); if(!t||t.length>240)continue;
    const m=t.match(whole); if(!m)continue;
    // Avoid rewriting a large wrapper that merely contains a smaller matching child.
    if([...el.children].some(ch=>whole.test(clean(ch.textContent))))continue;
    const meta=make(m[1],m[2],m[3],m[4]||'',m[5]||'');
    el.replaceWith(meta); changed++;
  }
  // Case 2: number / name / date-time / ID are separate sibling elements.
  const parents=[root,...root.querySelectorAll('div,section,article,li,dd,td')];
  for(const parent of parents){
    const kids=[...parent.children].filter(el=>!el.matches('script,style')&&!el.closest('.reply-meta,.site-feedback-card'));
    for(let i=0;i<kids.length;i++){
      const a=kids[i]; if(!a?.isConnected||a.querySelector(mediaSel))continue;
      const nm=clean(a.textContent).match(numOnly); if(!nm)continue;
      let j=i+1,name='',date='',time='',id='',consumed=[a];
      for(;j<kids.length && j<=i+4;j++){
        const el=kids[j]; if(!el?.isConnected||el.querySelector(mediaSel))break;
        const t=clean(el.textContent); if(!t||t.length>140)break;
        let m;
        if(!date && (m=t.match(dateTime))){date=m[1];time=m[2]||'';consumed.push(el);continue;}
        if(date && !id && (m=t.match(idOnly))){id=m[1];consumed.push(el);continue;}
        if(!name && !date && !/^(?:投稿日|ID)[：:]/.test(t) && (m=t.match(nameOnly))){name=m[1];consumed.push(el);continue;}
        break;
      }
      if(!date)continue;
      const meta=make(nm[1],name,date,time,id);
      a.before(meta); for(const el of consumed)el.remove(); changed++;
    }
  }
  return changed;
}

// v0.1.111: Alfalfalfa legacy cached pages may contain recommendation cards inside
// the visual comment area. Remove only image+internal-article-link cards between
// the comment heading and the first real comment card/meta block.
function stripAlfalfalfaCommentRecommendationLeak(root){
  if(!root)return 0;
  let host='';try{host=new URL(requestedUrl||location.href).hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(host!=='alfalfalfa.com'&&!host.endsWith('.alfalfalfa.com'))return 0;
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const headings=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,strong,b')].filter(el=>/^(?:アルファルファモザイクの)?コメント(?:\s*[（(]?\d+[）)]?)?$/i.test(clean(el.textContent)));
  let removed=0;
  for(const h of headings){
    let cur=h.nextElementSibling; let guard=0;
    while(cur&&guard++<40){
      if(cur.matches('.site-feedback-card,.reply-meta,.mobile-thread-meta')||cur.querySelector('.site-feedback-card,.reply-meta,.mobile-thread-meta'))break;
      const t=clean(cur.textContent);
      const links=[...cur.querySelectorAll('a[href]')]; const imgs=cur.querySelectorAll('img');
      const internal=links.some(a=>{try{const u=new URL(a.href,location.href);return /(^|\.)alfalfalfa\.com$/i.test(u.hostname)&&/\/articles\/\d+/i.test(u.pathname);}catch{return false;}});
      const looksRealComment=/(?:20\d{2}[\/.年-]\d{1,2}|ID[：:]|アルファ民)/.test(t);
      const next=cur.nextElementSibling;
      if(imgs.length&&internal&&!looksRealComment&&t.length<220){cur.remove();removed++;cur=next;continue;}
      cur=next;
    }
  }
  // Also clean the generated comment section itself if a stale cached card slipped in.
  for(const el of [...root.querySelectorAll('.site-feedback-section li,.site-feedback-section p,.site-feedback-section div')]){
    if(el.matches('.site-feedback-card,.site-feedback-meta,.site-feedback-body')||el.closest('.site-feedback-card'))continue;
    const links=[...el.querySelectorAll('a[href]')],imgs=el.querySelectorAll('img');
    const internal=links.some(a=>/alfalfalfa\.com\/articles\/\d+/i.test(a.href||''));
    if(imgs.length&&internal&&clean(el.textContent).length<220){el.remove();removed++;}
  }
  return removed;
}

function stripGossipRecommendationDisplay(root){
  if(!root)return 0;
  let host='';try{host=new URL(requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(!(host==='gossip1.net'||host.endsWith('.gossip1.net')))return 0;
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const promoRe=/^(?:オススメ記事|おすすめ記事|おススメ記事|関連記事|関連ニュース|人気記事|こちらもおすすめ|あわせて読みたい)$/i;
  const commentRe=/^(?:Comment(?:\s*[（(]\s*\d{0,6}\s*[）)])?|コメント(?:一覧)?(?:\s*[（(]\s*\d{0,6}\s*[）)])?|この記事へのコメント)$/i;
  const protectedSel='[data-gossip-reply-unit],.ent_res,.site-feedback-section,.site-feedback-card';
  const q='h1,h2,h3,h4,h5,h6,strong,b,p,div,section,aside,span,ul,ol,table';
  const leaf=(el,re)=>{const t=clean(el.textContent);return !!t&&re.test(t)&&![...el.children].some(ch=>{const ct=clean(ch.textContent);return ct&&ct.length<t.length&&re.test(ct);});};
  const replyCount=node=>(node?.querySelectorAll?.('[data-gossip-reply-unit],.ent_res,.site-feedback-card')?.length||0)+((('\n'+String(node?.innerText||node?.textContent||'')).match(/(?:^|\n)\s*(?:>>\s*)?\d{1,5}\s*[：:](?!\d)/gm)||[]).length);
  let removed=0;
  const markers=[...root.querySelectorAll(q)].filter(el=>leaf(el,promoRe));
  const comments=[...root.querySelectorAll(q)].filter(el=>leaf(el,commentRe));
  for(const marker of markers){
    if(!marker.parentNode||marker.closest(protectedSel))continue;
    const nextComment=comments.find(c=>c.parentNode&&(marker.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING));
    if(nextComment){
      try{
        const r=document.createRange();r.setStartBefore(marker);r.setEndBefore(nextComment);
        const tmp=document.createElement('div');tmp.appendChild(r.cloneContents());
        if(replyCount(tmp)===0&&tmp.querySelectorAll('a[href]').length>=2){r.deleteContents();removed++;continue;}
      }catch{}
    }
    let best=null,cur=marker;
    for(let depth=0;cur&&cur!==root&&depth<7;depth++,cur=cur.parentElement){
      if(cur.matches?.(protectedSel)||cur.querySelector?.(protectedSel))break;
      const links=cur.querySelectorAll?.('a[href]')?.length||0,len=clean(cur.textContent).length;
      if(replyCount(cur)===0&&links>=2&&len<=6000)best=cur;
    }
    if(best){best.remove();removed++;}else{marker.remove();removed++;}
  }
  // Variant without a visible heading: a compact island made of GOSSIP article links only.
  for(const el of [...root.querySelectorAll('ul,ol,div,section,aside,table')]){
    if(!el.parentNode||el.matches?.(protectedSel)||el.closest?.(protectedSel)||el.querySelector?.(protectedSel))continue;
    if(replyCount(el)>0)continue;
    const internal=[...el.querySelectorAll('a[href]')].filter(a=>{try{const u=new URL(a.href,location.href);return /(^|\.)gossip1\.net$/i.test(u.hostname)&&/\/article\//i.test(u.pathname);}catch{return false;}});
    const t=clean(el.textContent);
    if(internal.length>=3&&t.length<7000){el.remove();removed++;}
  }
  return removed;
}

function stripArticleFooterJunkDisplay(root){
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const mediaSel='img,video,audio,iframe,.youtube-inline-card,.prepared-video,.x-static-card,.instagram-static-card,[data-instagram-post-url]';
  const protectedGossipSel='[data-gossip-reply-unit],.site-feedback-section,.site-feedback-card';
  const exact=/^(?:人気記事画像RSS|最新記事[（(]外部[）)]|お勧め記事[（(]外部[）)]|おすすめ記事[（(]外部[）)]|人気記事リストRSS|人気サイトヘッドライン|楽天市場|逆アクセスランキング|Amazon人気アイテム|最新コメント|カテゴリー|アーカイブ|リンク|About|Comment\s*[（(]\s*\d+\s*[）)]|コメント\s*[（(]\s*\d+\s*[）)])$/i;
  const disclosure=/(?:Amazonアソシエイト|楽天アフィリエイト|その他ASP|プロモーションを含みます|当ブログについて|広告を掲載|アフィリエイト・プログラム)/i;
  for(const el of [...root.querySelectorAll('footer,aside,nav,div,p,li,span,a')]){
    if(!el.isConnected)continue;
    if(el.matches?.(protectedGossipSel)||el.closest?.(protectedGossipSel)||el.querySelector?.(protectedGossipSel))continue;
    const t=clean(el.textContent); if(!t||t.length>1200)continue;
    if((exact.test(t)||disclosure.test(t))&&!el.querySelector(mediaSel)){ const wrap=el.closest('footer,aside,section,ul,ol')||el; if(clean(wrap.textContent).length<1800&&!wrap.querySelector(mediaSel))wrap.remove();else el.remove(); }
  }
  for(const list of [...root.querySelectorAll('ul,ol')]){
    if(!list.isConnected||list.matches?.(protectedGossipSel)||list.closest?.(protectedGossipSel)||list.querySelector?.(protectedGossipSel)||list.querySelector(mediaSel))continue; const vals=[...list.querySelectorAll(':scope > li')].map(li=>clean(li.textContent)).filter(Boolean); if(!vals.length||vals.length>5)continue;
    const hasDate=vals.some(t=>/(?:20\d{2}年\d{1,2}月\d{1,2}日|20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2})/.test(t)); const hasCount=vals.some(t=>/^(?:0|\d+\s*(?:コメ|コメント)|Comment\s*[（(]?\d+[）)]?)$/i.test(t)); if(hasDate&&hasCount)list.remove();
  }
  for(const f of [...root.querySelectorAll('iframe[src]')]){ if(/(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/|platform\.(?:x|twitter)\.com/i.test(f.getAttribute('src')||'')){ const w=f.closest('.x-official-embed-wrap,blockquote,div')||f; w.remove(); } }

  // v0.1.91: 既存完成キャッシュでも、本文途中・末尾に巻き込まれた回遊UIを表示時に除去する。
  // 引用元 / via / 元スレは本文として残す。
  const markerRe=/^(?:[★☆⭐🔥\s]*)?(?:NEXT\s+STORY\b|次の記事を読む(?:\s*→)?|更新一覧|RSS(?:ヘッドライン|一覧)?|おすすめ(?:記事|サイト)?(?:\d+)?|オススメ(?:記事|サイト)?(?:\d+)?|関連記事|関連ニュース|ピックアップ(?:記事)?|人気記事|人気の記事|記事人気ランキング|人気ランキング|アクセスランキング|注目記事|注目ランキング|新着記事|こちらもおすすめ|あわせて読みたい|この記事を読んだ人(?:はこちら|におすすめ)?|よく読まれている(?:記事|ニュース)?|今読まれている(?:記事|ニュース)?|話題の記事|話のタネに関する最新の話題|本日のおすすめニュース|最近の人気記事|過去\d+日(?:間)?の人気記事|厳選おすすめまとめ|他の人が読んでる記事(?:（外部）|\(外部\))?|この記事をシェアする[！!]?|その他おすすめサイト|相互RSS|人気サイトヘッドライン|サイト内ランキング|最新記事一覧|カテゴリ一覧|カテゴリー|タグ(?:一覧)?|コメントありがとうございます|コメント一覧(?:\s*[（(]?\d+[）)]?)?|最新のコメントへ(?:\s*[（(]?\d+[）)]?)?|\d+コメント|不思議ネットとは|スポンサードリンク|スポンサーリンク|PR|AD|Sponsored)(?:[:：]?\s*)/i;
  const sourceRe=/^(?:引用元|転載元|元スレ|source|via)\s*[:：]?/i;
  const replyCount=node=>{
    const txt='\n'+String(node?.innerText||node?.textContent||'');
    const structural=(node?.querySelectorAll?.('.resHtml,.resBody,.t_h,.t_b,[data-required-reply="1"],[data-gossip-reply-unit],.site-feedback-card')?.length||0);
    const selfProtected=(node?.matches?.('[data-gossip-reply-unit],.site-feedback-card')?1:0);
    return (txt.match(/(?:^|\n)\s*(?:>>\s*)?\d{1,5}\s*[：:](?!\d)/gm)||[]).length + structural + selfProtected;
  };
  const labels=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,nav,aside,section,div,p,ul,ol,table,span,strong,b,a')].filter(el=>{
    if(!el.isConnected)return false;
    if(el.matches?.(protectedGossipSel)||el.closest?.(protectedGossipSel)||el.querySelector?.(protectedGossipSel))return false;
    const t=clean(el.textContent);if(!t||t.length>320||sourceRe.test(t)||!markerRe.test(t))return false;
    return ![...el.children].some(ch=>{const ct=clean(ch.textContent);return ct&&ct.length<t.length&&ct.length<=320&&markerRe.test(ct)&&!sourceRe.test(ct);});
  });
  for(const label of labels){
    try{
      const after=document.createRange();after.setStartBefore(label);after.setEnd(root,root.childNodes.length);
      const aft=document.createElement('div');aft.appendChild(after.cloneContents());if(replyCount(aft)>0)continue;
      const before=document.createRange();before.setStart(root,0);before.setEndBefore(label);
      const bef=document.createElement('div');bef.appendChild(before.cloneContents());if(clean(bef.textContent).length<180&&replyCount(bef)<1)continue;
      after.deleteContents();break;
    }catch{}
  }
  // ラベル無しの大量リンク尾部も保険で切る。
  let seen=0;const children=[...root.children];
  for(let i=0;i<children.length;i++){
    const el=children[i];if(!el.isConnected)continue;
    if(el.matches?.(protectedGossipSel)||el.closest?.(protectedGossipSel)||el.querySelector?.(protectedGossipSel))continue;
    const t=clean(el.textContent);seen+=t.length;if(seen<180)continue;
    const links=el.querySelectorAll('a[href]').length;const short=[...el.querySelectorAll('a[href]')].filter(a=>{const x=clean(a.textContent);return x.length>=4&&x.length<=180;}).length;
    if(replyCount(el)>0)continue;
    if(short>=5 || (links>=7 && t.length<1800)){
      for(let j=i;j<children.length;j++)children[j].remove();break;
    }
  }

  // v0.1.91: already-completed snapshots also get provider-specific tail cleanup immediately.
  let host='';try{host=new URL(requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const cutFromText=(re)=>{
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const ns=[];while(w.nextNode())ns.push(w.currentNode);
    for(const n of ns){const raw=String(n.nodeValue||'');const m=raw.match(re);if(!m)continue;try{const r=document.createRange();r.setStart(n,Math.max(0,m.index||0));r.setEnd(root,root.childNodes.length);r.deleteContents();return true;}catch{}}
    return false;
  };
  if(host==='gossip1.net'||host.endsWith('.gossip1.net')){
    // v0.1.114: real GOSSIP replies continue after recommendation/Comment labels; never cut the tail by text.
  }
  if(host==='negisoku.com'||host.endsWith('.negisoku.com')){
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const ns=[];while(w.nextNode())ns.push(w.currentNode);
    const hit=ns.find(n=>/^\s*引用元\s*[:：]/.test(String(n.nodeValue||'')));
    if(hit){try{let block=hit.parentElement;while(block&&block!==root){const t=clean(block.textContent);if(t.length<=1200&&/引用元\s*[:：]/.test(t)&&block.querySelectorAll('a[href]').length<=3)break;block=block.parentElement;}const r=document.createRange();if(block&&block!==root)r.setStartAfter(block);else r.setStartAfter(hit);r.setEnd(root,root.childNodes.length);r.deleteContents();}catch{}}
  }
  if(host==='fesoku.net'||host.endsWith('.fesoku.net')){
    // v0.1.111: Fesoku uses a visible "Comment" section for additional reader replies.
    // Older display cleanup deleted everything from this heading onward, which removed valid replies.
    // Keep the Comment section; generic promo cleanup above still removes recommendation blocks.
  }
  if(host==='nanjpride.blog.jp'||host==='rock1963roll.livedoor.blog'||(host==='blog.livedoor.jp'&&/\/rock1963roll\//i.test(new URL(requestedUrl||'').pathname))){
    // ID:nanj_pride が別DOMに分割されても、9800: の偽レスから後ろを即削除。
    if(!cutFromText(/(?:^|[\n\r])\s*9800\s*[:：]/m)){
      const hit=[...root.querySelectorAll('div,p,li,td,section,article,span,font,b,strong')]
        .filter(el=>/^\s*9800\s*[:：]/.test(clean(el.textContent)))
        .sort((a,b)=>clean(a.textContent).length-clean(b.textContent).length)[0];
      if(hit){try{const r=document.createRange();r.setStartBefore(hit);r.setEnd(root,root.childNodes.length);r.deleteContents();}catch{}}
    }
  }
  const removePromoCluster=(markerRe)=>{
    const markers=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div,section,aside,ul,ol,table,span')].filter(el=>{
      const t=clean(el.textContent);if(!t||t.length>160||!markerRe.test(t))return false;
      return ![...el.children].some(ch=>{const ct=clean(ch.textContent);return ct&&ct.length<t.length&&markerRe.test(ct);});
    });
    for(const marker of markers){let best=null,cur=marker;for(let d=0;cur&&cur!==root&&d<6;d++,cur=cur.parentElement){const links=cur.querySelectorAll?.('a[href]')?.length||0;const len=clean(cur.textContent).length;if(replyCount(cur)===0&&links>=2&&len<=5000)best=cur;if(replyCount(cur)>0)break;}if(best){best.remove();return true;}marker.remove();return true;}return false;
  };
  if(host==='crx7601.com'||host.endsWith('.crx7601.com')){
    while(removePromoCluster(/^(?:🔥\s*)?今読まれている注目ニュース$/)){}
    cutFromText(/(?:^|[\n\r])\s*[【\[]?応援登録のお願い[】\]]?\s*(?:$|[\n\r])/m);
  }
  if(host==='kinisoku.com'||host.endsWith('.kinisoku.com')||(host==='blog.livedoor.jp'&&/\/kinisoku\//i.test(new URL(requestedUrl||'').pathname))){
    const terminalRe=/^(?:※?関連記事|キニ速の全記事一覧|この記事を読んだ方はこんな記事も読んでいます)$/;
    const markers=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div,section,aside,ul,ol,table,span')]
      .filter(el=>terminalRe.test(clean(el.textContent)))
      .sort((a,b)=>clean(a.textContent).length-clean(b.textContent).length);
    for(const marker of markers){
      try{
        const r=document.createRange();r.setStartBefore(marker);r.setEnd(root,root.childNodes.length);
        const after=document.createElement('div');after.appendChild(r.cloneContents());
        if(replyCount(after)===0){r.deleteContents();break;}
      }catch{}
      removePromoCluster(terminalRe);
    }
    while(removePromoCluster(/^(?:人気記事\s*[・／\/]\s*最新記事|人気記事・最新記事)$/)){}
  }
}

function maybeRefreshUshi32Prepared(article){
  let host='';try{host=new URL(article?.original_url||requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(host!=='usi32.com')return false;
  if(contentEl.querySelector('.usi32-lead-image'))return false;
  const key='matome_usi32_lead_guard_v164:'+encodeURIComponent(requestedUrl||'');
  const generation=String(article?.revision||article?.ready_time||requestedRevision||'legacy');
  let already=false;try{already=sessionStorage.getItem(key)===generation;}catch{}
  if(already)return false;
  try{sessionStorage.setItem(key,generation);}catch{}
  fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl})})
    .then(()=>pollPreparedRevision(article?.revision||article?.ready_time||requestedRevision||''))
    .catch(()=>{});
  // Keep the already-completed snapshot visible while the fixed revision is rebuilt.
  return false;
}


function pollPreparedRevision(oldRevision,onReady=null){
  const before=String(oldRevision||'');let tries=0;
  const tick=async()=>{
    if(++tries>60)return;
    try{
      const api='/api/ready-article?url='+encodeURIComponent(requestedUrl)+'&poll='+Date.now();
      const res=await fetch(api,{cache:'no-store'});const data=await res.json();
      const next=String(data?.article?.revision||'');
      if(res.ok && next && next!==before){
        try{onReady?.(next);}catch{}
        saveReaderScroll();
        const q=new URLSearchParams(location.search);q.set('rev',next);
        location.replace(location.pathname+'?'+q.toString());return;
      }
    }catch{}
    setTimeout(tick,1500);
  };
  setTimeout(tick,1200);
}

function maybeRefreshProviderPrepared(article){
  let host='';try{host=new URL(article?.original_url||requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const html=String(article?.html||'');
  const current=contentEl.innerHTML||'';
  const hasInstaLink=/(?:instagram\.com\/(?:p|reel|tv)\/)/i.test(html+current);
  const hasLocalInsta=[...contentEl.querySelectorAll('.instagram-static-card[data-instagram-post-id]')].some(card=>!!card.querySelector('img[alt="Instagram投稿画像"]'));
  // Rebuild only when this article actually contains an Instagram post whose local
  // prepared image is still missing.  Site name alone must never enqueue a rebuild.
  if(!(hasInstaLink&&!hasLocalInsta))return false;
  const key='matome_provider_guard_v164:'+encodeURIComponent(requestedUrl||'');
  let already=false;try{already=localStorage.getItem(key)==='1';}catch{}
  if(already)return false;
  try{localStorage.setItem(key,'1');}catch{}
  fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl})})
    .then(()=>pollPreparedRevision(article?.revision||article?.ready_time||requestedRevision||''))
    .catch(()=>{});
  return false;
}


// v0.1.71: older snapshots may contain reply marker 1 but lose the actual reply-1 payload
// (Imgur / Instagram / X / video / quote / URL).  Detect only that narrow symptom and queue
// this one article for rebuild; never rebuild the whole 500-item set.
function maybeRefreshMissingFirstReply(article){
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const els=[...contentEl.querySelectorAll('p,div,section,li,td,dd,dt,blockquote,span,font')];
  const markerInfo=(el)=>{
    const t=clean(el.textContent);let m=t.match(/^(?:>>\s*)?(\d{1,5})\s*[：:](?!\d)/);
    if(m)return Number(m[1]);m=t.match(/^(?:>>\s*)?(\d{1,5})\s*$/);return m?Number(m[1]):null;
  };
  const markers=els.filter(el=>{const n=markerInfo(el);if(n==null)return false;return ![...el.children].some(ch=>markerInfo(ch)!=null);});
  const first=markers.find(el=>markerInfo(el)===1);if(!first)return false;
  const i=markers.indexOf(first);const second=markers.slice(i+1).find(el=>markerInfo(el)===2 && !!(first.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING));
  if(!second)return false;
  let text='',media=0;
  try{
    const r=document.createRange();r.setStartBefore(first);r.setEndBefore(second);const frag=r.cloneContents();
    text=clean(frag.textContent).replace(/^(?:>>\s*)?1\s*[：:]?\s*/,'').trim();
    media=frag.querySelectorAll('img,picture,video,audio,iframe,blockquote,a[href],.prepared-video,.youtube-inline-card,.x-static-card,.instagram-static-card,[data-instagram-post-url]').length;
  }catch{return false;}
  const title=String(article?.title||'');
  const suspicious=media===0 && (text.length<=4 || (/[【\[]?(?:画像|動画)[】\]]?/i.test(title) && text.length<=16));
  if(!suspicious)return false;
  const key='matome_reply1_guard_v169:'+encodeURIComponent(requestedUrl||'');
  const generation=String(article?.revision||article?.ready_time||requestedRevision||'legacy');
  let already=false;try{already=sessionStorage.getItem(key)===generation;}catch{}
  if(already)return false;
  try{sessionStorage.setItem(key,generation);}catch{}
  fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl})})
    .then(()=>pollPreparedRevision(article?.revision||article?.ready_time||requestedRevision||''))
    .catch(()=>{});
  return false;
}

function maybeRefreshLateSiteComments(article){
  let u=null,host='';try{u=new URL(article?.original_url||requestedUrl||'');host=u.hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const vipper=host==='news23vip.livedoor.blog'||(host==='blog.livedoor.jp'&&/\/news23vip\//i.test(u?.pathname||''));
  const target=(host==='alfalfalfa.com'||host.endsWith('.alfalfalfa.com')||host==='gossip1.net'||host.endsWith('.gossip1.net')||vipper);
  if(!target)return false;
  // アルファ/GOSSIP/VIPPERな俺は公開後に読者コメントが増える。完成時点で0件/少数でも成功扱いのため、
  // 新しい記事を実際に開いた時だけ一定間隔で現在HTMLを取り直す。本文表示は待たせない。
  const now=Date.now();
  const sourceMs=Number(article?.source_time||0)*1000;
  const age=sourceMs?now-sourceMs:0;
  if(age && age<4*60*1000)return false;
  if(age && age>72*60*60*1000)return false;
  const key='matome_late_comments_v198:'+host+':'+encodeURIComponent(requestedUrl||'');
  let last=0;try{last=Number(localStorage.getItem(key)||0);}catch{}
  if(last && now-last<30*60*1000)return false;
  try{localStorage.setItem(key,String(now));}catch{}
  fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl})})
    .then(()=>pollPreparedRevision(article?.revision||article?.ready_time||requestedRevision||''))
    .catch(()=>{});
  return false;
}

function alfalfaDisplayReplyCount(root){
  if(!root)return 0;
  let strict=0;
  const nums=new Set();
  try{
    const probe=root.cloneNode(true);
    for(const el of probe.querySelectorAll('.site-feedback-section,#ld_blog_article_comment_entries,#comment,#comments,.comment-list,.comments'))el.remove();
    // v0.1.144: related cards can contain numeric text. Remove them before establishing
    // the reply-integrity baseline, or a successful cleanup is mistaken for lost replies.
    stripAlfalfalfaLegacyRelatedDisplay(probe);
    // Alfalfalfa's current DOM puts reply numbers as plain text separated only by <br>.
    // innerText on detached/inert DOM does not reliably preserve those line breaks, so
    // materialize BRs as newline text nodes before counting.
    for(const br of [...probe.querySelectorAll('br')])br.replaceWith(document.createTextNode('\n'));
    const t=String(probe.textContent||'').replace(/\r/g,'\n');
    strict=(t.match(/(?:^|\n)\s*(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/gm)||[]).length;
    for(const m of t.matchAll(/(?:^|\n)\s*(\d{1,5})\s*(?=\n|$)/gm)){
      const n=Number(m[1]); if(n>=1&&n<=99999)nums.add(n);
    }
    for(const el of probe.querySelectorAll('p,div,span,li,dd,dt')){
      if(el.querySelector('img,picture,iframe,video,table,blockquote'))continue;
      const v=String(el.textContent||'').replace(/\s+/g,' ').trim();
      if(!/^\d{1,5}$/.test(v))continue;
      if([...el.children].some(ch=>/^\d{1,5}$/.test(String(ch.textContent||'').replace(/\s+/g,' ').trim())))continue;
      const n=Number(v); if(n>=1&&n<=99999)nums.add(n);
    }
  }catch{}
  return Math.max(strict,nums.size);
}

function maybeFallbackThinPrepared(article){
  let u=null,host='';try{u=new URL(article?.original_url||requestedUrl||'');host=u.hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const rawText=String(contentEl.innerText||contentEl.textContent||'');
  const t=rawText.replace(/\s+/g,' ').trim();
  let numbered=(rawText.match(/(?:^|\n)\s*\d{1,5}\s*[：:](?!\d)/gm)||[]).length;
  const media=contentEl.querySelectorAll('img,video,.prepared-video,.youtube-inline-card,.x-static-card,.instagram-static-card,[data-instagram-post-url]').length;
  const alf=host==='alfalfalfa.com'||host.endsWith('.alfalfalfa.com');
  if(alf)numbered=alfalfaDisplayReplyCount(contentEl);
  const kono=host==='konoyubitomare.jp';
  const world=host==='world-fusigi.net';
  const vipper=host==='news23vip.livedoor.blog'||(host==='blog.livedoor.jp'&&/\/news23vip\//i.test(u?.pathname||''));
  const navNoise=/(?:人気サイトヘッドライン|楽天市場|Amazon人気アイテム|livedoor\s*Blog|最新コメント|アーカイブ)/i.test(t);
  const suspicious=(alf && (numbered<2 || (t.length<350 && media===0))) ||
    (kono && (navNoise || (t.length<220 && media===0))) ||
    (world && (/(?:本日のおすすめニュース|アクセスランキング|不思議ネットとは)/.test(t.slice(0,500)) || (numbered<2 && t.length<260))) ||
    (vipper && t.length<180 && numbered<2 && media===0);
  if(!suspicious)return false;
  const guardKey='matome_reprepare_guard_v223:'+encodeURIComponent(requestedUrl||'');
  const generation=String(article?.revision||article?.ready_time||requestedRevision||'legacy');
  let already=false;try{already=sessionStorage.getItem(guardKey)===generation;}catch{}
  if(!already){
    try{sessionStorage.setItem(guardKey,generation);}catch{}
    fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl})}).catch(()=>{});
  }
  if(!already)pollPreparedRevision(article?.revision||article?.ready_time||requestedRevision||'');
  // Never throw a completed article back into the slow live extractor.
  // Show the old completed snapshot now and replace it only after a new revision is ready.
  return false;
}
function canonicalDisplayMediaKey(raw=''){
  let u=String(raw||'').trim();if(!u)return '';
  try{const x=new URL(u,location.href);const h=x.hostname.toLowerCase().replace(/^www\./,'');
    if(h==='i.imgur.com'||h==='imgur.com'){const parts=x.pathname.split('/').filter(Boolean);let id=parts.pop()||'';id=id.replace(/\.(?:jpe?g|png|gif|webp|avif)$/i,'');if(id)return 'imgur:'+id.toLowerCase();}
    x.hash='';for(const k of ['width','height','w','h','name'])x.searchParams.delete(k);return x.toString();
  }catch{return u;}
}
function dedupePreparedMediaDisplay(root){
  if(!root)return;
  const xseen=new Set();
  const xPreferred=[...root.querySelectorAll('.x-static-card')];
  const xOthers=[...root.querySelectorAll('[data-tweet-id],blockquote[data-tweet-id],blockquote.twitter-tweet,[data-x-embed-preserve="1"]')].filter(el=>!xPreferred.includes(el));
  for(const card of [...xPreferred,...xOthers]){
    const href=card.querySelector?.('a[href*="/status/"]')?.href||card.getAttribute?.('cite')||'';const id=card.dataset?.tweetId||((String(href).match(/\/status\/(\d+)/)||[])[1])||'';
    if(!id)continue;if(xseen.has(id)){card.remove();continue;}xseen.add(id);
  }
  const iseen=new Set();
  const iPreferred=[...root.querySelectorAll('.instagram-static-card')];
  const iOthers=[...root.querySelectorAll('[data-instagram-post-id],[data-instagram-post-url],blockquote.instagram-media')].filter(el=>!iPreferred.includes(el));
  for(const card of [...iPreferred,...iOthers]){
    const raw=card.dataset?.instagramPostUrl||card.getAttribute?.('data-instgrm-permalink')||card.querySelector?.('a[href*="instagram.com/"]')?.href||'';const id=card.dataset?.instagramPostId||(((raw.match(/\/(?:p|reel|tv)\/([^/]+)/i)||[])[1]))||'';
    if(!id)continue;if(iseen.has(id)){card.remove();continue;}iseen.add(id);
  }
  const seen=new Set();const preferred=[...root.querySelectorAll('.x-static-card img,.instagram-static-card img,[data-instagram-post-url] img')];const pset=new Set(preferred);const imgs=[...preferred,...[...root.querySelectorAll('img')].filter(img=>!pset.has(img))];
  for(const img of imgs){if(!img.isConnected)continue;const raw=img.getAttribute('data-original')||img.getAttribute('data-src')||img.currentSrc||img.src||img.getAttribute('src')||'';const key=canonicalDisplayMediaKey(raw);if(!key)continue;if(seen.has(key)){img.remove();continue;}seen.add(key);}
  const imgurImageKeys=new Set([...root.querySelectorAll('img')].map(img=>canonicalDisplayMediaKey(img.getAttribute('data-original')||img.getAttribute('data-src')||img.currentSrc||img.src||img.getAttribute('src')||'')).filter(k=>k.startsWith('imgur:')));
  for(const a of [...root.querySelectorAll('a[href]')]){if(a.querySelector('img'))continue;const key=canonicalDisplayMediaKey(a.getAttribute('href')||'');if(!key.startsWith('imgur:')||!imgurImageKeys.has(key))continue;const t=String(a.textContent||'').replace(/\s+/g,' ').trim();if(!t||/^https?:\/\//i.test(t)||/^(?:Imgur画像|View post on imgur\.com)$/i.test(t))a.remove();}
}

function stripNews4vipQualityDisplay(root){
  let host='';try{host=new URL(requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(host!=='news4vip.livedoor.biz')return;
  const c=x=>String(x||'').replace(/\s+/g,' ').trim();
  const replyRe=/^(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/;
  const sourceLabel=/^(?:引用元|元スレ|転載元)\s*[:：]/;
  const sourceUrl=/(?:https?:\/\/)?(?:[^\s/]+\.)?(?:5ch\.net|5ch\.io|2ch\.net|bbspink\.com|open2ch\.net)\/test\/read\.cgi\//i;
  const leadMetaExact=[
    /^人気記事(?:\s*[（(]\s*画像付\s*[）)])?$/i,
    /^20\d{2}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{2})?$/,
    /^コメント\s*[（(]?\s*\d*\s*[）)]?$/i,
  ];
  const isReply=el=>!!el&&replyRe.test(c(el.textContent));
  const all=[...root.querySelectorAll('div,p,li,span,font,b,strong,small,td')];
  const firstReply=all.find(el=>isReply(el) && ![...el.children].some(ch=>isReply(ch))) || all.find(isReply) || null;
  const beforeFirst=node=>{
    if(!firstReply||!node)return true;
    if(node===firstReply||node.contains?.(firstReply))return false;
    return !!(node.compareDocumentPosition(firstReply)&Node.DOCUMENT_POSITION_FOLLOWING);
  };

  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  const remove=[];
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(!beforeFirst(node))continue;
    if(node.nodeType===Node.TEXT_NODE){
      let raw=String(node.nodeValue||'');
      const lines=raw.split(/(\r?\n)/);let changed=false;
      for(let i=0;i<lines.length;i+=2){const t=c(lines[i]);if(t&&leadMetaExact.some(re=>re.test(t))){lines[i]='';changed=true;}}
      if(changed)node.nodeValue=lines.join('');
      continue;
    }
    const el=node,t=c(el.textContent);
    if(!t||el.querySelector?.('img,picture,video,iframe,blockquote'))continue;
    if(leadMetaExact.some(re=>re.test(t)))remove.push(el);
  }
  remove.sort((a,b)=>b.querySelectorAll('*').length-a.querySelectorAll('*').length);
  for(const el of remove)if(el.isConnected&&!el.contains(firstReply))el.remove();

  const parents=[root,...root.querySelectorAll('p,div,li,blockquote,td')];
  for(const parent of parents){
    if(!parent.isConnected)continue;
    const kids=[...parent.childNodes],segs=[];let seg=[];
    const flush=(br=null)=>{if(seg.length||br)segs.push({nodes:seg,br});seg=[];};
    for(const n of kids){if(n.nodeType===Node.ELEMENT_NODE&&n.tagName==='BR')flush(n);else seg.push(n);}flush(null);
    for(let i=0;i<segs.length;i++){
      const s=segs[i],text=c(s.nodes.map(n=>n.textContent||'').join(' ')),hrefs=[];
      for(const n of s.nodes){if(n.nodeType===Node.ELEMENT_NODE){if(n.matches?.('a[href]'))hrefs.push(n.href||n.getAttribute('href')||'');for(const a of n.querySelectorAll?.('a[href]')||[])hrefs.push(a.href||a.getAttribute('href')||'');}}
      if(!sourceLabel.test(text)||(!sourceUrl.test(text)&&!hrefs.some(h=>sourceUrl.test(h))))continue;
      for(const n of s.nodes)n.remove();s.br?.remove();
      const nx=segs[i+1];if(nx){const nt=c(nx.nodes.map(n=>n.textContent||'').join(' '));if(/^\d{1,4}\)$/.test(nt)&&!replyRe.test(nt)){for(const n of nx.nodes)n.remove();nx.br?.remove();}}
    }
  }
  for(const el of [...root.querySelectorAll('p,div,li,blockquote')]){
    if(!el.isConnected)continue;const t=c(el.textContent);if(!sourceLabel.test(t))continue;
    const hrefs=[...el.querySelectorAll('a[href]')].map(a=>a.href||a.getAttribute('href')||'');
    if((sourceUrl.test(t)||hrefs.some(h=>sourceUrl.test(h)))&&!isReply(el))el.remove();
  }

  const replies=[...root.querySelectorAll('div,p,li,span,font,td')].filter(el=>isReply(el)&&![...el.children].some(ch=>isReply(ch)));
  const last=replies[replies.length-1]||null;
  if(last){
    const after=node=>node!==last&&!node.contains?.(last)&&!!(last.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING);
    const tail=[...root.querySelectorAll('a,button,span,div,p,li,ul,ol,nav,small,b,strong')].filter(after);
    for(const el of tail){
      if(!el.isConnected||el.querySelector('img,picture,video,iframe,blockquote'))continue;
      const t=c(el.textContent);
      const nav=/^(?:B!|Check|前の記事|このBlogのトップへ|次の記事|トップへ戻る|はてなブックマーク)$/i.test(t)
        || /^(?:前の記事\s*[|｜]?\s*)?(?:このBlogのトップへ)(?:\s*[|｜]?\s*次の記事)?$/i.test(t)
        || /^(?:[・･\.\s]*)$/.test(t);
      if(nav)el.remove();
    }
  }
}


function stripItsokuLeadMetaDisplay(root){
  let host='';try{host=new URL(requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(host!=='itsoku.org'&&!host.endsWith('.itsoku.org'))return;
  const c=x=>String(x||'').replace(/\s+/g,' ').trim();
  const replyRe=/^(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/;
  const all=[...root.querySelectorAll('div,p,li,span,font,b,strong,small,td')];
  const firstReply=all.find(el=>replyRe.test(c(el.textContent))&&![...el.children].some(ch=>replyRe.test(c(ch.textContent)))) || all.find(el=>replyRe.test(c(el.textContent))) || null;
  const beforeFirst=node=>!firstReply || (node!==firstReply&&!node.contains?.(firstReply)&&!!(node.compareDocumentPosition(firstReply)&Node.DOCUMENT_POSITION_FOLLOWING));
  const dateRe=/^20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}$/;
  const commentsRe=/^\d+\s+Comments?$/i;
  const labelRe=/^(?:カテゴリ|タグ)\s*[:：]\s*$/;
  const blockRe=/^(?:カテゴリ|タグ)\s*[:：]\s*[^\n]{1,100}$/;
  for(const el of [...root.querySelectorAll('div,p,li,span,small,section,dl,dt,dd')].filter(beforeFirst)){
    if(!el.isConnected||el.querySelector('img,picture,video,iframe,blockquote'))continue;
    const t=c(el.textContent);if(!t)continue;
    if(dateRe.test(t)||commentsRe.test(t)||blockRe.test(t)){el.remove();continue;}
    if(labelRe.test(t)){
      const next=el.nextElementSibling;el.remove();
      if(next&&beforeFirst(next)&&!next.querySelector('img,picture,video,iframe,blockquote')){
        const nt=c(next.textContent);if(nt&&nt.length<=100&&!replyRe.test(nt)&&!dateRe.test(nt)&&!commentsRe.test(nt)&&!labelRe.test(nt))next.remove();
      }
    }
  }
}

function stripDisplayChrome(root){
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const mediaSel='img,video,audio,iframe,.youtube-inline-card,.prepared-video,.x-static-card,.instagram-static-card,[data-instagram-post-url]';
  const protectedContentSel='[data-gossip-reply-unit],.site-feedback-section,.site-feedback-card';
  const affiliate=/(?:amazon\.|amzn\.|rakuten\.|dmm\.|a8\.net|valuecommerce|moshimo|linksynergy|accesstrade|rentracks|doubleclick|googlesyndication|adservice|microad|i-mobile|admatrix|adtdp|nend\.|criteo|trafficgate|affiliate)/i;
  const early=[...root.querySelectorAll('nav,div,p,ul,ol,li,span')].slice(0,120);
  for (const el of early) {
    if (!el.isConnected) continue;
    if(el.matches?.(protectedContentSel)||el.closest?.(protectedContentSel)||el.querySelector?.(protectedContentSel))continue;
    const t=clean(el.textContent);
    if (!t || t.length>420) continue;
    if (/^\d+\s*(?:コメ|コメント)$/.test(t) && !el.querySelector(mediaSel)) { el.remove(); continue; }
    if (/^(?:Date|Category)\s*[:：]?/i.test(t) && t.length<100 && !el.querySelector(mediaSel)) { el.remove(); continue; }
    const as=el.querySelectorAll(':scope > a[href],:scope > span > a[href]');
    if (as.length>=2 && /(?:>|›|»|＞)/.test(t) && !el.querySelector(mediaSel)) { el.remove(); continue; }
    if (/^(?:スポンサーリンク|スポンサードリンク|広告|PR)$/i.test(t)) {
      let n=el.nextElementSibling, steps=0; el.remove();
      while(n && steps++<6){ const next=n.nextElementSibling; const nt=clean(n.textContent); if (/^\d+\s*[:：]|名無し|ID[:：]/.test(nt)||nt.length>140) break; if(n.querySelector('img,a[href],iframe')||!nt)n.remove(); n=next; }
    }
  }
  for (const a of [...root.querySelectorAll('a[href]')]) {
    if(a.closest?.(protectedContentSel))continue;
    if (!affiliate.test(a.href||'')) continue;
    const wrap=a.closest('p,div,li')||a; const t=clean(wrap.textContent);
    if (wrap.querySelectorAll('a[href]').length<=2 && t.length<140) wrap.remove(); else a.remove();
  }
  // Remove standalone promotional image cards that survive without a plain sponsor label.
  for (const img of [...root.querySelectorAll('img')]) {
    if(img.closest?.(protectedContentSel))continue;
    const a=img.closest('a[href]');
    const wrap=img.closest('figure,p,li,div') || img;
    const meta=clean(`${img.alt||''} ${img.title||''} ${a?.textContent||''} ${wrap.getAttribute?.('class')||''} ${wrap.getAttribute?.('id')||''}`);
    const href=a?.href||''; const src=img.currentSrc||img.src||'';
    const promo=affiliate.test(href)||affiliate.test(src)||/(?:スポンサー|広告|Amazon|楽天|商品を購入|セール|ad[-_ ]?banner|affiliate|promo)/i.test(meta)||/(?:^|[\s【[(（])PR(?:$|[\s】\])）:：])/i.test(meta);
    if (!promo) continue;
    if (wrap.querySelectorAll('img').length<=2 && clean(wrap.textContent).length<180) wrap.remove();
    else img.remove();
  }
  for (const box of [...root.querySelectorAll('ul,ol')]) if (!box.matches?.(protectedContentSel)&&!box.closest?.(protectedContentSel)&&!box.querySelector?.(protectedContentSel)&&!clean(box.textContent) && !box.querySelector(mediaSel)) box.remove();
}


function stripAlfalfalfaLegacyRelatedDisplay(root){
  if(!root)return 0;
  let host='';try{host=new URL(requestedUrl||location.href).hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(host!=='alfalfalfa.com'&&!host.endsWith('.alfalfalfa.com'))return 0;
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const relatedRe=/^関連記事(?:一覧)?\s*[：:]?$/i;
  const cardSel='a,li,ul,ol,figure,nav,aside,[class*="related"],[id*="related"],[class*="recommend"],[id*="recommend"],[class*="ranking"],[id*="ranking"]';
  const isReplyBoundary=node=>{
    if(!node)return false;
    if(node.nodeType===Node.TEXT_NODE){
      const raw=String(node.nodeValue||'').replace(/\u00a0/g,' ').trim();
      if(!/^\d{1,5}$/.test(raw))return false;
      const p=node.parentElement;
      if(p?.closest?.(cardSel))return false;
      return true;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return false;
    if(node.closest?.(cardSel))return false;
    const t=clean(node.textContent||'');
    if(!/^\d{1,5}\s*(?:[：:](?!\d)|$)/.test(t) || /^(?:20\d{2})\b/.test(t))return false;
    if(node.querySelector?.('a,img,video,iframe'))return false;
    return ![...node.children||[]].some(ch=>/^\d{1,5}\s*(?:[：:](?!\d)|$)/.test(clean(ch.textContent||'')));
  };
  const markerStarts=[];
  const doc=root.ownerDocument||document;
  const mw=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let m;
  while((m=mw.nextNode())){
    if(!relatedRe.test(clean(m.nodeValue)))continue;
    let start=m;
    let p=m.parentElement;
    while(p && p!==root && relatedRe.test(clean(p.textContent)) && !p.querySelector('a,img,video,iframe')){
      start=p;p=p.parentElement;
    }
    if(!markerStarts.some(x=>x===start || (x.contains&&x.contains(start))))markerStarts.push(start);
  }
  // Legacy caches can wrap the heading in an element whose text is exact, with no
  // standalone marker text node left after browser normalization.
  for(const el of [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b')]){
    if(!relatedRe.test(clean(el.textContent)))continue;
    if(el.querySelector('a,img,video,iframe'))continue;
    if(markerStarts.some(x=>x===el || (x.contains&&x.contains(el)) || (el.contains&&el.contains(x))))continue;
    markerStarts.push(el);
  }
  const findFollowingReplyBoundary=marker=>{
    const walker=doc.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      if(n===marker || (marker.contains&&marker.contains(n)))continue;
      let follows=false;try{follows=!!(marker.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING);}catch{}
      if(follows && isReplyBoundary(n))return n;
    }
    return null;
  };
  let removed=0;
  for(const marker of markerStarts){
    // v0.1.146: accept markers inside detached clones too; root containment is the
    // meaningful condition, not attachment to the live document.
    if(!marker || (marker!==root && !root.contains(marker)))continue;
    const next=findFollowingReplyBoundary(marker);
    if(next){
      try{
        const r=doc.createRange();
        r.setStartBefore(marker);r.setEndBefore(next);r.deleteContents();removed++;
        continue;
      }catch{}
    }
    const el=marker.nodeType===Node.ELEMENT_NODE?marker:marker.parentElement;
    const local=el?.closest?.('ul,ol,section,aside,[class*="related"],[id*="related"],[class*="recommend"],[id*="recommend"]')||el||marker;
    if(local?.remove){local.remove();removed++;}
  }
  return removed;
}

function maybeRefreshSiteProfileNow(article){
  let u=null,host='';try{u=new URL(article?.original_url||requestedUrl||'');host=u.hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const vipper=host==='news23vip.livedoor.blog'||(host==='blog.livedoor.jp'&&/\/news23vip\//i.test(u?.pathname||''));
  const target=host==='alfalfalfa.com'||host.endsWith('.alfalfalfa.com')||host==='gossip1.net'||host.endsWith('.gossip1.net')||vipper;
  if(!target)return false;
  // v0.1.104: one forced rebuild per article/device for semantic comment profiles,
  // including VIPPERな俺. This also covers old articles outside the 72h late-comment window.
  const key='matome_site_profile_v213:'+encodeURIComponent(requestedUrl||'');
  const pendingKey=key+':pending';
  let done=false,pending=0;try{done=localStorage.getItem(key)==='1';pending=Number(localStorage.getItem(pendingKey)||0);}catch{}
  if(done)return false;
  if(pending && Date.now()-pending<10*60*1000)return false;
  try{localStorage.setItem(pendingKey,String(Date.now()));}catch{}
  fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:requestedUrl})})
    .then(res=>{if(!res.ok)throw new Error('reprepare failed');pollPreparedRevision(article?.revision||article?.ready_time||requestedRevision||'',()=>{try{localStorage.setItem(key,'1');localStorage.removeItem(pendingKey);}catch{}});})
    .catch(()=>{try{localStorage.removeItem(pendingKey);}catch{}});
  return true;
}

function hydrateInstagramLiveEmbeds(root){
  if(!root)return;
  for(const card of root.querySelectorAll('[data-instagram-post-url]')){
    if(card.querySelector('img,iframe.instagram-live-embed'))continue;
    const raw=String(card.dataset.instagramPostUrl||'').trim();
    let canonical='',kind='p';
    try{
      const u=new URL(raw,location.href),h=u.hostname.toLowerCase().replace(/^www\./,'');
      const m=u.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      if((h==='instagram.com'||h.endsWith('.instagram.com'))&&m){kind=m[1].toLowerCase();canonical=`https://www.instagram.com/${kind}/${m[2]}/`;}
    }catch{}
    if(!canonical)continue;
    if(!card.classList.contains('instagram-static-card'))card.classList.add('instagram-static-card');
    const frame=document.createElement('iframe');
    frame.className='instagram-live-embed';
    frame.src=canonical+'embed/';
    frame.title='Instagram投稿';
    frame.loading='lazy';frame.scrolling='no';frame.setAttribute('allowtransparency','true');
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allow='autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
    const fallback=card.querySelector('.instagram-static-fallback');
    if(fallback)fallback.replaceWith(frame);else card.prepend(frame);
  }
}



// v0.1.125: 2chコピペ保存道場は旧Livedoor系の固定幅・小文字レイアウトを本文HTMLに残すことがある。
// 表示時だけ元サイトのレイアウト指定を無効化し、レス先頭情報を小さいメタ行へ分離する。
function normalize2chCopipeDisplay(root, pageUrl=''){
  if(!root)return 0;
  let host='';try{host=new URL(pageUrl||location.href,location.href).hostname.toLowerCase().replace(/^www\./,'');}catch{}
  if(host!=='2chcopipe.com')return 0;
  root.classList.add('site-2chcopipe');
  root.dataset.site2chcopipe='1';

  const structural='div,p,section,article,main,table,tbody,thead,tfoot,tr,td,th,ul,ol,li,dl,dt,dd,font,span,small,big';
  for(const el of root.querySelectorAll(structural)){
    if(el.closest('.x-static-card,.x-fallback-card,.instagram-static-card,.youtube-inline-card,.prepared-video,.site-feedback-card'))continue;
    const st=el.style;
    if(!st)continue;
    for(const prop of ['font-size','line-height','width','min-width','max-width','margin-left','margin-right','left','right','float']){
      try{st.removeProperty(prop);}catch{}
    }
    el.removeAttribute('width');
  }

  const clean=v=>String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const metaRe=/^\s*(\d{1,5})\s*(?:名前\s*[：:]\s*)?(.{0,100}?)\s*(?:投稿日\s*[：:]?\s*)?(20\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]{1,8}\))?)\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s*(?:ID\s*[：:]\s*([A-Za-z0-9+_./-]{2,60}))?\s*$/;
  const makeMeta=m=>{
    const el=document.createElement('div');el.className='reply-meta copipe-reply-meta';
    el.textContent=[`${m[1]}:`,clean(m[2]).replace(/^名前\s*[：:]\s*/,''),m[3],m[4],m[5]?`ID:${m[5]}`:''].filter(Boolean).join(' ');
    return el;
  };
  let changed=0;

  // Metadata may be a standalone element.
  for(const el of [...root.querySelectorAll('p,li,dd,dt,div,span,font,td')]){
    if(!el.isConnected||el.closest('.reply-meta,.site-feedback-card,.x-static-card,.instagram-static-card,.youtube-inline-card,.prepared-video,script,style,pre,code'))continue;
    if(el.querySelector('img,video,iframe,table,blockquote'))continue;
    const t=clean(el.textContent);if(!t||t.length>260)continue;
    const m=t.match(metaRe);if(!m)continue;
    if([...el.children].some(ch=>metaRe.test(clean(ch.textContent))))continue;
    el.replaceWith(makeMeta(m));changed++;
  }

  // Older pages often put metadata/body in one element separated only by <br>.
  // Replace metadata-only BR segments in-place so media/X cards keep their DOM position.
  for(const parent of [root,...root.querySelectorAll('p,div,li,dd,td,section')]){
    if(!parent.isConnected||parent.closest('.site-feedback-card,.x-static-card,.instagram-static-card,.youtube-inline-card,.prepared-video,script,style,pre,code'))continue;
    if(![...parent.childNodes].some(n=>n.nodeType===Node.ELEMENT_NODE&&n.tagName==='BR'))continue;
    const kids=[...parent.childNodes];let seg=[];
    const flush=(br)=>{
      if(!seg.length){seg=[];return;}
      const text=clean(seg.map(n=>n.textContent||'').join(' '));const m=text.match(metaRe);
      if(m){
        const meta=makeMeta(m);seg[0].before(meta);for(const n of seg)n.remove();if(br)br.remove();changed++;
      }
      seg=[];
    };
    for(const n of kids){if(n.nodeType===Node.ELEMENT_NODE&&n.tagName==='BR')flush(n);else seg.push(n);}flush(null);
  }
  return changed;
}

/* Viewing only attaches light interactions; extraction and media analysis are already finished. */
async function fetchPreparedArticleWithRetry(api) {
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++){
    if(attempt){
      try{await fetch('/api/ready-lease?url='+encodeURIComponent(requestedUrl),{cache:'no-store'});}catch{}
      await new Promise(resolve=>setTimeout(resolve,120));
    }
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),7000);
    try{
      // The article revision already makes the URL unique. Avoid force-cache here:
      // a transient WebKit/cache stall must not strand the reader on "読み込み中".
      const res=await fetch(api,{cache:'no-store',signal:controller.signal});
      const data=await res.json().catch(()=>null);
      if(res.ok && data?.article)return data;
      lastError=new Error('ready article unavailable: '+res.status);
    }catch(e){lastError=e;}
    finally{clearTimeout(timer);}
  }
  throw lastError || new Error('この記事は準備中、または完成キャッシュの再構築中です。一覧を更新してください。');
}

async function loadPreparedArticle() {
  let data=consumePreparedPayload();
  if (!data?.article) {
    const api='/api/ready-article?url='+encodeURIComponent(requestedUrl)+(requestedRevision?'&rev='+encodeURIComponent(requestedRevision):'');
    data=await fetchPreparedArticleWithRetry(api);
  }
  const article=data.article;
  const mobileImageProfile=data.mobile_image || {enabled:false,max_width:720,quality:55};
  titleEl.textContent=article.title;document.title=article.title;
  originalLink.href=article.original_url || requestedUrl;
  metaEl.replaceChildren();
  if (siteName) { const src=document.createElement('span'); src.className='reader-source-badge'; src.textContent=siteName; metaEl.append(src); }
  const tm=document.createElement('span'); tm.textContent='公開 '+new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(article.ready_time)); metaEl.append(tm);
  // Build in an inert template first.  Browser engines cannot start fetching original images
  // before mobile URLs/loading hints are installed, which avoids wasted data and speeds first paint.
  const template=document.createElement('template');template.innerHTML=article.html;
  let preIndex=0;
  for(const img of template.content.querySelectorAll('img')){
    img.decoding='async';img.loading=(preIndex++<2?'eager':'lazy');
    if(img.closest('.youtube-inline-card,.prepared-video'))continue;
    if(!img.dataset.preparedGif){
      const original=img.getAttribute('src')||'';img.dataset.originalSrc=original;
      if(readerIsMobile()&&mobileImageProfile.enabled&&/^\/prepared\/assets\//.test(original)){
        img.setAttribute('src','/api/mobile-image?src='+encodeURIComponent(original)+'&w='+encodeURIComponent(mobileImageProfile.max_width)+'&q='+encodeURIComponent(mobileImageProfile.quality));
      }
    }
  }
  contentEl.replaceChildren(template.content.cloneNode(true));
  // v0.1.138: capture Esuteru prepared comments BEFORE the very first display normalizer.
  // v0.1.138 backed them up after normalize2chCopipeDisplay(), so articles that were
  // collapsed from hundreds/thousands of prepared cards to one card could only restore
  // that already-collapsed one-card copy. Keep the untouched prepared section first.
  let esuteruDisplayBackup=null;
  let esuteruDisplayBefore=0;
  try{
    const eh=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if(eh==='blog.esuteru.com'||eh.endsWith('.blog.esuteru.com')){
      esuteruDisplayBefore=contentEl.querySelectorAll('.site-feedback-card').length;
      const sec=contentEl.querySelector('.site-feedback-section');
      if(sec && esuteruDisplayBefore>0) esuteruDisplayBackup=sec.cloneNode(true);
    }
  }catch{}
  normalize2chCopipeDisplay(contentEl, requestedUrl||article.original_url||'');
  try{
    const eh=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if(eh==='blog.esuteru.com'||eh.endsWith('.blog.esuteru.com')){
      console.info('ESUTERU_DISPLAY_INITIAL',JSON.stringify({url:requestedUrl,before:esuteruDisplayBefore,after:contentEl.querySelectorAll('.site-feedback-card').length}));
    }
  }catch{}

  // v0.1.125: keep an untouched copy of prepared GOSSIP content before any display-only cleanup.
  // Some legacy GOSSIP layouts survive preparation correctly but are over-pruned only at display time.
  // Restore only when cleanup reduced protected replies/comments, so already-correct articles are unchanged.
  let gossipDisplayBackup=null;
  let gossipDisplayBefore={body:0,comments:0};
  try{
    const gh=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if(gh==='gossip1.net'||gh.endsWith('.gossip1.net')){
      const gossipPromoRemovedBeforeBackup=stripGossipRecommendationDisplay(contentEl);
      if(gossipPromoRemovedBeforeBackup)console.info('GOSSIP_PROMO_CLEAR',JSON.stringify({url:requestedUrl,removed:gossipPromoRemovedBeforeBackup,stage:'before-backup'}));
      gossipDisplayBefore={
        body:contentEl.querySelectorAll('[data-gossip-reply-unit]').length,
        comments:contentEl.querySelectorAll('.site-feedback-card').length
      };
      if(gossipDisplayBefore.body||gossipDisplayBefore.comments)gossipDisplayBackup=contentEl.cloneNode(true);
    }
  }catch{}
  // v0.1.141: Alfalfalfa standalone-number replies can be valid prepared content.
  // Preserve the untouched snapshot and restore it if display-only cleanup drops reply signals.
  let alfalfaDisplayBackup=null;
  let alfalfaDisplayBefore=0;
  try{
    const ah=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if(ah==='alfalfalfa.com'||ah.endsWith('.alfalfalfa.com')){
      // v0.1.146: clear Alfalfalfa's in-body related-article island BEFORE the
      // integrity backup is captured.  Previously cleanup removed it, then the
      // guard restored an older backup containing the same related cards.
      const relatedRemovedBeforeBackup=stripAlfalfalfaLegacyRelatedDisplay(contentEl);
      alfalfaDisplayBefore=alfalfaDisplayReplyCount(contentEl);
      if(alfalfaDisplayBefore>0)alfalfaDisplayBackup=contentEl.cloneNode(true);
      if(relatedRemovedBeforeBackup)console.info('ALFALFA_RELATED_CLEAR',JSON.stringify({url:requestedUrl,removed:relatedRemovedBeforeBackup,stage:'before-backup'}));
    }
  }catch{}
  // First-paint fast path: the snapshot is already validated.  Reveal it before
  // display-only cleanup/header normalization so the user never stares at "読み込み中…".
  loadingEl.hidden=true;articleEl.hidden=false;
  applyReaderFont(localStorage.getItem(readerFontKey())||16,false);restoreReaderScroll();markArticleReadAsync();
  fetch('/api/ready-lease?url='+encodeURIComponent(requestedUrl),{cache:'no-store'}).catch(()=>{});
  await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  stripDisplayChrome(contentEl);
  stripNews4vipQualityDisplay(contentEl);
  stripItsokuLeadMetaDisplay(contentEl);
  stripArticleFooterJunkDisplay(contentEl);
  stripGossipRecommendationDisplay(contentEl);
  stripAlfalfalfaLegacyRelatedDisplay(contentEl);
  stripAlfalfalfaCommentRecommendationLeak(contentEl);
  try{
    const ah=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if(ah==='alfalfalfa.com'||ah.endsWith('.alfalfalfa.com')){
      let after=alfalfaDisplayReplyCount(contentEl);
      let restored=false;
      if(alfalfaDisplayBackup && after<alfalfaDisplayBefore){
        contentEl.replaceChildren(...[...alfalfaDisplayBackup.childNodes].map(n=>n.cloneNode(true)));
        after=alfalfaDisplayReplyCount(contentEl); restored=true;
      }
      console.info('ALFALFA_DISPLAY',JSON.stringify({url:requestedUrl,before:alfalfaDisplayBefore,after,restored}));
    }
  }catch{}
  try{
    const h=new URL(requestedUrl||'').hostname.toLowerCase().replace(/^www\./,'');
    if(h==='gossip1.net'||h.endsWith('.gossip1.net')){
      let bodyCount=contentEl.querySelectorAll('[data-gossip-reply-unit]').length;
      let commentCount=contentEl.querySelectorAll('.site-feedback-card').length;
      let restored=false;
      if(gossipDisplayBackup && (bodyCount<gossipDisplayBefore.body || commentCount<gossipDisplayBefore.comments)){
        contentEl.replaceChildren(...[...gossipDisplayBackup.childNodes].map(n=>n.cloneNode(true)));
        bodyCount=contentEl.querySelectorAll('[data-gossip-reply-unit]').length;
        commentCount=contentEl.querySelectorAll('.site-feedback-card').length;
        restored=true;
      }
      console.info('GOSSIP_DISPLAY',JSON.stringify({url:requestedUrl,before_body:gossipDisplayBefore.body,before_comments:gossipDisplayBefore.comments,body:bodyCount,comments:commentCount,restored}));
    }
  }catch{}
  try{
    const eh=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if(eh==='blog.esuteru.com'||eh.endsWith('.blog.esuteru.com')){
      let after=contentEl.querySelectorAll('.site-feedback-card').length;
      let restored=false;
      if(esuteruDisplayBackup && after<esuteruDisplayBefore){
        contentEl.querySelectorAll('.site-feedback-section').forEach(el=>el.remove());
        contentEl.append(esuteruDisplayBackup.cloneNode(true));
        after=contentEl.querySelectorAll('.site-feedback-card').length;
        restored=true;
      }
      console.info('ESUTERU_DISPLAY',JSON.stringify({url:requestedUrl,before:esuteruDisplayBefore,after,restored}));
    }
  }catch{}
  normalize2chCopipeDisplay(contentEl, requestedUrl||article.original_url||'');
  dedupePreparedMediaDisplay(contentEl);
  normalizeReaderTextSizing(contentEl);
  normalizeReaderArticleSpacing(contentEl);
  formatThreadHeadersForDevice(contentEl);
  normalizeGossipReplyHeaders(contentEl);
  normalizeSplitReplyMeta(contentEl);
  normalizeReaderTextSizing(contentEl);
  // v0.1.141: final Alfalfalfa integrity guard after all generic display normalization.
  try{
    const ah=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if((ah==='alfalfalfa.com'||ah.endsWith('.alfalfalfa.com')) && alfalfaDisplayBackup && alfalfaDisplayBefore>0){
      let finalCount=alfalfaDisplayReplyCount(contentEl);
      let finalRestored=false;
      if(finalCount<alfalfaDisplayBefore){
        contentEl.replaceChildren(...[...alfalfaDisplayBackup.childNodes].map(n=>n.cloneNode(true)));
        finalCount=alfalfaDisplayReplyCount(contentEl); finalRestored=true;
      }
      console.info('ALFALFA_DISPLAY_FINAL',JSON.stringify({url:requestedUrl,before:alfalfaDisplayBefore,final:finalCount,restored:finalRestored}));
    }
  }catch{}
  // v0.1.138: final Esuteru integrity guard. Some generic display normalizers run
  // after the first restore and can collapse a large prepared comment section to
  // one/few cards. Re-check only after all generic cleanup/normalization above,
  // and restore the untouched prepared section if the protected card count fell.
  try{
    const eh=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if((eh==='blog.esuteru.com'||eh.endsWith('.blog.esuteru.com')) && esuteruDisplayBackup && esuteruDisplayBefore>0){
      let finalCount=contentEl.querySelectorAll('.site-feedback-card').length;
      let finalRestored=false;
      if(finalCount<esuteruDisplayBefore){
        contentEl.querySelectorAll('.site-feedback-section').forEach(el=>el.remove());
        contentEl.append(esuteruDisplayBackup.cloneNode(true));
        finalCount=contentEl.querySelectorAll('.site-feedback-card').length;
        finalRestored=true;
      }
      console.info('ESUTERU_DISPLAY_FINAL',JSON.stringify({url:requestedUrl,before:esuteruDisplayBefore,final:finalCount,restored:finalRestored}));
    }
  }catch{}
  // v0.1.138: render Esuteru comments from structured snapshot data after all HTML cleanup.
  try{
    const eh=new URL(requestedUrl||article.original_url||'').hostname.toLowerCase().replace(/^www\./,'');
    if((eh==='blog.esuteru.com'||eh.endsWith('.blog.esuteru.com')) && Array.isArray(article.site_feedback) && article.site_feedback.length){
      contentEl.querySelectorAll('.site-feedback-section').forEach(el=>el.remove());
      const section=document.createElement('section');section.className='site-feedback-section';
      const heading=document.createElement('div');heading.className='site-feedback-heading';
      const expected=Number(article.comment_stats?.expected||article.site_feedback.length||0);
      heading.textContent=expected?`コメント (${expected})`:'コメント';section.append(heading);
      for(const item of article.site_feedback){
        const card=document.createElement('div');card.className='site-feedback-card';
        if(item?.number)card.dataset.commentNumber=String(item.number);
        if(item?.meta){const meta=document.createElement('div');meta.className='site-feedback-meta';meta.textContent=String(item.meta);card.append(meta);}
        const body=document.createElement('div');body.className='site-feedback-body';body.textContent=String(item?.body||'');card.append(body);section.append(card);
      }
      section.dataset.extractedComments=String(article.site_feedback.length);
      contentEl.append(section);
      console.info('ESUTERU_STRUCTURED_DISPLAY',JSON.stringify({url:requestedUrl,records:article.site_feedback.length,rendered:section.querySelectorAll('.site-feedback-card').length}));
    }
  }catch{}
  // Final pass also covers content restored by integrity guards and structured comments appended above.
  normalizeReaderTextSizing(contentEl);
  normalizeReaderArticleSpacing(contentEl);
  if(maybeRefreshUshi32Prepared(article))return;
  maybeRefreshMissingFirstReply(article);
  maybeRefreshProviderPrepared(article);
  maybeRefreshSiteProfileNow(article);
  maybeRefreshLateSiteComments(article);
  if(maybeFallbackThinPrepared(article))return;
  for (const card of contentEl.querySelectorAll('.youtube-inline-card[data-youtube-id]')) {
    card.querySelector('button')?.addEventListener('click',()=>{
      const id=card.dataset.youtubeId;
      const frame=document.createElement('iframe');frame.className='youtube-inline-frame';
      frame.src=`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&enablejsapi=1`;
      frame.title='YouTube動画';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
      const fallback=document.createElement('a');
      fallback.className='youtube-open-fallback';
      fallback.href=`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
      fallback.target='_blank';fallback.rel='noopener noreferrer';
      fallback.textContent='YouTubeで再生';
      card.replaceChildren(frame,fallback);
    },{once:true});
  }
  const warmVideoCard=(card,record)=>{
    if (card.dataset.videoWarmStarted === '1') return;
    card.dataset.videoWarmStarted = '1';
    if(record?.tweet_id || /^twimg:/.test(record?.key||'')) {
      // X metadata/URL only. The video body itself is never cached on the Raspberry Pi.
      fetch('/api/video-warm?article='+encodeURIComponent(requestedUrl)+'&key='+encodeURIComponent(card.dataset.videoKey),{cache:'no-store'}).catch(()=>{});
    }
  };
  const httpVideoCandidates=(record)=>{
    const out=[];
    for(const raw of [record?.url,...(record?.urls||[])]) {
      const u=String(raw||'').trim();
      if(/^https?:\/\//i.test(u) && !out.includes(u))out.push(u);
    }
    return out;
  };
  const stripPreparedVideoUrlDuplicates=(root,article)=>{
    // v0.1.78: keep original MP4/WebM links visible.  They are the last-resort recovery
    // path when a prepared-video card or Pi relay cannot be created/played.
    return;
  };
  stripPreparedVideoUrlDuplicates(contentEl,article);
  // v0.1.114: Xの生MP4リンクが残っている旧/特殊記事も再生UIへ変換する。
  for(const a of [...contentEl.querySelectorAll('a[href]')]){
    const href=String(a.href||a.getAttribute('href')||'');
    if(!/https?:\/\/video\.twimg\.com\/[^\s]+\.mp4(?:[?#].*)?$/i.test(href))continue;
    if(a.nextElementSibling?.matches?.('video.direct-video-preview'))continue;
    const v=document.createElement('video');v.className='direct-video-preview';v.controls=true;v.preload='metadata';v.setAttribute('playsinline','');v.playsInline=true;
    // 直CDNではなくPi中継を優先。URL自体はfallbackとしてリンクを残す。
    const key=(article.videos||[]).find(x=>(x.urls||[]).includes(href)||x.url===href)?.key||'';
    v.src=key?('/api/video-stream?article='+encodeURIComponent(requestedUrl)+'&key='+encodeURIComponent(key)+'&retry='+Date.now()):href;
    a.insertAdjacentElement('afterend',v);
  }
  for(const card of contentEl.querySelectorAll('.prepared-video[data-video-key]')) {
    const record=(article.videos||[]).find(v=>v.key===card.dataset.videoKey);
    if(record?.tweet_id || /^twimg:/.test(record?.key||'')) warmVideoCard(card,record);
    const start=(preferProxy=false)=>{
      warmVideoCard(card,record);
      const video=document.createElement(record?.kind==='audio'?'audio':'video');
      video.className='prepared-video-player';
      video.controls=true;video.preload='metadata';video.setAttribute('playsinline','');video.playsInline=true;
      if(record?.poster)video.poster=record.poster;
      const proxy='/api/video-stream?article='+encodeURIComponent(requestedUrl)+'&key='+encodeURIComponent(card.dataset.videoKey)+'&retry='+Date.now();
      const direct=httpVideoCandidates(record);
      const isXVideo=!!record?.tweet_id || /^twimg:/.test(record?.key||'') || direct.some(u=>{try{return new URL(u).hostname==='video.twimg.com';}catch{return false;}});
      let candidateIndex=0;
      // Safari/iPhone often stalls on a direct video.twimg.com URL because the CDN expects
      // X-oriented request headers.  Route X/Twitter video through the Raspberry Pi first.
      let usingProxy=preferProxy || isXVideo || direct.length===0;
      let proxyTried=usingProxy;
      let settled=false;let timer=0;let sourceGeneration=0;
      const loading=document.createElement('div');loading.className='prepared-video-loading';loading.innerHTML='<span class="prepared-video-spinner" aria-hidden="true"></span><span>動画読み込み中…</span>';
      const retry=document.createElement('button');retry.type='button';retry.className='prepared-video-retry';retry.textContent='再生できませんでした。再試行';retry.hidden=true;
      retry.onclick=()=>start(true);
      const setLoading=(on)=>{loading.hidden=!on;};
      const markProgress=()=>{if(video.currentTime>0.04||!video.paused){settled=true;clearTimeout(timer);retry.hidden=true;setLoading(false);}};
      const armTimeout=(generation)=>{
        clearTimeout(timer);timer=setTimeout(()=>{
          if(generation!==sourceGeneration||settled)return;
          // Metadata alone is not proof of playable media. Require actual playback progress.
          if(video.currentTime>0.04){markProgress();return;}
          fallback();
        },8000);
      };
      const setSource=(src)=>{
        settled=false;retry.hidden=true;setLoading(true);sourceGeneration++;video.src=src;video.load();armTimeout(sourceGeneration);
        video.play().catch(()=>{});
      };
      const fallback=()=>{
        clearTimeout(timer);
        // Non-X video: direct candidates first, then the Pi relay.
        if(!usingProxy&&candidateIndex+1<direct.length){candidateIndex++;setSource(direct[candidateIndex]);return;}
        if(!usingProxy&&!proxyTried){usingProxy=true;proxyTried=true;setSource(proxy);return;}
        // X/Twitter video: Pi relay first. If relay fails, try direct CDN URLs only as a last resort.
        if(usingProxy&&isXVideo&&direct.length){usingProxy=false;candidateIndex=0;setSource(direct[0]);return;}
        if(!usingProxy&&isXVideo&&candidateIndex+1<direct.length){candidateIndex++;setSource(direct[candidateIndex]);return;}
        setLoading(false);retry.hidden=false;
      };
      video.addEventListener('playing',markProgress);
      video.addEventListener('timeupdate',markProgress);
      video.addEventListener('canplay',()=>{if(!video.paused)markProgress();});
      video.addEventListener('error',fallback);
      video.addEventListener('stalled',()=>{if(!settled)armTimeout(sourceGeneration);});
      card.replaceChildren(video,loading,retry);
      setSource(usingProxy?proxy:direct[candidateIndex]);
    };
    card.querySelector('button')?.addEventListener('click',()=>start(false),{once:true});
    if ('IntersectionObserver' in window) {
      const io=new IntersectionObserver((entries,observer)=>{
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          warmVideoCard(card,record);observer.disconnect();break;
        }
      },{rootMargin:'240px 0px'});
      io.observe(card);
    }
  }
  let imageIndex=0;
  for (const img of contentEl.querySelectorAll('img')) {
    img.decoding='async';
    img.loading=(imageIndex++ < 2 ? 'eager' : 'lazy');
    if (img.closest('.youtube-inline-card,.prepared-video')) continue;
    if (ensurePreparedGifPlayback(img)) {
      // prepared GIF or display-time GIF fallback: setup already completed.
    } else {
      const original=img.dataset.originalSrc||img.getAttribute('src')||img.src;
      img.dataset.originalSrc=original;
      if(readerIsMobile()&&mobileImageProfile.enabled&&/^\/prepared\/assets\//.test(original)){
        const mobile='/api/mobile-image?src='+encodeURIComponent(original)+'&w='+encodeURIComponent(mobileImageProfile.max_width)+'&q='+encodeURIComponent(mobileImageProfile.quality);
        if(img.getAttribute('src')!==mobile)img.setAttribute('src',mobile);
        img.onerror=()=>{if(img.getAttribute('src')!==original){img.onerror=null;img.setAttribute('src',original);}};
      }
      img.onclick=e=>{e.preventDefault();openLightbox(original);};
    }
  }
  // Keep lazy media of the currently open article safe if it moves outside the latest 500.
  setInterval(()=>{if(!document.hidden)fetch('/api/ready-lease?url='+encodeURIComponent(requestedUrl),{cache:'no-store'}).catch(()=>{});},60000);
}

contentEl.addEventListener('click', e=>{
  const a=e.target.closest?.('a[href]');
  const img=a?.querySelector('img');
  if (!img) return;
  if (img.dataset.preparedGif) return;
  e.preventDefault();e.stopPropagation();
  openLightbox(img.dataset.originalSrc || img.currentSrc || img.src);
},true);
loadPreparedArticle().catch(e=>{
  loadingEl.hidden=true;errorEl.hidden=false;errorEl.textContent=String(e.message||e);
  originalLink.href=requestedUrl || '#';
});


