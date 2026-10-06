#!/usr/bin/env python3
import argparse, gzip, json, re, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

VERSION = "0.1.0"
ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
ORIGIN = "https://news.yahoo.co.jp"
RSS = ORIGIN + "/rss/"
UA = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/153 Safari/537.36 RPiYahooNews/0.1.0"

FEEDS = {
    "top": "topics/top-picks.xml",
    "domestic": "categories/domestic.xml",
    "world": "categories/world.xml",
    "business": "categories/business.xml",
    "entertainment": "categories/entertainment.xml",
    "sports": "categories/sports.xml",
    "it": "categories/it.xml",
    "science": "categories/science.xml",
    "life": "categories/life.xml",
    "local": "categories/local.xml",
}
LATEST = ["domestic", "world", "business", "entertainment", "sports", "it", "science", "life"]
LABELS = {
    "latest": "新着", "top": "主要", "domestic": "国内", "world": "国際", "business": "経済",
    "entertainment": "エンタメ", "sports": "スポーツ", "it": "IT", "science": "科学", "life": "ライフ",
    "local": "地域（東海）",
}
TOKAI = re.compile(
    r"愛知(?:県)?|名古屋|尾張|三河|豊橋|豊田市|岡崎|一宮|春日井|刈谷|安城|西尾|蒲郡|常滑|知多|半田|犬山|小牧|瀬戸|長久手|日進|東海市|"
    r"岐阜(?:県)?|大垣|高山|多治見|各務原|可児|関市|中津川|美濃加茂|飛騨|"
    r"三重(?:県)?|津市|四日市|伊勢|松阪|鈴鹿|桑名|鳥羽|志摩|伊賀|名張|東海三県",
    re.I,
)


def _decode(raw, encoding):
    return gzip.decompress(raw) if (encoding or "").lower() == "gzip" else raw


def fetch(url, timeout=18, referer=""):
    if not re.match(r"^https://", url or "", re.I):
        raise ValueError("HTTPS URL only")
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.4",
        "Accept-Encoding": "gzip, identity",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(40 * 1024 * 1024 + 1)
        if len(raw) > 40 * 1024 * 1024:
            raise ValueError("upstream response too large")
        return _decode(raw, r.headers.get("Content-Encoding")), r.headers.get("Content-Type") or "application/octet-stream", r.geturl() or url


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def epoch_ms(raw):
    if not raw:
        return 0
    try:
        dt = parsedate_to_datetime(str(raw))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        pass
    try:
        return int(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return 0


def article_url(raw):
    try:
        u = urllib.parse.urlparse(str(raw or "").strip())
    except Exception:
        return None
    if u.scheme != "https" or (u.hostname or "").lower() != "news.yahoo.co.jp":
        return None
    m = re.fullmatch(r"/articles/([0-9a-fA-F]+)(?:/comments)?/?", u.path)
    if m:
        return f"{ORIGIN}/articles/{m.group(1).lower()}"
    if re.fullmatch(r"/pickup/\d+/?", u.path):
        return ORIGIN + u.path.rstrip("/")
    return None


def preloaded(text):
    m = re.search(r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*</script", text or "", re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except Exception:
        return {}


class Facts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.links, self.title, self._title = {}, [], "", False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "meta":
            key = (attrs.get("property") or attrs.get("name") or "").lower()
            if key and attrs.get("content"):
                self.meta[key] = attrs["content"]
        elif tag.lower() == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        elif tag.lower() == "title":
            self._title = True

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self._title = False

    def handle_data(self, data):
        if self._title:
            self.title += data


def facts(text):
    p = Facts()
    try:
        p.feed(text or "")
    except Exception:
        pass
    return p


def rss_items(category):
    path = FEEDS.get(category)
    if not path:
        return []
    body, _, _ = fetch(RSS + path, timeout=15, referer=ORIGIN + "/")
    root = ET.fromstring(body)
    out = []
    for node in root.findall(".//item"):
        title = clean(node.findtext("title")) or "(無題)"
        link = article_url(clean(node.findtext("link")))
        if not link:
            continue
        image = ""
        for child in list(node):
            local = child.tag.split("}")[-1].lower()
            if local == "image":
                image = clean(child.text) or clean(child.attrib.get("url"))
            elif not image and local == "enclosure" and str(child.attrib.get("type", "")).lower().startswith("image/"):
                image = clean(child.attrib.get("url"))
            elif not image and local in ("thumbnail", "content"):
                candidate = clean(child.attrib.get("url"))
                typ = str(child.attrib.get("type", "")).lower()
                if candidate and (local == "thumbnail" or not typ or typ.startswith("image/")):
                    image = candidate
        out.append({
            "title": title, "link": link, "date": epoch_ms(clean(node.findtext("pubDate"))),
            "category": category, "category_label": LABELS.get(category, category), "image_url": image,
        })
    return out


def list_items(category):
    category = (category or "latest").strip().lower().replace("-", "_")
    if category not in LABELS:
        raise ValueError("bad category")
    keys = LATEST if category == "latest" else [category]
    merged, errors = [], []
    for key in keys:
        try:
            merged.extend(rss_items(key))
        except Exception as e:
            errors.append(f"{key}:{e}")
    if not merged and errors:
        raise RuntimeError(" / ".join(errors))
    seen, out = set(), []
    for item in sorted(merged, key=lambda x: x.get("date", 0), reverse=True):
        if item["link"] in seen:
            continue
        if category == "local" and not TOKAI.search(item.get("title", "")):
            continue
        seen.add(item["link"])
        out.append(item)
        if len(out) >= (180 if category == "latest" else 100):
            break
    return {"ok": True, "category": category, "label": LABELS[category], "items": out, "errors": errors, "checked_at": int(time.time() * 1000)}


def structured_body(detail):
    out = []
    for paragraph in (detail or {}).get("paragraphs") or []:
        for part in paragraph.get("textDetails") or []:
            items = part.get("paragraphItems")
            text = "".join(str(x.get("text") or "") for x in items if isinstance(x, dict)) if isinstance(items, list) else str(part.get("text") or "")
            for chunk in re.split(r"\n\s*\n", text):
                chunk = chunk.strip()
                if chunk:
                    out.append(chunk)
    return out


def photo_items(article, detail):
    article_id = urllib.parse.urlparse(article).path.strip("/").split("/")[-1]
    candidates = []
    for paragraph in (detail or {}).get("paragraphs") or []:
        for obj in paragraph.get("objectItems") or []:
            if isinstance(obj, dict) and obj.get("photoDetailUrl"):
                candidates.append(urllib.parse.urljoin(article, obj["photoDetailUrl"]))
    entry = None
    for raw in candidates:
        u = urllib.parse.urlparse(raw)
        if u.scheme == "https" and u.hostname == "news.yahoo.co.jp" and re.fullmatch(rf"/articles/{re.escape(article_id)}/images/\d+/?", u.path, re.I):
            entry = raw
            break
    if not entry:
        return []
    try:
        body, _, _ = fetch(entry, timeout=18, referer=article)
        d = preloaded(body.decode("utf-8", "replace")).get("photoDetail") or {}
        if str(d.get("contentId") or "").lower() != article_id.lower():
            return []
        out, seen = [], set()
        for p in d.get("images") or []:
            if not isinstance(p, dict):
                continue
            raw = clean(((p.get("view") or {}).get("uri")))
            if not raw:
                continue
            url = urllib.parse.urljoin(entry, raw)
            u = urllib.parse.urlparse(url)
            if u.scheme != "https" or not (u.hostname or "").endswith(".yimg.jp"):
                continue
            key = (u.hostname, u.path)
            if key in seen:
                continue
            seen.add(key)
            out.append({"url": url, "caption": clean(p.get("caption") or d.get("headline") or "記事の写真")})
        return out[:40]
    except Exception:
        return []


def comments(article, article_id):
    url = f"{ORIGIN}/articles/{article_id}/comments"
    out, seen, visited = [], set(), set()
    while url and len(out) < 30 and url not in visited:
        visited.add(url)
        try:
            body, _, _ = fetch(url, timeout=18, referer=article)
            state = preloaded(body.decode("utf-8", "replace"))
        except Exception:
            break
        if str(((state.get("commentArticle") or {}).get("commentArticleId") or "")).lower() != article_id.lower():
            break
        full = state.get("commentFull") or {}
        if full.get("commentGetStatus") != "success":
            break
        added = 0
        for c in full.get("userCommentList") or []:
            if not isinstance(c, dict) or str(c.get("commentArticleId") or "").lower() != article_id.lower():
                continue
            if c.get("isVisible") is False or c.get("isBlocked") or not c.get("text"):
                continue
            cid = str(c.get("commentId") or "")
            if cid and cid in seen:
                continue
            if cid:
                seen.add(cid)
            out.append({
                "user": clean(c.get("name")), "time": clean(c.get("postDate")), "text": str(c.get("text") or "").strip(),
                "empathy": int(c.get("empathyCount") or 0), "insight": int(c.get("insightCount") or 0), "negative": int(c.get("negativeCount") or 0),
            })
            added += 1
            if len(out) >= 30:
                break
        if len(out) >= 30 or not added:
            break
        p = state.get("commentParameter") or {}
        base = p.get("paginationUrl")
        try:
            page = int(p.get("commentPage") or 1) + 1
        except Exception:
            break
        if not base:
            break
        nxt = urllib.parse.urljoin(url, str(base) + str(page))
        u = urllib.parse.urlparse(nxt)
        if u.scheme != "https" or u.hostname != "news.yahoo.co.jp" or u.path != f"/articles/{article_id}/comments":
            break
        url = nxt
    return out[:30]


def article_data(raw_url):
    url = article_url(raw_url)
    if not url:
        raise ValueError("Yahoo!ニュースの記事URLではありません")
    body, _, _ = fetch(url, timeout=20, referer=ORIGIN + "/")
    text = body.decode("utf-8", "replace")
    if "/pickup/" in url:
        candidates = [article_url(x) for x in re.findall(r'href=["\']([^"\']+)["\']', text, re.I)]
        target = next((x for x in candidates if x and "/articles/" in x), None)
        if not target:
            raise RuntimeError("全文リンクを確認できませんでした")
        url = target
        body, _, _ = fetch(url, timeout=20, referer=ORIGIN + "/")
        text = body.decode("utf-8", "replace")
    state = preloaded(text)
    fact = facts(text)
    article_id = urllib.parse.urlparse(url).path.strip("/").split("/")[-1]
    detail = state.get("articleDetail") if isinstance(state, dict) else None
    if not isinstance(detail, dict) or str(detail.get("contentId") or "").lower() != article_id.lower():
        detail = None
    title = clean((detail or {}).get("headline")) or clean(fact.meta.get("og:title")) or clean(fact.title) or "記事"
    provider = clean(((detail or {}).get("media") or {}).get("mediaName")) or clean(fact.meta.get("author"))
    date = (detail or {}).get("createDateTime") or fact.meta.get("article:published_time") or ""
    hero = clean(fact.meta.get("og:image") or fact.meta.get("twitter:image") or "")
    paragraphs = structured_body(detail)
    current_text = text
    total = max(1, int((detail or {}).get("maxPage") or 1)) if detail else 1
    current_page = int((detail or {}).get("currentPage") or 1) if detail else 1
    for page in range(current_page + 1, total + 1):
        current_facts = facts(current_text)
        next_url = None
        current_path = urllib.parse.urlparse(url).path
        for href in current_facts.links:
            absolute = urllib.parse.urljoin(url, href)
            u = urllib.parse.urlparse(absolute)
            q = urllib.parse.parse_qs(u.query)
            if u.scheme == "https" and u.hostname == "news.yahoo.co.jp" and u.path == current_path:
                try:
                    if int((q.get("page") or [0])[0]) == page:
                        next_url = absolute
                        break
                except Exception:
                    pass
        if not next_url:
            break
        b, _, _ = fetch(next_url, timeout=18, referer=url)
        current_text = b.decode("utf-8", "replace")
        d = preloaded(current_text).get("articleDetail") or {}
        if str(d.get("contentId") or "").lower() != article_id.lower():
            break
        paragraphs.extend(structured_body(d))
    return {
        "ok": True, "url": url, "title": title, "provider": provider, "date": epoch_ms(date), "hero_image": hero,
        "body": paragraphs, "photos": photo_items(url, detail), "comments": comments(url, article_id), "checked_at": int(time.time() * 1000),
    }


def rankings():
    groups = {}
    for key, title, url in [
        ("access", "アクセスランキング", ORIGIN + "/ranking/access/news"),
        ("comment", "ヤフコメランキング", ORIGIN + "/ranking/comment"),
    ]:
        rows = []
        try:
            body, _, _ = fetch(url, timeout=18, referer=ORIGIN + "/")
            state = preloaded(body.decode("utf-8", "replace"))
            for x in ((state.get("rankingFeed") or {}).get("list") or []):
                link = article_url(x.get("newsLink"))
                if not link:
                    continue
                image = x.get("thumbnailUrl") or x.get("imageUrl") or x.get("thumbUrl") or ((x.get("thumbnail") or {}).get("url") if isinstance(x.get("thumbnail"), dict) else "") or ""
                rows.append({"title": clean(x.get("headline")) or "(無題)", "link": link, "image_url": image, "date": epoch_ms(x.get("publishedTime") or x.get("date"))})
                if len(rows) >= 10:
                    break
        except Exception:
            pass
        groups[key] = {"title": title, "items": rows}
    return {"ok": True, "groups": groups, "checked_at": int(time.time() * 1000)}


class Handler(SimpleHTTPRequestHandler):
    server_version = "RPiYahooNews/" + VERSION
    protocol_version = "HTTP/1.1"

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        rel = urllib.parse.unquote(parsed.path).lstrip("/") or "index.html"
        safe = Path(rel)
        if ".." in safe.parts:
            safe = Path("index.html")
        return str(WEB / safe)

    def log_message(self, fmt, *args):
        if urllib.parse.urlparse(self.path).path == "/api/health":
            return
        print(time.strftime("%Y-%m-%d %H:%M:%S"), self.client_address[0], fmt % args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def json(self, obj, code=200):
        raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/api/health":
            return self.json({"ok": True, "version": VERSION, "cache": False, "refresh_seconds": 60})
        if u.path == "/api/list":
            try:
                return self.json(list_items((q.get("category") or ["latest"])[0]))
            except ValueError as e:
                return self.json({"ok": False, "error": str(e)}, 400)
            except Exception as e:
                return self.json({"ok": False, "error": str(e)}, 502)
        if u.path == "/api/article":
            try:
                return self.json(article_data((q.get("url") or [""])[0]))
            except ValueError as e:
                return self.json({"ok": False, "error": str(e)}, 400)
            except Exception as e:
                return self.json({"ok": False, "error": str(e)}, 502)
        if u.path == "/api/rankings":
            try:
                return self.json(rankings())
            except Exception as e:
                return self.json({"ok": False, "error": str(e)}, 502)
        return super().do_GET()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8768)
    args = ap.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"RPi Yahoo News Server v{VERSION}  http://{args.host}:{args.port}/")
    print("content cache: disabled")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
