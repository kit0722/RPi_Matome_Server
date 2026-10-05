const WORKER_MODE = new URLSearchParams(location.search).get('worker') === '1';
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const NEW_SOKU = "https://new-soku.net/new.php";
const HUB_2CH = "https://2chub.sekaiwatch.jp/";
const MATOMEANT = "https://matomeant.com/";
const OWATA = "https://owata-net.com/";
const MAX_ITEMS = 3800;
const DISPLAY_ITEMS = 100;
const FETCH_TIMEOUT_MS = 3200;
const FEED_CONCURRENCY = 4;
const READ_KEY = "matome_read_v02";
const READ_SERVER_SINCE_KEY = "matome_read_server_since_v218";
const READ_SERVER_PENDING_KEY = "matome_read_server_pending_v218";
const SERVER_BUFFER_CUTOFF_KEY = "matome_server_buffer_cutoff_v218";
const LIST_CACHE_KEY = "matome_ready_items_v38";
const LIST_CACHE_META_KEY = "matome_ready_meta_v38";
const FAST_CORE_TIMEOUT_MS = 12000;

const EXTRA_FEEDS = [
  // スマホで読んでいる主要サイトはアンテナ経由だけにせず、
  // 各サイトのRSS/RDFも直接読む。これでサイト別の件数が数件だけになるのを防ぐ。
  { name: "哲学ニュースnwk", url: "https://nwknews.jp/index.rdf" },
  { name: "IT速報", url: "https://itsoku.org/index.rdf" },
  { name: "iPhone Mania", url: "https://iphone-mania.jp/feed/" },
  { name: "なんJ PRIDE", url: "https://nanjpride.blog.jp/index.rdf" },
  { name: "アルファルファモザイク", url: "https://alfalfalfa.com/index.rdf" },
  { name: "ニュー速クオリティ", url: "https://news4vip.livedoor.biz/index.rdf" },
  { name: "日刊やきう速報", url: "https://blog.livedoor.jp/yakiusoku/index.rdf" },
  { name: "痛いニュース(ﾉ∀`)", url: "https://itainews.com/index.rdf" },
  { name: "はちま起稿", url: "https://blog.esuteru.com/index.rdf" },
  { name: "VIPPER速報", url: "https://vippers.jp/index.rdf" },
  { name: "ぶる速-VIP", url: "https://burusoku-vip.com/index.rdf" },
  { name: "ネギ速", url: "https://www.negisoku.com/index.rdf" },
  { name: "カナ速", url: "https://kanasoku.info/index.rdf" },
  { name: "ハムスター速報", url: "https://hamusoku.com/index.rdf" },
  { name: "ガハろぐNews", url: "https://gahalog.2chblog.jp/index.rdf" },
  { name: "なんJクエスト", url: "https://inutomo11.com/index.rdf" },
  { name: "キニ速", url: "https://blog.livedoor.jp/kinisoku/index.rdf" },
  { name: "ゴールデンタイムズ", url: "https://blog.livedoor.jp/goldennews/index.rdf" },
  { name: "もみあげチャ～シュ～", url: "https://michaelsan.livedoor.biz/index.rdf" },
  { name: "VIPPERな俺", url: "https://blog.livedoor.jp/news23vip/index.rdf" },
  { name: "ふぇー速", url: "https://fesoku.net/index.rdf" },
  { name: "暇人＼(^o^)／速報", url: "https://himasoku.com/index.rdf" },
  { name: "暇つぶしニュース", url: "https://blog.livedoor.jp/rbkyn844/index.rdf" },
  { name: "大艦巨砲主義！", url: "https://military38.com/index.rdf" },
  { name: "うしみつ", url: "https://usi32.com/index.rdf" },
  { name: "流速VIP", url: "https://ryusoku.com/index.rdf" },
  { name: "まとめたニュース", url: "https://matometanews.com/index.rdf" },
  { name: "はーとログ", url: "https://blog.livedoor.jp/love120331/index.rdf" },
  { name: "スコールちゃんねる", url: "https://squallchannel.com/index.rdf" },
  { name: "ラビット速報", url: "https://rabitsokuhou.2chblog.jp/index.rdf" },
  // 2026-09 高更新枠として追加。ジャンルを限定せず更新量を優先。
  { name: "NEWSまとめもりー", url: "https://www.akb48matomemory.com/index.rdf" },
  { name: "おーるじゃんる", url: "https://crx7601.com/index.rdf" },
  { name: "オレ的ゲーム速報@刃", url: "https://jin115.com/index.rdf" },
  { name: "わんこーる速報！", url: "https://onecall2ch.com/index.rdf" },
  { name: "アニゲー速報", url: "https://www.anige-sokuhouvip.com/?xml" },
  { name: "オタク.com", url: "https://otakomu.jp/index.rdf" },
  { name: "今日速2ch", url: "https://kyousoku.net/index.rdf" },
  { name: "NEWSぽけまとめーる", url: "https://pokemon-goh.doorblog.jp/index.rdf" },
  { name: "不思議.net", url: "https://world-fusigi.net/index.rdf" },
  { name: "稲妻速報", url: "https://inazumanews2.com/index.rdf" },
  { name: "2ろぐちゃんねる", url: "https://2logch.com/feed" },
  { name: "カオスちゃんねる", url: "https://chaos2ch.com/index.rdf" },
  { name: "ワラノート", url: "https://waranote.livedoor.biz/index.rdf" },
  { name: "ガジェット2ch", url: "https://www.gadget2ch.com/index.rdf" },
  { name: "ガジェットライフ速報", url: "http://gadgetlife2ch.blomaga.jp/index.rdf" },
  { name: "GOSSIP速報", url: "http://gossip1.net/index.rdf" },
  { name: "いたしん！", url: "http://itaishinja.com/index.rdf" },
  { name: "気になるまとめ", url: "https://reiwa.2chblog.jp/index.rdf" },
  { name: "理想ちゃんねる", url: "https://ideal2ch.livedoor.biz/index.rdf" },
  { name: "稼げるまとめ速報", url: "https://kasegeru.blog.jp/index.rdf" },
  { name: "投資ちゃんねる", url: "https://toushichannel.net/index.rdf" },
  { name: "PS5速報！", url: "https://openworldnews.net/index.rdf" },
  { name: "アニはつ", url: "https://anihatsu.com/index.rdf" },
  { name: "超・マンガ速報", url: "https://chomangasokuho.blog.jp/index.rdf" },
  { name: "1000mg", url: "https://1000mg.jp/feed" },
  { name: "ニュース30over", url: "https://www.news30over.com/index.rdf" },
  { name: "2chコピペ情報局", url: "https://news.2chblog.jp/index.rdf" },
  { name: "常識的に考えた", url: "https://blog.livedoor.jp/jyoushiki43/index.rdf" },
  { name: "watch＠２ちゃんねる", url: "https://www.watch2chan.com/index.rdf" },
  { name: "情報屋さん。", url: "https://jyouhouya3.net/feed" },
  { name: "ぁゃιぃ(*ﾟーﾟ)NEWS 2nd", url: "http://ayacnews2nd.com/index.rdf" },
  { name: "コノユビニュース", url: "http://konoyubitomare.jp/index.rdf" },
  { name: "2chコピペ保存道場", url: "http://2chcopipe.com/index.rdf" },
  { name: "デジタルニューススレッド", url: "http://digital-thread.com/index.rdf" },
  { name: "ほんわかMkⅡ", url: "http://honwaka2ch.livedoor.biz/index.rdf" },
  { name: "ライフハックちゃんねる弐式", url: "http://lifehack2ch.livedoor.biz/index.rdf" },
  { name: "footballnet【サッカーまとめ】", url: "https://footballnet.2chblog.jp/index.rdf" }
];

// 手動更新時にアンテナ4系統と同時取得する直RSS。
// タブは実際に記事が取れたサイトだけ生成されるので、死んだRSSは画面に残らない。
const HIGH_UPDATE_NAMES = new Set([
  "哲学ニュースnwk", "IT速報", "なんJ PRIDE", "アルファルファモザイク", "ニュー速クオリティ",
  "日刊やきう速報", "痛いニュース(ﾉ∀`)", "はちま起稿", "VIPPER速報", "ぶる速-VIP",
  "ネギ速", "カナ速", "ハムスター速報", "なんJクエスト", "キニ速", "ゴールデンタイムズ",
  "VIPPERな俺", "ふぇー速", "暇人＼(^o^)／速報", "暇つぶしニュース", "まとめたニュース", "ラビット速報",
  "NEWSまとめもりー", "おーるじゃんる", "オレ的ゲーム速報@刃", "わんこーる速報！", "アニゲー速報",
  "オタク.com", "今日速2ch", "NEWSぽけまとめーる", "不思議.net", "稲妻速報", "2ろぐちゃんねる",
  "カオスちゃんねる", "ワラノート", "ガジェット2ch", "ガジェットライフ速報", "GOSSIP速報", "いたしん！", "気になるまとめ", "理想ちゃんねる", "稼げるまとめ速報",
  "投資ちゃんねる", "PS5速報！", "アニはつ", "超・マンガ速報", "1000mg", "ニュース30over",
  "2chコピペ情報局", "常識的に考えた", "watch＠２ちゃんねる", "情報屋さん。",
  "ぁゃιぃ(*ﾟーﾟ)NEWS 2nd", "コノユビニュース", "2chコピペ保存道場", "デジタルニューススレッド",
  "ほんわかMkⅡ", "ライフハックちゃんねる弐式", "footballnet【サッカーまとめ】"
]);
const HIGH_UPDATE_FEEDS = EXTRA_FEEDS.filter(x => HIGH_UPDATE_NAMES.has(x.name));
const HIGH_UPDATE_TIMEOUT_MS = 12000;
const ALLOWED_SOURCE_NAMES = new Set(EXTRA_FEEDS.map(x => x.name));
const SOURCE_ALIASES = new Map([
  ["令和～気になるまとめ@雑食", "気になるまとめ"],
  ["令和～気になるまとめ", "気になるまとめ"],
  ["ガジェットライフ速報 -ガジェット・スマホ・PCまとめ-", "ガジェットライフ速報"],
  ["コノユビニュース｜みんなの反応まとめ", "コノユビニュース"],
  ["この指とまれ！！", "コノユビニュース"],
  ["ほんわか2ちゃんねる", "ほんわかMkⅡ"],
  ["footballnet", "footballnet【サッカーまとめ】"]
]);
function canonicalAllowedSource(name) {
  let n = cleanText(String(name || "")).replace(/\s+/g, " ").trim();
  if (SOURCE_ALIASES.has(n)) n = SOURCE_ALIASES.get(n);
  if (ALLOWED_SOURCE_NAMES.has(n)) return n;
  // Antenna labels sometimes append category/count text after the canonical site name.
  for (const allowed of ALLOWED_SOURCE_NAMES) {
    if (n === allowed || (allowed.length >= 3 && n.startsWith(allowed))) return allowed;
  }
  return "";
}
function keepAllowedMatomeItems(items) {
  const out = [];
  for (const item of (items || [])) {
    const source = canonicalAllowedSource(item?.source);
    if (!source) continue;
    out.push({...item, source});
  }
  return out;
}


const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");
const prevBtnBottom = document.getElementById("prevBtnBottom");
const nextBtnBottom = document.getElementById("nextBtnBottom");
const pageInfoBottom = document.getElementById("pageInfoBottom");
const updatedEl = document.getElementById("updated");
const errorEl = document.getElementById("error");
const refreshBtn = document.getElementById("refreshBtn");
const newBadge = document.getElementById("newBadge");
const articleSearch = document.getElementById("articleSearch");
const articleSearchClear = document.getElementById("articleSearchClear");
const sourceFilter = document.getElementById("sourceFilter");
const sourceTabsEl = document.getElementById("sourceTabs");
const fontSizeInput = document.getElementById("fontSizeInput");
const urlTestBtn = document.getElementById("urlTestBtn");
const sitePickerBtn = document.getElementById("sitePickerBtn");
const sitePickerPanel = document.getElementById("sitePickerPanel");
const sitePickerClose = document.getElementById("sitePickerClose");
const sitePickerList = document.getElementById("sitePickerList");
const siteSelectAll = document.getElementById("siteSelectAll");
const siteClearAll = document.getElementById("siteClearAll");
const leftPaneEl = document.getElementById("leftPane");
const readerFrame = document.getElementById("readerFrame");

readerFrame?.addEventListener('load',()=>{
  try{
    const dark=document.documentElement.classList.contains('setting-dark-mode');
    readerFrame.contentWindow?.postMessage({
      type:'matome-display-settings',
      darkMode:dark,
      deviceMode:document.documentElement.classList.contains('mobile-ui')?'mobile':'pc'
    },location.origin);
  }catch{}
});

const readerEmpty = document.getElementById("readerEmpty");
const splitLayout = document.querySelector(".split-layout");
const splitter = document.getElementById("splitter");
const SPLIT_KEY = "matome_split_pct_v32";

const ikioiTab = document.getElementById("ikioiTab");
const ikioiDrawer = document.getElementById("ikioiDrawer");
const ikioiClose = document.getElementById("ikioiClose");
const ikioiCats = document.getElementById("ikioiCats");
const ikioiList = document.getElementById("ikioiList");
const ikioiUpdated = document.getElementById("ikioiUpdated");
const ikioiRefresh = document.getElementById("ikioiRefresh");
const ikioiError = document.getElementById("ikioiError");
const hideReadArticles = document.getElementById("hideReadArticles");
const HIDE_READ_ARTICLES_KEY = "matome_hide_read_articles_v193";
const MOBILE_LAST_OPENED_READ_KEY = "matome_mobile_last_opened_read_v198";
const IKIOI_BASE = "https://ikioi.jp/";
const IKIOI_CACHE_PREFIX = "matome_ikioi_v33_";
const IKIOI_CACHE_MS = 5 * 60 * 1000;
const IKIOI_CATEGORIES = [
  {key:"all", label:"総合", url:"https://ikioi.jp/"},
  {key:"news", label:"ニュース", url:"https://ikioi.jp/category/news"},
  {key:"chat", label:"雑談", url:"https://ikioi.jp/category/chat"},
  {key:"live", label:"実況", url:"https://ikioi.jp/category/live"},
  {key:"game", label:"ゲーム", url:"https://ikioi.jp/category/game"},
  {key:"sports", label:"スポーツ", url:"https://ikioi.jp/category/sports"},
  {key:"investment", label:"投資", url:"https://ikioi.jp/category/investment"}
];
let ikioiCategory = localStorage.getItem("matome_ikioi_category_v33") || "all";
let ikioiLoadedOnce = false;

let allItems = [];
let currentPage = Math.max(1, Number(sessionStorage.getItem("matomePage") || "1"));
let newestSnapshot = null;
let knownItemLinks = new Set();
let disabledSources = new Set();
let sitePrefsLoaded = false;
let newCheckRunning = false;
let newCheckTimer = null;
let pendingFreshItems = null;
const NEW_CHECK_MS = 5000;
const MOBILE_RETURN_ITEMS_KEY = 'matomeReturnItems_v44';
let loadToken = 0;
let lastRenderKey = "";
let currentArticleLink = sessionStorage.getItem("matomeSelectedArticle") || "";


function clampSplitPct(v) {
  return Math.min(70, Math.max(25, Number(v) || 39));
}

function applySplitPct(pct, save=false) {
  const v = clampSplitPct(pct);
  splitLayout.style.setProperty("--left-pane-width", `${v}%`);
  splitter.setAttribute("aria-valuenow", String(Math.round(v)));
  if (save) localStorage.setItem(SPLIT_KEY, String(v));
}

function restoreSplitPct() {
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  applySplitPct(Number.isFinite(saved) && saved > 0 ? saved : 39, false);
}

let splitDragging = false;

function splitPctFromPointer(clientX) {
  const rect = splitLayout.getBoundingClientRect();
  if (!rect.width) return 39;
  return ((clientX - rect.left) / rect.width) * 100;
}

splitter.addEventListener("pointerdown", e => {
  if (matchMedia("(max-width: 860px)").matches) return;
  splitDragging = true;
  document.body.classList.add("split-dragging");
  splitter.setPointerCapture?.(e.pointerId);
  applySplitPct(splitPctFromPointer(e.clientX), false);
  e.preventDefault();
});

splitter.addEventListener("pointermove", e => {
  if (!splitDragging) return;
  applySplitPct(splitPctFromPointer(e.clientX), false);
});

function finishSplitDrag(e) {
  if (!splitDragging && !document.body.classList.contains("split-dragging")) return;
  splitDragging = false;
  document.body.classList.remove("split-dragging");
  try {
    if (e?.pointerId != null && splitter.hasPointerCapture?.(e.pointerId)) {
      splitter.releasePointerCapture?.(e.pointerId);
    }
  } catch {}
  const pct = parseFloat(getComputedStyle(splitLayout).getPropertyValue("--left-pane-width"));
  applySplitPct(pct, true);
}

// Chrome can occasionally miss pointerup when the pointer crosses iframe/browser UI.
// Listen globally as a safety net so the reader never stays in drag state.
splitter.addEventListener("pointerup", finishSplitDrag);
splitter.addEventListener("pointercancel", finishSplitDrag);
splitter.addEventListener("lostpointercapture", finishSplitDrag);
window.addEventListener("pointerup", finishSplitDrag, true);
window.addEventListener("pointercancel", finishSplitDrag, true);
window.addEventListener("blur", finishSplitDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) finishSplitDrag();
});
splitter.addEventListener("dblclick", () => applySplitPct(39, true));
splitter.addEventListener("keydown", e => {
  if (matchMedia("(max-width: 860px)").matches) return;
  const current = parseFloat(getComputedStyle(splitLayout).getPropertyValue("--left-pane-width")) || 39;
  if (e.key === "ArrowLeft") { applySplitPct(current - 2, true); e.preventDefault(); }
  if (e.key === "ArrowRight") { applySplitPct(current + 2, true); e.preventDefault(); }
  if (e.key === "Home") { applySplitPct(25, true); e.preventDefault(); }
  if (e.key === "End") { applySplitPct(70, true); e.preventDefault(); }
});

restoreSplitPct();

let sharedReadSet = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]"));
  } catch { return new Set(); }
})();
function readSet() {
  // v0.1.209: reader pages can update localStorage while this list page is kept in BFCache/WebView.
  // Always merge the latest persisted read URLs before filtering/rendering so "既読を非表示"
  // takes effect immediately and after returning from an article.
  try {
    const persisted = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
    if (Array.isArray(persisted)) sharedReadSet = new Set(persisted);
  } catch {}
  return new Set(sharedReadSet);
}
function hideReadArticlesEnabled() {
  try { return localStorage.getItem(HIDE_READ_ARTICLES_KEY) === "1"; } catch { return false; }
}
function readServerPending() {
  try {
    const v=JSON.parse(localStorage.getItem(READ_SERVER_PENDING_KEY)||'[]');
    return Array.isArray(v)?v.filter(x=>typeof x==='string'&&/^https?:\/\//i.test(x)).slice(-3000):[];
  } catch { return []; }
}
function writeReadServerPending(urls) {
  try { localStorage.setItem(READ_SERVER_PENDING_KEY,JSON.stringify([...new Set(urls)].slice(-3000))); } catch {}
}
function readServerSince() {
  try { return Math.max(0,Number(localStorage.getItem(READ_SERVER_SINCE_KEY)||0)||0); } catch { return 0; }
}
function writeReadServerSince(v) {
  try { if(Number(v)>0)localStorage.setItem(READ_SERVER_SINCE_KEY,String(Number(v))); } catch {}
}
let readServerFlushPromise=null;
async function flushSharedReadWrites(extraUrls=[]) {
  const pending=[...new Set([...readServerPending(),...extraUrls].filter(Boolean))].slice(-3000);
  if(!pending.length)return true;
  if(readServerFlushPromise)return readServerFlushPromise;
  readServerFlushPromise=(async()=>{
    try{
      const res=await fetch('/api/read-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:pending}),cache:'no-store'});
      if(!res.ok)throw new Error('read sync failed');
      const current=new Set(readServerPending());
      for(const u of pending)current.delete(u);
      writeReadServerPending([...current]);
      return true;
    }catch{return false;}
    finally{readServerFlushPromise=null;}
  })();
  return readServerFlushPromise;
}
function markRead(url) {
  if (!url) return;
  sharedReadSet.add(url);
  // Keep the local write synchronous so article opening/back navigation stays instant.
  // Server sharing is fire-and-forget and never blocks navigation.
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...sharedReadSet].slice(-3000)));
    localStorage.removeItem('matome_read_pending_v37');
    writeReadServerPending([...readServerPending(),url]);
  } catch {}
  void flushSharedReadWrites();
}
let readSyncPromise=null;
function syncSharedReads({rerender=false}={}) {
  if(readSyncPromise)return readSyncPromise;
  readSyncPromise=(async()=>{
    const since=readServerSince();
    // First v0.1.218 sync uploads this device's existing local history once so
    // PC/iPhone converge without losing either device's already-read URLs.
    if(since<=0) await flushSharedReadWrites([...sharedReadSet]);
    else await flushSharedReadWrites();
    try{
      const res=await fetch('/api/read-state?since='+encodeURIComponent(String(since)),{cache:'no-store'});
      if(!res.ok)throw new Error('read state unavailable');
      const data=await res.json();
      let changed=false;
      for(const url of (Array.isArray(data.urls)?data.urls:[])){
        if(typeof url!=='string'||!url)continue;
        if(!sharedReadSet.has(url)){sharedReadSet.add(url);changed=true;}
      }
      try{localStorage.setItem(READ_KEY,JSON.stringify([...sharedReadSet].slice(-3000)));}catch{}
      if(Number(data.updated_at)>since)writeReadServerSince(data.updated_at);
      if(changed&&rerender){lastRenderKey='';render(true,{preserveReader:true});}
      return changed;
    }catch{return false;}
    finally{readSyncPromise=null;}
  })();
  return readSyncPromise;
}

function storedServerBufferCutoff(){
  try{return Math.max(0,Number(localStorage.getItem(SERVER_BUFFER_CUTOFF_KEY)||0)||0);}catch{return 0;}
}
function rememberServerBufferCutoff(v){
  const n=Number(v)||0;if(!(n>0))return;
  try{localStorage.setItem(SERVER_BUFFER_CUTOFF_KEY,String(n));}catch{}
}

function cleanText(s) {
  return (s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
}
function absUrl(raw, base) {
  try { return new URL(raw, base).href; } catch { return ""; }
}
function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|yclid$|ref$|referrer$)/i.test(k)) u.searchParams.delete(k);
    }
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.href;
  } catch { return raw || ""; }
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

async function fetchDecoded(url, opts={}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: opts.cache || "no-cache",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    return {
      text: decodeBuffer(buffer, res.headers.get("content-type") || ""),
      finalUrl: res.url || url
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeArticleTitle(text) {
  const t = cleanText(text);
  return t.length >= 7 && t.length <= 220 &&
    !/^(トップページ|人気記事|新着|フォローブログ|続きを読む|もっと見る|RSS|サイトを訪問)$/.test(t);
}

function jstTime(ms) {
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(ms));
}

function jstPartsNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hour12:false
  }).formatToParts(new Date()).reduce((o,p) => (o[p.type]=p.value,o), {});
  return {y:Number(parts.year), mo:Number(parts.month), d:Number(parts.day), h:Number(parts.hour), mi:Number(parts.minute)};
}

function jstDateTimeToMs(y, mo, d, h, mi) {
  return Date.UTC(Number(y), Number(mo)-1, Number(d), Number(h)-9, Number(mi), 0);
}

function pageDateParts(doc) {
  // アンテナ側の「今日」の日付を優先。0時またぎでも前日記事を今日扱いしない。
  const text = cleanText(doc.body?.textContent || "").slice(0, 20000);
  let m = text.match(/(20\d{2})年([01]?\d)月([0-3]?\d)日/);
  if (!m) m = text.match(/(20\d{2})[\/\-.]([01]?\d)[\/\-.]([0-3]?\d)/);
  if (m) return {y:Number(m[1]), mo:Number(m[2]), d:Number(m[3])};
  const n = jstPartsNow();
  return {y:n.y, mo:n.mo, d:n.d};
}

function hhmmToMs(hhmm, baseDate=null) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const n = baseDate || jstPartsNow();
  let ms = jstDateTimeToMs(n.y, n.mo, n.d, Number(m[1]), Number(m[2]));
  const now = Date.now();
  // ページ日付が取れず、深夜直後に23時台が出た時だけ前日に戻す。
  if (!baseDate && ms > now + 2*60*60*1000) ms -= 24*60*60*1000;
  return ms;
}

function externalHref(a, base, ownHost) {
  const href = absUrl(a.getAttribute("href"), base);
  if (!href) return "";
  try { return new URL(href).hostname !== ownHost ? href : ""; }
  catch { return ""; }
}

function tightCardForAnchor(anchor, timeRe, maxDepth=9) {
  // 記事リンクから親へ上がり、「その記事に属する時刻が1個だけ入る最小の箱」を選ぶ。
  // 大きいdiv全体の先頭時刻と別記事タイトルを誤結合する事故を防ぐ。
  let el = anchor.parentElement;
  let best = null;
  for (let depth=0; el && depth<maxDepth; depth++, el=el.parentElement) {
    const txt = cleanText(el.textContent);
    if (txt.length > 7000) break;
    const times = txt.match(timeRe) || [];
    if (times.length === 1) {
      const titleLinks = [...el.querySelectorAll("a[href]")]
        .filter(a => looksLikeArticleTitle(a.textContent));
      if (titleLinks.length <= 2) {
        best = el;
        // かなり小さい箱なら即採用。
        if (txt.length < 1800 && titleLinks.length === 1) break;
      }
    }
  }
  return best;
}

function parseNewSoku(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  const seen = new Set();
  const baseDate = pageDateParts(doc);
  const ownHost = new URL(NEW_SOKU).hostname;
  const timeRe = /(?:^|\s)([0-2]?\d:[0-5]\d)(?=\s|\||$)/g;

  // ニュー速は基本的に表形式。まずtr単位で厳密に拾う。
  let rows = [...doc.querySelectorAll("tr")];
  if (!rows.length) rows = [...doc.querySelectorAll("li")];

  const addFromCard = (card, forcedArticle=null) => {
    const txt = cleanText(card.textContent);
    const matches = [...txt.matchAll(timeRe)];
    if (matches.length !== 1) return;
    const anchors = [...card.querySelectorAll("a[href]")];
    let articleA = forcedArticle || anchors.find(a => {
      const href = externalHref(a, NEW_SOKU, ownHost);
      return href && looksLikeArticleTitle(a.textContent);
    });
    if (!articleA) return;
    const title = cleanText(articleA.textContent);
    const link = canonicalUrl(absUrl(articleA.getAttribute("href"), NEW_SOKU));
    if (!link || seen.has(link)) return;

    const sourceA = anchors.filter(a => a !== articleA).find(a => {
      const t = cleanText(a.textContent);
      return t.length >= 2 && t.length <= 40 && !/トップ|人気|新着|RSS|続きを読む/.test(t);
    });
    let source = cleanText(sourceA?.textContent);
    if (!source) {
      try { source = new URL(link).hostname.replace(/^www\./, ""); } catch { source = ""; }
    }
    const ts = hhmmToMs(matches[0][1], baseDate);
    if (!Number.isFinite(ts) || ts > Date.now() + 60*60*1000) return;
    seen.add(link);
    items.push({title, link, source, timestamp: ts, time: jstTime(ts), origin:"ニュー速", timeTrust:3});
  };

  for (const row of rows) addFromCard(row);

  // レイアウト変更時の保険。記事リンク起点で「最小の時刻箱」を探す。
  if (items.length < 20) {
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = externalHref(a, NEW_SOKU, ownHost);
      if (!href || !looksLikeArticleTitle(a.textContent)) continue;
      const card = tightCardForAnchor(a, timeRe);
      if (card) addFromCard(card, a);
    }
  }
  return items;
}


function parseMatomeAnt(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  const seen = new Set();
  const ownHost = new URL(MATOMEANT).hostname;
  const baseDate = pageDateParts(doc);
  const timeRe = /(?:^|\s)([0-2]?\d:[0-5]\d)(?=\s|$)/g;

  for (const articleA of doc.querySelectorAll("a[href]")) {
    const href = externalHref(articleA, MATOMEANT, ownHost);
    if (!href || !looksLikeArticleTitle(articleA.textContent)) continue;

    const card = tightCardForAnchor(articleA, timeRe, 10);
    if (!card) continue;
    const txt = cleanText(card.textContent);
    const matches = [...txt.matchAll(timeRe)];
    if (matches.length !== 1) continue;

    const title = cleanText(articleA.textContent);
    const link = canonicalUrl(href);
    if (!link || seen.has(link)) continue;

    let source = "";
    const anchors = [...card.querySelectorAll("a[href]")];
    // 記事タイトル以外の短い文字リンクをサイト名として使う。
    for (const a of anchors) {
      if (a === articleA) continue;
      const t = cleanText(a.textContent);
      if (t.length >= 2 && t.length <= 40 &&
          !/^(続きを読む|移動して続きを読む|プレビューを閉じる|画像|Image|更新|設定|サイト選択|どう思う？)$/.test(t)) {
        source = t;
        break;
      }
    }
    if (!source) {
      try { source = new URL(link).hostname.replace(/^www\./, ""); } catch { source = ""; }
    }

    const ts = hhmmToMs(matches[0][1], baseDate);
    if (!Number.isFinite(ts) || ts > Date.now() + 60*60*1000) continue;

    seen.add(link);
    items.push({title, link, source, timestamp: ts, time: jstTime(ts), origin:"まとめあんてな", timeTrust:2});
  }
  return items;
}



function parseOwata(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  const seen = new Set();
  const ownHost = new URL(OWATA).hostname;
  const timeRe = /(?:^|\s)([0-2]?\d:[0-5]\d)(?=\s|$)/g;

  for (const articleA of doc.querySelectorAll("a[href]")) {
    const href = externalHref(articleA, OWATA, ownHost);
    if (!href || !looksLikeArticleTitle(articleA.textContent)) continue;

    const card = tightCardForAnchor(articleA, timeRe, 9);
    if (!card) continue;
    const txt = cleanText(card.textContent);
    const matches = [...txt.matchAll(timeRe)];
    if (matches.length !== 1) continue;

    const title = cleanText(articleA.textContent);
    const link = canonicalUrl(href);
    if (!link || seen.has(link)) continue;

    let source = "";
    for (const a of card.querySelectorAll("a[href]")) {
      if (a === articleA) continue;
      const t = cleanText(a.textContent);
      if (t.length >= 2 && t.length <= 45 &&
          !/^(ALL|ニュー速|VIP|生活|ゲーム|アニメ|芸能|YouTube|スポーツ|海外|趣味|続きを読む|次へ|前へ)$/.test(t)) {
        source = t;
        break;
      }
    }
    if (!source) {
      try { source = new URL(link).hostname.replace(/^www\./, ""); } catch { source = ""; }
    }

    // オワタあんてなは当日の時刻を細かく並べているため、現在の日本日付に結び付ける。
    // 深夜直後の23時台だけ hhmmToMs() が自動で前日に戻す。
    const ts = hhmmToMs(matches[0][1], null);
    if (!Number.isFinite(ts) || ts > Date.now() + 60*60*1000) continue;

    seen.add(link);
    items.push({title, link, source, timestamp: ts, time: jstTime(ts), origin:"オワタあんてな", timeTrust:4});
  }
  return items;
}

function parse2cHub(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  const seen = new Set();
  const candidates = [...doc.querySelectorAll("li, article, tr, div")]
    .sort((a,b) => cleanText(a.textContent).length - cleanText(b.textContent).length);
  const dtRe = /(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\s+([0-2]?\d):(\d{2})/;

  for (const row of candidates) {
    const txt = cleanText(row.textContent);
    const dm = txt.match(dtRe);
    if (!dm) continue;

    const anchors = [...row.querySelectorAll("a[href]")].filter(a => {
      const href = absUrl(a.getAttribute("href"), HUB_2CH);
      try { return new URL(href).hostname !== new URL(HUB_2CH).hostname; } catch { return false; }
    });
    if (anchors.length < 2 || anchors.length > 6) continue;

    const articleA = anchors.filter(a => looksLikeArticleTitle(a.textContent))
      .sort((a,b) => cleanText(b.textContent).length - cleanText(a.textContent).length)[0];
    if (!articleA) continue;
    const others = anchors.filter(a => a !== articleA);
    const sourceA = others.find(a => {
      const t = cleanText(a.textContent);
      return t.length >= 2 && t.length <= 40;
    });

    const title = cleanText(articleA.textContent);
    const link = canonicalUrl(absUrl(articleA.getAttribute("href"), HUB_2CH));
    if (!link || seen.has(link)) continue;
    let source = cleanText(sourceA?.textContent);
    if (!source) {
      try { source = new URL(link).hostname.replace(/^www\./, ""); } catch { source = ""; }
    }

    // 2cHubは取得したRSS時刻をさらに+9時間した表示になるケースがある。
    // 表示値から9時間戻して、元記事の日本時間に合わせる。
    const shown = jstDateTimeToMs(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(dm[4]), Number(dm[5]));
    const stamp = shown - 9*60*60*1000;
    // 未来データや長期間止まったキャッシュは一覧の新着順を壊すため除外。
    const age = Date.now() - stamp;
    if (stamp > Date.now() + 60*60*1000 || age > 7*24*60*60*1000) continue;

    seen.add(link);
    items.push({title, link, source, timestamp: stamp, time: jstTime(stamp), origin:"2cHub", timeTrust:1});
  }
  return items;
}

function directChildText(el, names) {
  const wanted = new Set(names.map(x => x.toLowerCase()));
  for (const child of [...el.children]) {
    const local = (child.localName || child.nodeName || "").toLowerCase().split(":").pop();
    const full = (child.nodeName || "").toLowerCase();
    if (wanted.has(local) || wanted.has(full)) {
      const v = cleanText(child.textContent);
      if (v) return v;
    }
  }
  return "";
}
function firstLocal(el, names) {
  const wanted = new Set(names.map(x => x.toLowerCase()));
  for (const node of [...el.getElementsByTagName("*")]) {
    const local = (node.localName || node.nodeName || "").toLowerCase().split(":").pop();
    const full = (node.nodeName || "").toLowerCase();
    if (wanted.has(local) || wanted.has(full)) return node;
  }
  return null;
}
function htmlImage(raw, base) {
  if (!raw) return "";
  try {
    const d = new DOMParser().parseFromString(raw, "text/html");
    const img = d.querySelector("img");
    return img ? absUrl(img.getAttribute("src") || img.getAttribute("data-src"), base) : "";
  } catch { return ""; }
}

function parseFeed(xml, cfg, finalUrl) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  const nodes = [...doc.querySelectorAll("item, entry")];
  const items = [];

  for (const n of nodes) {
    const title = directChildText(n, ["title"]);
    if (!looksLikeArticleTitle(title)) continue;

    let link = directChildText(n, ["link"]);
    if (!link) {
      const linkEl = [...n.children].find(x => (x.localName || x.nodeName || "").toLowerCase().split(":").pop() === "link");
      link = linkEl?.getAttribute("href") || "";
    }
    link = canonicalUrl(absUrl(link, finalUrl));
    if (!link) continue;

    const dateText = directChildText(n, ["pubdate", "published", "updated", "date"]);
    let ts = Date.parse(dateText);
    // 日付を持たないRSSを「今」と扱うと新着順を壊すので採用しない。
    if (!Number.isFinite(ts)) continue;
    // サイト側の時計が少し進んでいる程度は許すが、大きな未来時刻は除外。
    if (ts > Date.now() + 20*60*1000) continue;

    let source = cfg.name;
    if (cfg.sourceFromFeed) {
      source = directChildText(n, ["source", "creator"]) || source;
      if (source === cfg.name) {
        try { source = new URL(link).hostname.replace(/^www\./, ""); } catch {}
      }
    }

    const enclosure = [...n.children].find(x => (x.localName || x.nodeName || "").toLowerCase().split(":").pop() === "enclosure")?.getAttribute("url") || "";
    const mediaNode = firstLocal(n, ["thumbnail", "content"]);
    const mediaUrl = mediaNode?.getAttribute?.("url") || "";
    const descNode = firstLocal(n, ["encoded", "description", "summary", "content"]);
    const desc = cleanText(descNode?.textContent || "");
    const thumb = absUrl(enclosure || mediaUrl, finalUrl) || htmlImage(desc, finalUrl);

    items.push({title, link, source, timestamp: ts, time: jstTime(ts), thumb, origin:cfg.name, timeTrust:10});
  }
  return items;
}

function normalizeItemTimestamp(item, now=Date.now()) {
  let ts = Number(item?.timestamp || 0);
  if (!Number.isFinite(ts) || ts <= 0) return null;

  // 一部アンテナ/サイトで時刻だけ約1時間先になるケースを補正。
  // 35〜85分程度の未来なら、まず1時間戻して妥当な時刻にする。
  const diff = ts - now;
  if (diff > 5*60*1000 && diff >= 35*60*1000 && diff <= 85*60*1000) {
    ts -= 60*60*1000;
  }
  // それでも10分以上未来なら、未来日付ゴミ（例: 2028年）として除外。
  if (ts > now + 10*60*1000) return null;
  return {...item, timestamp: ts, time: jstTime(ts)};
}

const TOPIC_DUP_WINDOW_MS = 48 * 60 * 60 * 1000;
const TOPIC_PREFIX_RE = /^(?:(?:【|\[|（|\()?(?:悲報|朗報|速報|画像|動画|衝撃|緊急|炎上|話題|驚愕|注意|困惑|疑問|唖然|愕然)(?:】|\]|）|\))?[!！?？:：\s]*)+/i;

function normalizeTopicTitle(title) {
  let s = cleanText(title);
  try { s = s.normalize("NFKC"); } catch {}
  s = s.toLowerCase();
  s = s.replace(TOPIC_PREFIX_RE, "");
  // まとめ記事でよく付く笑いの連打は差として扱わない。
  s = s.replace(/[wｗ]{2,}/gi, "");
  // 空白・句読点・記号・絵文字差は無視。文字と数字は残す。
  try { s = s.replace(/[\p{P}\p{S}\s_]+/gu, ""); }
  catch { s = s.replace(/[\s\u3000!！?？、。,.・:：;；「」『』【】\[\]()（）<>＜＞/\\_~〜～…]+/g, ""); }
  return s;
}

function topicFuzzyForm(s) {
  // まとめサイト側の軽い言い換え・敬称・接続語は同一話題判定では無視する。
  // 閾値自体は下げず、意味を変えにくい表記差だけ正規化して誤統合を抑える。
  let x = String(s || "");
  x = x.replace(/(?:さん|ちゃん|くん|君|氏|様)/g, "");
  x = x.replace(/(?:いたしました|致しました)/g, "した");
  x = x.replace(/しました/g, "した");
  x = x.replace(/(?:いたします|致します)/g, "する");
  x = x.replace(/します/g, "する");
  x = x.replace(/(?:なお|ちなみに|ただし)/g, "");
  // まとめタイトルの強調語。意味語ではなく、同じ話題の煽り文句として比較時だけ無視する。
  x = x.replace(/(?:ガチで|まじで|マジで|マジに|ガチに)/g, "");
  // 「が/を/は」程度の助詞差だけは類似計算で軽く無視する。
  return x.replace(/[はがをにへともで]/g, "");
}

function bigramDice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = new Set();
  const B = new Set();
  for (let i = 0; i < a.length - 1; i++) A.add(a.slice(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) B.add(b.slice(i, i + 2));
  let common = 0;
  for (const x of A) if (B.has(x)) common++;
  return (2 * common) / (A.size + B.size || 1);
}

function topicImportantConflict(a, b) {
  const nums = s => (String(s || '').match(/\d+(?:\.\d+)?/g) || []).sort();
  const A = nums(a), B = nums(b);
  if (A.length && B.length && (A.length !== B.length || A.some((v, i) => v !== B[i]))) return true;
  const neg = s => /(?:ない|なし|無し|せず|しない|できない|なかった|ません|未確認|否定)/.test(String(s || ''));
  return neg(a) !== neg(b);
}

function isNearDuplicateTitle(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // v0.1.215: important numeric values and explicit negation are protected.
  // A high textual Dice score must not merge e.g. 5千円/1500円 or
  // "確認した"/"確認しない" merely because the rest of the title matches.
  if (topicImportantConflict(a, b)) return false;

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  if (minLen < 8) return false;
  const lenRatio = minLen / maxLen;

  // 片方がほぼそのまま含まれるケース。末尾に補足が足された記事を統合する。
  if (minLen >= 10 && lenRatio >= 0.78 && (a.includes(b) || b.includes(a))) return true;

  // 誤統合を避けるため、通常のあいまい一致は先頭3文字まで一致必須。
  // そのうえで長さも近く、助詞を除いた2文字列のDice係数が高いものだけ統合。
  if (minLen < 8 || lenRatio < 0.82 || a.slice(0, 3) !== b.slice(0, 3)) return false;
  return bigramDice(topicFuzzyForm(a), topicFuzzyForm(b)) >= 0.86;
}

function dedupeSimilarTopics(items) {
  // 新しい順に見ていくので、重複が見つかった時点で先に入った方を残せば
  // 「新しい方優先」になる。同時刻だけ画像ありを先に並べて優先する。
  const sorted = [...items].sort((a, b) =>
    (b.timestamp || 0) - (a.timestamp || 0) ||
    Number(Boolean(b.thumb)) - Number(Boolean(a.thumb)) ||
    (b.timeTrust || 0) - (a.timeTrust || 0)
  );

  const kept = [];
  const buckets = new Map();
  for (const item of sorted) {
    const norm = normalizeTopicTitle(item.title);
    if (!norm) {
      kept.push(item);
      continue;
    }

    const bucketKey = norm.slice(0, 2);
    const bucket = buckets.get(bucketKey) || [];
    const ts = Number(item.timestamp || 0);
    let duplicate = false;

    // bucket は新しい順。48時間外の相手は飛ばし、後ろにある48時間内候補も確認する。
    for (const prev of bucket) {
      const prevTs = Number(prev.timestamp || 0);
      // bucket is ordered newest -> older.  A very-new entry may be >48h away
      // while a later entry in this same bucket is still within 48h, so do not break.
      if (ts && prevTs && prevTs - ts > TOPIC_DUP_WINDOW_MS) continue;
      if (isNearDuplicateTitle(norm, prev._topicNorm)) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) continue;
    const stored = {...item, _topicNorm:norm};
    bucket.push(stored);
    buckets.set(bucketKey, bucket);
    kept.push(stored);
  }

  return kept.map(({_topicNorm, ...item}) => item);
}

function mergeItems(groups) {
  const map = new Map();
  const now = Date.now();
  for (const group of groups) {
    for (const rawItem of group || []) {
      const item = normalizeItemTimestamp(rawItem, now);
      if (!item?.link || !item?.title) continue;
      const key = canonicalUrl(item.link);
      const old = map.get(key);
      if (!old) {
        map.set(key, {...item, link:key});
        continue;
      }
      const oldTrust = old.timeTrust || 0;
      const newTrust = item.timeTrust || 0;
      // 同じ記事は、まず時刻の信頼度が高い取得元を優先。
      // これでRSS側の時差・古い時刻が一覧順を壊すのを防ぐ。
      if (newTrust > oldTrust || (newTrust === oldTrust && (item.timestamp || 0) > (old.timestamp || 0))) {
        map.set(key, {...old, ...item, link:key, thumb:item.thumb || old.thumb});
      } else if (!old.thumb && item.thumb) {
        old.thumb = item.thumb;
      }
    }
  }
  const merged = [...map.values()]
    .sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
  return dedupeSimilarTopics(merged).slice(0, MAX_ITEMS);
}


function sourceShortLabel(name) {
  const map = {
    "なんJ PRIDE": "なんJ",
    "アルファルファモザイク": "アルファ",
    "ニュー速クオリティ": "ヌ速Q",
    "VIPPER速報": "VIP",
    "ぶる速-VIP": "ぶる",
    "日刊やきう速報": "やきう",
    "痛いニュース(ﾉ∀`)": "痛い",
    "はちま起稿": "はちま",
    "なんJクエスト": "クエスト",
    "IT速報": "IT",
    "哲学ニュースnwk": "哲学",
    "キニ速": "キニ速",
    "カナ速": "カナ速",
    "ネギ速": "ネギ速",
    "ハムスター速報": "ハム速",
    "ガハろぐNews": "ガハろぐ",
    "ゴールデンタイムズ": "ゴールデン",
    "もみあげチャ〜シュ〜": "もみあげ",
    "もみあげチャ～シュ～": "もみあげ",
    "VIPPERな俺": "VIP俺",
    "ふぇー速": "ふぇー",
    "暇人＼(^o^)／速報": "暇人",
    "暇つぶしニュース": "暇つぶし",
    "大艦巨砲主義！": "大艦巨砲",
    "うしみつ": "うしみつ",
    "流速VIP": "流速",
    "まとめたニュース": "まとめ",
    "はーとログ": "はーと",
    "スコールちゃんねる": "スコール",
    "ラビット速報": "ラビット",
    "NEWSまとめもりー": "まとめもりー",
    "おーるじゃんる": "おーる",
    "オレ的ゲーム速報@刃": "オレ的",
    "わんこーる速報！": "わんこーる",
    "アニゲー速報": "アニゲー",
    "オタク.com": "オタク",
    "今日速2ch": "今日速",
    "NEWSぽけまとめーる": "ぽけ",
    "不思議.net": "不思議",
    "稲妻速報": "稲妻",
    "2ろぐちゃんねる": "2ろぐ",
    "カオスちゃんねる": "カオス",
    "ワラノート": "ワラ",
    "ガジェット2ch": "ガジェ",
    "ガジェットライフ速報": "ガジェライフ",
    "GOSSIP速報": "GOSSIP",
    "いたしん！": "いたしん",
    "気になるまとめ": "気になる",
    "理想ちゃんねる": "理想",
    "稼げるまとめ速報": "稼げる",
    "投資ちゃんねる": "投資",
    "PS5速報！": "PS5",
    "アニはつ": "アニはつ",
    "超・マンガ速報": "超マンガ",
    "ニュース30over": "30over",
    "2chコピペ情報局": "コピペ",
    "常識的に考えた": "常識",
    "watch＠２ちゃんねる": "watch",
    "情報屋さん。": "情報屋",
    "iPhone Mania": "iPhone"
  };
  return map[name] || name.replace(/ニュース|速報|まとめ/g, "").trim().slice(0, 8) || name;
}

function enabledSourceItems(items=allItems) {
  return (items || []).filter(x => !disabledSources.has(x.source || ""));
}

function buildSourceTabs(sorted, current) {
  sourceTabsEl.replaceChildren();
  const mk = (value, label, count, active=false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "source-tab" + (active ? " active" : "");
    const txt = document.createElement("span");
    txt.textContent = label;
    b.appendChild(txt);
    if (Number.isFinite(count)) {
      const n = document.createElement("small");
      n.className = "source-count";
      n.textContent = String(count);
      b.appendChild(n);
    }
    b.dataset.value = value;
    b.addEventListener("click", () => {
      if (sourceFilter.value === value) return;
      sourceFilter.value = value;
      currentPage = 1;
      sessionStorage.setItem("matomePage", "1");
      sessionStorage.setItem("matomeSource", value);
      render(true);
      leftPaneEl.scrollTo({top: 0, behavior: "auto"});
    });
    return b;
  };
  const enabledTotal = sorted.reduce((n,x)=>n+x[1],0);
  sourceTabsEl.appendChild(mk("", "全", enabledTotal, current === ""));
  for (const [name, count] of sorted) {
    sourceTabsEl.appendChild(mk(name, sourceShortLabel(name), count, current === name));
  }
}

function allSourceCounts(items=allItems) {
  const counts = new Map(EXTRA_FEEDS.map(x => [x.name, 0]));
  for (const x of (items || [])) {
    const name = canonicalAllowedSource(x?.source);
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
}

function selectOnlySource(name) {
  if (!name || disabledSources.has(name)) return;
  sourceFilter.value = name;
  sessionStorage.setItem('matomeSource', name);
  currentPage = 1;
  sessionStorage.setItem('matomePage', '1');
  if (articleSearch) articleSearch.value = '';
  if (articleSearchClear) articleSearchClear.hidden = true;
  sessionStorage.removeItem('matomeArticleSearch');
  render(true);
  forceLatestListTop();
  if (isMobileLayout()) {
    closeMobileSiteList();
    setMobileNavActive('home');
  } else {
    sitePickerPanel.hidden = true;
    sitePickerBtn?.setAttribute('aria-expanded','false');
  }
}

function buildSitePicker(items=allItems) {
  if (!sitePickerList) return;
  sitePickerList.replaceChildren();
  for (const [name,count] of allSourceCounts(items)) {
    const row=document.createElement('div'); row.className='site-picker-item';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!disabledSources.has(name); cb.dataset.source=name; cb.setAttribute('aria-label', `${name}を表示対象にする`);
    const nm=document.createElement('button'); nm.type='button'; nm.className='name site-picker-name'; nm.textContent=name; nm.disabled=disabledSources.has(name); nm.title=`${name}だけ表示`;
    const ct=document.createElement('span'); ct.className='count'; ct.textContent=String(count);
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async () => {
      if (cb.checked) disabledSources.delete(name); else disabledSources.add(name);
      await saveSharedSitePrefs();
      if (disabledSources.has(sourceFilter.value)) { sourceFilter.value=''; sessionStorage.setItem('matomeSource',''); }
      fillSourceFilter(allItems); currentPage=1; render(true);
      saveSharedListCache(allItems);
    });
    nm.addEventListener('click', () => selectOnlySource(name));
    // v0.1.225: put the actual enable/disable checkbox at the far right.
    // Keep the existing checkbox behavior; only its visual position changes.
    cb.className='site-picker-check';
    row.append(nm,ct,cb); sitePickerList.appendChild(row);
  }
}

async function loadSharedSitePrefs() {
  const snap = await window.MatomePi?.loadSnapshot?.('site_prefs');
  const arr = Array.isArray(snap?.disabledSources) ? snap.disabledSources : [];
  disabledSources = new Set(arr.filter(x => typeof x === 'string'));
  sitePrefsLoaded = true;
}
async function saveSharedSitePrefs() {
  return await window.MatomePi?.saveSnapshot?.('site_prefs', {disabledSources:[...disabledSources].sort(), savedAt:Date.now()});
}

function fillSourceFilter(items) {
  const current = sourceFilter.value;
  const counts = new Map();
  for (const x of enabledSourceItems(items)) counts.set(x.source, (counts.get(x.source) || 0) + 1);
  const sorted = [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
  sourceFilter.replaceChildren(new Option("全サイト", ""));
  for (const [name, count] of sorted) sourceFilter.appendChild(new Option(`${name} (${count})`, name));
  if ([...sourceFilter.options].some(o => o.value === current)) sourceFilter.value = current;
  else sourceFilter.value = "";
  buildSourceTabs(sorted, sourceFilter.value);
  buildSitePicker(items);
}

sitePickerBtn?.addEventListener('click', () => {
  const open=sitePickerPanel.hidden;
  sitePickerPanel.hidden=!open;
  sitePickerBtn.setAttribute('aria-expanded', open ? 'true':'false');
  if (open) buildSitePicker(allItems);
});
sitePickerClose?.addEventListener('click', () => { sitePickerPanel.hidden=true; sitePickerBtn?.setAttribute('aria-expanded','false'); });
siteSelectAll?.addEventListener('click', async () => { disabledSources.clear(); await saveSharedSitePrefs(); buildSitePicker(allItems); fillSourceFilter(allItems); currentPage=1; render(true); saveSharedListCache(allItems); });
siteClearAll?.addEventListener('click', async () => {
  disabledSources = new Set(allSourceCounts(allItems).map(x=>x[0]));
  await saveSharedSitePrefs(); buildSitePicker(allItems); fillSourceFilter(allItems); currentPage=1; render(true); saveSharedListCache(allItems);
});


const ogImageCache = new Map();
const ogImagePending = new Map();

// 外部画像を <img src=https://...> へ直接ぶら下げると、
// サイト側のhotlink/CORP制限で「一瞬表示→消える」ことがある。
// 拡張機能側で画像をBlobとして取得し、blob: URLで表示して安定させる。
const thumbBlobCache = new Map();
const thumbBlobPending = new Map();
const THUMB_CACHE_NAME = "2ch-matome-thumbs-v1";
const THUMB_CACHE_MAX = 220;
const THUMB_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
const THUMB_CACHE_CLEAN_KEY = "matome_thumb_cache_clean_v397";
const THUMB_MAX_BYTES = 2.5 * 1024 * 1024;

async function cleanupPersistentThumbCache(force=false) {
  if (!("caches" in window)) return;
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(THUMB_CACHE_CLEAN_KEY) || 0);
    if (!force && now - last < 24 * 60 * 60 * 1000) return;
    const cache = await caches.open(THUMB_CACHE_NAME);
    const keys = await cache.keys();
    const survivors = [];
    for (const req of keys) {
      const hit = await cache.match(req);
      const at = Number(hit?.headers?.get("x-matome-cache-at") || 0);
      if (!at || now - at > THUMB_CACHE_TTL) await cache.delete(req);
      else survivors.push({req, at});
    }
    survivors.sort((a,b)=>b.at-a.at);
    for (const x of survivors.slice(THUMB_CACHE_MAX)) await cache.delete(x.req);
    localStorage.setItem(THUMB_CACHE_CLEAN_KEY, String(now));
  } catch {}
}

async function getPersistentThumbResponse(url) {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(THUMB_CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) return null;
    const at = Number(hit.headers.get("x-matome-cache-at") || 0);
    if (!at || Date.now() - at > THUMB_CACHE_TTL) { await cache.delete(url); return null; }
    return hit;
  } catch {
    return null;
  }
}

async function putPersistentThumbResponse(url, response) {
  if (!("caches" in window)) return;
  try {
    const blob = await response.blob();
    if (!blob.size || blob.size > THUMB_MAX_BYTES) return;
    const headers = new Headers(response.headers);
    headers.set("x-matome-cache-at", String(Date.now()));
    const stored = new Response(blob, {status:200, headers});
    const cache = await caches.open(THUMB_CACHE_NAME);
    await cache.put(url, stored);
    const keys = await cache.keys();
    if (keys.length > THUMB_CACHE_MAX) cleanupPersistentThumbCache(true).catch(()=>{});
    else cleanupPersistentThumbCache(false).catch(()=>{});
  } catch {}
}

cleanupPersistentThumbCache(false).catch(()=>{});

async function responseToBlobUrl(response) {
  if (!response) return "";
  const blob = await response.blob();
  if (!blob.size || blob.size > THUMB_MAX_BYTES) return "";
  return URL.createObjectURL(blob);
}

async function fetchImageBlobUrl(rawUrl) {
  const url = rawUrl || "";
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (thumbBlobCache.has(url)) return thumbBlobCache.get(url);
  if (thumbBlobPending.has(url)) return thumbBlobPending.get(url);

  const pending = (async () => {
    try {
      // 「記事を開く→戻る」でindex.htmlが読み直されても、
      // Cache Storageから画像本体を復元できるようにする。
      const cached = await getPersistentThumbResponse(url);
      if (cached) {
        const cachedBlobUrl = await responseToBlobUrl(cached);
        if (cachedBlobUrl) {
          thumbBlobCache.set(url, cachedBlobUrl);
          return cachedBlobUrl;
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      try {
        const res = await fetch(url, {
          cache: "force-cache",
          credentials: "omit",
          redirect: "follow",
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const type = (res.headers.get("content-type") || "").toLowerCase();
        if (type && !type.startsWith("image/")) throw new Error("not image");

        const cloneForBlob = res.clone();
        const blobUrl = await responseToBlobUrl(cloneForBlob);
        if (!blobUrl) throw new Error("invalid image");

        // 成功した画像は次回の戻る操作でも使えるよう永続キャッシュ。
        putPersistentThumbResponse(url, res).catch(() => {});
        thumbBlobCache.set(url, blobUrl);
        return blobUrl;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      thumbBlobCache.set(url, "");
      return "";
    } finally {
      thumbBlobPending.delete(url);
    }
  })();

  thumbBlobPending.set(url, pending);
  return pending;
}
async function getOgImage(url) {
  const key = canonicalUrl(url);
  if (ogImageCache.has(key)) return ogImageCache.get(key);
  if (ogImagePending.has(key)) return ogImagePending.get(key);

  const pending = (async () => {
    try {
      const {text, finalUrl} = await fetchDecoded(url, {cache:"force-cache"});
      const doc = new DOMParser().parseFromString(text, "text/html");
      const raw = doc.querySelector('meta[property="og:image"]')?.content ||
        doc.querySelector('meta[name="twitter:image"]')?.content || "";
      const result = raw ? absUrl(raw, finalUrl) : "";
      ogImageCache.set(key, result);
      return result;
    } catch {
      ogImageCache.set(key, "");
      return "";
    } finally {
      ogImagePending.delete(key);
    }
  })();
  ogImagePending.set(key, pending);
  return pending;
}

let activeThumbs = 0;
const thumbQueue = [];
let thumbGeneration = 0;
const THUMB_LIMIT = 6;
const THUMB_PRELOAD_COUNT = 24;
const THUMB_ROOT_MARGIN = "500px 0px";
let thumbPausedUntil = 0;
let thumbResumeTimer = 0;
function pumpThumbs() {
  const wait = thumbPausedUntil - performance.now();
  if (wait > 0) {
    clearTimeout(thumbResumeTimer);
    thumbResumeTimer = setTimeout(pumpThumbs, Math.ceil(wait) + 20);
    return;
  }
  while (activeThumbs < THUMB_LIMIT && thumbQueue.length) {
    const next = thumbQueue.shift();
    if (!next || next.generation !== thumbGeneration) continue;
    activeThumbs++;
    Promise.resolve(next.job()).catch(()=>{}).finally(() => { activeThumbs--; pumpThumbs(); });
  }
}
function enqueueThumb(job, generation) {
  thumbQueue.push({job, generation});
  pumpThumbs();
}
function pauseThumbsForArticle(ms=1400) {
  thumbPausedUntil = Math.max(thumbPausedUntil, performance.now() + ms);
  clearTimeout(thumbResumeTimer);
  thumbResumeTimer = setTimeout(pumpThumbs, ms + 30);
}

function makeThumb(item, index, generation) {
  const box = document.createElement("div");
  box.className = "thumbbox";
  const ph = document.createElement("div");
  ph.className = "noimg";
  ph.textContent = "画像";
  box.appendChild(ph);
  let finished = false, loading = false, startedAt = 0, retryTimer = 0;
  const tryLocalThumb = () => {
    if (finished || loading || generation !== thumbGeneration) return;
    loading = true;
    if (!startedAt) startedAt = Date.now();
    // Return a promise so the six-worker queue limits actual image requests.
    return new Promise(resolve => {
      const img = new Image();
      img.className = "thumb";
      img.alt = "";
      img.decoding = "async";
      // Detached lazy images may never start. Visibility is handled below.
      img.loading = "eager";
      let settled = false;
      const complete = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        loading = false;
        img.onload = img.onerror = null;
        if (generation === thumbGeneration) {
          if (success) { finished = true; box.replaceChildren(img); }
          else if (Date.now() - startedAt < 60000) {
            retryTimer = setTimeout(queueLoad, 1500);
          } else ph.textContent = "画像なし";
        }
        resolve();
      };
      const timeout = setTimeout(() => { complete(false); img.src = ""; }, 8000);
      img.onload = () => complete(true);
      img.onerror = () => complete(false);
      const mapped = String(item.thumb || "");
      img.src = mapped ? (window.MatomePi?.assetUrl?.(mapped) || mapped) :
        (window.MatomePi?.articleThumbUrl?.(item.link) || `/api/thumb?article=${encodeURIComponent(item.link)}`);
    });
  };
  const queueLoad = () => {
    clearTimeout(retryTimer);
    if (!finished && !loading && generation === thumbGeneration) enqueueThumb(tryLocalThumb, generation);
  };
  let eligible = index < THUMB_PRELOAD_COUNT;
  box.refreshThumb = url => {
    item.thumb = url;
    if (eligible) queueLoad();
  };
  if (eligible) queueLoad();
  else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => {
      if (generation !== thumbGeneration) { io.disconnect(); return; }
      if (es.some(e => e.isIntersecting)) {
        io.disconnect(); eligible = true; queueLoad();
      }
    }, {rootMargin: THUMB_ROOT_MARGIN});
    io.observe(box);
  } else setTimeout(() => { eligible = true; queueLoad(); }, 800);
  return box;
}

let thumbMapLoadPending = null;
async function applyServerThumbMap() {
  if (!window.MatomePi?.thumbMap || !allItems?.length) return false;
  if (!thumbMapLoadPending) thumbMapLoadPending = window.MatomePi.thumbMap().finally(() => { thumbMapLoadPending = null; });
  const map = await thumbMapLoadPending;
  let changed = false;
  for (const item of allItems) {
    if (item?.thumb) continue;
    const u = map?.[item?.link];
    if (u) { item.thumb = u; changed = true; }
  }
  if (changed) {
    // Preserve loaded images, scroll position and in-flight requests.
    for (const row of listEl.querySelectorAll('.item[data-link]')) {
      const url = map?.[row.dataset.link];
      if (url) row.querySelector('.thumbbox')?.refreshThumb?.(url);
    }
  }
  return changed;
}
let thumbMapTimer = 0;
let thumbMapSchedule = 0;
function scheduleServerThumbMap() { /* All published thumbnails already exist. */ }

function normalizeArticleSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, " ")
    .trim();
}

function currentArticleSearchQuery() {
  return normalizeArticleSearchText(articleSearch?.value || "");
}

function filteredArticleItems() {
  const filter = sourceFilter.value;
  const query = currentArticleSearchQuery();
  const terms = query ? query.split(" ").filter(Boolean) : [];
  const hideReads = hideReadArticlesEnabled();
  const reads = hideReads ? readSet() : null;
  return allItems.filter(item => {
    if (hideReads && reads.has(item.link)) return false;
    if (disabledSources.has(item.source || "")) return false;
    if (filter && item.source !== filter) return false;
    if (!terms.length) return true;
    const hay = normalizeArticleSearchText(`${item.title || ""} ${item.source || ""}`);
    return terms.every(term => hay.includes(term));
  });
}

function setPage(page, {scrollTop=true} = {}) {
  const matchedItems = filteredArticleItems();
  const totalPages = Math.max(1, Math.ceil(matchedItems.length / DISPLAY_ITEMS));
  currentPage = Math.min(Math.max(1, page), totalPages);
  sessionStorage.setItem("matomePage", String(currentPage));
  render(true);
  // v0.1.151: on iPhone the actual scroll container is often window/body, not leftPane.
  // Page changes (1→2, 2→3, etc.) must always start at the top instead of
  // inheriting the previous page's vertical position. Reuse the multi-pass helper
  // so Safari scroll anchoring cannot restore the old offset after rendering.
  if (scrollTop) forceLatestListTop();
}

function updatePager(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / DISPLAY_ITEMS));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const label = `${currentPage} / ${totalPages}`;
  pageInfo.textContent = label;
  pageInfoBottom.textContent = label;

  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages;
  prevBtn.disabled = atFirst;
  prevBtnBottom.disabled = atFirst;
  nextBtn.disabled = atLast;
  nextBtnBottom.disabled = atLast;
}


function saveIndexPosition(item) {
  if (!isMobileLayout()) return;
  try {
    const row = [...listEl.querySelectorAll('.item')].find(x => x.dataset.link === item?.link);
    sessionStorage.setItem('matomeRestorePending', '1');
    sessionStorage.setItem('matomeScrollY', String(window.scrollY || document.documentElement.scrollTop || 0));
    sessionStorage.setItem('matomeReturnLink', item?.link || '');
    sessionStorage.setItem('matomeReturnOffset', String(row ? row.getBoundingClientRect().top : 0));
    sessionStorage.setItem('matomePage', String(currentPage));
    sessionStorage.setItem('matomeReturnSource', sourceFilter?.value || '');
    // v0.1.46: preserve the exact visible 500-row publication window before leaving.
    // Returning from an article must never replace/re-sort the list just because time passed.
    sessionStorage.setItem(MOBILE_RETURN_ITEMS_KEY, JSON.stringify((allItems || []).slice(0, 500)));
  } catch {}
}

function restoreIndexPosition() {
  if (!isMobileLayout()) return false;
  if (sessionStorage.getItem('matomeRestorePending') !== '1') return false;
  const rawY = Number(sessionStorage.getItem('matomeScrollY') || 0);
  const link = sessionStorage.getItem('matomeReturnLink') || '';
  const wantedOffset = Number(sessionStorage.getItem('matomeReturnOffset') || 0);
  let targetY = rawY;
  if (link) {
    const row = [...listEl.querySelectorAll('.item')].find(x => x.dataset.link === link);
    if (row) {
      const rect = row.getBoundingClientRect();
      const nowY = window.scrollY || document.documentElement.scrollTop || 0;
      targetY = Math.max(0, nowY + rect.top - wantedOffset);
    }
  }
  window.scrollTo({top: targetY, behavior:'auto'});
  sessionStorage.removeItem('matomeRestorePending');
  sessionStorage.removeItem('matomeScrollY');
  sessionStorage.removeItem('matomeReturnLink');
  sessionStorage.removeItem('matomeReturnOffset');
  sessionStorage.removeItem('matomeReturnSource');
  sessionStorage.removeItem(MOBILE_RETURN_ITEMS_KEY);
  return true;
}


function syncSelectedRows() {
  for (const row of listEl.querySelectorAll('.item')) {
    row.classList.toggle('selected', row.dataset.link === currentArticleLink);
  }
}

function isTabletLayout() {
  return document.documentElement.classList.contains('tablet-ui');
}
function isMobileLayout() {
  if (isTabletLayout()) return false;
  return document.documentElement.classList.contains('mobile-ui') || window.matchMedia?.('(max-width: 860px)').matches;
}

const FONT_SIZE_PC_KEY = "matome_font_size_pc_v1";
const FONT_SIZE_MOBILE_KEY = "matome_font_size_mobile_v1";
function currentFontStorageKey() { return isMobileLayout() ? FONT_SIZE_MOBILE_KEY : FONT_SIZE_PC_KEY; }
function defaultFontSize() { return isMobileLayout() ? 16 : 16; }
function clampFontSize(v) { return Math.max(13, Math.min(32, Number(v) || defaultFontSize())); }
function applyUserFontSize(v, save=false) {
  const n = clampFontSize(v);
  document.documentElement.style.setProperty('--list-title-size', `${n}px`);
  document.body?.style.setProperty('--list-title-size', `${n}px`);
  if (fontSizeInput) fontSizeInput.value = String(n);
  // iPhone/Safari: force the value onto rendered titles too; avoids stale mobile CSS overriding the variable.
  if (isMobileLayout()) document.querySelectorAll('.article-title').forEach(el => { el.style.fontSize = `${n}px`; });
  if (save) localStorage.setItem(currentFontStorageKey(), String(n));
}
function restoreUserFontSize() {
  applyUserFontSize(localStorage.getItem(currentFontStorageKey()) || defaultFontSize(), false);
}
restoreUserFontSize();
fontSizeInput?.addEventListener('change', () => applyUserFontSize(fontSizeInput.value, true));
fontSizeInput?.addEventListener('input', () => applyUserFontSize(fontSizeInput.value, true));
document.querySelector('.font-dec')?.addEventListener('click', () => applyUserFontSize(clampFontSize(fontSizeInput?.value) - 1, true));
document.querySelector('.font-inc')?.addEventListener('click', () => applyUserFontSize(clampFontSize(fontSizeInput?.value) + 1, true));
function articleFrameUrl(item) {
  const page=item?.ready?"reader.html":"legacy_reader.html";
  const rev=item?.ready&&item?.revision?`&rev=${encodeURIComponent(item.revision)}`:"";
  return `${page}?embedded=1&url=${encodeURIComponent(item.link)}&site=${encodeURIComponent(item.source)}${rev}`;
}
function articlePageUrl(item) {
  const page=item?.ready?"reader.html":"legacy_reader.html";
  const rev=item?.ready&&item?.revision?`&rev=${encodeURIComponent(item.revision)}`:"";
  return `${page}?url=${encodeURIComponent(item.link)}&site=${encodeURIComponent(item.source)}${rev}`;
}

async function ensureReadyArticleAvailable(item) {
  if (!item?.ready || !item?.link) return true;
  const url=item.link, rev=item.revision||'';
  const cacheKey=mobileReadyCacheKey(url,rev);
  try { if (sessionStorage.getItem(cacheKey)) return true; } catch {}
  try {
    const api='/api/ready-article?url='+encodeURIComponent(url)+(rev?'&rev='+encodeURIComponent(rev):'');
    const res=await fetch(api,{cache:'no-store'});
    if (res.ok) {
      const text=await res.text();
      rememberMobileReadyCache(url,rev,text);
      return true;
    }
  } catch {}
  // Never show the prepared-reader error panel for an item that lost its body.
  // Remove it from the current snapshot and refill the page from valid candidates.
  allItems=allItems.filter(x=>x?.link!==url);
  try {
    const remembered=JSON.parse(sessionStorage.getItem('matomeCurrentItems')||'[]');
    if (Array.isArray(remembered)) sessionStorage.setItem('matomeCurrentItems',JSON.stringify(remembered.filter(x=>x?.link!==url)));
  } catch {}
  lastRenderKey='';
  render(true,{preserveReader:true});
  return false;
}

function openArticle(item, {force=false, navigate=false} = {}) {
  if (!item?.link) return;
  pauseThumbsForArticle();
  if (navigate && isMobileLayout()) {
    try { sessionStorage.setItem(MOBILE_LAST_OPENED_READ_KEY, item.link); } catch {}
    saveIndexPosition(item);
    location.href = articlePageUrl(item);
    return;
  }
  // Defensive cleanup in case a resize gesture was interrupted.
  splitDragging = false;
  document.body.classList.remove("split-dragging");
  currentArticleLink = item.link;
  sessionStorage.setItem('matomeSelectedArticle', currentArticleLink);
  syncSelectedRows();
  const nextSrc = articleFrameUrl(item);
  if (!force && readerFrame.dataset.link === item.link) return;
  readerFrame.dataset.link = item.link;
  readerEmpty.hidden = true;
  readerFrame.src = nextSrc;
}


urlTestBtn?.addEventListener('click', async()=>{
  const raw=prompt('確認する記事URLを貼り付けてください');
  if(!raw)return;
  let url='';try{const u=new URL(raw.trim());if(!/^https?:$/.test(u.protocol))throw 0;url=u.href;}catch{alert('http/https の記事URLを入力してください');return;}
  let prepared=false;
  try{
    const r=await fetch('/api/reprepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const j=await r.json();prepared=!!j.ok;
  }catch{}
  const site=(()=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'URL確認';}})();
  const page=prepared?'reader.html':'legacy_reader.html';
  const q=new URLSearchParams({url,site});
  if(isMobileLayout()){location.href=page+'?'+q.toString();return;}
  q.set('embedded','1');
  currentArticleLink=url;readerFrame.dataset.link='urltest:'+url;readerEmpty.hidden=true;readerFrame.src=page+'?'+q.toString();
});

function render(force=false, {preserveReader=false} = {}) {
  const filter = sourceFilter.value;
  const query = currentArticleSearchQuery();
  const matchedItems = filteredArticleItems();
  const totalPages = Math.max(1, Math.ceil(matchedItems.length / DISPLAY_ITEMS));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * DISPLAY_ITEMS;
  const items = matchedItems.slice(start, start + DISPLAY_ITEMS);
  const enabledAll = enabledSourceItems(allItems);
  const siteCount = new Set(enabledAll.map(x=>x.source)).size;
  updatePager(matchedItems.length);
  if (query) {
    const range = matchedItems.length ? `${start + 1}-${start + items.length}件 / ` : "";
    statusEl.textContent = `${range}検索${matchedItems.length}件・全${enabledAll.length}件表示・${siteCount}サイト`;
  } else if (filter) {
    statusEl.textContent = `${start + 1}-${start + items.length}件 / ${matchedItems.length}件・全${enabledAll.length}件表示・${siteCount}サイト`;
  } else {
    statusEl.textContent = `${start + 1}-${start + items.length}件 / 全${enabledAll.length}件表示・${siteCount}サイト`;
  }

  const renderKey = filter + "|q=" + query + "|p" + currentPage + "|" + items.map(x => `${x.link}@${x.timestamp || 0}@${x.thumb || ""}`).join("|");
  if (!force && renderKey === lastRenderKey) {
    syncSelectedRows();
    return;
  }
  lastRenderKey = renderKey;

  thumbGeneration++;
  thumbQueue.length = 0;
  const generation = thumbGeneration;
  const reads = readSet();
  const mobileList = isMobileLayout();
  listEl.replaceChildren();
  const frag = document.createDocumentFragment();

  for (const [index, item] of items.entries()) {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.link = item.link;
    if (item.ready) {
      row.addEventListener('pointerenter',()=>prefetchOneMobileReady(item),{passive:true,once:true});
      row.addEventListener('pointerdown',()=>prefetchOneMobileReady(item),{passive:true,once:true});
      if(mobileList)row.addEventListener('touchstart',()=>prefetchOneMobileReady(item),{passive:true,once:true});
    }
    // Mobile deliberately skips thumbnail creation, so it also skips image/network work.
    const thumb = mobileList ? null : makeThumb(item, index, generation);
    const text = document.createElement("div");
    const a = document.createElement("a");
    a.className = "article-title";
    if (reads.has(item.link)) a.classList.add("read");
    a.textContent = item.title;
    if (mobileList) a.style.fontSize = `${clampFontSize(localStorage.getItem(FONT_SIZE_MOBILE_KEY) || defaultFontSize())}px`;
    a.href = articleFrameUrl(item);
    const openVerified = async () => {
      if (mobileList) {
        // v0.1.213: mobile navigation must win the race. Do not wait for the
        // ready-article verification or paint the read badge before leaving the list.
        // reader.html marks the article read after its first paint; the saved return
        // marker remains as a fallback for restoring/filtering the list on Back.
        openArticle(item, {navigate:true});
        return;
      }
      if (!(await ensureReadyArticleAvailable(item))) return;
      markRowRead();
      openArticle(item, {navigate:false});
      // v0.1.217: on desktop, explicit article clicks are marked read before the
      // right-hand reader opens.  If read-hiding is enabled, immediately refresh
      // only the left list after starting the iframe navigation.  preserveReader
      // keeps the just-opened article fixed on the right instead of auto-selecting
      // the next visible row.
      if (hideReadArticlesEnabled()) {
        lastRenderKey = '';
        render(true, {preserveReader:true});
      }
    };
    a.addEventListener('click', e => {
      e.preventDefault();
      void openVerified();
    });
    row.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      void openVerified();
    });

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${item.time || "--:--"}</span><span class="source"></span>`;
    meta.querySelector(".source").textContent = item.source;
    const ensureReadLabel = () => {
      if (meta.querySelector('.read-label')) return;
      const r = document.createElement('span');
      r.className = 'read-label';
      r.textContent = '既読';
      // v0.1.28: Safariで古いCSSが残っても既読だけは確実に赤く見せる。
      r.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:1px 5px;border:1px solid #ff6b6b;border-radius:999px;background:#e53935;color:#fff;-webkit-text-fill-color:#fff;font-size:9px;font-weight:800;line-height:1.25;opacity:1';
      meta.appendChild(r);
    };
    if (reads.has(item.link)) ensureReadLabel();
    const markRowRead = () => {
      markRead(item.link);
      a.classList.add('read');
      ensureReadLabel();
      // v0.1.210: do not collapse/refill the visible list before navigation.
      // The article opens first; the hidden/background list is refreshed afterwards
      // (desktop: via reader message, mobile: visibility/pageshow return path).
    };
    text.append(a, meta);
    if (thumb) row.append(thumb, text);
    else row.append(text);
    if (item.link === currentArticleLink) row.classList.add('selected');
    frag.appendChild(row);
  }
  listEl.appendChild(frag);

  const chosen = items.find(x => x.link === currentArticleLink);
  if (isMobileLayout()) {
    readerFrame.src = 'about:blank';
    readerFrame.dataset.link = '';
    readerEmpty.hidden = false;
  } else if (!preserveReader && chosen) {
    openArticle(chosen);
  } else if (!preserveReader && items[0]) {
    openArticle(items[0], {force: true});
  } else if (!preserveReader) {
    readerFrame.src = 'about:blank';
    readerFrame.dataset.link = '';
    readerEmpty.hidden = false;
  }
  // Mobile back-navigation: restore after the list DOM exists.
  if (isMobileLayout() && sessionStorage.getItem('matomeRestorePending') === '1') {
    requestAnimationFrame(() => requestAnimationFrame(() => restoreIndexPosition()));
  }
}

async function runPool(tasks, limit, onProgress) {
  const results = new Array(tasks.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
      done++;
      onProgress?.(done, tasks.length, results);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, tasks.length)}, worker));
  return results;
}



function fastCoreJobs() {
  return [
    fetchDecoded(OWATA, {timeout: FAST_CORE_TIMEOUT_MS}).then(x => parseOwata(x.text)),
    fetchDecoded(MATOMEANT, {timeout: FAST_CORE_TIMEOUT_MS}).then(x => parseMatomeAnt(x.text)),
    fetchDecoded(NEW_SOKU, {timeout: FAST_CORE_TIMEOUT_MS}).then(x => parseNewSoku(x.text)),
    fetchDecoded(HUB_2CH, {timeout: FAST_CORE_TIMEOUT_MS}).then(x => parse2cHub(x.text))
  ];
}

async function fetchFastCore() {
  const tasks=[[OWATA,parseOwata],[MATOMEANT,parseMatomeAnt],[NEW_SOKU,parseNewSoku],[HUB_2CH,parse2cHub]].map(([url,parse])=>async()=>{
    const result=await fetchDecoded(url,{timeout:45000,cache:'no-cache'});return parse(result.text);
  });
  const settled=await runPool(tasks,4);
  return {items:mergeItems(settled.filter(x=>x.status==='fulfilled').map(x=>x.value)),ok:settled.filter(x=>x.status==='fulfilled').length,total:settled.length};
}

async function fetchHighUpdateFeeds() {
  // Raspberry Pi版では数十RSSを一斉にTLS接続すると失敗しやすい。
  // 既存のpoolを使い、最大6本ずつ取得する。
  const tasks = HIGH_UPDATE_FEEDS.map(cfg => async () => {
    const x = await fetchDecoded(cfg.url, {timeout: 45000, cache: "no-cache"});
    const items = parseFeed(x.text, cfg, x.finalUrl || cfg.url);
    if (!items.length) throw new Error(`empty feed: ${cfg.name}`);
    return items;
  });
  const settled = await runPool(tasks, FEED_CONCURRENCY);
  const groups = settled.filter(x => x?.status === "fulfilled").map(x => x.value);
  return {
    items: mergeItems(groups),
    ok: settled.filter(x => x?.status === "fulfilled").length,
    total: settled.length
  };
}

async function fetchFullFastSet() {
  // アンテナ系統と直RSSは独立しているため同時開始する。
  // v0.1.46まではコメントに反して直列awaitだったため、遅い側の待ち時間が加算されていた。
  const [core,direct] = await Promise.all([fetchFastCore(),fetchHighUpdateFeeds()]);
  return {
    items: keepAllowedMatomeItems(mergeItems([core.items, direct.items])),
    coreOk: core.ok,
    coreTotal: core.total,
    feedOk: direct.ok,
    feedTotal: direct.total
  };
}

function saveListCache(items) {
  try {
    localStorage.setItem(LIST_CACHE_KEY, JSON.stringify((items || []).slice(0, 1000)));
    localStorage.setItem(LIST_CACHE_META_KEY, JSON.stringify({savedAt: Date.now()}));
  } catch {}
}

function restoreListCache() {
  try {
    const items = JSON.parse(localStorage.getItem(LIST_CACHE_KEY) || "[]");
    const meta = JSON.parse(localStorage.getItem(LIST_CACHE_META_KEY) || "{}");
    if (!Array.isArray(items) || items.length < 10) return null;
    return {items, savedAt: Number(meta.savedAt || 0)};
  } catch {
    return null;
  }
}

async function restoreSharedListCache() {
  const snap = await window.MatomePi?.loadSnapshot?.('article_list');
  if (!snap || !Array.isArray(snap.items) || snap.items.length < 10) return null;
  return {items:snap.items, savedAt:Number(snap.savedAt || 0)};
}
function saveSharedListCache(items) { /* The worker owns publication. */ }

function newestItemSnapshot(items) {
  if (!items?.length) return null;
  const ready=(items||[]).filter(x=>x?.ready);
  const pool=ready.length?ready:items;
  const top=[...pool].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))[0];
  if (!top) return null;
  return {link:top.link||"",timestamp:top.timestamp||0};
}

function hasNewerThanSnapshot(items, snap) {
  if (!snap || !items?.length) return false;
  return items.some(x => {
    const ts = x.timestamp || 0;
    if (ts > snap.timestamp) return true;
    if (ts === snap.timestamp && x.link && x.link !== snap.link) return true;
    return false;
  });
}


function countNewerThanSnapshot(items, snap) {
  if (!snap || !items?.length) return 0;
  return items.filter(x => {
    const ts = x.timestamp || 0;
    if (ts > snap.timestamp) return true;
    if (ts === snap.timestamp && x.link && x.link !== snap.link) return true;
    return false;
  }).length;
}

function rememberCurrentItems(items) {
  knownItemLinks = new Set((items || []).map(x => canonicalUrl(x.link || '')).filter(Boolean));
}

function countUnseenRecentItems(items) {
  if (!newestSnapshot || !items?.length) return 0;
  // v0.1.28: 「新着あり」は、今表示している先頭記事と同時刻以上の
  // 未表示URLだけに限定する。遅れて混ざった古いRSS記事を新着扱いしない。
  const baseTs = Number(newestSnapshot.timestamp || 0);
  const seen = new Set();
  let count = 0;
  for (const item of items) {
    if (!item?.ready) continue;
    const key = canonicalUrl(item?.link || '');
    if (!key || seen.has(key) || knownItemLinks.has(key)) continue;
    // A URL already read on this device is not a genuine new article even if it
    // temporarily fell outside the 500-row window and later reappeared.
    if (sharedReadSet.has(item?.link || '') || sharedReadSet.has(key)) continue;
    seen.add(key);
    const ts = Number(item?.timestamp || 0);
    if (!ts || ts < baseTs) continue;
    count++;
  }
  return count;
}

const LAST_LIST_DISPLAY_AT_KEY = "matomeLastListDisplayAt";

function rememberListDisplayTime(ms=Date.now()) {
  const t = Number(ms) || Date.now();
  try { localStorage.setItem(LAST_LIST_DISPLAY_AT_KEY, String(t)); } catch {}
  return t;
}

function lastListDisplayTime() {
  try {
    const t = Number(localStorage.getItem(LAST_LIST_DISPLAY_AT_KEY) || 0);
    if (Number.isFinite(t) && t > 0) return t;
  } catch {}
  return 0;
}

function formatUpdateBadgeTime(ms=Date.now()) {
  return new Intl.DateTimeFormat("ja-JP", {hour:"2-digit", minute:"2-digit", hour12:false}).format(new Date(ms));
}

function showUpdateBadge(ms=0) {
  const shownAt = Number(ms) || lastListDisplayTime() || 0;
  newBadge.hidden = false;
  newBadge.dataset.mode = "updated";
  newBadge.classList.add("update-state");
  newBadge.textContent = shownAt ? `更新 ${formatUpdateBadgeTime(shownAt)}` : "更新 --:--";
  newBadge.title = "記事一覧を更新した時刻";
  window.__matomeForceHeaderBadge?.();
  newBadge.style.setProperty("background", isMobileLayout() ? "#2a2d31" : "#ececec", "important");
  newBadge.style.setProperty("color", isMobileLayout() ? "#c9cdd2" : "#666", "important");
  newBadge.style.setProperty("-webkit-text-fill-color", isMobileLayout() ? "#c9cdd2" : "#666", "important");
}

function hideNewBadge(ms=Date.now()) {
  showUpdateBadge(ms);
}

function showNewBadge(count=0) {
  newBadge.hidden = false;
  newBadge.dataset.mode = "new";
  newBadge.classList.remove("update-state");
  const maxed = Number(count) >= 300;
  newBadge.textContent = maxed ? "新着MAX 300件" : (count > 0 ? `新着あり ${count}件` : "新着あり");
  newBadge.title = maxed ? "新着300件。待機記事は裏で保持しています" : "新着記事を表示";
  window.__matomeForceHeaderBadge?.();
  newBadge.style.setProperty("background", maxed ? "#ef6c00" : "#e53935", "important");
  newBadge.style.setProperty("color", "#fff", "important");
  newBadge.style.setProperty("-webkit-text-fill-color", "#fff", "important");
}


function applyFreshList(items) {
  if (!Array.isArray(items) || !items.length) return false;
  allItems = items.slice(0,500);
  fillSourceFilter(allItems);
  newestSnapshot = newestItemSnapshot(allItems);
  rememberCurrentItems(allItems);
  saveListCache(allItems);
  saveSharedListCache(allItems);
  void renewFrozenListLeases(allItems,true);
  pendingFreshItems = null;
  const displayedAt = rememberListDisplayTime(Date.now());
  hideNewBadge(displayedAt);
  currentPage = 1;
  sessionStorage.setItem("matomePage", "1");
  render(true);

  scheduleServerThumbMap();
  // 新着反映後のDOM差し替えでSafariが元位置へ戻そうとしても、最新スレタイを最上部に固定する。
  forceLatestListTop();
  return true;
}

function applyPeerCommittedList(items, cutoff) {
  if(!Array.isArray(items)||!items.length||!(Number(cutoff)>0))return false;
  const committed=items.filter(x=>Number(x?.ready_time||x?.timestamp||0)<=Number(cutoff)).slice(0,500);
  if(!committed.length)return false;
  const oldScroll=leftPaneEl?.scrollTop||0;
  const oldPage=currentPage;
  allItems=committed;
  fillSourceFilter(allItems);
  newestSnapshot=newestItemSnapshot(allItems);
  rememberCurrentItems(allItems);
  saveListCache(allItems);
  void renewFrozenListLeases(allItems,true);
  pendingFreshItems=null;
  currentPage=oldPage;
  lastRenderKey='';
  render(true,{preserveReader:true});
  requestAnimationFrame(()=>leftPaneEl?.scrollTo({top:oldScroll,behavior:'auto'}));
  return true;
}

async function checkForNewOnly(applyIfFound=false, syncPeerState=false) {
  if (WORKER_MODE) return;
  if (newCheckRunning) {
    if(syncPeerState)setTimeout(()=>checkForNewOnly(false,true),250);
    return;
  }
  newCheckRunning = true;
  try {
    // 新着バッジ用に取得した最新一覧を保持する。
    // バッジを押した時は同じ一覧を即反映し、もう一度ネット取得しない。
    const fresh = await fetchReadyList();
    const freshCutoff=Number(fresh?.preparation?.new_buffer_cutoff||0);
    const knownCutoff=storedServerBufferCutoff();
    if(syncPeerState && freshCutoff>0 && (knownCutoff<=0 || freshCutoff>knownCutoff+0.5)){
      // Another device may have consumed the shared new-buffer. Align only the
      // committed 500 rows; articles newer than the cutoff remain behind the shared badge.
      applyPeerCommittedList(fresh.items,freshCutoff);
      rememberServerBufferCutoff(freshCutoff);
    }else if(knownCutoff<=0 && freshCutoff>0){
      rememberServerBufferCutoff(freshCutoff);
    }
    if (!allItems.length && fresh.items.length) { applyFreshList(fresh.items); rememberServerBufferCutoff(freshCutoff); return; }
    // v0.1.209: the red badge must use the server-side new-item buffer,
    // not a second browser-side diff calculation. The latter could count all
    // 500 current rows as new after a cache/version transition.
    const count = Math.min(300, Math.max(0, Number(fresh?.preparation?.new_buffer || 0)));
    pendingFreshItems = Array.isArray(fresh.items) ? fresh.items : null;
    if (count > 0) {
      if (applyIfFound) applyFreshList(fresh.items);
      else showNewBadge(count);
    } else {
      pendingFreshItems = null;
      // v0.1.81: background checks must not change the visible update time.
      // "更新 HH:MM" means when the article list itself was actually replaced/rendered.
      hideNewBadge(lastListDisplayTime());
    }
  } catch {
    // チェック失敗でも枠を空欄にしない。直近の記事一覧更新時刻を表示する。
    if (newBadge.dataset.mode !== "new") showUpdateBadge(lastListDisplayTime());
  } finally {
    newCheckRunning = false;
  }
}

function scheduleNewCheck() {
  if (newCheckTimer) clearInterval(newCheckTimer);
  newCheckTimer = setInterval(()=>checkForNewOnly(false,true), NEW_CHECK_MS);
}

async function fetchReadyList() {
  const response=await fetch('/api/ready-list',{cache:'no-store'});
  if (!response.ok) throw new Error('完成一覧を取得できません');
  const result=await response.json();
  const fmt=new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false});
  result.items=keepAllowedMatomeItems(result.items||[]).filter(x=>x.link).map(x=>{
    // v0.1.46: read state must never affect publication order.
    // Completed articles are ordered only by ready_time; legacy rows use their source time.
    const stamp = x.ready && x.ready_time
      ? Number(x.ready_time)
      : Number(x.source_time || x.timestamp || 0);
    return {...x,timestamp:stamp,time:stamp?fmt.format(new Date(stamp)):"--:--"};
  }).sort((a,b)=>{
    const ar=a.ready?1:0, br=b.ready?1:0;
    if (ar!==br) return br-ar;
    return (b.timestamp||0)-(a.timestamp||0);
  }).slice(0,1000);
  const prep=result.preparation||{};
  const n=result.items.filter(x=>x.ready).length;
  const legacy=result.items.length-n;
  const completedBodyCount=Math.min(500, Number(prep.active_ready||n||0));
  const newBufferCount=Math.min(300, Number(prep.new_buffer||0));
  updatedEl.textContent=`完成 ${completedBodyCount}件 ／ 新着 ${newBufferCount}件${legacy?`＋過去キャッシュ ${legacy}件`:""} ／ 初期準備 ${prep.initial_ready||0}/${prep.initial_total||500}件`;
  if (prep.worker?.state==='error') updatedEl.textContent+=' ／ 準備処理停止: '+prep.worker.error;
  else if (prep.worker?.heartbeat && Date.now()-prep.worker.heartbeat>360000) updatedEl.textContent+=' ／ 準備処理の応答を確認してください';
  if (!isMobileLayout() && prep.counts?.pending) updatedEl.textContent+=` ／ 処理待ち ${prep.counts.pending}件`;
  if (!isMobileLayout() && prep.worker?.article_concurrency>1) updatedEl.textContent+=` ／ 並列 ${prep.worker.article_concurrency}`;
  const retryDue=Number(prep.counts?.retry_due||0),priorityDue=Number(prep.counts?.priority_due||0),retryWaiting=Number(prep.counts?.retry_waiting||0),failed=Number(prep.counts?.failed||0);
  const normalRetry=Math.max(0,retryDue-priorityDue);
  if (priorityDue) updatedEl.textContent+=` ／ 優先再準備 ${priorityDue}件`;
  if (normalRetry) updatedEl.textContent+=` ／ 再試行 ${normalRetry}件`;
  if (retryWaiting) updatedEl.textContent+=` ／ 再試行待機 ${retryWaiting}件`;
  if (failed && !isMobileLayout()) updatedEl.textContent+=` ／ 自動停止(24h) ${failed}件`;
  if (!result.items.length) statusEl.textContent='記事を準備しています。完成した記事から表示します。';
  return result;
}

const MOBILE_READY_CACHE_INDEX='matome_ready_prefetch_index_v147';
function mobileReadyCacheKey(url,rev=''){return 'matome_ready_prefetch_v147:'+encodeURIComponent(url)+'::'+encodeURIComponent(rev||'legacy');}
function rememberMobileReadyCache(url,rev,text){
  if(!url||!text||text.length>900000)return;
  try{
    const key=mobileReadyCacheKey(url,rev);sessionStorage.setItem(key,text);
    let idx=JSON.parse(sessionStorage.getItem(MOBILE_READY_CACHE_INDEX)||'[]').filter(x=>x!==key);idx.unshift(key);
    for(const old of idx.slice(6))sessionStorage.removeItem(old);
    sessionStorage.setItem(MOBILE_READY_CACHE_INDEX,JSON.stringify(idx.slice(0,6)));
  }catch{}
}
const mobileReadyPending=new Map();
function prefetchOneMobileReady(item){
  const url=typeof item==='string'?item:item?.link;const rev=typeof item==='string'?'':(item?.revision||'');
  if(!url)return Promise.resolve(false);
  const key=mobileReadyCacheKey(url,rev);if(mobileReadyPending.has(key))return mobileReadyPending.get(key);
  try{if(sessionStorage.getItem(key))return Promise.resolve(true);}catch{}
  const api='/api/ready-article?url='+encodeURIComponent(url)+(rev?'&rev='+encodeURIComponent(rev):'');
  const p=fetch(api,{cache:rev?'force-cache':'no-store'})
    .then(async r=>{if(!r.ok)return false;const text=await r.text();rememberMobileReadyCache(url,rev,text);return true;})
    .catch(()=>false).finally(()=>mobileReadyPending.delete(key));
  mobileReadyPending.set(key,p);return p;
}
function prefetchMobileReadyArticles(items){
  if(!isMobileLayout())return;
  const selected=(items||[]).filter(x=>x?.ready&&x.link).slice(0,4);
  const run=()=>selected.forEach((item,i)=>setTimeout(()=>prefetchOneMobileReady(item),i*60));
  if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:400});else setTimeout(run,100);
}


let frozenLeaseLastAt=0;
let frozenLeasePending=null;
async function renewFrozenListLeases(items=allItems, force=false){
  if(WORKER_MODE)return null;
  const now=Date.now();
  if(!force && now-frozenLeaseLastAt<30000)return frozenLeasePending;
  const urls=[...new Set((items||[]).map(x=>x?.link).filter(x=>/^https?:\/\//i.test(String(x||''))))].slice(0,500);
  if(!urls.length)return null;
  if(frozenLeasePending)return frozenLeasePending;
  frozenLeaseLastAt=now;
  frozenLeasePending=(async()=>{
    try{
      const r=await fetch('/api/ready-lease-batch',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({urls}),cache:'no-store'
      });
      if(!r.ok)return null;
      return await r.json();
    }catch{return null;}
    finally{frozenLeasePending=null;}
  })();
  return frozenLeasePending;
}
// Keep the exact list the user is reading protected even when it is older than
// the rolling server list. This replaces the accidental "toggle read setting to recover" workaround.
setInterval(()=>{if(!document.hidden)void renewFrozenListLeases(allItems,false);},5*60*1000);


async function load(forceNetwork=false) {
  if (WORKER_MODE) return;
  const token=++loadToken;
  if (refreshBtn) refreshBtn.disabled=true;
  errorEl.hidden=true;
  try {
    // Do not restore legacy/raw lists: only the server's committed ready set is authoritative.
    const result=await fetchReadyList();
    if (token!==loadToken)return;
    allItems=result.items.slice(0,500);fillSourceFilter(allItems);
    void renewFrozenListLeases(allItems,true);
    rememberServerBufferCutoff(result?.preparation?.new_buffer_cutoff);
    newestSnapshot=newestItemSnapshot(allItems);rememberCurrentItems(allItems);
    pendingFreshItems=null;
    render(true);
    hideNewBadge(rememberListDisplayTime(Date.now()));
    prefetchMobileReadyArticles(allItems);
    if (!allItems.length)statusEl.textContent='記事を準備しています。完成した記事から表示します。';
  } catch(e) {
    errorEl.hidden=false;errorEl.textContent=String(e.message||e);
  } finally {if (token===loadToken && refreshBtn)refreshBtn.disabled=false;}
}

const savedArticleSearch = sessionStorage.getItem("matomeArticleSearch") || "";
if (articleSearch) {
  articleSearch.value = savedArticleSearch;
  articleSearchClear.hidden = !savedArticleSearch;
  articleSearch.addEventListener("input", () => {
    sessionStorage.setItem("matomeArticleSearch", articleSearch.value);
    articleSearchClear.hidden = !articleSearch.value;
    currentPage = 1;
    sessionStorage.setItem("matomePage", "1");
    render(true);
    leftPaneEl.scrollTo({top:0, behavior:"auto"});
  });
  articleSearch.addEventListener("keydown", e => {
    if (e.key === "Escape" && articleSearch.value) {
      articleSearch.value = "";
      articleSearch.dispatchEvent(new Event("input"));
    }
  });
}
articleSearchClear?.addEventListener("click", () => {
  articleSearch.value = "";
  articleSearch.dispatchEvent(new Event("input"));
  articleSearch.focus();
});

sourceFilter.addEventListener("change", () => {
  currentPage = 1;
  sessionStorage.setItem("matomePage", "1");
  render(true);
  leftPaneEl.scrollTo({top:0, behavior:"auto"});
});

prevBtn.addEventListener("click", () => setPage(currentPage - 1));
nextBtn.addEventListener("click", () => setPage(currentPage + 1));
prevBtnBottom.addEventListener("click", () => setPage(currentPage - 1));
nextBtnBottom.addEventListener("click", () => setPage(currentPage + 1));
function forceLatestListTop() {
  // v0.1.78: iPhoneではleftPaneではなくwindow/bodyが実際のスクロール本体。
  // 新着一覧の描画によるSafariのスクロールアンカー復元にも負けないよう、
  // 直後・次フレーム・少し後の複数回、最新スレタイ位置（ページ先頭）へ戻す。
  const jump = () => {
    try { leftPaneEl?.scrollTo?.({top: 0, left: 0, behavior: "auto"}); } catch {}
    try { window.scrollTo({top: 0, left: 0, behavior: "auto"}); } catch { try { window.scrollTo(0, 0); } catch {} }
    try { if (document.scrollingElement) document.scrollingElement.scrollTop = 0; } catch {}
    try { document.documentElement.scrollTop = 0; } catch {}
    try { document.body.scrollTop = 0; } catch {}
  };
  jump();
  requestAnimationFrame(() => {
    jump();
    requestAnimationFrame(jump);
  });
  setTimeout(jump, 80);
  setTimeout(jump, 220);
}

function resetToLatestView() {
  // 「最新を見る」操作ではサイト絞り込みを解除し、必ず全サイトの最新スレタイへ戻す。
  sourceFilter.value = "";
  if (articleSearch) articleSearch.value = "";
  if (articleSearchClear) articleSearchClear.hidden = true;
  sessionStorage.removeItem("matomeArticleSearch");
  sessionStorage.removeItem("matomeSource");
  currentPage = 1;
  sessionStorage.setItem("matomePage", "1");
  sessionStorage.removeItem("matomeRestorePending");
  sessionStorage.removeItem("matomeScrollY");
  sessionStorage.removeItem("matomeReturnLink");
  sessionStorage.removeItem("matomeReturnOffset");
  sessionStorage.removeItem("matomeReturnSource");
  sessionStorage.removeItem(MOBILE_RETURN_ITEMS_KEY);
  forceLatestListTop();
}

// ===== v0.1.163 navigation: smartphone site list + desktop top nav =====
// Keep the proven window/body scrolling model. The site list reuses the existing picker only.
const mobileBottomNav = document.getElementById('mobileBottomNav');
const desktopTopNav = document.getElementById('desktopTopNav');
const displaySettingsPanel = document.getElementById('displaySettingsPanel');
const displaySettingsClose = document.getElementById('displaySettingsClose');
const displaySettingsBack = document.getElementById('displaySettingsBack');
const settingsListFontSize = document.getElementById('settingsListFontSize');
const settingsListFontDec = document.getElementById('settingsListFontDec');
const settingsListFontInc = document.getElementById('settingsListFontInc');
const settingsUiFontSize = document.getElementById('settingsUiFontSize');
const settingsUiFontDec = document.getElementById('settingsUiFontDec');
const settingsUiFontInc = document.getElementById('settingsUiFontInc');
const UI_FONT_PC_KEY = 'matome_ui_font_size_pc_v1';
const UI_FONT_MOBILE_KEY = 'matome_ui_font_size_mobile_v1';
const settingsReaderFontSize = document.getElementById('settingsReaderFontSize');
const settingsReaderFontDec = document.getElementById('settingsReaderFontDec');
const settingsReaderFontInc = document.getElementById('settingsReaderFontInc');
const settingsReaderLineHeight = document.getElementById('settingsReaderLineHeight');
const settingsReaderLineDec = document.getElementById('settingsReaderLineDec');
const settingsReaderLineInc = document.getElementById('settingsReaderLineInc');
const settingsMetaFontSize = document.getElementById('settingsMetaFontSize');
const settingsMetaFontDec = document.getElementById('settingsMetaFontDec');
const settingsMetaFontInc = document.getElementById('settingsMetaFontInc');
const settingsPanelScale = document.getElementById('settingsPanelScale');
const settingsPanelScaleDec = document.getElementById('settingsPanelScaleDec');
const settingsPanelScaleInc = document.getElementById('settingsPanelScaleInc');
const settingsShowSiteCounts = document.getElementById('settingsShowSiteCounts');
const settingsShowStatus = document.getElementById('settingsShowStatus');
const settingsShowIkioi = document.getElementById('settingsShowIkioi');
const settingsShowUpdate = document.getElementById('settingsShowUpdate');
const settingsStandbyArticles = document.getElementById('settingsStandbyArticles');
const settingsResetDisplay = document.getElementById('settingsResetDisplay');
const READER_FONT_PC_KEY = 'matome_reader_font_size_pc_v1';
const READER_FONT_MOBILE_KEY = 'matome_reader_font_size_mobile_v1';
const READER_LINE_PC_KEY = 'matome_reader_line_height_pc_v1';
const READER_LINE_MOBILE_KEY = 'matome_reader_line_height_mobile_v1';
const READER_META_FONT_PC_KEY = 'matome_reader_meta_font_size_pc_v1';
const READER_META_FONT_MOBILE_KEY = 'matome_reader_meta_font_size_mobile_v1';
const SHOW_SITE_COUNTS_KEY = 'matome_setting_show_site_counts_v1';
const SHOW_STATUS_KEY = 'matome_setting_show_status_v1';
const SHOW_IKIOI_KEY = 'matome_setting_show_ikioi_v1';
const SHOW_UPDATE_KEY = 'matome_setting_show_update_v1';
const SETTINGS_SCALE_PC_KEY = 'matome_settings_panel_scale_pc_v1';
const SETTINGS_SCALE_MOBILE_KEY = 'matome_settings_panel_scale_mobile_v1';


function setDesktopNavActive(name) {
  desktopTopNav?.querySelectorAll('[data-desktop-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.desktopNav === name);
  });
}


function setMobileNavActive(name) {
  mobileBottomNav?.querySelectorAll('[data-mobile-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mobileNav === name);
  });
}

function closeMobileSiteList() {
  if (!sitePickerPanel) return;
  sitePickerPanel.classList.remove('mobile-nav-open');
  sitePickerPanel.hidden = true;
  sitePickerBtn?.setAttribute('aria-expanded', 'false');
}

function openMobileSiteList() {
  if (!sitePickerPanel) return;
  buildSitePicker(allItems);
  sitePickerPanel.hidden = false;
  sitePickerPanel.classList.add('mobile-nav-open');
  sitePickerBtn?.setAttribute('aria-expanded', 'true');
}

function syncSettingsListFont() {
  if (settingsListFontSize) settingsListFontSize.value = String(clampFontSize(fontSizeInput?.value));
}
function clampUiFontSize(value) {
  const n = Number.parseInt(value, 10);
  return Math.max(12, Math.min(28, Number.isFinite(n) ? n : (isMobileLayout() ? 19 : 16)));
}
function uiFontStorageKey() {
  return isMobileLayout() ? UI_FONT_MOBILE_KEY : UI_FONT_PC_KEY;
}
function applyUiFontSize(value, persist=true) {
  const n = clampUiFontSize(value);
  document.documentElement.style.setProperty('--matome-ui-font-size', `${n}px`);
  if (settingsUiFontSize) settingsUiFontSize.value = String(n);
  if (persist) { try { localStorage.setItem(uiFontStorageKey(), String(n)); } catch {} }
  return n;
}
function loadUiFontSize() {
  let value = isMobileLayout() ? 19 : 16;
  try { value = localStorage.getItem(uiFontStorageKey()) || value; } catch {}
  return applyUiFontSize(value, false);
}
function readerSettingKey(pcKey, mobileKey) { return isMobileLayout() ? mobileKey : pcKey; }
function settingsPanelScaleKey(){ return isMobileLayout()?SETTINGS_SCALE_MOBILE_KEY:SETTINGS_SCALE_PC_KEY; }
function clampSettingsScale(v){ const n=Number.parseInt(v,10); return Math.max(80,Math.min(130,Number.isFinite(n)?n:100)); }
function applySettingsPanelScale(v,persist=true){
  const n=clampSettingsScale(v);
  document.documentElement.style.setProperty('--settings-panel-scale',String(n/100));
  if(settingsPanelScale) settingsPanelScale.value=String(n);
  if(persist) try{localStorage.setItem(settingsPanelScaleKey(),String(n));}catch{}
  return n;
}
function loadSettingsPanelScale(){ let v=100; try{v=localStorage.getItem(settingsPanelScaleKey())||100}catch{} return applySettingsPanelScale(v,false); }
function applyDarkMode(on,persist=true){
  const dark=document.documentElement.classList.contains('mobile-ui')||document.documentElement.classList.contains('tablet-ui');
  document.documentElement.classList.toggle('setting-dark-mode',dark);
  document.documentElement.classList.toggle('setting-light-mode',!dark);
  document.body?.classList.toggle('setting-dark-mode',dark);
  document.body?.classList.toggle('setting-light-mode',!dark);
  try{readerFrame?.contentWindow?.postMessage({type:'matome-display-settings',darkMode:dark,deviceMode:dark?'mobile':'pc'},location.origin)}catch{}
  return dark;
}
function loadDarkMode(){
  return document.documentElement.classList.contains('setting-dark-mode');
}

function clampReaderSettingFont(v) { return Math.max(13, Math.min(41, Number.parseInt(v,10) || 16)); }
function clampReaderLine(v) { const n=Number.parseFloat(v); return Math.max(1.3, Math.min(2.2, Number.isFinite(n)?n:1.6)); }
function clampReaderMetaFont(v) { const n=Number.parseInt(v,10); return Math.max(8, Math.min(18, Number.isFinite(n)?n:11)); }
function applyReaderMetaFont(v, persist=true) {
  const n=clampReaderMetaFont(v);
  if (settingsMetaFontSize) settingsMetaFontSize.value=String(n);
  if (persist) try{ localStorage.setItem(readerSettingKey(READER_META_FONT_PC_KEY,READER_META_FONT_MOBILE_KEY),String(n)); }catch{}
  try{ readerFrame?.contentWindow?.postMessage({type:'matome-display-settings',readerMetaFont:n},location.origin); }catch{}
  return n;
}
function applyReaderSettingFont(v, persist=true) {
  const n=clampReaderSettingFont(v);
  if (settingsReaderFontSize) settingsReaderFontSize.value=String(n);
  if (persist) try{ localStorage.setItem(readerSettingKey(READER_FONT_PC_KEY,READER_FONT_MOBILE_KEY),String(n)); }catch{}
  try{ readerFrame?.contentWindow?.postMessage({type:'matome-display-settings',readerFont:n},location.origin); }catch{}
}
function applyReaderLineHeight(v, persist=true) {
  const n=Math.round(clampReaderLine(v)*10)/10;
  if (settingsReaderLineHeight) settingsReaderLineHeight.value=n.toFixed(1);
  if (persist) try{ localStorage.setItem(readerSettingKey(READER_LINE_PC_KEY,READER_LINE_MOBILE_KEY),String(n)); }catch{}
  try{ readerFrame?.contentWindow?.postMessage({type:'matome-display-settings',readerLine:n},location.origin); }catch{}
}
function readBoolSetting(key, fallback=true){ try{ const v=localStorage.getItem(key); return v===null?fallback:v!=='0'; }catch{return fallback;} }
function applyBoolSetting(input,key,hideClass,persist=true){
  const on=!!input?.checked; document.documentElement.classList.toggle(hideClass,!on);
  if(persist) try{localStorage.setItem(key,on?'1':'0')}catch{}
}
function loadExtraDisplaySettings(){
  const rf=localStorage.getItem(readerSettingKey(READER_FONT_PC_KEY,READER_FONT_MOBILE_KEY))||16;
  const rl=localStorage.getItem(readerSettingKey(READER_LINE_PC_KEY,READER_LINE_MOBILE_KEY))||1.6;
  const rm=localStorage.getItem(readerSettingKey(READER_META_FONT_PC_KEY,READER_META_FONT_MOBILE_KEY))||11;
  applyReaderSettingFont(rf,false); applyReaderLineHeight(rl,false); applyReaderMetaFont(rm,false);
  for(const [input,key,cls] of [[settingsShowSiteCounts,SHOW_SITE_COUNTS_KEY,'setting-hide-site-counts'],[settingsShowStatus,SHOW_STATUS_KEY,'setting-hide-status'],[settingsShowIkioi,SHOW_IKIOI_KEY,'setting-hide-ikioi'],[settingsShowUpdate,SHOW_UPDATE_KEY,'setting-hide-update']]){ if(!input)continue; input.checked=readBoolSetting(key,true); applyBoolSetting(input,key,cls,false); }
}
async function loadStandbySetting(){
  if(!settingsStandbyArticles)return;
  try{
    const r=await fetch('/api/standby-settings',{cache:'no-store'});
    if(!r.ok)return;
    const d=await r.json();
    settingsStandbyArticles.value=String(Number(d?.standby_articles||1000));
  }catch{}
}
async function saveStandbySetting(value){
  if(!settingsStandbyArticles)return;
  const n=Number(value||1000);
  try{
    const r=await fetch('/api/standby-settings',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({standby_articles:n}),cache:'no-store'
    });
    if(!r.ok)throw new Error('待機記事設定を保存できません');
    const d=await r.json();
    settingsStandbyArticles.value=String(Number(d?.standby_articles||n));
  }catch{
    await loadStandbySetting();
  }
}

function openDisplaySettings() {
  syncSettingsListFont();
  loadUiFontSize();
  loadExtraDisplaySettings();
  loadSettingsPanelScale();
  loadDarkMode();
  void loadStandbySetting();
  if (displaySettingsPanel) displaySettingsPanel.hidden = false;
}
function closeDisplaySettings() {
  if (displaySettingsPanel) displaySettingsPanel.hidden = true;
}
function leaveDisplaySettings(){
  closeDisplaySettings();
  setDesktopNavActive('home');
  setMobileNavActive('home');
}
displaySettingsClose?.addEventListener('click', leaveDisplaySettings);
displaySettingsBack?.addEventListener('click', leaveDisplaySettings);
displaySettingsPanel?.addEventListener('click', e => { if (e.target === displaySettingsPanel) leaveDisplaySettings(); });
document.addEventListener('keydown',e=>{if(e.key==='Escape' && displaySettingsPanel && !displaySettingsPanel.hidden)leaveDisplaySettings();});

// iPhone/iPad共通: 設定を開いている時だけ左端から右へスワイプで戻る。
let settingsBackSwipeStart=null;
displaySettingsPanel?.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;
  if(e.clientX<=54)settingsBackSwipeStart={x:e.clientX,y:e.clientY,id:e.pointerId};
},{passive:true});
displaySettingsPanel?.addEventListener('pointerup',e=>{
  const s=settingsBackSwipeStart;settingsBackSwipeStart=null;
  if(!s || s.id!==e.pointerId)return;
  if(e.clientX-s.x>=72 && Math.abs(e.clientY-s.y)<=80)leaveDisplaySettings();
},{passive:true});
displaySettingsPanel?.addEventListener('pointercancel',()=>{settingsBackSwipeStart=null;},{passive:true});
settingsListFontSize?.addEventListener('change', () => applyUserFontSize(settingsListFontSize.value, true));
settingsListFontSize?.addEventListener('input', () => applyUserFontSize(settingsListFontSize.value, true));
settingsListFontDec?.addEventListener('click', () => { const n=clampFontSize(settingsListFontSize?.value)-1; applyUserFontSize(n,true); syncSettingsListFont(); });
settingsListFontInc?.addEventListener('click', () => { const n=clampFontSize(settingsListFontSize?.value)+1; applyUserFontSize(n,true); syncSettingsListFont(); });
settingsUiFontSize?.addEventListener('change', () => applyUiFontSize(settingsUiFontSize.value, true));
settingsUiFontSize?.addEventListener('input', () => applyUiFontSize(settingsUiFontSize.value, true));
settingsUiFontDec?.addEventListener('click', () => applyUiFontSize(clampUiFontSize(settingsUiFontSize?.value)-1, true));
settingsUiFontInc?.addEventListener('click', () => applyUiFontSize(clampUiFontSize(settingsUiFontSize?.value)+1, true));
settingsReaderFontSize?.addEventListener('input',()=>applyReaderSettingFont(settingsReaderFontSize.value,true));
settingsReaderFontSize?.addEventListener('change',()=>applyReaderSettingFont(settingsReaderFontSize.value,true));
settingsReaderFontDec?.addEventListener('click',()=>applyReaderSettingFont(clampReaderSettingFont(settingsReaderFontSize?.value)-1,true));
settingsReaderFontInc?.addEventListener('click',()=>applyReaderSettingFont(clampReaderSettingFont(settingsReaderFontSize?.value)+1,true));
settingsReaderLineHeight?.addEventListener('input',()=>applyReaderLineHeight(settingsReaderLineHeight.value,true));
settingsReaderLineHeight?.addEventListener('change',()=>applyReaderLineHeight(settingsReaderLineHeight.value,true));
settingsMetaFontSize?.addEventListener('input',()=>applyReaderMetaFont(settingsMetaFontSize.value,true));
settingsMetaFontSize?.addEventListener('change',()=>applyReaderMetaFont(settingsMetaFontSize.value,true));
settingsMetaFontDec?.addEventListener('click',()=>applyReaderMetaFont(clampReaderMetaFont(settingsMetaFontSize?.value)-1,true));
settingsMetaFontInc?.addEventListener('click',()=>applyReaderMetaFont(clampReaderMetaFont(settingsMetaFontSize?.value)+1,true));
settingsReaderLineDec?.addEventListener('click',()=>applyReaderLineHeight(clampReaderLine(settingsReaderLineHeight?.value)-0.1,true));
settingsReaderLineInc?.addEventListener('click',()=>applyReaderLineHeight(clampReaderLine(settingsReaderLineHeight?.value)+0.1,true));
for(const [input,key,cls] of [[settingsShowSiteCounts,SHOW_SITE_COUNTS_KEY,'setting-hide-site-counts'],[settingsShowStatus,SHOW_STATUS_KEY,'setting-hide-status'],[settingsShowIkioi,SHOW_IKIOI_KEY,'setting-hide-ikioi'],[settingsShowUpdate,SHOW_UPDATE_KEY,'setting-hide-update']]) input?.addEventListener('change',()=>applyBoolSetting(input,key,cls,true));
settingsPanelScale?.addEventListener('input',()=>applySettingsPanelScale(settingsPanelScale.value,true));
settingsPanelScale?.addEventListener('change',()=>applySettingsPanelScale(settingsPanelScale.value,true));
settingsPanelScaleDec?.addEventListener('click',()=>applySettingsPanelScale(clampSettingsScale(settingsPanelScale?.value)-5,true));
settingsPanelScaleInc?.addEventListener('click',()=>applySettingsPanelScale(clampSettingsScale(settingsPanelScale?.value)+5,true));
settingsStandbyArticles?.addEventListener('change',()=>void saveStandbySetting(settingsStandbyArticles.value));

settingsResetDisplay?.addEventListener('click',()=>{
  applyUiFontSize(isMobileLayout()?19:16,true);
  applyReaderLineHeight(1.6,true); applyReaderMetaFont(11,true);
  applySettingsPanelScale(100,true); applyDarkMode(false,true);
  for(const [input,key,cls] of [[settingsShowSiteCounts,SHOW_SITE_COUNTS_KEY,'setting-hide-site-counts'],[settingsShowStatus,SHOW_STATUS_KEY,'setting-hide-status'],[settingsShowIkioi,SHOW_IKIOI_KEY,'setting-hide-ikioi'],[settingsShowUpdate,SHOW_UPDATE_KEY,'setting-hide-update']]){ if(!input)continue; input.checked=true; applyBoolSetting(input,key,cls,true); }
});
loadUiFontSize();
loadExtraDisplaySettings();
loadSettingsPanelScale();
loadDarkMode();

mobileBottomNav?.addEventListener('click', e => {
  const button = e.target.closest('[data-mobile-nav]');
  if (!button) return;
  const nav = button.dataset.mobileNav;
  if (nav === 'home') {
    closeMobileSiteList();
    setMobileNavActive('home');
    resetToLatestView();
    render(true);
    return;
  }
  if (nav === 'sites') {
    const isOpen = sitePickerPanel?.classList.contains('mobile-nav-open');
    if (isOpen) {
      closeMobileSiteList();
      setMobileNavActive('home');
    } else {
      closeDisplaySettings();
      openMobileSiteList();
      setMobileNavActive('sites');
    }
    return;
  }
  if (nav === 'settings') {
    closeMobileSiteList();
    openDisplaySettings();
    setMobileNavActive('settings');
  }
});

desktopTopNav?.addEventListener('click', e => {
  const button = e.target.closest('[data-desktop-nav]');
  if (!button) return;
  const nav = button.dataset.desktopNav;
  if (nav === 'home') {
    sitePickerPanel.hidden = true;
    sitePickerBtn?.setAttribute('aria-expanded','false');
    setDesktopNavActive('home');
    resetToLatestView();
    render(true);
    return;
  }
  if (nav === 'sites') {
    closeDisplaySettings();
    const open = sitePickerPanel.hidden;
    sitePickerPanel.hidden = !open;
    sitePickerBtn?.setAttribute('aria-expanded', open ? 'true':'false');
    if (open) buildSitePicker(allItems);
    setDesktopNavActive(open ? 'sites' : 'home');
    return;
  }
  if (nav === 'settings') {
    sitePickerPanel.hidden = true;
    sitePickerBtn?.setAttribute('aria-expanded','false');
    openDisplaySettings();
    setDesktopNavActive('settings');
  }
});

sitePickerClose?.addEventListener('click', () => {
  if (isMobileLayout()) {
    closeMobileSiteList();
    setMobileNavActive('home');
  }
});

let standbyReleaseTimer=null;
async function releaseStandbyTick(){
  standbyReleaseTimer=null;
  if(WORKER_MODE)return;
  if(document.hidden){
    standbyReleaseTimer=setTimeout(releaseStandbyTick,30000);
    return;
  }
  let delay=30000;
  try{
    const r=await fetch('/api/release-standby',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
    if(r.ok){
      const d=await r.json();
      delay=Math.max(10000,Math.min(30000,Number(d?.next_interval_seconds||30)*1000));
      if(d?.released)void checkForNewOnly(false,true);
    }
  }catch{}
  standbyReleaseTimer=setTimeout(releaseStandbyTick,delay);
}
function startStandbyReleaseLoop(immediate=false){
  if(WORKER_MODE)return;
  if(standbyReleaseTimer)clearTimeout(standbyReleaseTimer);
  standbyReleaseTimer=setTimeout(releaseStandbyTick,immediate?250:10000);
}

async function consumeServerNewBuffer() {
  try {
    const res=await fetch('/api/consume-new-buffer',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
    if(res.ok){const data=await res.json();rememberServerBufferCutoff(data?.new_buffer_cutoff);}
  } catch {}
}

newBadge.addEventListener("click", async () => {
  // v0.1.185: 新着が無い「更新 HH:MM」状態では、同じボタンで一覧先頭へ戻る。
  // 新着あり状態の挙動は従来どおり、最新一覧を反映する。
  if (newBadge.dataset.mode !== "new") {
    forceLatestListTop();
    return;
  }
  resetToLatestView();
  // バッジを出した時点で取れている最新一覧を即反映。
  if (pendingFreshItems?.length) {
    const items=pendingFreshItems;
    applyFreshList(items);
    void consumeServerNewBuffer();
    return;
  }
  // 通常はバッジ表示時点でpendingFreshItemsを保持済み。
  // 万一消えていても全件手動更新はせず、新着確認だけを再実行する。
  await checkForNewOnly(false);
  if (pendingFreshItems?.length) {
    const items=pendingFreshItems;
    applyFreshList(items);
    void consumeServerNewBuffer();
  }
});

// 起動時だけ自動更新する。
// 記事から「戻る」で復帰する時はスクロール復元情報を消さない。
// 通常の新規起動だけ全サイトの最新一覧から始める。
function consumeMobileLastOpenedRead() {
  if (!isMobileLayout()) return false;
  let url = '';
  try { url = sessionStorage.getItem(MOBILE_LAST_OPENED_READ_KEY) || ''; } catch {}
  if (!url) return false;
  markRead(url);
  try { sessionStorage.removeItem(MOBILE_LAST_OPENED_READ_KEY); } catch {}
  return true;
}

consumeMobileLastOpenedRead();
void syncSharedReads({rerender:true});
const _returningToIndex = sessionStorage.getItem('matomeRestorePending') === '1';
if (!_returningToIndex) resetToLatestView();
statusEl.textContent = _returningToIndex ? "前回位置を復元中..." : "起動更新中...";
updatedEl.textContent = "";
showUpdateBadge(lastListDisplayTime());
window.__matomeForceHeaderBadge?.();
window.__matomeForcePhoneIkioi?.();
const _navType = performance.getEntriesByType?.("navigation")?.[0]?.type || "navigate";

function restoreMobileReturnSnapshot() {
  if (!_returningToIndex || !isMobileLayout()) return false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(MOBILE_RETURN_ITEMS_KEY) || '[]');
    if (!Array.isArray(saved) || !saved.length) return false;
    allItems = saved.slice(0, 500);
    fillSourceFilter(allItems);
    const savedSource = sessionStorage.getItem('matomeReturnSource') || '';
    if ([...sourceFilter.options].some(o => o.value === savedSource)) {
      sourceFilter.value = savedSource;
      buildSourceTabs(allSourceCounts(allItems).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'ja')), savedSource);
    }
    newestSnapshot = newestItemSnapshot(allItems);
    rememberCurrentItems(allItems);
    pendingFreshItems = null;
    render(true);
    prefetchMobileReadyArticles(allItems);
    void renewFrozenListLeases(allItems,true);
    statusEl.textContent = '';
    return true;
  } catch {
    return false;
  }
}

if (!WORKER_MODE) {
  const restoredExactList = restoreMobileReturnSnapshot();
  if (restoredExactList) {
    // Keep the restored list stable, but also follow a committed-buffer change made by the other device.
    scheduleNewCheck();
    checkForNewOnly(false,true);
  } else {
    // v0.1.218: keep the visible list stable across normal launch/F5.
    // A peer device consuming the shared buffer may update only the committed 500 rows.
    const cached = restoreListCache();
    if (cached?.items?.length) {
      allItems = cached.items.slice(0, 500);
      fillSourceFilter(allItems);
      newestSnapshot = newestItemSnapshot(allItems);
      rememberCurrentItems(allItems);
      pendingFreshItems = null;
      render(true);
      prefetchMobileReadyArticles(allItems);
      void renewFrozenListLeases(allItems,true);
      showUpdateBadge(lastListDisplayTime() || cached.savedAt || 0);
      statusEl.textContent = '';
      scheduleNewCheck();
      checkForNewOnly(false,true);
    } else {
      // First launch on this device has no frozen list yet, so seed it once.
      load(false).finally(() => {
        saveListCache(allItems);
        scheduleNewCheck();
      });
    }
  }
}

// 裏タブから戻った時も「新着あり」の確認だけ。記事一覧は変えない。
function refreshMobileReadHidingOnReturn() {
  if (!isMobileLayout()) return;
  const consumed = consumeMobileLastOpenedRead();
  if (!hideReadArticlesEnabled() && !consumed) return;
  readSet();
  lastRenderKey = '';
  render(true, {preserveReader:true});
}

let lastDeviceResumeSyncAt=0;
function syncOnDeviceResume(){
  const now=Date.now();
  if(now-lastDeviceResumeSyncAt<450)return;
  lastDeviceResumeSyncAt=now;
  refreshMobileReadHidingOnReturn();
  void renewFrozenListLeases(allItems,false);
  void syncSharedReads({rerender:true});
  void checkForNewOnly(false,true);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { syncOnDeviceResume(); startStandbyReleaseLoop(true); }
});
window.addEventListener('focus', () => { syncOnDeviceResume(); startStandbyReleaseLoop(true); });
startStandbyReleaseLoop(true);



window.addEventListener('message',e=>{
  if (e?.data?.type==='matome-read' && e.data.url) {
    markRead(e.data.url);
    // If the article reports itself read while it is already open in the desktop
    // reader, update/refill only the list. Never auto-switch the article being read.
    if (hideReadArticlesEnabled()) {
      lastRenderKey = '';
      render(true, {preserveReader:true});
    } else {
      render(true);
    }
  }
});


// Chromeの「戻る」でBFCacheから復元された時も、画像取得キューを再確認する。
window.addEventListener("pageshow", e => {
  refreshMobileReadHidingOnReturn();
  void syncSharedReads({rerender:true});
  void checkForNewOnly(false,true);
  // v0.1.209: BFCache/WebView return may keep the old in-memory read set.
  // Refresh it and re-filter immediately when read hiding is enabled.
  if (hideReadArticlesEnabled()) {
    readSet();
    lastRenderKey = '';
    render(true, {preserveReader:true});
    setTimeout(() => {
      if (!hideReadArticlesEnabled()) return;
      readSet();
      lastRenderKey = '';
      render(true, {preserveReader:true});
    }, 0);
  }
  if (isMobileLayout() && sessionStorage.getItem('matomeRestorePending') === '1') {
    // BFCacheでも通常の履歴復帰でも、一覧DOMが戻った後に同じ位置へ戻す。
    requestAnimationFrame(() => requestAnimationFrame(() => restoreIndexPosition()));
  }
});



function normalize5chThreadUrl(raw) {
  try {
    const u = new URL(raw);
    // ikioi.jp のリンクは /l50 等の範囲指定付き。自動まとめでは全レスを読む。
    const m = u.pathname.match(/^(\/test\/read\.cgi\/[^/]+\/\d+)(?:\/.*)?$/);
    if (m) u.pathname = m[1] + '/';
    u.hash = '';
    return u.href;
  } catch { return raw || ''; }
}

function open5chThread(item) {
  const url = normalize5chThreadUrl(item?.link || '');
  if (!url) return;
  const mobile = isMobileLayout();
  if (!mobile) readerEmpty.hidden = true;
  const q = new URLSearchParams({
    embedded: mobile ? '0' : '1',
    url,
    title: item?.title || '',
    board: item?.board || '',
    speed: item?.speed || '',
    responses: item?.responses || ''
  });
  const next = chrome.runtime.getURL('thread.html') + '?' + q.toString();
  setIkioiOpen(false);
  if (mobile) {
    saveIndexPosition({link: '5ch:' + url});
    // 5ch行は通常のまとめ一覧外なので絶対Y座標を主に使う。
    sessionStorage.setItem('matomeReturnLink', '');
    location.href = next;
    return;
  }
  readerFrame.dataset.link = '5ch:' + url;
  readerFrame.src = next;
}

// ===== 5ch 勢いランキング =====
function compactNumberText(s) {
  return cleanText(s).replace(/\s+/g, " ");
}

function parseIkioiRowText(raw) {
  const text = compactNumberText(raw);
  // 例: 1 スレタイトル (1002)1.4万2026/08/10 16:50
  const rankMatch = text.match(/^\s*(\d{1,3})\s*/);
  const rank = rankMatch ? Number(rankMatch[1]) : 0;
  let body = rankMatch ? text.slice(rankMatch[0].length) : text;
  const dateMatch = body.match(/(20\d{2}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})\s*$/);
  const dateText = dateMatch ? dateMatch[1] : "";
  if (dateMatch) body = body.slice(0, dateMatch.index).trim();
  const tail = body.match(/\((\d+)\)\s*([\d,.]+(?:万|億)?)/);
  let responses = "", speed = "";
  if (tail) {
    responses = tail[1];
    speed = tail[2];
    body = body.slice(0, tail.index).trim();
  }
  return {rank, title: body, responses, speed, dateText};
}

function parseIkioi(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [];
  const seen = new Set();
  const anchors = [...doc.querySelectorAll('a[href]')];
  for (const a of anchors) {
    const href = absUrl(a.getAttribute('href'), baseUrl);
    if (!href || seen.has(href)) continue;
    let host = "";
    try { host = new URL(href).hostname; } catch { continue; }
    if (!/(?:^|\.)5ch\.(?:net|io)$/i.test(host)) continue;
    const info = parseIkioiRowText(a.textContent || "");
    if (!info.title || !info.rank || info.rank > 200) continue;

    // 同じ行にある板名を拾う。取れなくてもランキング自体は表示する。
    let board = "";
    let parent = a.parentElement;
    for (let depth=0; parent && depth<4 && !board; depth++, parent=parent.parentElement) {
      for (const other of parent.querySelectorAll('a[href]')) {
        if (other === a) continue;
        const oh = absUrl(other.getAttribute('href'), baseUrl);
        if (!oh || oh === href) continue;
        try {
          if (new URL(oh).hostname === 'ikioi.jp') {
            const t = cleanText(other.textContent);
            if (t && t.length <= 30 && !/^もっと見る|サイトを更新$/.test(t)) { board = t; break; }
          }
        } catch {}
      }
    }
    seen.add(href);
    rows.push({...info, link: href, board});
  }
  return rows.sort((a,b) => a.rank - b.rank).slice(0, 50);
}

function ikioiCacheKey(key) { return IKIOI_CACHE_PREFIX + key; }
function readIkioiCache(key) {
  try {
    const v = JSON.parse(localStorage.getItem(ikioiCacheKey(key)) || "null");
    if (!v || !Array.isArray(v.items)) return null;
    return v;
  } catch { return null; }
}
function saveIkioiCache(key, items) {
  try { localStorage.setItem(ikioiCacheKey(key), JSON.stringify({savedAt:Date.now(), items})); } catch {}
}

function buildIkioiCats() {
  ikioiCats.replaceChildren();
  for (const c of IKIOI_CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ikioi-cat' + (c.key === ikioiCategory ? ' active' : '');
    b.textContent = c.label;
    b.addEventListener('click', () => {
      if (ikioiCategory === c.key) return;
      ikioiCategory = c.key;
      localStorage.setItem('matome_ikioi_category_v33', ikioiCategory);
      buildIkioiCats();
      loadIkioi(false);
    });
    ikioiCats.appendChild(b);
  }
}

function renderIkioi(items) {
  ikioiList.replaceChildren();
  if (!items?.length) {
    const d = document.createElement('div');
    d.className = 'ikioi-placeholder';
    d.textContent = '勢いランキングを取得できませんでした。';
    ikioiList.appendChild(d);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const [i, x] of items.slice(0, 40).entries()) {
    const a = document.createElement('a');
    a.className = 'ikioi-item';
    a.href = x.link;
    a.title = '右側で5ch自動まとめを開く';
    a.addEventListener('click', e => {
      e.preventDefault();
      open5chThread(x);
    });

    const rank = document.createElement('div');
    rank.className = 'ikioi-rank';
    rank.textContent = String(x.rank || i + 1);

    const body = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'ikioi-thread-title';
    title.textContent = x.title;
    const meta = document.createElement('div');
    meta.className = 'ikioi-meta';
    if (x.speed) {
      const s = document.createElement('span');
      s.className = 'ikioi-speed';
      s.textContent = `勢い ${x.speed}`;
      meta.appendChild(s);
    }
    if (x.responses) {
      const s = document.createElement('span');
      s.textContent = `${x.responses}レス`;
      meta.appendChild(s);
    }
    if (x.board) {
      const s = document.createElement('span');
      s.textContent = x.board;
      meta.appendChild(s);
    }
    body.append(title, meta);
    a.append(rank, body);
    frag.appendChild(a);
  }
  ikioiList.appendChild(frag);
}

async function loadIkioi(force=false) {
  const cat = IKIOI_CATEGORIES.find(x => x.key === ikioiCategory) || IKIOI_CATEGORIES[0];
  let cached = readIkioiCache(cat.key);
  if (!force && !cached?.items?.length) {
    const shared = await window.MatomePi?.loadSnapshot?.('ikioi_' + cat.key);
    if (shared?.items?.length) { cached = shared; saveIkioiCache(cat.key, shared.items); }
  }
  if (!force && cached?.items?.length) {
    renderIkioi(cached.items);

    const t = new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(cached.savedAt));
    ikioiUpdated.textContent = `前回 ${t}`;
    if (Date.now() - cached.savedAt < IKIOI_CACHE_MS) return;
  } else {
    ikioiList.innerHTML = '<div class="ikioi-placeholder">取得中...</div>';
  }

  ikioiRefresh.disabled = true;
  ikioiError.hidden = true;
  try {
    const {text} = await fetchDecoded(cat.url, {timeout:6500, cache:'no-cache'});
    const items = parseIkioi(text, cat.url);
    if (items.length < 3) throw new Error(`ランキング解析結果が少なすぎます（${items.length}件）`);
    renderIkioi(items);
    saveIkioiCache(cat.key, items);

    window.MatomePi?.saveSnapshot?.('ikioi_' + cat.key, {savedAt:Date.now(), items});
    ikioiUpdated.textContent = `更新 ${new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())}`;
  } catch (e) {
    ikioiError.hidden = false;
    ikioiError.textContent = `5ch勢いの取得に失敗しました。 ${e?.message || e}`;
    if (!cached?.items?.length) renderIkioi([]);
  } finally {
    ikioiRefresh.disabled = false;
  }
}

function setIkioiOpen(open) {
  document.body.classList.toggle('ikioi-open', !!open);
  ikioiDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  ikioiTab.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && !ikioiLoadedOnce) {
    ikioiLoadedOnce = true;
    buildIkioiCats();
    loadIkioi(false);
  }
}

if (hideReadArticles) {
  hideReadArticles.checked = hideReadArticlesEnabled();
  hideReadArticles.addEventListener('change', () => {
    try { localStorage.setItem(HIDE_READ_ARTICLES_KEY, hideReadArticles.checked ? '1' : '0'); } catch {}
    currentPage = 1;
    sessionStorage.setItem('matomePage','1');
    lastRenderKey = '';
    render(true);
    forceLatestListTop();
  });
}
buildIkioiCats();
ikioiTab.addEventListener('click', () => {
  setIkioiOpen(!document.body.classList.contains('ikioi-open'));
});
ikioiClose.addEventListener('click', () => setIkioiOpen(false));
ikioiRefresh.addEventListener('click', () => loadIkioi(true));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.body.classList.contains('ikioi-open')) setIkioiOpen(false);
});

// ===== v0.1.224: iPhone-style swipe-back for Settings / Site list =====
// Only starts from the left edge so ordinary vertical scrolling and content gestures stay untouched.
(() => {
  const EDGE_START_PX = 48;
  const MIN_BACK_SWIPE_PX = 72;
  const MAX_VERTICAL_DRIFT_PX = 64;
  const MAX_SWIPE_MS = 700;
  let gesture = null;

  function mobileOverlayOpen() {
    if (!isMobileLayout()) return false;
    const settingsOpen = !!displaySettingsPanel && !displaySettingsPanel.hidden;
    const sitesOpen = !!sitePickerPanel && sitePickerPanel.classList.contains('mobile-nav-open') && !sitePickerPanel.hidden;
    return settingsOpen || sitesOpen;
  }

  function performMobileOverlayBack() {
    if (!isMobileLayout()) return false;
    if (displaySettingsPanel && !displaySettingsPanel.hidden) {
      closeDisplaySettings();
      setMobileNavActive('home');
      return true;
    }
    if (sitePickerPanel && sitePickerPanel.classList.contains('mobile-nav-open') && !sitePickerPanel.hidden) {
      closeMobileSiteList();
      setMobileNavActive('home');
      return true;
    }
    return false;
  }

  document.addEventListener('touchstart', (e) => {
    if (!mobileOverlayOpen() || e.touches.length !== 1) { gesture = null; return; }
    const t = e.touches[0];
    if (t.clientX > EDGE_START_PX) { gesture = null; return; }
    gesture = { x: t.clientX, y: t.clientY, at: performance.now() };
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!gesture || e.changedTouches.length !== 1) { gesture = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - gesture.x;
    const dy = Math.abs(t.clientY - gesture.y);
    const elapsed = performance.now() - gesture.at;
    gesture = null;
    if (dx >= MIN_BACK_SWIPE_PX && dy <= MAX_VERTICAL_DRIFT_PX && elapsed <= MAX_SWIPE_MS) {
      performMobileOverlayBack();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
})();


// ===== v0.1.225: reliable swipe-back inside the independently scrolling Site list =====
// v0.1.224 listened on document; iOS could keep the gesture inside the overflow scroller,
// so Settings worked while Site list occasionally never reached the document touchend handler.
(() => {
  if (!sitePickerPanel) return;
  const EDGE_START_PX = 56;
  const CLAIM_SWIPE_PX = 18;
  const MIN_BACK_SWIPE_PX = 72;
  const MAX_VERTICAL_DRIFT_PX = 72;
  const MAX_SWIPE_MS = 900;
  let g = null;

  function sitesAreOpen() {
    return isMobileLayout() &&
      sitePickerPanel.classList.contains('mobile-nav-open') &&
      !sitePickerPanel.hidden;
  }
  function finishBack() {
    if (!sitesAreOpen()) return false;
    closeMobileSiteList();
    setMobileNavActive('home');
    return true;
  }

  sitePickerPanel.addEventListener('touchstart', (e) => {
    if (!sitesAreOpen() || e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    if (t.clientX > EDGE_START_PX) { g = null; return; }
    g = { x:t.clientX, y:t.clientY, at:performance.now(), claimed:false };
  }, { passive:true, capture:true });

  sitePickerPanel.addEventListener('touchmove', (e) => {
    if (!g || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = Math.abs(t.clientY - g.y);
    if (dx <= 0) return;
    if (!g.claimed && dx >= CLAIM_SWIPE_PX && dx > dy * 1.15) g.claimed = true;
    if (g.claimed && e.cancelable) e.preventDefault();
    if (g.claimed && dx >= MIN_BACK_SWIPE_PX && dy <= MAX_VERTICAL_DRIFT_PX) {
      g = null;
      finishBack();
    }
  }, { passive:false, capture:true });

  sitePickerPanel.addEventListener('touchend', (e) => {
    if (!g || e.changedTouches.length !== 1) { g = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - g.x;
    const dy = Math.abs(t.clientY - g.y);
    const elapsed = performance.now() - g.at;
    const claimed = g.claimed;
    g = null;
    if ((claimed || dx >= CLAIM_SWIPE_PX) && dx >= MIN_BACK_SWIPE_PX &&
        dy <= MAX_VERTICAL_DRIFT_PX && elapsed <= MAX_SWIPE_MS) {
      finishBack();
    }
  }, { passive:true, capture:true });

  sitePickerPanel.addEventListener('touchcancel', () => { g = null; }, { passive:true, capture:true });
})();
