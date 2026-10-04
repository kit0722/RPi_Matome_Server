"""On-demand video relay. No persistent video cache; only short-lived resolved URL metadata."""
import html
import json
import mimetypes
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

_URLS={}
_WARMING={}
_WARM_FAIL={}
_LOCK=threading.RLock()
_WARM_GATE=threading.BoundedSemaphore(2)

def _prune_meta_cache(now=None):
    now=time.time() if now is None else now
    for key,value in list(_URLS.items()):
        if not value or value[1]<=now:_URLS.pop(key,None)
    for key,until in list(_WARM_FAIL.items()):
        if until<=now:_WARM_FAIL.pop(key,None)
    if len(_URLS)>1000:
        for key,_ in sorted(_URLS.items(),key=lambda kv:kv[1][1])[:len(_URLS)-800]:_URLS.pop(key,None)


def video_key(raw):
    try:
        u=urllib.parse.urlparse(raw)
        if u.hostname=='video.twimg.com':
            m=re.match(r'^/(ext_tw_video|amplify_video|tweet_video)/([A-Za-z0-9_-]+)',u.path)
            if m:return 'twimg:'+m.group(1)+':'+m.group(2)
        return urllib.parse.urlunparse(u._replace(fragment=''))
    except Exception:return ''


def _http_url(raw):
    try:
        u=urllib.parse.urlparse(str(raw or '').strip())
        return str(raw).strip() if u.scheme in ('http','https') and u.netloc else ''
    except Exception:return ''


def _is_x(record):
    return bool(record.get('tweet_id')) or str(record.get('key') or '').startswith('twimg:')


def _candidate_urls(record,cached_url='',fresh_url=''):
    out=[]
    def add(raw):
        u=_http_url(raw)
        if u and u not in out:out.append(u)
    # A successfully warmed/refreshed X URL is the best candidate.
    add(cached_url);add(fresh_url);add(record.get('url'))
    for u in record.get('urls') or []:add(u)
    return out


def request_remote(url,ua,range_header='',method='GET',referer='',timeout=12):
    if not _http_url(url):raise ValueError('動画URLがありません')
    headers={'User-Agent':ua,'Accept':'*/*','Accept-Encoding':'identity'}
    if range_header:headers['Range']=range_header
    host=(urllib.parse.urlparse(url).hostname or '').lower()
    if host in ('video.twimg.com','pbs.twimg.com'):
        headers['Referer']='https://x.com/'
    elif referer:headers['Referer']=referer
    return urllib.request.urlopen(urllib.request.Request(url,headers=headers,method=method),timeout=timeout)


def refresh_url(record,ua):
    """Resolve a fresh X/Twitter MP4 URL without downloading the video body."""
    candidates=[]
    tweet=record.get('tweet_id') or ''
    if re.fullmatch(r'\d+',tweet):
        query=urllib.parse.urlencode({'id':tweet,'lang':'ja','token':record.get('tweet_token') or ''})
        try:
            with request_remote('https://cdn.syndication.twimg.com/tweet-result?'+query,ua,timeout=8) as r:
                data=json.loads(r.read(2_000_000))
            def walk(obj):
                if isinstance(obj,dict):
                    bitrate=int(obj.get('bitrate') or 0) if str(obj.get('bitrate') or '0').isdigit() else 0
                    for k in ('url','src'):
                        value=obj.get(k)
                        if isinstance(value,str) and re.search(r'\.mp4(?:[?#]|$)',value,re.I):candidates.append((bitrate,value))
                    for value in obj.values():walk(value)
                elif isinstance(obj,list):
                    for value in obj:walk(value)
            walk(data)
        except Exception:pass
    source=record.get('source_page') or ''
    if source and not any(video_key(u)==record.get('key') for _,u in candidates):
        try:
            with request_remote(source,ua,timeout=8) as r:
                text=html.unescape(r.read(4_000_000).decode('utf-8','replace')).replace('\\/','/').replace('\\u002F','/')
            for url in re.findall(r'https?://[^\s"<>\\]+?\.mp4(?:\?[^\s"<>\\]*)?',text):
                candidates.append((0,url.rstrip("'")))
        except Exception:pass
    matching=[x for x in candidates if video_key(x[1])==record.get('key')]
    if not matching and tweet and not _http_url(record.get('url')) and len({video_key(u) for _,u in candidates})==1:
        matching=candidates
    return max(matching,key=lambda x:x[0])[1] if matching else ''


def _probe(url,record,ua):
    """One-byte GET avoids origins/CDNs that reject HEAD while downloading almost nothing."""
    try:
        with request_remote(url,ua,'bytes=0-0','GET',record.get('source_page',''),timeout=8) as r:
            mime=(r.headers.get('Content-Type') or '').lower()
            return r.status in (200,206) and 'text/html' not in mime and 'application/json' not in mime
    except Exception:return False


def warm(handler,store,parsed,ua):
    """Warm metadata once per video key; concurrent tabs share the same resolution work."""
    q=urllib.parse.parse_qs(parsed.query)
    article_url=(q.get('article') or [''])[0];key=(q.get('key') or [''])[0]
    article=store.article(article_url)
    record=next((v for v in (article or {}).get('videos',[]) if v.get('key')==key),None)
    if not record:return handler._json({'ok':False,'error':'再生情報がありません'},404)
    cache_key=(article_url,key);now=time.time();owner=False
    with _LOCK:
        _prune_meta_cache(now)
        cached=_URLS.get(cache_key)
        if cached and cached[1]>now:return handler._json({'ok':True,'warmed':True,'shared':False})
        if _WARM_FAIL.get(cache_key,0)>now:return handler._json({'ok':True,'warmed':False,'cooldown':True})
        event=_WARMING.get(cache_key)
        if event is None:
            event=threading.Event();_WARMING[cache_key]=event;owner=True
    if not owner:
        event.wait(9)
        with _LOCK:
            cached=_URLS.get(cache_key)
            ok=bool(cached and cached[1]>time.time())
        return handler._json({'ok':True,'warmed':ok,'shared':True})
    ok=False
    try:
        with _WARM_GATE:
            fresh=refresh_url(record,ua) if _is_x(record) else ''
            for candidate in _candidate_urls(record,fresh_url=fresh):
                if _probe(candidate,record,ua):
                    with _LOCK:_URLS[cache_key]=(candidate,time.time()+600)
                    ok=True;break
        if not ok:
            with _LOCK:_WARM_FAIL[cache_key]=time.time()+20
        return handler._json({'ok':True,'warmed':ok,'shared':False})
    finally:
        with _LOCK:
            ev=_WARMING.pop(cache_key,None)
            if ev:ev.set()


def _mime_for(response,url,kind='video'):
    mime=(response.headers.get('Content-Type') or '').split(';',1)[0].strip().lower()
    if mime.startswith(('video/','audio/')):return mime
    guess=(mimetypes.guess_type(urllib.parse.urlparse(url).path)[0] or '').lower()
    if guess.startswith(('video/','audio/')):return guess
    return 'audio/mpeg' if kind=='audio' else 'video/mp4'


def _open_candidate(url,record,ua,range_header,method):
    # Never forward HEAD to fragile CDNs. For a local HEAD, probe with a one-byte GET.
    response=(request_remote(url,ua,'bytes=0-0','GET',record.get('source_page',''),timeout=10)
              if method=='HEAD' else
              request_remote(url,ua,range_header,'GET',record.get('source_page',''),timeout=15))
    mime=(response.headers.get('Content-Type') or '').split(';',1)[0].strip().lower()
    # Do not disguise an origin error page as video/mp4. Reject it here so relay() can try
    # the next stored source/fresh X URL instead of sending HTML to the media element.
    if (mime.startswith('text/') or mime in ('application/json','application/problem+json',
                                             'application/xml','application/xhtml+xml')):
        response.close()
        raise ValueError('動画候補がHTML/エラー応答を返しました: '+(mime or 'unknown'))
    return response


def relay(handler,store,parsed,ua):
    q=urllib.parse.parse_qs(parsed.query)
    article_url=(q.get('article') or [''])[0]
    key=(q.get('key') or [''])[0]
    article=store.article(article_url)
    record=next((v for v in (article or {}).get('videos',[]) if v.get('key')==key),None)
    if not record:return handler._json({'error':'再生情報がありません。一覧を更新してください'},404)
    header=handler.headers.get('Range','')
    match=re.fullmatch(r'bytes=(\d*)-(\d*)',header) if header else None
    if header and (not match or not any(match.groups())):
        return handler._json({'error':'invalid range'},416)

    cache_key=(article_url,key)
    with _LOCK:cached=_URLS.get(cache_key)
    cached_url=cached[0] if cached and cached[1]>time.time() else ''
    fresh=''
    candidates=_candidate_urls(record,cached_url=cached_url)
    response=None;chosen='';last_error=None;headers_sent=False

    try:
        # Try every stored <source>, not just the first one.
        for candidate in candidates:
            try:
                response=_open_candidate(candidate,record,ua,header,handler.command)
                chosen=candidate;break
            except urllib.error.HTTPError as exc:
                last_error=exc
                if exc.code==416 and len(candidates)==1:
                    handler.send_response(416)
                    if exc.headers.get('Content-Range'):handler.send_header('Content-Range',exc.headers['Content-Range'])
                    handler.send_header('Content-Length','0');handler.send_header('Cache-Control','no-store');handler.end_headers();exc.close();return
                exc.close()
            except Exception as exc:last_error=exc

        # X URLs may need a fresh resolution. Do this only after stored candidates fail.
        if response is None and _is_x(record):
            fresh=refresh_url(record,ua)
            if fresh and fresh not in candidates:
                try:
                    response=_open_candidate(fresh,record,ua,header,handler.command);chosen=fresh
                except Exception as exc:last_error=exc

        if response is None:
            raise ValueError('動画を取得できませんでした') from last_error

        if chosen:
            with _LOCK:
                _prune_meta_cache()
                _URLS[cache_key]=(chosen,time.time()+300)

        with response:
            upstream_status=response.status
            mime=_mime_for(response,chosen,record.get('kind') or 'video')
            raw_length=response.headers.get('Content-Length')
            content_range=response.headers.get('Content-Range')

            # A synthetic local HEAD was fetched upstream as bytes=0-0 GET.
            if handler.command=='HEAD':
                total=None
                if content_range:
                    m=re.search(r'/([0-9]+)$',content_range)
                    if m:total=int(m.group(1))
                if total is None and upstream_status==200 and raw_length is not None:total=int(raw_length)
                handler.send_response(200)
                handler.send_header('Content-Type',mime)
                if total is not None:handler.send_header('Content-Length',str(total))
                handler.send_header('Accept-Ranges','bytes')
                handler.send_header('Cache-Control','no-store, no-cache, max-age=0')
                handler.send_header('X-RPi-Video-Source','resolved')
                handler.end_headers();return

            length=int(raw_length) if raw_length is not None else None
            status=upstream_status
            skip=0;remaining=length
            if header and status==200:
                # Some hosts ignore Range. Slice locally when size is known.
                if length is not None:
                    total=length
                    if match.group(1):start=int(match.group(1));end=min(total-1,int(match.group(2))) if match.group(2) else total-1
                    else:start=max(0,total-int(match.group(2)));end=total-1
                    if start>=total or start>end:
                        handler.send_response(416);handler.send_header('Content-Range',f'bytes */{total}')
                        handler.send_header('Content-Length','0');handler.end_headers();return
                    skip=start;remaining=end-start+1;status=206;content_range=f'bytes {start}-{end}/{total}'
                else:
                    # Unknown-length full response can still play progressively from byte zero.
                    requested_start=int(match.group(1) or 0) if match else 0
                    if requested_start!=0:raise ValueError('取得元がシーク情報を返しませんでした')
                    status=200;content_range=None;remaining=None
            if status==206 and not content_range:raise ValueError('取得元のRange応答が不正です')
            while skip:
                chunk=response.read(min(skip,65536))
                if not chunk:raise ValueError('動画ストリームが途中で終了しました')
                skip-=len(chunk)

            handler.send_response(status)
            handler.send_header('Content-Type',mime)
            handler.send_header('Cache-Control','no-store, no-cache, max-age=0')
            handler.send_header('Accept-Ranges','bytes')
            handler.send_header('X-Content-Type-Options','nosniff')
            handler.send_header('X-RPi-Video-Source','relay')
            if remaining is not None:handler.send_header('Content-Length',str(remaining))
            if content_range:handler.send_header('Content-Range',content_range)
            handler.end_headers();headers_sent=True
            if remaining is None:handler.close_connection=True
            while remaining is None or remaining>0:
                chunk=response.read(128*1024 if remaining is None else min(128*1024,remaining))
                if not chunk:break
                handler.wfile.write(chunk)
                if remaining is not None:remaining-=len(chunk)
    except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
    except Exception as e:
        if not headers_sent:handler._json({'error':str(e)},502)
        else:handler.close_connection=True
