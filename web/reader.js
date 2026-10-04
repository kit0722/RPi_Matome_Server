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

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const params = new URLSearchParams(location.search);
const requestedUrl = params.get("url");
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



// Automatic playback for animated images (GIF / animated WebP / APNG).
// Many sites hide GIFs behind extensionless URLs or ?format=gif, so we verify the actual bytes too.
const GIF_PLACEHOLDER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#f4f4f4"/><text x="160" y="92" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#888">GIF</text></svg>'
);
const gifAssetCache = new Map();
const gifImageState = new WeakMap();

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
  const maxVisibleW = Math.min(r.width, vw);
  const maxVisibleH = Math.min(r.height, vh);
  const maxVisibleArea = Math.max(1, maxVisibleW * maxVisibleH);
  return Math.max(0, Math.min(1, (iw * ih) / maxVisibleArea));
}

function watchGifFullVisibility(img, setPlaying) {
  const target = img?.closest?.(".hover-gif-wrap") || img;
  if (!target) return {check:()=>{}, disconnect:()=>{}};
  let last = null;
  let raf = 0;
  let stopped = false;
  const apply = () => {
    raf = 0;
    if (stopped || !target.isConnected) return;
    // Keep the existing playback threshold. Only the re-check mechanism changes.
    const next = visibleRatioInViewport(target) >= 0.90;
    if (next === last) return;
    last = next;
    setPlaying(next);
  };
  const schedule = () => {
    if (stopped || raf) return;
    raf = requestAnimationFrame(apply);
  };
  let io = null;
  if (typeof IntersectionObserver !== "undefined") {
    // IntersectionObserver alone cannot re-fire at 90% for media taller than the viewport.
    // It is only a wake-up source; scroll/resize below performs the real 90% check.
    io = new IntersectionObserver(schedule, {threshold:[0,0.05,0.5,0.89,0.90,1]});
    io.observe(target);
  }
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(schedule);
    ro.observe(target);
  }
  const passive = {passive:true};
  window.addEventListener("scroll", schedule, passive);
  window.addEventListener("resize", schedule, passive);
  window.addEventListener("orientationchange", schedule, passive);
  window.addEventListener("pageshow", schedule, passive);
  document.addEventListener("visibilitychange", schedule, passive);
  img.addEventListener("load", schedule);
  for (const ms of [0,80,250,600,1200]) setTimeout(schedule, ms);
  return {
    check:schedule,
    disconnect:()=>{
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      ro?.disconnect();
      window.removeEventListener("scroll", schedule, passive);
      window.removeEventListener("resize", schedule, passive);
      window.removeEventListener("orientationchange", schedule, passive);
      window.removeEventListener("pageshow", schedule, passive);
      document.removeEventListener("visibilitychange", schedule, passive);
      img.removeEventListener("load", schedule);
    }
  };
}

function forceGifInfiniteLoop(blob) {
  if (!blob) return blob;
  return blob.arrayBuffer().then(buf => {
    const b = new Uint8Array(buf);
    if (b.length < 13) return blob;
    const sig = String.fromCharCode(...b.slice(0, 6));
    if (sig !== "GIF87a" && sig !== "GIF89a") return blob;

    // If a NETSCAPE/ANIMEXTS loop extension exists, set repeat count to 0 (= forever).
    for (let i = 0; i + 18 < b.length; i++) {
      if (b[i] !== 0x21 || b[i+1] !== 0xFF || b[i+2] !== 0x0B) continue;
      const app = String.fromCharCode(...b.slice(i+3, i+14));
      if (app !== "NETSCAPE2.0" && app !== "ANIMEXTS1.0") continue;
      const p = i + 14;
      if (b[p] === 0x03 && b[p+1] === 0x01) {
        b[p+2] = 0x00;
        b[p+3] = 0x00;
        return new Blob([b], {type: blob.type || "image/gif"});
      }
    }

    // No loop extension: insert one immediately after the global color table.
    const packed = b[10];
    let pos = 13;
    if (packed & 0x80) pos += 3 * (1 << ((packed & 0x07) + 1));
    if (pos > b.length) return blob;
    const loopExt = new Uint8Array([
      0x21,0xFF,0x0B,
      0x4E,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2E,0x30,
      0x03,0x01,0x00,0x00,0x00
    ]);
    const merged = new Uint8Array(b.length + loopExt.length);
    merged.set(b.slice(0,pos),0);
    merged.set(loopExt,pos);
    merged.set(b.slice(pos),pos+loopExt.length);
    return new Blob([merged], {type: blob.type || "image/gif"});
  }).catch(() => blob);
}
function isGifUrl(url) {
  const s = String(url || "");
  return /\.gif(?:[?#]|$)/i.test(s) || /[?&](?:format|fmt|fm|type|ext)=gif(?:&|$)/i.test(s);
}
function usableRemoteImageUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}
function usablePreparedImageUrl(url) {
  const s=String(url || "").trim();
  return usableRemoteImageUrl(s) || /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(s);
}
function decodeUrlEntities(raw) {
  return String(raw || "").trim()
    .replace(/&amp;/gi,'&').replace(/&#0*38;/gi,'&').replace(/&#x0*26;/gi,'&');
}
function normalizedImageCandidateUrl(raw, base=location.href) {
  let s=decodeUrlEntities(raw);
  if(!s)return '';
  if(/^data:image\//i.test(s))return s;
  let u;try{u=new URL(s,base);}catch{return '';}
  const host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(host==='lens.google.com' && /\/uploadbyurl/i.test(u.pathname)){
    const nested=u.searchParams.get('url')||'';
    if(!nested)return '';
    try{return normalizedImageCandidateUrl(decodeURIComponent(nested),base);}catch{return normalizedImageCandidateUrl(nested,base);}
  }
  if(host==='link.amazon'||host.endsWith('.link.amazon')||host==='amazon.co.jp'||host.endsWith('.amazon.co.jp')||host==='amazon.com'||host.endsWith('.amazon.com'))return '';
  if(/\.(?:html?|php|aspx?|cgi)(?:$|[?#])/i.test(u.pathname+u.search))return '';
  try{const b=new URL(base,location.href);if(u.href===b.href)return '';}catch{}
  return u.href;
}
function mediaHost(raw, base=location.href) {
  const s=decodeUrlEntities(raw);
  if(!s) return '';
  try { return new URL(s,base).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; }
}
function isNonRequiredMediaUrl(raw, base=location.href) {
  const h=mediaHost(raw,base);
  if(!h) return false;
  return h==='ir-jp.amazon-adsystem.com' || h.endsWith('.amazon-adsystem.com') ||
    h==='doubleclick.net' || h.endsWith('.doubleclick.net') ||
    h==='googlesyndication.com' || h.endsWith('.googlesyndication.com') ||
    h==='adservice.google.com' || h.endsWith('.adservice.google.com') ||
    h.includes('microad') || h.includes('i-mobile') || h.includes('admatrix') || h.includes('criteo') ||
    h==='link.amazon' || h.endsWith('.link.amazon');
}
function isClearlyNonRequiredImage(img) {
  if (!img) return false;
  if (img.dataset?.nonRequiredMedia==='1') return true;
  const a=img.closest?.('a[href]');
  const urls=[img.getAttribute?.('src'),img.getAttribute?.('data-src'),img.getAttribute?.('data-original'),img.getAttribute?.('data-lazy-src'),a?.getAttribute?.('href')].filter(Boolean);
  const meta=`${img.id||''} ${img.className||''} ${img.alt||''} ${img.title||''} ${img.getAttribute?.('width')||''}x${img.getAttribute?.('height')||''}`;
  if (urls.some(u=>isNonRequiredMediaUrl(u))) return true;
  const w=parseInt(img.getAttribute?.('width')||'0',10), h=parseInt(img.getAttribute?.('height')||'0',10);
  if (w>0 && h>0 && w<=2 && h<=2) return true;
  if (/(?:^|[\s_-])emoji\d*(?:[\s_-]|$)|emoticon|sticker/i.test(meta)) return true;
  return false;
}
function displayImageUrl(url) {
  return window.MatomePi?.assetUrl?.(url) || url;
}
function markHoverGif(img, src) {
  if (!img || !src) return;
  img.dataset.hoverGifSrc = src;
  // Direct GIF links created by the reader may not have src yet.
  // Keep an existing thumbnail, but give empty previews the real GIF URL.
  if (!img.getAttribute("src")) img.setAttribute("src", src);
  img.alt = img.alt || "GIF";
  img.title = "画面内に90%以上表示すると自動再生";
}
function linkedGifUrl(img) {
  const a = img?.closest?.("a[href]");
  if (!a) return "";
  const href = a.href || a.getAttribute("href") || "";
  return isGifUrl(href) ? href : "";
}
function linkedImageLikeUrl(img) {
  const a = img?.closest?.("a[href]");
  if (!a) return "";
  const href = normalizedImageCandidateUrl(a.href || a.getAttribute("href") || "", location.href);
  if (!usableRemoteImageUrl(href)) return "";
  try {
    const u = new URL(href);
    const path = `${u.pathname}${u.search}`.toLowerCase();
    if (/\.(?:gif|webp|png|jpe?g)(?:$|[?#])/.test(path)) return href;
    if (/[?&](?:img|image|media|src|url|file|path)=/.test(path)) return href;
    if (/\/(?:img|image|images|media|photo|photos|gif|gifs)\//.test(path) && !/\.(?:html?|php|aspx?|cgi)(?:$|[?#])/.test(path)) return href;
  } catch {}
  return "";
}
function animationCandidates(img) {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    u = normalizedImageCandidateUrl(u, location.href);
    if (!usablePreparedImageUrl(u) || seen.has(u)) return;
    seen.add(u);
    out.push(u);
    // Image hosts sometimes wrap the original image URL in ?url= / ?src= / ?image=.
    try {
      const q = new URL(u);
      for (const k of ['url','src','image','img','media','file','u']) {
        let nested = q.searchParams.get(k) || '';
        if (!nested) continue;
        try { nested = decodeURIComponent(nested); } catch {}
        if (usableRemoteImageUrl(nested) && !seen.has(nested)) {
          seen.add(nested); out.push(nested);
        }
      }
    } catch {}
  };
  const attrList = [
    img?.dataset?.hoverGifSrc,
    linkedGifUrl(img),
    linkedImageLikeUrl(img),
    img?.getAttribute?.('data-src'),
    img?.getAttribute?.('data-original'),
    img?.getAttribute?.('data-lazy-src'),
    img?.getAttribute?.('data-lazy'),
    img?.getAttribute?.('data-echo'),
    img?.getAttribute?.('data-image'),
    img?.getAttribute?.('data-img'),
    img?.getAttribute?.('data-full'),
    img?.currentSrc,
    img?.src
  ];
  for (const u of attrList) push(u);
  for (const src of img?.closest?.('picture')?.querySelectorAll?.('source[srcset]') || []) {
    for (const part of String(src.getAttribute('srcset') || '').split(',')) {
      push(part.trim().split(/\s+/)[0]);
    }
  }
  const a = img?.closest?.('a[href]');
  if (a) {
    const href = a.href || a.getAttribute('href') || '';
    // A lot of old 2ch image hosts use extensionless media URLs. Probe the wrapping link too,
    // except obvious HTML/article links.
    if (usableRemoteImageUrl(href) && !/\.(?:html?|php|aspx?|cgi)(?:$|[?#])/i.test(href)) push(href);
    for (const name of ['data-src','data-original','data-image','data-img','data-full','data-href','data-url','data-media']) push(a.getAttribute(name));
  }
  return out.sort((a,b) => {
    const score = (u) => (isGifUrl(u)?-100:0) + (/\.(?:webp|png)(?:$|[?#])/i.test(u)?-10:0) + (/\.(?:jpe?g)(?:$|[?#])/i.test(u)?10:0);
    return score(a) - score(b);
  });
}

function setupKnownGifHover(img, src) {
  if (!img || !src || img.dataset.hoverGifReady === "1") return;
  img.dataset.hoverGifReady = "1";
  img.dataset.hoverGifSrc = src;
  img.dataset.gifClickMode = "1";
  img.classList.add("hover-gif");
  img.title = "画面内に90%以上表示すると自動再生";

  const wrap = document.createElement("span");
  wrap.className = "hover-gif-wrap";
  wrap.dataset.gifClickMode = "1";
  const parent = img.parentNode;
  if (!parent) return;
  parent.insertBefore(wrap, img);
  wrap.appendChild(img);

  const poster = document.createElement("canvas");
  poster.className = "hover-gif-poster";
  poster.setAttribute("aria-hidden", "true");
  wrap.appendChild(poster);

  const badge = document.createElement("span");
  badge.className = "hover-gif-badge";
  badge.textContent = "GIF ▶";
  wrap.appendChild(badge);

  let frozen = false;
  let playing = false;
  const freeze = () => {
    if (frozen || !img.naturalWidth || !img.naturalHeight) return;
    try {
      poster.width = img.naturalWidth;
      poster.height = img.naturalHeight;
      const ctx = poster.getContext("2d", {alpha:true});
      ctx.drawImage(img, 0, 0, poster.width, poster.height);
      frozen = true;
      img.style.visibility = "hidden";
      poster.hidden = false;
      badge.textContent = "GIF ▶";
    } catch {
      // If canvas drawing fails, keep the image visible but still allow click toggle.
      frozen = true;
      poster.hidden = true;
      img.style.visibility = "visible";
    }
  };

  if (img.complete && img.naturalWidth) requestAnimationFrame(freeze);
  else img.addEventListener("load", () => requestAnimationFrame(freeze), {once:true});

  const setPlaying = (next) => {
    if (!frozen) freeze();
    playing = !!next;
    if (playing) {
      poster.hidden = true;
      img.style.visibility = "visible";
      img.classList.add("hover-gif-playing");
      badge.hidden = true;
      try {
        const base = src.replace(/#.*$/, "");
        img.src = base + "#click=" + Date.now();
      } catch {}
    } else {
      img.classList.remove("hover-gif-playing");
      badge.hidden = false;
      badge.textContent = "GIF ▶";
      if (poster.width && poster.height) {
        img.style.visibility = "hidden";
        poster.hidden = false;
      } else {
        img.style.visibility = "visible";
      }
    }
  };

  watchGifFullVisibility(img, setPlaying);
  wrap.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
};

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(u); reject(new Error("image decode failed")); };
    im.src = u;
  });
}
async function firstFrameBlob(blob) {
  const im = await loadImageFromBlob(blob);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
  const w = Math.max(1, Math.round((im.naturalWidth || 1) * scale));
  const h = Math.max(1, Math.round((im.naturalHeight || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", {alpha:true});
  ctx.drawImage(im, 0, 0, w, h);
  return await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("poster failed")), "image/webp", 0.9);
  });
}
function countGifFrames(bytes, stopAt=2) {
  if (!bytes || bytes.length < 13) return 0;
  const sig = String.fromCharCode(...bytes.slice(0, 6));
  if (sig !== "GIF87a" && sig !== "GIF89a") return 0;

  let p = 6;
  if (p + 7 > bytes.length) return 0;
  const packed = bytes[p + 4];
  p += 7;
  if (packed & 0x80) {
    const gctSize = 3 * (1 << ((packed & 0x07) + 1));
    p += gctSize;
  }

  let frames = 0;
  const skipSubBlocks = () => {
    while (p < bytes.length) {
      const n = bytes[p++];
      if (n === 0) break;
      p += n;
      if (p > bytes.length) { p = bytes.length; break; }
    }
  };

  while (p < bytes.length) {
    const marker = bytes[p++];
    if (marker === 0x3B) break; // trailer
    if (marker === 0x21) { // extension
      if (p >= bytes.length) break;
      p++; // extension label
      skipSubBlocks();
      continue;
    }
    if (marker === 0x2C) { // image descriptor = one frame
      frames++;
      if (frames >= stopAt) return frames;
      if (p + 9 > bytes.length) break;
      const imagePacked = bytes[p + 8];
      p += 9;
      if (imagePacked & 0x80) {
        const lctSize = 3 * (1 << ((imagePacked & 0x07) + 1));
        p += lctSize;
      }
      if (p >= bytes.length) break;
      p++; // LZW minimum code size
      skipSubBlocks();
      continue;
    }
    // Broken/unexpected stream: do not guess that it is animated.
    break;
  }
  return frames;
}

async function isAnimatedImageBlob(blob) {
  const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 32)).arrayBuffer());
  if (head.length >= 6) {
    const h = String.fromCharCode(...head.slice(0, 6));
    if (h === "GIF87a" || h === "GIF89a") {
      // A .gif extension does not necessarily mean animation. Parse the GIF blocks
      // and require at least two image descriptors before showing playback UI.
      const full = new Uint8Array(await blob.arrayBuffer());
      return countGifFrames(full, 2) >= 2;
    }
  }

  const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 262144)).arrayBuffer());
  // Animated WebP contains ANIM or ANMF chunks.
  if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") {
    const txt = new TextDecoder("latin1").decode(bytes);
    if (txt.includes("ANIM") || txt.includes("ANMF")) return true;
  }
  // APNG contains an acTL chunk.
  if (bytes.length >= 16 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47) {
    const txt = new TextDecoder("latin1").decode(bytes);
    if (txt.includes("acTL")) return true;
  }
  return false;
}
async function fetchImageBlobViaBackground(src) {
  try {
    if (!globalThis.chrome?.runtime?.sendMessage) return null;
    const r = await chrome.runtime.sendMessage({type:"FETCH_IMAGE_DATA", url:src});
    if (!r?.ok || !r.base64) return null;
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], {type:r.type || "application/octet-stream"});
  } catch { return null; }
}
async function fetchImageBlobRobust(src) {
  let direct = null;
  try {
    const res = await fetch(src, {credentials:"omit", cache:"no-store", referrerPolicy:"no-referrer"});
    if (res.ok) direct = await res.blob();
  } catch {}
  if (direct && await isAnimatedImageBlob(direct)) return direct;
  const bg = await fetchImageBlobViaBackground(src);
  if (bg && await isAnimatedImageBlob(bg)) return bg;
  return direct || bg;
}

function getGifAsset(src) {
  if (gifAssetCache.has(src)) return gifAssetCache.get(src);
  const pending = (async () => {
    const originalBlob = await fetchImageBlobRobust(src);
    if (!originalBlob || !(await isAnimatedImageBlob(originalBlob))) return {animated:false};
    const poster = await firstFrameBlob(originalBlob);
    const blob = await forceGifInfiniteLoop(originalBlob);
    return {animated:true, blob, poster};
  })();
  gifAssetCache.set(src, pending);
  pending.catch(() => gifAssetCache.delete(src));
  return pending;
}
async function setupHoverGif(img, explicitSrc="") {
  if (!img || img.dataset.hoverGifReady === "1") return;
  const candidates = [];
  const seed = explicitSrc || img.dataset.hoverGifSrc || "";
  if (usableRemoteImageUrl(seed)) candidates.push(seed);
  for (const u of animationCandidates(img)) if (!candidates.includes(u)) candidates.push(u);
  if (!candidates.length) return;
  img.dataset.hoverGifReady = "1";
  try {
    let chosenSrc = "";
    let asset = null;
    for (const src of candidates.slice(0, 8)) {
      try {
        const a = await getGifAsset(src);
        if (a?.animated) { chosenSrc = src; asset = a; break; }
      } catch {}
    }
    if (!img.isConnected || !asset?.animated) {
      // Static GIFs (including AA saved as .gif) stay ordinary images: no badge/playback UI.
      img.dataset.hoverGifReady = "0";
      img.removeAttribute("data-gif-click-mode");
      img.removeAttribute("data-hover-gif-src");
      img.title = "";
      return;
    }

    const src = chosenSrc;
    img.dataset.hoverGifSrc = src;
    img.dataset.gifClickMode = "1"; // blocks lightbox/navigation; playback itself is automatic.
    const state = {asset, posterUrl:URL.createObjectURL(asset.poster), playUrl:"", playing:false, badge:null};
    gifImageState.set(img, state);
    img.src = state.posterUrl;
    img.classList.add("hover-gif");
    img.title = "画面内に90%以上表示すると自動再生";

    let wrap = img.closest(".hover-gif-wrap");
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = "hover-gif-wrap";
      wrap.dataset.gifClickMode = "1";
      const parent = img.parentNode;
      if (parent) {
        parent.insertBefore(wrap, img);
        wrap.appendChild(img);
      }
    }
    let badge = wrap?.querySelector?.(".hover-gif-badge");
    if (!badge && wrap) {
      badge = document.createElement("span");
      badge.className = "hover-gif-badge";
      badge.textContent = "GIF ▶";
      wrap.appendChild(badge);
    }
    state.badge = badge || null;

    const setPlaying = (next) => {
      const s = gifImageState.get(img); if (!s) return;
      next = !!next;
      if (next === s.playing) return;
      if (next) {
        if (s.playUrl) URL.revokeObjectURL(s.playUrl);
        s.playUrl = URL.createObjectURL(s.asset.blob);
        img.src = s.playUrl;
        img.classList.add("hover-gif-playing");
        s.playing = true;
        if (s.badge) s.badge.hidden = true;
      } else {
        img.src = s.posterUrl;
        img.classList.remove("hover-gif-playing");
        s.playing = false;
        if (s.playUrl) {
          URL.revokeObjectURL(s.playUrl);
          s.playUrl = "";
        }
        if (s.badge) { s.badge.hidden = false; s.badge.textContent = "GIF ▶"; }
      }
    };
    state.setPlaying = setPlaying;
    watchGifFullVisibility(img, setPlaying);
  } catch {
    img.dataset.hoverGifReady = "0";
    // Probe failure: leave the original image unchanged and do not show a GIF badge.
  }
}

function initHoverGifs(root=document) {
  for (const img of root.querySelectorAll("img")) {
    const candidates = animationCandidates(img);
    if (!candidates.length) continue;
    setupHoverGif(img, candidates[0]);
  }
}

function isImgurPageUrl(raw) {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return h === "imgur.com" && !/\.(?:jpg|jpeg|png|gif|webp|avif)(?:$|[?#])/i.test(u.pathname + u.search);
  } catch { return false; }
}

function imgurIdFromUrl(raw) {
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return "";
    if (["a","gallery","t"].includes((parts[0] || "").toLowerCase())) return parts[1] || "";
    return parts[0] || "";
  } catch { return ""; }
}

async function resolveImgurPreview(rawUrl) {
  const url = String(rawUrl || "");
  try {
    const fetched = await fetchDecoded(url);
    const doc = new DOMParser().parseFromString(fetched.text, "text/html");
    const meta = (sel) => doc.querySelector(sel)?.getAttribute("content") || "";
    const candidates = [
      meta('meta[property="og:image"]'),
      meta('meta[name="twitter:image"]'),
      meta('meta[property="twitter:image"]'),
      meta('link[rel="image_src"]')
    ].filter(Boolean);
    for (const c of candidates) {
      const abs = absUrl(c, fetched.finalUrl || url) || c;
      if (/^https?:\/\//i.test(abs)) return abs;
    }
  } catch {}

  // Imgur image-page URLs usually map to i.imgur.com/<id>.<ext>.
  // JPG is a safe static preview fallback when page metadata is unavailable.
  const id = imgurIdFromUrl(url);
  if (/^[A-Za-z0-9]+$/.test(id)) return `https://i.imgur.com/${id}.jpg`;
  return "";
}

function imageLoads(url) {
  return new Promise((resolve) => {
    const probe = new Image();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      probe.onload = probe.onerror = null;
      resolve(ok);
    };
    probe.onload = () => finish((probe.naturalWidth || 0) > 1 && (probe.naturalHeight || 0) > 1);
    probe.onerror = () => finish(false);
    probe.referrerPolicy = "no-referrer";
    probe.src = displayImageUrl(url);
    setTimeout(() => finish(false), 8000);
  });
}


function isDirectPreviewImageUrl(url) {
  const s = String(url || "");
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return /\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test((u.pathname || "") + (u.search || ""));
  } catch { return false; }
}

function imgurDirectPreviewUrl(url) {
  try {
    const u = new URL(String(url || ""));
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "imgur.com") return "";
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length !== 1 || !/^[A-Za-z0-9]+$/.test(parts[0])) return "";
    return `https://i.imgur.com/${parts[0]}.jpg`;
  } catch { return ""; }
}

async function loadPreviewWithFallback(img, href) {
  const direct = isDirectPreviewImageUrl(href) ? href : imgurDirectPreviewUrl(href);
  if (!direct) return false;
  const proxied = displayImageUrl(direct);
  let host = "";
  try { host = new URL(direct).hostname.toLowerCase(); } catch {}
  const candidates = [...new Set(host === "i.imgur.com" ? [direct, proxied] : [proxied, direct])];
  for (const src of candidates) {
    const ok = await new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      img.addEventListener("load", () => finish(true), {once:true});
      img.addEventListener("error", () => finish(false), {once:true});
      img.src = src;
      setTimeout(() => finish(false), 8000);
    });
    if (ok) return true;
  }
  try {
    const res = await chrome.runtime.sendMessage({type:"FETCH_IMAGE_DATA", url:direct});
    if (res?.ok && res.base64) {
      return await new Promise(resolve => {
        img.addEventListener("load", () => resolve(true), {once:true});
        img.addEventListener("error", () => resolve(false), {once:true});
        img.src = `data:${res.type || "image/jpeg"};base64,${res.base64}`;
      });
    }
  } catch {}
  return false;
}

function expandDirectImageLinks(root=document) {
  const pending = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.href || a.getAttribute('href') || '';
    const previewUrl = isDirectPreviewImageUrl(href) ? href : imgurDirectPreviewUrl(href);
    if (!previewUrl || a.querySelector('img')) continue;
    if (a.dataset.directImageExpanded === '1') continue;
    a.dataset.directImageExpanded = '1';
    const img = document.createElement('img');
    img.className = isGifUrl(previewUrl) ? 'direct-gif-preview direct-image-preview' : 'direct-image-preview';
    img.dataset.sourceHref = href;
    img.loading = 'eager';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.alt = 'リンク先画像';
    a.insertAdjacentElement('afterend', img);
    if (a.closest('[data-required-reply="1"]')) img.dataset.requiredMedia='1';
    pending.push(loadPreviewWithFallback(img, href).then(ok => {
      if (!ok) {
        if (PREPARING && img.dataset.requiredMedia==='1') {
          const textLen=cleanText(root.textContent||'').length;
          const otherMedia=[...root.querySelectorAll('img,video,iframe,blockquote')].filter(x=>x!==img).length;
          if(textLen<60 && otherMedia===0) throw new Error('重要画像を取得できません: '+href);
          const miss=document.createElement('span');miss.className='prepared-image-fallback';miss.dataset.mediaWarning='image';miss.dataset.failedUrl=href;miss.textContent='画像を取得できませんでした';
          img.replaceWith(miss); a.dataset.directImageExpanded='0'; return;
        }
        img.remove(); a.dataset.directImageExpanded = '0'; return;
      }
      if (isGifUrl(previewUrl)) markHoverGif(img, previewUrl);
    }));
  }
  return Promise.all(pending);
}

function youtubeVideoId(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/)?.[1] || '';
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : '';
  } catch { return ''; }
}

function deduplicateYouTubeEmbeds(root) {
  const videos = new Map();
  const area = el => {
    const rect = el.getBoundingClientRect();
    const width = rect.width || parseFloat(el.getAttribute('width')) || 0;
    const height = rect.height || parseFloat(el.getAttribute('height')) || 0;
    return Number(el.dataset.originalArea) || width * height;
  };
  for (const el of root.querySelectorAll('iframe[src], .youtube-inline-card[data-youtube-id]')) {
    if (el.tagName === 'IFRAME' && el.closest('.youtube-inline-card')) continue;
    const id = el.dataset.youtubeId || youtubeVideoId(el.getAttribute('src'));
    if (!id) continue;
    const previous = videos.get(id);
    if (!previous) { videos.set(id, el); continue; }
    // Prefer the larger player; on equal sizes preserve the first occurrence.
    if (area(el) > area(previous)) {
      previous.remove();
      videos.set(id, el);
    } else el.remove();
  }
  return new Set(videos.keys());
}

function expandYouTubeLinks(root=document) {
  const embedded = deduplicateYouTubeEmbeds(root);
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.href || a.getAttribute('href') || '';
    const id = youtubeVideoId(href);
    if (!id || a.dataset.youtubeExpanded === '1') continue;
    a.dataset.youtubeExpanded = '1';
    if (embedded.has(id)) continue;
    embedded.add(id);
    const card = document.createElement('div');
    card.className = 'youtube-inline-card';
    card.dataset.youtubeId = id;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'youtube-inline-thumb';
    const img = document.createElement('img');
    img.loading = 'eager'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.alt = 'YouTube動画サムネイル';
    img.src = displayImageUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    const play = document.createElement('span'); play.className = 'youtube-inline-play'; play.textContent = '▶';
    btn.append(img, play); card.appendChild(btn); a.insertAdjacentElement('afterend', card);
    btn.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.className = 'youtube-inline-frame';
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title = 'YouTube video player';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      card.replaceChildren(frame);
    }, {once:true});
  }
}

function isYouTubeEmbedIframe(el, base='') {
  if (!el || el.tagName !== 'IFRAME') return false;
  const src = absUrl(el.getAttribute('src') || '', base);
  if (!src) return false;
  try {
    const u = new URL(src);
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    return ['youtube.com','youtube-nocookie.com','m.youtube.com'].includes(h) && /\/embed\//.test(u.pathname);
  } catch { return false; }
}

function xStatusUrlFromElement(el, base='') {
  if (!el) return '';
  const own = el.getAttribute?.('data-tweet-id') || '';
  if (/^\d+$/.test(own)) return `https://x.com/i/status/${own}`;
  if (el.tagName === 'IFRAME') {
    try {
      const u = new URL(absUrl(el.getAttribute('src') || '', base));
      const id = u.searchParams.get('id') || el.getAttribute('data-tweet-id') || '';
      if (/^\d+$/.test(id)) return `https://x.com/i/status/${id}`;
    } catch {}
  }
  for (const a of el.querySelectorAll?.('a[href]') || []) {
    const href = absUrl(a.getAttribute('href') || '', base);
    if (isXStatusHref(href, base)) return href;
  }
  return '';
}

function makeOfficialXFrame(statusUrl) {
  // v0.1.78: never embed the raw X page in the reader.  x.com can reject iframe
  // connections, leaving a large unusable error box.  Prepared .x-static-card content
  // is preferred; when it is unavailable, keep a small same-document fallback link.
  const id = xStatusId(statusUrl);
  if (!id) return null;
  const wrap = document.createElement('div');
  wrap.className = 'x-official-embed-wrap x-fallback-card';
  wrap.dataset.tweetId = id;
  const note = document.createElement('div');
  note.className = 'x-fallback-note';
  note.textContent = 'X投稿（本文取得待ち）';
  const link = document.createElement('a');
  link.href = statusUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = '元のX投稿を開く';
  wrap.append(note, link);
  return wrap;
}

function hydrateGenericXEmbeds(root=document, base='') {
  const seen = new Set();
  // Rendered DOMのiframeはorigin/session依存URLを捨て、tweet idだけで公式URLへ作り直す。
  for (const frame of [...root.querySelectorAll('iframe')]) {
    if (!isXEmbedIframe(frame, base)) continue;
    const status = xStatusUrlFromElement(frame, base);
    const id = xStatusId(status);
    if (!id) continue;
    seen.add(id);
    const wrap = makeOfficialXFrame(status);
    if (wrap) frame.replaceWith(wrap); else frame.remove();
  }
  // 生HTMLの blockquote.twitter-tweet は widgets.js を消しても復元できるよう公式iframeへ置換。
  for (const quote of [...root.querySelectorAll('blockquote')]) {
    const status = xStatusUrlFromElement(quote, base);
    const id = xStatusId(status);
    if (!id || seen.has(id)) continue;
    const wrap = makeOfficialXFrame(status);
    if (!wrap) continue;
    seen.add(id); quote.replaceWith(wrap);
  }
  // blockquoteが壊れたサイトでもstatusリンクが本文中に残っていれば直後へ埋め込む。
  for (const a of [...root.querySelectorAll('a[href]')]) {
    const href = absUrl(a.getAttribute('href') || '', base);
    const id = xStatusId(href);
    if (!id || !isXStatusHref(href, base) || seen.has(id)) continue;
    const wrap = makeOfficialXFrame(href);
    if (!wrap) continue;
    seen.add(id); a.insertAdjacentElement('afterend', wrap);
  }
}

function normalizedMediaUrl(raw) {
  if (!String(raw || '').trim()) return '';
  try {
    const u = new URL(String(raw || ''), location.href);
    u.hash = '';
    return u.href;
  } catch { return String(raw || '').replace(/#.*$/, ''); }
}

function isDirectVideoUrl(raw, base='') {
  const href = absUrl(raw || '', base) || String(raw || '').trim();
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const u = new URL(href);
    if ((u.hostname || '').toLowerCase() === 'video.twimg.com') return true;
  } catch {}
  return /\.(?:mp4|webm|m4v)(?:$|[?#])/i.test(href);
}

function protectDirectVideoLinks(root, base='') {
  if (!root?.querySelectorAll) return;
  // Some matome sites leave X/Twitter video as a naked URL instead of <video>.
  // Preserve every direct-video link before ad/SNS cleanup so mid-thread videos survive too.
  const doc = root.ownerDocument || document;
  try {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const re = /https?:\/\/[^\s<>"']+?(?:\.(?:mp4|webm|m4v)(?:\?[^\s<>"']*)?)/ig;
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest('a,script,style,noscript,textarea')) continue;
      const text = String(node.nodeValue || '');
      re.lastIndex = 0;
      let m, last = 0, changed = false;
      const frag = doc.createDocumentFragment();
      while ((m = re.exec(text))) {
        const raw = m[0];
        if (!isDirectVideoUrl(raw, base)) continue;
        changed = true;
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        const a = doc.createElement('a');
        a.href = absUrl(raw, base) || raw;
        a.textContent = raw;
        a.dataset.requiredMedia = '1';
        a.dataset.directVideoPreserve = '1';
        frag.appendChild(a);
        last = m.index + raw.length;
      }
      if (!changed) continue;
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
  } catch {}
  for (const a of [...root.querySelectorAll('a[href]')]) {
    const href = absUrl(a.getAttribute('href') || '', base) || a.getAttribute('href') || '';
    if (!isDirectVideoUrl(href, base)) continue;
    a.setAttribute('href', href);
    a.dataset.requiredMedia = '1';
    a.dataset.directVideoPreserve = '1';
  }
}

function videoSourceUrls(video) {
  const out = [];
  const add = (u) => {
    const n = normalizedMediaUrl(u);
    if (!/^https?:\/\//i.test(n)) return; // blob:/data: URLs die when the prepared page closes.
    if (n && !out.includes(n)) out.push(n);
  };
  // Prefer explicit reusable URLs over currentSrc, which is often a temporary blob: URL.
  add(video?.dataset?.videoSource);
  add(video?.getAttribute?.('src'));
  for (const s of video?.querySelectorAll?.('source[src],source[data-video-source]') || []) add(s.dataset.videoSource || s.getAttribute('src'));
  add(video?.currentSrc);
  return out;
}

function removeDuplicateVideoMedia(root=document) {
  if (!root) return;

  // 同じ動画が元サイトの小型videoと、こちらで追加した大きいvideoの2つ出た場合は
  // 大きい direct-video-preview を優先して1つだけ残す。
  const byUrl = new Map();
  for (const video of [...root.querySelectorAll('video')]) {
    const urls = videoSourceUrls(video);
    if (!urls.length) continue;
    const key = urls[0];
    const prev = byUrl.get(key);
    if (!prev) { byUrl.set(key, video); continue; }

    const score = (v) => {
      let n = v.classList?.contains('direct-video-preview') ? 10000 : 0;
      try { n += Math.max(0, v.getBoundingClientRect().width || 0); } catch {}
      n += Number(v.getAttribute?.('width') || 0) || 0;
      return n;
    };
    const keep = score(video) >= score(prev) ? video : prev;
    const drop = keep === video ? prev : video;
    drop.remove();
    byUrl.set(key, keep);
  }

  // 動画リンクそのものが小さいサムネ画像を抱えている場合も、videoが表示できていれば
  // サムネだけを消す。記事内の別画像までは触らない。
  for (const video of [...root.querySelectorAll('video')]) {
    const urls = videoSourceUrls(video);
    if (!urls.length) continue;
    const key = urls[0];
    const near = [video.previousElementSibling, video.nextElementSibling].filter(Boolean);
    for (const el of near) {
      if (el?.tagName === 'A') {
        const href = normalizedMediaUrl(el.getAttribute('href') || el.href || '');
        if (href === key) {
          const imgs = [...el.querySelectorAll('img')];
          if (imgs.length) {
            for (const img of imgs) img.remove();
            if (!cleanText(el.textContent || '')) el.remove();
          }
        }
      }
    }
    const poster = normalizedMediaUrl(video.getAttribute('poster') || '');
    if (poster) {
      for (const img of [...root.querySelectorAll('img[src]')]) {
        if (normalizedMediaUrl(img.getAttribute('src') || img.src || '') !== poster) continue;
        const vr = video.getBoundingClientRect?.();
        const ir = img.getBoundingClientRect?.();
        if (!vr || !ir || Math.abs(ir.top - vr.top) < 900) img.remove();
      }
    }
  }
}

function expandDirectVideoLinks(root=document) {
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.href || a.getAttribute('href') || '';
    if (!isDirectVideoUrl(href, location.href) || a.dataset.videoExpanded === '1') continue;
    a.dataset.videoExpanded = '1';
    const key = normalizedMediaUrl(href);
    const already = [...root.querySelectorAll('video')].find(v => videoSourceUrls(v).includes(key));
    if (already) continue;
    const video = document.createElement('video');
    video.className = 'direct-video-preview'; video.controls = true; video.preload = 'metadata';
    video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    if (a.dataset.requiredMedia==='1' || a.closest('[data-required-reply="1"]')) video.dataset.requiredMedia='1';
    if (PREPARING) video.dataset.videoSource=href; else video.src=href; a.insertAdjacentElement('afterend', video);
  }
  removeDuplicateVideoMedia(root);
}

async function expandImgurLinks(root=document) {
  const links = [...root.querySelectorAll('a[href]')].filter(a => isImgurPageUrl(a.href || a.getAttribute('href') || ''));
  for (const a of links) {
    if (a.dataset.imgurPreviewDone === "1") continue;
    a.dataset.imgurPreviewDone = "1";
    // Don't duplicate an image that is already attached to this link/block.
    const parent = a.parentElement;
    if (a.querySelector('img') || a.nextElementSibling?.classList?.contains('imgur-inline-preview')) continue;
    const src = await resolveImgurPreview(a.href || a.getAttribute('href'));
    if (!src || !(await imageLoads(src))) { if (PREPARING) throw new Error('Imgur画像の準備失敗'); continue; }

    const box = document.createElement('div');
    box.className = 'imgur-inline-preview';
    const img = document.createElement('img');
    img.src = displayImageUrl(src);
    img.alt = 'Imgur画像';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.dataset.imgurPreview = '1';
    box.appendChild(img);

    // Put the preview directly below the Imgur link without changing the link itself.
    const block = a.closest('p,div,li,blockquote') || a;
    if (block.parentNode) block.parentNode.insertBefore(box, block.nextSibling);
  }
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

// v0.1.106: mobile full-width right-swipe back; lighter threshold for iPhone. Keep controls/media/lightbox gestures independent.
(function setupMobileSwipeBack(){
  if(!readerIsMobile() || window.parent!==window) return;
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

function cleanText(s) {
  return (s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function absUrl(raw, base) {
  try { return new URL(raw, base).href; } catch { return ""; }
}
function mediaAbsUrl(raw, base) {
  const cleaned=decodeUrlEntities(raw);
  if(!cleaned) return '';
  try {
    const out=new URL(cleaned,base).href;
    const b=new URL(base).href;
    if(out===b) return '';
    return out;
  } catch { return ''; }
}

function decodeBuffer(buffer, contentType="") {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 8192));

  let charset = "";
  const ct = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (ct) charset = ct[1];

  if (!charset) {
    const m1 = head.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i);
    const m2 = head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([^"';\s]+)/i);
    charset = (m1?.[1] || m2?.[1] || "utf-8");
  }

  charset = charset.toLowerCase()
    .replace("shift-jis", "shift_jis")
    .replace("sjis", "shift_jis")
    .replace("x-sjis", "shift_jis");

  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

async function fetchDecoded(url) {
  // Piが先読み済みなら、元サイト確認もproxyの再検証もせず保存HTMLを直読みする。
  // 未キャッシュ時だけ従来のproxy経路へフォールバック。
  if (/^https?:\/\//i.test(String(url || "")) && window.MatomePi?.articleCacheUrl) {
    try {
      const local = await fetch(window.MatomePi.articleCacheUrl(url), {cache:"no-store", credentials:"same-origin"});
      if (local.ok) {
        const buffer = await local.arrayBuffer();
        return {
          text: decodeBuffer(buffer, local.headers.get("content-type") || ""),
          finalUrl: local.headers.get("X-Upstream-URL") || url,
          cacheState: "PI-HIT"
        };
      }
    } catch {}
  }
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return {
    text: decodeBuffer(buffer, res.headers.get("content-type") || ""),
    finalUrl: res.url || url,
    cacheState: res.headers.get("X-RPi-Cache") || ""
  };
}



// Multi-page article support.
// Follow only strong pagination signals on the same host and stop after 5 pages.
function canonicalPageUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid|ref|referrer|from)$/i.test(k)) u.searchParams.delete(k);
    }
    return u.href.replace(/\/$/, "");
  } catch { return String(raw || ""); }
}

function normalizedArticleTitle(s) {
  return cleanText(s)
    .replace(/[｜|]\s*\d+\s*ページ目.*$/i, "")
    .replace(/[-–—_:：]\s*(?:page\s*)?\d+\s*$/i, "")
    .replace(/[（(]\s*\d+\s*[）)]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferPageNumber(url) {
  try {
    const u = new URL(url);
    for (const k of ["page", "paged", "p", "pg"]) {
      const v = Number(u.searchParams.get(k));
      if (v >= 1 && v <= 99) return v;
    }
    const path = u.pathname;
    const m = path.match(/(?:\/page\/|[-_])([2-9]|[1-9]\d)(?:\/|\.html?$|$)/i);
    if (m) return Number(m[1]);
  } catch {}
  return 1;
}

function sameHostUrl(a, b) {
  try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); }
  catch { return false; }
}

function paginationContainerScore(a) {
  let el = a;
  for (let i=0; i<4 && el; i++, el=el.parentElement) {
    const key = `${el.id || ""} ${el.className || ""} ${el.getAttribute?.("role") || ""}`.toLowerCase();
    if (/(?:pagination|pager|paging|page-nav|pagenav|nav-links|page-links|next-prev|entry-pager)/.test(key)) return 90 - i*10;
    if (el.tagName === "NAV") return 45 - i*5;
  }
  return 0;
}

function findNextPageUrl(doc, currentUrl, seenUrls) {
  const currentKey = canonicalPageUrl(currentUrl);
  const currentNo = inferPageNumber(currentUrl);
  const candidates = [];

  const push = (href, score, why) => {
    const abs = absUrl(href, currentUrl);
    if (!abs || !/^https?:/i.test(abs) || !sameHostUrl(abs, currentUrl)) return;
    const key = canonicalPageUrl(abs);
    if (!key || key === currentKey || seenUrls.has(key)) return;
    try {
      const u = new URL(abs);
      if (/\.(?:jpg|jpeg|png|gif|webp|zip|pdf)(?:$|[?#])/i.test(u.pathname)) return;
    } catch {}
    candidates.push({url:abs, key, score, why});
  };

  for (const link of doc.querySelectorAll('link[rel~="next"][href]')) {
    push(link.getAttribute("href"), 1000, "rel-next-link");
  }

  for (const a of doc.querySelectorAll('a[href]')) {
    const text = cleanText(a.textContent).replace(/\s+/g, " ");
    const rel = (a.getAttribute("rel") || "").toLowerCase();
    const aria = cleanText(a.getAttribute("aria-label") || "");
    const title = cleanText(a.getAttribute("title") || "");
    const merged = `${text} ${aria} ${title}`.trim();
    const pagerScore = paginationContainerScore(a);
    let score = pagerScore;

    if (/\bnext\b/i.test(rel)) score += 900;
    if (/^(?:次へ|次のページ|次ページ|続き|続きを読む|NEXT|Next|next|›|»|＞|→|≫|▶)$/i.test(text)) score += 700;
    else if (/(?:次へ|次のページ|次ページ|NEXT|続きを見る|続きを読む)/i.test(merged)) score += 520;

    const n = Number(text.replace(/[^0-9]/g, ""));
    if (pagerScore && /^\s*\d{1,2}\s*$/.test(text) && n === currentNo + 1) score += 360;

    if (score < 300) continue;

    const href = a.getAttribute("href");
    const abs = absUrl(href, currentUrl);
    if (!abs) continue;

    try {
      const cur = new URL(currentUrl);
      const nxt = new URL(abs);
      const curDir = cur.pathname.replace(/[^/]*$/, "");
      const nxtDir = nxt.pathname.replace(/[^/]*$/, "");
      if (curDir === nxtDir) score += 50;
      if (cur.pathname === nxt.pathname && cur.search !== nxt.search) score += 70;
    } catch {}

    push(href, score, "anchor");
  }

  candidates.sort((a,b) => b.score - a.score);
  return candidates[0]?.url || "";
}

function contentFingerprint(box) {
  const t = cleanText(box?.textContent || "").replace(/\s+/g, " ");
  return t.slice(0, 800);
}

async function fetchAdditionalArticlePages(firstDoc, firstUrl, firstTitle, maxPages=5) {
  const pages = [];
  const seenUrls = new Set([canonicalPageUrl(firstUrl)]);
  const seenContent = new Set();
  let doc = firstDoc;
  let url = firstUrl;
  const baseTitle = normalizedArticleTitle(firstTitle);

  for (let pageNo=2; pageNo<=maxPages; pageNo++) {
    const nextUrl = findNextPageUrl(doc, url, seenUrls);
    if (!nextUrl) break;
    const key = canonicalPageUrl(nextUrl);
    seenUrls.add(key);

    let fetched;
    try { fetched = await fetchDecoded(nextUrl); }
    catch (e) { if (PREPARING) throw e; break; }

    const nextDoc = new DOMParser().parseFromString(fetched.text, "text/html");
    const nextTitle =
      metaContent(nextDoc, ['meta[property="og:title"]','meta[name="twitter:title"]']) ||
      cleanText(nextDoc.querySelector("h1")?.textContent) ||
      cleanText(nextDoc.title) || "";

    // If the title becomes completely unrelated, this was probably a next-article link, not pagination.
    const normalizedNext = normalizedArticleTitle(nextTitle);
    if (baseTitle && normalizedNext && !sameTitle(baseTitle, normalizedNext)) {
      const compactA = baseTitle.replace(/[^\p{L}\p{N}]/gu, "");
      const compactB = normalizedNext.replace(/[^\p{L}\p{N}]/gu, "");
      const shared = compactA.slice(0, 16);
      if (shared && !compactB.includes(shared)) break;
    }

    const root = pickArticleRoot(nextDoc);
    const best = chooseBestPreparedContent(nextDoc, fetched.finalUrl, firstTitle, root);
    if (!best) break;

    const textLen = cleanText(best.textContent).length;
    const mediaCount = best.querySelectorAll("img,pre,blockquote,table,iframe").length;
    if (textLen < 60 && mediaCount === 0) break;

    const fp = contentFingerprint(best);
    if (fp && seenContent.has(fp)) break;
    if (fp) seenContent.add(fp);

    pages.push({box:best, url:fetched.finalUrl, pageNo});
    doc = nextDoc;
    url = fetched.finalUrl;
  }
  return pages;
}
function metaContent(doc, selectors) {
  for (const s of selectors) {
    const v = doc.querySelector(s)?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return "";
}

const THREAD_HEADER_RE = /\b\d{1,5}(?:\s*[:：](?!\d)|\s+名前\s*[：:])[^\/\r\n]{0,180}?\d{2,4}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?/g;
const THREAD_DATE_RE = /\d{2,4}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?/;

function threadHeaderCount(el) {
  const text = el?.textContent || "";
  return (text.match(THREAD_HEADER_RE) || []).length;
}

function nodeDepth(el) {
  let d = 0;
  for (let p = el; p?.parentElement; p = p.parentElement) d++;
  return d;
}

function scoreNode(el) {
  const text = cleanText(el.textContent);
  if (text.length < 150) return -Infinity;

  const p = el.querySelectorAll("p").length;
  const br = el.querySelectorAll("br").length;
  const img = el.querySelectorAll("img").length;
  const links = [...el.querySelectorAll("a")].reduce((n,a) => n + cleanText(a.textContent).length, 0);
  const threads = threadHeaderCount(el);
  const simpleReplies = simpleReplyCount(el);

  const key = `${el.id || ""} ${el.className || ""}`.toLowerCase();
  let score = text.length + p*100 + br*22 + img*38 - links*.20 + threads*5000 + Math.min(simpleReplies,80)*850;

  if (/(article|entry|post|body|content|main|blogbody|kiji)/.test(key)) score += 1400;
  if (/(side|menu|nav|footer|header|comment|rank|related|recommend|pickup|archive)/.test(key)) score -= 3500;

  return score;
}

function isRabbitSokuhoUrl(url) {
  try {
    return /(^|\.)rabitsokuhou\.2chblog\.jp$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
function isNews4vipQualityUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='news4vip.livedoor.biz';
  } catch { return false; }
}
function isItsokuUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='itsoku.org' || h.endsWith('.itsoku.org');
  } catch { return false; }
}
function isHeartLogUrl(url) {
  try {
    return /(^|\.)blog\.livedoor\.jp$/i.test(new URL(url).hostname) && /\/love120331\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
function isKonoyubiUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='konoyubitomare.jp';
  } catch { return false; }
}
function isUshi32Url(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='usi32.com';
  } catch { return false; }
}

function isAlfalfalfaUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='alfalfalfa.com' || h.endsWith('.alfalfalfa.com');
  } catch { return false; }
}
const SIMPLE_REPLY_RE = /(?:^|\n)\s*(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/gm;
function simpleReplyCount(el) {
  if (!el) return 0;
  const t=String(el.innerText || el.textContent || '').replace(/\r/g,'\n');
  let lines=(t.match(SIMPLE_REPLY_RE)||[]).length;
  let nodes=0;
  try {
    const doc=el.ownerDocument || document;
    const walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const v=String(walker.currentNode.nodeValue||'').trim();
      if (/^(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/.test(v)) nodes++;
    }
  } catch {}
  return Math.max(lines,nodes);
}

// v0.1.139: Current Alfalfalfa pages may render reply numbers as standalone
// lines ("2", "3", ...) instead of "2：" or .res_block wrappers.
function alfalfalfaLooseReplyCount(el) {
  if (!el) return 0;
  const nums=new Set();
  const add=(raw)=>{
    const v=String(raw||'').replace(/\s+/g,' ').trim();
    if(!/^\d{1,5}$/.test(v))return;
    const n=Number(v);
    if(n>=1 && n<=99999)nums.add(n);
  };
  const t=String(el.innerText || el.textContent || '').replace(/\r/g,'\n');
  for(const line of t.split(/\n+/)) add(line);
  try {
    for(const node of el.querySelectorAll('p,div,span,li,dd,dt')) {
      if(node.closest('#ld_blog_article_comment_entries,#comment,#comments,.comment-list,.comments,.site-feedback-section'))continue;
      if(node.querySelector('img,picture,iframe,video,table,blockquote'))continue;
      const txt=String(node.textContent||'').replace(/\s+/g,' ').trim();
      if(txt.length<=8)add(txt);
    }
  } catch {}
  return nums.size;
}

function alfalfalfaReplySignalCount(el) {
  return Math.max(simpleReplyCount(el), alfalfalfaLooseReplyCount(el));
}

function replySignalCount(el) {
  return Math.max(threadHeaderCount(el), simpleReplyCount(el));
}


function isWorldFusigiUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='world-fusigi.net';
  } catch { return false; }
}

function markRequiredReplyMedia(node, force=false) {
  if (!node) return;
  const imgs=[...node.querySelectorAll?.('img')||[]];
  const requiredImgs=imgs.filter(img=>!isClearlyNonRequiredImage(img));
  const links=[...node.querySelectorAll?.('a[href]')||[]];
  const text=cleanText(node.textContent||'');
  const imageLink=links.some(a=>{
    const h=String(a.getAttribute('href')||'');
    return /\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(h) || /(?:^|\.)imgur\.com\//i.test(h);
  });
  const directVideoLink=links.some(a=>/\.(?:mp4|webm|m4v)(?:$|[?#])/i.test(String(a.getAttribute('href')||'')) || /video\.twimg\.com\//i.test(String(a.getAttribute('href')||'')));
  const xPost=links.some(a=>/(?:x\.com|twitter\.com)\/[^/\s]+\/status\/\d+/i.test(String(a.getAttribute('href')||''))) || !!node.querySelector?.('blockquote.twitter-tweet,iframe[src*="twitter.com/"],iframe[src*="x.com/"]');
  const youtube=links.some(a=>/(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(String(a.getAttribute('href')||''))) || !!node.querySelector?.('iframe[src*="youtube.com/"],iframe[src*="youtube-nocookie.com/"]');
  const instagram=!!node.querySelector?.('blockquote.instagram-media[data-instgrm-permalink],iframe[src*="instagram.com/"],[data-instagram-post-url]');
  const nativeVideo=!!node.querySelector?.('video,source');
  // Reply #1 is semantic content: if its meaning is carried by any media, the
  // completed snapshot must not silently publish a text-only version.
  const required=force || (text.length < 160 && (requiredImgs.length>0 || imageLink || directVideoLink || xPost || youtube || instagram || nativeVideo));
  if (!required) return;
  node.dataset.requiredReply='1';
  for (const img of requiredImgs) img.dataset.requiredMedia='1';
  for (const el of node.querySelectorAll?.('video,source,iframe,blockquote,[data-instagram-post-url],[data-imgur-preserve]')||[]) el.dataset.requiredMedia='1';
  for (const a of links) {
    const h=String(a.getAttribute('href')||'');
    if (/\.(?:jpe?g|png|gif|webp|avif|mp4|webm|m4v)(?:$|[?#])/i.test(h) || /video\.twimg\.com\//i.test(h) || /(?:^|\.)imgur\.com\//i.test(h) || /(?:x\.com|twitter\.com)\/[^/\s]+\/status\/\d+/i.test(h) || /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(h)) a.dataset.requiredMedia='1';
  }
}
// Backward-compatible name for older site-specific callers.
const markRequiredReplyImages = markRequiredReplyMedia;

function cloneLeadImageWithLink(img) {
  if (!img) return null;
  const a=img.closest?.('a[href]');
  let clone=null;
  if (a && a.querySelectorAll('img').length===1 && cleanText(a.textContent||'').length<80) {
    clone=a.cloneNode(true);
  } else clone=img.cloneNode(true);
  const target=clone.matches?.('img') ? clone : clone.querySelector?.('img');
  if (target) {
    target.dataset.requiredMedia='1';
    target.classList?.add('article-required-lead-image');
    target.loading='eager';
  }
  return clone;
}

function likelyArticleImage(img) {
  if (!img) return false;
  const a=img.closest?.('a[href]');
  const wrap=img.closest?.('figure,p,li,td,div')||img;
  const meta=`${img.getAttribute('src')||''} ${img.getAttribute('data-src')||''} ${img.getAttribute('data-original')||''} ${img.alt||''} ${img.title||''} ${a?.getAttribute('href')||''} ${wrap.id||''} ${wrap.className||''}`;
  if (/(?:logo|avatar|icon|emoji|button|banner|ranking|amazon|rakuten|affiliate|sponsor|advert|pixel|tracking|noimage|placeholder)/i.test(meta)) return false;
  const {w,h}=declaredImageSize(img);
  return !((w&&w<120)||(h&&h<80));
}

function makeKonoyubiReplyBlockBundle(doc, title='') {
  if (!doc?.body) return null;
  let articleScope=null;
  if (title) {
    for (const el of doc.querySelectorAll("h1,h2,h3,.article-title,.entry-title,.post-title")) {
      const t=cleanText(el.textContent||'');
      if (t && sameTitle(t,title)) {
        articleScope=el.closest?.('.article-outer.hentry,article,.hentry,.article-outer,.entry,.post');
        break;
      }
    }
  }
  // Do not depend on one exact livedoor wrapper.  Older/newer Konoyubi articles
  // place res1 and res2+ on different sides of article-body-more.
  const searchRoot=(articleScope && articleScope.querySelector('.resHtml[id]')) ? articleScope : doc;
  const replies=[...searchRoot.querySelectorAll('.resHtml[id]')].filter(el=>{
    if(!/^res\d+$/i.test(el.id||''))return false;
    const body=el.querySelector('.resBody,.resContents') || el;
    const text=cleanText(body.textContent||'');
    const media=body.querySelectorAll?.('img,picture,video,iframe,blockquote')?.length||0;
    return text.length>0 || media>0;
  });
  if (!replies.length) return null;
  const wrap=doc.createElement('div');
  wrap.dataset.konoyubiReplies='1';
  replies.forEach((reply,index)=>{
    const clone=reply.cloneNode(true);
    const body=clone.querySelector('.resBody') || clone.querySelector('.resContents') || clone;
    markRequiredReplyImages(body,index===0);
    wrap.appendChild(clone);
  });
  return wrap;
}

function findLivedoorThreadScope(doc,title='') {
  if (!doc?.body) return null;
  let article=null;
  if (title) {
    for (const h of doc.querySelectorAll('h1,h2,h3,.article-title,.entry-title,.post-title')) {
      if (sameTitle(cleanText(h.textContent||''),title)) {
        article=h.closest?.('.recent-article-outer,.article-outer.hentry,.article-outer,article,.hentry,.entry,.post');
        if(article)break;
      }
    }
  }
  const selectors=['.article-body > .article-body-inner','.article-body-inner','.article-body.entry-content','.article-body'];
  for (const sel of selectors) {
    const scoped=article?.querySelector?.(sel);
    if(scoped?.querySelector?.('.t_h'))return scoped;
  }
  for (const sel of selectors) {
    for (const scoped of doc.querySelectorAll(sel)) if(scoped.querySelector('.t_h'))return scoped;
  }
  return null;
}

function makeLivedoorThreadPairBundle(doc,title='',kind='thread') {
  const scope=findLivedoorThreadScope(doc,title);
  if(!scope)return null;
  const sequence=[...scope.querySelectorAll('.t_h,.t_b')];
  const firstHeader=sequence.find(el=>el.classList?.contains('t_h'));
  if(!firstHeader)return null;
  const wrap=doc.createElement('div');
  wrap.dataset.livedoorThreadBundle=kind;
  // Keep the first substantial article image before reply #1.  This is often the
  // picture the thread title/reply #1 is referring to and is therefore required.
  const lead=[...scope.querySelectorAll('img')].find(img=>
    (img.compareDocumentPosition(firstHeader)&Node.DOCUMENT_POSITION_FOLLOWING) && likelyArticleImage(img));
  if(lead){const c=cloneLeadImageWithLink(lead);if(c)wrap.appendChild(c);}
  let pairIndex=0;
  for(let i=0;i<sequence.length;i++){
    const h=sequence[i];
    if(!h.classList?.contains('t_h'))continue;
    let body=null;
    for(let j=i+1;j<sequence.length;j++){
      if(sequence[j].classList?.contains('t_h'))break;
      if(sequence[j].classList?.contains('t_b')){body=sequence[j];break;}
    }
    if(!body)continue;
    const hc=h.cloneNode(true), bc=body.cloneNode(true);
    markRequiredReplyImages(bc,pairIndex===0);
    wrap.appendChild(hc);wrap.appendChild(bc);pairIndex++;
  }
  return pairIndex ? wrap : null;
}

function makeUshi32BodyBundle(doc, title='') {
  return makeLivedoorThreadPairBundle(doc,title,'ushi32');
}

function makeWorldFusigiBodyBundle(doc, title='') {
  return makeLivedoorThreadPairBundle(doc,title,'world-fusigi');
}

function makeKonoyubiReplyRangeBundle(doc, title='') {
  if (!doc?.body) return null;
  let titleNode=null;
  if (title) {
    for (const el of doc.querySelectorAll("h1,h2,h3,.article-title,.entry-title,.post-title")) {
      const t=cleanText(el.textContent||'');
      if (t && sameTitle(t,title)) { titleNode=el; break; }
    }
  }
  const scope=titleNode?.closest?.("article,.hentry,.article-outer,.entry,.entry-outer,.post,.post-outer,.article-wrapper,.entry-wrapper") ||
    doc.querySelector("[itemprop='articleBody']")?.closest?.("article,.hentry,.article-outer,.entry,.post") ||
    doc.querySelector("#main") || doc.querySelector("main") || doc.body;
  const afterTitle = el => !titleNode || !!(titleNode.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const leaves=[...scope.querySelectorAll("p,div,section,li,td,dd,blockquote,span")].filter(el=>{
    if(!afterTitle(el))return false;
    const t=cleanText(el.textContent||'');
    if(!/^(?:>>\s*)?\d{1,5}\s*[：:](?!\d)/.test(t))return false;
    return ![...el.children].some(ch=>/^(?:>>\s*)?\d{1,5}\s*[：:](?!\d)/.test(cleanText(ch.textContent||'')));
  });
  if(!leaves.length)return null;
  let first=leaves.find(el=>/^\s*1\s*[：:](?!\d)/.test(cleanText(el.textContent||''))) || leaves[0];
  const stopRe=/^(?:この記事のタグ|この記事の関連タグ|タグ\s*[：:]|Comment\b|コメント(?:一覧|する)?|コメントフォーム)/i;
  let stop=null;
  for(const el of scope.querySelectorAll("h1,h2,h3,h4,h5,p,div,section,dt,dd,span,strong,b")){
    if(!(first.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
    const t=cleanText(el.textContent||'');
    if(!t||t.length>120||!stopRe.test(t))continue;
    if([...el.children].some(ch=>stopRe.test(cleanText(ch.textContent||''))))continue;
    stop=el;break;
  }
  try{
    const range=doc.createRange();
    range.setStartBefore(first);
    if(stop)range.setEndBefore(stop); else range.setEnd(scope,scope.childNodes.length);
    const wrap=doc.createElement('div');
    wrap.setAttribute('data-konoyubi-range','1');
    wrap.appendChild(range.cloneContents());
    const replies=simpleReplyCount(wrap), text=cleanText(wrap.textContent||'');
    const media=wrap.querySelectorAll('img,picture,video,iframe,blockquote,pre').length;
    if(replies>=1 && (text.length>=30 || media>=1))return wrap;
  }catch{}
  return null;
}

function pickKonoyubiArticleRoot(doc, title='') {
  if (!doc) return null;
  const blockBundle=makeKonoyubiReplyBlockBundle(doc,title);
  if(blockBundle)return blockBundle;
  const rangeBundle=makeKonoyubiReplyRangeBundle(doc,title);
  if(rangeBundle)return rangeBundle;
  const preferredSel = [
    "[itemprop='articleBody']", ".article-body", ".entry-content", ".entry-body",
    ".article-content", ".articleBody", ".article_body",
    ".article-body-inner", "#article-body-inner", ".article-body-more", "#article-body-more"
  ].join(',');

  let titleNode = null;
  if (title) {
    for (const el of doc.querySelectorAll("h1,h2,h3,.article-title,.entry-title,.post-title,a[href]")) {
      const t = cleanText(el.textContent || '');
      if (t && sameTitle(t, title)) { titleNode = el; break; }
    }
  }

  const scopes=[];
  const pushScope = el => { if (el && !scopes.includes(el)) scopes.push(el); };
  pushScope(titleNode?.closest?.("article,.hentry,.article-outer,.entry,.entry-outer,.post,.post-outer,.article-wrapper,.entry-wrapper"));
  if (titleNode) {
    let cur=titleNode.parentElement;
    for (let depth=0; cur && cur!==doc.body && depth<8; depth++,cur=cur.parentElement) {
      const replies=simpleReplyCount(cur);
      const body=cur.querySelector?.(preferredSel);
      if (replies>=1 || body) { pushScope(cur); if (replies>=2) break; }
    }
  }
  pushScope(doc.querySelector('#main'));
  pushScope(doc.querySelector('main'));
  pushScope(doc.body);

  const score = el => {
    if (!el) return -Infinity;
    const text=cleanText(el.textContent||'');
    if (text.length<10 || text.length>120000) return -Infinity;
    const replies=simpleReplyCount(el);
    const dated=threadHeaderCount(el);
    const media=el.querySelectorAll?.('img,picture,video,iframe,blockquote,pre,table')?.length||0;
    const links=el.querySelectorAll?.('a[href]')?.length||0;
    const key=`${el.id||''} ${el.className||''}`.toLowerCase();
    let v=replies*9000 + dated*2500 + Math.min(text.length,22000) + Math.min(media,20)*180 - Math.max(0,links-8)*22;
    if (/(article|entry|post|body|content|main)/.test(key)) v+=2200;
    if (/(side|menu|nav|footer|header|comment|rank|related|recommend|pickup|archive|widget|rss|antenna)/.test(key)) v-=7000;
    if (/(?:今週の人気記事|記事検索|Amazon売れ筋アイテム|livedoor\s*Blog|最新記事)/i.test(text) && replies===0) v-=18000;
    if (title && sameTitle(cleanText(el.querySelector?.('h1,h2,h3,.article-title,.entry-title,.post-title')?.textContent||''), title)) v+=5000;
    return v;
  };

  let best=null,bestScore=-Infinity;
  for (const scope of scopes) {
    if (!scope) continue;
    const preferred=[...scope.querySelectorAll(preferredSel)];
    const topPreferred=preferred.filter(el=>!preferred.some(other=>other!==el && other.contains(el)));
    for (const el of topPreferred) {
      const v=score(el);
      if (v>bestScore) { best=el; bestScore=v; }
    }
    for (const el of scope.querySelectorAll('article,section,div,td')) {
      if (simpleReplyCount(el)<1) continue;
      if ([...el.children].some(ch=>simpleReplyCount(ch)>=2 && cleanText(ch.textContent||'').length>=40)) continue;
      const v=score(el);
      if (v>bestScore) { best=el; bestScore=v; }
    }
    if (best && simpleReplyCount(best)>=2) break;
  }
  return best;
}

// v0.1.111: compact metadata class is also attached during extraction when a full
// reply header is already present in one element. ready_viewer.js additionally
// handles legacy caches and split sibling DOM at display time.
function tagCompactReplyMeta(root){
  if(!root)return 0;
  const re=/^\s*(\d{1,5})\s*(?:[：:]\s*)?(?:名前[：:]\s*)?(.{0,90}?)\s*(?:投稿日[：:]?\s*)?(20\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?)\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)?(?:\s*ID[：:]\s*([A-Za-z0-9+_./-]{2,40}))?\s*$/;
  let n=0;
  for(const el of [...root.querySelectorAll('p,li,dd,dt,div,span')]){
    if(el.closest('script,style,pre,code,.reply-meta,.site-feedback-card')||el.querySelector('img,video,iframe,table,pre,blockquote'))continue;
    const t=String(el.textContent||'').replace(/\s+/g,' ').trim(); if(!t||t.length>240)continue;
    const m=t.match(re); if(!m)continue;
    if([...el.children].some(ch=>re.test(String(ch.textContent||'').replace(/\s+/g,' ').trim())))continue;
    el.classList.add('reply-meta');
    el.textContent=[`${m[1]}:`,String(m[2]||'').replace(/^名前[：:]\s*/,''),m[3],m[4]||'',m[5]?`ID:${m[5]}`:''].filter(Boolean).join(' ');
    n++;
  }
  return n;
}

function stripAlfalfalfaRelatedBlock(root){
  if(!root)return 0;
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const relatedRe=/^関連記事(?:一覧)?\s*[：:]?$/i;
  const cardSel='a,li,ul,ol,figure,nav,aside,[class*="related"],[id*="related"],[class*="recommend"],[id*="recommend"],[class*="ranking"],[id*="ranking"]';
  const isBoundary=node=>{
    if(!node)return false;
    if(node.nodeType===Node.TEXT_NODE){
      const t=String(node.nodeValue||'').replace(/\u00a0/g,' ').trim();
      if(!/^\d{1,5}$/.test(t))return false;
      if(node.parentElement?.closest?.(cardSel))return false;
      return true;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return false;
    if(node.closest?.(cardSel))return false;
    const t=clean(node.textContent||'');
    if(!/^\d{1,5}\s*(?:[：:](?!\d)|$)/.test(t) || /^(?:20\d{2})\b/.test(t))return false;
    if(node.querySelector?.('a,img,video,iframe'))return false;
    return ![...node.children||[]].some(ch=>/^\d{1,5}\s*(?:[：:](?!\d)|$)/.test(clean(ch.textContent||'')));
  };
  const doc=root.ownerDocument||document;
  const markers=[];
  const mw=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);let m;
  while((m=mw.nextNode())){
    if(!relatedRe.test(clean(m.nodeValue)))continue;
    let start=m,p=m.parentElement;
    while(p&&p!==root&&relatedRe.test(clean(p.textContent))&&!p.querySelector('a,img,video,iframe')){start=p;p=p.parentElement;}
    if(!markers.some(x=>x===start||(x.contains&&x.contains(start))))markers.push(start);
  }
  for(const el of [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b')]){
    if(!relatedRe.test(clean(el.textContent))||el.querySelector('a,img,video,iframe'))continue;
    if(markers.some(x=>x===el||(x.contains&&x.contains(el))||(el.contains&&el.contains(x))))continue;
    markers.push(el);
  }
  let removed=0;
  for(const marker of markers){
    // v0.1.146: makeAlfalfalfaBodyBundle() runs this on a detached cloned root.
    // isConnected is false there even though the marker is valid inside `root`.
    if(!marker || (marker!==root && !root.contains(marker)))continue;
    const walker=doc.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let n,next=null;
    while((n=walker.nextNode())){
      if(n===marker||(marker.contains&&marker.contains(n)))continue;
      let follows=false;try{follows=!!(marker.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING);}catch{}
      if(follows&&isBoundary(n)){next=n;break;}
    }
    if(next){try{const r=doc.createRange();r.setStartBefore(marker);r.setEndBefore(next);r.deleteContents();removed++;continue;}catch{}}
    const el=marker.nodeType===Node.ELEMENT_NODE?marker:marker.parentElement;
    const local=el?.closest?.('ul,ol,section,aside,[class*="related"],[id*="related"],[class*="recommend"],[id*="recommend"]')||el||marker;
    if(local?.remove){local.remove();removed++;}
  }
  return removed;
}

function makeAlfalfalfaBodyBundle(doc, title='') {
  if (!doc?.body) return null;
  // v0.1.139: some current Alfalfalfa articles keep only the first reply in
  // .res_block while later replies are plain numbered lines in article_bodymore.
  // Compare the precise bundle with the source body and use the wide body when
  // the .res_block bundle is clearly incomplete.
  const scopes=[];
  if (title) {
    for (const h of doc.querySelectorAll('h1,h2,h3,.article-title,.entry-title')) {
      if (!sameTitle(cleanText(h.textContent||''), title)) continue;
      const inner=h.closest('.main_article_contents_inner') || h.closest('article,.article,.article-outer,.entry,.hentry,#article');
      if (inner && !scopes.includes(inner)) scopes.push(inner);
    }
  }
  for (const inner of doc.querySelectorAll('.main_article_contents_inner')) if(!scopes.includes(inner)) scopes.push(inner);
  for (const a of doc.querySelectorAll('article,.article,.article-outer,.entry,.hentry,#article')) if(!scopes.includes(a)) scopes.push(a);
  scopes.push(doc.body);

  let best=null,bestScore=-1,bestMeta=null;
  const noiseSel='#related-title,#mainmore,.manual-related,.article_bodyfooter,#ad_rs,#ad2,.in_ads_sec,#affiliate-box,#mercari-box,#DLsite_blog_parts_000,.next-article-after-body,.social-list,[class*="recommend"],[class*="ranking"]';
  for (const scope of scopes) {
    const parts=[...scope.querySelectorAll('.article_body,.article_bodymore')]
      .filter(el=>!el.closest('#ld_blog_article_comment_entries,#comment,#comments,.comment-list,.comments'));
    if(!parts.length) continue;
    const groups=new Map();
    for(const el of parts){
      const owner=el.closest('.main_article_contents_inner,article,.article,.article-outer,.entry,.hentry,#article')||scope;
      if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(el);
    }
    for(const group of groups.values()){
      const ordered=group.filter((el,i,a)=>a.indexOf(el)===i)
        .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING?1:-1);
      const wide=doc.createElement('div');
      for(const part of ordered)wide.appendChild(part.cloneNode(true));
      for(const bad of [...wide.querySelectorAll(`${noiseSel},#ld_blog_article_comment_entries,#comment,#comments,.comment-list,.comments,.site-feedback-section`)])bad.remove();
      // v0.1.144: remove the in-body related-article module before reply scoring/caching.
      stripAlfalfalfaRelatedBlock(wide);
      const sourceReplies=alfalfalfaReplySignalCount(wide);

      const nodes=[];
      for(const part of ordered){
        if(part.matches('.article_body')){
          for(const eye of part.querySelectorAll(':scope > .eye-catch')) nodes.push(eye);
        }
        let replies=[...part.querySelectorAll(':scope > .res_block')];
        if(!replies.length) replies=[...part.querySelectorAll('.res_block')].filter(el=>!el.closest(noiseSel));
        nodes.push(...replies);
      }
      const uniq=nodes.filter((el,i,a)=>a.indexOf(el)===i)
        .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING?1:-1);
      const bundleReplies=uniq.filter(el=>el.matches?.('.res_block')).length;
      const needWide=sourceReplies>=3 && bundleReplies<Math.min(3,sourceReplies);
      let candidate,mode,replyCount;
      if(needWide){
        candidate=wide; mode='wide'; replyCount=sourceReplies;
      }else{
        if(!bundleReplies)continue;
        candidate=doc.createElement('div');
        for(const el of uniq)candidate.appendChild(el.cloneNode(true));
        mode='bundle'; replyCount=Math.max(bundleReplies,alfalfalfaReplySignalCount(candidate));
      }
      const text=cleanText(candidate.textContent||'').length;
      const media=candidate.querySelectorAll?.('img,picture,iframe,video,blockquote').length||0;
      const score=replyCount*100000+Math.min(text,50000)+Math.min(media,30)*200+(mode==='wide'?500:0);
      if(replyCount && score>bestScore){bestScore=score;best=candidate;bestMeta={mode,source:sourceReplies,bundle:bundleReplies};}
    }
    if(best && bestMeta?.source>=3 && bestScore>=300000) break;
  }
  if(!best) return null;
  const wrap=doc.createElement('div');
  wrap.dataset.alfalfalfaBodyBundle='1';
  wrap.dataset.alfalfalfaBodyMode=String(bestMeta?.mode||'bundle');
  wrap.dataset.alfalfalfaBodySource=String(bestMeta?.source||0);
  wrap.dataset.alfalfalfaBodyBundleReplies=String(bestMeta?.bundle||0);
  wrap.append(...[...best.childNodes].map(n=>n.cloneNode(true)));
  return wrap;
}

function pickAlfalfalfaArticleRoot(doc, title='') {
  // Alfalfalfa replies normally have "1： / 2：" markers without per-reply timestamps,
  // so the generic dated-thread detector under-scores the real body. Score numbered replies directly.
  const candidates=[];
  const seen=new Set();
  for (const el of doc.querySelectorAll("[itemprop='articleBody'],article,main,.article-body,.entry-content,.article-content,.post-body,section,div")) {
    if (seen.has(el)) continue; seen.add(el);
    const replies=alfalfalfaReplySignalCount(el);
    const text=cleanText(el.textContent||'');
    const media=el.querySelectorAll('img,picture,iframe,video,blockquote').length;
    if (replies<2 && !(replies>=1 && media>=1)) continue;
    if (text.length<30 || text.length>80000) continue;
    const key=`${el.id||''} ${el.className||''}`.toLowerCase();
    let score=replies*7000 + Math.min(text.length,18000) + Math.min(media,20)*220;
    if (/(article|entry|post|body|content|main)/.test(key)) score+=2200;
    if (/(side|menu|nav|footer|header|comment|rank|related|recommend|pickup|archive|widget|rss|antenna)/.test(key)) score-=12000;
    const links=el.querySelectorAll('a[href]').length;
    if (links>Math.max(12,replies*3) && text.length/Math.max(1,links)<90) score-=8000;
    if (title && sameTitle(cleanText(el.querySelector('h1,h2,h3')?.textContent||''), title)) score+=1800;
    candidates.push({el,score,replies,len:text.length});
  }
  candidates.sort((a,b)=>b.score-a.score || b.replies-a.replies || a.len-b.len);
  return candidates[0]?.el || null;
}

function isVipperOreUrl(url) {
  try {
    const u=new URL(url);
    const host=u.hostname.toLowerCase();
    return host==='news23vip.livedoor.blog' ||
      (host==='blog.livedoor.jp' && /\/news23vip\//i.test(u.pathname));
  } catch {
    return false;
  }
}


function isItaiNewsUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='itainews.com' || h.endsWith('.itainews.com');
  } catch { return false; }
}

function isEsuteruUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='blog.esuteru.com' || h==='esuteru.com';
  } catch { return false; }
}

function isGossip1Url(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='gossip1.net' || h.endsWith('.gossip1.net');
  } catch { return false; }
}

function isNegisokuUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='negisoku.com' || h.endsWith('.negisoku.com');
  } catch { return false; }
}

function isFesokuUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='fesoku.net' || h.endsWith('.fesoku.net');
  } catch { return false; }
}

function isNanjPrideUrl(url) {
  try {
    const u=new URL(url); const h=u.hostname.toLowerCase().replace(/^www\./,'');
    return h==='nanjpride.blog.jp' || h==='rock1963roll.livedoor.blog' ||
      (h==='blog.livedoor.jp' && /\/rock1963roll\//i.test(u.pathname));
  } catch { return false; }
}


function isAllJungleUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='crx7601.com' || h.endsWith('.crx7601.com');
  } catch { return false; }
}

function isKinisokuUrl(url) {
  try {
    const u=new URL(url); const h=u.hostname.toLowerCase().replace(/^www\./,'');
    return h==='kinisoku.com' || h.endsWith('.kinisoku.com') ||
      (h==='blog.livedoor.jp' && /\/kinisoku\//i.test(u.pathname));
  } catch { return false; }
}

function isHamusokuUrl(url) {
  try {
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return h==='hamusoku.com' || h.endsWith('.hamusoku.com');
  } catch { return false; }
}

function siteCommentNumber(text='') {
  const t=String(text||'').replace(/\s+/g,' ').trim();
  let m=t.match(/^(\d{1,5})\s*(?:[.)．]|[：:])/);
  if(!m) m=t.match(/^(\d{1,5})\s+名前\s*[：:]/);
  return m ? Number(m[1]) : null;
}

const SITE_COMMENT_NOISE_SELECTOR = [
  '.comment-reaction','.comment-like','.comment-like-count','.comment-rating','.comment-evaluation',
  '.comment-vote','.comment-votes','.comment-share','.comment-avatar','.comment-icon','.comment-tools',
  '.comment-reply-button','.comment-reply-form','.comment-control','.comment-controls',
  '[id^="comment-like-"]','[id^="comment_like_"]','[data-comment-like]',
  '[class*="comment-reaction"]','[class*="comment_like"]','[class*="comment-like"]',
  '[class*="reaction-user"]','[class*="reaction-list"]','[class*="reaction-count"]',
  '[class*="liked-user"]','[class*="liked_by"]','[class*="liked-by"]'
].join(',');

const SITE_COMMENT_META_SELECTOR = [
  '.comment-number','.comment-no','.comment-num','.comment-author','.comment-name','.comment-user',
  '.comment-date','.comment-time','.comment-id','.comment__author','.comment__name','.comment__date',
  '.comment__time','.comment__id','.article__comment-author','.article__comment-date',
  '.article__comment-id','.article-comment-author','.article-comment-date','.article-comment-id',
  '[class*="comment-author"]','[class*="comment_date"]','[class*="comment-date"]',
  '[class*="comment-id"]','time'
].join(',');

function siteCommentBodyElement(item) {
  if(!item?.querySelector) return null;
  // コメント本文だけを取る。Livedoor/Seesaa/独自テンプレートの表記揺れを広めに吸収する。
  const direct=':scope > .comment-body,:scope > .comment_body,:scope > .comment-text,:scope > .comment_text,:scope > .comment-content,:scope > .comment_content,:scope > .comment-message,:scope > .comment_message,:scope > .comment__body,:scope > .comment__text,:scope > .article__comment-body,:scope > .article-comment-body,:scope > [itemprop="commentText"]';
  const deep='.comment-body,.comment_body,.comment-text,.comment_text,.comment-content,.comment_content,.comment-message,.comment_message,.comment__body,.comment__text,.article__comment-body,.article-comment-body,[itemprop="commentText"],[class*="comment-body"],[class*="comment_body"],[class*="comment-text"],[class*="comment_text"],[class*="comment-content"],[class*="comment_content"]';
  return item.querySelector(direct) || item.querySelector(deep);
}

function cleanSiteCommentClone(el, base='', wholeItem=false) {
  if(!el) return null;
  const clone=el.cloneNode(true);
  // Nested replies are emitted as their own cards; never duplicate them inside the parent.
  for(const nested of [...clone.querySelectorAll('li.comment-set,[id^="comment-"]')]) {
    if(/^comment[-_]\d+$/i.test(nested.id||'') || nested.matches?.('li.comment-set')) nested.remove();
  }
  for(const bad of [...clone.querySelectorAll(`${SITE_COMMENT_NOISE_SELECTOR},script,style,noscript,form,input,textarea,button,select,option,iframe,object,embed,canvas,svg,img,picture,video,audio,source`)]) bad.remove();
  if(wholeItem){
    for(const bad of [...clone.querySelectorAll(SITE_COMMENT_META_SELECTOR)]) bad.remove();
  }
  for(const node of [clone,...clone.querySelectorAll('*')]) {
    for(const attr of [...node.attributes||[]]) {
      const n=attr.name.toLowerCase();
      if(n.startsWith('on') || ['style','class','id','width','height','srcset','sizes'].includes(n)) node.removeAttribute(attr.name);
    }
    if(node.tagName==='A') {
      const href=absUrl(node.getAttribute('href')||'',base);
      if(href) node.setAttribute('href',href); else node.removeAttribute('href');
      node.setAttribute('target','_self'); node.setAttribute('rel','noopener');
    }
  }
  return clone;
}

function siteCommentPlainTextFromClone(clone, aggressiveUiCleanup=false){
  if(!clone)return '';
  // Preserve source comment line breaks even though the clone itself is detached from layout.
  for(const br of [...clone.querySelectorAll?.('br')||[]])br.replaceWith(clone.ownerDocument.createTextNode('\n'));
  for(const el of [...clone.querySelectorAll?.('p,div,blockquote')||[]]){
    if(el.nextSibling)el.appendChild(clone.ownerDocument.createTextNode('\n'));
  }
  let raw=String(clone.textContent||'').replace(/\r/g,'\n');
  let lines=raw.split(/\n+/).map(x=>x.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim()).filter(Boolean);
  if(aggressiveUiCleanup){
    const drop=new Set();
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(/^\d{1,4}$/.test(line) || /^(?:liked|いいね|高評価|低評価)$/i.test(line) || /^(?:返信|Reply|コメントに返信)$/i.test(line))drop.add(i);
      if(/^(?:.+?)\s*が\s*(?:liked|いいね)\s*しました[。.]?$/i.test(line))drop.add(i);
      if(/^が\s*(?:liked|いいね)\s*しました[。.]?$/i.test(line)){
        drop.add(i);
        if(i>0 && lines[i-1].length<=80)drop.add(i-1); // reaction user name such as pinokio
      }
    }
    lines=lines.filter((_,i)=>!drop.has(i));
  }
  return cleanText(lines.join('\n'));
}

function siteCommentBodyText(item, baseUrl=''){
  const bodyEl=siteCommentBodyElement(item);
  if(bodyEl){
    const cleaned=cleanSiteCommentClone(bodyEl,baseUrl,false);
    const text=siteCommentPlainTextFromClone(cleaned,false);
    if(text)return {text, bodyEl};
  }
  // Fallback: strip metadata/reactions from the whole comment and keep only semantic text.
  const cleaned=cleanSiteCommentClone(item,baseUrl,true);
  let text=siteCommentPlainTextFromClone(cleaned,true);
  // Remove an accidental leading reply number/date/id if a custom template kept it in plain text.
  text=text.replace(/^\s*\d{1,5}\s*[.)．：:]?\s*/,'')
    .replace(/^\s*(?:20)?\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}(?::\d{2})?\s*/,'')
    .replace(/^\s*ID\s*[：:]\s*\S+\s*/i,'').trim();
  return {text, bodyEl:null};
}

function commentDirectText(item, selectors){
  for(const sel of selectors){
    for(const el of item.querySelectorAll?.(sel)||[]){
      if(el!==item && el.closest?.('li.comment-set,[id^="comment-"]') && el.closest('li.comment-set,[id^="comment-"]')!==item)continue;
      const t=cleanText(el.textContent||'');if(t)return t;
    }
  }
  return '';
}

function siteCommentFields(item, bodyText=''){
  let n=null;
  const idAttr=String(item?.id||'');
  let m=idAttr.match(/^comment[-_](\d{1,6})$/i);
  if(m)n=Number(m[1]);
  if(n==null){
    for(const k of ['data-comment-no','data-comment-num','data-comment-number']){
      const v=item?.getAttribute?.(k);if(v&&/^\d{1,6}$/.test(v)){n=Number(v);break;}
    }
  }
  const authorRaw=commentDirectText(item,['.comment-author','.comment-name','.comment-user','.comment__author','.comment__name','.article__comment-author','.article-comment-author']);
  if(n==null)n=siteCommentNumber(authorRaw||cleanText(item?.textContent||''));
  let author=authorRaw.replace(/^\s*\d{1,6}\s*[.)．：:]?\s*/,'').trim();
  let date='';
  for(const sel of ['.comment-date','.comment-time','.comment__date','.comment__time','.article__comment-date','.article-comment-date','time']){
    const el=item?.querySelector?.(sel);if(!el)continue;
    const c=el.cloneNode(true);
    for(const idEl of [...c.querySelectorAll?.('.comment-id,.comment__id,.article__comment-id,.article-comment-id')||[]])idEl.remove();
    date=cleanText(c.textContent||'').replace(/\s+/g,' ').trim();if(date)break;
  }
  const cid=commentDirectText(item,['.comment-id','.comment__id','.article__comment-id','.article-comment-id'])
    .replace(/^\s*ID\s*[：:]\s*/i,'').trim();
  let reply='';
  for(const a of item?.querySelectorAll?.('a[href]')||[]){
    const t=cleanText(a.textContent||'');if(/^>>\s*(?:r)?\d+/i.test(t)){reply=t.replace(/^>>r/i,'>>');break;}
  }
  if(author && /^(?:名無し(?:さん|ちゃん)?|名無しさん(?:＠[^\s]+)?|匿名)$/i.test(author))author='';
  return {n,author,date,cid,reply,bodyText};
}

function siteCommentMetaText(item, bodyText='') {
  const f=siteCommentFields(item,bodyText);
  const parts=[];
  if(f.n!=null)parts.push(`${f.n}.`);
  if(f.author)parts.push(f.author);
  if(f.date)parts.push(f.date);
  if(f.cid)parts.push(`ID:${f.cid}`);
  if(f.reply)parts.push(f.reply);
  return cleanText(parts.join(' ')).slice(0,300);
}

function expectedSiteCommentCount(doc){
  let best=0;
  for(const el of doc?.querySelectorAll?.('h1,h2,h3,h4,h5,h6,a,strong,b,div,span,p')||[]){
    const t=cleanText(el.textContent||'');if(!t||t.length>120)continue;
    let m=t.match(/(?:コメント(?:一覧)?(?:を見る)?|最新のコメントへ|Comment)\s*[（(]?\s*(\d{1,6})\s*[）)]?/i);
    if(!m)m=t.match(/^(\d{1,6})\s*コメント$/);
    if(m)best=Math.max(best,Number(m[1])||0);
  }
  return best;
}

function collectSiteCommentItems(root, doc, kind='generic'){
  const found=[];const seen=new Set();
  const add=el=>{if(!el||seen.has(el))return;seen.add(el);found.push(el);};
  // Alfalfalfa has a real Livedoor comment list. Do not use generic child <li> fallback there,
  // because recommendation/thumb lists near the comment area can otherwise become fake comments.
  const sels=kind==='alfalfalfa' ? [
    'li.comment-set','[id^="comment-"]','[id^="comment_"]'
  ] : [
    'li.comment-set','[id^="comment-"]','[id^="comment_"]',
    ':scope > li',':scope > article',':scope > .comment',':scope > .comment-item',':scope > .comment__item',
    ':scope > .article__comment',':scope > .article-comment',':scope > .comment-entry',':scope > .comment_entry',
    ':scope > dl.comment',':scope > div[class*="comment-item"]',':scope > div[class*="comment__item"]'
  ];
  for(const sel of sels){for(const el of root.querySelectorAll?.(sel)||[]){
    // Exclude reaction counters such as #comment-like-count-12.
    if((el.id||'') && /^comment[-_]/i.test(el.id) && !/^comment[-_]\d+$/i.test(el.id))continue;
    if(el.closest?.('form,.comment_form,#write_comment02,[id*="write_comment"],[class*="comment-form"]'))continue;
    add(el);
  }}
  // Last-resort for custom GOSSIP templates: accept compact comment-like boxes that expose
  // a dedicated body element plus date/ID metadata even when their class name is unfamiliar.
  if(found.length<2){
    for(const el of root.querySelectorAll?.('li,article,section,div,dl,dd,tr')||[]){
      const key=`${el.id||''} ${el.className||''}`.toLowerCase();
      if(!/comment|kome|res/.test(key))continue;
      const body=siteCommentBodyElement(el);if(!body)continue;
      const txt=cleanText(el.textContent||'');if(txt.length<2||txt.length>20000)continue;
      const hasMeta=!!el.querySelector?.(SITE_COMMENT_META_SELECTOR) || /(?:20)?\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}|ID\s*[:：]/i.test(txt);
      if(hasMeta)add(el);
    }
  }

  // GOSSIP/VIPPER may need a document-wide fallback. Alfalfalfa must stay inside its dedicated
  // comment container; document-wide scanning is what mixed related/recommendation cards into comments.
  if(kind==='gossip1'||kind==='vipperore'){
    for(const el of doc.querySelectorAll?.('li.comment-set,[id^="comment-"],[id^="comment_"]')||[]){
      if((el.id||'') && /^comment[-_]/i.test(el.id) && !/^comment[-_]\d+$/i.test(el.id))continue;
      if(el.closest?.('form,.comment_form,#write_comment02,[id*="write_comment"],[class*="comment-form"]'))continue;
      add(el);
    }
  }
  // Document order is the source order, including nested replies.
  found.sort((a,b)=>{
    if(a===b)return 0;const p=a.compareDocumentPosition?.(b)||0;
    return (p&Node.DOCUMENT_POSITION_FOLLOWING)?-1:(p&Node.DOCUMENT_POSITION_PRECEDING)?1:0;
  });
  return found;
}


function esuteruCommentRecordFromItem(item, baseUrl=''){
  if(!item)return null;
  const {text:bodyText}=siteCommentBodyText(item,baseUrl);
  if(!bodyText||bodyText.length>16000)return null;
  const f=siteCommentFields(item,bodyText),raw=cleanText(item.textContent||'');
  const date=f.date||(raw.match(/20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}/)?.[0]||'');
  if(f.n==null&&!date)return null;
  return {n:f.n,author:f.author||'',date,cid:f.cid||'',reply:f.reply||'',bodyText};
}
function esuteruSemanticCommentRecords(doc){
  const out=[],seen=new Set();
  const push=r=>{if(!r||!r.bodyText)return;const k=`${r.n??''}|${r.date||''}|${r.bodyText}`;if(seen.has(k))return;seen.add(k);out.push(r);};
  const roots=[];
  for(const sel of ['#comment','#comments','.comment-list','.comments','#ld_blog_article_comment_entries'])for(const el of doc.querySelectorAll?.(sel)||[])if(!roots.includes(el))roots.push(el);
  for(const r of roots)for(const item of collectSiteCommentItems(r,doc,'esuteru'))push(esuteruCommentRecordFromItem(item,doc.baseURI||''));
  const metaRe=/^\s*(\d{1,6})\.\s*(.*?)\s*(20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2})\s*$/;
  for(const h of [...doc.querySelectorAll?.('h2,h3,h4,h5,h6,strong,b')||[]]){
    const m=cleanText(h.textContent||'').match(metaRe);if(!m)continue;
    const pieces=[];let cur=h.nextElementSibling,guard=0;
    while(cur&&guard++<40){const t=cleanText(cur.textContent||'');if(cur.matches('h2,h3,h4,h5,h6')&&metaRe.test(t))break;if(cur.matches('form,nav,footer')||/^(?:コメントを書く|記事トップに戻る|最初へ|記事へ|次へ|前へ)$/i.test(t))break;if(t&&!/^(?:Image|hatima|liked|返信|good|bad|0)$/i.test(t))pieces.push(t);cur=cur.nextElementSibling;}
    let body=cleanText(pieces.join('\n'));
    if(!body&&h.parentElement){const c=h.parentElement.cloneNode(true);for(const bad of [...c.querySelectorAll('h1,h2,h3,h4,h5,h6,form,button,img,svg,.comment-reaction,.comment-like,.comment-rating')])bad.remove();body=siteCommentPlainTextFromClone(c,true);}
    if(body)push({n:Number(m[1]),author:cleanText(m[2]||''),date:m[3],cid:'',reply:'',bodyText:body});
  }
  return out;
}
function appendEsuteruSyntheticRecord(root,rec){
  const d=root.ownerDocument,item=d.createElement('div');item.className='comment-item esuteru-imported-comment';if(rec.n!=null)item.setAttribute('data-comment-number',String(rec.n));
  const meta=d.createElement('div');
  if(rec.n!=null){const n=d.createElement('span');n.className='comment-number';n.textContent=`${rec.n}.`;meta.appendChild(n);}if(rec.author){const a=d.createElement('span');a.className='comment-author';a.textContent=rec.author;meta.appendChild(a);}if(rec.date){const t=d.createElement('span');t.className='comment-date';t.textContent=rec.date;meta.appendChild(t);}if(rec.cid){const id=d.createElement('span');id.className='comment-id';id.textContent=`ID:${rec.cid}`;meta.appendChild(id);}
  const body=d.createElement('div');body.className='comment-body';body.textContent=rec.bodyText;item.append(meta,body);root.appendChild(item);
}
async function fetchEsuteruCommentDecoded(url,articleUrl=''){
  const rid=(globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g,'');
  const prox=`/api/proxy?url=${encodeURIComponent(String(url||''))}&rid=${encodeURIComponent(rid)}&force=1&referer=${encodeURIComponent(String(articleUrl||''))}`;
  const res=await fetch(prox,{cache:'no-store',credentials:'same-origin'});
  if(!res.ok){let detail='';try{detail=cleanText(await res.text())}catch{};throw new Error(`HTTP ${res.status}${detail?` ${detail.slice(0,220)}`:''}`);}
  const buffer=await res.arrayBuffer();
  return {text:decodeBuffer(buffer,res.headers.get('content-type')||''),finalUrl:res.headers.get('X-Upstream-URL')||url,cacheState:res.headers.get('X-RPi-Cache')||'',bytes:buffer.byteLength||0};
}
function esuteruLooseCommentRecords(doc){
  const out=[],seen=new Set();
  const push=(n,author,date,body)=>{body=cleanText(body||'').replace(/(?:^|\n)\s*(?:Image|hatima|liked|good|bad|返信|▼返信|\d+)\s*(?=\n|$)/gi,'\n').trim();if(!body)return;const k=`${n}|${date}|${body}`;if(seen.has(k))return;seen.add(k);out.push({n:Number(n),author:cleanText(author||''),date:cleanText(date||''),cid:'',reply:'',bodyText:body});};
  const text=(doc.body?.innerText||doc.body?.textContent||'').replace(/\r/g,'');
  const meta=/^\s*(\d{1,6})\.\s*(.*?)\s*(?:投稿日[:：]?\s*)?(20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2})\s*$/;
  const lines=text.split('\n');
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(meta);if(!m)continue;
    const body=[];let j=i+1;
    for(;j<lines.length;j++){
      if(meta.test(lines[j]))break;
      const t=cleanText(lines[j]||'');
      if(/^(?:コメントを書く|記事トップに戻る|最初へ|記事へ|次へ|前へ)$/i.test(t))break;
      if(t&&!/^(?:Image|hatima|liked|good|bad|返信|▼返信|\d+)$/i.test(t))body.push(t);
    }
    push(m[1],m[2],m[3],body.join('\n'));i=j-1;
  }
  return out;
}
async function augmentEsuteruCommentDocument(doc,articleUrl){
  if(!doc||!isEsuteruUrl(articleUrl))return {expected:0,primary:0,fallback:0};
  let expected=expectedSiteCommentCount(doc);const primaryRecords=esuteruSemanticCommentRecords(doc);const primaryKeys=new Set(primaryRecords.map(r=>`${r.n??''}|${r.date||''}|${r.bodyText}`));const primary=primaryKeys.size;
  let fetchPages=0,fetchErrors=0,fetchBytes=0,looseCount=0;const fetchErrorDetails=[];
  const setStats=(fallback=0)=>{const d=doc.documentElement.dataset;d.esuteruCommentExpected=String(expected);d.esuteruCommentPrimary=String(primary);d.esuteruCommentFallback=String(fallback);d.esuteruCommentFetchPages=String(fetchPages);d.esuteruCommentFetchErrors=String(fetchErrors);d.esuteruCommentFetchBytes=String(fetchBytes);d.esuteruCommentLoose=String(looseCount);d.esuteruCommentFetchErrorDetails=fetchErrorDetails.slice(0,4).join(' || ');};
  if(expected>0&&primary>=expected){setStats(0);return {expected,primary,fallback:0};}
  let articleId='';try{articleId=new URL(articleUrl).pathname.match(/\/archives\/(\d+)/)?.[1]||'';}catch{}
  const queue=[],queued=new Set(),visited=new Set();
  const enqueue=(raw,base=articleUrl)=>{const u=absUrl(raw,base);if(!u)return;try{const x=new URL(u);if(!/^(?:blog\.)?esuteru\.com$/i.test(x.hostname))return;if(articleId&&!new RegExp(`/archives/${articleId}/comments/`).test(x.pathname))return;if(!/\/comments\//.test(x.pathname))return;const k=x.href;if(queued.has(k)||visited.has(k))return;queued.add(k);queue.push(k);}catch{}};
  for(const a of doc.querySelectorAll('a[href*="/comments/"]'))enqueue(a.getAttribute('href'),articleUrl);
  if(articleId){for(const proto of ['https:','http:']){enqueue(`${proto}//blog.esuteru.com/lite/archives/${articleId}/comments/1823708/`);enqueue(`${proto}//blog.esuteru.com/lite/archives/${articleId}/comments/6291/`);}}
  const imported=[],importedKeys=new Set();let pageCount=0;
  const importRecords=(records)=>{for(const rec of records){const k=`${rec.n??''}|${rec.date||''}|${rec.bodyText}`;if(primaryKeys.has(k)||importedKeys.has(k))continue;importedKeys.add(k);imported.push(rec);}};
  while(queue.length&&pageCount<120){
    const url=queue.shift();queued.delete(url);if(visited.has(url))continue;visited.add(url);pageCount++;
    let fetched;try{fetched=await fetchEsuteruCommentDecoded(url,articleUrl);fetchPages++;fetchBytes+=Number(fetched.bytes||0);}catch(err){fetchErrors++;if(fetchErrorDetails.length<4)fetchErrorDetails.push(`${url} => ${cleanText(err?.message||String(err))}`);continue;}
    const cdoc=new DOMParser().parseFromString(fetched.text,'text/html');
    expected=Math.max(expected,expectedSiteCommentCount(cdoc));
    const semantic=esuteruSemanticCommentRecords(cdoc);importRecords(semantic);
    if(!semantic.length){const loose=esuteruLooseCommentRecords(cdoc);looseCount+=loose.length;importRecords(loose);}
    if(expected>0&&primary+imported.length>=expected)break;
    const pageBase=fetched.finalUrl||url;
    for(const a of cdoc.querySelectorAll('a[href]')){
      const href=a.getAttribute('href')||'',t=cleanText(a.textContent||'');
      if(/(?:^|[?&])p=\d+/i.test(href)||/^(?:次へ|前へ|次|前|\d+)$/i.test(t))enqueue(href,pageBase);
    }
  }
  if(imported.length){imported.sort((a,b)=>a.n!=null&&b.n!=null?a.n-b.n:a.n!=null?-1:b.n!=null?1:0);const holder=doc.createElement('div');holder.id='esuteru-imported-comments';holder.className='comments comment-list esuteru-imported-comments';holder.dataset.esuteruFallback='1';for(const rec of imported)appendEsuteruSyntheticRecord(holder,rec);doc.body.appendChild(holder);}
  setStats(imported.length);return {expected,primary,fallback:imported.length};
}

function collectGossipCommentsByMarker(doc, baseUrl='') {
  const startRe=/^(?:この記事へのコメント|Comment(?:\s*[（(]\s*\d{1,6}\s*[）)])?|コメント(?:一覧)?(?:\s*[（(]\s*\d{1,6}\s*[）)])?)$/i;
  const endRe=/^(?:コメントを書く|Leave a Comment|コメントフォーム|お気軽に一言お願いします。)$/i;
  const markerNodes=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div,section,span')].filter(el=>{
    const t=cleanText(el.textContent||'');
    return startRe.test(t) && ![...el.children].some(ch=>startRe.test(cleanText(ch.textContent||'')));
  });
  let best={marker:'',items:[]};
  const dateRe=/(?:20)?\d{2}年\d{1,2}月\d{1,2}日|(?:20)?\d{2}[\/.\-]\d{1,2}[\/.\-]\d{1,2}|\d{1,2}:\d{2}/;
  const badRe=/^(?:オススメ記事|おすすめ記事|人気記事|関連記事|ランキング|コメントを書く|Leave a Comment|コメントフォーム|お気軽に一言お願いします。)$/i;
  for(const marker of markerNodes){
    let end=null;
    for(const el of doc.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div,section,span,a,form')){
      if(!(marker.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      const t=cleanText(el.textContent||'');
      if(endRe.test(t)){end=el;break;}
    }
    const candidates=[];
    for(const el of doc.querySelectorAll('li,article,section,div,dl,dd')){
      if(!(marker.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      if(end && !(el.compareDocumentPosition(end)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      if(el.closest?.('form,.comment_form,#write_comment02,[id*="write_comment"],[class*="comment-form"],nav,footer,aside'))continue;
      const txt=cleanText(el.textContent||'');
      if(!txt||txt.length<2||txt.length>20000||badRe.test(txt))continue;
      if(/(?:オススメ記事|おすすめ記事|人気記事|関連記事|ランキング)/i.test(txt.slice(0,120)) && (el.querySelectorAll?.('a[href]')?.length||0)>=2)continue;
      const {text:bodyText}=siteCommentBodyText(el,baseUrl);
      if(!bodyText||bodyText.length<1||bodyText.length>16000)continue;
      const fields=siteCommentFields(el,bodyText);
      const raw=cleanText(el.textContent||'');
      const structural=/comment|kome/i.test(`${el.id||''} ${el.className||''}`) || el.matches?.('.ent_res');
      const hasMeta=!!fields.date || !!fields.cid || dateRe.test(raw) || /ID\s*[：:]/i.test(raw);
      const hasIdentity=fields.n!=null || !!fields.author || structural;
      if(!hasMeta || !hasIdentity)continue;
      candidates.push(el);
    }
    // Collapse only exact duplicate structural records. DOM order is preserved; numbering may jump.
    const items=[],seen=new Set();
    for(const el of candidates){
      const {text:bodyText}=siteCommentBodyText(el,baseUrl);
      const f=siteCommentFields(el,bodyText);
      const domId=/^comment[-_]\d+$/i.test(el.id||'')?el.id:'';
      const key=domId||`${f.n??''}|${f.date||''}|${f.cid||''}|${bodyText}`;
      if(seen.has(key))continue;
      // If this broad wrapper only aggregates smaller accepted comment blocks, skip the wrapper.
      const childCandidates=candidates.filter(ch=>ch!==el && el.contains(ch));
      if(childCandidates.length>=2 && !/^comment[-_]\d+$/i.test(el.id||'') && !el.matches?.('.ent_res,li.comment-set'))continue;
      seen.add(key);items.push(el);
    }
    if(items.length>best.items.length)best={marker:cleanText(marker.textContent||''),items};
  }
  return best;
}

function vipperOreSemanticCommentRecords(doc){
  const out=[],seen=new Set();
  const push=r=>{if(!r||!r.bodyText)return;const k=`${r.n??''}|${r.date||''}|${r.cid||''}|${r.bodyText}`;if(seen.has(k))return;seen.add(k);out.push(r);};
  const roots=[];
  for(const sel of ['#ld_blog_article_comment_entries','#comments-list','#comment_list','#comment-list','#comments','#comment','.comment-list','.comments'])
    for(const el of doc.querySelectorAll?.(sel)||[])if(!roots.includes(el))roots.push(el);
  for(const r of roots)for(const item of collectSiteCommentItems(r,doc,'vipperore')){
    const {text:bodyText}=siteCommentBodyText(item,doc.baseURI||'');if(!bodyText)continue;
    const f=siteCommentFields(item,bodyText);const raw=cleanText(item.textContent||'');
    const date=f.date||(raw.match(/20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}/)?.[0]||'');
    if(f.n==null&&!date)continue;
    push({n:f.n,author:f.author||'',date,cid:f.cid||'',reply:f.reply||'',bodyText});
  }
  // Current Livedoor lite comment pages expose headings such as
  // "12. VIPPERな名無しさん 2026年09月14日 20:53" followed by the body.
  const metaRe=/^\s*(\d{1,6})\.\s*(.*?)\s*(20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2})\s*$/;
  for(const h of [...doc.querySelectorAll?.('h2,h3,h4,h5,h6,strong,b')||[]]){
    const m=cleanText(h.textContent||'').match(metaRe);if(!m)continue;
    const pieces=[];let cur=h.nextElementSibling,guard=0;
    while(cur&&guard++<60){
      const t=cleanText(cur.textContent||'');
      if(cur.matches('h2,h3,h4,h5,h6')&&metaRe.test(t))break;
      if(cur.matches('form,nav,footer')||/^(?:コメントを書く|記事トップに戻る|最初へ|記事へ|次へ|前へ)$/i.test(t))break;
      const c=cur.cloneNode(true);
      for(const bad of [...c.querySelectorAll('script,style,noscript,form,button,img,svg,.comment-reaction,.comment-like,.comment-rating,[class*="liked"]')])bad.remove();
      const plain=siteCommentPlainTextFromClone(c,true);
      const reactionOnly=plain && /^(?:(?:Image(?:\s*:\s*[^\s]+)?|liked|返信|good|bad|\d+)\s*)+$/iu.test(plain);
      if(plain&&!reactionOnly)pieces.push(plain);
      cur=cur.nextElementSibling;
    }
    const body=cleanText(pieces.join('\n'));
    if(body)push({n:Number(m[1]),author:cleanText(m[2]||''),date:m[3],cid:'',reply:'',bodyText:body});
  }
  return out;
}

function appendVipperOreSyntheticRecord(root,rec){
  const d=root.ownerDocument,item=d.createElement('div');item.className='comment-item vipperore-imported-comment';
  if(rec.n!=null)item.setAttribute('data-comment-number',String(rec.n));
  const meta=d.createElement('div');
  if(rec.n!=null){const n=d.createElement('span');n.className='comment-number';n.textContent=`${rec.n}.`;meta.appendChild(n);}
  if(rec.author){const a=d.createElement('span');a.className='comment-author';a.textContent=rec.author;meta.appendChild(a);}
  if(rec.date){const t=d.createElement('span');t.className='comment-date';t.textContent=rec.date;meta.appendChild(t);}
  if(rec.cid){const id=d.createElement('span');id.className='comment-id';id.textContent=`ID:${rec.cid}`;meta.appendChild(id);}
  const body=d.createElement('div');body.className='comment-body';body.textContent=rec.bodyText;
  item.append(meta,body);root.appendChild(item);
}

async function fetchVipperOreCommentPage(url){
  // Use the Pi same-origin proxy so the preparation browser never depends on upstream CORS.
  if(window.MatomePi?.assetUrl){
    const prox=window.MatomePi.assetUrl(url);
    const res=await fetch(prox,{cache:'no-store',credentials:'same-origin'});
    if(!res.ok){let detail='';try{detail=cleanText(await res.text())}catch{};throw new Error(`HTTP ${res.status}${detail?` ${detail.slice(0,220)}`:''}`);}
    const buffer=await res.arrayBuffer();
    return {text:decodeBuffer(buffer,res.headers.get('content-type')||''),finalUrl:res.headers.get('X-Upstream-URL')||url};
  }
  return fetchDecoded(url);
}

async function augmentVipperOreCommentDocument(doc,articleUrl){
  if(!doc||!isVipperOreUrl(articleUrl))return {expected:0,primary:0,fallback:0};
  let expected=expectedSiteCommentCount(doc);
  const primaryRecords=vipperOreSemanticCommentRecords(doc);
  const primaryKeys=new Set(primaryRecords.map(r=>`${r.n??''}|${r.date||''}|${r.cid||''}|${r.bodyText}`));
  const primary=primaryKeys.size;
  if(expected>0&&primary>=expected){
    doc.documentElement.dataset.vipperCommentExpected=String(expected);doc.documentElement.dataset.vipperCommentPrimary=String(primary);doc.documentElement.dataset.vipperCommentFallback='0';
    return {expected,primary,fallback:0};
  }
  let articleId='';try{articleId=new URL(articleUrl).pathname.match(/\/archives\/(\d+)/)?.[1]||'';}catch{}
  if(!articleId)return {expected,primary,fallback:0};
  const queue=[],queued=new Set(),visited=new Set();
  const enqueue=raw=>{const u=absUrl(raw,articleUrl);if(!u)return;try{const x=new URL(u);const h=x.hostname.toLowerCase();if(h!=='news23vip.livedoor.blog'&&!(h==='blog.livedoor.jp'&&/\/news23vip\//i.test(x.pathname)))return;if(!new RegExp(`/archives/${articleId}/comments/`).test(x.pathname))return;if(queued.has(x.href)||visited.has(x.href))return;queued.add(x.href);queue.push(x.href);}catch{}};
  for(const a of doc.querySelectorAll('a[href*="/comments/"]'))enqueue(a.getAttribute('href'));
  // Current VIPPERな俺 Livedoor lite comment route. 78 is the active mobile comment template route.
  enqueue(`https://news23vip.livedoor.blog/lite/archives/${articleId}/comments/78/`);
  const imported=[],importedKeys=new Set();let pageCount=0;
  while(queue.length&&pageCount<30){
    const url=queue.shift();queued.delete(url);if(visited.has(url))continue;visited.add(url);pageCount++;
    let fetched;try{fetched=await fetchVipperOreCommentPage(url);}catch{continue;}
    const cdoc=new DOMParser().parseFromString(fetched.text,'text/html');
    expected=Math.max(expected,expectedSiteCommentCount(cdoc));
    for(const rec of vipperOreSemanticCommentRecords(cdoc)){
      const k=`${rec.n??''}|${rec.date||''}|${rec.cid||''}|${rec.bodyText}`;
      if(primaryKeys.has(k)||importedKeys.has(k))continue;importedKeys.add(k);imported.push(rec);
    }
    if(expected>0&&primary+imported.length>=expected)break;
    for(const a of cdoc.querySelectorAll('a[href*="/comments/"]')){
      const href=a.getAttribute('href')||'',t=cleanText(a.textContent||'');
      if(/^(?:次へ|前へ|\d+)$/i.test(t)||/[?&]p=\d+/i.test(href))enqueue(href);
    }
  }
  if(imported.length){
    // Preserve the source DOM order. Livedoor can place reply-to-comment threads next to their
    // parent, so numeric sorting would scramble the visible conversation order.
    const holder=doc.createElement('div');holder.id='vipperore-imported-comments';holder.className='comments comment-list vipperore-imported-comments';holder.dataset.vipperFallback='1';
    for(const rec of imported)appendVipperOreSyntheticRecord(holder,rec);doc.body.appendChild(holder);
  }
  doc.documentElement.dataset.vipperCommentExpected=String(expected);doc.documentElement.dataset.vipperCommentPrimary=String(primary);doc.documentElement.dataset.vipperCommentFallback=String(imported.length);
  return {expected,primary,fallback:imported.length};
}

function appendSiteCommentCards(wrap, doc, kind='generic', baseUrl='') {
  if(!wrap||!doc)return 0;
  const selectors = kind==='alfalfalfa' ? ['#ld_blog_article_comment_entries','#comments-list'] :
    kind==='vipperore' ? ['#vipperore-imported-comments','#ld_blog_article_comment_entries','#comments-list','#comment_list','#comment-list','#comments','#comment','.comment-list','.comments'] :
    kind==='hamusoku' ? ['#comment_list','#ld_blog_article_comment_entries'] :
    kind==='esuteru' ? ['#comment','#comments','.comment-list','.comments','#ld_blog_article_comment_entries'] :
    kind==='gossip1' ? ['#comments','#comment','#comment-list','#comment_list','#comments-list','.comments','.comment-list','.comments-list','.article__comments','.article-comments','.article_comment','.article-comment','#ld_blog_article_comment_entries'] :
    ['#ld_blog_article_comment_entries','#comments-list','#comment_list','#comment-list','#comment','#comments','.comment-list','.comments-list','.comments','.article__comments','.article-comments'];
  let roots=[];
  for(const sel of selectors) for(const el of doc.querySelectorAll(sel)) if(!roots.includes(el)) roots.push(el);
  if(kind==='alfalfalfa'){
    // Prefer the canonical Livedoor container. Accept #comments-list only when it actually contains
    // structural comment nodes, never merely because it is a list near the comment section.
    const canonical=doc.querySelector('#ld_blog_article_comment_entries');
    if(canonical) roots=[canonical];
    else roots=roots.filter(r=>!!r.querySelector('li.comment-set,[id^="comment-"],[id^="comment_"]'));
  }
  const loose=[];
  if(!roots.length && kind!=='alfalfalfa' && kind!=='gossip1'){
    const commentMarkerRe=/^(?:Comment(?:\s*[（(]\d+[）)])?|コメント(?:一覧)?(?:\s*[（(]\d+[）)])?)$/i;
    const markers=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div')].filter(el=>commentMarkerRe.test(cleanText(el.textContent||'')) && ![...el.children].some(ch=>commentMarkerRe.test(cleanText(ch.textContent||''))));
    for(const marker of markers){
      let cur=marker.nextElementSibling;let guard=0;
      while(cur&&guard++<180){
        const t=cleanText(cur.textContent||'');
        if(/^(?:Leave a Comment|Favorite Articles|人気記事|おすすめ記事|関連記事|コメントフォーム|お気軽に一言お願いします。)$/i.test(t))break;
        if(t.length>=2 && t.length<=20000 && !cur.matches('form,.comment_form,[id*="write_comment"],[class*="comment-form"]'))loose.push(cur);
        cur=cur.nextElementSibling;
      }
    }
  }

  const expected=expectedSiteCommentCount(doc);
  const items=[];const itemSeen=new Set();
  const addItems=arr=>{for(const x of arr){if(!x||itemSeen.has(x))continue;itemSeen.add(x);items.push(x);}};
  let gossipPrimaryCount=0,gossipMarkerCount=0,gossipMarker='';
  for(const root of roots){const got=collectSiteCommentItems(root,doc,kind);if(kind==='gossip1')gossipPrimaryCount+=got.length;addItems(got);}
  if(loose.length)addItems(loose);
  if(kind==='gossip1'){
    const markerResult=collectGossipCommentsByMarker(doc,baseUrl);
    gossipMarker=markerResult.marker||'';gossipMarkerCount=markerResult.items.length;
    addItems(markerResult.items);
  }
  if(!items.length){
    if(kind==='gossip1'){wrap.dataset.gossipCommentMarker=gossipMarker;wrap.dataset.gossipCommentRoots=String(roots.length);wrap.dataset.gossipCommentPrimary=String(gossipPrimaryCount);wrap.dataset.gossipCommentMarkerItems=String(gossipMarkerCount);wrap.dataset.gossipCommentExpected=String(expected);wrap.dataset.gossipCommentAppended='0';}
    return 0;
  }

  // v0.1.111: Alfalfalfa's current template does not always expose stable comment-set/comment-N
  // classes. Anchor to the visible "コメント一覧 (N)" heading and accept only dated <li> nodes
  // that occur after that heading and before the comment form. This keeps real nested replies while
  // excluding the recommendation/thumbnail lists that appear earlier on the page.
  if(kind==='alfalfalfa') {
    const markerRe=/^コメント一覧\s*[（(]\s*\d{1,6}\s*[）)]\s*$/;
    const endRe=/^(?:お気軽に一言お願いします。|コメントフォーム)$/;
    const candidates=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b')];
    const marker=candidates.find(el=>{
      const t=cleanText(el.textContent||'');
      return markerRe.test(t) && ![...el.children].some(ch=>markerRe.test(cleanText(ch.textContent||'')));
    })||null;
    const end=candidates.find(el=>{
      const t=cleanText(el.textContent||'');
      return endRe.test(t) && (!marker || !!(marker.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING));
    })||null;
    if(marker){
      const semantic=[];
      for(const el of doc.querySelectorAll('li')){
        if(!(marker.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
        if(end && !(el.compareDocumentPosition(end)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
        if(el.closest?.('form,.comment_form,#write_comment02,[id*="write_comment"],[class*="comment-form"]'))continue;
        const t=cleanText(el.textContent||'');
        if(t.length<2||t.length>20000)continue;
        const hasDate=/(?:20)?\d{2}年\d{1,2}月\d{1,2}日|(?:20)?\d{2}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(t);
        if(!hasDate)continue;
        semantic.push(el);
      }
      addItems(semantic);
    }
  }
  // GOSSIP uses primary roots + marker-bounded extraction regardless of expected count.

  let added=0;let section=null;
  const stableSeen=new Set();
  for(const item of items){
    if(!item?.isConnected && item.ownerDocument===doc)continue;
    if(item.closest?.('form,.comment_form,#write_comment02,[id*="write_comment"],[class*="comment-form"]'))continue;
    const {text:bodyText}=siteCommentBodyText(item,baseUrl);
    if(bodyText.length<1 || bodyText.length>16000)continue;
    if(/^(?:コメント一覧|コメントする|Leave a Comment|投稿する|名前|メール|URL|コメントフォーム)$/i.test(bodyText))continue;
    const fields=siteCommentFields(item,bodyText);
    if(kind==='alfalfalfa'){
      const structural=item.matches?.('li.comment-set') || /^comment[-_]\d+$/i.test(item.id||'');
      const hasDate=/(?:20)?\d{2}年\d{1,2}月\d{1,2}日|(?:20)?\d{2}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(fields.date||cleanText(item.textContent||''));
      // Real Alfalfalfa comments expose either the Livedoor structural node or stable comment metadata.
      // Related/recommendation cards with thumbnails/links satisfy neither and are rejected here.
      if(!structural && fields.n==null && !hasDate)continue;
    }
    const domId=/^comment[-_]\d+$/i.test(item.id||'')?item.id:'';
    // Deduplicate only the same structural comment; never drop a real site comment merely because
    // its text also appeared in the article/thread body.
    const stableKey=domId || `${fields.n??''}|${fields.date}|${fields.cid}|${bodyText}`;
    if(stableSeen.has(stableKey))continue;stableSeen.add(stableKey);

    if(!section){
      section=wrap.ownerDocument.createElement('section');section.className='site-feedback-section';
      if(expected)section.dataset.expectedComments=String(expected);
      const h=wrap.ownerDocument.createElement('div');h.className='site-feedback-heading';h.textContent=expected?`コメント (${expected})`:'コメント';section.appendChild(h);
    }
    const card=wrap.ownerDocument.createElement('div');card.className='site-feedback-card';
    if(fields.n!=null)card.dataset.commentNumber=String(fields.n);
    const meta=siteCommentMetaText(item,bodyText);
    if(meta){const m=wrap.ownerDocument.createElement('div');m.className='site-feedback-meta';m.textContent=meta;card.appendChild(m);}
    const body=wrap.ownerDocument.createElement('div');body.className='site-feedback-body';
    // Rebuild from plain semantic text. This intentionally excludes Livedoor reaction/like UI,
    // avatars, counters, buttons and other widgets even when the source DOM nests them oddly.
    body.textContent=bodyText;
    card.appendChild(body);section.appendChild(card);added++;
  }
  if(section&&added){section.dataset.extractedComments=String(added);wrap.appendChild(section);}
  if(kind==='gossip1'){wrap.dataset.gossipCommentMarker=gossipMarker;wrap.dataset.gossipCommentRoots=String(roots.length);wrap.dataset.gossipCommentPrimary=String(gossipPrimaryCount);wrap.dataset.gossipCommentMarkerItems=String(gossipMarkerCount);wrap.dataset.gossipCommentExpected=String(expected);wrap.dataset.gossipCommentAppended=String(added);}
  if(kind==='esuteru'){
    const expected2=Number(doc.documentElement?.dataset?.esuteruCommentExpected||expected||0),primary2=Number(doc.documentElement?.dataset?.esuteruCommentPrimary||0),fallback2=Number(doc.documentElement?.dataset?.esuteruCommentFallback||0);
    wrap.dataset.esuteruCommentExpected=String(expected2);wrap.dataset.esuteruCommentPrimary=String(primary2);wrap.dataset.esuteruCommentFallback=String(fallback2);wrap.dataset.esuteruCommentAppended=String(added);wrap.dataset.esuteruCommentFetchPages=String(doc.documentElement?.dataset?.esuteruCommentFetchPages||0);wrap.dataset.esuteruCommentFetchErrors=String(doc.documentElement?.dataset?.esuteruCommentFetchErrors||0);wrap.dataset.esuteruCommentFetchBytes=String(doc.documentElement?.dataset?.esuteruCommentFetchBytes||0);wrap.dataset.esuteruCommentLoose=String(doc.documentElement?.dataset?.esuteruCommentLoose||0);wrap.dataset.esuteruCommentFetchErrorDetails=String(doc.documentElement?.dataset?.esuteruCommentFetchErrorDetails||'');
  }
  return added;
}

function makeReplyDenseSiteBundle(doc, title='', kind='generic') {
  if (!doc?.body) return null;
  const badSel='#comments,.comments,.comment-list,.comment-body,#comment,.trackbacks,.sidebar,#sidebar,nav,footer,aside';
  let scope=null;
  if (title) {
    const heads=[...doc.querySelectorAll('h1,h2,h3,.entry-title,.article-title,.title,.article-header')];
    const h=heads.find(x=>sameTitle(cleanText(x.textContent||''),title));
    if(h) scope=h.closest('article,.hentry,.article,.article-outer,.blogbody,.post,.entry') || h.parentElement;
  }
  scope ||= doc.body;
  const sels=[
    '.article-body-inner','.article-body.entry-content','.article-body-more','.entry-content',
    '.article-content','.articleBody','#article-body','#more','.mainmore','.main.entry-content',
    '.post-body','.post-content','.entry-body','.article-main','article','.hentry'
  ];
  const cands=[];
  for(const sel of sels){ for(const el of scope.querySelectorAll(sel)){ if(!cands.includes(el)) cands.push(el); } }
  if(scope!==doc.body) cands.push(scope);
  let best=null,bestScore=-1e18;
  for(const el of cands){
    if(!el || el.matches?.(badSel) || el.closest?.(badSel)) continue;
    const replies=simpleReplyCount(el); if(replies<1) continue;
    const textLen=cleanText(el.textContent||'').length;
    const links=el.querySelectorAll?.('a[href]')?.length||0;
    const comments=el.querySelectorAll?.('#comments,.comments,.comment-list,.comment-body,#comment')?.length||0;
    const score=replies*100000 + Math.min(textLen,50000) - links*25 - comments*20000;
    if(score>bestScore){bestScore=score;best=el;}
  }
  if(!best) return null;
  const wrap=doc.createElement('div'); wrap.dataset.replyDenseSiteBundle=kind; wrap.appendChild(best.cloneNode(true));
  return wrap;
}

const GOSSIP_REPLY_RE = /(?:^|\n)\s*(?:>>\s*)?\d{1,5}\s+[^\n]{0,180}?\s*(?:20)?\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:\s+ID\s*[：:]\s*[^\s]+)?/gm;
function gossipReplyCount(el){
  if(!el)return 0;
  const t=String(el.innerText||el.textContent||'').replace(/\r/g,'\n');
  const textCount=(t.match(GOSSIP_REPLY_RE)||[]).length;
  // 古いSeesaaテンプレートではレス番号・日時・IDが別要素に分割されることがある。
  // DOM上の「番号で始まり、同じ小ブロック内に日時がある」行も数え、文字列正規表現だけで
  // 後続レスを落とさないようにする。
  let domCount=0;
  try{
    const nodes=[...el.querySelectorAll('div,p,li,td,dd,dt,span,font')];
    for(const node of nodes){
      const x=cleanText(node.textContent||'');
      if(!/^\d{1,5}\s+/.test(x))continue;
      if(!/(?:20)?\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?/.test(x))continue;
      const childHas=[...node.children].some(ch=>{
        const y=cleanText(ch.textContent||'');
        return /^\d{1,5}\s+/.test(y) && /(?:20)?\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?/.test(y);
      });
      if(!childHas)domCount++;
    }
  }catch{}
  return Math.max(textCount,domCount);
}

function makeGossip1BodyBundle(doc,title=''){
  if(!doc?.body)return null;
  let scope=null;
  if(title){
    const heads=[...doc.querySelectorAll('h1,h2,h3,.entry-title,.article-title,.title,.article-header')];
    const h=heads.find(x=>sameTitle(cleanText(x.textContent||''),title));
    if(h)scope=h.closest('article,.hentry,.article,.article-outer,.blogbody,.post,.entry,.main')||h.parentElement;
  }
  scope ||= doc.querySelector('#main,.main,.blogbody,main') || doc.body;

  // v0.1.116: GOSSIPはサイト全体で「オススメ記事」の後にも実レスが続く。
  // 中間DOMを丸ごと複製せず、.ent_resだけをDOM順に個別連結して確定本文にする。
  const entReplies=[...doc.querySelectorAll('.ent_res')].filter(el=>!el.closest('#comments,.comments,.comment-list,.comments-list,form,.comment_form,[id*=\"write_comment\"],[class*=\"comment-form\"]'));
  if(entReplies.length>=1){
    const wrap=doc.createElement('div');
    wrap.dataset.gossip1BodyBundle='ent-res-only';
    wrap.dataset.gossipReplySourceCount=String(entReplies.length);
    let kept=0;
    for(const reply of entReplies){
      const clone=reply.cloneNode(true);
      // v0.1.121: one source .ent_res = one protected GOSSIP reply unit.  Keep this marker
      // through sanitize/snapshot so a later generic cleaner cannot silently erase the reply.
      clone.dataset.gossipReplyUnit='1';
      clone.dataset.gossipReplyIndex=String(kept+1);
      for(const bad of [...clone.querySelectorAll('[class*=recommend],[class*=osusume],[class*=pickup],[id*=recommend],[id*=osusume],[id*=pickup],.manual-related,#mainmore')]){
        if(!bad.matches('.ent_res') && !bad.querySelector('.ent_res,.ent_header')) bad.remove();
      }
      wrap.appendChild(clone);kept++;
    }
    wrap.dataset.gossipReplyCount=String(kept);
    if(kept)return wrap;
  }

  // v0.1.121 fallback: some GOSSIP templates expose .ent_header + .ent_body without
  // a usable .ent_res wrapper. Rebuild reply units directly from those pairs in DOM order.
  const headers=[...doc.querySelectorAll('.ent_header')].filter(el=>!el.closest('#comments,.comments,.comment-list,.comments-list,form,.comment_form,[id*=\"write_comment\"],[class*=\"comment-form\"]'));
  if(headers.length){
    const wrap=doc.createElement('div');wrap.dataset.gossip1BodyBundle='header-body';
    wrap.dataset.gossipReplySourceCount=String(headers.length);
    let kept=0;
    for(const header of headers){
      const unit=doc.createElement('div');unit.dataset.gossipReplyUnit='1';unit.dataset.gossipReplyIndex=String(kept+1);
      unit.appendChild(header.cloneNode(true));
      let body=null;
      const parent=header.parentElement;
      if(parent){
        body=parent.querySelector(':scope > .ent_body') || parent.querySelector('.ent_body');
      }
      if(!body){
        let n=header.nextElementSibling,guard=0;
        while(n&&guard++<5){if(n.matches?.('.ent_body')){body=n;break;} if(n.matches?.('.ent_header'))break;n=n.nextElementSibling;}
      }
      if(body)unit.appendChild(body.cloneNode(true));
      const txt=cleanText(unit.textContent||'');
      if(txt){wrap.appendChild(unit);kept++;}
    }
    wrap.dataset.gossipReplyCount=String(kept);
    if(kept)return wrap;
  }

  // v0.1.98: GOSSIPは「inner/moreが1個見つかったら確定」を廃止する。
  // 古いSeesaaテンプレートでは後続レスが兄弟ブロックへ分割されるため、記事スコープと
  // 本文候補を全部比較し、コメント/サイドバーを除いた後の実レス数が最大になる範囲を採用する。
  const noiseSel='#comments,.comments,.comment-list,.comments-list,.comment-body,#comment,#comment-list,#comment_list,.article__comments,.article-comments,.article_comment,.article-comment,.sidebar,#sidebar,nav,footer,aside,form,[id*="write_comment"],[class*="comment-form"]';
  const sels=[
    '.article-body-inner','.article-body.entry-content','.article-body-more','.article-body',
    '.entry-content','.article-content','.articleBody','#article-body','#more','.mainmore',
    '.main.entry-content','.post-body','.post-content','.entry-body','.article-main','article','.hentry'
  ];
  const cands=[];
  const add=el=>{if(el&&el!==doc.body&&!cands.includes(el)&&!el.matches?.(noiseSel)&&!el.closest?.(noiseSel))cands.push(el);};
  add(scope);
  for(const sel of sels)for(const el of scope.querySelectorAll(sel))add(el);

  let best=null,bestReplies=0,bestScore=-1e18;
  for(const el of cands){
    const clone=el.cloneNode(true);
    for(const bad of [...clone.querySelectorAll(noiseSel)])bad.remove();
    const replies=gossipReplyCount(clone);if(replies<1)continue;
    const textLen=cleanText(clone.textContent||'').length;
    const links=clone.querySelectorAll?.('a[href]')?.length||0;
    const media=clone.querySelectorAll?.('img,picture,video,iframe,blockquote')?.length||0;
    // レス数を絶対優先。同数なら余計なリンク/巨大な外枠より、本文に近い小さい箱を選ぶ。
    const score=replies*1000000 + Math.min(media,30)*1200 - links*30 - Math.min(textLen,120000)*0.02;
    if(replies>bestReplies || (replies===bestReplies&&score>bestScore)){
      bestReplies=replies;bestScore=score;best=clone;
    }
  }

  // class名が変わって候補selectorに入らない場合は、レス行を含む共通祖先を保険で拾う。
  if(!best){
    const hits=[];
    for(const el of scope.querySelectorAll('div,section,article,td,li')){
      if(el.matches?.(noiseSel)||el.closest?.(noiseSel))continue;
      const cnt=gossipReplyCount(el),len=cleanText(el.textContent||'').length;
      if(cnt>=1&&len<=70000)hits.push({el,cnt,len});
    }
    hits.sort((a,b)=>b.cnt-a.cnt || a.len-b.len);
    if(hits[0]){
      best=hits[0].el.cloneNode(true);
      for(const bad of [...best.querySelectorAll(noiseSel)])bad.remove();
      bestReplies=gossipReplyCount(best);
    }
  }
  if(!best||bestReplies<1)return null;
  const wrap=doc.createElement('div');wrap.dataset.gossip1BodyBundle='1';wrap.appendChild(best);return wrap;
}

function trimFesokuTail(container){
  if(!container) return;
  const labels=[...container.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div')];
  for(const el of labels){
    const t=cleanText(el.textContent||''); if(!/^Comment$/i.test(t)) continue;
    try{
      const before=document.createRange(); before.setStart(container,0); before.setEndBefore(el);
      const tmp=document.createElement('div'); tmp.appendChild(before.cloneContents());
      if(simpleReplyCount(tmp)<1) continue;
      const after=document.createRange(); after.setStartBefore(el); after.setEnd(container,container.childNodes.length); after.deleteContents(); return;
    }catch{}
  }
}

function trimNanjPrideTail(container){
  if(!container) return;
  // なんJ PRIDEは関連記事を「9800: ... ID:nanj_pride」の偽レスとして差し込む。
  // ID部分が別DOMへ分割される記事もあるため、サイト内では 9800: 自体を終端にする。
  if(cutFromPlainTextMarker(container,/(?:^|[\n\r])\s*9800\s*[:：]/m)) return;
  const candidates=[...container.querySelectorAll('div,p,li,td,section,article,span,font,b,strong')]
    .filter(el=>/^\s*9800\s*[:：]/.test(cleanText(el.textContent||'')))
    .sort((a,b)=>cleanText(a.textContent||'').length-cleanText(b.textContent||'').length);
  const hit=candidates[0];
  if(hit){try{const r=document.createRange();r.setStartBefore(hit);r.setEnd(container,container.childNodes.length);r.deleteContents();return;}catch{}}
  cutTerminalNavigationTail(container,'');
}

function removeSitePromoCluster(container, markerRe){
  if(!container||!markerRe)return false;
  const clean=s=>cleanText(s||'');
  const nodes=[...container.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div,section,aside,ul,ol,table,span')];
  const markers=nodes.filter(el=>{
    const t=clean(el.textContent); if(!t||t.length>160||!markerRe.test(t)) return false;
    return ![...el.children].some(ch=>{const ct=clean(ch.textContent);return ct&&ct.length<t.length&&markerRe.test(ct);});
  });
  for(const marker of markers){
    let best=null,cur=marker;
    for(let depth=0;cur&&cur!==container&&depth<6;depth++,cur=cur.parentElement){
      const links=cur.querySelectorAll?.('a[href]')?.length||0;
      const replies=replySignalCount(cur);
      const len=clean(cur.textContent).length;
      if(replies===0 && links>=2 && len<=5000) best=cur;
      if(replies>0) break;
    }
    if(best){best.remove();return true;}
    marker.remove();return true;
  }
  return false;
}

function trimAllJungleNoise(container){
  if(!container)return;
  // 本文途中の回遊ニュースだけを抜き、後続レスは残す。
  while(removeSitePromoCluster(container,/^(?:🔥\s*)?今読まれている注目ニュース$/)){}
  // 「応援登録のお願い」から先は本文外。
  cutFromPlainTextMarker(container,/(?:^|[\n\r])\s*[【\[]?応援登録のお願い[】\]]?\s*(?:$|[\n\r])/m);
}

function trimKinisokuNoise(container){
  if(!container)return;
  const terminalRe=/^(?:※?関連記事|キニ速の全記事一覧|この記事を読んだ方はこんな記事も読んでいます)$/;
  // 途中差し込みならブロックだけ消し、末尾ならそこから先を切る。
  const markers=[...container.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div,section,aside,ul,ol,table,span')]
    .filter(el=>terminalRe.test(cleanText(el.textContent||'')))
    .sort((a,b)=>cleanText(a.textContent||'').length-cleanText(b.textContent||'').length);
  for(const marker of markers){
    try{
      const r=document.createRange();r.setStartBefore(marker);r.setEnd(container,container.childNodes.length);
      const after=document.createElement('div');after.appendChild(r.cloneContents());
      if(replySignalCount(after)===0){r.deleteContents();break;}
    }catch{}
    removeSitePromoCluster(container,terminalRe);
  }
  while(removeSitePromoCluster(container,/^(?:人気記事\s*[・／\/]\s*最新記事|人気記事・最新記事)$/)){}
}

function cutFromPlainTextMarker(container, markerRe) {
  if (!container || !markerRe) return false;
  const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  for(const node of nodes){
    const raw=String(node.nodeValue||'');
    const m=raw.match(markerRe); if(!m) continue;
    const start=Math.max(0,m.index||0);
    try{
      const range=document.createRange();
      range.setStart(node,start);
      range.setEnd(container,container.childNodes.length);
      range.deleteContents();
      return true;
    }catch{}
  }
  return false;
}

function trimGossip1Tail(container) {
  if(!container)return;
  // v0.1.159: GOSSIP inserts recommendation islands inside the article body.
  // The prepared candidate is a detached DOM, so isConnected MUST NOT be used here.
  // Remove only promo islands; never cut real .ent_res replies or reader comments.
  const promoRe=/^(?:オススメ記事|おすすめ記事|おススメ記事|関連記事|関連ニュース|人気記事|こちらもおすすめ|あわせて読みたい)$/i;
  const commentRe=/^(?:Comment(?:\s*[（(]\s*\d{0,6}\s*[）)])?|コメント(?:一覧)?(?:\s*[（(]\s*\d{0,6}\s*[）)])?|この記事へのコメント)$/i;
  const leaf=(el,re)=>{
    const t=cleanText(el.textContent||'');
    return !!t && re.test(t) && ![...el.children].some(ch=>{const ct=cleanText(ch.textContent||'');return ct&&ct.length<t.length&&re.test(ct);});
  };
  const q='h1,h2,h3,h4,h5,h6,strong,b,p,div,section,aside,span,ul,ol,table';
  const markers=[...container.querySelectorAll(q)].filter(el=>leaf(el,promoRe));
  const comments=[...container.querySelectorAll(q)].filter(el=>leaf(el,commentRe));
  for(const marker of markers){
    if(!marker.parentNode)continue;
    const nextComment=comments.find(c=>c.parentNode && (marker.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING));
    if(nextComment){
      try{
        const r=document.createRange();r.setStartBefore(marker);r.setEndBefore(nextComment);
        const tmp=document.createElement('div');tmp.appendChild(r.cloneContents());
        const links=tmp.querySelectorAll('a[href]').length;
        if(simpleReplyCount(tmp)===0 && links>=2){r.deleteContents();continue;}
      }catch{}
    }
    let best=null,cur=marker;
    for(let depth=0;cur&&cur!==container&&depth<7;depth++,cur=cur.parentElement){
      if(cur.matches?.('.ent_res,[data-gossip-reply-unit]')||cur.querySelector?.('.ent_res,[data-gossip-reply-unit],.ent_header,.site-feedback-card'))break;
      const links=cur.querySelectorAll?.('a[href]')?.length||0;
      const len=cleanText(cur.textContent||'').length;
      if(simpleReplyCount(cur)===0 && links>=2 && len<=6000)best=cur;
    }
    if(best)best.remove();else marker.remove();
  }
  // Header-less recommendation card/list variant: at least three GOSSIP article links, no reply signal.
  const blocks=[...container.querySelectorAll('ul,ol,div,section,aside,table')].sort((a,b)=>b.querySelectorAll('*').length-a.querySelectorAll('*').length);
  for(const el of blocks){
    if(!el.parentNode||el.matches?.('.ent_res,[data-gossip-reply-unit]')||el.querySelector?.('.ent_res,[data-gossip-reply-unit],.ent_header,.site-feedback-card'))continue;
    if(simpleReplyCount(el)>0)continue;
    const internal=[...el.querySelectorAll('a[href]')].filter(a=>{
      try{const u=new URL(a.href,document.baseURI);return /(^|\.)gossip1\.net$/i.test(u.hostname)&&/\/article\//i.test(u.pathname);}catch{return false;}
    });
    const text=cleanText(el.textContent||'');
    if(internal.length>=3 && text.length<7000)el.remove();
  }
}

function trimNegisokuTail(container) {
  if (!container) return;
  // ネギ速は「引用元:...」が本文の明確な終端。その後の zizi_news / Comment /
  // 上にもどる / トップページ導線は本文ではない。
  const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  let hit=null;
  for(const node of nodes){ if(/^\s*引用元\s*[:：]/.test(String(node.nodeValue||''))){ hit=node; break; } }
  if(hit){
    let block=hit.parentElement;
    while(block && block!==container){
      const t=cleanText(block.textContent||'');
      if(t.length<=1200 && /引用元\s*[:：]/.test(t) && block.querySelectorAll('a[href]').length<=3) break;
      block=block.parentElement;
    }
    try{
      const range=document.createRange();
      if(block && block!==container) range.setStartAfter(block); else range.setStartAfter(hit);
      range.setEnd(container,container.childNodes.length);
      range.deleteContents();
    }catch{}
  }
  // 古い/崩れたキャッシュ向け保険。
  cutFromPlainTextMarker(container,/(?:^|[\n\r])\s*(?:zizi_news|Comment\s*\(\s*\d+\s*\)|上にもどる[|｜]ネギ速トップページへ|コメントする)\s*(?:$|[\n\r])/mi);
}

function restoreEsuteruReactionBlock(container, rawRoot, baseUrl='') {
  if (!container || !rawRoot || !isEsuteruUrl(baseUrl)) return;
  if (/この記事への反応/.test(cleanText(container.textContent||''))) return;
  const heads=[...rawRoot.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,div')];
  const marker=heads.find(el=>/^この記事への反応$/.test(cleanText(el.textContent||'')) && ![...el.children].some(ch=>/^この記事への反応$/.test(cleanText(ch.textContent||''))));
  if(!marker) return;
  let src=marker.closest('blockquote') || marker.parentElement || marker;
  // 巨大な親を避け、反応欄だけを復元する。
  if(cleanText(src.textContent||'').length>12000) src=marker.parentElement||marker;
  const clone=src.cloneNode(true);
  for(const el of [...clone.querySelectorAll('script,style,noscript,iframe,form,button,nav,aside,footer')]) el.remove();
  for(const el of [...clone.querySelectorAll('*')]){
    for(const attr of [...el.attributes]){
      const n=attr.name.toLowerCase();
      if(n.startsWith('on')||n==='style'||n==='class'||n==='id'||n==='width'||n==='height') el.removeAttribute(attr.name);
    }
    if(el.tagName==='A'){
      const href=absUrl(el.getAttribute('href')||'',baseUrl); if(href) el.setAttribute('href',href);
      el.setAttribute('target','_self'); el.setAttribute('rel','noopener');
    }
  }
  const text=cleanText(clone.textContent||'');
  if(text.length<8) return;
  const sec=document.createElement('section'); sec.dataset.esuteruReactionRestored='1'; sec.appendChild(clone);
  container.appendChild(sec);
}

function makeVipperOreBodyBundle(doc, title='') {
  if (!doc?.body) return null;
  let article=null;
  if (title) {
    for (const h of doc.querySelectorAll('.article-outer.hentry h1,.article-outer.hentry h2,.article-outer.hentry h3,.article-title,.entry-title,h1,h2,h3')) {
      if (sameTitle(cleanText(h.textContent||''),title)) { article=h.closest('.article-outer.hentry')||h.closest('.hentry')||h.closest('article'); if(article)break; }
    }
  }
  article ||= doc.querySelector('.article-outer.hentry') || doc.querySelector('.hentry') || doc.querySelector('article');

  const selectors=[
    '.article-body.entry-content .article-body-inner','.article-body-inner',
    '.article-body.entry-content','.article-body-more','.entry-content','#article-body','.article-body'
  ];
  const badAncestor='[id*="comment"],[class*="comment"],aside,nav,footer,[class*="sidebar"],[id*="sidebar"]';
  const cands=[];
  const addFrom=root=>{
    if(!root?.querySelectorAll)return;
    for(const sel of selectors) for(const el of root.querySelectorAll(sel)) {
      if(cands.includes(el))continue;
      if(el.closest?.(badAncestor))continue;
      const replies=simpleReplyCount(el),text=cleanText(el.textContent||'');
      if(replies>=1 && text.length>=20)cands.push(el);
    }
  };
  if(article)addFrom(article);

  // v0.1.122: recent VIPPER pages can place the title and article body in sibling trees.
  // The old title-root-only search then returned a title-only snapshot. If the title branch
  // exposes no real replies, search the known article-body selectors document-wide.
  if(!cands.length)addFrom(doc);

  // Last resort: locate a reply-dense block document-wide. Never accept the comment section.
  if(!cands.length){
    const dense=[...doc.querySelectorAll('main,article,section,div,td')].filter(el=>{
      if(el.closest?.(badAncestor))return false;
      const n=simpleReplyCount(el),text=cleanText(el.textContent||'');
      if(n<1 || text.length<20 || text.length>120000)return false;
      const key=`${el.id||''} ${el.className||''}`.toLowerCase();
      return !/(comment|side|menu|nav|footer|header|rank|related|recommend|pickup|archive|widget)/.test(key);
    });
    cands.push(...dense);
  }

  let best=null,bestScore=-1e18;
  for(const el of cands){
    const replies=simpleReplyCount(el);
    const text=cleanText(el.textContent||'');
    const media=el.querySelectorAll?.('img,picture,blockquote,iframe,video')?.length||0;
    const links=el.querySelectorAll?.('a[href]')?.length||0;
    if(replies<1 || text.length<20) continue;
    let score=replies*200000 + Math.min(text.length,50000) + Math.min(media,20)*300 - links*8;
    if(el.matches?.('.article-body-inner'))score+=12000;
    else if(el.matches?.('.article-body.entry-content,.article-body-more,.entry-content,#article-body,.article-body'))score+=5000;
    // Prefer the tighter body when nested wrappers carry the same reply count.
    score-=Math.min(text.length,50000)*0.02;
    if(score>bestScore){bestScore=score;best=el;}
  }
  if(!best) return null;
  const wrap=doc.createElement('div');
  wrap.dataset.vipperOreBodyBundle='1';
  wrap.dataset.vipperReplyCount=String(simpleReplyCount(best));
  wrap.appendChild(best.cloneNode(true));
  return wrap;
}

function makeItaiNewsBodyBundle(doc, title='') {
  if (!doc?.body) return null;
  let article=doc.querySelector('#articlebody .blogbody') || doc.querySelector('#articlebody') || null;
  if (!article) return null;
  const lead=article.querySelector('.main.entry-content');
  const more=article.querySelector('.mainmore');
  if (!lead && !more) return null;
  const wrap=doc.createElement('div');
  wrap.dataset.itaiNewsBodyBundle='1';
  if (lead) wrap.appendChild(lead.cloneNode(true));
  if (more && (!lead || !lead.contains(more))) wrap.appendChild(more.cloneNode(true));
  return wrap;
}

function makeEsuteruBodyBundle(doc, title='') {
  if (!doc?.body) return null;
  let article=null;
  if (title) {
    for (const h of doc.querySelectorAll('main.siteArticle article.article h1,main.siteArticle article.article h2,main.siteArticle article.article h3,.article-header h1,.article-header h2')) {
      if (sameTitle(cleanText(h.textContent||''),title)) { article=h.closest('article.article')||h.closest('article'); break; }
    }
  }
  article ||= doc.querySelector('main.siteArticle article.article') || doc.querySelector('article.article');
  const more=article?.querySelector?.('.article-main #more.article-body-more,#more.article-body-more');
  if (!more) return null;
  const wrap=doc.createElement('div');
  wrap.dataset.esuteruBodyBundle='1';
  wrap.appendChild(more.cloneNode(true));
  return wrap;
}

function isJin115Url(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return h === "jin115.com" || h.endsWith(".jin115.com");
  } catch {
    return false;
  }
}

function isXStatusHref(rawHref, base="") {
  const href = absUrl(rawHref || "", base) || rawHref || "";
  return /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/\s]+\/status\/\d+/i.test(href);
}

function countXStatusLinks(root, base="") {
  if (!root) return 0;
  let n = 0;
  for (const a of root.querySelectorAll("a[href]")) {
    if (isXStatusHref(a.getAttribute("href"), base)) n++;
  }
  return n;
}

function pickJin115ArticleRoot(doc, baseUrl="") {
  // オレ的ゲーム速報は記事によって本文のDOM構造が揺れる。
  // class名だけでは画像部分だけを選ぶことがあるので、Xのstatusリンクや
  // 「■Xより」「＜ネットでの反応＞」という実本文の目印から祖先を逆算する。
  const candidates = new Set();

  const addAncestors = (start, maxDepth=9) => {
    let cur = start;
    for (let depth=0; cur && depth<maxDepth; depth++, cur=cur.parentElement) {
      if (!cur || cur === doc.documentElement) break;
      const tag = cur.tagName;
      if (!/^(?:DIV|SECTION|ARTICLE|MAIN|TD|LI|BLOCKQUOTE)$/i.test(tag)) continue;
      const len = cleanText(cur.textContent).length;
      if (len >= 80 && len <= 60000) candidates.add(cur);
    }
  };

  for (const a of doc.querySelectorAll("a[href]")) {
    if (isXStatusHref(a.getAttribute("href"), baseUrl)) addAncestors(a, 10);
  }

  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = cleanText(walker.currentNode.nodeValue || "");
    if (/■\s*X(?:（旧Twitter）)?より|＜\s*ネット(?:で)?の反応\s*＞|<\s*ネット(?:で)?の反応\s*>/i.test(t)) {
      addAncestors(walker.currentNode.parentElement, 10);
    }
  }

  // 既知の本文クラスも候補には入れるが、即決はしない。
  for (const sel of [
    "[itemprop='articleBody']", ".article-body", ".article-body-inner", ".article-body-more",
    ".entry-content", ".article-content", "article", "main"
  ]) {
    for (const el of doc.querySelectorAll(sel)) candidates.add(el);
  }

  let best = null;
  let bestScore = -Infinity;
  let bestLen = Infinity;

  for (const el of candidates) {
    const text = cleanText(el.textContent);
    const len = text.length;
    if (len < 80 || len > 60000) continue;

    const xCount = countXStatusLinks(el, baseUrl);
    const xMarker = /■\s*X(?:（旧Twitter）)?より/i.test(text) ? 1 : 0;
    const reaction = /＜\s*ネット(?:で)?の反応\s*＞|<\s*ネット(?:で)?の反応\s*>/i.test(text) ? 1 : 0;
    if (xCount === 0 && xMarker === 0 && reaction === 0) continue;

    const key = `${el.id || ""} ${el.className || ""}`.toLowerCase();
    const imgs = el.querySelectorAll("img,picture").length;
    const comments = /この記事へのコメント|コメントする/i.test(text) ? 1 : 0;
    const tags = /この記事の関連タグ/i.test(text) ? 1 : 0;

    let score = Math.min(len, 14000);
    score += xCount * 4500;
    score += xMarker * 4500;
    score += reaction * 3500;
    score += Math.min(imgs, 8) * 120;
    if (/(article|entry|post|body|content|main)/.test(key)) score += 1600;
    if (comments) score -= 18000;
    if (tags) score -= 2500;
    if (len > 22000) score -= (len - 22000) * 0.8;

    if (score > bestScore || (score === bestScore && len < bestLen)) {
      best = el;
      bestScore = score;
      bestLen = len;
    }
  }
  return best;
}

function makeJin115BodyBundle(doc) {
  if(!doc?.body)return null;
  // v0.1.94: JIN実ページは article_body と article_bodymore をDOM順に連結して固定採用。
  // 2要素をDOM順に連結し、汎用候補選択には戻さない。
  const article=doc.querySelector('#contents > .article');
  if(article){
    const parts=[...article.querySelectorAll(':scope > .article_body, :scope > .article_bodymore')];
    if(parts.length){
      const wrap=doc.createElement('div');wrap.dataset.jin115BodyBundle='direct-pair';
      for(const el of parts)wrap.appendChild(el.cloneNode(true));
      return wrap;
    }
  }
  // 旧テンプレート用フォールバック。
  const parts=[];
  for(const sel of ['.article_body','.article_bodymore','.article-body','.article-body-more','.entry-content']){
    const el=doc.querySelector(sel); if(el&&!parts.includes(el))parts.push(el);
  }
  if(!parts.length)return null;
  const wrap=doc.createElement('div');wrap.dataset.jin115BodyBundle='fallback';
  for(const el of parts)wrap.appendChild(el.cloneNode(true));
  return wrap;
}

function makeItsokuBodyBundle(doc, title='') {
  if(!doc?.body)return null;
  const wanted=rabbitTitleKey(title);
  let titleNode=null;
  for(const h of doc.querySelectorAll('h1,h2,h3,.article-title,.entry-title,.post-title')){
    const got=rabbitTitleKey(h.textContent||'');
    if(got&&wanted&&(got===wanted||got.includes(wanted)||wanted.includes(got))){titleNode=h;break;}
  }
  const entry=titleNode?.closest?.('.hentry,.article-outer,article,.article') || doc.querySelector('.hentry,.article-outer,article,.article');
  const scope=entry || doc.querySelector('#main,main,.column-inner-2,.main') || doc.body;
  const selectors=['.article-body-inner','#article-body-inner','.article-body-more','#article-body-more','[itemprop="articleBody"]','.article-body.entry-content','.article-body','.entry-content'];
  const parts=[];
  for(const sel of selectors){
    for(const el of scope.querySelectorAll(sel)){
      if(parts.some(x=>x===el||x.contains(el)))continue;
      for(let i=parts.length-1;i>=0;i--)if(el.contains(parts[i]))parts.splice(i,1);
      const len=cleanText(el.textContent||'').length, media=el.querySelectorAll('img,picture,blockquote,iframe,video').length;
      if(len>=40||media>0)parts.push(el);
    }
    if(parts.length)break;
  }
  if(!parts.length)return null;
  parts.sort((a,b)=>(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1);
  const wrap=doc.createElement('div');wrap.dataset.itsokuBodyBundle='1';for(const el of parts)wrap.appendChild(el.cloneNode(true));return wrap;
}

function rabbitTitleKey(text) {
  return cleanText(text)
    .replace(/[\s　]+/g, "")
    .replace(/[ｗw]+/gi, "w")
    .replace(/[!！?？…・･。、「」『』【】\[\]()（）]/g, "")
    .toLowerCase();
}

function pickRabbitThreadRegion(doc, scope) {
  if (!scope) return null;

  // ラビット速報の実レス見出しは
  // 「1：以下、？ちゃんねるからVIPがお送りします：2024/08/28 ...」のように
  // レス番号と日付の間へ投稿者名が入る。日付テキストを起点に、最小の
  // 「レス番号 + 投稿者名 + 日付」を含む祖先を拾って本文領域を逆算する。
  const parents = [];
  const seen = new Set();
  const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue || "";
    if (!THREAD_DATE_RE.test(text)) continue;

    let cur = node.parentElement;
    let picked = null;
    for (let depth = 0; cur && depth < 8; depth++, cur = cur.parentElement) {
      if (!scope.contains(cur)) break;
      if (cur.closest?.("#sub,#extra,.comment-list,.comments,.comment-body,#comments")) break;
      const len = cleanText(cur.textContent).length;
      const count = threadHeaderCount(cur);
      if (count >= 1 && len <= 1400) {
        picked = cur;
        break;
      }
    }
    if (!picked || seen.has(picked)) continue;
    seen.add(picked);
    parents.push(picked);
    if (parents.length >= 120) break;
  }

  // テキストノードが装飾タグで細かく分断されていても拾える最終保険。
  if (!parents.length) {
    for (const el of scope.querySelectorAll("li,dt,dd,p,div,section,span,font,b,strong")) {
      if (el.closest?.("#sub,#extra,.comment-list,.comments,.comment-body,#comments")) continue;
      const len = cleanText(el.textContent).length;
      if (len < 20 || len > 1400 || threadHeaderCount(el) < 1) continue;
      // より小さい子要素が同じレス見出しを持つなら親は採らない。
      const smaller = [...el.children].some(ch => cleanText(ch.textContent).length >= 20 && threadHeaderCount(ch) >= 1);
      if (smaller || seen.has(el)) continue;
      seen.add(el);
      parents.push(el);
      if (parents.length >= 120) break;
    }
  }
  if (!parents.length) return null;

  // 複数レスの親要素すべてを含む最小共通祖先を求める。
  let root = parents[0];
  for (let i = 1; i < parents.length && root; i++) {
    while (root && !root.contains(parents[i])) root = root.parentElement;
  }
  if (!root || !scope.contains(root)) root = scope;

  // 共通祖先がまだ広すぎる場合、ほぼ全レスを含む単一子要素へ可能な限り降りる。
  let changed = true;
  while (changed && root) {
    changed = false;
    const total = parents.filter(p => root.contains(p)).length;
    if (total < 2) break;
    let bestChild = null;
    let bestCount = 0;
    for (const child of root.children || []) {
      if (child.matches?.("#sub,#extra,.comment-list,.comments,#comments")) continue;
      const count = parents.reduce((n, p) => n + (child.contains(p) ? 1 : 0), 0);
      if (count > bestCount) {
        bestCount = count;
        bestChild = child;
      }
    }
    if (bestChild && bestCount >= 2 && bestCount / total >= 0.90) {
      root = bestChild;
      changed = true;
    }
  }

  const count = threadHeaderCount(root);
  const textLen = cleanText(root.textContent).length;
  const media = root.querySelectorAll("img,picture,pre,blockquote,table,iframe").length;
  if (count >= 2 || (count >= 1 && (textLen >= 80 || media >= 1))) return root;
  return null;
}

function makeRabbitBodyBundle(doc, scope) {
  if (!scope) return null;

  // v0.1.114: ラビット速報は長文ニュース型とレス型が混在し、本文が複数の兄弟領域へ
  // 分割される記事がある。最初の1領域だけで確定せず、同一記事内の本文領域をDOM順に束ねる。
  const partSelectors = [
    ".article-body-inner", "#article-body-inner",
    ".article-body-more", "#article-body-more",
    ".article-body", "#article-body", ".article_body", ".article_bodymore",
    "[itemprop='articleBody']", ".entry-content", ".entry-body", ".entry_body",
    ".article-content", ".articleContent", ".post-body"
  ];
  const parts=[];
  const add=(el)=>{
    if(!el || el===scope) return;
    if(el.closest?.('#sub,#extra,#comments,.comments,.comment-list,.comment-body,aside,footer,nav')) return;
    if(parts.some(x=>x===el || x.contains(el))) return;
    for(let i=parts.length-1;i>=0;i--) if(el.contains(parts[i])) parts.splice(i,1);
    const textLen=cleanText(el.textContent||'').length;
    const media=el.querySelectorAll('img,picture,pre,blockquote,table,iframe,video,source').length;
    if(textLen>=20 || media>0) parts.push(el);
  };
  for(const sel of partSelectors) for(const el of scope.querySelectorAll(sel)) add(el);

  if(parts.length){
    parts.sort((a,b)=>a===b?0:((a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1));
    const wrap=doc.createElement('div');wrap.dataset.rabbitBodyBundle='1';
    for(const el of parts) wrap.appendChild(el.cloneNode(true));
    const t=cleanText(wrap.textContent||'').length;
    const media=wrap.querySelectorAll('img,picture,pre,blockquote,table,iframe,video,source').length;
    const replies=Math.max(threadHeaderCount(wrap),simpleReplyCount(wrap));
    wrap.dataset.rabbitTextLen=String(t);wrap.dataset.rabbitReplyCount=String(replies);
    if(t>=40 || media>0 || replies>=1) return wrap;
  }

  // class名変更時の保険。タイトル所属記事のうち、本文らしい最大候補を1つだけ使う。
  let best=null,bestScore=-1;
  for(const el of scope.querySelectorAll('section,div,article')){
    if(el.closest?.('#sub,#extra,#comments,.comments,.comment-list,.comment-body,aside,footer,nav')) continue;
    const t=cleanText(el.textContent||'').length;
    const media=el.querySelectorAll('img,picture,blockquote,iframe,video').length;
    const replies=Math.max(threadHeaderCount(el),simpleReplyCount(el));
    const links=el.querySelectorAll('a[href]').length;
    if(t<40 && media===0 && replies===0) continue;
    const score=Math.min(t,30000)+media*500+replies*1500-links*10;
    if(score>bestScore){bestScore=score;best=el;}
  }
  if(best){const wrap=doc.createElement('div');wrap.dataset.rabbitBodyBundle='fallback';wrap.appendChild(best.cloneNode(true));return wrap;}
  return null;
}

function pickRabbitArticleRoot(doc, title, preferBody=false) {
  // ラビット速報は #sub / #extra がカテゴリ一覧を大量に持つため、
  // ページ全体のスコア競争に任せず、タイトルのあるメインカラムから本文を確定する。
  const main = doc.querySelector(".column-inner-2") || doc.querySelector("#main") || doc.querySelector("main");
  const wanted = rabbitTitleKey(title);

  let titleNode = null;
  if (wanted) {
    const titleCandidates = main
      ? main.querySelectorAll("h1,h2,h3,.article-title,.entry-title,a[href]")
      : doc.querySelectorAll("h1,h2,h3,.article-title,.entry-title");
    for (const el of titleCandidates) {
      const got = rabbitTitleKey(el.textContent);
      if (!got) continue;
      if (got === wanted || got.includes(wanted) || wanted.includes(got)) {
        titleNode = el;
        break;
      }
    }
  }

  // タイトルの所属記事を最優先。これでサイドバーのカテゴリ一覧を本文にしない。
  let entry = titleNode?.closest?.(".hentry,.article-outer,article") || null;
  if (!entry && main) {
    entry = main.querySelector(".hentry,.article-outer,article") || null;
  }

  for (const scope of [entry, main]) {
    // ラビット速報は現在、番号レス型だけでなく長文ニュース/X/YouTube型の記事も多い。
    // そのためサイト自身の article-body を最優先し、汎用のレス数判定へ戻さない。
    if(preferBody){
      const body=makeRabbitBodyBundle(doc,scope);if(body)return body;
      const threadRegion=pickRabbitThreadRegion(doc,scope);if(threadRegion)return threadRegion;
    }else{
      const threadRegion=pickRabbitThreadRegion(doc,scope);if(threadRegion)return threadRegion;
      const body=makeRabbitBodyBundle(doc,scope);if(body)return body;
    }
  }

  // クラス構造が変わっても、タイトルから一番近い「レス本文を含む祖先」を使う。
  if (titleNode) {
    let cur = titleNode.parentElement;
    while (cur && cur !== doc.body) {
      if (cur.matches?.("#sub,#extra")) break;
      const textLen = cleanText(cur.textContent).length;
      const media = cur.querySelectorAll("img,picture,pre,blockquote,table,iframe").length;
      const threads = threadHeaderCount(cur);
      const links = cur.querySelectorAll("a[href]").length;
      if ((threads >= 1 || media >= 1) && textLen >= 40 && links < 120) return cur;
      if (cur === main) break;
      cur = cur.parentElement;
    }
  }

  // 最終保険でも、サイドバーを含む body は返さずメインカラムまでに限定。
  return main || null;
}

function cleanupNews4vipQuality(container, baseUrl='') {
  if(!container || !isNews4vipQualityUrl(baseUrl)) return;
  const c=x=>cleanText(x||'');
  const replyRe=/^(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/;
  const sourceLabel=/^(?:引用元|元スレ|転載元)\s*[:：]/;
  const sourceUrl=/(?:https?:\/\/)?(?:[^\s/]+\.)?(?:5ch\.net|5ch\.io|2ch\.net|bbspink\.com|open2ch\.net)\/test\/read\.cgi\//i;
  const leadMetaExact=[
    /^人気記事(?:\s*[（(]\s*画像付\s*[）)])?$/i,
    /^20\d{2}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{2})?$/,
    /^コメント\s*[（(]?\s*\d*\s*[）)]?$/i,
  ];
  const isReply=el=>!!el&&replyRe.test(c(el.textContent));
  const all=[...container.querySelectorAll('div,p,li,span,font,b,strong,small,td')];
  const firstReply=all.find(el=>isReply(el) && ![...el.children].some(ch=>isReply(ch))) || all.find(isReply) || null;
  const beforeFirst=node=>{
    if(!firstReply||!node)return true;
    if(node===firstReply||node.contains?.(firstReply))return false;
    return !!(node.compareDocumentPosition(firstReply)&Node.DOCUMENT_POSITION_FOLLOWING);
  };

  const walker=document.createTreeWalker(container,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
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

  const parents=[container,...container.querySelectorAll('p,div,li,blockquote,td')];
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
  for(const el of [...container.querySelectorAll('p,div,li,blockquote')]){
    if(!el.isConnected)continue;const t=c(el.textContent);if(!sourceLabel.test(t))continue;
    const hrefs=[...el.querySelectorAll('a[href]')].map(a=>a.href||a.getAttribute('href')||'');
    if((sourceUrl.test(t)||hrefs.some(h=>sourceUrl.test(h)))&&!isReply(el))el.remove();
  }

  const replies=[...container.querySelectorAll('div,p,li,span,font,td')].filter(el=>isReply(el)&&![...el.children].some(ch=>isReply(ch)));
  const last=replies[replies.length-1]||null;
  if(last){
    const after=node=>node!==last&&!node.contains?.(last)&&!!(last.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING);
    const tail=[...container.querySelectorAll('a,button,span,div,p,li,ul,ol,nav,small,b,strong')].filter(after);
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

function pickArticleRoot(doc) {
  const selectors = [
    "[itemprop='articleBody']",
    ".article-body-inner",
    ".article-body-more",
    ".article-body.entry-content",
    ".article-body",
    ".articleBody",
    ".article_body",
    ".article-content",
    ".articleContent",
    ".entry-content",
    ".entry-body",
    ".entry_body",
    ".entrybody",
    ".post-body",
    ".postBody",
    ".blogbody",
    ".articleText",
    "#articleBody",
    "#article-body",
    "#article-body-inner",
    "article"
  ];

  const set = new Set();
  for (const s of selectors) {
    for (const el of doc.querySelectorAll(s)) set.add(el);
  }

  // 2ch/5chまとめではレス番号＋日時を多く含む箱を優先する。
  // 既知の本文selectorで十分な候補がある時は、全div総当たりをしない。
  // 大きいまとめ記事でここが数秒の同期停止になるため。
  const exactHasThread = [...set].some(el => threadHeaderCount(el) >= 2);
  if (!exactHasThread) {
    for (const el of doc.querySelectorAll("main, article, section, div")) {
      const raw = el.textContent || "";
      if (raw.length < 180 || !THREAD_DATE_RE.test(raw)) continue;
      if (threadHeaderCount(el) >= 2) set.add(el);
    }
  }

  let threadBest = null;
  let threadBestCount = 0;
  let threadBestLen = Infinity;
  let threadBestDepth = -1;

  for (const el of set) {
    const count = threadHeaderCount(el);
    if (!count) continue;
    const len = cleanText(el.textContent).length;
    const depth = nodeDepth(el);
    if (
      count > threadBestCount ||
      (count === threadBestCount && len < threadBestLen) ||
      (count === threadBestCount && len === threadBestLen && depth > threadBestDepth)
    ) {
      threadBest = el;
      threadBestCount = count;
      threadBestLen = len;
      threadBestDepth = depth;
    }
  }
  if (threadBest) return threadBest;

  if (!set.size) {
    for (const el of doc.querySelectorAll("main, section, div")) {
      if (cleanText(el.textContent).length > 500) set.add(el);
    }
  }

  let best = null, bestScore = -Infinity;
  for (const el of set) {
    const score = scoreNode(el);
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}

function declaredImageSize(img) {
  const attrW = Number.parseFloat(img?.getAttribute?.("width") || "") || 0;
  const attrH = Number.parseFloat(img?.getAttribute?.("height") || "") || 0;
  const style = img?.getAttribute?.("style") || "";
  const sw = Number.parseFloat(style.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1] || "") || 0;
  const sh = Number.parseFloat(style.match(/(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1] || "") || 0;
  return {w: attrW || sw, h: attrH || sh};
}

function rawImageUrl(img, base) {
  const raw =
    img?.getAttribute?.("data-src") ||
    img?.getAttribute?.("data-original") ||
    img?.getAttribute?.("data-lazy-src") ||
    img?.getAttribute?.("data-lazy") ||
    img?.getAttribute?.("data-echo") ||
    img?.getAttribute?.("src") || "";
  return absUrl(raw, base) || raw;
}

function looksLikeGoogleChromeLogoImage(img, base) {
  if (!img) return false;
  const src = rawImageUrl(img, base).toLowerCase();
  const alt = cleanText(`${img.getAttribute("alt") || ""} ${img.getAttribute("title") || ""}`).toLowerCase();
  const strongSrc = /(?:google(?:[_-]?logo)|logo[_-]?google|chrome(?:[_-]?logo)|logo[_-]?chrome|google[_-]?chrome|chrome[_-]?icon)/i.test(src);
  const strongAlt = /^(?:google|google chrome|chrome|google ロゴ|chrome ロゴ)$/i.test(alt);
  return strongSrc || strongAlt;
}

function hydrateInstagramLiveEmbeds(root){
  if(!root||PREPARING)return;
  for(const card of root.querySelectorAll('[data-instagram-post-url]')){
    if(card.querySelector('img,iframe.instagram-live-embed'))continue;
    const raw=String(card.dataset.instagramPostUrl||'').trim();
    let canonical='';
    try{
      const u=new URL(raw,location.href),h=u.hostname.toLowerCase().replace(/^www\./,'');
      const m=u.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      if((h==='instagram.com'||h.endsWith('.instagram.com'))&&m)canonical=`https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/`;
    }catch{}
    if(!canonical)continue;
    if(!card.classList.contains('instagram-static-card'))card.classList.add('instagram-static-card');
    const frame=document.createElement('iframe');frame.className='instagram-live-embed';frame.src=canonical+'embed/';frame.title='Instagram投稿';frame.loading='lazy';frame.scrolling='no';frame.setAttribute('allowtransparency','true');frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
    const fallback=card.querySelector('.instagram-static-fallback');if(fallback)fallback.replaceWith(frame);else card.prepend(frame);
  }
}

function isGoogleChromeDestination(rawHref, base) {
  const href = absUrl(rawHref, base);
  if (!href) return false;
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    const path = (u.pathname + u.search).toLowerCase();
    if (/(^|\.)google\.(?:com|co\.jp)$/.test(host) && /(?:\/chrome(?:\/|$)|chrome\/download|products\/chrome)/.test(path)) return true;
    if (host === "play.google.com" && /(?:chrome|com\.android\.chrome)/.test(path)) return true;
    if (host === "apps.apple.com" && /google-chrome|chrome/i.test(path)) return true;
  } catch {}
  return false;
}

function hasGoogleChromeCta(text) {
  const t = cleanText(text).toLowerCase();
  if (!/(?:google\s*chrome|chrome|google)/i.test(t)) return false;
  return /(?:ダウンロード|download|インストール|install|入手|使う|開く|ブラウザ|検索|アプリ|高速|安全|無料|今すぐ|詳しく)/i.test(t);
}




function instagramPostInfoFromElement(el, base="") {
  if (!el) return null;
  let raw='';
  if (el.tagName==='BLOCKQUOTE') raw=el.getAttribute('data-instgrm-permalink')||'';
  if (!raw && el.tagName==='IFRAME') raw=el.getAttribute('src')||'';
  if (!raw) raw=el.querySelector?.('a[href*="instagram.com/p/"],a[href*="instagram.com/reel/"],a[href*="instagram.com/tv/"]')?.getAttribute('href')||'';
  const href=absUrl(raw,base); if(!href)return null;
  try{
    const u=new URL(href);const h=u.hostname.toLowerCase().replace(/^www\./,'');
    if(h!=='instagram.com'&&!h.endsWith('.instagram.com'))return null;
    const m=u.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);if(!m)return null;
    return {provider:'instagram',kind:m[1].toLowerCase(),id:m[2],url:`https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/`};
  }catch{return null;}
}
function protectInstagramEmbeds(container, base="") {
  if(!container)return;
  const nodes=[...container.querySelectorAll('blockquote.instagram-media[data-instgrm-permalink],iframe.instagram-media[src],iframe[src*="instagram.com/p/"],iframe[src*="instagram.com/reel/"],iframe[src*="instagram.com/tv/"]')];
  const seen=new Set();
  for(const el of nodes){
    const info=instagramPostInfoFromElement(el,base);if(!info||seen.has(info.id)){if(info)el.remove();continue;}seen.add(info.id);
    const ph=container.ownerDocument.createElement('div');
    ph.className='instagram-embed-placeholder';ph.dataset.instagramPreserve='1';ph.dataset.instagramPostId=info.id;ph.dataset.instagramPostUrl=info.url;ph.dataset.instagramKind=info.kind;
    if(el.closest?.('[data-required-reply="1"]')) ph.dataset.requiredMedia='1';
    const a=container.ownerDocument.createElement('a');a.href=info.url;a.textContent='Instagram投稿';ph.appendChild(a);
    el.replaceWith(ph);
  }
}

function isXEmbedIframe(el, base="") {
  if (!el || el.tagName !== "IFRAME") return false;
  const src = absUrl(el.getAttribute("src") || "", base);
  if (!src) return false;
  try {
    const u = new URL(src);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = (u.pathname + u.search).toLowerCase();
    return (
      h === "platform.twitter.com" ||
      h === "syndication.twitter.com" ||
      h === "twitter.com" || h.endsWith(".twitter.com") ||
      h === "x.com" || h.endsWith(".x.com")
    ) && /(?:tweet|embed|widgets|timeline|status)/.test(path);
  } catch {}
  return false;
}

function isXEmbedBlockquote(el) {
  if (!el || el.tagName !== "BLOCKQUOTE") return false;
  const key = `${el.className || ""} ${el.id || ""}`.toLowerCase();
  if (/twitter[-_ ]?tweet|tweet[-_ ]?embed|x[-_ ]?tweet/.test(key)) return true;
  if (el.hasAttribute("data-tweet-id") || el.hasAttribute("data-twitter-extracted-i")) return true;
  return [...el.querySelectorAll("a[href]")].some(a => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    return /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^/]+\/status\//.test(href);
  });
}

function protectXEmbeds(container, base="") {
  if (!container) return;
  const embeds = [
    ...container.querySelectorAll("blockquote"),
    ...container.querySelectorAll("iframe[src]")
  ].filter(el => isXEmbedBlockquote(el) || isXEmbedIframe(el, base));

  for (const el of embeds) {
    el.setAttribute("data-x-embed-preserve", "1");
    let cur = el.parentElement;
    let depth = 0;
    while (cur && cur !== container && depth++ < 5) {
      cur.setAttribute("data-x-embed-ancestor", "1");
      cur = cur.parentElement;
    }
  }
}

function isAffiliateAdUrl(rawUrl, base="") {
  const href = absUrl(rawUrl, base);
  if (!href) return false;
  try {
    const u = new URL(href);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    const p = (u.pathname + u.search).toLowerCase();

    // まとめサイトで本文中に混ざりやすいアフィリエイト/広告配信先。
    if (/(^|\.)hb\.afl\.rakuten\.co\.jp$/.test(h)) return true;
    if (/(^|\.)affiliate\.rakuten\.co\.jp$/.test(h)) return true;
    if (/(^|\.)ad2\.trafficgate\.net$/.test(h)) return true;
    if (/(^|\.)ck\.jp\.ap\.valuecommerce\.com$/.test(h)) return true;
    if (/(^|\.)af\.moshimo\.com$/.test(h)) return true;
    if (/(^|\.)px\.a8\.net$/.test(h)) return true;
    if (/(^|\.)amazon-adsystem\.com$/.test(h)) return true;
    if (/(^|\.)googlesyndication\.com$/.test(h)) return true;
    if (/(^|\.)doubleclick\.net$/.test(h)) return true;
    if (/(^|\.)adservice\.google\./.test(h)) return true;
    if (/(^|\.)i-mobile\.co\.jp$/.test(h)) return true;
    if (/(^|\.)nend\.net$/.test(h)) return true;
    if (/(^|\.)ad-stir\.com$/.test(h)) return true;
    if (/(^|\.)microad\./.test(h)) return true;
    if (/(^|\.)criteo\./.test(h)) return true;

    // 通常の商品リンクまで消さないよう、楽天/Amazon本体は
    // 明確なアフィリエイト識別子がある場合だけ広告扱いにする。
    if (/(^|\.)rakuten\.co\.jp$/.test(h) && /(?:scid=af_|\bafl\b|affiliate|linkshare)/.test(p)) return true;
    if (/(^|\.)amazon\.co\.jp$/.test(h) && /(?:[?&]tag=|ascsubtag=|linkcode=)/.test(p)) return true;
    if (h === "amzn.to") return true;
  } catch {}
  return false;
}


function collectJin115MediaThumbs(scope, base="", maxItems=4) {
  if (!scope) return [];
  const out = [];
  const seen = new Set();
  for (const img of scope.querySelectorAll("img")) {
    let src = rawImageUrl(img, base);
    if (!src) continue;
    const linkHref = img.closest("a[href]")?.getAttribute("href") || "";
    if (isAffiliateAdUrl(src, base) || isAffiliateAdUrl(linkHref, base)) continue;
    const alt = cleanText(img.getAttribute("alt") || "");
    const {w, h} = declaredImageSize(img);
    if ((w && w < 70) || (h && h < 70)) continue;
    if (/avatar|icon|emoji|logo|button|follow/i.test(`${src} ${alt}`)) continue;
    src = absUrl(src, base);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
    if (out.length >= maxItems) break;
  }
  return out;
}

function collectJin115XPosts(root, base="", maxPosts=12) {
  if (!root) return [];
  const posts = [];
  const seen = new Set();

  for (const a of root.querySelectorAll("a[href]")) {
    const href = absUrl(a.getAttribute("href") || "", base) || "";
    if (!isXStatusHref(href, base) || seen.has(href)) continue;
    seen.add(href);

    let text = "";
    let media = [];
    let mediaHint = false;
    const quote = a.closest("blockquote");
    if (quote) {
      const p = quote.querySelector("p");
      const rawQuoteText = cleanText(p?.textContent || quote.textContent || "");
      mediaHint = /pic\.twitter\.com\/|video|動画/i.test(rawQuoteText);
      text = rawQuoteText;
      media = collectJin115MediaThumbs(quote, base, 4);
    }

    // blockquote の形でない古い埋め込みもあるため、statusリンクの近傍から
    // 投稿本文らしい小さな箱を拾う。広告や記事全体までは広げない。
    if (text.length < 12 || media.length === 0) {
      let cur = a.parentElement;
      for (let depth=0; cur && cur!==root && depth<5; depth++, cur=cur.parentElement) {
        const t = cleanText(cur.textContent || "");
        const links = cur.querySelectorAll("a[href]").length;
        const imgs = cur.querySelectorAll("img,picture").length;
        if (t.length >= 20 && t.length <= 2200 && links <= 12 && imgs <= 12) {
          if (text.length < 12) text = t;
          if (/pic\.twitter\.com\/|video|動画/i.test(t)) mediaHint = true;
          if (!media.length) media = collectJin115MediaThumbs(cur, base, 4);
          if (text.length >= 12 && media.length) break;
        }
      }
    }

    // status URLや定型リンクだけしか無い場合は、後でoEmbedから本文を補完する。
    text = text
      .replace(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s]+/ig, " ")
      .replace(/pic\.twitter\.com\/\S+/ig, " ")
      .replace(/\s+/g, " ")
      .trim();

    posts.push({url: href, text, media, mediaHint});
    if (posts.length >= maxPosts) break;
  }
  return posts;
}

async function fetchXPostOEmbed(statusUrl) {
  try {
    const endpoint = `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(statusUrl)}`;
    const res = await fetch(endpoint, {cache:"force-cache", credentials:"omit", redirect:"follow"});
    if (!res.ok) return null;
    const data = await res.json();
    const d = new DOMParser().parseFromString(data?.html || "", "text/html");
    const quote = d.querySelector("blockquote");
    const p = quote?.querySelector("p");
    let text = cleanText(p?.textContent || quote?.textContent || "");
    text = text
      .replace(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s]+/ig, " ")
      .replace(/pic\.twitter\.com\/\S+/ig, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      url: statusUrl,
      text,
      author: cleanText(data?.author_name || "")
    };
  } catch {
    return null;
  }
}

function xStatusId(url) {
  const m = String(url || "").match(/\/status\/(\d+)/i);
  return m ? m[1] : "";
}

function makeXMediaEmbed(post) {
  const id = xStatusId(post?.url || "");
  if (!id || !post?.mediaHint) return null;
  const wrap = document.createElement("div");
  wrap.className = "x-official-embed-wrap";
  const frame = document.createElement("iframe");
  frame.className = "x-official-embed";
  frame.src = `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(id)}&dnt=true&theme=light`;
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("title", "X投稿メディア");
  frame.setAttribute("scrolling", "no");
  frame.setAttribute("frameborder", "0");
  frame.setAttribute("allowfullscreen", "true");
  wrap.appendChild(frame);
  return wrap;
}

function makeStaticXCard(post) {
  const card = document.createElement("div");
  card.className = "x-static-card";
  card.dataset.xStaticUrl = post.url || "";

  if (post.author) {
    const author = document.createElement("div");
    author.className = "x-static-author";
    author.textContent = post.author;
    card.appendChild(author);
  }

  const body = document.createElement("div");
  body.className = "x-static-text";
  body.textContent = post.text || "X投稿";
  card.appendChild(body);

  if (post.media && post.media.length) {
    const media = document.createElement("div");
    media.className = "x-static-media";
    for (const src of post.media.slice(0, 4)) {
      const img = document.createElement("img");
      img.className = "x-static-thumb";
      img.src = src;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.alt = "投稿画像";
      media.appendChild(img);
    }
    card.appendChild(media);
  } else {
    const official = makeXMediaEmbed(post);
    if (official) card.appendChild(official);
  }

  if (post.url) {
    const a = document.createElement("a");
    a.className = "x-static-link";
    a.href = post.url;
    a.target = "_self";
    a.rel = "noopener";
    a.textContent = "Xで投稿を開く";
    card.appendChild(a);
  }
  return card;
}

function findReactionInsertPoint(container) {
  if (!container) return null;
  const re = /＜\s*ネット(?:で)?の反応\s*＞|<\s*ネット(?:で)?の反応\s*>|ネット(?:で)?の反応|(?:＜|<)?\s*この[^＜<>\n]{1,24}への反応\s*(?:＞|>)?/i;
  const els = [...container.querySelectorAll("h1,h2,h3,h4,h5,p,div,section,span,b,strong")];
  for (const el of els) {
    const t = cleanText(el.textContent || "");
    if (!re.test(t)) continue;
    if ([...el.children].some(ch => re.test(cleanText(ch.textContent || "")))) continue;
    return el;
  }
  return null;
}

async function restoreJin115XPosts(container, rawRoot, base) {
  if (!container || !rawRoot || !isJin115Url(base)) return;

  // 既に本文として残っているX投稿は二重化しない。
  const existing = new Set();
  for (const a of container.querySelectorAll("a[href]")) {
    const href = absUrl(a.getAttribute("href") || "", base) || "";
    if (isXStatusHref(href, base)) existing.add(href);
  }

  const rawPosts = collectJin115XPosts(rawRoot, base, 12).filter(p => !existing.has(p.url));
  if (!rawPosts.length) return;

  const filled = await Promise.all(rawPosts.map(async post => {
    if (post.text && post.text.length >= 24) return post;
    const remote = await fetchXPostOEmbed(post.url);
    return remote && remote.text ? {...post, ...remote, media: (post.media && post.media.length) ? post.media : (remote.media || [])} : post;
  }));

  const usable = filled.filter(p => p && (p.text || p.url));
  if (!usable.length) return;

  const section = document.createElement("section");
  section.className = "x-static-section";
  for (const post of usable) section.appendChild(makeStaticXCard(post));

  const before = findReactionInsertPoint(container);
  if (before?.parentNode) before.parentNode.insertBefore(section, before);
  else container.appendChild(section);
}


function findJin115ReactionMarker(doc) {
  if (!doc?.body) return null;
  const re = /(?:＜|<)?\s*(?:この記事への反応|この記事の反応|この記事へのコメント(?:要約)?|この[^＜<>\n]{1,24}への反応|この[^＜<>\n]{1,24}の反応|ネット(?:で)?の反応|みんなの反応|ユーザーの反応|読者の反応)\s*(?:＞|>)?/i;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const t = cleanText(node.nodeValue || "");
    if (!re.test(t)) continue;
    let el = node.parentElement;
    if (!el) continue;
    // 同じ見出しを包む親が何重にもある場合は最も内側を使う。
    while (el.firstElementChild && cleanText(el.textContent) === cleanText(el.firstElementChild.textContent)) {
      el = el.firstElementChild;
    }
    hits.push(el);
  }
  return hits[0] || null;
}

function findJin115ReactionMarkerTextNode(doc) {
  if (!doc?.body) return null;
  const re = /(?:＜|<)?\s*(?:この記事への反応|この記事の反応|この記事へのコメント(?:要約)?|この[^＜<>\n]{1,24}への反応|この[^＜<>\n]{1,24}の反応|ネット(?:で)?の反応|みんなの反応|ユーザーの反応|読者の反応)\s*(?:＞|>)?/i;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let best = null;
  let bestLen = Infinity;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const t = cleanText(node.nodeValue || "");
    if (!re.test(t)) continue;
    // 見出しそのものに近い短いテキストノードを優先。
    if (t.length < bestLen) { best = node; bestLen = t.length; }
    if (t.length <= 40) break;
  }
  return best;
}

function findFollowingJin115Stop(marker, doc) {
  if (!marker || !doc?.body) return null;
  // 「この記事へのコメント」は記事本文側の反応見出しにも使われるため終端にしない。
  // 明確な投稿フォーム/関連記事/フッターだけを終端として扱う。
  const stopText = /^(?:コメント一覧|コメントする|コメントフォーム|関連記事|おすすめ記事(?:\d+)?|おすすめ|人気記事|注目記事|この記事の関連タグ[:：]?|今週の人気記事|その他おすすめサイト)$/;
  const nodes = [...doc.body.querySelectorAll('h1,h2,h3,h4,h5,section,div,p,aside,footer,form')];
  for (const el of nodes) {
    if (el === marker || marker.contains(el) || el.contains(marker)) continue;
    const pos = marker.compareDocumentPosition(el);
    if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const key = `${el.id || ''} ${el.className || ''}`.toLowerCase();
    const t = cleanText(el.textContent || '');
    if (stopText.test(t)) return el;
    // 反応欄・AAの直後に始まるAmazon/Rakutenセール文を本文終端として扱う。
    // 親要素の全文で誤判定しないよう、短い小要素だけを対象にする。
    const childSame = [...el.children].some(ch => cleanText(ch.textContent || '') === t && t.length > 0);
    const promoStart = /^(?:↓|！|!|【|『|「)?.{0,90}(?:全巻|ポイント還元|セール|激安|予約開始|Amazon|楽天).{0,120}$/i.test(t);
    if (!childSame && t.length <= 260 && promoStart) return el;
    // genericな comment/comments は記事内の「ネットの反応」にも使われるので止めない。
    if (/(?:comment-form|commentform|reply-form|respond|trackback|related|recommend|pickup|ranking|archive|footer)/.test(key)) {
      if (t.length < 8000) return el;
    }
  }
  return null;
}

function normalizeTailSignature(s) {
  return cleanText(s || '').replace(/[\s　]+/g, '').replace(/[!！?？。、・:：]/g, '').slice(0, 180);
}

function removeJin115TailLinkAds(container, base="") {
  if (!container) return;

  // 反応欄やAAの後ろに連結される「赤字の関連記事/広告リンク集」を除去する。
  // コメント本文やXカードを巻き込まないよう、リンク密度が高い小さな箱だけ対象。
  const nodes = [...container.querySelectorAll("div,section,p,ul,ol,li,table,tbody,tr,td")].reverse();
  for (const el of nodes) {
    if (!container.contains(el)) continue;
    if (el.querySelector(".x-static-card,.x-static-section,[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card,iframe[src*='twitter.com'],iframe[src*='x.com']")) continue;
    if (el.querySelector("pre") || /(?:やる夫|やらない夫)/i.test(cleanText(el.textContent || ""))) continue;

    const text = cleanText(el.textContent || "");
    if (!text || text.length > 5000) continue;
    const links = [...el.querySelectorAll("a[href]")];
    if (links.length < 5) continue;
    const imgCount = el.querySelectorAll("img,picture").length;
    if (imgCount > 2) continue;

    const shortLinks = links.filter(a => {
      const t = cleanText(a.textContent || "");
      return t.length >= 6 && t.length <= 220;
    });
    if (shortLinks.length < 5) continue;

    const anchorChars = shortLinks.reduce((n,a) => n + cleanText(a.textContent || "").length, 0);
    const ratio = anchorChars / Math.max(1, text.length);
    const promoWords = /(?:おすすめ|関連記事|人気記事|注目記事|セール|激安|キャンペーン|発売|予約|Amazon|楽天|PS[345]|Switch|ゲーム|漫画|アニメ)/i.test(text);
    const inlineRed = [...el.querySelectorAll("a,span,font,strong,b")].filter(n => {
      const st = String(n.getAttribute?.("style") || "").toLowerCase();
      const c = String(n.getAttribute?.("color") || "").toLowerCase();
      return /color\s*:\s*(?:#?f00|#?ff0000|red)/.test(st) || /^(?:#?f00|#?ff0000|red)$/.test(c);
    }).length;

    if (ratio >= 0.42 || promoWords || inlineRed >= 3) {
      // さらに内側に同条件の子があるなら、親ごと消さず子に任せる。
      const childCandidate = [...el.children].some(ch => {
        const l = ch.querySelectorAll?.("a[href]")?.length || 0;
        const t = cleanText(ch.textContent || "");
        return l >= 5 && t.length <= text.length * 0.9;
      });
      if (!childCandidate) el.remove();
    }
  }

  // 1リンク=1行で別々の箱になっている赤字広告もある。
  // AA/コメント本文の後ろで、メディアを挟まず小さなリンク行が5件以上連続するなら
  // その先は広告・関連記事の末尾としてまとめて切る。
  const allLinks = [...container.querySelectorAll("a[href]")];
  if (allLinks.length >= 5) {
    // table は広告一覧そのものに使われることがあるので「本文メディア」扱いしない。
    // 画像・AA・Xカードなど、本当に残したいメディアの最後を基準にする。
    const protectedMedia = [...container.querySelectorAll(
      "img,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card"
    )].filter(el => !el.closest("[data-jin115-tail-promo='1']"));
    const lastMedia = protectedMedia[protectedMedia.length - 1] || null;

    const afterLastMedia = a => {
      if (!lastMedia) return true;
      return !!(lastMedia.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    };

    const smallLinkRow = a => {
      if (!afterLastMedia(a)) return false;
      // 広告末尾は table/tr/td で1行ずつ組まれる記事がある。
      const row = a.closest("tr,p,li,div,section,td") || a;
      const t = cleanText(row.textContent || "");
      const media = row.querySelectorAll("img,picture,pre,blockquote,iframe").length;
      if (media > 0 || !t || t.length > 520) return false;
      const href = absUrl(a.getAttribute("href") || "", base) || "";
      if (isXStatusHref(href, base)) return false;
      const at = cleanText(a.textContent || "");
      if (at.length < 6) return false;

      // 赤字見出し・セール/発売系文言・短いニュース見出しのいずれか。
      const style = String(a.getAttribute("style") || "").toLowerCase();
      const color = String(a.getAttribute("color") || "").toLowerCase();
      const red = /color\s*:\s*(?:#?f00|#?ff0000|red)/.test(style) || /^(?:#?f00|#?ff0000|red)$/.test(color) || !!a.closest("font[color='red'],font[color='#ff0000'],font[color='#f00']");
      const promo = /(?:おすすめ|話題|最強|新刊|発売|セール|激安|キャンペーン|予約|PS[345]|Switch|アニメ|漫画|ゲーム|イヤホン|マットレス|ジェットウォッシャー)/i.test(t);
      return red || promo || at.length <= 220;
    };

    let run = [];
    let firstPromo = null;
    for (const a of allLinks) {
      if (!smallLinkRow(a)) continue;
      const row = a.closest("tr,p,li,div,section,td") || a;
      const prev = run[run.length - 1];
      if (prev && prev !== row) {
        // 候補間に本文画像・AA・Xカードや長い文章が入れば広告列ではない。
        const r = document.createRange();
        try {
          r.setStartAfter(prev);
          r.setEndBefore(row);
          const tmp = document.createElement("div");
          tmp.appendChild(r.cloneContents());
          const gapMedia = tmp.querySelectorAll("img,picture,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length;
          const gapText = cleanText(tmp.textContent || "");
          if (gapMedia > 0 || gapText.length > 800) run = [];
        } catch {}
      }
      if (!run.includes(row)) run.push(row);
      if (run.length >= 5) {
        firstPromo = run[0];
        break;
      }
    }

    if (firstPromo) {
      try {
        const range = document.createRange();
        range.setStartBefore(firstPromo);
        range.setEnd(container, container.childNodes.length);
        range.deleteContents();
      } catch {
        let cur = firstPromo;
        while (cur) {
          const next = cur.nextSibling;
          cur.remove();
          cur = next;
        }
      }
    }
  }

  // 末尾に独立したリンク集が残った場合は従来の保険処理もかける。
  trimLinkFarmTail(container);
}

function restoreJin115ReactionTail(container, rawDoc, base) {
  if (!container || !rawDoc || !isJin115Url(base)) return;
  const marker = findJin115ReactionMarker(rawDoc);
  if (!marker) return;

  // 既に十分な反応欄が入っている場合でも、AAだけ後ろに分離していることがあるため
  // 元HTMLから反応見出し以降を作り直し、重複テキストを避けて不足分だけ末尾に追加する。
  const stop = findFollowingJin115Stop(marker, rawDoc);
  const range = rawDoc.createRange();
  try {
    range.setStartBefore(marker);
    if (stop) range.setEndBefore(stop);
    else range.setEnd(rawDoc.body, rawDoc.body.childNodes.length);
  } catch {
    return;
  }

  const holder = rawDoc.createElement('div');
  holder.setAttribute('data-jin115-reaction-tail', '1');
  holder.appendChild(range.cloneContents());

  // 巨大なページ末尾を誤って取った場合は、反応欄に近い小さい祖先を優先して作り直す。
  const rawLen = cleanText(holder.textContent).length;
  if (rawLen > 18000) {
    let cur = marker;
    let best = null;
    for (let depth=0; cur && cur!==rawDoc.body && depth<8; depth++, cur=cur.parentElement) {
      const t = cleanText(cur.textContent || '');
      const media = cur.querySelectorAll('img,picture,pre,blockquote,table,iframe').length;
      if (t.length >= 60 && t.length <= 18000 && (media >= 1 || /反応/.test(t))) best = cur;
    }
    if (best) {
      holder.replaceChildren(best.cloneNode(true));
    }
  }

  const clean = sanitize(holder, base);
  const tail = document.createElement('section');
  tail.className = 'jin-reaction-tail';
  tail.append(...clean.childNodes);
  compactWhitespace(tail);
  removeJin115TailLinkAds(tail, base);
  compactWhitespace(tail);

  const tailText = cleanText(tail.textContent);
  const tailMedia = tail.querySelectorAll('img,picture,pre,blockquote,table,iframe').length;
  if (tailText.length < 20 && tailMedia === 0) return;

  const existingText = cleanText(container.textContent);
  const sig = normalizeTailSignature(tailText);
  const existingNorm = normalizeTailSignature(existingText);

  // 反応欄の先頭が既存本文に含まれている場合は、重複するテキスト箱を削り、
  // 画像/AAだけ不足しているケースを補う。
  if (sig && existingText.replace(/[\s　]+/g, '').includes(sig.slice(0, Math.min(80, sig.length)))) {
    const currentImgs = new Set([...container.querySelectorAll('img')].map(img => rawImageUrl(img, base)).filter(Boolean));
    const mediaOnly = document.createElement('section');
    mediaOnly.className = 'jin-reaction-tail jin-reaction-media-only';
    for (const el of tail.querySelectorAll('img,pre')) {
      if (el.tagName === 'IMG') {
        const src = rawImageUrl(el, base);
        if (!src || currentImgs.has(src)) continue;
        currentImgs.add(src);
      }
      mediaOnly.appendChild(el.cloneNode(true));
    }
    if (mediaOnly.childNodes.length) container.appendChild(mediaOnly);
    return;
  }

  container.appendChild(tail);
}


function restoreJin115ReactionFallback(container, rawDoc, base) {
  if (!container || !rawDoc || !isJin115Url(base)) return;
  const marker = findJin115ReactionMarker(rawDoc);
  const markerTextNode = findJin115ReactionMarkerTextNode(rawDoc);
  if (!marker || !markerTextNode) return;

  const isAfter = el => {
    const pos = markerTextNode.compareDocumentPosition(el);
    return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING) || !!(pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
  };
  const existingText = cleanText(container.textContent || '').replace(/[\s　]+/g, '');
  const existingImgs = new Set([...container.querySelectorAll('img')].map(img => rawImageUrl(img, base)).filter(Boolean));

  // 1) 反応欄の後ろ〜広告開始前にある記事画像をAA候補として回収する。
  //    オレ的は1枚目のやる夫画像が「94d309a6」のような無意味なファイル名のことがあり、
  //    yaruo/yaranai のファイル名判定だけでは漏れるため、位置を基準にする。
  const stop = findFollowingJin115Stop(marker, rawDoc);
  const beforeStop = el => !stop || !!(el.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING);
  const aaImgs = [...rawDoc.querySelectorAll('img')].filter(img => {
    if (!isAfter(img) || !beforeStop(img)) return false;
    if (img.closest('blockquote,iframe,[class*="twitter"],[class*="tweet"],[class*="sns"],[class*="social"]')) return false;
    const src = rawImageUrl(img, base) || '';
    if (!src || isAffiliateAdUrl(src, base)) return false;
    const meta = `${img.getAttribute('alt') || ''} ${img.getAttribute('title') || ''} ${src}`;
    if (/avatar|icon|emoji|logo|button|banner|amazon|rakuten/i.test(meta)) return false;
    const {w,h} = declaredImageSize(img);
    if ((w && w < 80) || (h && h < 60)) return false;
    return true;
  }).slice(-6);

  // 2) 反応見出し～最初のAA直前までを「反応コメント」として再取得する。
  // generic comments classには依存しない。
  let commentFrag = null;
  const firstAA = aaImgs[0] || null;
  try {
    const range = rawDoc.createRange();
    // elementの直後から始めると、見出しと反応コメントが同じDIVに入る記事で
    // コメントごと飛ばしてしまう。見出しのテキストノード直後から抜く。
    range.setStartAfter(markerTextNode);
    if (firstAA) range.setEndBefore(firstAA);
    else {
      if (stop) range.setEndBefore(stop);
      else range.setEnd(rawDoc.body, rawDoc.body.childNodes.length);
    }
    const holder = rawDoc.createElement('div');
    holder.appendChild(range.cloneContents());

    // 反応コメント部分では埋め込み・広告・購入リンク・AA画像を捨て、文章だけを優先する。
    for (const el of [...holder.querySelectorAll('script,style,noscript,iframe,form,button,nav,aside,footer,blockquote')]) el.remove();
    for (const img of [...holder.querySelectorAll('img,picture')]) img.remove();
    for (const a of [...holder.querySelectorAll('a[href]')]) {
      const href = absUrl(a.getAttribute('href') || '', base) || '';
      if (isXStatusHref(href, base)) {
        const box = a.closest('div,p,li,section,span') || a;
        if (cleanText(box.textContent || '').length <= 1800) box.remove();
        else a.remove();
      }
    }
    removeAffiliateImageAds(holder, base);
    removeJin115PromoItemsOnly(holder, base);
    compactWhitespace(holder);

    const txt = cleanText(holder.textContent || '');
    const norm = txt.replace(/[\s　]+/g, '');
    const probe = norm.slice(0, Math.min(48, norm.length));
    if (txt.length >= 10 && norm.length >= 10 && (!probe || !existingText.includes(probe))) {
      const sec = document.createElement('section');
      sec.className = 'jin-reaction-fallback-text';
      const heading = document.createElement('div');
      heading.className = 'jin-reaction-fallback-title';
      heading.textContent = cleanText(markerTextNode.nodeValue || marker.textContent || '＜ネットでの反応＞');
      sec.appendChild(heading);
      sec.append(...holder.childNodes);
      commentFrag = sec;
    }
  } catch {}

  if (commentFrag) container.appendChild(commentFrag);

  // 3) AAはコメント抽出成否に関係なく不足分だけ追加する。
  if (aaImgs.length) {
    const sec = document.createElement('section');
    sec.className = 'jin-reaction-fallback-aa';
    for (const srcImg of aaImgs) {
      const src = rawImageUrl(srcImg, base);
      if (!src || existingImgs.has(src)) continue;
      existingImgs.add(src);
      const img = document.createElement('img');
      img.src = displayImageUrl(absUrl(src, base) || src);
      img.alt = srcImg.getAttribute('alt') || 'やる夫AA';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      sec.appendChild(img);
    }
    if (sec.childNodes.length) container.appendChild(sec);
  }
}

function finalJin115VisualCleanup(container, base="") {
  if (!container || !isJin115Url(base)) return;

  const leafish = el => ![...el.children].some(ch => cleanText(ch.textContent || "") === cleanText(el.textContent || "") && cleanText(ch.textContent || "").length > 0);
  const blocks = () => [...container.querySelectorAll("p,div,section,li,td,tr,span,font,b,strong,a")].filter(el => container.contains(el));

  // 1) 商品名 + 割引率 + 円価格の広告を、HTML構造に依存せず表示文字で除去する。
  //    タイトルと価格が別要素でも、価格行の直前の短い商品名行まで一緒に消す。
  for (let pass=0; pass<8; pass++) {
    let hit = null;
    for (const el of blocks()) {
      const t = cleanText(el.textContent || "");
      if (!t || t.length > 450) continue;
      if (!/(?:^|\s)-?\d{1,3}\s*%\s*[￥¥]\s*\d[\d,]*/.test(t)) continue;
      if (!leafish(el)) continue;
      hit = el; break;
    }
    if (!hit) break;

    const row = hit.closest("tr,p,li,div,section,td") || hit;
    const parent = row.parentElement;
    let prev = row.previousElementSibling;
    let removePrev = null;
    if (prev) {
      const pt = cleanText(prev.textContent || "");
      const pm = prev.querySelectorAll("img,picture,pre,blockquote,iframe").length;
      if (pm === 0 && pt.length > 0 && pt.length <= 260 && /(?:【[^】]+】|PS[345]|DualSense|Switch|Xbox|純正品|限定|新品|予約|ゲーム|コントローラー)/i.test(pt)) {
        removePrev = prev;
      }
    }
    if (removePrev) removePrev.remove();
    row.remove();
    if (parent && !cleanText(parent.textContent || "") && !parent.querySelector("img,picture,pre,blockquote,iframe")) parent.remove();
  }

  // 2) AA/GIFなど最後の本文メディアより後ろの宣伝リンク列を、最終表示DOMで切る。
  //    table/tr/div の違いは見ず、短いリンク行が複数並ぶことだけを見る。
  const media = [...container.querySelectorAll("img,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")]
    .filter(el => !el.closest("[data-jin115-tail-promo='1']"));
  const lastMedia = media[media.length - 1] || null;

  const links = [...container.querySelectorAll("a[href]")].filter(a => {
    if (!container.contains(a)) return false;
    if (lastMedia && !(lastMedia.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    const href = absUrl(a.getAttribute("href") || "", base) || "";
    if (isXStatusHref(href, base)) return false;
    const at = cleanText(a.textContent || "");
    if (at.length < 5 || at.length > 260) return false;
    return true;
  });

  if (links.length >= 5) {
    const rows=[];
    for (const a of links) {
      const row=a.closest("tr,p,li,div,section,td") || a;
      const t=cleanText(row.textContent || "");
      const m=row.querySelectorAll("img,picture,pre,blockquote,iframe").length;
      if (m>0 || !t || t.length>650) continue;
      if (!rows.includes(row)) rows.push(row);
    }

    // 宣伝語が含まれる、または短いリンク行が5つ以上ある末尾列なら最初から切る。
    let start=null;
    for (let i=0;i<rows.length;i++) {
      const tail=rows.slice(i);
      if (tail.length < 5) break;
      const sample=cleanText(tail.slice(0,8).map(x=>x.textContent||"").join(" "));
      const promo=/(?:最強|話題|オススメ|おすすめ|発売|新刊|セール|激安|キャンペーン|予約|PS[345]|Switch|アニメ|漫画|ゲーム|イヤホン|マットレス|ジェットウォッシャー|新刊)/i.test(sample);
      if (promo || tail.length >= 7) { start=rows[i]; break; }
    }

    if (start) {
      // start が深い子要素なら、末尾を共有する適切な祖先まで持ち上げる。
      let cut=start;
      for (let depth=0; cut.parentElement && cut.parentElement!==container && depth<5; depth++) {
        const par=cut.parentElement;
        const pt=cleanText(par.textContent || "");
        const pm=par.querySelectorAll("img,picture,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length;
        const pl=par.querySelectorAll("a[href]").length;
        if (pm===0 && pl>=5 && pt.length<=6000) cut=par;
        else break;
      }
      try {
        const r=document.createRange();
        r.setStartBefore(cut);
        r.setEnd(container, container.childNodes.length);
        r.deleteContents();
      } catch { cut.remove(); }
    }
  }

  compactWhitespace(container);
}


function removeJin115PromoItemsOnly(container, base="") {
  if (!container || !isJin115Url(base)) return;

  const promoHeadlineRe = /(?:^|\s)↓\s*(?:口臭激減|肩こりが一発|オタクにガチオススメ|睡眠不足や肩こり|魔法少女にあこがれて|FX戦士くるみちゃん|無職転生|ゴキブリを憎む|人気漫画|話題の最強|さすがにこれはダメだよな).*$/i;
  const productPriceRe = /-?\d{1,3}\s*%\s*[￥¥]\s*\d[\d,]*/;

  const smallestBlock = (el, maxLen=900) => {
    let cur = el?.nodeType === Node.ELEMENT_NODE ? el : el?.parentElement;
    let best = cur;
    for (let depth=0; cur && cur!==container && depth<6; depth++, cur=cur.parentElement) {
      const t = cleanText(cur.textContent || "");
      const media = cur.querySelectorAll?.("img,picture,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")?.length || 0;
      if (/^(?:A|P|DIV|SECTION|LI|TR|TD|SPAN|FONT|STRONG|B)$/i.test(cur.tagName || "") && t.length <= maxLen && media===0) best = cur;
      if (t.length > maxLen * 1.8 || media>0) break;
    }
    return best || el?.parentElement || null;
  };

  const removeNeighborDescription = row => {
    if (!row?.parentElement) return;
    const candidates = [row.nextElementSibling, row.previousElementSibling].filter(Boolean);
    for (const el of candidates) {
      if (!container.contains(el)) continue;
      const t = cleanText(el.textContent || "");
      const media = el.querySelectorAll("img,picture,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length;
      const links = el.querySelectorAll("a[href]").length;
      if (media===0 && links>=1 && t.length>0 && t.length<=650 && /(?:話題|最強|発売|新刊|セール|激安|キャンペーン|予約|買え|オススメ|おすすめ|→|マジで|凄い|優勝|欲しい)/i.test(t)) {
        el.remove();
        break;
      }
    }
  };

  // 赤字の宣伝見出しは「その行だけ」消す。本文末尾は切らない。
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const hits=[];
  while (walker.nextNode()) {
    const n=walker.currentNode;
    const t=cleanText(n.nodeValue || "");
    if (promoHeadlineRe.test(t)) hits.push(n);
  }
  for (const n of hits) {
    if (!n.parentElement || !container.contains(n.parentElement)) continue;
    let target = smallestBlock(n, 1000);
    // 親に本物の本文が混ざっている場合は、赤字anchor/leafだけに縮める。
    const parentText = cleanText(target?.textContent || "");
    if (parentText.length > 700 || /＜\s*ネット(?:で)?の反応\s*＞|この記事への反応/.test(parentText)) {
      let el=n.parentElement;
      while (el && el!==container) {
        const t=cleanText(el.textContent || "");
        if (t.length<=500 && promoHeadlineRe.test(t)) { target=el; break; }
        el=el.parentElement;
      }
    }
    if (target && container.contains(target)) {
      const row = target.closest("tr,p,li,div,section,td") || target;
      removeNeighborDescription(row);
      target.remove();
    }
  }

  // 商品名＋割引率＋価格も、その商品ブロックだけ除去する。
  for (let pass=0; pass<12; pass++) {
    let found=null;
    const w=document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t=cleanText(w.currentNode.nodeValue || "");
      if (productPriceRe.test(t)) { found=w.currentNode; break; }
    }
    if (!found) break;
    let target=smallestBlock(found, 700);
    if (!target || !container.contains(target)) break;
    const row=target.closest("tr,p,li,div,section,td") || target;
    const prev=row.previousElementSibling;
    if (prev) {
      const pt=cleanText(prev.textContent || "");
      const pm=prev.querySelectorAll("img,picture,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length;
      if (pm===0 && pt.length>0 && pt.length<=350 && /(?:【[^】]+】|PS[345]|DualSense|Switch|Xbox|純正品|限定|新品|予約|コントローラー|ゲーム)/i.test(pt)) prev.remove();
    }
    row.remove();
  }

  // 削除後の空箱だけ掃除する。
  for (const el of [...container.querySelectorAll("div,p,section,li,tr,td,span,font")].reverse()) {
    if (!container.contains(el)) continue;
    const t=cleanText(el.textContent || "");
    const media=el.querySelectorAll("img,picture,pre,blockquote,iframe,.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length;
    if (!t && media===0) el.remove();
  }
}

function removeAffiliateImageAds(container, base) {
  if (!container) return;

  // class/id が広告っぽくなくても、リンク先が広告配信/アフィリエイトなら
  // 「画像バナーだけのリンク」は本文ではないので除去する。
  for (const a of [...container.querySelectorAll("a[href]")]) {
    if (!container.contains(a)) continue;
    if (hasRequiredArticleMedia(a) || a.closest('[data-required-reply="1"]')) continue;
    const href = a.getAttribute("href") || "";
    if (!isAffiliateAdUrl(href, base)) continue;

    const text = cleanText(a.textContent);
    const hasMedia = !!a.querySelector("img,picture,svg");
    const childCount = a.querySelectorAll("*").length;
    const looksLikeBanner = hasMedia && text.length <= 120 && childCount <= 20;
    const looksLikeAdLabel = /^(?:広告|PR|AD|Sponsored|楽天市場|Amazon)$/i.test(text);
    if (looksLikeBanner || looksLikeAdLabel) a.remove();
  }

  // 画像URL自体が広告配信先の場合も消す。
  for (const img of [...container.querySelectorAll("img")]) {
    if (!container.contains(img)) continue;
    if (img.dataset.requiredMedia==='1' || img.closest('[data-required-reply="1"]')) continue;
    const raw = rawImageUrl(img, base);
    if (isAffiliateAdUrl(raw, base)) img.remove();
  }

  // 広告を抜いた後に残る「広告」「PR」だけの小さな箱も掃除。
  for (const el of [...container.querySelectorAll("div,p,section,aside,figure,li,span")].reverse()) {
    if (!container.contains(el)) continue;
    const t = cleanText(el.textContent);
    const media = el.querySelectorAll("img,picture,iframe,object,embed").length;
    const links = el.querySelectorAll("a[href]").length;
    if (/^(?:広告|PR|AD|Sponsored)$/i.test(t) && media === 0 && links === 0) el.remove();
  }
}

function removeJin115Noise(container, base) {
  if (!container || !isJin115Url(base)) return;

  // 記事先頭のカテゴリ/日付/コメント数/空bulletを、最初の本文画像より前だけ掃除する。
  const firstRealImage = [...container.querySelectorAll("img")].find(img => {
    const src = rawImageUrl(img, base);
    if (!src || isAffiliateAdUrl(src, base)) return false;
    const {w,h} = declaredImageSize(img);
    return !(w && h && w < 80 && h < 80);
  }) || null;

  const isBeforeFirstImage = el => {
    if (!firstRealImage) return true;
    return !!(el.compareDocumentPosition(firstRealImage) & Node.DOCUMENT_POSITION_FOLLOWING);
  };

  // メタ情報がまとまった ul/ol は箱ごと消す。
  for (const list of [...container.querySelectorAll("ul,ol")]) {
    if (!isBeforeFirstImage(list)) continue;
    const t = cleanText(list.textContent || "");
    if (/\d{4}年\d{1,2}月\d{1,2}日/.test(t) && /(コメント|芸能|スポーツ|ニュース|炎上|雑談|ゲーム|アニメ)/.test(t) && t.length < 500) {
      list.remove();
    }
  }

  const leadEls = [...container.querySelectorAll("li,p,div,span,a")].slice(0, 180);
  for (const el of leadEls) {
    if (!container.contains(el) || !isBeforeFirstImage(el)) continue;
    if (el.querySelector(".x-static-card,.x-static-section,[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")) continue;
    const t = cleanText(el.textContent || "");
    const media = el.querySelectorAll("img,picture,iframe,blockquote").length;
    if ((!t || t === "•" || t === "・") && media === 0) { el.remove(); continue; }
    if (/^(?:ゲーム|アニメ・マンガ|アニメ|ニュース|炎上|お知らせ|芸能・スポーツ|雑談・その他の話)$/.test(t) && media === 0 && t.length <= 30) {
      el.remove();
      continue;
    }
    if (/^\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}:\d{2}(?:\s*[｜|])?$/.test(t) || /^コメント\s*[（(]\s*\d+\s*[）)](?:\s*[｜|])?$/.test(t)) {
      el.remove();
      continue;
    }
  }

  // 記事上部のSNS Follow誘導は本文ではない。X投稿のstatusリンクは残す。
  for (const a of [...container.querySelectorAll("a[href]")]) {
    if (!container.contains(a)) continue;
    const text = cleanText(a.textContent);
    const href = absUrl(a.getAttribute("href") || "", base) || "";
    if (/^(?:follow|フォロー)$/i.test(text) && !isXStatusHref(href, base)) {
      const box = a.closest("div,p,li,span") || a;
      if (cleanText(box.textContent).length <= 120 && box.querySelectorAll("blockquote[data-x-embed-preserve='1'],iframe[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length === 0) box.remove();
      else a.remove();
    }
  }

  // オレ的本文中に差し込まれる楽天/Amazon商品広告。
  // 記事画像を守るため、画像CDN + 商用リンク/小型商品画像の組合せだけを対象にする。
  for (const img of [...container.querySelectorAll("img")]) {
    if (!container.contains(img)) continue;
    const src = rawImageUrl(img, base).toLowerCase();
    const a = img.closest("a[href]");
    const href = a ? (absUrl(a.getAttribute("href") || "", base) || "").toLowerCase() : "";
    let host = "", linkHost = "";
    try { host = new URL(src).hostname.toLowerCase().replace(/^www\./, ""); } catch {}
    try { linkHost = new URL(href).hostname.toLowerCase().replace(/^www\./, ""); } catch {}
    const retailImage = /(?:^|\.)(?:thumbnail\.image\.rakuten\.co\.jp|image\.rakuten\.co\.jp|tshop\.r10s\.jp|m.media-amazon.com|images-na.ssl-images-amazon.com)$/.test(host);
    const retailLink = /(?:^|\.)(?:rakuten\.co\.jp|amazon\.co\.jp|amzn\.to)$/.test(linkHost) || isAffiliateAdUrl(href, base);
    const {w,h} = declaredImageSize(img);
    const smallProduct = (w && w <= 420) || (h && h <= 650);
    if (retailImage && (retailLink || smallProduct)) {
      const target = a || img.closest("figure,div,p,li") || img;
      target.remove();
    }
  }

  // オレ的では商品広告が「普通のAmazon/Rakutenリンク + 発売日/メーカー等の説明」
  // として本文に入る。X投稿を含まない小さな商品箱だけを除去する。
  for (const a of [...container.querySelectorAll("a[href]")]) {
    if (!container.contains(a)) continue;
    const href = absUrl(a.getAttribute("href") || "", base) || "";
    let host = "";
    try { host = new URL(href).hostname.toLowerCase().replace(/^www\./, ""); } catch {}
    const isRetail = /(?:^|\.)(?:amazon\.co\.jp|amzn\.to|rakuten\.co\.jp)$/.test(host);
    if (!isRetail) continue;

    let target = a;
    for (let depth=0, cur=a.parentElement; cur && cur!==container && depth<5; depth++, cur=cur.parentElement) {
      const t = cleanText(cur.textContent);
      const x = countXStatusLinks(cur, base);
      const imgs = cur.querySelectorAll("img,picture").length;
      if (x > 0) break;
      if (t.length <= 1400 && (
        /Amazon\.co\.jp\s*で詳細を見る|楽天市場|発売日[:：]|メーカー[:：]|セールスランク[:：]|形式[:：]/i.test(t) ||
        (imgs >= 1 && t.length <= 500)
      )) target = cur;
      else if (t.length > 1400) break;
    }
    target.remove();
  }

  // 商品名 + 購入導線だけの小型ブロックを追加除去。
  // オレ的では広告classが無いまま、画像・商品説明・Amazon/Rakutenリンクが並ぶ場合がある。
  for (const el of [...container.querySelectorAll("tr,td,div,section,figure,li,p")].reverse()) {
    if (!container.contains(el)) continue;
    if (countXStatusLinks(el, base) > 0 || el.querySelector("[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")) continue;

    const t = cleanText(el.textContent || "");
    if (!t || t.length > 1800) continue;
    const imgs = el.querySelectorAll("img,picture").length;
    const links = [...el.querySelectorAll("a[href]")];
    if (imgs < 1 || links.length < 1) continue;

    const purchaseText = /Amazon(?:\.co\.jp)?\s*(?:で)?(?:詳細を見る|購入|予約)|楽天市場(?:で)?(?:詳細を見る|購入)|発売日[:：]|出版社[:：]|メーカー[:：]|ブランド[:：]|価格[:：]/i.test(t);
    const retailerLink = links.some(a => {
      const href = absUrl(a.getAttribute("href") || "", base) || "";
      if (isAffiliateAdUrl(href, base)) return true;
      try {
        const h = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
        return /(?:^|\.)(?:amazon\.co\.jp|amzn\.to|amzn\.asia|rakuten\.co\.jp|books\.rakuten\.co\.jp)$/.test(h);
      } catch { return false; }
    });

    if (purchaseText && retailerLink) el.remove();
  }

  // オレ的で商品画像を先に消した後、赤字の「商品名 + 割引率 + 価格」だけ残る場合がある。
  // 例: 【PS5】鬼武者 ...  -18% ￥7,355
  // 記事本文の価格表現まで消さないよう、短いブロック + リンクあり + 割引率と円価格が同居するものだけ対象。
  for (const el of [...container.querySelectorAll("div,p,li,section,td,blockquote")].reverse()) {
    if (!container.contains(el)) continue;
    if (countXStatusLinks(el, base) > 0 || el.querySelector("[data-x-embed-preserve='1'],.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")) continue;

    const t = cleanText(el.textContent || "");
    if (!t || t.length > 700) continue;

    const hasDiscountPrice = /(?:^|\s)-?\d{1,3}\s*%\s*[￥¥]\s*\d[\d,]*/.test(t);
    if (!hasDiscountPrice) continue;

    const links = [...el.querySelectorAll("a[href]")];
    if (!links.length) continue;

    // 商品広告らしい見た目/文言を補助条件にする。
    const productish = /【[^】]{1,24}】|PS[345]|DualSense|Switch|Xbox|限定|純正品|新品|予約/i.test(t);
    const colored = [...el.querySelectorAll("a,font,span,strong,b")].some(n => {
      const style = String(n.getAttribute?.("style") || "").toLowerCase();
      const color = String(n.getAttribute?.("color") || "").toLowerCase();
      return /(?:color\s*:\s*(?:#?f00|#?ff0000|red))/.test(style) || /^(?:#?f00|#?ff0000|red)$/.test(color);
    });

    if (productish || colored) el.remove();
  }

  // 広告削除後の空箱や「楽天市場/Amazon」だけ残った箱を掃除。
  for (const el of [...container.querySelectorAll("div,p,section,figure,li,span")].reverse()) {
    if (!container.contains(el)) continue;
    if (el.querySelector("blockquote[data-x-embed-preserve='1'],iframe[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")) continue;
    const t = cleanText(el.textContent);
    const media = el.querySelectorAll("img,picture,iframe,blockquote").length;
    const links = el.querySelectorAll("a[href]").length;
    if ((!t && media === 0) || (/^(?:楽天市場|Amazon|広告|PR)$/i.test(t) && media === 0 && links <= 1)) el.remove();
  }
}

function removeGoogleChromePromos(container, base) {
  if (!container) return;

  // 本文に紛れ込む「Google」だけの大見出しは記事見出しではなく誘導パーツ扱い。
  for (const h of [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")]) {
    if (/^google$/i.test(cleanText(h.textContent))) h.remove();
  }

  // Google/Chrome の誘導ブロックを、元HTMLのclass/id/link情報が残っているうちに除去する。
  const candidates = [...container.querySelectorAll("div,section,aside,figure,p,li,a")].reverse();
  for (const el of candidates) {
    if (!container.contains(el)) continue;
    if (hasRequiredArticleMedia(el)) continue;
    const text = cleanText(el.textContent);
    if (text.length > 900 || threadHeaderCount(el) > 0) continue;

    const key = `${el.id || ""} ${el.className || ""}`.toLowerCase();
    const attrPromo = /(?:google|chrome).*(?:promo|banner|recommend|download|install|app|logo)|(?:promo|banner|recommend|download|install|app).*(?:google|chrome)/i.test(key);
    const cta = hasGoogleChromeCta(text);
    const dest = [...el.querySelectorAll("a[href]")].some(a => isGoogleChromeDestination(a.getAttribute("href"), base)) ||
      (el.tagName === "A" && isGoogleChromeDestination(el.getAttribute("href"), base));
    const logo = [...el.querySelectorAll("img")].some(img => looksLikeGoogleChromeLogoImage(img, base));

    if ((dest && (cta || logo || attrPromo)) || (attrPromo && (cta || logo))) {
      el.remove();
    }
  }

  // 単独で残った巨大ロゴも除去。小さいロゴや記事中の通常画像は残す。
  for (const img of [...container.querySelectorAll("img")]) {
    if (img.dataset.requiredMedia==='1' || img.closest('[data-required-reply="1"]')) continue;
    if (!looksLikeGoogleChromeLogoImage(img, base)) continue;
    const {w, h} = declaredImageSize(img);
    const parent = img.parentElement;
    const parentText = cleanText(parent?.textContent || "");
    const linkedPromo = !!img.closest("a[href]") && isGoogleChromeDestination(img.closest("a[href]")?.getAttribute("href"), base);
    const large = Math.max(w, h) >= 180 || (w >= 140 && h >= 70);
    const isolatedBrand = parentText.length <= 80 && (parent?.querySelectorAll("img").length || 0) <= 2;
    if (large || linkedPromo || hasGoogleChromeCta(parentText) || isolatedBrand) img.remove();
  }
}

const BAD = [
  "script","style","noscript","form","nav","aside","footer",
  "object","embed","audio","svg","link","meta","input","button","select",
  "[id*='ranking']","[class*='ranking']",
  "[id*='related']","[class*='related']",
  "[id*='recommend']","[class*='recommend']",
  "[id*='pickup']","[class*='pickup']",
  "[id*='sidebar']","[class*='sidebar']",
  "[id*='advert']","[class*='advert']",
  "[id*='banner']","[class*='banner']",
  "#topads",".gdblock",".ads",".adsbygoogle","[data-ad-slot]",
  "[id*='share']","[class*='share']",
  "[id*='social']","[class*='social']",
  "[id*='sns']","[class*='sns']",
  "[id*='amazon']","[class*='amazon']",
  "[id*='rakuten']","[class*='rakuten']"
].join(",");


// v0.1.71: Imgur embeds can be represented only by an iframe/blockquote in the raw page.
// Convert them to a normal Imgur page link before the sanitizer removes iframes.  The existing
// Imgur resolver will turn that link into a cached image later.  This is especially important
// for reply #1 where the embed may be the entire meaning of the reply.
function imgurPageUrlFromEmbed(raw, base='') {
  try {
    const u=new URL(String(raw||''),base||location.href);
    const h=u.hostname.toLowerCase().replace(/^www\./,'');
    if(h!=='imgur.com' && h!=='i.imgur.com') return '';
    const parts=u.pathname.split('/').filter(Boolean).filter(x=>x.toLowerCase()!=='embed');
    if(!parts.length) return '';
    if(['a','gallery'].includes((parts[0]||'').toLowerCase()) && parts[1]) return `https://imgur.com/${parts[0].toLowerCase()}/${parts[1]}`;
    const id=(parts[0]||'').replace(/\.(?:jpe?g|png|gif|webp|avif)$/i,'');
    if(/^[A-Za-z0-9]+$/.test(id)) return `https://imgur.com/${id}`;
  } catch {}
  return '';
}
function protectImgurEmbeds(root, base='') {
  if(!root?.querySelectorAll) return;
  const makeLink=(url, required=false)=>{
    if(!url) return null;
    const a=root.ownerDocument.createElement('a');
    a.href=url; a.textContent='Imgur画像';
    a.dataset.imgurPreserve='1';
    if(required) a.dataset.requiredMedia='1';
    return a;
  };
  for(const frame of [...root.querySelectorAll('iframe[src*="imgur.com"],iframe[src*="i.imgur.com"]')]){
    const url=imgurPageUrlFromEmbed(frame.getAttribute('src')||'',base);
    if(!url) continue;
    const required=!!frame.closest?.('[data-required-reply="1"]') || frame.dataset.requiredMedia==='1';
    const a=makeLink(url,required); if(a) frame.replaceWith(a);
  }
  for(const bq of [...root.querySelectorAll('blockquote.imgur-embed-pub,[data-id][class*="imgur"]')]){
    let a=bq.querySelector('a[href*="imgur.com"]');
    let url=a ? absUrl(a.getAttribute('href')||'',base) : '';
    if(!url){
      const id=String(bq.getAttribute('data-id')||'').trim().replace(/^\/+|\/+$/g,'');
      if(id) url=`https://imgur.com/${id}`;
    }
    if(!url) continue;
    const required=!!bq.closest?.('[data-required-reply="1"]') || bq.dataset.requiredMedia==='1';
    if(!a){ a=makeLink(url,required); if(a) bq.appendChild(a); }
    if(a){ a.dataset.imgurPreserve='1'; if(required) a.dataset.requiredMedia='1'; }
  }
}

function sanitize(root, base) {
  const clone = root.cloneNode(true);

  // ラビット速報のカテゴリ別アーカイブは #sub / #extra にあり、
  // CSSを外すと本文より目立ってしまうため、このサイトだけ明示的に除去する。
  if (isRabbitSokuhoUrl(base)) {
    for (const el of [...clone.querySelectorAll("#sub,#extra,.blog-title-outer-2")]) el.remove();
  }

  // X/Twitter 埋め込みは記事本文そのものになるサイトがあるため、
  // 広告/ソーシャル部品の一括除去より先に保護する。
  protectXEmbeds(clone, base);
  protectInstagramEmbeds(clone, base);
  protectImgurEmbeds(clone, base);
  protectDirectVideoLinks(clone, base);

  removeGoogleChromePromos(clone, base);
  removeAffiliateImageAds(clone, base);
  removeJin115Noise(clone, base);

  // iframe は原則削除。ただし X/Twitter と YouTube の本文埋め込みは残す。
  for (const frame of [...clone.querySelectorAll("iframe")]) {
    if (!isXEmbedIframe(frame, base) && !isYouTubeEmbedIframe(frame, base)) frame.remove();
  }

  for (const el of [...clone.querySelectorAll(BAD)]) {
    if (isGossip1Url(base) && (el.matches?.('[data-gossip-reply-unit=\"1\"]') || el.querySelector?.('[data-gossip-reply-unit=\"1\"]'))) continue;
    if (el.matches?.("[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-required-reply='1'],[data-required-media='1']")) continue;
    if (el.querySelector?.("[data-required-reply='1'],[data-required-media='1']")) continue;
    // sns/social/share ラッパー内にX本文がある場合、親ごと消すと投稿本文まで失う。
    if (el.querySelector?.("[data-x-embed-preserve='1'],[data-instagram-preserve='1']")) continue;
    if (el.querySelector?.("iframe[src*='youtube.com/embed'],iframe[src*='youtube-nocookie.com/embed']")) continue;
    el.remove();
  }

  for (const el of [...clone.querySelectorAll("*")]) {
    if (el.tagName==='IFRAME' || el.tagName==='VIDEO') el.dataset.originalArea=String((parseFloat(el.getAttribute('width'))||0)*(parseFloat(el.getAttribute('height'))||0));
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      if (
        n.startsWith("on") || n === "style" || n === "class" || n === "id" ||
        n === "width" || n === "height" || n === "srcset" || n === "sizes"
      ) el.removeAttribute(attr.name);
    }

    if (el.tagName === "IFRAME" && isXEmbedIframe(el, base)) {
      const src = absUrl(el.getAttribute("src"), base);
      if (src) el.setAttribute("src", src);
      el.setAttribute("loading", "eager");
      el.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      el.setAttribute("title", el.getAttribute("title") || "X post");
      el.setAttribute("allow", "fullscreen");
    } else if (el.tagName === "IFRAME" && isYouTubeEmbedIframe(el, base)) {
      const src = absUrl(el.getAttribute("src"), base);
      if (src) el.setAttribute("src", src);
      el.setAttribute("loading", "eager");
      el.setAttribute("title", el.getAttribute("title") || "YouTube video");
      el.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      el.setAttribute("allowfullscreen", "true");
    }

    if (el.tagName === "VIDEO") {
      el.removeAttribute("autoplay");
      el.setAttribute("controls", "controls");
      el.setAttribute("preload", "metadata");
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      const src = absUrl(el.getAttribute("src") || "", base);
      if (src) { if(PREPARING){el.dataset.videoSource=src;el.removeAttribute("src");} else el.setAttribute("src", src); }
    }
    if (el.tagName === "SOURCE") {
      const src = absUrl(el.getAttribute("src") || "", base);
      if (src) { if(PREPARING && el.closest("video,audio")){el.dataset.videoSource=src;el.removeAttribute("src");} else el.setAttribute("src", src); }
    }

    if (el.tagName === "A") {
      const href = absUrl(el.getAttribute("href"), base);
      if (href) el.setAttribute("href", href);
      el.setAttribute("target", "_self");
      el.setAttribute("rel", "noopener");
    }

    if (el.tagName === "IMG") {
      const raw =
        el.getAttribute("data-src") ||
        el.getAttribute("data-original") ||
        el.getAttribute("data-lazy-src") ||
        el.getAttribute("data-lazy") ||
        el.getAttribute("data-echo") ||
        el.getAttribute("src");

      const src = normalizedImageCandidateUrl(raw, base);
      if (!src) {
        const required=el.dataset.requiredMedia==='1' || !!el.closest('[data-required-reply="1"]');
        if (PREPARING && required) {
          const textLen=cleanText(clone.textContent||'').length;
          const otherMedia=[...clone.querySelectorAll('img,video,iframe,blockquote')].filter(x=>x!==el).length;
          if(textLen<60 && otherMedia===0) throw new Error('重要画像のURLを取得できません');
          const miss=document.createElement('span');miss.className='prepared-image-fallback';miss.dataset.mediaWarning='image';miss.dataset.failedUrl=String(raw||'');miss.textContent='画像を取得できませんでした';
          el.replaceWith(miss);
        } else el.remove();
        continue;
      }
      if (isGifUrl(src)) markHoverGif(el, src);
      else el.setAttribute("src", displayImageUrl(src));
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "no-referrer");
      for (const x of ["data-src","data-original","data-lazy-src","data-lazy","data-echo"]) el.removeAttribute(x);
    }
  }

  return clone;
}



// v0.1.150: GOSSIP reply headers are compact metadata, not article body text.
function normalizeGossipReplyHeaders(root){
  if(!root)return 0;
  const clean=v=>String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const re=/^\s*(\d{1,5})\s*(?:名前\s*[：:]\s*)?.*?(?:投稿日\s*[：:]?\s*)?((?:20)?\d{2}\/\d{1,2}\/\d{1,2}(?:\([^)]{1,8}\))?)\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s+ID\s*[：:]\s*([^\s<]+))?/;
  let changed=0;
  for(const h of [...root.querySelectorAll('[data-gossip-reply-unit] .ent_header,.ent_res > .ent_header')]){
    h.classList.add('reply-meta','gossip-reply-meta');
    const t=clean(h.textContent||'');
    const m=t.match(re);
    if(!m)continue;
    const id=/^(?:\?+|なし|無し|不明|null|undefined)$/i.test(m[4]||'')?'':(m[4]||'');
    h.textContent=[`${m[1]}:`,m[2],m[3],id?`ID:${id}`:''].filter(Boolean).join(' ');
    changed++;
  }
  return changed;
}

function simplifyThreadHeaders(container) {
  // Prepared snapshots keep the full source header so the viewer can render a
  // compact iPhone-specific line while PC keeps its existing minimal look.
  if (PREPARING) return;
  const mobile = readerIsMobile();
  const re = /(\b\d{1,5})(?:\s*[:：](?!\d)|\s+名前\s*[：:])\s*[^\/\r\n]{0,180}?(\d{2,4}\/\d{1,2}\/\d{1,2}(?:\([^)]+\))?\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s+ID[:：]\s*([^\s<]+))?/g;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    node.nodeValue = node.nodeValue.replace(re, (_,num,date,id) =>
      mobile ? `${num}: ${date}${id ? ` ID:${id}` : ''}` : `${num}:`
    );
  }
}

function compactWhitespace(container) {
  // 元サイトがレイアウト用に入れている空div/p/brが、CSSを外した後に
  // 大きな空白として残るのを抑える。
  for (const el of [...container.querySelectorAll("p,div,section,span")].reverse()) {
    const text = cleanText(el.textContent);
    const hasMedia = !!el.querySelector("img,picture,table,pre,blockquote,video,audio,source,iframe,[data-x-embed-preserve='1'],.x-static-card,[data-instagram-preserve='1'],.instagram-static-card,.prepared-video");
    if (!text && !hasMedia) el.remove();
  }

  // 同じ親の中で連続する <br> は1個まで。
  for (const parent of [container, ...container.querySelectorAll("p,div,section,blockquote")]) {
    let prevWasBr = false;
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim()) continue;
      const isBr = node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
      if (isBr && prevWasBr) {
        node.remove();
        continue;
      }
      prevWasBr = isBr;
    }
  }
}

function sameTitle(a, b) {
  const norm = x => cleanText(x).replace(/[\s　]+/g, "").replace(/[：:][^：:]{1,30}$/, "");
  const x = norm(a), y = norm(b);
  return x && y && (x === y || x.startsWith(y) || y.startsWith(x));
}

function removeDuplicateChrome(container, title) {
  // 元サイト側の見出し・日付・カテゴリが本文側に紛れた場合だけ除去。
  for (const el of [...container.querySelectorAll("h1,h2,h3")].slice(0, 8)) {
    if (sameTitle(el.textContent, title)) el.remove();
  }

  const first = [...container.children].slice(0, 10);
  for (const el of first) {
    const t = cleanText(el.textContent);
    if (!t) continue;
    if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(t)) el.remove();
    else if (/^(?:[・●\s]*)?カテゴリ[:：]?/.test(t) && t.length < 80) el.remove();
  }
}

function removeRabbitInlineRecommendations(container, baseUrl="") {
  if (!(isRabbitSokuhoUrl(baseUrl) || isKonoyubiUrl(baseUrl))) return;

  // ラビット速報はレス本文の途中に「おすすめ記事」リンク集を差し込む。
  // その見出しから、次の実レス見出しの直前までだけを削除し、
  // 前後のレス本文はつなげて残す。
  for (let pass = 0; pass < 8; pass++) {
    const labels = [...container.querySelectorAll("h1,h2,h3,h4,h5,p,div,section,span,b,strong")]
      .filter(el => {
        const t = cleanText(el.textContent);
        if (!/^(?:おすすめ(?:記事)?(?:\d+)?|人気の記事(?:[（(]外部[）)])?)$/.test(t)) return false;
        // 同じ文字だけを包む親子がある場合は最も内側だけを使う。
        return ![...el.children].some(ch => /^(?:おすすめ(?:記事)?(?:\d+)?|人気の記事(?:[（(]外部[）)])?)$/.test(cleanText(ch.textContent)));
      });
    if (!labels.length) break;

    let removed = false;
    for (const label of labels) {
      const all = [...container.querySelectorAll("p,div,section,li,dt,dd,span,font,b,strong")];
      let nextReply = null;
      for (const el of all) {
        if (el === label || label.contains(el) || el.contains(label)) continue;
        const pos = label.compareDocumentPosition(el);
        if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (replySignalCount(el) < 1) continue;
        // 親より内側の、最初の実レス見出し要素を終端に使う。
        if ([...el.children].some(ch => replySignalCount(ch) >= 1)) continue;
        nextReply = el;
        break;
      }

      if (nextReply) {
        try {
          const range = document.createRange();
          range.setStartBefore(label);
          range.setEndBefore(nextReply);
          range.deleteContents();
          removed = true;
          break;
        } catch {}
      }

      // 次レスが見つからない終端側のおすすめ欄は、リンク集らしい最小祖先だけ除去。
      let cur = label;
      for (let depth = 0; cur && cur !== container && depth < 5; depth++, cur = cur.parentElement) {
        const links = cur.querySelectorAll("a[href]").length;
        const txt = cleanText(cur.textContent).length;
        if (links >= 3 && txt <= 2500 && threadHeaderCount(cur) === 0) {
          cur.remove();
          removed = true;
          break;
        }
      }
      if (removed) break;
    }
    if (!removed) break;
  }
}

function removeInlineNewsPromos(container, baseUrl="") {
  // まとめサイト本文の途中に差し込まれる「今読まれている注目ニュース」等の
  // 関連記事リンク集だけを削除し、その後に続く実レス本文は残す。
  const promoRe = /^(?:[★☆⭐🔥\s]*)?(?:今週の(?:おすすめ|オススメ)|今週おすすめ|おすすめ(?:記事)?|関連記事|人気記事|人気の記事(?:[（(]外部[）)])?|記事人気ランキング|人気ランキング|アクセスランキング|注目記事|注目ランキング|新着記事|ピックアップ(?:記事)?|こちらもおすすめ|あわせて読みたい|この記事を読んだ人(?:はこちら|におすすめ)?|今(?:読まれている|話題の)(?:注目)?(?:ニュース|記事)|今読まれている注目ニュース|注目ニュース)$/;

  for (let pass = 0; pass < 8; pass++) {
    const labels = [...container.querySelectorAll("h1,h2,h3,h4,h5,p,div,section,span,b,strong")]
      .filter(el => {
        const t = cleanText(el.textContent);
        if (!promoRe.test(t)) return false;
        return ![...el.children].some(ch => promoRe.test(cleanText(ch.textContent)));
      });
    if (!labels.length) break;

    let removed = false;
    for (const label of labels) {
      const all = [...container.querySelectorAll("p,div,section,li,dt,dd,span,font,b,strong,blockquote")];
      let nextReply = null;
      for (const el of all) {
        if (el === label || label.contains(el) || el.contains(label)) continue;
        const pos = label.compareDocumentPosition(el);
        if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (replySignalCount(el) < 1) continue;
        if ([...el.children].some(ch => replySignalCount(ch) >= 1)) continue;
        nextReply = el;
        break;
      }

      if (nextReply) {
        try {
          const range = document.createRange();
          range.setStartBefore(label);
          range.setEndBefore(nextReply);
          range.deleteContents();
          removed = true;
          break;
        } catch {}
      }

      // 記事末尾側にある場合は、リンク集らしい最小祖先だけを除去する。
      let cur = label;
      for (let depth = 0; cur && cur !== container && depth < 6; depth++, cur = cur.parentElement) {
        const links = cur.querySelectorAll("a[href]").length;
        const txt = cleanText(cur.textContent).length;
        if (links >= 2 && txt <= 3500 && threadHeaderCount(cur) === 0) {
          cur.remove();
          removed = true;
          break;
        }
      }
      if (removed) break;
    }
    if (!removed) break;
  }
}


function hasRequiredArticleMedia(el) {
  if (!el) return false;
  const protectedSel='[data-required-reply="1"],[data-required-media="1"],[data-x-embed-preserve="1"],[data-x-embed-ancestor="1"],.x-static-card,[data-instagram-preserve="1"],[data-instagram-post-url],.instagram-static-card';
  return !!el.matches?.(protectedSel) || !!el.querySelector?.(protectedSel);
}

function removeInlineRecommendationBlocks(container) {
  // まとめサイトがレス途中へ差し込む「★今週のおすすめ」等を、後続レスを残したまま除去する。
  const markerRe = /^(?:[★☆⭐🔥\s]*)?(?:今週の(?:おすすめ|オススメ)|今週おすすめ|おすすめ(?:記事)?|関連記事|人気記事|人気の記事(?:[（(]外部[）)])?|記事人気ランキング|人気ランキング|アクセスランキング|注目記事|注目ランキング|新着記事|ピックアップ(?:記事)?|こちらもおすすめ|あわせて読みたい|この記事を読んだ人)/;
  for (let pass=0; pass<6; pass++) {
    let removed=false;
    const candidates=[...container.querySelectorAll('div,section,aside,blockquote,p,li,td')];
    for (const el of candidates) {
      if (!container.contains(el)) continue;
      if (hasRequiredArticleMedia(el)) continue;
      const text=cleanText(el.textContent);
      if (!markerRe.test(text.slice(0,160))) continue;
      if (replySignalCount(el)>0) continue;
      const links=el.querySelectorAll('a[href]').length;
      if (links<2) continue;
      // Prefer the smallest matching wrapper so real replies around it are never removed.
      const smaller=[...el.children].some(ch => {
        const t=cleanText(ch.textContent);
        return markerRe.test(t.slice(0,160)) && ch.querySelectorAll?.('a[href]').length>=2 && threadHeaderCount(ch)===0;
      });
      if (smaller) continue;
      el.remove();
      removed=true;
      break;
    }
    if (!removed) break;
  }
}



function hasMeaningfulArticleContentAfter(node, container) {
  // 冒頭/途中の差し込みだけを消し、記事末尾にまとまった関連記事等は残す。
  // 重い全DOM走査はせず、近い後続兄弟を階層ごとに少数だけ確認する。
  let cur = node;
  for (let depth = 0; cur && cur !== container && depth < 6; depth++, cur = cur.parentElement) {
    let sib = cur.nextElementSibling;
    let checked = 0;
    while (sib && checked++ < 24) {
      const text = cleanText(sib.textContent || "");
      const headers = replySignalCount(sib);
      const links = sib.querySelectorAll?.("a[href]")?.length || 0;
      const media = sib.querySelectorAll?.("pre,video,picture,img,iframe[src*='youtube.com'],iframe[src*='youtube-nocookie.com'],iframe[src*='twitter.com'],iframe[src*='x.com']")?.length || 0;
      if (headers > 0) return true;
      if (media > 0 && links <= 2) return true;
      if (text.length >= 120 && (links === 0 || text.length / Math.max(1, links) >= 180)) return true;
      sib = sib.nextElementSibling;
    }
  }
  return false;
}

function isLikelyExternalArticleLink(a, baseUrl="") {
  const raw = a?.getAttribute?.("href") || "";
  const href = absUrl(raw, baseUrl);
  if (!/^https?:\/\//i.test(href)) return false;
  if (/\.(?:jpe?g|png|gif|webp|avif|bmp|svg|mp4|webm|m4v)(?:$|[?#])/i.test(href)) return false;
  if (isXStatusHref(href, baseUrl) || /(?:youtube\.com|youtu\.be)/i.test(href)) return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    const baseHost = new URL(baseUrl).hostname.replace(/^www\./, "");
    return !!host && !!baseHost && host !== baseHost;
  } catch { return false; }
}

function removeMidArticleExternalCards(container, baseUrl="") {
  if (!container) return;
  // 本文の最初/途中に挟まる外部ニュース・別記事カードを除去。
  // 記事末尾にまとまっているものはユーザー要望により残す。
  const anchors = [...container.querySelectorAll("a[href]")].filter(a => isLikelyExternalArticleLink(a, baseUrl));
  for (const a of anchors) {
    if (!container.contains(a)) continue;
    if (a.closest('[data-required-reply="1"]')) continue;

    let block = a;
    for (let depth = 0; depth < 4; depth++) {
      const p = block.parentElement;
      if (!p || p === container) break;
      const text = cleanText(p.textContent || "");
      const links = p.querySelectorAll("a[href]").length;
      const media = p.querySelectorAll("img,picture,video,iframe,pre,blockquote").length;
      const linkText = [...p.querySelectorAll("a[href]")].reduce((n,x)=>n+cleanText(x.textContent||"").length,0);
      const dominated = media === 0 && links >= 1 && links <= 4 && text.length <= 1200 && text.length <= Math.max(260, linkText * 1.8 + 180);
      if (!dominated) break;
      block = p;
    }

    if (!hasMeaningfulArticleContentAfter(block, container)) continue;

    const clone = block.cloneNode(true);
    for (const x of [...clone.querySelectorAll("a[href]")]) x.remove();
    let leftover = cleanText(clone.textContent || "")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/\b\d{1,5}\s*[:：][^\n]{0,220}/, " ")
      .trim();
    const headers = threadHeaderCount(block);

    // リンクだけのレスならレス枠ごと削除。本人コメントが残る場合はカード部分だけ落とす。
    if (headers > 0 && leftover.length < 80) {
      block.remove();
    } else if (block === a) {
      a.remove();
    } else {
      block.remove();
    }
  }
}


function isLikelyArticleOrPromoLink(a, baseUrl="") {
  const raw = a?.getAttribute?.("href") || "";
  const href = absUrl(raw, baseUrl);
  if (!/^https?:\/\//i.test(href)) return false;
  if (/\.(?:jpe?g|png|gif|webp|avif|bmp|svg|mp4|webm|m4v)(?:$|[?#])/i.test(href)) return false;
  if (isXStatusHref(href, baseUrl) || /(?:youtube\.com|youtu\.be)/i.test(href)) return false;
  try {
    const u = new URL(href);
    const cur = new URL(baseUrl);
    if (u.href.split('#')[0] === cur.href.split('#')[0]) return false;
  } catch {}
  return true;
}

function removeMidArticleLinkModules(container, baseUrl="") {
  if (!container) return;
  // 同一サイト/外部サイトを問わず、本文の冒頭・途中へ差し込まれる
  // 「関連記事カード」「ニュースカード」「誘導リンク列」を削除する。
  // 記事末尾のリンク群はユーザー要望により残す。
  for (let pass=0; pass<12; pass++) {
    let changed=false;
    const candidates=[...container.querySelectorAll("aside,figure,section,div,p,li,td,blockquote")].reverse();
    for (const el of candidates) {
      if (!container.contains(el)) continue;
      if (hasRequiredArticleMedia(el)) continue;
      if (replySignalCount(el)>0) continue;
      if (el.querySelector("pre,video,iframe[src*='youtube.com'],iframe[src*='youtube-nocookie.com'],iframe[src*='twitter.com'],iframe[src*='x.com'],[data-x-embed-preserve='1'],.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card")) continue;

      const links=[...el.querySelectorAll("a[href]")].filter(a=>isLikelyArticleOrPromoLink(a, baseUrl));
      if (!links.length || links.length>8) continue;
      const text=cleanText(el.textContent||"");
      if (!text || text.length>1800) continue;
      const linkText=links.reduce((n,a)=>n+cleanText(a.textContent||"").length,0);
      const rawUrlCount=(text.match(/https?:\/\/\S+/gi)||[]).length;
      const imgs=el.querySelectorAll("img,picture").length;
      const ratio=linkText/Math.max(1,text.length);
      const cardWords=/(?:関連記事|関連ニュース|おすすめ|オススメ|注目|人気|ランキング|こちらも|あわせて|続きを読む|ニュース|記事|詳しくはこちら|Yahoo!?ニュース|news\.yahoo\.co\.jp)/i.test(text);
      const dominated =
        (links.length>=2 && ratio>=0.42) ||
        (links.length===1 && text.length<=850 && ratio>=0.62) ||
        (links.length===1 && rawUrlCount>=1 && text.length<=1100) ||
        (cardWords && ratio>=0.30);
      if (!dominated) continue;
      if (imgs>2 && !cardWords) continue;
      if (!hasMeaningfulArticleContentAfter(el, container)) continue;

      // 同条件のより小さい子がある場合は、実レスを巻き込まないよう子を先に消す。
      const smaller=[...el.children].some(ch=>{
        if (threadHeaderCount(ch)>0) return false;
        const ct=cleanText(ch.textContent||"");
        if (!ct || ct.length>=text.length*.94) return false;
        const cls=[...ch.querySelectorAll?.("a[href]")||[]].filter(a=>isLikelyArticleOrPromoLink(a, baseUrl));
        if (!cls.length) return false;
        const clt=cls.reduce((n,a)=>n+cleanText(a.textContent||"").length,0);
        return clt/Math.max(1,ct.length)>=0.55;
      });
      if (smaller) continue;

      el.remove();
      changed=true;
      break;
    }
    if (!changed) break;
  }
}

function removeStandalonePromoImages(container, baseUrl="") {
  if (!container) return;
  const promoRe=/(?:amazon|amzn|rakuten|楽天|アマゾン|affiliate|affili|ad[-_./]|advert|banner|promo|sponsor|スポンサー|広告|a8\.net|valuecommerce|moshimo|trafficgate|criteo|doubleclick|googlesyndication|i-mobile|nend)/i;
  for (const img of [...container.querySelectorAll('img')]) {
    if (!img.isConnected) continue;
    if (img.dataset.requiredMedia==='1' || img.closest('[data-required-reply="1"]')) continue;
    const a=img.closest('a[href]');
    const wrap=img.closest('figure,p,li,td,div') || img;
    if (threadHeaderCount(wrap)>0) continue;
    const key=`${img.getAttribute('src')||''} ${img.getAttribute('data-src')||''} ${img.getAttribute('data-original')||''} ${img.alt||''} ${img.title||''} ${a?.getAttribute('href')||''} ${wrap.id||''} ${wrap.className||''}`;
    if (!promoRe.test(key) && !isAffiliateAdUrl(a?.getAttribute('href')||'',baseUrl)) continue;
    if (!hasMeaningfulArticleContentAfter(wrap,container)) continue;
    const text=cleanText(wrap.textContent||'');
    if (wrap.querySelectorAll('img').length<=2 && text.length<220) wrap.remove();
    else img.remove();
  }
}

function removeSponsoredInlineBlocks(container, baseUrl="") {
  if (!container) return;
  const labelRe=/^(?:スポンサー(?:リンク)?|広告(?:掲載)?|PR|AD|Sponsored)(?:[:：\s]*)$/i;
  for (let pass=0; pass<6; pass++) {
    const labels=[...container.querySelectorAll("h1,h2,h3,h4,h5,p,div,section,span,b,strong")].filter(el=>{
      const t=cleanText(el.textContent||"");
      if (!labelRe.test(t)) return false;
      return ![...el.children].some(ch=>labelRe.test(cleanText(ch.textContent||"")));
    });
    if (!labels.length) break;
    let changed=false;
    for (const label of labels) {
      if (!hasMeaningfulArticleContentAfter(label, container)) continue;
      const all=[...container.querySelectorAll("p,div,section,li,dt,dd,span,font,b,strong,blockquote")];
      let nextReply=null;
      for (const el of all) {
        if (el===label || label.contains(el) || el.contains(label)) continue;
        if (!(label.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (replySignalCount(el)<1) continue;
        if ([...el.children].some(ch=>replySignalCount(ch)>=1)) continue;
        nextReply=el; break;
      }
      if (nextReply) {
        try {
          const range=document.createRange();
          range.setStartBefore(label);
          range.setEndBefore(nextReply);
          range.deleteContents();
          changed=true; break;
        } catch {}
      }
      let cur=label;
      for (let depth=0; cur && cur!==container && depth<5; depth++,cur=cur.parentElement) {
        const t=cleanText(cur.textContent||"");
        const media=cur.querySelectorAll?.("img,picture")?.length||0;
        if (t.length<=1200 && media<=4) { cur.remove(); changed=true; break; }
      }
      if (changed) break;
    }
    if (!changed) break;
  }
}

function removeMidArticleCommercialBlocks(container, baseUrl="") {
  if (!container) return;

  // 本文の冒頭/途中に差し込まれるAmazon/楽天等の商品箱だけを除去する。
  // 記事末尾にまとまった商品/関連記事はユーザー要望により残す。
  const retailHostRe = /(?:^|\.)(?:amazon\.co\.jp|amzn\.to|amzn\.asia|rakuten\.co\.jp|books\.rakuten\.co\.jp|shopping\.yahoo\.co\.jp)$/i;
  const promoTextRe = /(?:Amazon(?:\.co\.jp)?\s*(?:で)?(?:見る|詳細を見る|購入|予約)|楽天市場(?:で)?(?:見る|詳細を見る|購入)|Yahoo!?ショッピング|価格\s*[:：]|ポイント\s*[:：]|Powered\s+by|限定(?:ゲーム内)?アイテム|発売日\s*[:：]|メーカー\s*[:：]|ブランド\s*[:：]|セールスランク\s*[:：])/i;
  const strongPromoRe = /(?:Powered\s+by|価格\s*[:：]\s*[￥¥]?\s*\d|ポイント\s*[:：]\s*\d|Amazon(?:\.co\.jp)?\s*(?:で)?(?:見る|詳細を見る|購入|予約)|楽天市場(?:で)?(?:見る|詳細を見る|購入))/i;

  const blocks = [...container.querySelectorAll("aside,figure,section,div,p,li,td,tr")].reverse();
  for (const el of blocks) {
    if (!container.contains(el)) continue;
    if (hasRequiredArticleMedia(el)) continue;
    if (replySignalCount(el) > 0) continue;
    if (el.querySelector("[data-x-embed-preserve='1'],.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card,iframe[src*='youtube.com'],iframe[src*='youtube-nocookie.com']")) continue;

    const text = cleanText(el.textContent || "");
    if (!text || text.length > 2200 || !promoTextRe.test(text)) continue;

    const links = [...el.querySelectorAll("a[href]")];
    const hasRetailLink = links.some(a => {
      const href = absUrl(a.getAttribute("href") || "", baseUrl) || "";
      if (isAffiliateAdUrl(href, baseUrl)) return true;
      try { return retailHostRe.test(new URL(href).hostname.toLowerCase().replace(/^www\./,"")); }
      catch { return false; }
    });
    if (!hasRetailLink) continue;

    const priceLike = /[￥¥]\s*\d[\d,]*|\d[\d,]*\s*円/.test(text);
    const pointsLike = /ポイント\s*[:：]?\s*\d|\d+\s*(?:pt|ポイント)/i.test(text);
    const productish = /FINAL\s+FANTASY|PS[345]|Switch|Xbox|ゲーム|DLC|限定|商品|新品|予約/i.test(text);
    if (!(strongPromoRe.test(text) || (priceLike && (pointsLike || productish)))) continue;

    // 最後に置かれた商品/関連記事なら残す。後ろに実レス/本文がある時だけ途中広告として消す。
    if (!hasMeaningfulArticleContentAfter(el, container)) continue;

    // 親にも同じ広告文だけが入っている場合は、レス本文を巻き込まない範囲で少しだけ広げる。
    let target = el;
    for (let depth=0, cur=el.parentElement; cur && cur!==container && depth<3; depth++, cur=cur.parentElement) {
      if (threadHeaderCount(cur) > 0) break;
      const t = cleanText(cur.textContent || "");
      if (!t || t.length > 2600 || !promoTextRe.test(t)) break;
      const meaningfulMedia = cur.querySelectorAll("pre,video,iframe,blockquote[data-x-embed-preserve='1'],.x-static-card,.x-static-section,[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card").length;
      if (meaningfulMedia) break;
      target = cur;
    }
    target.remove();
  }
}

function removeGenericArticleNoise(container, baseUrl="") {
  if (!container) return;

  // サイトごとの名前に依存せず、本文/レスと無関係な差し込みモジュールを落とす。
  // 本物のレス番号・AA・画像/GIF・動画・X/YouTube は必ず保護する。
  const labelRe = /^(?:[★☆⭐🔥\s]*)(?:記事人気ランキング|人気ランキング|アクセスランキング|注目ランキング|おすすめ(?:記事|サイト)?(?:\d+)?|オススメ(?:記事|サイト)?(?:\d+)?|関連記事|関連ニュース|注目記事|新着記事|ピックアップ(?:記事)?|こちらもおすすめ|あわせて読みたい|この記事を読んだ人(?:はこちら|におすすめ)?|よく読まれている(?:記事|ニュース)?|今読まれている(?:記事|ニュース)?|話題の記事|人気の記事|その他おすすめサイト|相互RSS|ヘッドライン|アンテナ|サイト内ランキング|殿堂入り|過去記事|最新記事一覧|カテゴリ一覧|スポンサー(?:リンク)?|広告(?:掲載)?|PR|AD|Sponsored)(?:[:：]?\s*)$/i;
  const keyRe = /(?:ranking|rank-|popular|recommend|related|pickup|hotentry|hot-entry|suggest|widget|headline|rss|antenna|entry-list|article-list|news-list|ad-|advert|affiliate|sponsor|breadcrumb|pager|pagination|share|social|sns|follow)/i;

  const preservedMedia = el => !!el.querySelector(
    "pre,video,source,picture,img,iframe[src*='youtube.com'],iframe[src*='youtube-nocookie.com'],iframe[src*='twitter.com'],iframe[src*='x.com'],.x-static-card,.x-static-section,[data-x-embed-preserve='1'],[data-instagram-preserve='1'],[data-instagram-post-url],.instagram-static-card"
  );

  // まず、名称/クラスが明確な小型モジュールを最小単位で除去。
  for (const el of [...container.querySelectorAll("aside,nav,section,div,ul,ol,table,p")].reverse()) {
    if (!container.contains(el)) continue;
    if (hasRequiredArticleMedia(el)) continue;
    const text = cleanText(el.textContent || "");
    if (!text || text.length > 4200) continue;
    if (replySignalCount(el) > 0) continue;

    const key = `${el.id || ""} ${el.className || ""}`.toLowerCase();
    const links = el.querySelectorAll("a[href]").length;
    const media = preservedMedia(el);
    const namedNoise = labelRe.test(text.slice(0, 220)) || keyRe.test(key);
    const linkFarm = links >= 5 && text.length <= 5200 && (text.length / Math.max(1, links)) < 180;

    if (!(namedNoise || linkFarm)) continue;
    // 記事の最後にまとまっている関連記事・外部リンク群は残す。
    if (!hasMeaningfulArticleContentAfter(el, container)) continue;
    // 画像1枚付きの関連記事カード等は消すが、本文メディアだけの箱は残す。
    if (media && links <= 1 && !namedNoise) continue;

    // 同じ条件のより小さい子があるなら親ごと消さず、子側に任せる。
    const smaller = [...el.children].some(ch => {
      const ct = cleanText(ch.textContent || "");
      if (!ct || ct.length >= text.length * 0.92 || threadHeaderCount(ch) > 0) return false;
      const ck = `${ch.id || ""} ${ch.className || ""}`.toLowerCase();
      const cl = ch.querySelectorAll?.("a[href]")?.length || 0;
      return labelRe.test(ct.slice(0, 220)) || keyRe.test(ck) || (cl >= 5 && ct.length <= 5200 && (ct.length / Math.max(1, cl)) < 180);
    });
    if (!smaller) el.remove();
  }

  // 「見出し + リンク列」が本文の途中に直挿しされるケース。
  // 次の実レスがあればそこまでだけ消し、後続本文は残す。
  for (let pass = 0; pass < 10; pass++) {
    const labels = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6,p,div,section,span,b,strong")].filter(el => {
      if (!container.contains(el)) return false;
      const t = cleanText(el.textContent || "");
      if (!t || t.length > 100 || !labelRe.test(t)) return false;
      if (threadHeaderCount(el) > 0) return false;
      return ![...el.children].some(ch => {
        const ct = cleanText(ch.textContent || "");
        return ct && ct.length <= t.length && labelRe.test(ct);
      });
    });
    if (!labels.length) break;

    let changed = false;
    for (const label of labels) {
      if (!hasMeaningfulArticleContentAfter(label, container)) continue;
      const all = [...container.querySelectorAll("p,div,section,li,dt,dd,span,font,b,strong,blockquote")];
      let nextReply = null;
      for (const el of all) {
        if (el === label || label.contains(el) || el.contains(label)) continue;
        if (!(label.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (replySignalCount(el) < 1) continue;
        if ([...el.children].some(ch => replySignalCount(ch) >= 1)) continue;
        nextReply = el;
        break;
      }
      if (nextReply) {
        try {
          const range = document.createRange();
          range.setStartBefore(label);
          range.setEndBefore(nextReply);
          range.deleteContents();
          changed = true;
          break;
        } catch {}
      }

      let cur = label;
      for (let depth = 0; cur && cur !== container && depth < 6; depth++, cur = cur.parentElement) {
        const links = cur.querySelectorAll?.("a[href]")?.length || 0;
        const txt = cleanText(cur.textContent || "").length;
        if (threadHeaderCount(cur) === 0 && links >= 2 && txt <= 3200) {
          cur.remove(); changed = true; break;
        }
      }
      if (changed) break;
    }
    if (!changed) break;
  }
}


function cutTerminalNavigationTail(container, baseUrl="") {
  if (!container) return;
  // v0.1.91: 本文の最後や途中に連結されたサイト回遊UIは本文ではない。
  // 引用元/via/転載元は残し、その後に出る NEXT STORY / おすすめ / 関連記事 /
  // ランキング / RSS / コメント導線などから末尾だけを切る。
  const markerRe = /^(?:[★☆⭐🔥\s]*)?(?:NEXT\s+STORY\b|次の記事を読む(?:\s*→)?|更新一覧|RSS(?:ヘッドライン|一覧)?|おすすめ(?:記事|サイト)?(?:\d+)?|オススメ(?:記事|サイト)?(?:\d+)?|関連記事|関連ニュース|ピックアップ(?:記事)?|人気記事|人気の記事|記事人気ランキング|人気ランキング|アクセスランキング|注目記事|注目ランキング|新着記事|こちらもおすすめ|あわせて読みたい|この記事を読んだ人(?:はこちら|におすすめ)?|よく読まれている(?:記事|ニュース)?|今読まれている(?:記事|ニュース)?|話題の記事|話のタネに関する最新の話題|本日のおすすめニュース|最近の人気記事|過去\d+日(?:間)?の人気記事|厳選おすすめまとめ|他の人が読んでる記事(?:（外部）|\(外部\))?|この記事をシェアする[！!]?|その他おすすめサイト|相互RSS|人気サイトヘッドライン|サイト内ランキング|最新記事一覧|カテゴリ一覧|カテゴリー|タグ(?:一覧)?|コメントありがとうございます|コメント一覧(?:\s*[（(]?\d+[）)]?)?|最新のコメントへ(?:\s*[（(]?\d+[）)]?)?|\d+コメント|不思議ネットとは|スポンサードリンク|スポンサーリンク|PR|AD|Sponsored)(?:[:：]?\s*)/i;
  const sourceRe = /^(?:引用元|転載元|元スレ|source|via)\s*[:：]?/i;

  const nodes=[...container.querySelectorAll('h1,h2,h3,h4,h5,h6,nav,aside,section,div,p,ul,ol,table,span,strong,b,a')];
  const labels=nodes.filter(el=>{
    if(!container.contains(el))return false;
    const t=cleanText(el.textContent||'');
    if(!t || t.length>320 || sourceRe.test(t) || !markerRe.test(t))return false;
    // 親の巨大箱ではなく、できるだけ最小のラベル/モジュールから切る。
    return ![...el.children].some(ch=>{
      const ct=cleanText(ch.textContent||'');
      return ct && ct.length<t.length && ct.length<=320 && markerRe.test(ct) && !sourceRe.test(ct);
    });
  });

  for(const label of labels){
    try{
      const after=document.createRange();
      after.setStartBefore(label);
      after.setEnd(container,container.childNodes.length);
      const aft=document.createElement('div'); aft.appendChild(after.cloneContents());
      // 途中のおすすめ欄の後ろに実レスが続く場合は、末尾切りしない。
      if(replySignalCount(aft)>0)continue;

      const before=document.createRange();
      before.setStart(container,0); before.setEndBefore(label);
      const bef=document.createElement('div'); bef.appendChild(before.cloneContents());
      const beforeText=cleanText(bef.textContent||'');
      if(beforeText.length<180 && replySignalCount(bef)<1)continue;

      after.deleteContents();
      break;
    }catch{}
  }

  // 明示ラベルが無いサイトでも、本文末尾に短い他記事リンクが大量連結された場合は切る。
  trimLinkFarmTail(container);
}

function cutAfterStopHeading(container, baseUrl="") {
  const stopRe = /^(?:この記事への)?コメント(?:一覧|する)?$|^コメントフォーム$|^関連記事$|^おすすめ記事(?:\d+)?$|^おすすめ$|^人気記事$|^記事人気ランキング$|^人気ランキング$|^アクセスランキング$|^注目記事$|^注目ランキング$|^新着記事$|^ピックアップ(?:記事)?$|^こちらもおすすめ$|^あわせて読みたい$|^この記事を読んだ人(?:はこちら|におすすめ)?$|^この記事の関連タグ[:：]?$|^この記事のタグ[:：]?$|^今週の人気記事$|^本日のおすすめニュース$|^話のタネに関する最新の話題$|^最近の人気記事$|^過去\d+日(?:間)?の人気記事$|^厳選おすすめまとめ[！!]?$|^他の人が読んでる記事(?:（外部）|\(外部\))?$|^この記事をシェアする[！!]?$|^\d+コメント$|^その他おすすめサイト$/;
  const headings = [...container.querySelectorAll("h1,h2,h3,h4,h5")]
    .filter(el => stopRe.test(cleanText(el.textContent)));
  if (!headings.length) return;

  for (const heading of headings) {
    const label = cleanText(heading.textContent);

    // ラビット速報は本文途中に「おすすめ記事」を挟んだあと、3レス目以降が続く。
    // 後方に実レスが残っている場合は終端扱いせず、見出しだけ消す。
    if ((isRabbitSokuhoUrl(baseUrl) || isKonoyubiUrl(baseUrl)) && /^(?:おすすめ(?:記事)?|人気記事|人気の記事(?:[（(]外部[）)])?)/.test(label)) {
      try {
        const range = document.createRange();
        range.setStartAfter(heading);
        range.setEnd(container, container.childNodes.length);
        const tmp = document.createElement("div");
        tmp.appendChild(range.cloneContents());
        if (replySignalCount(tmp) > 0) {
          heading.remove();
          continue;
        }
      } catch {}
    }

    let cur = heading;
    let first = true;
    while (cur && cur !== container && cur.parentNode) {
      const parent = cur.parentNode;
      let sib = cur.nextSibling;
      while (sib) {
        const next = sib.nextSibling;
        sib.remove();
        sib = next;
      }
      if (first) {
        cur.remove();
        first = false;
      }
      cur = parent;
    }
    break;
  }
}

let lightboxScale=1,lightboxX=0,lightboxY=0,lightboxTouchDistance=0,lightboxStartScale=1;
let lightboxPanStartX=0,lightboxPanStartY=0,lightboxPanBaseX=0,lightboxPanBaseY=0,lightboxSuppressClickUntil=0;
let lightboxGallery=[],lightboxIndex=-1,lightboxSwipeX=null,lightboxSwipeY=null;
let lightboxBaseW=0,lightboxBaseH=0,lightboxMouseDragging=false,lightboxMouseStartX=0,lightboxMouseStartY=0,lightboxMouseBaseX=0,lightboxMouseBaseY=0;
const lightboxPrev=document.getElementById('lightboxPrev');
const lightboxNext=document.getElementById('lightboxNext');
const lightboxCounter=document.getElementById('lightboxCounter');
function lightboxDistance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
function lightboxImageSource(img){
  if(!img||img.dataset.preparedGif||img.dataset.gifClickMode==='1'||img.dataset.hoverGifReady==='1'||img.closest('.hover-gif-wrap,.youtube-inline-card,.prepared-video'))return '';
  return img.dataset.originalSrc||img.currentSrc||img.src||'';
}
function rebuildLightboxGallery(preferred=''){
  const seen=new Set();lightboxGallery=[];
  for(const img of contentEl?.querySelectorAll?.('img')||[]){
    if(img.closest('.instagram-static-card') && img.alt!=='Instagram投稿画像')continue;
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
  lightboxImg.onload=()=>fitLightboxImage();lightboxImg.src=lightboxGallery[lightboxIndex];updateLightboxNav();
}
function openLightbox(src){rebuildLightboxGallery(src);lightbox.hidden=false;document.body.style.overflow='hidden';showLightboxIndex(lightboxIndex);}
function closeLightbox(){lightbox.hidden=true;resetLightboxTransform();lightboxImg.onload=null;lightboxImg.removeAttribute('src');lightboxImg.style.width='';lightboxImg.style.height='';document.body.style.overflow='';lightboxSwipeX=lightboxSwipeY=null;lightboxMouseDragging=false;}
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

// Keep article media inside the reader. Some source pages wrap GIF/image thumbnails
// in <a href="...gif/jpg/png">. A click on the image margin/nearby whitespace
// can otherwise navigate the whole reader to the raw media URL, forcing a browser
// Back + full reload. Intercept those links in the capture phase.
contentEl?.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement;
  if (!target) return;

  const wrap = target.closest?.(".hover-gif-wrap");
  const anchor = target.closest?.("a[href]");
  const href = anchor ? (anchor.href || anchor.getAttribute("href") || "") : "";
  const gifImg = anchor?.querySelector?.('img[data-gif-click-mode="1"], img[data-hover-gif-src], img.hover-gif, .hover-gif-wrap img');
  const isGifLink = !!(href && isGifUrl(href));

  // GIFs are controlled by viewport auto-play. Never navigate and never lightbox them.
  if (wrap || gifImg || isGifLink) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    return false;
  }

  // Static direct-image links also stay in-page. Open the reader lightbox instead
  // of navigating away to the raw file. This also covers clicks on the anchor's
  // padding/whitespace near the image.
  if (anchor && href && isDirectPreviewImageUrl(href)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    const img = anchor.querySelector?.("img");
    openLightbox(img?.currentSrc || img?.src || displayImageUrl(href));
    return false;
  }
}, true);


function stripPickupLabel(s) {
  return cleanText(s)
    .replace(/[【\[]\s*Pickup[^】\]]*[】\]]/ig, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findPickupTarget(doc, baseUrl, pageTitle) {
  let host = "";
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch {}
  if (host !== "alfalfalfa.com") return "";
  if (!/pickup/i.test(pageTitle || "")) return "";

  const wanted = stripPickupLabel(pageTitle);
  const key = wanted.replace(/[「」『』【】()[\]（）\s]/g, "").slice(0, 22);
  if (!key) return "";

  const candidates = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    const text = stripPickupLabel(a.textContent || "");
    if (!text) continue;

    let href = "";
    try { href = new URL(a.getAttribute("href"), baseUrl).href; } catch { continue; }

    let h = "";
    try { h = new URL(href).hostname.replace(/^www\./, ""); } catch {}
    if (h !== host) continue;
    if (canonicalPageUrl(href) === canonicalPageUrl(baseUrl)) continue;

    const normalized = text.replace(/[「」『』【】()[\]（）\s]/g, "");
    let score = 0;
    if (sameTitle(text, wanted)) score += 100;
    if (normalized.includes(key) || key.includes(normalized.slice(0, Math.min(18, normalized.length)))) score += 50;
    if (/\/articles\/\d+/i.test(href)) score += 20;
    if (/pickup/i.test(text)) score -= 20;

    if (score > 0) candidates.push({href, score, len:text.length});
  }

  candidates.sort((a,b) => b.score - a.score || a.len - b.len);
  return candidates[0]?.href || "";
}

function trimLinkFarmTail(container) {
  // 本文後ろに残った「関連記事・他記事一覧」を、リンク密度で保険的に切る。
  // レス本文を誤って消さないよう、十分本文が出た後だけ判定する。
  const children = [...container.children];
  let seenText = 0;

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    const text = cleanText(el.textContent);
    seenText += text.length;
    if (seenText < 180) continue;

    const links = [...el.querySelectorAll("a[href]")];
    const imgs = el.querySelectorAll("img").length;
    const threadHeaders = replySignalCount(el);
    const shortLinks = links.filter(a => {
      const t = cleanText(a.textContent);
      return t.length >= 6 && t.length <= 180;
    }).length;

    const looksLikeFarm =
      threadHeaders === 0 &&
      (
        shortLinks >= 5 ||
        (shortLinks >= 3 && imgs >= 2) ||
        (links.length >= 6 && text.length < 1500)
      );

    if (!looksLikeFarm) continue;

    for (let j = i; j < children.length; j++) children[j].remove();
    break;
  }
}


function ushi32LeadImageUrl(doc, baseUrl, title='') {
  if(!isUshi32Url(baseUrl) || !doc)return '';
  let titleNode=null;
  if(title){
    for(const el of doc.querySelectorAll("h1,h2,h3,.article-title,.entry-title,.post-title")){
      const t=cleanText(el.textContent||''); if(t&&sameTitle(t,title)){titleNode=el;break;}
    }
  }
  const scope=titleNode?.closest?.(".recent-article-outer,article,.hentry,.article-outer,.entry,.entry-outer,.post,.post-outer,.article-wrapper,.entry-wrapper") ||
    doc.querySelector('.recent-article-outer .articles-body .article-body > .article-body-inner') ||
    doc.querySelector("[itemprop='articleBody']")?.closest?.("article,.hentry,.article-outer,.entry,.post") || doc.querySelector('#main') || doc.querySelector('main') || doc.body;
  let firstReply=null;
  firstReply=scope.querySelector('.t_h');
  if(!firstReply){
    for(const el of scope.querySelectorAll("p,div,section,li,td,dd,blockquote")){
      const t=cleanText(el.textContent||'');
      if(/^(?:>>\s*)?\d{1,5}\s*[：:](?!\d)/.test(t)){firstReply=el;break;}
    }
  }
  const candidates=[];
  const seen=new Set();
  const push=(url,score,img=null)=>{
    url=absUrl(url||'',baseUrl)||''; if(!/^https?:\/\//i.test(url)||seen.has(url))return;
    const meta=`${url} ${img?.getAttribute?.('alt')||''} ${img?.getAttribute?.('title')||''} ${img?.className||''} ${img?.id||''}`;
    if(/(?:logo|favicon|avatar|icon|emoji|button|banner|ranking|rank|amazon|rakuten|affiliate|sponsor|advert|pixel|tracking|noimage|placeholder)/i.test(meta))return;
    if(img){
      const {w,h}=declaredImageSize(img); if((w&&w<120)||(h&&h<80))return;
      if(w&&h)score+=Math.min(5000,(w*h)/180);
      if(/(?:eyecatch|eye-catch|featured|main[-_ ]?image|article[-_ ]?image|entry[-_ ]?image)/i.test(meta))score+=5000;
      if(firstReply && (img.compareDocumentPosition(firstReply)&Node.DOCUMENT_POSITION_FOLLOWING))score+=3500;
    }
    seen.add(url); candidates.push({url,score});
  };
  for(const img of scope.querySelectorAll('img')){
    if(firstReply && !(img.compareDocumentPosition(firstReply)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
    push(rawImageUrl(img,baseUrl),12000,img);
  }
  push(metaContent(doc,['meta[property="og:image"]','meta[name="twitter:image"]','meta[property="twitter:image"]','meta[name="twitter:image:src"]','meta[property="twitter:image:src"]']),10000);
  const imageSrc=doc.querySelector('link[rel="image_src"]')?.getAttribute('href')||''; push(imageSrc,9000);
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]?.url||'';
}
function ensureUshi32LeadImage(container, rawDoc, baseUrl, title='') {
  if(!container || !isUshi32Url(baseUrl))return false;
  const url=ushi32LeadImageUrl(rawDoc,baseUrl,title); if(!url)return false;
  const present=[...container.querySelectorAll('img')].some(img=>{
    const vals=[img.getAttribute('src')||'',img.getAttribute('data-original-src')||'',img.getAttribute('data-src')||''];
    return vals.some(v=>v===url || (()=>{try{return decodeURIComponent(v).includes(url)}catch{return false}})());
  });
  if(present){
    const first=[...container.querySelectorAll('img')].find(img=>{
      const v=img.getAttribute('src')||''; try{return v===url||decodeURIComponent(v).includes(url)}catch{return v===url}
    });
    first?.classList?.add('usi32-lead-image');
    if(first)first.dataset.requiredMedia='1';
    return false;
  }
  const img=document.createElement('img');
  img.src=displayImageUrl(url); img.alt=title?`${title} メイン画像`:'記事メイン画像';
  img.loading='eager';img.decoding='async';img.className='usi32-lead-image';img.dataset.requiredMedia='1';
  container.prepend(img);return true;
}


// v0.1.71: Reply #1 is patched independently from the normal article extractor.
// Some sites render reply markers as "1" / "2" with no colon.  Treat that layout as a reply
// boundary only for this safety-net path, so already-correct replies #2/#3/#4... are untouched.
function rawReplyMarkerNumber(el, allowStandalone=false) {
  const t=cleanText(el?.textContent||'');
  let m=t.match(/^(?:>>\s*)?(\d{1,5})(?:\s*[：:](?!\d)|\s+名前\s*[：:])/);
  if(m) return Number(m[1]);
  if(allowStandalone){
    m=t.match(/^(?:>>\s*)?(\d{1,5})\s*$/);
    if(m) return Number(m[1]);
  }
  return null;
}
function rawReplyMarkerLeaves(root, allowStandalone=false) {
  if (!root?.querySelectorAll) return [];
  const selector='p,div,section,li,td,dd,dt,blockquote,span,font';
  return [...root.querySelectorAll(selector)].filter(el=>{
    const n=rawReplyMarkerNumber(el,allowStandalone);
    if(n==null) return false;
    // Keep the smallest marker node so parent containers containing replies are not selected.
    return ![...el.children].some(ch=>rawReplyMarkerNumber(ch,allowStandalone)!=null);
  });
}
function firstReplyMarkerSet(scope, requireStandaloneTwo=true) {
  // Prefer the conventional "1:" syntax.  Only fall back to bare "1" if a later bare "2"
  // exists, which avoids mistaking unrelated counters for a thread reply.
  let markers=rawReplyMarkerLeaves(scope,false);
  let first=markers.find(el=>rawReplyMarkerNumber(el,false)===1)||null;
  if(first) return {markers,first,standalone:false};
  markers=rawReplyMarkerLeaves(scope,true);
  first=markers.find(el=>rawReplyMarkerNumber(el,true)===1)||null;
  if(!first) return {markers:[],first:null,standalone:false};
  const i=markers.indexOf(first);
  const hasTwo=markers.slice(i+1).some(el=>rawReplyMarkerNumber(el,true)===2 && !!(first.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING));
  if(requireStandaloneTwo && !hasTwo) return {markers:[],first:null,standalone:false};
  return {markers,first,standalone:true};
}

function minimalReplyBlock(marker, boundary) {
  if(!marker) return null;
  let block=marker;
  let cur=marker.parentElement;
  let depth=0;
  while(cur && cur!==boundary && depth++<7){
    const replies=simpleReplyCount(cur);
    const text=cleanText(cur.textContent||'');
    if(replies>1 || text.length>5000) break;
    block=cur;
    cur=cur.parentElement;
  }
  return block;
}
function firstReplySlice(scope, allowIsolatedStandalone=false) {
  const set=firstReplyMarkerSet(scope,!allowIsolatedStandalone);
  const first=set.first;if(!first)return null;
  const i=set.markers.indexOf(first);
  let next=set.markers.slice(i+1).find(el=>{
    if(!(first.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))return false;
    const n=rawReplyMarkerNumber(el,set.standalone);
    return n!=null && n!==1;
  })||null;
  // Bare-number sites must end specifically at reply 2.  This keeps later replies completely
  // outside the patch and guarantees existing #4+ extraction is not modified.
  if(set.standalone){
    next=set.markers.slice(i+1).find(el=>rawReplyMarkerNumber(el,true)===2 && !!(first.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))||next;
  }
  return {first,next,standalone:set.standalone,markers:set.markers};
}

function rawFirstReplyBundle(doc, preferredScope=null) {
  if(!doc?.body) return null;
  const scopes=[];
  if(preferredScope?.querySelectorAll) scopes.push(preferredScope);
  if(!scopes.includes(doc.body)) scopes.push(doc.body);
  for(const scope of scopes){
    const slice=firstReplySlice(scope); if(!slice) continue;
    const {first,next,standalone}=slice;
    try{
      const wrap=doc.createElement('div');
      wrap.dataset.rawFirstReply='1';
      wrap.dataset.requiredReply='1';
      const range=doc.createRange();
      if(standalone){
        // For "1"/"2" layouts use the marker elements themselves as exact DOM boundaries.
        range.setStartBefore(first);
        if(next) range.setEndBefore(next); else range.setEndAfter(first);
      }else{
        const firstBlock=minimalReplyBlock(first,scope)||first;
        const nextBlock=next ? (minimalReplyBlock(next,scope)||next) : null;
        range.setStartBefore(firstBlock);
        if(nextBlock) range.setEndBefore(nextBlock); else range.setEndAfter(firstBlock);
      }
      wrap.appendChild(range.cloneContents());
      const text=cleanText(wrap.textContent||'');
      const media=wrap.querySelectorAll('img,picture,video,source,iframe,blockquote,a[href]').length;
      const markerCount=standalone ? 1 : simpleReplyCount(wrap);
      if(markerCount!==1 || text.length>6000 || (text.length<1 && media===0)) continue;
      markRequiredReplyMedia(wrap,true);
      return wrap;
    }catch{}
  }
  return null;
}


function pruneProtectedFirstReplyLinkLists(root, baseUrl='') {
  // v0.1.71: Reply #1 is protected from the normal recommendation cleaners, but some
  // sites inject a dense "related/recommended articles" link list *inside* that reply.
  // Remove only link-list-shaped blocks.  A normal source URL, quote link, Imgur/X/
  // Instagram/YouTube/media block must survive.
  if(!root?.querySelectorAll) return;
  const mediaSel='img,picture,video,source,audio,iframe,blockquote,pre,[data-x-embed-preserve="1"],[data-instagram-preserve="1"],[data-instagram-post-url],[data-imgur-preserve="1"],.x-static-card,.x-static-section,.instagram-static-card,.prepared-video,.youtube-inline-card';
  let baseHost='';
  try{ baseHost=new URL(baseUrl).hostname.replace(/^www\./,''); }catch{}
  const qualifies=(el)=>{
    if(!el?.querySelectorAll) return false;
    if(el.querySelector(mediaSel)) return false;
    const links=[...el.querySelectorAll('a[href]')];
    if(links.length<4 || links.length>40) return false;
    if(replySignalCount(el)>0) return false;
    const hrefs=links.map(a=>absUrl(a.getAttribute('href')||'',baseUrl)).filter(Boolean);
    if(hrefs.length<4) return false;
    // Any explicit media/social link makes this real reply content, not a recommendation list.
    if(hrefs.some(h=>/\.(?:jpe?g|png|gif|webp|avif|bmp|svg|mp4|webm|m4v)(?:$|[?#])/i.test(h) ||
                    /(?:^|\.)imgur\.com\//i.test(h) || /(?:x\.com|twitter\.com)\/[^/\s]+\/status\/\d+/i.test(h) ||
                    /instagram\.com\/(?:p|reel|tv)\//i.test(h) || /(?:youtube\.com|youtu\.be)\//i.test(h))) return false;
    const text=cleanText(el.textContent||'');
    if(!text || text.length>Math.max(1800,links.length*220)) return false;
    const linkText=links.reduce((n,a)=>n+cleanText(a.textContent||'').length,0);
    if(linkText<Math.max(24,Math.floor(text.length*0.58))) return false;
    let same=0, http=0;
    for(const h of hrefs){
      if(!/^https?:/i.test(h)) continue; http++;
      try{ if(baseHost && new URL(h).hostname.replace(/^www\./,'')===baseHost) same++; }catch{}
    }
    // Most recommendation lists are internal article links.  Also accept a very dense
    // all-external list, but only when essentially all visible text is links.
    const internalDense=http>0 && same/Math.max(1,http)>=0.6;
    const ultraDense=linkText>=Math.floor(text.length*0.82);
    return internalDense || ultraDense;
  };

  // Remove the smallest qualifying wrapper first so surrounding reply text is never lost.
  for(let pass=0;pass<8;pass++){
    const nodes=[...root.querySelectorAll('ul,ol,table,tbody,div,section,nav')];
    let victim=null;
    for(const el of nodes){
      if(!qualifies(el)) continue;
      const childQualifies=[...el.children].some(ch=>qualifies(ch));
      if(childQualifies) continue;
      victim=el; break;
    }
    if(!victim) break;
    victim.remove();
  }
}

function sanitizeRequiredFirstReply(raw, baseUrl) {
  if(!raw) return null;
  const clone=raw.cloneNode(true);
  clone.dataset.rawFirstReply='1';
  clone.dataset.requiredReply='1';

  // Reply #1 is semantic content. Convert known embeds before any generic cleanup,
  // then perform only a minimal safety cleanup here. Do NOT run the normal
  // recommendation/affiliate/article cleaners on this protected slice.
  try{ protectXEmbeds(clone,baseUrl); }catch{}
  try{ protectInstagramEmbeds(clone,baseUrl); }catch{}
  try{ protectImgurEmbeds(clone,baseUrl); }catch{}
  try{ pruneProtectedFirstReplyLinkLists(clone,baseUrl); }catch{}

  for(const el of [...clone.querySelectorAll('script,style,noscript,template,object,embed,form,input,textarea,select,button')]) el.remove();

  for(const frame of [...clone.querySelectorAll('iframe[src]')]) {
    if(isXEmbedIframe(frame,baseUrl) || isYouTubeEmbedIframe(frame,baseUrl)) continue;
    const src=absUrl(frame.getAttribute('src')||'',baseUrl);
    if(!src){ frame.remove(); continue; }
    if(/\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(src)) {
      const img=clone.ownerDocument.createElement('img');
      img.src=src; img.alt=frame.getAttribute('title')||'埋め込み画像'; img.dataset.requiredMedia='1';
      frame.replaceWith(img);
      continue;
    }
    const a=clone.ownerDocument.createElement('a');
    a.href=src; a.textContent=frame.getAttribute('title')||'埋め込みを開く'; a.dataset.requiredMedia='1';
    frame.replaceWith(a);
  }

  for(const img of [...clone.querySelectorAll('img')]) {
    if(isClearlyNonRequiredImage(img)) img.dataset.nonRequiredMedia='1';
  }

  for(const el of [...clone.querySelectorAll('*')]) {
    for(const attr of [...el.attributes]) {
      const n=attr.name.toLowerCase();
      if(n.startsWith('on') || n==='style' || n==='class' || n==='id' || n==='width' || n==='height' || n==='srcset' || n==='sizes') el.removeAttribute(attr.name);
    }
    if(el.tagName==='A') {
      const href=absUrl(el.getAttribute('href')||'',baseUrl);
      if(href) el.setAttribute('href',href);
      el.setAttribute('target','_self'); el.setAttribute('rel','noopener');
    } else if(el.tagName==='IMG') {
      const rawSrc=el.getAttribute('data-src')||el.getAttribute('data-original')||el.getAttribute('data-lazy-src')||el.getAttribute('data-lazy')||el.getAttribute('data-echo')||el.getAttribute('src')||'';
      if(el.dataset.nonRequiredMedia==='1' || isNonRequiredMediaUrl(rawSrc,baseUrl)){ el.remove(); continue; }
      const src=mediaAbsUrl(rawSrc,baseUrl);
      if(!src){ el.remove(); continue; }
      el.setAttribute('src',displayImageUrl(src)); el.setAttribute('loading','lazy'); el.setAttribute('referrerpolicy','no-referrer'); el.dataset.requiredMedia='1';
      for(const x of ['data-src','data-original','data-lazy-src','data-lazy','data-echo']) el.removeAttribute(x);
    } else if(el.tagName==='VIDEO') {
      el.removeAttribute('autoplay'); el.setAttribute('controls','controls'); el.setAttribute('preload','metadata'); el.setAttribute('playsinline',''); el.dataset.requiredMedia='1';
      const src=absUrl(el.getAttribute('src')||'',baseUrl);
      if(src){ if(PREPARING){el.dataset.videoSource=src;el.removeAttribute('src');}else el.setAttribute('src',src); }
    } else if(el.tagName==='SOURCE') {
      const src=absUrl(el.getAttribute('src')||'',baseUrl);
      if(src){ if(PREPARING){el.dataset.videoSource=src;el.removeAttribute('src');}else el.setAttribute('src',src); }
      el.dataset.requiredMedia='1';
    } else if(el.tagName==='IFRAME') {
      const src=absUrl(el.getAttribute('src')||'',baseUrl);
      if(src) el.setAttribute('src',src);
      el.setAttribute('loading','eager'); el.dataset.requiredMedia='1';
    }
  }
  markRequiredReplyMedia(clone,true);
  return clone;
}

function prepareRawFirstReply(doc, preferredScope, baseUrl) {
  const raw=rawFirstReplyBundle(doc,preferredScope);
  if(!raw) return null;
  return sanitizeRequiredFirstReply(raw,baseUrl);
}

function firstReplyStats(container) {
  if(!container) return {present:false};
  let box=null;
  // rawFirstReply is already exactly the 1 -> before-2 slice, so inspect it whole.  This also
  // supports bare-number sites where the terminating 2 is intentionally outside the bundle.
  if(container.dataset?.rawFirstReply==='1'){
    box=container.cloneNode(true);
  }else{
    const slice=firstReplySlice(container); if(!slice) return {present:false};
    const {first,next,standalone}=slice;
    try{
      box=document.createElement('div');
      const range=document.createRange();
      if(standalone){
        range.setStartBefore(first); if(next) range.setEndBefore(next); else range.setEndAfter(first);
      }else{
        const firstBlock=minimalReplyBlock(first,container)||first;
        const nextBlock=next ? (minimalReplyBlock(next,container)||next) : null;
        range.setStartBefore(firstBlock); if(nextBlock) range.setEndBefore(nextBlock); else range.setEndAfter(firstBlock);
      }
      box.appendChild(range.cloneContents());
    }catch{box=first.cloneNode(true);}
  }
  const html=box.innerHTML||'';
  const text=cleanText(box.textContent||'');
  const hrefs=[...box.querySelectorAll('a[href]')].map(a=>String(a.getAttribute('href')||''));
  return {
    present:true,
    instagram:!!box.querySelector('blockquote.instagram-media,[data-instagram-post-url],iframe[src*="instagram.com/"]') || /instagram\.com\/(?:p|reel|tv)\//i.test(html),
    x:!!box.querySelector('blockquote.twitter-tweet,[data-x-embed-preserve],.x-static-card,iframe[src*="twitter.com/"],iframe[src*="x.com/"]') || hrefs.some(h=>/(?:x\.com|twitter\.com)\/[^/\s]+\/status\/\d+/i.test(h)),
    video:!!box.querySelector('video,source,.prepared-video,iframe[src*="youtube.com/"],iframe[src*="youtube-nocookie.com/"]') || hrefs.some(h=>/video\.twimg\.com\/|\.(?:mp4|webm|m4v)(?:$|[?#])|youtu\.be\/|youtube\.com\/(?:watch|shorts)/i.test(h)),
    imgur:!!box.querySelector('[data-imgur-preserve]') || hrefs.some(h=>/(?:^|\.)imgur\.com\//i.test(h)),
    images:box.querySelectorAll('img,picture').length + hrefs.filter(h=>/\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(h)).length,
    urls:hrefs.filter(h=>/^https?:/i.test(h)).length + ((text.match(/https?:\/\/\S+/g)||[]).length),
    textLen:text.length
  };
}

function firstReplyNeedsRestore(container, rawFirst) {
  const raw=firstReplyStats(rawFirst);
  const cur=firstReplyStats(container);
  if(!raw.present) return false;
  if(!cur.present) return true;
  if(raw.instagram && !cur.instagram) return true;
  if(raw.x && !cur.x) return true;
  if(raw.video && !cur.video) return true;
  if(raw.imgur && !cur.imgur && raw.images>=cur.images) return true;
  if(raw.images>cur.images) return true;
  if(raw.urls>cur.urls) return true;
  if(raw.textLen>cur.textLen+120) return true;
  return false;
}

function replacePreparedFirstReply(container, rawFirst) {
  if(!container || !rawFirst) return false;
  const slice=firstReplySlice(container);
  if(slice){
    const {first,next,standalone}=slice;
    try{
      const range=document.createRange();
      if(standalone){
        range.setStartBefore(first); if(next) range.setEndBefore(next); else range.setEndAfter(first);
      }else{
        const firstBlock=minimalReplyBlock(first,container)||first;
        const nextBlock=next ? (minimalReplyBlock(next,container)||next) : null;
        range.setStartBefore(firstBlock); if(nextBlock) range.setEndBefore(nextBlock); else range.setEndAfter(firstBlock);
      }
      range.deleteContents();range.insertNode(rawFirst);return true;
    }catch{}
  }
  // If the selected candidate starts at reply 2/37/etc., insert only reply #1 ahead of it.
  const comment=[...container.querySelectorAll('h1,h2,h3,h4,h5,p,div,strong,b')].find(el=>{
    const t=cleanText(el.textContent||'');
    return /^(?:Comment|コメント)$/i.test(t) && t.length<30 && simpleReplyCount(el)===0;
  });
  if(comment){ comment.before(rawFirst); return true; }
  const markers=rawReplyMarkerLeaves(container,true);
  const firstAny=markers[0];
  if(firstAny){ firstAny.before(rawFirst); return true; }
  const lead=[...container.querySelectorAll('img')].find(img=>img.dataset.requiredMedia==='1'||img.classList?.contains('usi32-lead-image')||img.classList?.contains('article-required-lead-image'));
  if(lead){ (lead.closest('a,figure,p,div')||lead).after(rawFirst); return true; }
  container.prepend(rawFirst);return true;
}

function canonicalMediaKey(raw='') {
  let u=String(raw||'').trim(); if(!u)return '';
  try{
    const x=new URL(u,location.href);const h=x.hostname.toLowerCase().replace(/^www\./,'');
    if(h==='i.imgur.com'||h==='imgur.com'){
      const parts=x.pathname.split('/').filter(Boolean);let id=parts.pop()||'';id=id.replace(/\.(?:jpe?g|png|gif|webp|avif)$/i,'');if(id)return 'imgur:'+id.toLowerCase();
    }
    x.hash=''; for(const k of ['width','height','w','h','name'])x.searchParams.delete(k);
    return x.toString();
  }catch{return u;}
}
function dedupeArticleMedia(root){
  if(!root)return;
  // X cards/blockquote/placeholders: same status id only once. Generated static card wins by DOM order.
  const xseen=new Set();
  const xPreferred=[...root.querySelectorAll('.x-static-card')];
  const xOthers=[...root.querySelectorAll('[data-tweet-id],blockquote[data-tweet-id],blockquote.twitter-tweet,[data-x-embed-preserve="1"]')].filter(el=>!xPreferred.includes(el));
  for(const card of [...xPreferred,...xOthers]){
    const href=card.querySelector?.('a[href*="/status/"]')?.href||card.getAttribute?.('cite')||'';
    const m=String(href).match(/\/status\/(\d+)/);const id=card.dataset?.tweetId||m?.[1]||'';
    if(!id)continue;if(xseen.has(id)){card.remove();continue;}xseen.add(id);
  }
  // Instagram cards/placeholders: same shortcode once.
  const iseen=new Set();
  const iPreferred=[...root.querySelectorAll('.instagram-static-card')];
  const iOthers=[...root.querySelectorAll('[data-instagram-post-id],[data-instagram-post-url],blockquote.instagram-media')].filter(el=>!iPreferred.includes(el));
  for(const card of [...iPreferred,...iOthers]){
    const raw=card.dataset?.instagramPostUrl||card.getAttribute?.('data-instgrm-permalink')||card.querySelector?.('a[href*="instagram.com/"]')?.href||'';
    const id=card.dataset?.instagramPostId||((raw.match(/\/(?:p|reel|tv)\/([^/]+)/i)||[])[1])||'';
    if(!id)continue;if(iseen.has(id)){card.remove();continue;}iseen.add(id);
  }
  // Prefer images inside X/Instagram cards; standalone duplicate images are removed.
  const seen=new Set();
  const preferred=[...root.querySelectorAll('.x-static-card img,.instagram-static-card img,[data-instagram-post-url] img')];
  const pset=new Set(preferred);
  const imgs=[...preferred,...[...root.querySelectorAll('img')].filter(img=>!pset.has(img))];
  for(const img of imgs){
    if(!img.isConnected)continue;const raw=img.getAttribute('data-original')||img.getAttribute('data-src')||img.currentSrc||img.src||img.getAttribute('src')||'';const key=canonicalMediaKey(raw);if(!key)continue;
    if(seen.has(key)){img.remove();continue;}seen.add(key);
  }
  // Imgur page-link + resolved/direct image: once the image exists, keep the image and drop the redundant page link.
  const imgurImageKeys=new Set([...root.querySelectorAll('img')].map(img=>canonicalMediaKey(img.getAttribute('data-original')||img.getAttribute('data-src')||img.currentSrc||img.src||img.getAttribute('src')||'')).filter(k=>k.startsWith('imgur:')));
  for(const a of [...root.querySelectorAll('a[href]')]){
    if(a.querySelector('img'))continue;const key=canonicalMediaKey(a.getAttribute('href')||'');if(!key.startsWith('imgur:')||!imgurImageKeys.has(key))continue;
    const t=cleanText(a.textContent||'');
    if(!t || /^https?:\/\//i.test(t) || /^(?:Imgur画像|View post on imgur\.com)$/i.test(t))a.remove();
  }
}


function removeItsokuLeadMeta(container, baseUrl='') {
  if(!container || !isItsokuUrl(baseUrl)) return;
  const c=x=>cleanText(x||'');
  const replyRe=/^(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/;
  const all=[...container.querySelectorAll('div,p,li,span,font,b,strong,small,td')];
  const firstReply=all.find(el=>replyRe.test(c(el.textContent))&&![...el.children].some(ch=>replyRe.test(c(ch.textContent)))) || all.find(el=>replyRe.test(c(el.textContent))) || null;
  const beforeFirst=node=>!firstReply || (node!==firstReply&&!node.contains?.(firstReply)&&!!(node.compareDocumentPosition(firstReply)&Node.DOCUMENT_POSITION_FOLLOWING));
  const dateRe=/^20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}$/;
  const commentsRe=/^\d+\s+Comments?$/i;
  const labelRe=/^(?:カテゴリ|タグ)\s*[:：]\s*$/;
  const blockRe=/^(?:カテゴリ|タグ)\s*[:：]\s*[^\n]{1,100}$/;
  const candidates=[...container.querySelectorAll('div,p,li,span,small,section,dl,dt,dd')].filter(beforeFirst);
  for(const el of candidates){
    if(!el.isConnected||el.querySelector('img,picture,video,iframe,blockquote'))continue;
    const t=c(el.textContent);if(!t)continue;
    if(dateRe.test(t)||commentsRe.test(t)||blockRe.test(t)){el.remove();continue;}
    if(labelRe.test(t)){
      const next=el.nextElementSibling;el.remove();
      if(next&&beforeFirst(next)&&!next.querySelector('img,picture,video,iframe,blockquote')){
        const nt=c(next.textContent);
        if(nt&&nt.length<=100&&!replyRe.test(nt)&&!dateRe.test(nt)&&!commentsRe.test(nt)&&!labelRe.test(nt))next.remove();
      }
    }
  }
}

function prepareCandidate(root, baseUrl, title) {
  if (!root) return null;
  const clean = sanitize(root, baseUrl);
  const box = document.createElement("div");
  box.append(...clean.childNodes);
  removeDuplicateChrome(box, title);
  removeItsokuLeadMeta(box, baseUrl);
  if(isGossip1Url(baseUrl)){
    // GOSSIPは1レスだけの短い記事があり、汎用のリンク密度/ノイズ判定だと本文まで消える。
    // サイト専用本文を確保した後は終端だけ切って、そのまま本文として採用する。
    trimGossip1Tail(box);
    removeSponsoredInlineBlocks(box, baseUrl);
    normalizeGossipReplyHeaders(box);
    simplifyThreadHeaders(box);
    compactWhitespace(box);
    try { appendSiteCommentCards(box, root.ownerDocument, 'gossip1', baseUrl); } catch {}
    const sourceUnits=Number(root.dataset?.gossipReplySourceCount||0) || root.querySelectorAll?.('[data-gossip-reply-unit=\"1\"]').length || gossipReplyCount(root);
    const preparedUnits=box.querySelectorAll?.('[data-gossip-reply-unit=\"1\"]').length || gossipReplyCount(box);
    box.dataset.gossipBodySource=String(sourceUnits||0);
    box.dataset.gossipBodyPrepared=String(preparedUnits||0);
    // Never silently accept a sanitizer result that erased protected GOSSIP reply units.
    if(sourceUnits>0 && preparedUnits===0){
      const emergency=document.createElement('div');
      for(const unit of root.querySelectorAll?.('[data-gossip-reply-unit=\"1\"]')||[]) emergency.appendChild(unit.cloneNode(true));
      if(emergency.childNodes.length){ box.replaceChildren(...emergency.childNodes); box.dataset.gossipBodyPrepared=String(sourceUnits); }
    }
    dedupeArticleMedia(box);
    return box;
  }
  removeRabbitInlineRecommendations(box, baseUrl);
  removeInlineNewsPromos(box, baseUrl);
  removeInlineRecommendationBlocks(box);
  removeSponsoredInlineBlocks(box, baseUrl);
  removeGenericArticleNoise(box, baseUrl);
  removeMidArticleExternalCards(box, baseUrl);
  removeMidArticleLinkModules(box, baseUrl);
  removeMidArticleCommercialBlocks(box, baseUrl);
  removeStandalonePromoImages(box, baseUrl);
  cutAfterStopHeading(box, baseUrl);
  cutTerminalNavigationTail(box, baseUrl);
  // v0.1.91: common cleaners are intentionally conservative now; these three sites
  // get explicit end/preserve rules so fixes do not spill into unrelated providers.
  if (isGossip1Url(baseUrl)) trimGossip1Tail(box);
  if (isNews4vipQualityUrl(baseUrl)) cleanupNews4vipQuality(box, baseUrl);
  if (isNegisokuUrl(baseUrl)) trimNegisokuTail(box);
  if (isFesokuUrl(baseUrl)) trimFesokuTail(box);
  if (isNanjPrideUrl(baseUrl)) trimNanjPrideTail(box);
  if (isAllJungleUrl(baseUrl)) trimAllJungleNoise(box);
  if (isKinisokuUrl(baseUrl)) trimKinisokuNoise(box);
  if (isEsuteruUrl(baseUrl)) restoreEsuteruReactionBlock(box, root, baseUrl);
  simplifyThreadHeaders(box);
  compactWhitespace(box);
  try {
    if (isEsuteruUrl(baseUrl)) appendSiteCommentCards(box, root.ownerDocument, 'esuteru', baseUrl);
    else if (isHamusokuUrl(baseUrl)) appendSiteCommentCards(box, root.ownerDocument, 'hamusoku', baseUrl);
    else if (isAlfalfalfaUrl(baseUrl)) appendSiteCommentCards(box, root.ownerDocument, 'alfalfalfa', baseUrl);
    else if (isVipperOreUrl(baseUrl)) appendSiteCommentCards(box, root.ownerDocument, 'vipperore', baseUrl);
  } catch {}
  try { tagCompactReplyMeta(box); } catch {}
  try { stripAlfalfalfaCommentRecommendationLeakPrepared(box, baseUrl); } catch {}
  dedupeArticleMedia(box);
  return box;
}


// v0.1.111: remove Alfalfalfa recommendation thumbnails that can sit visually inside
// the source comment area before generated comment cards are appended.
function stripAlfalfalfaCommentRecommendationLeakPrepared(root, baseUrl){
  if(!root || !isAlfalfalfaUrl(baseUrl))return 0;
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const heads=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,strong,b')]
    .filter(el=>/^(?:アルファルファモザイクの)?コメント(?:\s*[（(]?\d+[）)]?)?$/i.test(clean(el.textContent)));
  let removed=0;
  for(const h of heads){
    let cur=h.nextElementSibling,guard=0;
    while(cur&&guard++<40){
      if(cur.matches('.site-feedback-card,.reply-meta')||cur.querySelector('.site-feedback-card,.reply-meta'))break;
      const t=clean(cur.textContent), links=[...cur.querySelectorAll('a[href]')], imgs=cur.querySelectorAll('img');
      const internal=links.some(a=>{try{const u=new URL(a.getAttribute('href')||'',baseUrl);return /(^|\.)alfalfalfa\.com$/i.test(u.hostname)&&/\/articles\/\d+/i.test(u.pathname);}catch{return false;}});
      const real=/(?:20\d{2}[\/.年-]\d{1,2}|ID[：:]|アルファ民)/.test(t);
      const next=cur.nextElementSibling;
      if(imgs.length&&internal&&!real&&t.length<220){cur.remove();removed++;cur=next;continue;}
      cur=next;
    }
  }
  return removed;
}

function candidateQuality(box) {
  if (!box) return -Infinity;
  const text = cleanText(box.textContent);
  const imgs = box.querySelectorAll("img").length;
  const pres = box.querySelectorAll("pre").length;
  const xFrames = [...box.querySelectorAll("iframe")].filter(f => isXEmbedIframe(f)).length;
  const xQuotes = [...box.querySelectorAll("blockquote")].filter(isXEmbedBlockquote).length;
  const headers = replySignalCount(box);
  const links = box.querySelectorAll("a[href]").length;
  const avgCharsPerLink = links ? text.length / links : text.length;

  let score = text.length + imgs * 90 + pres * 140 + xFrames * 500 + xQuotes * 300 + headers * 260;
  score -= Math.max(0, links - 12) * 28;

  // 記事上部の「他記事一覧 / アンテナ / ランキング」を本文に誤採用しない。
  // レス見出しが無く、短いリンクが大量に並ぶ箱は強く減点する。
  if (headers === 0 && links >= 6 && avgCharsPerLink < 150) score -= 5000 + links * 120;
  if (headers === 0 && links >= 12 && imgs <= 2) score -= 8000;
  return score;
}

function rawRootScore(root, title="") {
  if (!root) return -Infinity;
  const text = cleanText(root.textContent || "");
  const len = text.length;
  if (len < 50 || len > 120000) return -Infinity;
  const headers = threadHeaderCount(root);
  const links = root.querySelectorAll?.("a[href]")?.length || 0;
  const media = root.querySelectorAll?.("img,picture,pre,blockquote,table,iframe,video")?.length || 0;
  const key = `${root.id || ""} ${root.className || ""}`.toLowerCase();
  const avgCharsPerLink = links ? len / links : len;
  let score = Math.min(len, 22000) + headers * 5200 + Math.min(media, 20) * 180;
  if (/(article|entry|post|body|content|main|blogbody|kiji)/.test(key)) score += 1800;
  if (/(side|menu|nav|footer|header|comment|rank|related|recommend|pickup|archive|widget|rss|antenna)/.test(key)) score -= 5000;
  if (headers === 0 && links >= 6 && avgCharsPerLink < 150) score -= 7000 + links * 120;
  if (headers === 0 && links >= 12 && media <= 2) score -= 9000;
  if (title) {
    const head = root.querySelector?.("h1,h2,h3,.article-title,.entry-title,.post-title");
    if (head && sameTitle(head.textContent || "", title)) score += 8000;
  }
  return score;
}

function findTitleAnchoredArticleRoot(doc, title) {
  if (!doc || !title) return null;
  const heads = doc.querySelectorAll("h1,h2,h3,.article-title,.entry-title,.post-title,.entry-header,.post-header");
  let best = null;
  let bestScore = -Infinity;
  for (const head of heads) {
    const ht = cleanText(head.textContent || "");
    if (!ht || !sameTitle(ht, title)) continue;
    let cur = head;
    for (let depth = 0; cur && depth < 9; depth++, cur = cur.parentElement) {
      if (!/^(?:ARTICLE|MAIN|SECTION|DIV|TD)$/i.test(cur.tagName || "")) continue;
      const score = rawRootScore(cur, title) + depth * 40;
      if (score > bestScore) { best = cur; bestScore = score; }
    }
  }
  return best;
}

function fallbackArticleRoots(doc) {
  const selectors = [
    "[itemprop='articleBody']", ".article-body-inner", ".article-body-more", ".article-body.entry-content", ".article-body", ".articleBody",
    ".article_body", ".article-content", ".articleContent", ".entry-content",
    ".entry-body", ".entry_body", ".entrybody", ".post-body", ".postBody",
    ".blogbody", ".articleText", "#articleBody", "#article-body", "#article-body-inner",
    "article", "main", "#main", "#content", ".content", ".main", ".main-content"
  ];
  const out = [];
  const seen = new Set();
  for (const s of selectors) {
    for (const el of doc.querySelectorAll(s)) {
      if (!seen.has(el)) { seen.add(el); out.push(el); }
    }
  }
  // Larger div/section candidates are a true last resort.
  // 通常は既知のarticle/content候補だけで十分なので全divを走査しない。
  if (!out.length) {
    for (const el of doc.querySelectorAll("section,div")) {
      const raw = el.textContent || "";
      const len = raw.length;
      if (len >= 250 && len <= 40000 && !seen.has(el)) {
        seen.add(el); out.push(el);
        if (out.length >= 80) break;
      }
    }
  }
  return out;
}

function chooseBestPreparedContent(doc, baseUrl, title, primaryRoot, preferPrimary=false, primaryIsTitle=false) {
  // サイト専用rootは信頼度が高い。ただし「リンク一覧だけ」の箱は即採用しない。
  if (preferPrimary && primaryRoot) {
    try {
      const box = prepareCandidate(primaryRoot, baseUrl, title);
      const len = cleanText(box?.textContent).length;
      const media = box?.querySelectorAll("img,pre,blockquote,table,iframe,video").length || 0;
      const headers = replySignalCount(box);
      const links = box?.querySelectorAll("a[href]").length || 0;
      const linkFarm = headers === 0 && links >= 8 && len / Math.max(1, links) < 150;
      if ((len >= 80 || media >= 1 || headers >= 1) && !linkFarm) return box;
    } catch {}
  }

  // タイトル直下から取れたrootは、余計なリンク集でないことだけ確認して即表示候補にする。
  // 典型的な記事ではここで決まり、候補総当たりを避けられる。
  if (primaryIsTitle && primaryRoot) {
    try {
      const box = prepareCandidate(primaryRoot, baseUrl, title);
      const len = cleanText(box?.textContent).length;
      const media = box?.querySelectorAll("img,pre,blockquote,table,iframe,video").length || 0;
      const headers = replySignalCount(box);
      const links = box?.querySelectorAll("a[href]").length || 0;
      const linkFarm = headers === 0 && links >= 8 && len / Math.max(1, links) < 150;
      if ((len >= 120 || media >= 1 || headers >= 1) && !linkFarm) return box;
    } catch {}
  }

  // v0.1.24: 候補を全部clone/sanitizeして比べるのをやめる。
  // 先に元DOMを軽く採点し、有望な上位だけ本格整形することで初期表示を高速化。
  const roots = [];
  const titleRoot = primaryIsTitle ? primaryRoot : findTitleAnchoredArticleRoot(doc, title);
  if (titleRoot) roots.push(titleRoot);
  if (primaryRoot) roots.push(primaryRoot);
  roots.push(...fallbackArticleRoots(doc));
  if (doc.body) roots.push(doc.body);

  const seen = new Set();
  const ranked = [];
  for (const root of roots) {
    if (!root || seen.has(root)) continue;
    seen.add(root);
    const score = rawRootScore(root, title);
    if (Number.isFinite(score)) ranked.push({root, score});
  }
  ranked.sort((a,b) => b.score - a.score);

  // title直下 / primary / 上位候補を優先しつつ、最大6候補だけ重い整形を行う。
  const shortlist = [];
  const shortSeen = new Set();
  for (const r of [titleRoot, primaryRoot, ...ranked.slice(0, 6).map(x => x.root)]) {
    if (r && !shortSeen.has(r)) { shortSeen.add(r); shortlist.push(r); }
  }

  let best = null;
  let bestScore = -Infinity;
  for (const root of shortlist) {
    try {
      const box = prepareCandidate(root, baseUrl, title);
      const len = cleanText(box?.textContent).length;
      const media = box?.querySelectorAll("img,pre,blockquote,table,iframe,video").length || 0;
      const links = box?.querySelectorAll("a[href]").length || 0;
      const headers = replySignalCount(box);
      const linkFarm = headers === 0 && links >= 8 && len / Math.max(1, links) < 150;
      if (len < 80 && media === 0) continue;
      if (linkFarm) continue;
      const score = candidateQuality(box) + (root === titleRoot ? 7000 : 0) + (root === primaryRoot ? 1200 : 0);
      if (score > bestScore) { best = box; bestScore = score; }
    } catch {}
  }
  return best;
}

async function extractArticle() {
  if (!requestedUrl) throw new Error("記事URLがありません。");

  let fetched = await fetchDecoded(requestedUrl);
  let text = fetched.text;
  let finalUrl = fetched.finalUrl;
  let doc = new DOMParser().parseFromString(text, "text/html");

  let title =
    metaContent(doc, ['meta[property="og:title"]','meta[name="twitter:title"]']) ||
    cleanText(doc.querySelector("h1")?.textContent) ||
    cleanText(doc.title) ||
    "記事";

  // アルファルファの Pickup は、1ページ内に無関係な記事を大量に並べるラッパーがある。
  // タイトルと一致する本体記事リンクが見つかれば、そちらを1回だけ追って表示する。
  const pickupTarget = findPickupTarget(doc, finalUrl, title);
  if (pickupTarget) {
    try {
      const real = await fetchDecoded(pickupTarget, {cache:"force-cache"});
      text = real.text;
      finalUrl = real.finalUrl;
      doc = new DOMParser().parseFromString(text, "text/html");
      title =
        metaContent(doc, ['meta[property="og:title"]','meta[name="twitter:title"]']) ||
        cleanText(doc.querySelector("h1")?.textContent) ||
        cleanText(doc.title) ||
        stripPickupLabel(title) ||
        "記事";
    } catch (e) { if (PREPARING) throw e; }
  }

  originalLink.href = finalUrl;

  const date =
    metaContent(doc, ['meta[property="article:published_time"]','meta[name="date"]','meta[name="pubdate"]']) ||
    doc.querySelector("time")?.getAttribute("datetime") ||
    cleanText(doc.querySelector("time")?.textContent);

  titleEl.textContent = title;
  document.title = title;

  const m = [];
  if (siteName) m.push(siteName);
  if (date) {
    const d = new Date(date);
    m.push(Number.isNaN(d.getTime()) ? cleanText(date) : new Intl.DateTimeFormat("ja-JP", {
      year:"numeric", month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit"
    }).format(d));
  }
  metaEl.textContent = m.join("　");

  if (isEsuteruUrl(finalUrl)) { try { await augmentEsuteruCommentDocument(doc, finalUrl); } catch {} }

  const konoRoot = isKonoyubiUrl(finalUrl) ? pickKonoyubiArticleRoot(doc, title) : null;
  const ushiRoot = isUshi32Url(finalUrl) ? makeUshi32BodyBundle(doc, title) : null;
  const worldRoot = isWorldFusigiUrl(finalUrl) ? makeWorldFusigiBodyBundle(doc, title) : null;
  const vipperRoot = isVipperOreUrl(finalUrl) ? makeVipperOreBodyBundle(doc, title) : null;
  // v0.1.122: current VIPPER pages often keep comments only on the Livedoor lite comments route.
  // Import those comments after body selection so a comment-heavy page cannot disturb body scoring.
  if (isVipperOreUrl(finalUrl)) { try { await augmentVipperOreCommentDocument(doc, finalUrl); } catch {} }
  const itaiRoot = isItaiNewsUrl(finalUrl) ? makeItaiNewsBodyBundle(doc, title) : null;
  const itsokuRoot = isItsokuUrl(finalUrl) ? makeItsokuBodyBundle(doc, title) : null;
  const esuteruRoot = isEsuteruUrl(finalUrl) ? makeEsuteruBodyBundle(doc, title) : null;
  const gossipRoot = isGossip1Url(finalUrl) ? makeGossip1BodyBundle(doc, title) : null;
  const hamusokuRoot = isHamusokuUrl(finalUrl) ? (()=>{
    const base=makeReplyDenseSiteBundle(doc,title,'hamusoku') || findTitleAnchoredArticleRoot(doc,title);
    if(!base)return null; const w=doc.createElement('div');w.dataset.replyDenseSiteBundle='hamusoku';w.append(...[...base.childNodes].map(n=>n.cloneNode(true)));return w;
  })() : null;
  const fesokuRoot = isFesokuUrl(finalUrl) ? makeReplyDenseSiteBundle(doc, title, 'fesoku') : null;
  const nanjPrideRoot = isNanjPrideUrl(finalUrl) ? makeReplyDenseSiteBundle(doc, title, 'nanjpride') : null;
  const rabbitRoot = (isRabbitSokuhoUrl(finalUrl) || isHeartLogUrl(finalUrl)) ? pickRabbitArticleRoot(doc, title, isRabbitSokuhoUrl(finalUrl)) : null;
  const alfBundleRoot = isAlfalfalfaUrl(finalUrl) ? makeAlfalfalfaBodyBundle(doc, title) : null;
  const alfRoot = isAlfalfalfaUrl(finalUrl) ? (alfBundleRoot || pickAlfalfalfaArticleRoot(doc, title)) : null;
  const jinBundleRoot = isJin115Url(finalUrl) ? makeJin115BodyBundle(doc) : null;
  const jinMarkerRoot = (!jinBundleRoot && isJin115Url(finalUrl)) ? pickJin115ArticleRoot(doc, finalUrl) : null;
  const jinRoot = jinBundleRoot || jinMarkerRoot;
  const titleRoot = findTitleAnchoredArticleRoot(doc, title);
  const root = vipperRoot || itaiRoot || itsokuRoot || esuteruRoot || gossipRoot || hamusokuRoot || fesokuRoot || nanjPrideRoot || ushiRoot || worldRoot || alfRoot || konoRoot || rabbitRoot || jinRoot || titleRoot || pickArticleRoot(doc);
  // When a site exposes explicit reply blocks, do not fall back to a generic page-wide
  // candidate after we have found them.  That fallback was what reintroduced sidebars,
  // Amazon and livedoor Blog chrome on some Konoyubi/World-Fusigi articles.
  const lockedSiteRoot = !!(vipperRoot?.dataset?.vipperOreBodyBundle || itaiRoot?.dataset?.itaiNewsBodyBundle || itsokuRoot?.dataset?.itsokuBodyBundle || esuteruRoot?.dataset?.esuteruBodyBundle || gossipRoot?.dataset?.gossip1BodyBundle || hamusokuRoot?.dataset?.replyDenseSiteBundle || fesokuRoot?.dataset?.replyDenseSiteBundle || nanjPrideRoot?.dataset?.replyDenseSiteBundle || konoRoot?.dataset?.konoyubiReplies || ushiRoot?.dataset?.livedoorThreadBundle || worldRoot?.dataset?.livedoorThreadBundle || (isRabbitSokuhoUrl(finalUrl) && rabbitRoot) || alfBundleRoot?.dataset?.alfalfalfaBodyBundle || (isJin115Url(finalUrl) && !!jinRoot));
  let best = lockedSiteRoot ? prepareCandidate(root, finalUrl, title) : chooseBestPreparedContent(
    doc, finalUrl, title, root,
    !!(vipperRoot || itaiRoot || itsokuRoot || esuteruRoot || gossipRoot || hamusokuRoot || fesokuRoot || nanjPrideRoot || ushiRoot || worldRoot || alfRoot || konoRoot || rabbitRoot || jinRoot),
    !!titleRoot && root === titleRoot
  );
  // General safety net: if the selected box is suspiciously thin while the raw page clearly has
  // many numbered replies, run a second extraction anchored on those reply markers.
  const rawSimple = simpleReplyCount(doc.body);
  const bestSimple = simpleReplyCount(best);
  if (!lockedSiteRoot && rawSimple >= 3 && (bestSimple < Math.min(3, rawSimple) || cleanText(best?.textContent).length < 180)) {
    const secondRoot = isAlfalfalfaUrl(finalUrl) ? pickAlfalfalfaArticleRoot(doc, title) :
      (isKonoyubiUrl(finalUrl) ? pickKonoyubiArticleRoot(doc, title) : null);
    if (secondRoot && secondRoot !== root) {
      const second = chooseBestPreparedContent(doc, finalUrl, title, secondRoot, true, false);
      if (second && (simpleReplyCount(second) > bestSimple || cleanText(second.textContent).length > cleanText(best?.textContent).length*2)) best=second;
    }
  }
  if (!best) throw new Error("本文を見つけられませんでした。");

  // v0.1.139: keep Alfalfalfa extraction diagnostics through snapshot creation.
  if (isAlfalfalfaUrl(finalUrl)) {
    const source=Number(alfBundleRoot?.dataset?.alfalfalfaBodySource||0);
    const bundle=Number(alfBundleRoot?.dataset?.alfalfalfaBodyBundleReplies||0);
    const mode=String(alfBundleRoot?.dataset?.alfalfalfaBodyMode||'fallback');
    best.dataset.alfalfaBodySource=String(source);
    best.dataset.alfalfaBodyBundle=String(bundle);
    best.dataset.alfalfaBodyMode=mode;
    best.dataset.alfalfaBodyPrepared=String(alfalfalfaReplySignalCount(best));
  }

  // v0.1.71: Candidate selection must never be allowed to drop reply #1.
  // Reconstruct it from the raw DOM so Instagram/X/video/image/quote/URL survive together.
  try {
    const rawFirst=prepareRawFirstReply(doc,titleRoot||doc.body,finalUrl);
    if(rawFirst && firstReplyNeedsRestore(best,rawFirst)) replacePreparedFirstReply(best,rawFirst);
  } catch {}

  // 最速表示: 本文抽出が終わった時点でまず画面へ出す。
  // X/Imgur/GIF/分割ページなどの補完は表示後に行い、初期表示を待たせない。
  // v0.1.121: dataset lives on the prepared wrapper. Moving only its children used to drop
  // GOSSIP/Esuteru comment statistics before prepareSnapshot(), so worker logs could not prove
  // whether comments survived to the final HTML. Preserve all site-comment stats explicitly.
  for (const k of [
    'gossipCommentMarker','gossipCommentRoots','gossipCommentPrimary','gossipCommentMarkerItems','gossipCommentExpected','gossipCommentAppended',
    'gossipBodySource','gossipBodyPrepared',
    'alfalfaBodySource','alfalfaBodyBundle','alfalfaBodyMode','alfalfaBodyPrepared',
    'esuteruCommentExpected','esuteruCommentPrimary','esuteruCommentFallback','esuteruCommentAppended','esuteruCommentFetchPages','esuteruCommentFetchErrors','esuteruCommentFetchBytes','esuteruCommentLoose','esuteruCommentFetchErrorDetails'
  ]) {
    if (best.dataset?.[k] != null) contentEl.dataset[k]=best.dataset[k];
  }
  contentEl.replaceChildren(...best.childNodes);
  if (isNews4vipQualityUrl(finalUrl)) { try { cleanupNews4vipQuality(contentEl, finalUrl); } catch {} }
  normalizeReaderTextSizing(contentEl);
  normalizeReaderArticleSpacing(contentEl);
  try {
    const firstRequired = contentEl.querySelector('[data-required-reply="1"]') || contentEl.querySelector('.resHtml .resBody,.t_b');
    if (firstRequired) markRequiredReplyMedia(firstRequired, true);
    else {
      const candidates=[...contentEl.querySelectorAll('div,p,li,blockquote')];
      const first=candidates.find(el=>/^(?:>>\s*)?1(?:\s*[：:](?!\d)|\s+名前\s*[：:])/.test(cleanText(el.textContent||'')));
      if(first){ const wrap=first.closest('.resBody,.t_b,.resHtml')||first.parentElement||first; markRequiredReplyMedia(wrap,true); }
    }
  } catch {}
  if (isUshi32Url(finalUrl)) { try { ensureUshi32LeadImage(contentEl, doc, finalUrl, title); } catch {} }
  loadingEl.hidden = true;
  articleEl.hidden = false;
  restoreReaderScroll();

  // オレ的は生HTML側でXカードが未展開のことがある。本文を先に見せてから補完する。
  if (isJin115Url(finalUrl)) {
    try { await restoreJin115XPosts(contentEl, jinRoot || doc.body, finalUrl); } catch {}
    try { restoreJin115ReactionTail(contentEl, doc, finalUrl); } catch {}
    try { restoreJin115ReactionFallback(contentEl, doc, finalUrl); } catch {}
    try { finalJin115VisualCleanup(contentEl, finalUrl); } catch {}
    try { removeJin115PromoItemsOnly(contentEl, finalUrl); } catch {}
  }

  // 分割記事なら「次へ / 次のページ / ページャー」を追い、最大5ページまで1本に連結する。
  // 別記事を誤って追わないよう、同一ホスト＋強いページャー候補だけを対象にする。
  try {
    const extraPages = await fetchAdditionalArticlePages(doc, finalUrl, title, 5);
    for (const page of extraPages) {
      const divider = document.createElement("div");
      divider.className = "multi-page-divider";
      divider.textContent = `${page.pageNo}ページ目`;
      contentEl.appendChild(divider);
      contentEl.append(...page.box.childNodes);
    }
    if (extraPages.length) {
      articleEl.dataset.joinedPages = String(extraPages.length + 1);
    }
  } catch (e) {
    if (PREPARING) throw e;
  }

  if (isJin115Url(finalUrl)) {
    try { removeJin115PromoItemsOnly(contentEl, finalUrl); } catch {}
  }
  normalizeReaderTextSizing(contentEl);
  normalizeReaderArticleSpacing(contentEl);

  // 80文字未満でも画像主体の記事なら表示する。
  const bodyTextLen = cleanText(contentEl.textContent).length;
  const bodyMediaCount = contentEl.querySelectorAll("img,pre,blockquote,table,iframe").length;
  const siteSpecificBodyOk = (isRabbitSokuhoUrl(finalUrl) || isItsokuUrl(finalUrl)) &&
    (bodyTextLen >= 40 || bodyMediaCount >= 1 || simpleReplyCount(contentEl) >= 1);
  if (bodyTextLen < 80 && bodyMediaCount === 0 && !siteSpecificBodyOk) {
    throw new Error("本文抽出結果が短すぎます。");
  }

  await expandImgurLinks(contentEl);
  await expandDirectImageLinks(contentEl);
  try { expandYouTubeLinks(contentEl); } catch {}
  try { expandDirectVideoLinks(contentEl); removeDuplicateVideoMedia(contentEl); } catch {}
  try { dedupeArticleMedia(contentEl); } catch {}
  if (!PREPARING) { try { hydrateGenericXEmbeds(contentEl, finalUrl); } catch {} }
  if (PREPARING) return await prepareSnapshot({title,finalUrl,date,
    thumb:metaContent(doc,['meta[property="og:image"]','meta[name="twitter:image"]'])});
  initHoverGifs(contentEl);
  for (const img of contentEl.querySelectorAll("img")) {
    img.onclick = (e) => {
      // Animated images auto-play when at least 90% visible; clicks never navigate/open the lightbox.
      if (img.dataset.gifClickMode === "1" || img.dataset.hoverGifReady === "1" || img.closest(".hover-gif-wrap")) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        // Playback is controlled by 90%-visibility observation. This only blocks navigation/lightbox.
        return false;
      }
      openLightbox(img.src);
    };
  }

}


// v0.1.210: compact metadata enlarges only after an intentional long press.
// Normal taps must never trigger preview. Event delegation also covers metadata
// nodes created later by site-specific extraction/normalization.
if (!PREPARING) {
  (() => {
    const selector = '.mobile-thread-meta,.reply-meta,.gossip-reply-meta,.site-feedback-meta';
    const HOLD_MS = 450;
    const MOVE_CANCEL_PX = 10;
    let target = null, timer = 0, startX = 0, startY = 0;

    const clear = () => {
      if (timer) { clearTimeout(timer); timer = 0; }
      target?.classList.remove('meta-press-preview');
      target = null;
    };

    document.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.target?.closest?.(selector);
      if (!el || !el.closest('.content')) return;
      clear();
      target = el;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = 0;
        if (target === el) el.classList.add('meta-press-preview');
      }, HOLD_MS);
    }, {passive:true});

    document.addEventListener('pointermove', e => {
      if (!target) return;
      if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) clear();
    }, {passive:true});
    document.addEventListener('pointerup', clear, {passive:true});
    document.addEventListener('pointercancel', clear, {passive:true});
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  })();
}

if (!PREPARING) {
  const loader = window.MATOME_LEGACY_VIEW ? extractArticle : loadPreparedArticle;
  loader().catch(e => {
    recordExtractFailure(requestedUrl, e);
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = `シンプル表示できませんでした。\n\n${e?.message || e}\n\n右上の「元サイト」から確認できます。`;
  });
}


