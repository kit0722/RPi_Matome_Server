#!/usr/bin/env python3
import argparse, gzip, hashlib, html, html.parser, io, json, mimetypes, os, re, socket, sqlite3, subprocess, threading, time, urllib.error, urllib.parse, urllib.request, uuid, zlib
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from ready_store import ReadyStore, MAX_PUBLISHED, MAX_NEW_BUFFER, STANDBY_CHOICES, DEFAULT_STANDBY
from video_stream import relay as relay_video, warm as warm_video

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
CACHE = Path(os.environ.get("MATOME_CACHE_DIR", str(ROOT / "cache")))
DATA = CACHE / "data"
DB = CACHE / "cache.sqlite3"

STATE = CACHE / "state"
STATE.mkdir(parents=True, exist_ok=True)
STATE_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
READ_STATE_LOCK = threading.RLock()
STATE_WRITE_LOCKS = [threading.RLock() for _ in range(32)]

def snapshot_path(name):
    if not STATE_NAME_RE.match(name or ""):
        raise ValueError("bad snapshot name")
    return STATE / (name + ".json")

def load_snapshot(name):
    path = snapshot_path(name)
    if not path.exists(): return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def save_snapshot(name, payload):
    path = snapshot_path(name)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    lock = STATE_WRITE_LOCKS[int(hashlib.sha256(name.encode()).hexdigest()[:8],16)%len(STATE_WRITE_LOCKS)]
    with lock:
        tmp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
        try:
            with tmp.open("w", encoding="utf-8") as f:
                f.write(raw); f.flush(); os.fsync(f.fileno())
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)
    return len(raw.encode("utf-8"))

CONFIG_PATH = ROOT / "config.json"
DEFAULT = {
    "port": 8767,
    "text_retention_days": 1,
    "image_retention_days": 1,
    "max_cache_gb": 10,
    "prefetch_newest_articles": 500,
    "standby_articles": DEFAULT_STANDBY,
    "feed_fresh_seconds": 120,
    "article_fresh_seconds": 1800,
    "image_fresh_seconds": 86400,
    "mobile_image_enabled": True,
    "mobile_image_max_width": 720,
    "mobile_image_quality": 55,
    "mobile_image_workers": 1,
    "upstream_workers": 2,
    "upstream_text_max_mb": 32,
    "turnover_reserve_mb": 768,
}

def load_config():
    cfg = dict(DEFAULT)
    try:
        cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except Exception:
        pass
    return cfg

CFG = load_config()
CONFIG_WRITE_LOCK = threading.RLock()

def update_runtime_config(patch):
    """Atomically persist the small set of settings editable from the web UI."""
    with CONFIG_WRITE_LOCK:
        try:
            disk=json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if not isinstance(disk,dict):disk={}
        except Exception:
            disk={}
        disk.update(patch)
        tmp=CONFIG_PATH.with_name(CONFIG_PATH.name+"."+uuid.uuid4().hex+".tmp")
        try:
            with tmp.open("w",encoding="utf-8") as f:
                json.dump(disk,f,ensure_ascii=False,indent=2);f.write("\n");f.flush();os.fsync(f.fileno())
            os.replace(tmp,CONFIG_PATH)
        finally:
            tmp.unlink(missing_ok=True)
        CFG.update(patch)

DATA.mkdir(parents=True, exist_ok=True)
DB_LOCK = threading.RLock()
READY = ReadyStore(CACHE)
READY.set_standby_target(CFG.get("standby_articles",DEFAULT_STANDBY))
MOBILE_IMAGE_DIR = READY.root / "mobile"
MOBILE_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
MOBILE_IMAGE_LOCKS = [threading.Lock() for _ in range(128)]
MOBILE_IMAGE_GATE = threading.BoundedSemaphore(max(1,min(2,int(CFG.get("mobile_image_workers",1) or 1))))
UPSTREAM_GATE = threading.BoundedSemaphore(max(1,min(2,int(CFG.get("upstream_workers",2) or 2))))
REFRESH = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cache-touch")
MAINTENANCE = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cache-maint")
LEGACY_CLEANUP_LOCK = threading.RLock()
LEGACY_CLEANUP_STATE = {"running":False,"last_run":0.0,"result":{"removed":0,"freed_bytes":0}}
UA = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/153 Safari/537.36 RPiMatome/0.1.236"
IMAGE_EXT_RE = re.compile(r"\.(?:jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])", re.I)
FEED_HINT_RE = re.compile(r"(?:\.rdf(?:$|[?#])|/feed/?(?:$|[?#])|[?&](?:xml|feed)(?:=|&|$)|new-soku\.net/new\.php|2chub\.sekaiwatch\.jp|matomeant\.com|owata-net\.com|ikioi\.jp)", re.I)


@contextmanager
def db_conn(initialize=False):
    c = sqlite3.connect(DB, timeout=30)
    try:
        c.execute("PRAGMA synchronous=NORMAL")
        if initialize:
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("""CREATE TABLE IF NOT EXISTS cache (
              url TEXT PRIMARY KEY, file_name TEXT NOT NULL, content_type TEXT,
              size INTEGER NOT NULL, fetched_at REAL NOT NULL,
              last_access REAL NOT NULL, final_url TEXT, kind TEXT NOT NULL
            )""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_cache_access ON cache(last_access)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_cache_kind ON cache(kind)")
        with c:
            yield c
    finally:
        c.close()

with db_conn(initialize=True) as _c: _c.commit()
FETCH_LOCKS = [threading.RLock() for _ in range(256)]
CACHE_LOCK_DIR = CACHE / "locks"
CACHE_LOCK_DIR.mkdir(parents=True, exist_ok=True)
CANCEL_LOCK = threading.RLock()
CANCEL_EVENTS = {}
CANCEL_EARLY = {}

@contextmanager
def cache_url_lock(url):
    digest=hashlib.sha256(url.encode("utf-8","ignore")).hexdigest()
    local=FETCH_LOCKS[int(digest[:8],16)%len(FETCH_LOCKS)]
    with local:
        fh=None
        try:
            try:
                import fcntl
                fh=(CACHE_LOCK_DIR/(digest+".lock")).open("a+b")
                fcntl.flock(fh.fileno(),fcntl.LOCK_EX)
            except Exception:
                if fh:
                    try:fh.close()
                    except Exception:pass
                    fh=None
            yield
        finally:
            if fh:
                try:
                    import fcntl
                    fcntl.flock(fh.fileno(),fcntl.LOCK_UN)
                except Exception:pass
                fh.close()

def register_cancel_event(rid):
    if not rid or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}",rid):return None
    ev=threading.Event();now=time.time()
    with CANCEL_LOCK:
        for key,until in list(CANCEL_EARLY.items()):
            if until<=now:CANCEL_EARLY.pop(key,None)
        if CANCEL_EARLY.pop(rid,0)>now:ev.set()
        CANCEL_EVENTS[rid]=ev
    return ev

def cancel_request(rid):
    if not rid or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}",rid):return False
    with CANCEL_LOCK:
        ev=CANCEL_EVENTS.get(rid)
        if ev:ev.set()
        else:CANCEL_EARLY[rid]=time.time()+30
    return True

def unregister_cancel_event(rid):
    if rid:
        with CANCEL_LOCK:CANCEL_EVENTS.pop(rid,None)


def classify(url, content_type=""):
    ct = (content_type or "").lower()
    if ct.startswith("image/") or IMAGE_EXT_RE.search(url or ""):
        return "image"
    if FEED_HINT_RE.search(url or ""):
        return "feed"
    return "text"


def fresh_seconds(kind):
    if kind == "image": return int(CFG["image_fresh_seconds"])
    if kind == "feed": return int(CFG["feed_fresh_seconds"])
    return int(CFG["article_fresh_seconds"])


def retention_seconds(kind):
    days = CFG["image_retention_days"] if kind == "image" else CFG["text_retention_days"]
    return float(days) * 86400


def cache_name(url):
    return hashlib.sha256(url.encode("utf-8", "ignore")).hexdigest() + ".bin"


def get_meta(url):
    with DB_LOCK, db_conn() as c:
        row = c.execute("SELECT url,file_name,content_type,size,fetched_at,last_access,final_url,kind FROM cache WHERE url=?", (url,)).fetchone()
        if not row: return None
        return dict(zip(["url","file_name","content_type","size","fetched_at","last_access","final_url","kind"], row))


def touch(url):
    with DB_LOCK, db_conn() as c:
        c.execute("UPDATE cache SET last_access=? WHERE url=?", (time.time(), url)); c.commit()


def save_cache(url, body, content_type, final_url, kind):
    name = cache_name(url)
    tmp = DATA / (name + "." + uuid.uuid4().hex + ".tmp")
    out = DATA / name
    try:
        with tmp.open("wb") as f:
            f.write(body);f.flush();os.fsync(f.fileno())
        os.replace(tmp, out)
    finally:
        tmp.unlink(missing_ok=True)
    now = time.time()
    with DB_LOCK, db_conn() as c:
        c.execute("INSERT OR REPLACE INTO cache(url,file_name,content_type,size,fetched_at,last_access,final_url,kind) VALUES(?,?,?,?,?,?,?,?)",
                  (url, name, content_type or "application/octet-stream", len(body), now, now, final_url or url, kind))
        c.commit()
    return {"url":url,"file_name":name,"content_type":content_type,"size":len(body),"fetched_at":now,"last_access":now,"final_url":final_url or url,"kind":kind}

def cache_entry_path(meta):
    if not meta:return None
    name=str(meta.get("file_name") or "")
    if not re.fullmatch(r"[a-f0-9]{64}\.bin",name):return None
    path=DATA/name
    try:
        if not path.is_file() or path.stat().st_size!=int(meta.get("size") or -1):return None
    except OSError:return None
    return path

def touch_if_needed(url, meta, now=None, interval=60):
    now=time.time() if now is None else now
    if now-float(meta.get("last_access") or 0)>=interval:touch(url)




def invalidate_cache(url):
    """Drop one raw-cache entry so a later retry is forced back to the origin."""
    name=None
    with DB_LOCK, db_conn() as c:
        row=c.execute("SELECT file_name FROM cache WHERE url=?",(url,)).fetchone()
        if row:
            name=row[0]
            c.execute("DELETE FROM cache WHERE url=?",(url,))
            c.commit()
    if name and re.fullmatch(r'[a-f0-9]{64}\.bin',str(name)):
        path=DATA/name
        try:
            if path.resolve().parent==DATA.resolve():path.unlink(missing_ok=True)
        except Exception:pass

def decode_transfer_limited(body, encoding, max_output):
    enc=(encoding or "").lower().strip()
    if not enc:
        if len(body)>max_output:raise ValueError("展開後サイズの上限を超えました")
        return body
    def run(wbits):
        d=zlib.decompressobj(wbits);parts=[];total=0
        for i in range(0,len(body),64*1024):
            chunk=d.decompress(body[i:i+64*1024],max_output-total+1)
            total+=len(chunk)
            if total>max_output:raise ValueError("展開後サイズの上限を超えました")
            parts.append(chunk)
        tail=d.flush(max_output-total+1);total+=len(tail)
        if total>max_output:raise ValueError("展開後サイズの上限を超えました")
        parts.append(tail);return b"".join(parts)
    if "gzip" in enc:return run(16+zlib.MAX_WBITS)
    if "deflate" in enc:
        try:return run(zlib.MAX_WBITS)
        except zlib.error:return run(-zlib.MAX_WBITS)
    if len(body)>max_output:raise ValueError("取得サイズの上限を超えました")
    return body

def _set_response_socket_timeout(response, seconds):
    for obj in (getattr(getattr(getattr(response,"fp",None),"raw",None),"_sock",None),
                getattr(getattr(response,"fp",None),"_sock",None)):
        if obj is not None:
            try:obj.settimeout(max(.2,float(seconds)));return
            except Exception:pass

def _read_response_limited(response, max_bytes, timeout, cancel_event=None):
    declared=int(response.headers.get("Content-Length") or 0)
    if declared and declared>max_bytes:raise ValueError("取得サイズの上限を超えました")
    deadline=time.monotonic()+max(.2,float(timeout))
    parts=[];total=0
    reader=getattr(response,"read1",None) or response.read
    while True:
        if cancel_event is not None and cancel_event.is_set():raise TimeoutError("取得が中止されました")
        remaining=deadline-time.monotonic()
        if remaining<=0:raise TimeoutError("取得全体がタイムアウトしました")
        _set_response_socket_timeout(response,min(3.0,remaining))
        try:chunk=reader(128*1024)
        except (TimeoutError,socket.timeout):
            if time.monotonic()>=deadline:raise TimeoutError("取得全体がタイムアウトしました")
            continue
        if not chunk:break
        total+=len(chunk)
        if total>max_bytes:raise ValueError("取得サイズの上限を超えました")
        parts.append(chunk)
    return b"".join(parts)

def _acquire_upstream_gate(timeout,cancel_event=None):
    deadline=time.monotonic()+max(.2,float(timeout))
    while True:
        if cancel_event is not None and cancel_event.is_set():raise TimeoutError("取得が中止されました")
        left=deadline-time.monotonic()
        if left<=0:raise TimeoutError("通信待ちがタイムアウトしました")
        if UPSTREAM_GATE.acquire(timeout=min(.25,left)):
            return deadline

def upstream(url, timeout=15, referer="", cancel_event=None):
    deadline=_acquire_upstream_gate(timeout,cancel_event)
    try:
        remaining=max(.2,deadline-time.monotonic())
        return _upstream(url, remaining, referer, cancel_event=cancel_event)
    finally:
        UPSTREAM_GATE.release()

def _upstream(url, timeout=15, referer="", cancel_event=None):
    if re.search(r"\.(?:mp4|webm|m4v|m3u8|mpd)(?:$|[?#])",url,re.I) or urllib.parse.urlparse(url).hostname=="video.twimg.com":
        raise ValueError("動画本体は再生時ストリーミング専用です")
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.4",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
    }
    if referer:headers["Referer"] = referer
    req=urllib.request.Request(url,headers=headers)
    start=time.monotonic()
    with urllib.request.urlopen(req,timeout=max(.2,float(timeout))) as r:
        ct=r.headers.get("Content-Type") or "application/octet-stream"
        if ct.lower().startswith("video/"):raise ValueError("動画本体は永続キャッシュしません")
        kind=classify(r.geturl() or url,ct)
        raw_limit=(int(CFG.get("prepare_max_media_mb",256))*1024**2 if kind=="image"
                   else int(CFG.get("upstream_text_max_mb",32))*1024**2)
        left=max(.2,float(timeout)-(time.monotonic()-start))
        raw=_read_response_limited(r,raw_limit,left,cancel_event)
        decoded_limit=raw_limit if kind=="image" else max(raw_limit,64*1024**2)
        body=decode_transfer_limited(raw,r.headers.get("Content-Encoding"),decoded_limit)
        return body,ct,r.geturl() or url


def schedule_refresh(url, timeout=15):
    # Candidate discovery refreshes feeds explicitly; completed articles are immutable.
    return


def get_cached_or_fetch(url, force=False, timeout=15, referer="", cancel_event=None):
    if not re.match(r"^https?://", url or "", re.I): raise ValueError("http/https URL only")
    meta=get_meta(url);now=time.time()
    path=cache_entry_path(meta)
    if meta and path and not force and now-float(meta["last_access"])<=retention_seconds(meta["kind"]):
        touch_if_needed(url,meta,now)
        age=now-float(meta["fetched_at"])
        if age>fresh_seconds(meta["kind"]):
            schedule_refresh(url,timeout)
            return path.read_bytes(),meta,"STALE-HIT"
        return path.read_bytes(),meta,"HIT"
    if meta and not path:
        invalidate_cache(url);meta=None
    try:
        with cache_url_lock(url):
            if cancel_event is not None and cancel_event.is_set():raise TimeoutError("取得が中止されました")
            recent=get_meta(url);recent_path=cache_entry_path(recent)
            if recent and recent_path and float(recent["fetched_at"])>=now:
                touch_if_needed(url,recent)
                return recent_path.read_bytes(),recent,"HIT"
            body,ct,final_url=upstream(url,timeout=timeout,referer=referer,cancel_event=cancel_event)
            kind=classify(final_url or url,ct)
            meta=save_cache(url,body,ct,final_url,kind)
            return body,meta,"MISS"
    except Exception:
        if meta:
            path=cache_entry_path(meta)
            if path and now-float(meta["last_access"])<=retention_seconds(meta["kind"]):
                touch_if_needed(url,meta,now)
                return path.read_bytes(),meta,"STALE"
        raise



THUMB_MAP_LOCK = threading.RLock()

_THUMB_MAP = None

def load_thumb_map():
    global _THUMB_MAP
    with THUMB_MAP_LOCK:
        if _THUMB_MAP is None:
            data = load_snapshot("article_thumb_map")
            _THUMB_MAP = data if isinstance(data, dict) else {}
        return dict(_THUMB_MAP)

def purge_legacy_article_cache(active_items):
    """Delete obsolete raw article HTML in one bounded SQLite transaction.

    This compatibility cleanup used to open one SQLite connection per candidate on
    every /api/ready-list request.  Keep the same ownership rules, but batch the DB
    work and let the caller schedule it away from the response path.
    """
    snap=load_snapshot("article_list")
    if not isinstance(snap,dict) or not isinstance(snap.get("items"),list):
        return {"removed":0,"freed_bytes":0}
    keep={str(x.get("link") or "").strip() for x in (active_items or []) if isinstance(x,dict)}
    candidates=[];seen=set()
    for raw in snap.get("items") or []:
        if not isinstance(raw,dict):continue
        url=str(raw.get("link") or "").strip()
        if not url or url in keep or url in seen or not re.match(r"^https?://",url,re.I):continue
        seen.add(url);candidates.append(url)
    if not candidates:return {"removed":0,"freed_bytes":0}
    rows=[];deletable=[]
    # article_list is bounded, but chunk to stay below SQLite variable limits on old builds.
    with DB_LOCK,db_conn() as c:
        for off in range(0,len(candidates),400):
            chunk=candidates[off:off+400]
            marks=','.join('?' for _ in chunk)
            rows.extend(c.execute(f"SELECT url,file_name,size,kind FROM cache WHERE url IN ({marks})",chunk).fetchall())
        deletable=[r for r in rows if str(r[3] or '')!='image']
        if deletable:
            c.executemany("DELETE FROM cache WHERE url=?",[(r[0],) for r in deletable])
    removed=0;freed=0
    for url,name,size,kind in deletable:
        name=str(name or '')
        if re.fullmatch(r'[a-f0-9]{64}\.bin',name):
            path=DATA/name
            try:
                if path.resolve().parent==DATA.resolve():path.unlink(missing_ok=True)
            except Exception:
                pass
        removed+=1;freed+=max(0,int(size or 0))
    return {"removed":removed,"freed_bytes":freed}

def _legacy_cleanup_task(active_items):
    result={"removed":0,"freed_bytes":0}
    try:
        result=purge_legacy_article_cache(active_items)
    finally:
        with LEGACY_CLEANUP_LOCK:
            LEGACY_CLEANUP_STATE["running"]=False
            LEGACY_CLEANUP_STATE["last_run"]=time.monotonic()
            LEGACY_CLEANUP_STATE["result"]=dict(result)

def schedule_legacy_cleanup(active_items, interval=300.0):
    """Schedule legacy raw-cache cleanup without delaying list rendering."""
    now=time.monotonic()
    with LEGACY_CLEANUP_LOCK:
        current=dict(LEGACY_CLEANUP_STATE.get("result") or {"removed":0,"freed_bytes":0})
        if LEGACY_CLEANUP_STATE.get("running"):
            return current
        last=float(LEGACY_CLEANUP_STATE.get("last_run") or 0)
        if last and now-last<max(5.0,float(interval or 0)):
            return current
        LEGACY_CLEANUP_STATE["running"]=True
    try:
        MAINTENANCE.submit(_legacy_cleanup_task,[dict(x) for x in (active_items or []) if isinstance(x,dict)])
    except Exception:
        with LEGACY_CLEANUP_LOCK:LEGACY_CLEANUP_STATE["running"]=False
    return current


def save_article_thumb(article_url, thumb_url):
    global _THUMB_MAP
    article_url = str(article_url or "").strip()
    thumb_url = str(thumb_url or "").strip()
    if not article_url or not thumb_url: return
    with THUMB_MAP_LOCK:
        m = load_thumb_map()
        if m.get(article_url) == thumb_url: return
        m[article_url] = thumb_url
        # Keep this tiny and bounded to URLs that can still appear in the active list.
        if len(m) > 900:
            active = set(article_urls_from_snapshot(load_snapshot("article_list")))
            m = {k:v for k,v in m.items() if k in active}
        save_snapshot("article_thumb_map", m)
        _THUMB_MAP = m

def representative_image_from_html(text, base):
    # Prefer OG/Twitter images; fall back to the first real image-like asset.
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image(?::src)?["\']',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            u = urllib.parse.urljoin(base, html.unescape(m.group(1).strip()))
            if re.match(r'^https?://', u, re.I): return u
    p = AssetParser(base)
    try: p.feed(text)
    except Exception: pass
    return p.urls[0] if p.urls else ""

class AssetParser(html.parser.HTMLParser):
    """Collect image-like assets only. Never prefetch video/audio/script bodies."""
    IMG_DATA_ATTRS = ("src","data-src","data-original","data-lazy-src","data-lazy","data-echo")
    def __init__(self, base):
        super().__init__(convert_charrefs=True); self.base=base; self.urls=[]; self.seen=set()
    def add(self, raw):
        if not raw: return
        raw = raw.strip().split()[0]
        if raw.startswith(("data:","javascript:","#")): return
        u = urllib.parse.urljoin(self.base, raw)
        if not re.match(r"^https?://", u, re.I): return
        if u not in self.seen:
            self.seen.add(u); self.urls.append(u)
    def handle_starttag(self, tag, attrs):
        d = dict(attrs); tag = (tag or "").lower()
        if tag == "img":
            for k in self.IMG_DATA_ATTRS: self.add(d.get(k))
            for k in ("srcset","data-srcset"):
                if d.get(k):
                    for piece in d[k].split(","): self.add(piece.strip().split()[0])
        elif tag == "video":
            self.add(d.get("poster"))
        elif tag == "source":
            typ=(d.get("type") or "").lower(); raw=d.get("src") or ""
            if typ.startswith("image/") or IMAGE_EXT_RE.search(raw): self.add(raw)
            if typ.startswith("image/") and d.get("srcset"):
                for piece in d["srcset"].split(","): self.add(piece.strip().split()[0])
        elif tag == "a":
            href=d.get("href") or ""
            if IMAGE_EXT_RE.search(href): self.add(href)
        elif tag == "meta":
            prop=(d.get("property") or d.get("name") or "").lower()
            if prop in ("og:image","twitter:image","twitter:image:src"): self.add(d.get("content"))


def decode_html(body, content_type):
    m = re.search(r"charset\s*=\s*[\"']?([^;\"'\s]+)", content_type or "", re.I)
    candidates = [m.group(1)] if m else []
    head = body[:8192].decode("latin1", "ignore")
    mm = re.search(r"<meta[^>]+charset\s*=\s*[\"']?([^\"'\s/>]+)", head, re.I)
    if mm: candidates.append(mm.group(1))
    candidates += ["utf-8","shift_jis","cp932"]
    for enc in candidates:
        try: return body.decode(enc.replace("shift-jis","shift_jis"))
        except Exception: pass
    return body.decode("utf-8", "replace")


def article_urls_from_snapshot(payload):
    if not isinstance(payload, dict): return []
    items=payload.get("items") or []
    disabled=disabled_sources_from_prefs()
    rows=[]
    for i,item in enumerate(items):
        if not isinstance(item, dict): continue
        if str(item.get("source") or "") in disabled: continue
        url=str(item.get("link") or "")
        if not re.match(r"^https?://", url, re.I): continue
        try: ts=float(item.get("timestamp") or 0)
        except Exception: ts=0
        rows.append((-ts, i, url))
    rows.sort()
    return [x[2] for x in rows]


def cleanup_cache():
    # v0.1.35: explicit user requirement. No automatic or API-triggered cache deletion.
    return 0, 0


def _dir_bytes(path):
    total=0
    try:
        for p in Path(path).iterdir():
            try:
                if p.is_file():total+=p.stat().st_size
            except OSError:pass
    except OSError:pass
    return total

def stats():
    with DB_LOCK, db_conn() as c:
        raw,count=c.execute("SELECT COALESCE(SUM(size),0),COUNT(*) FROM cache").fetchone()
        by={r[0]:{"count":r[1],"bytes":r[2] or 0} for r in c.execute("SELECT kind,COUNT(*),COALESCE(SUM(size),0) FROM cache GROUP BY kind")}
    prepared_assets=int(READY.asset_bytes() or 0)
    prepared_bodies=_dir_bytes(READY.bodies)
    mobile=_dir_bytes(MOBILE_IMAGE_DIR)
    raw=int(raw or 0);total=raw+prepared_assets+prepared_bodies+mobile
    # Compatibility: bytes/max_bytes describe the enforced prepared-media budget.  disk_bytes_total
    # separately exposes every managed cache byte so operators can see actual storage pressure.
    return {"bytes":prepared_assets,"count":int(count or 0),"raw_bytes":raw,"prepared_asset_bytes":prepared_assets,
            "prepared_body_bytes":prepared_bodies,"mobile_image_bytes":mobile,"disk_bytes_total":total,
            "capacity_reserved_bytes":READY.capacity_reserved_bytes(),
            "max_bytes":int(float(CFG["max_cache_gb"])*1024**3),"limit_scope":"prepared-assets-soft-with-turnover-reserve",
            "by_kind":by,"text_retention_days":CFG["text_retention_days"],"image_retention_days":CFG["image_retention_days"]}


def mobile_image_profile():
    return (max(320,min(1600,int(CFG.get("mobile_image_max_width",720) or 720))),
            max(35,min(92,int(CFG.get("mobile_image_quality",55) or 55))))

def build_mobile_variant(public, wait=True):
    try:
        original=READY.asset_path(public);original_size=original.stat().st_size
    except (ValueError,OSError):return None
    suffix=original.suffix.lower()
    if suffix in (".gif",".svg") or original_size<12*1024:return None
    width,quality=mobile_image_profile();source_hash=original.name.split('.',1)[0]
    cache=MOBILE_IMAGE_DIR/f"{source_hash}_w{width}_q{quality}.webp";skip=cache.with_suffix('.orig')
    if cache.is_file() or skip.is_file():return cache if cache.is_file() else None
    acquired=MOBILE_IMAGE_GATE.acquire(timeout=30 if wait else 0)
    if not acquired:return None
    try:
        lock=MOBILE_IMAGE_LOCKS[int(source_hash[:8],16)%len(MOBILE_IMAGE_LOCKS)]
        with lock:
            if cache.is_file() or skip.is_file():return cache if cache.is_file() else None
            try:
                from PIL import Image,ImageOps
                with Image.open(original) as image:
                    if getattr(image,"is_animated",False):skip.write_text('animated',encoding='ascii');return None
                    image=ImageOps.exif_transpose(image)
                    if image.width>width:
                        ratio=width/float(image.width);height=max(1,round(image.height*ratio))
                        image=image.resize((width,height),Image.Resampling.LANCZOS)
                    if image.mode not in ("RGB","RGBA"):
                        image=image.convert("RGBA" if "transparency" in image.info else "RGB")
                    out=io.BytesIO();image.save(out,"WEBP",quality=quality,method=4);body=out.getvalue()
                    if not body or len(body)>=original_size:skip.write_text('not-smaller',encoding='ascii');return None
                    tmp=cache.with_name(cache.name+'.'+uuid.uuid4().hex+'.tmp')
                    try:tmp.write_bytes(body);os.replace(tmp,cache)
                    finally:tmp.unlink(missing_ok=True)
                    return cache
            except Exception:
                try:skip.write_text('unsupported',encoding='ascii')
                except Exception:pass
                return None
    finally:
        MOBILE_IMAGE_GATE.release()



def instagram_post_info(raw_url):
    try:
        u=urllib.parse.urlparse(str(raw_url or '').strip())
        host=(u.hostname or '').lower().removeprefix('www.')
        if host!='instagram.com' and not host.endswith('.instagram.com'):
            return None
        m=re.match(r'^/(p|reel|tv)/([A-Za-z0-9_-]+)',u.path or '',re.I)
        if not m:return None
        kind=m.group(1).lower();post_id=m.group(2)
        return {'kind':kind,'id':post_id,'url':f'https://www.instagram.com/{kind}/{post_id}/'}
    except Exception:
        return None

class InstagramEmbedParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.images=[];self.meta=[]
    def handle_starttag(self,tag,attrs):
        a={str(k).lower():v for k,v in attrs if k}
        if tag.lower()=='meta':
            key=str(a.get('property') or a.get('name') or '').lower();val=str(a.get('content') or '')
            if key in ('og:image','og:image:secure_url','twitter:image','twitter:image:src') and val:self.meta.append(val)
        elif tag.lower()=='img':
            src=str(a.get('src') or '')
            cls=str(a.get('class') or '')
            if src and ('EmbeddedMediaImage' in cls or 'embeddedmediaimage' in cls.lower()):self.images.append(src)

def _instagram_image_from_html(body):
    text=body.decode('utf-8','replace') if isinstance(body,(bytes,bytearray)) else str(body or '')
    p=InstagramEmbedParser()
    try:p.feed(text)
    except Exception:pass
    candidates=list(p.images)+list(p.meta)
    patterns=[
        r'"display_url"\s*:\s*"(https?:\\/\\/[^"\\]+(?:\\.[^"\\]*)?)"',
        r'"displayUrl"\s*:\s*"(https?:\\/\\/[^"\\]+(?:\\.[^"\\]*)?)"',
        r'<img[^>]+class=["\'][^"\']*EmbeddedMediaImage[^"\']*["\'][^>]+src=["\']([^"\']+)',
    ]
    for pat in patterns:
        for m in re.finditer(pat,text,re.I):candidates.append(m.group(1))
    for raw in candidates:
        v=html.unescape(str(raw or '')).replace('\\/','/').replace('\\u0026','&')
        if v.startswith('https://') or v.startswith('http://'):
            if 'profile_pic' in v.lower() or 's150x150' in v.lower():continue
            return v
    return ''

def resolve_instagram_post(raw_url):
    info=instagram_post_info(raw_url)
    if not info:raise ValueError('bad instagram url')
    urls=[info['url']+'embed/captioned/',info['url']+'embed/',info['url']]
    last_error='image not found'
    for url in urls:
        try:
            body,meta,_=get_cached_or_fetch(url,force=False,timeout=15,referer='https://www.instagram.com/')
            image=_instagram_image_from_html(body)
            if image:return {'ok':True,'post_id':info['id'],'post_url':info['url'],'kind':info['kind'],'image_url':image}
        except Exception as e:last_error=str(e)
    return {'ok':False,'post_id':info['id'],'post_url':info['url'],'kind':info['kind'],'error':last_error}

class Handler(SimpleHTTPRequestHandler):
    server_version = "RPiMatome/0.1.236"
    protocol_version = "HTTP/1.1"
    def translate_path(self, path):
        # Static files are always under web/.
        parsed = urllib.parse.urlparse(path)
        rel = urllib.parse.unquote(parsed.path).lstrip("/") or "index.html"
        safe = os.path.normpath(rel).replace("\\","/")
        if safe.startswith("../") or safe == "..": safe = "index.html"
        return str(WEB / safe)
    def log_message(self, fmt, *args):
        path=urllib.parse.urlparse(self.path).path
        if path.startswith('/prepared/assets/') or path in ('/api/mobile-image','/api/ready-lease','/api/health'):
            return
        print(time.strftime("%Y-%m-%d %H:%M:%S"),self.client_address[0],fmt%args)
    def end_headers(self):
        parsed=urllib.parse.urlparse(self.path);path=parsed.path.lower()
        if not path.startswith(('/api/','/prepared/')):
            q=urllib.parse.parse_qs(parsed.query)
            if path.endswith(('.js','.css','.webmanifest')):
                # App code must never stay pinned across updates. Query-versioning remains as a
                # cache-buster, but always revalidate so a missed version bump cannot leave old JS.
                self.send_header("Cache-Control","no-cache, must-revalidate, max-age=0")
                self.send_header("Pragma","no-cache");self.send_header("Expires","0")
            else:
                self.send_header("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
                self.send_header("Pragma","no-cache");self.send_header("Expires","0")
        super().end_headers()
    def _json(self, obj, code=200, cache_control="no-store"):
        raw=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode("utf-8")
        body=raw;gz=False
        if len(raw)>=2048 and 'gzip' in (self.headers.get('Accept-Encoding') or '').lower():
            body=gzip.compress(raw,compresslevel=3);gz=True
        self.send_response(code);self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body)));self.send_header("Cache-Control",cache_control)
        if gz:self.send_header("Content-Encoding","gzip");self.send_header("Vary","Accept-Encoding")
        self.end_headers()
        if self.command!='HEAD':
            try:self.wfile.write(body)
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
    def do_GET(self):
        u=urllib.parse.urlparse(self.path)
        if u.path == "/api/video-stream": return relay_video(self,READY,u,UA)
        if u.path == "/api/video-warm": return warm_video(self,READY,u,UA)
        if u.path == "/api/cancel":
            rid=(urllib.parse.parse_qs(u.query).get("rid") or [""])[0]
            return self._json({"ok":cancel_request(rid)})
        if u.path == "/api/read-state":
            q=urllib.parse.parse_qs(u.query)
            try: since=float((q.get("since") or [0])[0] or 0)
            except Exception: since=0.0
            return self._json({"ok":True,**READY.shared_read_state(since)})
        if u.path == "/api/app-manifest":
            items=READY.app_manifest()
            total_bytes=sum(int(x.get('total_bytes') or 0) for x in items)
            return self._json({"ok":True,"api_version":1,"items":items,"checked_at":int(time.time()*1000),
                               "count":len(items),"total_bytes":total_bytes,"videos_cached":False})
        if u.path == "/api/app-article":
            q=urllib.parse.parse_qs(u.query)
            url=(q.get("url") or [""])[0]
            requested_rev=(q.get("rev") or [""])[0]
            article=READY.article(url)
            cache_info=READY.app_cache_info(url) if article else None
            if not article or not cache_info:
                return self._json({"ok":False,"error":"completed article unavailable"},404)
            if requested_rev and requested_rev != cache_info.get('revision'):
                return self._json({"ok":False,"error":"revision changed","revision":cache_info.get('revision')},409)
            for asset in cache_info.get('assets') or []:
                asset['mime']=mimetypes.guess_type(asset.get('path') or '')[0] or 'application/octet-stream'
            cc="private, max-age=86400, immutable" if requested_rev else "private, max-age=120"
            return self._json({"ok":True,"api_version":1,"article":article,"cache":cache_info},200,cc)
        if u.path == "/api/ready-list":
            ready_items = READY.list_ready()
            # v0.1.210: old raw-HTML compatibility cache is no longer part of the
            # public list. Purge only obsolete article HTML; keep the committed 500, visible new 300, and hidden standby intact.
            cleanup = schedule_legacy_cleanup(ready_items)
            return self._json({"ok":True,"items":ready_items,"checked_at":int(time.time()*1000),"preparation":READY.initial_progress(),"legacy_cached":0,"legacy_cleanup":cleanup})
        if u.path == "/api/ready-article":
            url=(urllib.parse.parse_qs(u.query).get("url") or [""])[0]
            article=READY.article(url)
            mobile_image={
                "enabled": bool(CFG.get("mobile_image_enabled", True)),
                "max_width": max(320,min(1600,int(CFG.get("mobile_image_max_width",720) or 720))),
                "quality": max(35,min(92,int(CFG.get("mobile_image_quality",55) or 55)))
            }
            rev=(urllib.parse.parse_qs(u.query).get("rev") or [""])[0]
            cc=("private, max-age=86400, immutable" if article and rev else "private, max-age=120" if article else "no-store")
            return self._json({"ok":bool(article),"article":article,"mobile_image":mobile_image},200 if article else 409,cc)
        if u.path == "/api/ready-lease":
            url=(urllib.parse.parse_qs(u.query).get("url") or [""])[0]
            return self._json({"ok":READY.lease(url)})
        if u.path == "/api/preparation-status": return self._json(READY.initial_progress())
        if u.path == "/api/standby-settings":
            return self._json({"ok":True,"standby_articles":READY.standby_target(),
                               "choices":list(STANDBY_CHOICES),"new_max":MAX_NEW_BUFFER})
        if u.path.startswith("/prepared/assets/"): return self.prepared_asset(u.path)
        if u.path == "/api/mobile-image": return self.mobile_image(u)
        if u.path == "/api/instagram-resolve":
            raw=(urllib.parse.parse_qs(u.query).get("url") or [""])[0]
            try:return self._json(resolve_instagram_post(raw),200)
            except ValueError as e:return self._json({"ok":False,"error":str(e)},400)
            except Exception as e:return self._json({"ok":False,"error":str(e)},502)
        if u.path == "/api/proxy": return self.api_proxy(u)
        if u.path == "/api/article-cache": return self.api_article_cache(u)
        if u.path == "/api/thumb": return self.api_thumb(u)
        if u.path == "/api/stats": return self._json(stats())
        if u.path == "/api/thumb-map": return self._json({"ok":True,"map":load_thumb_map()})
        if u.path == "/api/snapshot":
            q=urllib.parse.parse_qs(u.query); name=(q.get("name") or [""])[0]
            try: data=load_snapshot(name)
            except Exception: return self._json({"ok":False,"error":"bad name"},400)
            if data is None: return self._json({"ok":False,"error":"not found"},404)
            return self._json({"ok":True,"data":data})
        if u.path == "/api/health": return self._json({"ok":True,"version":"0.1.236","publication_mode":"ready-only","app_api":1})
        return super().do_GET()
    def do_HEAD(self):
        u=urllib.parse.urlparse(self.path)
        if u.path=="/api/video-stream": return relay_video(self,READY,u,UA)
        if u.path.startswith("/prepared/assets/"): return self.prepared_asset(u.path)
        if u.path == "/api/mobile-image": return self.mobile_image(u)
        return super().do_HEAD()

    def do_POST(self):
        u=urllib.parse.urlparse(self.path)
        n=int(self.headers.get("Content-Length") or 0)
        raw=self.rfile.read(min(n, 2_000_000)) if n else b""
        try: data=json.loads(raw.decode("utf-8")) if raw else {}
        except Exception: data={}
        if u.path == "/api/consume-new-buffer":
            return self._json({"ok":True,**READY.consume_new_buffer()})
        if u.path == "/api/release-standby":
            return self._json({"ok":True,**READY.release_waiting()})
        if u.path == "/api/ready-lease-batch":
            urls=data.get("urls") if isinstance(data.get("urls"),list) else []
            return self._json({"ok":True,**READY.lease_many(urls)})
        if u.path == "/api/standby-settings":
            try:n=int(data.get("standby_articles"))
            except Exception:return self._json({"ok":False,"error":"bad standby_articles"},400)
            if n not in STANDBY_CHOICES:
                return self._json({"ok":False,"error":"standby_articles must be 500..3000 by 500"},400)
            update_runtime_config({"standby_articles":n})
            applied=READY.set_standby_target(n)
            return self._json({"ok":True,"standby_articles":applied,"choices":list(STANDBY_CHOICES),"new_max":MAX_NEW_BUFFER})
        if u.path == "/api/reprepare":
            url=str(data.get("url") or "").strip()
            if not re.match(r"^https?://",url,re.I):return self._json({"ok":False,"error":"bad url"},400)
            # v0.1.99: reprepare means re-read the current article HTML.  Keeping the old raw
            # HTML made late-arriving Alfalfalfa comments stay at zero forever.
            try: invalidate_cache(url)
            except Exception: pass
            return self._json({"ok":READY.reprepare(url)})
        if u.path == "/api/read-state":
            incoming=[]
            if isinstance(data.get("url"),str): incoming.append(data.get("url"))
            if isinstance(data.get("urls"),list): incoming.extend(x for x in data.get("urls") if isinstance(x,str))
            return self._json({"ok":True,**READY.mark_shared_reads(incoming)})
        if u.path == "/api/snapshot":
            name=str(data.get("name") or "")
            payload=data.get("data")
            try:
                size=save_snapshot(name, payload)
                queued=0
                # Snapshot compatibility only. It never publishes or starts preparation.
                return self._json({"ok":True,"bytes":size,"prefetch_queued":queued,"prefetch_limit":min(MAX_PUBLISHED,max(1,int(CFG.get("prefetch_newest_articles",MAX_PUBLISHED))))})
            except Exception as e:
                return self._json({"ok":False,"error":str(e)},400)
        if u.path == "/api/prefetch":
            urls=[x for x in data.get("urls",[]) if isinstance(x,str) and re.match(r"^https?://",x,re.I)]
            # Compatibility endpoint: preparation is exclusively owned by prepare_worker.py.
            return self._json({"ok":True,"queued":0,"hot_queued":0,"requested":len(urls)})
        if u.path == "/api/cleanup":
            r,b=cleanup_cache(); return self._json({"ok":True,"removed":r,"freed_bytes":b,"stats":stats()})
        return self._json({"ok":False,"error":"not found"},404)
    def mobile_image(self, u):
        q=urllib.parse.parse_qs(u.query);public=(q.get("src") or [""])[0]
        try:original=READY.asset_path(public);original_size=original.stat().st_size
        except (ValueError,OSError):return self._json({"error":"mobile image source unavailable"},404)
        if not bool(CFG.get("mobile_image_enabled",True)):return self.prepared_asset(public)
        cache=build_mobile_variant(public,wait=True)
        if not cache or not cache.is_file():return self.prepared_asset(public)
        try:size=cache.stat().st_size
        except OSError:return self.prepared_asset(public)
        width,quality=mobile_image_profile()
        self.send_response(200);self.send_header("Content-Type","image/webp");self.send_header("Content-Length",str(size))
        self.send_header("Cache-Control","public, max-age=31536000, immutable")
        self.send_header("X-Original-Bytes",str(original_size));self.send_header("X-Mobile-Bytes",str(size))
        self.send_header("X-Mobile-Quality",str(quality));self.send_header("X-Mobile-Max-Width",str(width))
        self.send_header("X-Content-Type-Options","nosniff");self.end_headers()
        if self.command=='HEAD':return
        try:
            with cache.open('rb') as f:
                while True:
                    chunk=f.read(128*1024)
                    if not chunk:break
                    self.wfile.write(chunk)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass

    def prepared_asset(self, public):
        try:
            path=READY.asset_path(public)
            size=path.stat().st_size
        except (ValueError,OSError):
            return self._json({"error":"prepared asset unavailable"},404)
        start,end=0,size-1
        range_header=self.headers.get("Range", "")
        partial=False
        if range_header:
            match=re.fullmatch(r"bytes=(\d*)-(\d*)",range_header)
            if not match or not any(match.groups()): return self._json({"error":"bad range"},416)
            if match.group(1):
                start=int(match.group(1));end=min(end,int(match.group(2))) if match.group(2) else end
            else:
                start=max(0,size-int(match.group(2)))
            if start>=size or start>end:
                self.send_response(416);self.send_header("Content-Range",f"bytes */{size}");self.send_header("Content-Length","0");self.end_headers();return
            partial=True
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type",mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length",str(end-start+1))
        self.send_header("Cache-Control","public, max-age=31536000, immutable")
        self.send_header("Accept-Ranges","bytes")
        self.send_header("X-Content-Type-Options","nosniff")
        if partial:self.send_header("Content-Range",f"bytes {start}-{end}/{size}")
        self.end_headers()
        if self.command=='HEAD':return
        try:
            with path.open('rb') as f:
                f.seek(start);remaining=end-start+1
                while remaining:
                    chunk=f.read(min(256*1024,remaining))
                    if not chunk:break
                    self.wfile.write(chunk);remaining-=len(chunk)
        except (BrokenPipeError,ConnectionResetError):pass

    def api_article_cache(self, u):
        q = urllib.parse.parse_qs(u.query)
        url = (q.get("url") or [""])[0].strip()
        if not re.match(r"^https?://", url, re.I):
            return self._json({"ok":False,"error":"bad url"},400)
        meta = get_meta(url)
        if not meta or meta.get("kind") == "image":
            self.send_response(404); self.send_header("Content-Length","0"); self.send_header("Cache-Control","no-store"); self.end_headers(); return
        path = DATA / meta["file_name"]
        if not path.exists():
            self.send_response(404); self.send_header("Content-Length","0"); self.send_header("Cache-Control","no-store"); self.end_headers(); return
        # 操作中の表示を最優先。last_access更新は裏へ回してDB書込み待ちを避ける。
        try: REFRESH.submit(touch, url)
        except Exception: pass
        self.send_response(200)
        self.send_header("Content-Type", meta.get("content_type") or "text/html; charset=utf-8")
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("X-Upstream-URL", meta.get("final_url") or url)
        self.send_header("X-RPi-Cache", "HIT")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            with path.open("rb") as f:
                while True:
                    chunk=f.read(256*1024)
                    if not chunk: break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def api_thumb(self, u):
        q = urllib.parse.parse_qs(u.query)
        article = (q.get("article") or [""])[0].strip()
        if not re.match(r"^https?://", article, re.I):
            return self._json({"ok":False,"error":"bad article"},400)

        # Resolve the representative image using cached article HTML only.
        thumb_map = load_thumb_map()
        thumb = str(thumb_map.get(article) or "").strip()
        if not thumb:
            meta_article = get_meta(article)
            if meta_article and meta_article.get("kind") != "image":
                path_article = DATA / meta_article["file_name"]
                if path_article.exists():
                    try:
                        text = decode_html(path_article.read_bytes(), meta_article.get("content_type") or "")
                        thumb = representative_image_from_html(text, meta_article.get("final_url") or article)
                        if thumb:
                            save_article_thumb(article, thumb)
                    except Exception:
                        thumb = ""
        if not thumb:
            # Prepared list thumbnails are created by prepare_worker.py; the viewer
            # must never start a second background fetch path here.
            self.send_response(404)
            self.send_header("Content-Length","0")
            self.send_header("Cache-Control","no-store")
            self.send_header("Retry-After","1")
            self.send_header("X-RPi-Thumb", "ARTICLE-WARMING")
            self.end_headers()
            return

        meta = get_meta(thumb)
        if meta:
            path = DATA / meta["file_name"]
            if path.exists() and (meta.get("content_type") or "").lower().startswith("image/"):
                touch(thumb)
                self.send_response(200)
                self.send_header("Content-Type", meta.get("content_type") or "image/jpeg")
                self.send_header("Content-Length", str(path.stat().st_size))
                self.send_header("Cache-Control", "public, max-age=3600")
                self.send_header("X-RPi-Thumb", "HIT")
                self.end_headers()
                try:
                    with path.open("rb") as f:
                        while True:
                            chunk=f.read(256*1024)
                            if not chunk: break
                            self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return

        # Do not block page rendering. Warm it at high priority and let the browser retry.
        pass  # Prepared list thumbnails never use this legacy warming path.
        self.send_response(404)
        self.send_header("Content-Length","0")
        self.send_header("Cache-Control","no-store")
        self.send_header("Retry-After","1")
        self.send_header("X-RPi-Thumb", "WARMING")
        self.end_headers()

    def api_proxy(self, u):
        q=urllib.parse.parse_qs(u.query);url=(q.get("url") or [""])[0];rid=(q.get("rid") or [""])[0];referer=(q.get("referer") or [""])[0];force=(q.get("force") or ["0"])[0] in {"1","true","yes"}
        if not re.match(r"^https?://",url,re.I):return self._json({"ok":False,"error":"bad url"},400)
        if referer and not re.match(r"^https?://",referer,re.I): referer=""
        parsed=urllib.parse.urlparse(url);host=(parsed.hostname or '').lower()
        esuteru_comment=bool(re.search(r"(?:^|\.)esuteru\.com$",host,re.I) and "/comments/" in parsed.path)
        # force is intentionally honored only for Esuteru comment pages used by preparation.
        force=bool(force and esuteru_comment)
        cancel_event=register_cancel_event(rid)
        try:
            try:
                body,meta,state=get_cached_or_fetch(url,force=force,timeout=20,referer=referer,cancel_event=cancel_event)
            except Exception as first_err:
                # Some Esuteru comment pages reject Python urllib while accepting a normal curl request.
                # Keep this fallback strictly scoped to comment pages so other sites retain existing behavior.
                if not esuteru_comment: raise
                cmd=['curl','-sS','-L','--compressed','--max-time','20','--fail-with-body','-A',UA,'-H','Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','-H','Accept-Language: ja,en-US;q=0.7,en;q=0.4']
                if referer: cmd += ['-e',referer]
                cmd += [url]
                try:
                    cp=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=23,check=False)
                except Exception as curl_exc:
                    raise RuntimeError(f"urllib={first_err}; curl実行失敗={curl_exc}") from first_err
                if cp.returncode!=0 or not cp.stdout:
                    err=cp.stderr.decode('utf-8','replace').strip()[:500]
                    raise RuntimeError(f"urllib={first_err}; curl rc={cp.returncode}: {err}") from first_err
                body=bytes(cp.stdout);ct='text/html; charset=utf-8';meta=save_cache(url,body,ct,url,'text');state='CURL-MISS'
            self.send_response(200);self.send_header("Content-Type",meta.get("content_type") or "application/octet-stream")
            self.send_header("Content-Length",str(len(body)));self.send_header("X-Upstream-URL",meta.get("final_url") or url);self.send_header("X-RPi-Cache",state)
            self.send_header("Cache-Control","public, max-age=86400" if (meta.get("content_type") or "").lower().startswith("image/") else "no-store")
            self.end_headers();self.wfile.write(body)
        except urllib.error.HTTPError as e:self._json({"ok":False,"error":f"upstream HTTP {e.code}"},502)
        except Exception as e:self._json({"ok":False,"error":str(e)},502)
        finally:unregister_cancel_event(rid)


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--host",default="0.0.0.0"); ap.add_argument("--port",type=int,default=int(CFG["port"])); args=ap.parse_args()
    httpd=ThreadingHTTPServer((args.host,args.port),Handler)
    print(f"RPi Matome Server v0.1.236  http://{args.host}:{args.port}/")
    print(f"cache: text {CFG['text_retention_days']}d / image {CFG['image_retention_days']}d / max {CFG['max_cache_gb']}GB")
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass
    finally: httpd.server_close()

if __name__ == "__main__": main()
