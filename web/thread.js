function readerIsMobile() {
  return document.documentElement.classList.contains('mobile-ui') || /iPhone|iPod|Android|Mobile/i.test(navigator.userAgent||'') || innerWidth <= 860;
}
function readerFontKey() { return readerIsMobile() ? 'matome_reader_font_size_mobile_v1' : 'matome_reader_font_size_pc_v1'; }
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

const threadParams = new URLSearchParams(location.search);
const threadEmbedded = threadParams.get('embedded') === '1';
const threadBackBtn = document.getElementById('backBtn');
const readerFontSizeInput = document.getElementById('readerFontSizeInput');
readerFontSizeInput?.addEventListener('input', () => applyReaderFont(readerFontSizeInput.value, true));
readerFontSizeInput?.addEventListener('change', () => applyReaderFont(readerFontSizeInput.value, true));
document.querySelector('.reader-font-dec')?.addEventListener('click', () => applyReaderFont(clampReaderFont(readerFontSizeInput?.value) - 1, true));
document.querySelector('.reader-font-inc')?.addEventListener('click', () => applyReaderFont(clampReaderFont(readerFontSizeInput?.value) + 1, true));
if (readerIsMobile()) new MutationObserver(() => applyReaderFont(localStorage.getItem(readerFontKey()) || 16, false)).observe(document.body,{childList:true,subtree:true});
if (threadEmbedded && threadBackBtn) threadBackBtn.hidden = true;
if (threadBackBtn) threadBackBtn.onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

// v0.1.62: mobile full-width right-swipe back for the 5ch thread reader.
(function setupMobileSwipeBack(){
  if(!readerIsMobile() || threadEmbedded || window.parent!==window) return;
  let startX=0,startY=0,startAt=0,tracking=false,blocked=false;
  const interactive='a,button,input,select,textarea,video,audio,iframe,img,[contenteditable="true"],.hover-gif-wrap';
  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1) { tracking=false; return; }
    const t=e.touches[0];
    startX=t.clientX; startY=t.clientY; startAt=Date.now();
    blocked=!!e.target?.closest?.(interactive) || !!e.target?.closest?.('.thread-toolbar');
    tracking=!blocked;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!tracking || blocked) { tracking=false; return; }
    tracking=false;
    const t=e.changedTouches?.[0]; if(!t) return;
    const dx=t.clientX-startX, dy=t.clientY-startY, dt=Date.now()-startAt;
    if(dx>=60 && Math.abs(dy)<=85 && dx>=Math.abs(dy)*1.20 && dt<=1200){
      if(history.length>1) history.back(); else location.href='index.html';
    }
  },{passive:true});
})();


if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const params = new URLSearchParams(location.search);
const requestedUrl = params.get("url") || "";

// Hover playback for animated images (GIF / animated WebP / APNG).
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
  const left = Math.max(0, r.left), top = Math.max(0, r.top);
  const right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
  const iw = Math.max(0, right-left), ih = Math.max(0, bottom-top);
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
function isGifUrl(url) {
  const s = String(url || "");
  return /\.gif(?:[?#]|$)/i.test(s) || /[?&](?:format|fmt|fm|type|ext)=gif(?:&|$)/i.test(s);
}
function usableRemoteImageUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
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

function setupKnownGifHover(img, src) {
  if (!img || !src || img.dataset.hoverGifReady === "1") return;
  img.dataset.hoverGifReady = "1";
  img.dataset.hoverGifSrc = src;
  img.classList.add("hover-gif");
  img.title = "画面内に90%以上表示すると自動再生";

  const wrap = document.createElement("span");
  wrap.className = "hover-gif-wrap";
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
      // If canvas drawing fails, leave the original image visible.
    }
  };

  if (img.complete && img.naturalWidth) requestAnimationFrame(freeze);
  else img.addEventListener("load", () => requestAnimationFrame(freeze), {once:true});

  const setPlaying = (on) => {
    if (!frozen) freeze();
    if (on) {
      poster.hidden = true;
      img.style.visibility = "visible";
      img.classList.add("hover-gif-playing");
      badge.hidden = true;
      try {
        const base = src.replace(/#.*$/, "");
        img.src = base + "#auto=" + Date.now();
      } catch {}
    } else {
      img.classList.remove("hover-gif-playing");
      badge.hidden = false;
      badge.textContent = "GIF ▶";
      if (poster.width && poster.height) {
        img.style.visibility = "hidden";
        poster.hidden = false;
      }
    }
  };
  watchGifFullVisibility(img, setPlaying);
}

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
async function isAnimatedImageBlob(blob) {
  const type = String(blob.type || "").toLowerCase();
  if (type.includes("image/gif")) return true;
  const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 65536)).arrayBuffer());
  if (bytes.length >= 6) {
    const h = String.fromCharCode(...bytes.slice(0, 6));
    if (h === "GIF87a" || h === "GIF89a") return true;
  }
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
function getGifAsset(src) {
  if (gifAssetCache.has(src)) return gifAssetCache.get(src);
  const pending = (async () => {
    const res = await fetch(src, {credentials:"omit", cache:"no-store", referrerPolicy:"no-referrer"});
    if (!res.ok) throw new Error(`image HTTP ${res.status}`);
    const blob = await res.blob();
    if (!(await isAnimatedImageBlob(blob))) return {animated:false};
    const poster = await firstFrameBlob(blob);
    return {animated:true, blob, poster};
  })();
  gifAssetCache.set(src, pending);
  pending.catch(() => gifAssetCache.delete(src));
  return pending;
}
async function setupHoverGif(img, explicitSrc="") {
  if (!img || img.dataset.hoverGifReady === "1") return;
  const src = explicitSrc || img.dataset.hoverGifSrc || img.currentSrc || img.src;
  if (!usableRemoteImageUrl(src)) return;
  img.dataset.hoverGifReady = "1";
  try {
    const asset = await getGifAsset(src);
    if (!img.isConnected || !asset?.animated) return;
    img.dataset.hoverGifSrc = src;
    const state = {asset, posterUrl:URL.createObjectURL(asset.poster), playUrl:""};
    gifImageState.set(img, state);
    img.src = state.posterUrl;
    img.classList.add("hover-gif");
    img.title = "画面内に90%以上表示すると自動再生";
    const start = () => {
      const s = gifImageState.get(img); if (!s || s.playUrl) return;
      s.playUrl = URL.createObjectURL(s.asset.blob);
      img.src = s.playUrl;
      img.classList.add("hover-gif-playing");
    };
    const stop = () => {
      const s = gifImageState.get(img); if (!s) return;
      if (s.playUrl) { URL.revokeObjectURL(s.playUrl); s.playUrl = ""; }
      img.src = s.posterUrl;
      img.classList.remove("hover-gif-playing");
    };
    watchGifFullVisibility(img, (on) => on ? start() : stop());
  } catch {
    // Probe failure: leave the original image unchanged.
  }
}
function initHoverGifs(root=document) {
  for (const img of root.querySelectorAll("img")) {
    // Many matome sites show a JPG/WEBP thumbnail inside <a href="...gif">.
    // Prefer the parent GIF link as the animation source; img.src may be a thumbnail or blob URL.
    const linked = linkedGifUrl(img);
    const src = linked || img.dataset.hoverGifSrc || img.currentSrc || img.src;
    if (!usableRemoteImageUrl(src)) continue;
    if (linked || isGifUrl(src)) {
      markHoverGif(img, src);
      setupKnownGifHover(img, src);
    } else {
      setupHoverGif(img, src); // extensionless animated images: byte probe when the host permits it
    }
  }
}

const hintedTitle = params.get("title") || "";
const hintedBoard = params.get("board") || "";
const hintedSpeed = params.get("speed") || "";

const loadingEl = document.getElementById("loading");
const threadEl = document.getElementById("thread");
const titleEl = document.getElementById("title");
const boardEl = document.getElementById("board");
const speedEl = document.getElementById("speed");
const postsEl = document.getElementById("posts");
const errorEl = document.getElementById("error");
const aiBtn = document.getElementById("aiBtn");
const summaryBtn = document.getElementById("summaryBtn");
const allBtn = document.getElementById("allBtn");
const aiLevel = document.getElementById("aiLevel");
const countInfo = document.getElementById("countInfo");
const summaryNote = document.getElementById("summaryNote");
const originalLink = document.getElementById("originalLink");

let allPosts = [];
let summaryPosts = [];
let aiPosts = [];
let mode = "summary";
let aiWorking = false;
const AI_BASE = "http://127.0.0.1:13305";
const AI_MODEL = "Qwen3-0.6B-GGUF";
const AI_CACHE_PREFIX = "5ch_ai_full_v397:";
const AI_LEVEL_KEY = "5ch_ai_summary_level_v397";
const AI_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
const AI_CACHE_MAX = 80;
let currentThreadUrl = "";

function getAILevelPct() {
  const v = Number(aiLevel?.value || localStorage.getItem(AI_LEVEL_KEY) || 50);
  return [30,50,70].includes(v) ? v : 50;
}
function initAILevel() {
  if (!aiLevel) return;
  const saved = Number(localStorage.getItem(AI_LEVEL_KEY) || 50);
  aiLevel.value = String([30,50,70].includes(saved) ? saved : 50);
  aiLevel.addEventListener("change", () => {
    localStorage.setItem(AI_LEVEL_KEY, String(getAILevelPct()));
    aiPosts = [];
    if (mode === "ai") { mode = "summary"; renderPosts(); }
  });
}
function cleanupAICaches() {
  try {
    const now = Date.now();
    const items = [];
    for (let i=0; i<localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("5ch_ai_") || key === AI_LEVEL_KEY) continue;
      let at = 0;
      try { at = Number(JSON.parse(localStorage.getItem(key) || "{}").at || 0); } catch {}
      if (!at || now - at > AI_CACHE_TTL) { localStorage.removeItem(key); i--; continue; }
      items.push({key, at});
    }
    items.sort((a,b)=>b.at-a.at);
    for (const x of items.slice(AI_CACHE_MAX)) localStorage.removeItem(x.key);
  } catch {}
}
initAILevel();
cleanupAICaches();

function cleanText(s) {
  return (s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
function absUrl(raw, base) {
  try { return new URL(raw, base).href; } catch { return ""; }
}
function normalizeThreadUrl(raw) {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/^(\/test\/read\.cgi\/[^/]+\/\d+)(?:\/.*)?$/);
    if (m) u.pathname = m[1] + "/";
    u.hash = "";
    return u.href;
  } catch { return raw || ""; }
}
function threadParts(raw) {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/^\/test\/read\.cgi\/([^/]+)\/(\d+)/);
    if (!m) return null;
    return {url:u, board:m[1], key:m[2]};
  } catch { return null; }
}
function datUrlFromThread(raw) {
  const p = threadParts(raw);
  if (!p) return "";
  return `${p.url.protocol}//${p.url.host}/${p.board}/dat/${p.key}.dat`;
}
function decodeDatBuffer(buffer, contentType="") {
  const ct = String(contentType || "").match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (ct?.[1]) {
    const cs = ct[1].toLowerCase().replace("shift-jis","shift_jis").replace("sjis","shift_jis").replace("x-sjis","shift_jis");
    try { return new TextDecoder(cs).decode(buffer); } catch {}
  }
  // 現行5chのdatは通常Shift_JIS。UTF-8として完全に妥当ならUTF-8を優先する。
  try { return new TextDecoder("utf-8", {fatal:true}).decode(buffer); } catch {}
  try { return new TextDecoder("shift_jis").decode(buffer); } catch {}
  return new TextDecoder("utf-8").decode(buffer);
}
async function fetchDatDecoded(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      cache:"no-store", credentials:"omit", redirect:"follow", signal:controller.signal,
      headers:{"Accept":"text/plain,*/*;q=0.8"}
    });
    if (!res.ok) throw new Error(`DAT HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("DATが空でした");
    return {text:decodeDatBuffer(buf, res.headers.get("content-type") || ""), finalUrl:res.url || url};
  } finally { clearTimeout(timer); }
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
    charset = m1?.[1] || m2?.[1] || "utf-8";
  }
  charset = charset.toLowerCase().replace("shift-jis","shift_jis").replace("sjis","shift_jis").replace("x-sjis","shift_jis");
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}
async function fetchDecoded(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {cache:"no-store", credentials:"omit", redirect:"follow", signal:controller.signal});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return {text:decodeBuffer(buf, res.headers.get("content-type") || ""), finalUrl:res.url || url};
  } finally { clearTimeout(timer); }
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function postNumber(el, fallback) {
  const candidates = [
    el.querySelector(".number")?.textContent,
    el.querySelector("[class*='number']")?.textContent,
    el.querySelector(".meta")?.textContent,
    el.getAttribute("data-number"),
    el.id
  ];
  for (const raw of candidates) {
    const m = String(raw || "").match(/(?:^|\D)(\d{1,4})(?:\D|$)/);
    if (m) return Number(m[1]);
  }
  return fallback;
}
function sanitizeMessage(messageEl, baseUrl) {
  const clone = messageEl.cloneNode(true);
  for (const x of [...clone.querySelectorAll("script,style,noscript,iframe,form,button,input,svg")]) x.remove();
  for (const el of [...clone.querySelectorAll("*" )]) {
    for (const at of [...el.attributes]) {
      const n = at.name.toLowerCase();
      if (n.startsWith("on") || ["style","class","id","srcset","sizes","width","height"].includes(n)) el.removeAttribute(at.name);
    }
    if (el.tagName === "A") {
      const href = absUrl(el.getAttribute("href"), baseUrl);
      const refText = cleanText(el.textContent);
      const rm = refText.match(/^>>?(\d{1,4})$/);
      if (rm) {
        el.setAttribute("href", `#p${rm[1]}`);
        el.removeAttribute("target");
      } else if (href) {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        el.removeAttribute("href");
      }
    }
    if (el.tagName === "IMG") {
      const src = absUrl(el.getAttribute("data-src") || el.getAttribute("data-original") || el.getAttribute("src"), baseUrl);
      if (!src) el.remove();
      else {
        if (isGifUrl(src)) markHoverGif(el, src);
        else el.setAttribute("src", src);
        el.setAttribute("loading", "lazy");
        el.setAttribute("referrerpolicy", "no-referrer");
      }
    }
  }
  return clone.innerHTML;
}
function looksLikeAA(text) {
  const lines = (text || "").split("\n");
  if (lines.length < 3) return false;
  const longish = lines.filter(x => x.length >= 12).length;
  const spaced = lines.filter(x => / {2,}|　{2,}/.test(x)).length;
  const symbolCount = ((text || "").match(/[\\／\/＿_￣|｜()（）<>＜＞\[\]{}{}ノヽ┐└┘┌━─│┃┏┓┗┛・゜ﾟ´｀`~^]/g) || []).length;
  const chars = Math.max(1, text.replace(/\s/g, "").length);
  return longish >= 2 && (spaced >= 2 || symbolCount / chars > .12);
}
function parseRefs(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text || "").matchAll(/>>?(\d{1,4})/g)) {
    const n = Number(m[1]);
    if (n > 0 && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}
function htmlFragmentText(html) {
  const box = document.createElement("div");
  box.innerHTML = html || "";
  for (const br of [...box.querySelectorAll("br")]) br.replaceWith("\n");
  return cleanText(box.textContent || "");
}
function decodeHtmlText(html) {
  const box = document.createElement("div");
  box.innerHTML = html || "";
  return cleanText(box.textContent || "");
}
function parseDatPosts(datText, threadUrl) {
  const lines = String(datText || "").replace(/\r/g, "").split("\n").filter(Boolean);
  const posts = [];
  let title = "";
  for (let i=0; i<lines.length; i++) {
    const f = lines[i].split("<>");
    if (f.length < 4) continue;
    const bodyHtml = f[3] || "";
    if (i === 0 && f.length >= 5) title = decodeHtmlText(f.slice(4).join("<>"));
    const msg = document.createElement("div");
    msg.innerHTML = bodyHtml;
    const text = htmlFragmentText(bodyHtml);
    if (!text && !msg.querySelector("img")) continue;
    const number = i + 1;
    const html = sanitizeMessage(msg, threadUrl);
    const refs = parseRefs(text);
    const images = msg.querySelectorAll("img").length + [...msg.querySelectorAll("a[href]")].filter(a => /\.(?:jpe?g|png|gif|webp)(?:[?#]|$)|imgur\.com/i.test(absUrl(a.getAttribute("href"), threadUrl))).length;
    const urls = [...msg.querySelectorAll("a[href]")].filter(a => !/^>>?\d+$/.test(cleanText(a.textContent))).length;
    posts.push({number, text, html, refs, images, urls, aa:looksLikeAA(text), order:posts.length});
  }
  return {posts, title};
}

function parseDivPosts(doc, baseUrl) {
  const raw = [...doc.querySelectorAll(".thread .post, div.post, article.post")];
  const uniq = [...new Set(raw)];
  const posts = [];
  let fallback = 1;
  for (const el of uniq) {
    let msg = el.querySelector(".message, .escaped, [class*='message']");
    if (!msg) continue;
    const text = cleanText(msg.innerText || msg.textContent || "");
    if (!text && !msg.querySelector("img")) continue;
    const number = postNumber(el, fallback++);
    const html = sanitizeMessage(msg, baseUrl);
    const refs = parseRefs(text);
    const images = msg.querySelectorAll("img").length + [...msg.querySelectorAll("a[href]")].filter(a => /\.(?:jpe?g|png|gif|webp)(?:[?#]|$)|imgur\.com/i.test(a.href || "")).length;
    const urls = [...msg.querySelectorAll("a[href]")].filter(a => !/^>>?\d+$/.test(cleanText(a.textContent))).length;
    posts.push({number, text, html, refs, images, urls, aa:looksLikeAA(text), order:posts.length});
  }
  return posts;
}
function parseLegacyPosts(doc, baseUrl) {
  const dts = [...doc.querySelectorAll("dl.thread > dt, dl > dt")];
  if (!dts.length) return [];
  const posts = [];
  for (const dt of dts) {
    let dd = dt.nextElementSibling;
    while (dd && dd.tagName !== "DD" && dd.tagName !== "DT") dd = dd.nextElementSibling;
    if (!dd || dd.tagName !== "DD") continue;
    const text = cleanText(dd.innerText || dd.textContent || "");
    if (!text) continue;
    const number = Number((dt.textContent || "").match(/^\s*(\d{1,4})/)?.[1]) || posts.length + 1;
    const html = sanitizeMessage(dd, baseUrl);
    posts.push({number,text,html,refs:parseRefs(text),images:dd.querySelectorAll("img").length,urls:dd.querySelectorAll("a[href]").length,aa:looksLikeAA(text),order:posts.length});
  }
  return posts;
}
function dedupeAndSort(posts) {
  const byNum = new Map();
  for (const p of posts) if (!byNum.has(p.number)) byNum.set(p.number,p);
  return [...byNum.values()].sort((a,b) => a.number - b.number);
}
function selectSummary(posts) {
  if (posts.length <= 55) return posts.slice();
  const byNum = new Map(posts.map(p => [p.number,p]));
  const incoming = new Map(posts.map(p => [p.number,0]));
  for (const p of posts) {
    for (const r of p.refs) if (incoming.has(r)) incoming.set(r, incoming.get(r) + 1);
  }
  const normSeen = new Map();
  for (const p of posts) {
    const norm = p.text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, "").slice(0,220);
    normSeen.set(norm, (normSeen.get(norm) || 0) + 1);
    p.incoming = incoming.get(p.number) || 0;
    let score = p.incoming * 24;
    if (p.number === posts[0].number) score += 10000;
    if (p.images) score += 13 + Math.min(8,p.images*2);
    if (p.urls) score += 4;
    if (p.refs.length) score += Math.min(8,p.refs.length*2);
    const len = p.text.length;
    if (len >= 25 && len <= 450) score += Math.min(15, len/30);
    else if (len > 450) score += 7;
    if (/[？?]/.test(p.text)) score += 1.5;
    if (len < 9 && p.incoming === 0 && !p.images) score -= 15;
    if (/^(?:乙|草|ｗ+|w+|あ+|う+|はい|いいえ|知らん|しらん)[!！。\s]*$/i.test(p.text)) score -= 18;
    if (!p.aa && /(.)\1{9,}/.test(p.text)) score -= 8;
    if (norm && normSeen.get(norm) > 2) score -= 7;
    p.score = score;
  }
  const target = Math.max(40, Math.min(100, Math.round(posts.length * .12)));
  const picked = new Set();
  for (const p of [...posts].sort((a,b) => b.score-a.score || a.order-b.order).slice(0,target)) picked.add(p.number);
  picked.add(posts[0].number);

  // 選ばれたレスが >>元レス に返している場合、会話の起点も残す。
  const firstPass = [...picked];
  for (const n of firstPass) {
    const p = byNum.get(n);
    if (!p) continue;
    for (const ref of p.refs.slice(0,3)) if (byNum.has(ref)) picked.add(ref);
  }
  // 多く返信されたレスには、代表的な返信も最大2件残す。
  const children = new Map();
  for (const p of posts) for (const ref of p.refs) {
    if (!children.has(ref)) children.set(ref,[]);
    children.get(ref).push(p);
  }
  for (const p of posts.filter(p => p.incoming >= 3).sort((a,b) => b.incoming-a.incoming).slice(0,16)) {
    picked.add(p.number);
    const cs = (children.get(p.number) || []).sort((a,b) => b.score-a.score).slice(0,2);
    for (const c of cs) picked.add(c.number);
  }
  let selected = posts.filter(p => picked.has(p.number));
  if (selected.length > 125) {
    const must = new Set([posts[0].number]);
    for (const p of posts) if (p.incoming >= 5) must.add(p.number);
    const ranked = selected.filter(p => !must.has(p.number)).sort((a,b)=>b.score-a.score);
    const keep = new Set([...must, ...ranked.slice(0, Math.max(0,125-must.size)).map(p=>p.number)]);
    selected = posts.filter(p => keep.has(p.number));
  }
  return selected;
}

function isDirectPreviewImageUrl(url) {
  const s = String(url || "");
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    const path = (u.pathname || "").toLowerCase();
    // 5chでよく貼られる i.imgur.com の直画像と、一般的な直画像URLを先読み表示する。
    if (/^i\.imgur\.com$/i.test(u.hostname) && /\.(?:jpe?g|png|gif|webp|avif)$/i.test(path)) return true;
    return /\.(?:jpe?g|png|gif|webp|avif)$/i.test(path);
  } catch {
    return false;
  }
}

function linkifyDirectImageText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  // 5ch本文中の生 http/https URL はすべてクリック可能にする。
  // 画像URLはこの後 expandDirectImageLinks() で自動プレビューする。
  const re = /https?:\/\/[^\s<>"']+/gi;
  const trailing = /[。．、，,;；:：!！?？)）\]］}｝>＞」』】]+$/;
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('a,script,style,textarea,pre,code')) continue;
    const text = node.nodeValue || '';
    re.lastIndex = 0;
    let m, last = 0, changed = false;
    const frag = document.createDocumentFragment();
    while ((m = re.exec(text))) {
      let raw = m[0];
      const tail = raw.match(trailing)?.[0] || '';
      if (tail) raw = raw.slice(0, -tail.length);
      if (!raw) continue;
      changed = true;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = raw;
      a.textContent = raw;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      frag.appendChild(a);
      if (tail) frag.appendChild(document.createTextNode(tail));
      last = m.index + m[0].length;
    }
    if (!changed) continue;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }
}

function imgurDirectPreviewUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (!/(^|\.)imgur\.com$/i.test(u.hostname) || /^i\.imgur\.com$/i.test(u.hostname)) return '';
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 1 || !/^[A-Za-z0-9]+$/.test(parts[0])) return '';
    return `https://i.imgur.com/${parts[0]}.jpg`;
  } catch { return ''; }
}

function base64ToDataUrl(base64, type='application/octet-stream') {
  return `data:${type};base64,${base64}`;
}

async function loadPreviewWithFallback(img, href) {
  const direct = isDirectPreviewImageUrl(href) ? href : imgurDirectPreviewUrl(href);
  if (!direct) return false;

  // Web版は最初からRaspberry Pi経由で読む。
  // i.imgur.com等は直リンクだとReferrer/Hotlink制限で失敗することがあるが、
  // Pi proxyなら同時にディスクキャッシュへ入り、次回以降も即表示できる。
  const proxied = window.MatomePi?.assetUrl?.(direct) || `/api/proxy?url=${encodeURIComponent(direct)}`;
  let directHost = '';
  try { directHost = new URL(direct).hostname.toLowerCase(); } catch {}
  // i.imgur.com は実ブラウザから直接開けるため直表示を最優先。
  // 失敗した場合だけPiキャッシュ経由へフォールバックする。
  const candidates = [...new Set(directHost === 'i.imgur.com' ? [direct, proxied] : [proxied, direct])];

  for (const src of candidates) {
    const ok = await new Promise(resolve => {
      let settled = false;
      const done = value => { if (!settled) { settled = true; resolve(value); } };
      const onLoad = () => done(true);
      const onError = () => done(false);
      img.addEventListener('load', onLoad, {once:true});
      img.addEventListener('error', onError, {once:true});
      img.src = src;
    });
    if (ok) return true;
  }

  // 最後の保険。古いWebView等でもbase64化して表示を試す。
  try {
    const res = await chrome.runtime.sendMessage({type:'FETCH_IMAGE_DATA', url:direct});
    if (res?.ok && res.base64) {
      return await new Promise(resolve => {
        img.addEventListener('load', () => resolve(true), {once:true});
        img.addEventListener('error', () => resolve(false), {once:true});
        img.src = base64ToDataUrl(res.base64, res.type || 'image/jpeg');
      });
    }
  } catch {}
  return false;
}

function expandDirectImageLinks(root) {
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.href || a.getAttribute('href') || '';
    const previewUrl = isDirectPreviewImageUrl(href) ? href : imgurDirectPreviewUrl(href);
    if (!previewUrl || a.querySelector('img')) continue;
    const next = a.nextElementSibling;
    if (next?.matches?.('img.direct-image-preview, img.direct-gif-preview') && next.dataset.sourceHref === href) continue;

    const img = document.createElement('img');
    img.className = isGifUrl(previewUrl) ? 'direct-gif-preview direct-image-preview' : 'direct-image-preview';
    img.dataset.sourceHref = href;
    // スクロール領域内ではlazyロードが遅延しすぎることがあるため即ロードする。
    img.loading = 'eager';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.alt = 'リンク先画像';
    a.insertAdjacentElement('afterend', img);
    loadPreviewWithFallback(img, href).then(ok => {
      if (!ok) { img.remove(); return; }
      if (isGifUrl(previewUrl)) markHoverGif(img, previewUrl);
    });
  }
}

function youtubeVideoId(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else {
        const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/);
        if (m) id = m[1];
      }
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : '';
  } catch { return ''; }
}

function expandYouTubeLinks(root) {
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.href || a.getAttribute('href') || '';
    const id = youtubeVideoId(href);
    if (!id) continue;
    if (a.dataset.youtubeExpanded === '1') continue;
    a.dataset.youtubeExpanded = '1';
    const next = a.nextElementSibling;
    if (next?.classList?.contains('youtube-inline-card') && next.dataset.videoId === id) continue;

    const card = document.createElement('div');
    card.className = 'youtube-inline-card';
    card.dataset.videoId = id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'youtube-inline-thumb';
    btn.title = 'この場でYouTubeを再生';
    btn.setAttribute('aria-label', 'この場でYouTubeを再生');

    const img = document.createElement('img');
    // スクロール領域内ではlazyロードが遅延しすぎることがあるため即ロードする。
    img.loading = 'eager';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.alt = 'YouTube動画サムネイル';
    img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const play = document.createElement('span');
    play.className = 'youtube-inline-play';
    play.textContent = '▶';
    btn.append(img, play);
    card.appendChild(btn);
    a.insertAdjacentElement('afterend', card);

    btn.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.className = 'youtube-inline-frame';
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title = 'YouTube video player';
      frame.loading = 'lazy';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      card.replaceChildren(frame);
    }, {once:true});
  }
}


function expandDirectVideoLinks(root) {
  for (const a of root.querySelectorAll('a[href]')) {
    const href=a.href || a.getAttribute('href') || '';
    if (!/\.(?:mp4|webm|m4v)(?:$|[?#])/i.test(href) || a.dataset.videoExpanded==='1') continue;
    a.dataset.videoExpanded='1';
    const video=document.createElement('video');
    video.className='direct-video-preview';
    video.controls=true;
    video.preload='metadata';
    video.playsInline=true;
    video.src=href;
    a.insertAdjacentElement('afterend', video);
  }
}

function buildPostNode(p) {
  const wrap = document.createElement("article");
  wrap.className = "thread-post";
  wrap.id = `p${p.number}`;
  const head = document.createElement("div");
  head.className = "post-head";
  const num = document.createElement("a");
  num.className = "post-number";
  num.href = `#p${p.number}`;
  num.textContent = `${p.number}`;
  head.appendChild(num);
  if ((p.incoming || 0) > 0) {
    const b = document.createElement("span"); b.className="post-badge reply"; b.textContent=`返信 ${p.incoming}`; head.appendChild(b);
  }
  if (p.images) {
    const b = document.createElement("span"); b.className="post-badge image"; b.textContent="画像"; head.appendChild(b);
  }
  const body = document.createElement("div");
  body.className = "post-message";
  if (p.aa) {
    const pre = document.createElement("pre");
    pre.className = "post-aa";
    pre.textContent = p.text;
    body.appendChild(pre);
  } else {
    body.innerHTML = p.html;
    // DAT側では画像URLが<a>にならず、生の文字列のまま来ることがある。
    // 先に直画像URLだけリンク化してから、従来の先読み処理へ渡す。
    linkifyDirectImageText(body);
    expandDirectImageLinks(body);
    expandYouTubeLinks(body);
    expandDirectVideoLinks(body);
    initHoverGifs(body);
  }
  wrap.append(head,body);
  return wrap;
}
function renderPosts() {
  const items = mode === "ai" ? aiPosts : (mode === "summary" ? summaryPosts : allPosts);
  postsEl.replaceChildren();
  const frag = document.createDocumentFragment();
  let prevOrder = null;
  for (const p of items) {
    if (mode !== "all" && prevOrder != null && p.order - prevOrder > 1) {
      const gap = document.createElement("div");
      gap.className = "omitted";
      gap.textContent = `… ${p.order - prevOrder - 1}レス省略 …`;
      frag.appendChild(gap);
    }
    frag.appendChild(buildPostNode(p));
    prevOrder = p.order;
  }
  postsEl.appendChild(frag);
  // 完成DOMへ再適用し、途中でリンク化済みの画像URLも確実に展開する。
  linkifyDirectImageText(postsEl);
  expandDirectImageLinks(postsEl);
  expandYouTubeLinks(postsEl);
  expandDirectVideoLinks(postsEl);
  initHoverGifs(postsEl);
  aiBtn.classList.toggle("active", mode === "ai");
  summaryBtn.classList.toggle("active", mode === "summary");
  allBtn.classList.toggle("active", mode === "all");
  if (mode === "ai") {
    countInfo.textContent = `${aiPosts.length} / ${allPosts.length}レス`;
    summaryNote.textContent = `PC内のローカルAI（${AI_MODEL}）が内容を読んで、流れに必要なレス・反応・反論を選びました。元レス本文は書き換えていません。`;
  } else if (mode === "summary") {
    countInfo.textContent = `${summaryPosts.length} / ${allPosts.length}レス`;
    summaryNote.textContent = `返信が集まったレス・話の起点・画像付きなどを優先して ${summaryPosts.length}レスに自動選別しています。AIは使っていません。`;
  } else {
    countInfo.textContent = `${allPosts.length}レス`;
    summaryNote.textContent = `全 ${allPosts.length}レスを表示しています。`;
  }
}

// 省略解除・モード切替などでレスDOMが後から増えても画像展開を再適用する。
let postEnhanceTimer = 0;
const postEnhanceObserver = new MutationObserver(() => {
  clearTimeout(postEnhanceTimer);
  postEnhanceTimer = setTimeout(() => {
    linkifyDirectImageText(postsEl);
    expandDirectImageLinks(postsEl);
    expandYouTubeLinks(postsEl);
    expandDirectVideoLinks(postsEl);
    initHoverGifs(postsEl);
  }, 30);
});
postEnhanceObserver.observe(postsEl, {childList:true, subtree:true});

function setMode(next) {
  if (!allPosts.length || mode === next) return;
  mode = next;
  renderPosts();
  scrollTo({top:0,behavior:"auto"});
}
function compactForAI(text, max=110) {
  const s = cleanText(text).replace(/https?:\/\/\S+/g, "[URL]").replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// Keep long-thread prompts under the 4096-token context used by the fast RTX 4050 setup.
// Short threads keep more text; very long threads trade a little detail for reliable, fast inference.
function aiPromptBudget(candidates) {
  const n = candidates.length;
  if (n <= 110) return {maxPosts:n, charsPerPost:110};
  if (n <= 200) return {maxPosts:96, charsPerPost:58};
  return {maxPosts:96, charsPerPost:54};
}
function parseAIKeep(raw, validSet) {
  let src = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  let nums = [];
  try {
    const m = src.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : src);
    if (Array.isArray(obj.keep)) nums = obj.keep;
  } catch {}
  if (!nums.length) nums = [...src.matchAll(/\b(\d{1,4})\b/g)].map(m => Number(m[1]));
  return [...new Set(nums.map(Number).filter(n => validSet.has(n)))];
}
async function aiChat(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${AI_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {role:"system", content:"5chのレス候補から重要なレス番号だけを高速に選びます。説明は禁止。必ずJSONだけ返してください。"},
          {role:"user", content: prompt}
        ],
        temperature: 0,
        max_tokens: 320,
        stream: false,
        chat_template_kwargs: {enable_thinking:false}
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).replace(/\s+/g," ").slice(0,180); } catch {}
      throw new Error(`AI HTTP ${res.status}${detail ? ": " + detail : ""}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "";
  } finally { clearTimeout(timer); }
}
function aiCacheKey() {
  const u = currentThreadUrl || normalizeThreadUrl(requestedUrl) || requestedUrl || "unknown";
  return `${AI_CACHE_PREFIX}${getAILevelPct()}|${u}|${allPosts.length}`;
}
function loadAICache() {
  try {
    const raw = localStorage.getItem(aiCacheKey());
    if (!raw) return [];
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.keep)) return [];
    if (!obj.at || Date.now() - Number(obj.at) > AI_CACHE_TTL) { localStorage.removeItem(aiCacheKey()); return []; }
    const valid = new Set(allPosts.map(p=>p.number));
    return [...new Set(obj.keep.map(Number).filter(n=>valid.has(n)))];
  } catch { return []; }
}
function saveAICache(posts) {
  try {
    localStorage.setItem(aiCacheKey(), JSON.stringify({
      at: Date.now(),
      keep: posts.map(p=>p.number)
    }));
  } catch {}
}
function fastAICandidates() {
  // 200レス以下は全レスをAIへ渡して、会話の流れを優先する。
  if (allPosts.length <= 200) return allPosts.slice();

  // 200レス超だけ非AIスコアで最大120レスまで事前選別する。
  const limit = 120;
  const must = new Set([allPosts[0]?.number].filter(Boolean));
  for (const p of allPosts) if ((p.incoming || 0) >= 4) must.add(p.number);
  const ranked = summaryPosts.slice().sort((a,b) =>
    (b.incoming||0) - (a.incoming||0) || (b.score||0) - (a.score||0) || a.order-b.order
  );
  const picked = [];
  const seen = new Set();
  const add = p => { if (p && !seen.has(p.number)) { seen.add(p.number); picked.push(p); } };
  for (const n of must) add(allPosts.find(p=>p.number===n));
  for (const p of ranked) { if (picked.length >= limit) break; add(p); }
  if (picked.length < limit) {
    for (const p of allPosts) { if (picked.length >= limit) break; add(p); }
  }
  return picked.sort((a,b)=>a.order-b.order);
}

function aiTargetRange(count) {
  const pct = getAILevelPct();
  const center = Math.max(8, Math.min(count, Math.round(count * pct / 100)));
  const margin = count >= 80 ? 3 : (count >= 40 ? 2 : 1);
  return [Math.max(6, center - margin), Math.min(count, center + margin)];
}
async function makeAISummary() {
  if (aiWorking || !allPosts.length) return;

  const cached = loadAICache();
  if (cached.length >= 6) {
    const keep = new Set(cached);
    aiPosts = allPosts.filter(p=>keep.has(p.number));
    mode = "ai";
    renderPosts();
    summaryNote.textContent = `AIまとめ（キャッシュ）を即時表示しました。量 ${getAILevelPct()}% / ${AI_MODEL} / RTX 4050 CUDA。`;
    scrollTo({top:0,behavior:"auto"});
    return;
  }

  aiWorking = true;
  aiBtn.disabled = true;
  const oldText = aiBtn.textContent;
  aiBtn.textContent = "AI処理…";
  summaryNote.textContent = `RTX 4050 + 小型AIで選別中です。AI量 ${getAILevelPct()}%（${aiLevel?.selectedOptions?.[0]?.textContent || "標準"}）。`;
  try {
    const rawCandidates = fastAICandidates();
    const budget = aiPromptBudget(rawCandidates);
    let candidates = rawCandidates;
    if (candidates.length > budget.maxPosts) {
      // Preserve strong replies plus a chronological spread so the AI still sees the thread flow.
      const must = candidates.slice().sort((a,b) =>
        (b.incoming||0) - (a.incoming||0) || (b.score||0) - (a.score||0)
      ).slice(0, Math.max(24, Math.floor(budget.maxPosts * .65)));
      const picked = new Map(must.map(p => [p.number,p]));
      const remaining = Math.max(0, budget.maxPosts - picked.size);
      if (remaining > 0) {
        const step = Math.max(1, Math.floor(candidates.length / remaining));
        for (let i=0; i<candidates.length && picked.size<budget.maxPosts; i+=step) {
          picked.set(candidates[i].number, candidates[i]);
        }
      }
      candidates = [...picked.values()].sort((a,b)=>a.order-b.order).slice(0,budget.maxPosts);
    }
    const lines = candidates.map(p => `${p.number}: ${compactForAI(p.text, budget.charsPerPost)}`).join("\n");
    let [targetMin, targetMax] = aiTargetRange(candidates.length);
    const prompt = `次の5chレスを読み、まとめサイトのように会話の流れを残して${targetMin}〜${targetMax}件を選んでください。話の起点、重要な反応、反論、面白いやり取り、前後関係が分かる短いツッコミも必要なら残してください。重複・意味のない単発・荒らしだけを優先して落としてください。元の順番は変えません。出力は {"keep":[12,34,...]} のJSONだけ。\n\n${lines}`;
    const raw = await aiChat(prompt);
    const valid = new Set(candidates.map(p=>p.number));
    const keep = new Set(parseAIKeep(raw, valid));
    keep.add(allPosts[0].number);

    // 会話の参照元は、最終件数が目標上限を超えない範囲だけ補う。
    const byNum = new Map(allPosts.map(p=>[p.number,p]));
    for (const n of [...keep]) {
      if (keep.size >= targetMax) break;
      const p = byNum.get(n);
      if (!p) continue;
      for (const r of p.refs.slice(0,2)) {
        if (keep.size >= targetMax) break;
        if (byNum.has(r)) keep.add(r);
      }
    }
    for (const p of allPosts) {
      if (keep.size >= targetMax) break;
      if ((p.incoming || 0) >= 6) keep.add(p.number);
    }

    // AIが少なめに返した時は、非AIスコア上位で目標下限まで補完する。
    if (keep.size < targetMin) {
      const fill = candidates.slice().sort((a,b) =>
        (b.incoming||0) - (a.incoming||0) || (b.score||0) - (a.score||0) || a.order-b.order
      );
      for (const p of fill) {
        if (keep.size >= targetMin) break;
        keep.add(p.number);
      }
    }

    // 念のため上限を超えた場合は、AI選択順ではなく元スレ順を保ったまま上限へ。
    if (keep.size > targetMax) {
      const trimmed = allPosts.filter(p=>keep.has(p.number)).slice(0,targetMax);
      keep.clear();
      for (const p of trimmed) keep.add(p.number);
    }

    aiPosts = allPosts.filter(p => keep.has(p.number));
    if (aiPosts.length < 6) throw new Error("AIの選別結果が少なすぎました");
    saveAICache(aiPosts);
    mode = "ai";
    renderPosts();
    summaryNote.textContent = `AIまとめ: 量 ${getAILevelPct()}% / ${AI_MODEL} / RTX 4050 CUDA。${allPosts.length <= 200 ? `全${candidates.length}レス` : `全${allPosts.length}レスからAI入力${candidates.length}レス`}を読み、${aiPosts.length}レスを残しました。次回はキャッシュで即表示します。`;
    scrollTo({top:0,behavior:"auto"});
  } catch (e) {
    mode = "summary";
    renderPosts();
    summaryNote.textContent = `AIまとめを使えませんでした（${e?.message || e}）。自動まとめに戻しました。AI_SETUP_4050.bat を確認してください。`;
  } finally {
    aiWorking = false;
    aiBtn.disabled = false;
    aiBtn.textContent = oldText;
  }
}
aiBtn.addEventListener("click",()=> aiPosts.length ? setMode("ai") : makeAISummary());
summaryBtn.addEventListener("click",()=>setMode("summary"));
allBtn.addEventListener("click",()=>setMode("all"));

// >>番号を押した時、対象レスを一瞬強調する。
document.addEventListener("click", e => {
  const a = e.target.closest('a[href^="#p"]');
  if (!a) return;
  const target = document.querySelector(a.getAttribute("href"));
  if (!target) return;
  target.classList.add("focused");
  setTimeout(()=>target.classList.remove("focused"),1200);
});

async function main() {
  const url = normalizeThreadUrl(requestedUrl);
  currentThreadUrl = url || requestedUrl || "";
  originalLink.href = url || requestedUrl || "#";
  if (!url || !/\/test\/read\.cgi\//.test(url)) throw new Error("5chスレッドURLを認識できませんでした。");

  let posts = [];
  let pageTitle = "";
  let finalUrl = url;
  let datError = null;
  let htmlError = null;

  // 専用ブラウザと同じdatを優先。read.cgiのHTML変更や表示モードの影響を受けにくい。
  const datUrl = datUrlFromThread(url);
  if (datUrl) {
    try {
      const dat = await fetchDatDecoded(datUrl);
      const parsed = parseDatPosts(dat.text, url);
      posts = dedupeAndSort(parsed.posts);
      pageTitle = parsed.title || "";
    } catch (e) {
      datError = e;
    }
  }

  // datが取れないスレ・過去ログなどは従来のHTML解析へフォールバック。
  if (posts.length < 2) {
    try {
      const html = await fetchDecoded(url);
      finalUrl = html.finalUrl || url;
      const doc = new DOMParser().parseFromString(html.text,"text/html");
      let htmlPosts = parseDivPosts(doc, finalUrl);
      if (htmlPosts.length < 2) htmlPosts = parseLegacyPosts(doc, finalUrl);
      posts = dedupeAndSort(htmlPosts);
      if (!pageTitle) {
        pageTitle = cleanText(doc.querySelector("h1")?.textContent || doc.querySelector("title")?.textContent || "")
          .replace(/\s*[-|｜].*5ちゃんねる.*$/i, "")
          .replace(/\s*5ch.*$/i, "");
      }
    } catch (e) {
      htmlError = e;
    }
  }

  if (posts.length < 2) {
    const details = [datError?.message, htmlError?.message].filter(Boolean).join(" / ");
    throw new Error(`レス本文を取得できませんでした。${details ? " " + details : ""}`);
  }

  allPosts = posts;
  summaryPosts = selectSummary(allPosts);
    const cachedKeep = loadAICache();
    if (cachedKeep.length >= 6) {
      const cachedSet = new Set(cachedKeep);
      aiPosts = allPosts.filter(p=>cachedSet.has(p.number));
    }
  titleEl.textContent = hintedTitle || pageTitle || "5chスレッド";
  boardEl.textContent = hintedBoard ? `板: ${hintedBoard}` : "5chスレッド";
  speedEl.textContent = hintedSpeed ? `勢い ${hintedSpeed}` : "";
  originalLink.href = normalizeThreadUrl(finalUrl || url);
  renderPosts();
  loadingEl.hidden = true;
  threadEl.hidden = false;
}

main().catch(err => {
  loadingEl.hidden = true;
  errorEl.hidden = false;
  errorEl.textContent = `5chスレッドを読み込めませんでした。\n${err?.message || err}\n\n「5chで開く」なら元スレを直接確認できます。`;
});
