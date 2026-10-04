#!/usr/bin/env python3
"""One background browser, one article at a time; no legacy prefetch pools."""
import base64
import json
import html
import os
import queue
import re
import shutil
import signal
import subprocess
import tempfile
import uuid
import threading
import time
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import server

STORE = server.READY
MAX_MEDIA = int(server.CFG.get('prepare_max_media_mb', 256))*1024**2

def configured_sources():
    try:
        text=(server.WEB/'index.js').read_text(encoding='utf-8')
        return set(re.findall(r'\{ name: "([^"]+)", url: "[^"]+" \}', text))
    except Exception:
        return set()

DOWNLOAD_GATE = server.UPSTREAM_GATE
DOWNLOAD_LOCKS = [threading.Lock() for _ in range(64)]

# Instagram embeds normally contain only a blockquote/permalink in the matome HTML.
# The post image appears only after Instagram's JavaScript renders the official embed.
# Resolve that image once in the preparation Chromium, then let prepare_snapshot.js
# persist it through the normal local prepared-asset cache.
INSTAGRAM_RESOLVED = {}
INSTAGRAM_RESOLVE_LOCK = threading.RLock()
INSTAGRAM_POST_LOCKS = {}
_ORIGINAL_INSTAGRAM_RESOLVER = server.resolve_instagram_post

def _instagram_lock(post_id):
    with INSTAGRAM_RESOLVE_LOCK:
        return INSTAGRAM_POST_LOCKS.setdefault(post_id, threading.Lock())

def _worker_instagram_resolver(raw_url):
    info=server.instagram_post_info(raw_url)
    if not info:
        raise ValueError('bad instagram url')
    with INSTAGRAM_RESOLVE_LOCK:
        cached=INSTAGRAM_RESOLVED.get(info['id'])
    if cached and cached.get('ok') and cached.get('image_url'):
        return dict(cached)
    # Do not block article preparation on Instagram network access.  If the
    # optional prefetch did not resolve the image, publish a post descriptor and
    # let the viewer render the official Instagram embed at view time.
    return {'ok':False,'post_id':info['id'],'post_url':info['url'],'kind':info['kind'],'error':'viewer fallback'}

# server.Handler resolves this global from the server module at request time.  This
# process-local replacement does not affect the normal viewer service process.
server.resolve_instagram_post = _worker_instagram_resolver

def _instagram_urls_from_article(article_url):
    try:
        body,meta,_=server.get_cached_or_fetch(article_url,force=False,timeout=20)
        text=body.decode('utf-8','replace')
    except Exception:
        return []
    if 'instagram' not in text.lower():
        return []
    text=html.unescape(text.replace('\\/','/').replace('\\u0026','&'))
    candidates=[]
    patterns=(
        r'''data-instgrm-permalink=["']([^"']+)''',
        r'''href=["']([^"']*instagram\.com/(?:p|reel|tv)/[^"']+)''',
        r'''https?://(?:www\.)?instagram\.com/(?:p|reel|tv)/[A-Za-z0-9_-]+/?''',
    )
    for pat in patterns:
        for m in re.finditer(pat,text,re.I):
            raw=m.group(1) if m.lastindex else m.group(0)
            info=server.instagram_post_info(raw)
            if info and info['url'] not in candidates:
                candidates.append(info['url'])
    return candidates[:8]

def _prime_instagram_for_job(browser, article_url):
    if not bool(server.CFG.get('instagram_prefetch_enabled', True)):
        return
    for post_url in _instagram_urls_from_article(article_url):
        info=server.instagram_post_info(post_url)
        if not info:
            continue
        with _instagram_lock(info['id']):
            with INSTAGRAM_RESOLVE_LOCK:
                cached=INSTAGRAM_RESOLVED.get(info['id'])
            if cached and cached.get('ok') and cached.get('image_url'):
                continue
            try:
                resolved=browser.resolve_instagram(post_url)
            except Exception as e:
                resolved={'ok':False,'post_id':info['id'],'post_url':info['url'],'kind':info['kind'],'error':str(e)}
            if resolved and resolved.get('ok') and resolved.get('image_url'):
                with INSTAGRAM_RESOLVE_LOCK:
                    INSTAGRAM_RESOLVED[info['id']]=resolved


def background_upstream(url, timeout=30, referer='', cancel_event=None):
    if re.search(r'\.(?:mp4|webm|m4v|m3u8|mpd)(?:$|[?#])',url,re.I) or urllib.parse.urlparse(url).hostname=='video.twimg.com':
        raise ValueError('動画本体は再生時のみ取得します')
    headers={'User-Agent':server.UA,'Accept':'*/*','Accept-Encoding':'identity'}
    if referer:headers['Referer']=referer
    request=urllib.request.Request(url,headers=headers)
    start=time.monotonic()
    with urllib.request.urlopen(request,timeout=max(.2,float(timeout))) as response:
        if (response.headers.get('Content-Type') or '').lower().startswith('video/'):
            raise ValueError('動画本体は準備キャッシュに保存しません')
        declared=int(response.headers.get('Content-Length') or 0)
        if declared>MAX_MEDIA:raise ValueError('メディア上限を超えました。非公開で保留します')
        remaining=max(.2,float(timeout)-(time.monotonic()-start))
        body=server._read_response_limited(response,MAX_MEDIA,remaining,cancel_event)
        if len(body)>MAX_MEDIA:raise ValueError('取得サイズの上限を超えました')
        # Optional background bandwidth shaping.  A larger default than v0.1.46 keeps preparation
        # fast while Nice/CPUWeight and the shared network gate preserve viewer responsiveness.
        mbps=max(.1,float(server.CFG.get('prepare_download_mbps',4) or 4))
        elapsed=max(.001,time.monotonic()-start);target=len(body)/(mbps*1024**2)
        if target>elapsed:time.sleep(min(target-elapsed,2.0))
        return body,response.headers.get('Content-Type') or 'application/octet-stream',response.geturl()


# Shared raw cache and single-flight locks prevent duplicate image downloads from DOM probes.
# Only this background process is throttled; the viewing server is unaffected.
server._upstream=background_upstream


def maintain_completed():
    urls=list(dict.fromkeys(STORE.maintain_if_due(0)))
    if not urls:return
    # Only URLs explicitly owned by retired completed articles are eligible.
    # Batch raw-cache DB work instead of opening one SQLite connection per URL.
    rows=[]
    with server.DB_LOCK,server.db_conn() as c:
        for off in range(0,len(urls),400):
            chunk=urls[off:off+400]
            marks=','.join('?' for _ in chunk)
            rows.extend(c.execute(f'SELECT url,file_name FROM cache WHERE url IN ({marks})',chunk).fetchall())
        c.executemany('DELETE FROM cache WHERE url=?',[(url,) for url in urls])
    for url,name in rows:
        name=str(name or '')
        if not re.fullmatch(r'[a-f0-9]{64}\.bin',name):
            continue
        path=server.DATA/name
        try:
            if path.resolve().parent==server.DATA.resolve():path.unlink(missing_ok=True)
        except Exception:
            pass
    # A malformed/old raw-cache filename used to leave raw_gc stuck forever because
    # the loop continued before acknowledgement. The DB mapping is gone either way.
    STORE.acknowledge_raw_gc(urls)


def _validate_image_bytes(body,mime):
    """Reject cached HTML/error payloads and corrupt common image formats before persistence."""
    mime=(mime or '').split(';',1)[0].strip().lower()
    head=(body[:1024] if body else b'').lstrip().lower()
    if (head.startswith(b'<!doctype html') or head.startswith(b'<html') or
            head.startswith(b'<?xml') and mime not in ('image/svg+xml',) or
            mime.startswith('text/') or mime in ('application/json','application/problem+json')):
        raise ValueError('画像URLがHTML/エラー応答を返しました')
    if not mime.startswith('image/'):
        raise ValueError('必要メディアの種別が不正です: '+mime)
    if mime=='image/svg+xml':
        if b'<svg' not in head[:1024]:raise ValueError('SVG画像の内容が不正です')
        return
    # Pillow reliably validates these formats on the installed Pi image. AVIF is allowed to pass
    # the MIME/signature gate because support depends on the distro Pillow build.
    if mime in ('image/jpeg','image/png','image/gif','image/webp','image/bmp'):
        import io
        from PIL import Image
        try:
            with Image.open(io.BytesIO(body)) as im:
                im.verify()
        except Exception as e:
            raise ValueError('画像データが破損しています') from e


def _prepared_asset_valid(existing):
    try:
        path=STORE.asset_path(existing.get('path') or '')
        body=path.read_bytes()
        _validate_image_bytes(body,existing.get('mime') or '')
        return True
    except Exception:
        return False

def cache_media(url, kind, article=''):
    if kind!='image':raise ValueError('動画・音声本体は永続保存しません')
    import hashlib
    with DOWNLOAD_LOCKS[int(hashlib.sha256(url.encode()).hexdigest()[:8],16)%64]:
        existing=STORE.known_asset(url,article)
        # v0.1.183: HeartLog historically used a static JPG thumbnail inside a link to
        # the real .gif.  If an older build ever associated that .gif source URL with
        # a JPEG prepared asset, ordinary validity checks consider the JPEG healthy and
        # every later reprepare keeps reusing the wrong still image.  For HeartLog .gif
        # sources, require both GIF MIME and GIF87a/GIF89a bytes before reuse.
        heartlog_gif = False
        try:
            ap=urllib.parse.urlparse(article or '')
            up=urllib.parse.urlparse(url or '')
            heartlog_gif=((ap.hostname or '').lower()=='blog.livedoor.jp' and
                          ap.path.startswith('/love120331/') and
                          up.path.lower().endswith('.gif'))
        except Exception:
            heartlog_gif=False
        if existing and heartlog_gif:
            try:
                ep=STORE.asset_path(existing.get('path') or '')
                eb=ep.read_bytes()
                em=(existing.get('mime') or '').split(';',1)[0].strip().lower()
                if em!='image/gif' or eb[:6] not in (b'GIF87a',b'GIF89a'):
                    STORE.forget_asset_source(url)
                    existing=None
            except Exception:
                STORE.forget_asset_source(url)
                existing=None
        if existing and _prepared_asset_valid(existing):
            return existing
        if existing:
            # A broken prepared mapping must not poison every future retry.
            STORE.forget_asset_source(url)
        if url.startswith('data:'):
            header,payload=url.split(',',1)
            mime=header[5:].split(';')[0]
            body=base64.b64decode(payload,validate=True) if ';base64' in header else urllib.parse.unquote_to_bytes(payload)
            _validate_image_bytes(body,mime)
        else:
            parsed=urllib.parse.urlparse(url)
            if parsed.scheme not in ('http','https'):
                raise ValueError('unsupported media URL')
            # Cached non-images/corrupt images get exactly one forced origin retry, and a failed
            # retry is removed again so the next article attempt is not permanently poisoned.
            last=None
            for attempt in range(2):
                parsed_host=(urllib.parse.urlparse(url).hostname or '').lower()
                media_referer='https://www.instagram.com/' if (parsed_host.endswith('cdninstagram.com') or parsed_host.endswith('fbcdn.net')) else ''
                body,meta,_=server.get_cached_or_fetch(url,force=bool(attempt),timeout=30,referer=media_referer)
                mime=(meta.get('content_type') or '').split(';')[0].lower()
                if heartlog_gif and body[:6] in (b'GIF87a',b'GIF89a'):
                    mime='image/gif'
                try:
                    _validate_image_bytes(body,mime)
                    last=None;break
                except Exception as e:
                    last=e;server.invalidate_cache(url)
            if last is not None:raise last
        if len(body)>MAX_MEDIA:raise ValueError('メディア上限を超えました')
        if shutil.disk_usage(STORE.root).free < len(body)+256*1024**2:
            raise ValueError('空き容量不足のため準備を保留します')
        limit=int(float(server.CFG.get('max_cache_gb',10))*1024**3)
        reserve=int(float(server.CFG.get('turnover_reserve_mb',768) or 768)*1024**2)
        token=STORE.reserve_asset_capacity(len(body),limit,reserve)
        if not token:
            raise ValueError('完成メディアの容量上限＋入替予約領域に達したため準備を保留します')
        try:
            return STORE.save_asset(body,mime,url,article)
        finally:
            STORE.release_asset_capacity(token)


class PreparationHandler(server.Handler):
    def log_message(self,*args):
        pass

    def api_article_cache(self,u):
        url=(urllib.parse.parse_qs(u.query).get('url') or [''])[0]
        meta=server.get_meta(url)
        if meta and time.time()-meta['fetched_at']>server.fresh_seconds(meta['kind']):
            return self._json({'error':'refresh required'},404)
        return super().api_article_cache(u)

    def api_proxy(self,u):
        q=urllib.parse.parse_qs(u.query)
        url=(q.get('url') or [''])[0]
        rid=(q.get('rid') or [''])[0]
        referer=(q.get('referer') or [''])[0]
        force=(q.get('force') or ['0'])[0] in {'1','true','yes'}
        if not re.match(r'^https?://',url,re.I):
            return self._json({'ok':False,'error':'bad url'},400)
        if referer and not re.match(r'^https?://',referer,re.I):
            referer=''
        parsed=urllib.parse.urlparse(url)
        host=(parsed.hostname or '').lower()
        esuteru_comment=bool(re.search(r'(?:^|\.)esuteru\.com$',host,re.I) and '/comments/' in parsed.path)
        # v0.1.135: preparation Chromium must honor the same Esuteru comment
        # force/referer path as the normal server.  v0.1.133 accidentally ignored both.
        force=bool(force and esuteru_comment)
        cancel_event=server.register_cancel_event(rid)
        try:
            try:
                old=server.get_meta(url)
                stale=bool(old and time.time()-old['fetched_at']>server.fresh_seconds(old['kind']))
                body,meta,state=server.get_cached_or_fetch(
                    url,force=(force or bool(server.FEED_HINT_RE.search(url)) or stale),
                    timeout=25,referer=referer,cancel_event=cancel_event)
            except Exception as first_err:
                # Some Esuteru comment endpoints fail certificate verification or reject urllib.
                # v0.1.135: --insecure is intentionally limited to this Esuteru /comments/ fallback.
                # Keep fallback strictly limited to Esuteru /comments/ pages.
                if not esuteru_comment:
                    raise
                cmd=['curl','-sS','-L','--compressed','--max-time','20','--fail-with-body','--insecure',
                     '-A',server.UA,
                     '-H','Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                     '-H','Accept-Language: ja,en-US;q=0.7,en;q=0.4']
                if referer:
                    cmd += ['-e',referer]
                cmd += [url]
                try:
                    cp=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=23,check=False)
                except Exception as curl_exc:
                    raise RuntimeError(f'urllib={first_err}; curl実行失敗={curl_exc}') from first_err
                if cp.returncode!=0 or not cp.stdout:
                    err=cp.stderr.decode('utf-8','replace').strip()[:500]
                    raise RuntimeError(f'urllib={first_err}; curl rc={cp.returncode}: {err}') from first_err
                body=bytes(cp.stdout)
                ct='text/html; charset=utf-8'
                meta=server.save_cache(url,body,ct,url,'text')
                state='CURL-MISS'
                print('ESUTERU_PROXY_CURL '+json.dumps({
                    'url':url,'referer':referer,'bytes':len(body),'state':state
                },ensure_ascii=False,separators=(',',':')),flush=True)
            self.send_response(200)
            self.send_header('Content-Type',meta.get('content_type') or 'application/octet-stream')
            self.send_header('Content-Length',str(len(body)))
            self.send_header('X-Upstream-URL',meta.get('final_url') or url)
            self.send_header('X-RPi-Cache',state)
            self.send_header('Cache-Control','no-store')
            self.end_headers();self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            if esuteru_comment:
                print('ESUTERU_PROXY_ERROR '+json.dumps({
                    'url':url,'referer':referer,'force':force,'error':str(e)[:1000]
                },ensure_ascii=False,separators=(',',':')),flush=True)
            try:self._json({'ok':False,'error':str(e)},502)
            except (BrokenPipeError, ConnectionResetError):pass
        finally:
            server.unregister_cancel_event(rid)

    def do_POST(self):
        if self.path=='/api/prepare-asset':
            try:
                length=int(self.headers.get('Content-Length') or 0)
                if length<=0 or length>MAX_MEDIA*2:raise ValueError('invalid asset request size')
                data=json.loads(self.rfile.read(length))
                result=cache_media(str(data.get('url') or ''),str(data.get('kind') or 'image'),str(data.get('article') or ''))
                return self._json(result)
            except Exception as e:
                return self._json({'error':str(e)},422)
        # Worker browser never writes old list snapshots or triggers another pool.
        return self._json({'ok':False,'error':'preparation browser is read-only'},405)


# Selenium is intentionally a single global session. HTTP/media fetches use
# ThreadingHTTPServer + server.UPSTREAM_GATE independently and are not blocked by
# this lease. This prevents a backlog from spawning multiple Chromedriver/
# Chromium trees on 4 GB Raspberry Pi systems.
SELENIUM_SESSION_GATE=threading.BoundedSemaphore(1)
SELENIUM_STATE_LOCK=threading.RLock()
SELENIUM_ACTIVE_COUNT=0
SELENIUM_TMP_ROOT=Path('/tmp')
SELENIUM_CHROME_PREFIX='rpi-matome-chrome-'
SELENIUM_META_PREFIX='rpi-matome-selenium-'
_SWAP_SAMPLE={'ts':0.0,'pswpout':0,'rate':0.0}

class SeleniumDeferred(RuntimeError):
    pass


def _selenium_log(event, **payload):
    payload={k:v for k,v in payload.items() if v is not None}
    print(event+' '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)


def _selenium_active_delta(delta, session=''):
    global SELENIUM_ACTIVE_COUNT
    with SELENIUM_STATE_LOCK:
        SELENIUM_ACTIVE_COUNT=max(0,SELENIUM_ACTIVE_COUNT+int(delta))
        active=SELENIUM_ACTIVE_COUNT
    _selenium_log('SELENIUM_ACTIVE_COUNT',active=active,session=session)
    if active>1:
        with SELENIUM_STATE_LOCK:
            SELENIUM_ACTIVE_COUNT=max(0,SELENIUM_ACTIVE_COUNT-1)
        _selenium_log('SELENIUM_ACTIVE_COUNT',active=SELENIUM_ACTIVE_COUNT,session=session,reason='rollback-active-overflow')
        raise RuntimeError('SELENIUM_ACTIVE_COUNT > 1 を検出しました')
    return active


def _proc_cmdline(pid):
    try:
        return Path(f'/proc/{int(pid)}/cmdline').read_bytes().replace(b'\0',b' ').decode('utf-8','replace')
    except Exception:
        return ''


def _proc_exe(pid):
    try:return os.path.realpath(f'/proc/{int(pid)}/exe')
    except Exception:return ''


def _is_chromium_exe(pid):
    name=os.path.basename(_proc_exe(pid)).lower()
    return name in ('chromium','chromium-browser','chrome','google-chrome','chrome-headless-shell') or name.startswith('chromium')


def _proc_ppid(pid):
    try:
        text=Path(f'/proc/{int(pid)}/stat').read_text(errors='ignore')
        right=text.rsplit(')',1)[1].strip().split()
        return int(right[1])
    except Exception:
        return 0


def _descendant_pids(root_pid):
    root_pid=int(root_pid or 0)
    if root_pid<=1:return set()
    children={}
    try:
        pids=[int(x.name) for x in Path('/proc').iterdir() if x.name.isdigit()]
    except Exception:
        pids=[]
    for pid in pids:
        pp=_proc_ppid(pid)
        if pp:children.setdefault(pp,[]).append(pid)
    out=set();stack=list(children.get(root_pid,[]))
    while stack:
        pid=stack.pop()
        if pid in out:continue
        out.add(pid);stack.extend(children.get(pid,[]))
    return out


def _marker_pids(user_data_dir):
    marker=str(user_data_dir or '')
    if not marker:return set()
    out=set()
    try:
        pids=[int(x.name) for x in Path('/proc').iterdir() if x.name.isdigit()]
    except Exception:
        pids=[]
    for pid in pids:
        cmd=_proc_cmdline(pid)
        low=cmd.lower()
        # Marker alone is not enough. Only Chromium/Chrome processes owned by
        # this unique user-data-dir are eligible; shells/tools mentioning the
        # path are never killed.
        is_chrome=_is_chromium_exe(pid) and 'chromedriver' not in low
        if marker in cmd and is_chrome:out.add(pid)
    return out


def _signal_pids(pids, sig):
    for pid in sorted({int(x) for x in pids if int(x)>1},reverse=True):
        try:os.kill(pid,sig)
        except (ProcessLookupError,PermissionError):pass
        except Exception:pass


def _kill_owned_session_processes(driver_pid, user_data_dir, session_id='', reason='cleanup'):
    """Kill only this RPi_Matome Selenium session, never unrelated Chromium."""
    driver_pid=int(driver_pid or 0)
    pids=set()
    if driver_pid>1:
        cmd=_proc_cmdline(driver_pid).lower()
        if 'chromedriver' in cmd:
            pids.add(driver_pid)
            pids.update(_descendant_pids(driver_pid))
    pids.update(_marker_pids(user_data_dir))
    if not pids:return 0
    _selenium_log('SELENIUM_FORCE_CLEANUP',session=session_id,reason=reason,pids=sorted(pids))
    _signal_pids(pids,signal.SIGTERM)
    deadline=time.monotonic()+2.0
    while time.monotonic()<deadline:
        alive={pid for pid in pids if Path(f'/proc/{pid}').exists()}
        if not alive:break
        time.sleep(.1)
    alive={pid for pid in pids if Path(f'/proc/{pid}').exists()}
    if alive:_signal_pids(alive,signal.SIGKILL)
    return len(pids)


def _write_session_meta(path, data):
    try:
        tmp=Path(str(path)+'.tmp')
        tmp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        tmp.replace(path)
    except Exception:pass


def cleanup_stale_selenium_sessions():
    """Remove only sessions proven by RPi_Matome PID metadata/user-data-dir markers."""
    cleaned=0
    for meta in SELENIUM_TMP_ROOT.glob(SELENIUM_META_PREFIX+'*.json'):
        try:data=json.loads(meta.read_text(encoding='utf-8'))
        except Exception:data={}
        userdir=str(data.get('user_data_dir') or '')
        dpid=int(data.get('driver_pid') or 0)
        sid=str(data.get('session') or meta.stem)
        if userdir and Path(userdir).name.startswith(SELENIUM_CHROME_PREFIX):
            cleaned+=_kill_owned_session_processes(dpid,userdir,sid,'startup-stale-session')
            shutil.rmtree(userdir,ignore_errors=True)
        try:meta.unlink()
        except Exception:pass
    for d in SELENIUM_TMP_ROOT.glob(SELENIUM_CHROME_PREFIX+'*'):
        if not d.is_dir():continue
        cleaned+=_kill_owned_session_processes(0,str(d),d.name,'startup-orphan-marker')
        shutil.rmtree(d,ignore_errors=True)
    if cleaned:_selenium_log('SELENIUM_FORCE_CLEANUP',reason='startup-summary',count=cleaned)


def _swap_status():
    try:text=Path('/proc/meminfo').read_text()
    except Exception:return {'swap_total_mb':0,'swap_used_mb':0,'swap_used_pct':0.0}
    def val(name):
        m=re.search(r'^'+re.escape(name)+r':\s+(\d+)\s+kB',text,re.M)
        return int(m.group(1))//1024 if m else 0
    total=val('SwapTotal');free=val('SwapFree');used=max(0,total-free)
    return {'swap_total_mb':total,'swap_used_mb':used,'swap_used_pct':round((used*100.0/total) if total else 0.0,1)}


def _swapout_rate_pages():
    now=time.monotonic();current=0
    try:
        text=Path('/proc/vmstat').read_text()
        m=re.search(r'^pswpout\s+(\d+)',text,re.M);current=int(m.group(1)) if m else 0
    except Exception:return 0.0
    with SELENIUM_STATE_LOCK:
        prev_ts=float(_SWAP_SAMPLE.get('ts') or 0);prev=int(_SWAP_SAMPLE.get('pswpout') or 0)
        rate=float(_SWAP_SAMPLE.get('rate') or 0.0)
        if prev_ts and now>prev_ts:
            rate=max(0.0,(current-prev)/(now-prev_ts))
        _SWAP_SAMPLE.update({'ts':now,'pswpout':current,'rate':rate})
    return round(rate,1)


def _selenium_pressure():
    metrics=_adaptive_metrics()
    metrics.update(_swap_status())
    metrics['swap_out_pages_s']=_swapout_rate_pages()
    reasons=[]
    if int(metrics.get('available_mb') or 0) < int(server.CFG.get('selenium_min_available_mb',1200) or 1200):reasons.append('low-memory')
    if float(metrics.get('load_per_cpu') or 0) >= float(server.CFG.get('selenium_max_load_per_cpu',1.35) or 1.35):reasons.append('high-load')
    if float(metrics.get('mem_psi') or 0) >= float(server.CFG.get('selenium_max_mem_psi',1.5) or 1.5):reasons.append('memory-pressure')
    if float(metrics.get('io_psi') or 0) >= float(server.CFG.get('selenium_max_io_psi',5.0) or 5.0):reasons.append('io-pressure')
    if float(metrics.get('io_full_psi') or 0) >= float(server.CFG.get('selenium_max_io_full_psi',2.0) or 2.0):reasons.append('io-full')
    if float(metrics.get('swap_out_pages_s') or 0) >= float(server.CFG.get('selenium_max_swapout_pages_s',64) or 64):reasons.append('active-swapout')
    if float(metrics.get('swap_used_pct') or 0) >= float(server.CFG.get('selenium_swap_used_hard_pct',70) or 70) and int(metrics.get('available_mb') or 0)<1400:reasons.append('swap-high')
    return (not reasons),reasons,metrics


def wait_for_selenium_headroom(article='', max_wait=None):
    if max_wait is None:max_wait=float(server.CFG.get('selenium_load_wait_seconds',45) or 45)
    deadline=time.monotonic()+max(0.0,float(max_wait));last_log=0.0
    while True:
        ok,reasons,metrics=_selenium_pressure()
        if ok:return metrics
        now=time.monotonic()
        if now-last_log>=5:
            _selenium_log('SELENIUM_WAIT',article=article,reason='+'.join(reasons),**metrics)
            last_log=now
        if now>=deadline:
            raise SeleniumDeferred('高負荷のためSelenium起動を延期: '+','.join(reasons))
        time.sleep(1.0)


class Browser:
    def __init__(self,origin):
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        self.origin=origin
        self.driver=None;self.service=None;self.driver_pid=0
        self.session_id=uuid.uuid4().hex[:12]
        self.user_data_dir=tempfile.mkdtemp(prefix=SELENIUM_CHROME_PREFIX+str(os.getpid())+'-')
        self.meta_path=SELENIUM_TMP_ROOT/(SELENIUM_META_PREFIX+self.session_id+'.json')
        self.created_at=time.monotonic();self.operations=0;self._closed=False;self._lease=False
        self._cleanup_lock=threading.RLock()
        article='session-create'
        _selenium_log('SELENIUM_WAIT',article=article,session=self.session_id)
        lease_wait=float(server.CFG.get('selenium_lock_wait_seconds',30) or 30)
        if not SELENIUM_SESSION_GATE.acquire(timeout=max(.1,lease_wait)):
            shutil.rmtree(self.user_data_dir,ignore_errors=True)
            raise SeleniumDeferred('Seleniumは別処理が使用中です')
        self._lease=True
        startup_active=False;startup_started=time.monotonic()
        try:
            active=_selenium_active_delta(1,self.session_id);startup_active=True
            _selenium_log('SELENIUM_START',article=article,operation='driver-start',session=self.session_id,active=active)
            wait_for_selenium_headroom(article)
            binary=os.environ.get('MATOME_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser')
            driver_path=os.environ.get('MATOME_CHROMEDRIVER') or shutil.which('chromedriver')
            if not binary or not driver_path:raise RuntimeError('chromium / chromedriver が見つかりません。UPDATE_ONLY.shを再実行してください')
            options=Options();options.binary_location=binary
            for arg in ('--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',
                        '--no-first-run','--window-size=1200,900','--autoplay-policy=user-gesture-required',
                        '--renderer-process-limit=3','--disable-features=Prewarm',
                        '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost;instagram.com;*.instagram.com;*.cdninstagram.com;*.fbcdn.net'):
                options.add_argument(arg)
            options.add_argument('--user-data-dir='+self.user_data_dir)
            options.page_load_strategy='eager'
            self.service=Service(executable_path=driver_path)
            _write_session_meta(self.meta_path,{'session':self.session_id,'owner_pid':os.getpid(),'driver_pid':0,'user_data_dir':self.user_data_dir,'started':time.time()})
            startup_timeout=float(server.CFG.get('selenium_start_timeout_seconds',25) or 25)
            done=threading.Event()
            threading.Thread(target=self._watchdog,args=(done,startup_timeout,'driver-start',article),daemon=True,name='selenium-start-watchdog').start()
            self.driver=webdriver.Chrome(service=self.service,options=options)
            done.set()
            self.driver_pid=int(getattr(getattr(self.service,'process',None),'pid',0) or 0)
            _write_session_meta(self.meta_path,{'session':self.session_id,'owner_pid':os.getpid(),'driver_pid':self.driver_pid,'user_data_dir':self.user_data_dir,'started':time.time()})
            self.driver.set_page_load_timeout(float(server.CFG.get('selenium_page_load_timeout_seconds',35) or 35))
            self.driver.set_script_timeout(float(server.CFG.get('selenium_script_timeout_seconds',90) or 90))
            chrome_pids=sorted(_marker_pids(self.user_data_dir))
            _selenium_log('SELENIUM_DRIVER_PID',session=self.session_id,pid=self.driver_pid)
            _selenium_log('SELENIUM_PID',session=self.session_id,pids=chrome_pids,user_data_dir=self.user_data_dir)
            if startup_active:
                active=_selenium_active_delta(-1,self.session_id);startup_active=False
            _selenium_log('SELENIUM_END',article=article,operation='driver-start',session=self.session_id,elapsed=round(time.monotonic()-startup_started,2),active=active)
        except Exception:
            if startup_active:
                try:_selenium_active_delta(-1,self.session_id)
                except Exception:pass
                startup_active=False
            self.close(force_reason='startup-failure')
            raise

    def _release_lease(self):
        if not self._lease:return
        self._lease=False
        try:SELENIUM_SESSION_GATE.release()
        except ValueError:pass

    def _watchdog(self, done, timeout, operation, article):
        if done.wait(max(.1,float(timeout))):return
        _selenium_log('SELENIUM_TIMEOUT',article=article,operation=operation,session=self.session_id,timeout=timeout)
        _kill_owned_session_processes(self.driver_pid or int(getattr(getattr(self.service,'process',None),'pid',0) or 0),self.user_data_dir,self.session_id,'hard-timeout:'+operation)

    def _operation(self, article, operation, fn, hard_timeout):
        ok,reasons,metrics=_selenium_pressure()
        if not ok:
            _selenium_log('SELENIUM_WAIT',article=article,operation=operation,reason='+'.join(reasons),**metrics)
            # Do not hold an idle Chromium while the Pi is already under pressure.
            self.close(force_reason='pressure-retire-before-operation')
            raise SeleniumDeferred('高負荷のためSelenium処理を延期: '+','.join(reasons))
        started=time.monotonic();done=threading.Event();op_active=False
        active=_selenium_active_delta(1,self.session_id);op_active=True
        _selenium_log('SELENIUM_START',article=article,operation=operation,session=self.session_id,active=active)
        threading.Thread(target=self._watchdog,args=(done,hard_timeout,operation,article),daemon=True,name='selenium-op-watchdog').start()
        try:
            value=fn();self.operations+=1
            if self.driver_pid and not Path('/proc/'+str(self.driver_pid)).exists():
                raise TimeoutError('Seleniumセッションがタイムアウトで終了しました')
            return value
        except Exception:
            self.close(force_reason='operation-error:'+operation)
            raise
        finally:
            done.set()
            elapsed=round(time.monotonic()-started,2)
            active=_selenium_active_delta(-1,self.session_id) if op_active else SELENIUM_ACTIVE_COUNT
            _selenium_log('SELENIUM_END',article=article,operation=operation,session=self.session_id,elapsed=elapsed,active=active)

    def run(self,path,script,article=''):
        article=article or path
        hard=float(server.CFG.get('selenium_article_hard_timeout_seconds',120) or 120)
        def work():
            self.driver.get(self.origin+path)
            js="""
              const done=arguments[arguments.length-1];
              Promise.resolve().then(async()=>{%s
              }).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error?.stack||error)}));
            """ % script
            result=self.driver.execute_async_script(js)
            if not result.get('ok'):raise RuntimeError(result.get('error','preparation failed'))
            return result['value']
        return self._operation(article,'prepare-js',work,hard)

    def resolve_instagram(self, raw_url):
        info=server.instagram_post_info(raw_url)
        if not info:raise ValueError('bad instagram url')
        last='Instagram投稿画像を取得できません'
        js="""
          const preferred=['a.EmbeddedMedia > img.EmbeddedMediaImage','img.EmbeddedMediaImage','article img[src]','main img[src]'];
          for(const sel of preferred){const img=document.querySelector(sel);const src=img&&(img.currentSrc||img.src||img.getAttribute('src'));if(src&&/^https?:/i.test(src)&&!/profile|avatar/i.test(String(img.className||'')+' '+src)) return src;}
          const meta=document.querySelector('meta[property="og:image"],meta[name="twitter:image"],meta[name="twitter:image:src"]');return meta?.content||'';
        """
        def work():
            nonlocal last
            for suffix in ('embed/captioned/','embed/'):
                try:
                    self.driver.get(info['url']+suffix)
                    deadline=time.monotonic()+8
                    while time.monotonic()<deadline:
                        value=self.driver.execute_script(js)
                        if value and str(value).startswith(('http://','https://')):
                            return {'ok':True,'post_id':info['id'],'post_url':info['url'],'kind':info['kind'],'image_url':str(value)}
                        time.sleep(.25)
                except Exception as e:last=str(e)
            return {'ok':False,'post_id':info['id'],'post_url':info['url'],'kind':info['kind'],'error':last}
        return self._operation(info['id'],'instagram',work,float(server.CFG.get('selenium_instagram_hard_timeout_seconds',30) or 30))

    def discover(self):
        return self.run('/index.html?worker=1','return await fetchFullFastSet();','discovery')

    def prepare(self,item):
        path='/prepare.html?worker=1&url='+urllib.parse.quote(item['link'],safe='')+'&site='+urllib.parse.quote(item.get('source',''),safe='')
        return self.run(path,'return await extractArticle();',str(item.get('link') or 'article'))

    def should_recycle(self):
        max_ops=max(1,int(server.CFG.get('selenium_recycle_after_operations',6) or 6))
        max_age=max(30,float(server.CFG.get('selenium_recycle_after_seconds',240) or 240))
        return self.operations>=max_ops or time.monotonic()-self.created_at>=max_age

    def close(self, force_reason=''):
        with self._cleanup_lock:
            if self._closed:
                self._release_lease();return
            self._closed=True
            driver=self.driver;self.driver=None
            quit_done=threading.Event()
            if driver is not None:
                def do_quit():
                    try:driver.quit()
                    except Exception:pass
                    finally:quit_done.set()
                threading.Thread(target=do_quit,daemon=True,name='selenium-quit').start()
                quit_done.wait(float(server.CFG.get('selenium_quit_timeout_seconds',6) or 6))
            dpid=self.driver_pid or int(getattr(getattr(self.service,'process',None),'pid',0) or 0)
            leftovers=_marker_pids(self.user_data_dir)
            driver_alive=dpid>1 and Path(f'/proc/{dpid}').exists()
            if force_reason or driver_alive or leftovers:
                _kill_owned_session_processes(dpid,self.user_data_dir,self.session_id,force_reason or 'post-quit-leftovers')
            shutil.rmtree(self.user_data_dir,ignore_errors=True)
            try:self.meta_path.unlink()
            except Exception:pass
            self._release_lease()

MOBILE_QUEUE=queue.Queue(maxsize=512)
MOBILE_QUEUE_LOCK=threading.RLock()
MOBILE_QUEUED=set()

def _mobile_builder():
    while True:
        public=MOBILE_QUEUE.get()
        try:server.build_mobile_variant(public,wait=True)
        except Exception:pass
        finally:
            with MOBILE_QUEUE_LOCK:MOBILE_QUEUED.discard(public)
            MOBILE_QUEUE.task_done()

def queue_mobile_variants(assets):
    if not bool(server.CFG.get('mobile_image_enabled',True)):return
    for public in assets or []:
        if not isinstance(public,str) or not public.startswith('/prepared/assets/'):continue
        with MOBILE_QUEUE_LOCK:
            if public in MOBILE_QUEUED:continue
            try:MOBILE_QUEUE.put_nowait(public)
            except queue.Full:break
            MOBILE_QUEUED.add(public)

def _available_memory_mb():
    try:
        text=Path('/proc/meminfo').read_text()
        m=re.search(r'^MemAvailable:\s+(\d+)\s+kB',text,re.M)
        return int(m.group(1))//1024 if m else 999999
    except Exception:return 999999

# Shared Linux pressure sampling for the single Selenium session.
# Extra renderer/burst logic was retired in v0.1.153; these metrics now only gate
# startup of the one allowed Chromium tree.
_ADAPTIVE_LOCK=threading.RLock()
_ADAPTIVE_METRIC_CACHE={'ts':0.0,'metrics':None}

def _psi_avg10(resource, kind='some'):
    try:
        text=Path('/proc/pressure/'+resource).read_text()
        m=re.search(r'^'+re.escape(kind)+r'\s+avg10=([0-9.]+)',text,re.M)
        return float(m.group(1)) if m else 0.0
    except Exception:
        return 0.0

def _adaptive_metrics():
    now=time.monotonic()
    with _ADAPTIVE_LOCK:
        cached=_ADAPTIVE_METRIC_CACHE.get('metrics')
        if cached is not None and now-float(_ADAPTIVE_METRIC_CACHE.get('ts') or 0)<1.0:
            return dict(cached)
    cpus=max(1,int(os.cpu_count() or 1))
    try:load1=float(os.getloadavg()[0])
    except Exception:load1=0.0
    metrics={
        'available_mb':_available_memory_mb(),
        'load1':round(load1,2),
        'load_per_cpu':round(load1/cpus,2),
        'mem_psi':round(_psi_avg10('memory','some'),2),
        'io_psi':round(_psi_avg10('io','some'),2),
        'io_full_psi':round(_psi_avg10('io','full'),2),
        'cpus':cpus,
    }
    with _ADAPTIVE_LOCK:
        _ADAPTIVE_METRIC_CACHE['ts']=now
        _ADAPTIVE_METRIC_CACHE['metrics']=dict(metrics)
    return metrics

class PreparationStageError(Exception):
    def __init__(self, stage, original):
        self.stage=str(stage)
        self.original=original
        super().__init__(str(original))


def _failure_category(error):
    text=str(error or '')
    message=text.splitlines()[0].strip() if text else ''
    low=text.lower()
    message_low=message.lower()
    # Only classify an upstream HTTP failure when the actual error message says HTTP 4xx/5xx.
    # Do not mistake JS stack positions such as (:457:26) for status code 457.
    if re.search(r'\bhttp(?: error| status)?\s*[=:]?\s*[45]\d\d\b', message_low):
        return 'upstream_http'
    if 'timeout' in low or 'timed out' in low or '時間切れ' in text:
        return 'timeout'
    if '重要画像' in text:
        return 'required_image'
    if 'x投稿' in text or 'twitter' in low or 'x.com' in low:
        return 'x_embed'
    if 'instagram' in low:
        return 'instagram_embed'
    if 'youtube' in low:
        return 'youtube_embed'
    if 'iframe' in low or '埋め込み' in text:
        return 'embed'
    if 'thumb' in low or 'サムネ' in text or 'og画像' in text:
        return 'thumbnail'
    if '本文' in text or 'article' in low and ('empty' in low or 'extract' in low):
        return 'article_body'
    if 'referenceerror' in low or ' is not defined' in low or 'typeerror' in low:
        return 'javascript'
    if any(x in low for x in ('sqlite','database','disk','no space','i/o error','readonly')) or '保存' in text:
        return 'storage'
    if 'connection reset' in low or 'connection refused' in low or 'dns' in low:
        return 'network'
    return 'other'


def _log_failure_event(kind, job, stage, error, result):
    payload={
        'kind':kind,
        'url':str(job.get('link') or ''),
        'title':str(job.get('title') or '')[:160],
        'source':str(job.get('source') or ''),
        'from_state':str(job.get('_queue_state') or ''),
        'attempt':int((result or {}).get('attempts') or job.get('_attempt_number') or 0),
        'stage':str(stage or 'unknown'),
        'category':_failure_category(error),
        'result_state':str((result or {}).get('state') or ''),
        'retry_in_seconds':int((result or {}).get('delay_seconds') or 0),
        'kept_old_ready':bool((result or {}).get('kept_old_ready')),
        'error_type':type(error).__name__,
        'error':str(error)[:700],
    }
    print('RETRY_EVENT '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)


def _log_retry_success(job):
    if str(job.get('_queue_state') or '')!='retry':
        return
    payload={
        'url':str(job.get('link') or ''),
        'title':str(job.get('title') or '')[:160],
        'source':str(job.get('source') or ''),
        'attempt':int(job.get('_attempt_number') or 0),
    }
    print('RESCUE_SUCCESS '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)


def _prepare_claimed_job(browser, job):
    if job.get('_force_article_refresh'):
        try: server.invalidate_cache(job['link'])
        except Exception: pass
    _prime_instagram_for_job(browser,job['link'])
    try:
        snapshot=browser.prepare(job)
    except Exception as e:
        raise PreparationStageError('記事抽出・メディア準備',e) from e
    try:
        STORE.publish(job['link'],snapshot)
    except Exception as e:
        raise PreparationStageError('完成キャッシュ保存・検証',e) from e
    for warning in (snapshot.get('warnings') or []):
        payload={'url':str(job.get('link') or ''),'source':str(job.get('source') or ''),'article_completed':True}
        if isinstance(warning,dict): payload.update(warning)
        else: payload['reason']=str(warning)
        print('MEDIA_WARNING '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)
    bstats=snapshot.get('gossip_body_stats')
    if isinstance(bstats,dict) and bstats.get('kind')=='gossip1':
        payload={'url':str(job.get('link') or ''),'source':str(job.get('source') or '')}
        payload.update({k:int(bstats.get(k) or 0) for k in ('source','prepared','final')})
        print('GOSSIP_BODY '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)
    astats=snapshot.get('alfalfa_body_stats')
    if isinstance(astats,dict) and astats.get('kind')=='alfalfalfa':
        payload={'url':str(job.get('link') or ''),'source':str(job.get('source') or ''),'mode':str(astats.get('mode') or '')}
        payload.update({k:int(astats.get(k) or 0) for k in ('source','bundle','prepared','final')})
        print('ALFALFA_BODY '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)
    cstats=snapshot.get('comment_stats')
    if isinstance(cstats,dict) and cstats.get('kind')=='esuteru':
        payload={'url':str(job.get('link') or ''),'source':str(job.get('source') or '')}
        payload.update({k:int(cstats.get(k) or 0) for k in ('expected','primary','fallback','appended','final','fetch_pages','fetch_errors','bytes','loose')})
        if cstats.get('errors'): payload['errors']=str(cstats.get('errors'))[:1200]
        print('ESUTERU_COMMENT '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)
    if isinstance(cstats,dict) and cstats.get('kind')=='gossip1':
        payload={'url':str(job.get('link') or ''),'source':str(job.get('source') or ''),'marker':str(cstats.get('marker') or '')}
        payload.update({k:int(cstats.get(k) or 0) for k in ('roots','primary','marker_items','expected','appended','final')})
        print('GOSSIP_COMMENT '+json.dumps(payload,ensure_ascii=False,separators=(',',':')),flush=True)
    queue_mobile_variants(snapshot.get('assets') or [])


def run():
    def _graceful_stop(signum, frame):
        _selenium_log('SELENIUM_END',article='worker-shutdown',operation='signal',signal=int(signum),active=SELENIUM_ACTIVE_COUNT)
        raise SystemExit(0)
    try:
        signal.signal(signal.SIGTERM,_graceful_stop)
        signal.signal(signal.SIGINT,_graceful_stop)
    except Exception:
        pass
    cleanup_stale_selenium_sessions()
    STORE.recover();STORE.migrate_retry_policy(2);STORE.migrate_extraction_policy(177);STORE.migrate_direct_video_policy(183);STORE.migrate_navigation_cleanup_policy(184);STORE.migrate_queue_policy(189);STORE.migrate_failed_visibility_policy(190);STORE.migrate_site_profile_policy(213);STORE.migrate_failure_resilience_policy(199);STORE.migrate_v0113_targeted_policy(213);STORE.migrate_v0114_targeted_policy(214);STORE.migrate_v0115_targeted_policy(215);STORE.migrate_v0117_targeted_policy(217);STORE.migrate_v0118_targeted_policy(218);STORE.migrate_v0119_targeted_policy(219);STORE.migrate_v0120_targeted_policy(220);STORE.migrate_v0122_targeted_policy(222);STORE.migrate_v0123_targeted_policy(223);STORE.migrate_v0130_targeted_policy(230);STORE.migrate_v0131_targeted_policy(231);STORE.migrate_v0133_targeted_policy(233);STORE.migrate_v0134_targeted_policy(234);STORE.migrate_v0138_targeted_policy(238);STORE.migrate_v0139_targeted_policy(239);STORE.migrate_v0140_targeted_policy(240);STORE.migrate_v0180_heartlog_gif_policy(283);STORE.migrate_v0192_esuteru_clean_fix(292);STORE.audit()
    threading.Thread(target=_mobile_builder,daemon=True,name='mobile-variant-builder').start()
    # Seed migration with known URLs; old raw HTML is never considered ready.
    allowed_sources=configured_sources()
    saved=server.load_snapshot('article_list')
    if isinstance(saved,dict) and saved.get('items'):
        items=[x for x in saved['items'] if isinstance(x,dict) and (not allowed_sources or x.get('source') in allowed_sources)]
        STORE.discover(items,authoritative=False)
    STORE.filter_unpublished_sources(allowed_sources)
    httpd=ThreadingHTTPServer(('127.0.0.1',0),PreparationHandler)
    threading.Thread(target=httpd.serve_forever,daemon=True,name='prepare-local').start()
    origin='http://127.0.0.1:'+str(httpd.server_port)
    browser=None;next_discovery=0;next_audit=0;done=0
    try:
        while True:
            STORE.set_status('worker',{'state':'running','renderer_ready':True,'renderer_mode':'on-demand-single','heartbeat':int(time.time()*1000),'article_concurrency':1,'network_concurrency':max(1,min(2,int(server.CFG.get('upstream_workers',2) or 2))),'selenium_active':SELENIUM_ACTIVE_COUNT})
            try:
                if time.time()>=next_discovery:
                    if browser is None:browser=Browser(origin)
                    STORE.set_status('worker',{'state':'running','renderer_ready':True,'renderer_mode':'on-demand-single','heartbeat':int(time.time()*1000),'article_concurrency':1,'network_concurrency':max(1,min(2,int(server.CFG.get('upstream_workers',2) or 2))),'selenium_active':SELENIUM_ACTIVE_COUNT})
                    STORE.set_status('activity','新着候補を収集中（未完成記事は非公開）')
                    discovery=browser.discover()
                    items=list((discovery or {}).get('items') or [])
                    if not items:raise RuntimeError('取得元から記事候補を取得できませんでした')
                    core_ok=int((discovery or {}).get('coreOk') or 0);core_total=int((discovery or {}).get('coreTotal') or 0)
                    feed_ok=int((discovery or {}).get('feedOk') or 0);feed_total=int((discovery or {}).get('feedTotal') or 0)
                    authoritative=bool(core_total and feed_total and core_ok==core_total and feed_ok==feed_total)
                    STORE.discover(items,authoritative=authoritative)
                    STORE.set_status('discovery_health',{'authoritative':authoritative,'core_ok':core_ok,'core_total':core_total,'feed_ok':feed_ok,'feed_total':feed_total})
                    STORE.filter_unpublished_sources(allowed_sources)
                    next_discovery=time.time()+max(60,int(server.CFG.get('prepare_discovery_seconds',60)))
                if time.time()>=next_audit:
                    STORE.audit();maintain_completed();next_audit=time.time()+60
                # v0.1.153 stability policy: article DOM rendering is always one Selenium
                # session at a time. HTTP/media requests remain independent and can use two
                # upstream slots, but backlog never creates another Chromedriver/Chromium.
                qstats=STORE.queue_stats()
                backlog=qstats['pending'] + qstats['retry_due']
                job=STORE.next_job()
                if job is None:
                    STORE.set_status('activity','完成済み記事を公開中・次の候補取得待ち')
                    # Free headless Chromium completely while idle.
                    if browser is not None:
                        browser.close();browser=None
                    time.sleep(5);continue
                try:
                    if browser is None:browser=Browser(origin)
                    STORE.set_status('activity','準備中: '+str(job.get('title') or job['link']))
                    STORE.set_status('current_url',job['link'])
                    _prepare_claimed_job(browser,job)
                    _log_retry_success(job)
                    maintain_completed()
                    done+=1
                    if browser is not None and browser.should_recycle():
                        browser.close();browser=None
                except Exception as e:
                    stage=e.stage if isinstance(e,PreparationStageError) else '準備ワーカー'
                    raw=e.original if isinstance(e,PreparationStageError) else e
                    result=STORE.fail(job['link'],str(raw))
                    _log_failure_event('main',job,stage,raw,result)
                    # Discard timed-out async work before the next article.
                    if browser is not None:
                        browser.close();browser=None
                if done>=1000000:done=0
                time.sleep(.2)
            except Exception as e:
                STORE.set_status('worker',{'state':'error','heartbeat':int(time.time()*1000),'error':str(e)[:500]})
                print('準備処理:',str(e),flush=True)
                if browser is not None:
                    try:browser.close()
                    except Exception:pass
                    browser=None
                time.sleep(15)
                # Discovery failures do not permanently prevent retries of existing candidates.
                next_discovery=time.time()+60
    finally:
        if browser is not None:browser.close()
        httpd.shutdown()


if __name__=='__main__':
    run()
