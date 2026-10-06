import json, re, threading, time, urllib.parse, xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

ORIGIN="https://news.yahoo.co.jp"
RSS=ORIGIN+"/rss/"
PATHS={
 "top":"topics/top-picks.xml","domestic":"categories/domestic.xml","world":"categories/world.xml",
 "business":"categories/business.xml","entertainment":"categories/entertainment.xml","sports":"categories/sports.xml",
 "it":"categories/it.xml","science":"categories/science.xml","life":"categories/life.xml","local":"categories/local.xml",
}
LATEST=["domestic","world","business","entertainment","sports","it","science","life"]
LABELS={
 "latest":"新着","top":"主要","domestic":"国内","world":"国際","business":"経済","entertainment":"エンタメ",
 "sports":"スポーツ","it":"IT","science":"科学","life":"ライフ","local":"地域（東海）",
 "rank_access":"アクセスランキング","rank_comment":"ヤフコメランキング",
}
TOKAI=re.compile(
 r"愛知県|名古屋市?|尾張|三河|豊橋市?|豊田市|岡崎市?|一宮市?|春日井市?|刈谷市?|安城市?|西尾市?|蒲郡市?|"
 r"常滑市?|知多市?|半田市?|犬山市?|小牧市?|瀬戸市?|長久手市?|日進市?|東海市|岐阜県|岐阜市|大垣市?|"
 r"高山市?|多治見市?|各務原市?|可児市?|中津川市?|美濃加茂市?|飛騨|(?<!下)関市|三重県|四日市市?|"
 r"伊勢市?|松阪市?|鈴鹿市?|桑名市?|鳥羽市?|志摩市?|伊賀市?|名張市?|(?<!会)津市|東海三県"
)

def norm_article(raw):
 try:u=urllib.parse.urlparse(str(raw or "").strip())
 except:return None
 if u.scheme!="https" or (u.hostname or "").lower()!="news.yahoo.co.jp":return None
 m=re.fullmatch(r"/articles/([0-9a-fA-F]+)(?:/comments)?/?",u.path)
 if m:return f"{ORIGIN}/articles/{m.group(1).lower()}"
 if re.fullmatch(r"/pickup/\d+/?",u.path):return ORIGIN+u.path.rstrip("/")
 return None

def compact(v):return re.sub(r"\s+"," ",str(v or "")).strip()

def epoch_ms(raw):
 if not raw:return 0
 try:
  d=parsedate_to_datetime(str(raw))
  if d.tzinfo is None:d=d.replace(tzinfo=timezone.utc)
  return int(d.timestamp()*1000)
 except:pass
 try:
  from datetime import datetime
  return int(datetime.fromisoformat(str(raw).replace("Z","+00:00")).timestamp()*1000)
 except:return 0

def preloaded(text):
 m=re.search(r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*</script",text or "",re.S)
 if not m:return {}
 try:return json.loads(m.group(1))
 except:return {}

class Facts(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.meta={};self.links=[];self.title="";self.intitle=False
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);tag=tag.lower()
  if tag=="meta":
   k=(a.get("property") or a.get("name") or "").lower()
   if k and a.get("content"):self.meta[k]=a["content"]
  elif tag=="a" and a.get("href"):self.links.append(a["href"])
  elif tag=="title":self.intitle=True
 def handle_endtag(self,tag):
  if tag.lower()=="title":self.intitle=False
 def handle_data(self,data):
  if self.intitle:self.title+=data

def facts(text):
 p=Facts()
 try:p.feed(text or "")
 except:pass
 return p

def nested(d,*paths):
 for path in paths:
  cur=d;ok=True
  for k in path:
   if not isinstance(cur,dict) or k not in cur:ok=False;break
   cur=cur[k]
  if ok and cur not in (None,"",[]):return cur
 return None

class YahooNewsService:
 def __init__(self,fetcher):
  self.fetcher=fetcher;self.lock=threading.RLock();self.mem={}
 def memo(self,key,ttl,fn):
  now=time.time()
  with self.lock:
   hit=self.mem.get(key)
   if hit and now-hit[0]<ttl:return hit[1]
  value=fn()
  with self.lock:
   self.mem[key]=(now,value)
   if len(self.mem)>256:
    for k,_ in sorted(self.mem.items(),key=lambda x:x[1][0])[:64]:self.mem.pop(k,None)
  return value
 def text(self,url,force=False,timeout=20,referer=""):
  body,meta,state=self.fetcher(url,force=force,timeout=timeout,referer=referer)
  return body.decode("utf-8","replace"),meta or {},state

 def list(self,category="latest"):
  category=str(category or "latest").strip().lower().replace("-","_")
  if category not in LABELS:raise ValueError("bad yahoo category")
  if category in ("rank_access","rank_comment"):
   ranks=self.rankings();key="access" if category=="rank_access" else "comment"
   return {"ok":True,"category":category,"label":LABELS[category],"items":ranks[key]["items"],"checked_at":int(time.time()*1000)}
  def load():
   keys=LATEST if category=="latest" else [category];merged=[];errors=[]
   for key in keys:
    try:merged.extend(self.rss(key))
    except Exception as e:errors.append(f"{key}:{e}")
   if not merged and errors:raise RuntimeError(" / ".join(errors))
   seen=set();out=[]
   for item in sorted(merged,key=lambda x:x.get("date",0),reverse=True):
    if not item.get("link") or item["link"] in seen:continue
    if category=="local" and not TOKAI.search(item.get("title","")):continue
    seen.add(item["link"]);out.append(item)
    if len(out)>=(180 if category=="latest" else 100):break
   return {"ok":True,"category":category,"label":LABELS[category],"items":out,"errors":errors,"checked_at":int(time.time()*1000)}
  return self.memo("list:"+category,90,load)

 def rss(self,key):
  path=PATHS.get(key)
  if not path:return []
  body,_,_=self.fetcher(RSS+path,force=True,timeout=15,referer=ORIGIN+"/")
  root=ET.fromstring(body);out=[]
  for node in root.findall(".//item"):
   title=compact(node.findtext("title")) or "(無題)";url=norm_article(compact(node.findtext("link")))
   if not url:continue
   image=""
   for child in list(node):
    local=child.tag.split("}")[-1].lower()
    if local=="image":image=compact(child.text) or compact(child.attrib.get("url"))
    elif not image and local=="enclosure" and str(child.attrib.get("type","")).lower().startswith("image/"):image=compact(child.attrib.get("url"))
    elif not image and local in ("thumbnail","content"):
     typ=str(child.attrib.get("type","")).lower();candidate=compact(child.attrib.get("url"))
     if candidate and (local=="thumbnail" or not typ or typ.startswith("image/")):image=candidate
   out.append({"title":title,"link":url,"date":epoch_ms(compact(node.findtext("pubDate"))),"category":key,"category_label":LABELS.get(key,key),"image_url":image})
  return out

 def rankings(self):
  def load():
   defs={"access":("アクセスランキング",ORIGIN+"/ranking/access/news"),"comment":("ヤフコメランキング",ORIGIN+"/ranking/comment")}
   result={}
   for key,(title,url) in defs.items():
    rows=[]
    try:
     text,_,_=self.text(url,force=True,timeout=20,referer=ORIGIN+"/");st=preloaded(text)
     for x in ((st.get("rankingFeed") or {}).get("list") or []):
      article=norm_article(x.get("newsLink"))
      if not article:continue
      image=nested(x,("thumbnailUrl",),("imageUrl",),("thumbUrl",),("thumbnail","url"),("image","url"),("thumb","url")) or ""
      rows.append({"title":compact(x.get("headline")) or "(無題)","link":article,"date":epoch_ms(x.get("publishedTime") or x.get("date")),"category":"rank_"+key,"category_label":title,"image_url":image})
      if len(rows)>=10:break
    except:pass
    result[key]={"title":title,"items":rows}
   return result
  return self.memo("rankings",180,load)

 def article(self,raw_url,include_comments=True):
  url=norm_article(raw_url)
  if not url:raise ValueError("Yahoo!ニュースの記事URLではありません")
  return self.memo("article:"+url+(":c" if include_comments else ""),300,lambda:self.article_uncached(url,include_comments))

 def article_uncached(self,url,include_comments):
  text,_,_=self.text(url,force=False,timeout=20,referer=ORIGIN+"/")
  if "/pickup/" in url:
   c=[norm_article(x) for x in re.findall(r'href=["\']([^"\']+)["\']',text,re.I)]
   target=next((x for x in c if x and "/articles/" in x),None)
   if not target:raise RuntimeError("全文リンクを確認できませんでした")
   url=target;text,_,_=self.text(url,force=False,timeout=20,referer=ORIGIN+"/")
  st=preloaded(text);f=facts(text);article_id=urllib.parse.urlparse(url).path.strip("/").split("/")[-1]
  detail=st.get("articleDetail") if isinstance(st,dict) else None
  if not isinstance(detail,dict) or str(detail.get("contentId") or "").lower()!=article_id.lower():detail=None
  title=compact((detail or {}).get("headline")) or compact(f.meta.get("og:title")) or compact(f.title) or "記事"
  provider=compact(((detail or {}).get("media") or {}).get("mediaName")) or compact(f.meta.get("author"))
  date=(detail or {}).get("createDateTime") or f.meta.get("article:published_time") or ""
  hero=compact(f.meta.get("og:image") or f.meta.get("twitter:image") or "")
  body=self.article_body(url,text,detail);photos=self.photos(url,detail)
  comments=self.comments(url,article_id) if include_comments else []
  return {"ok":True,"url":url,"title":title,"provider":provider,"date":epoch_ms(date),"hero_image":hero,"body":body,"photos":photos,"comments":comments,"comment_count":len(comments),"checked_at":int(time.time()*1000)}

 def structured_body(self,detail):
  out=[]
  for p in (detail or {}).get("paragraphs") or []:
   for part in p.get("textDetails") or []:
    items=part.get("paragraphItems")
    text="".join(str(x.get("text") or "") for x in items if isinstance(x,dict)) if isinstance(items,list) else str(part.get("text") or "")
    for chunk in re.split(r"\n\s*\n",text):
     chunk=compact(chunk)
     if chunk:out.append(chunk)
  return out

 def article_body(self,url,first_text,first_detail):
  if not first_detail:return []
  out=self.structured_body(first_detail);total=max(1,int(first_detail.get("maxPage") or 1));text=first_text;path=urllib.parse.urlparse(url).path
  for page in range(2,total+1):
   nxt=None
   for href in facts(text).links:
    absolute=urllib.parse.urljoin(url,href);u=urllib.parse.urlparse(absolute);q=urllib.parse.parse_qs(u.query)
    if u.scheme=="https" and u.hostname=="news.yahoo.co.jp" and u.path==path:
     try:
      if int((q.get("page") or [0])[0])==page:nxt=absolute;break
     except:pass
   if not nxt:break
   text,_,_=self.text(nxt,force=False,timeout=20,referer=url);detail=(preloaded(text).get("articleDetail") or {})
   if str(detail.get("contentId") or "").lower()!=str(first_detail.get("contentId") or "").lower():break
   if int(detail.get("currentPage") or page)!=page:break
   out.extend(self.structured_body(detail))
  return out

 def photos(self,article_url,detail):
  article_id=urllib.parse.urlparse(article_url).path.strip("/").split("/")[-1];candidates=[]
  for p in (detail or {}).get("paragraphs") or []:
   for obj in p.get("objectItems") or []:
    if isinstance(obj,dict) and obj.get("photoDetailUrl"):candidates.append(urllib.parse.urljoin(article_url,obj["photoDetailUrl"]))
  entry=None
  for raw in candidates:
   u=urllib.parse.urlparse(raw)
   if u.scheme=="https" and u.hostname=="news.yahoo.co.jp" and re.fullmatch(rf"/articles/{re.escape(article_id)}/images/\d+/?",u.path,re.I):entry=raw;break
  if not entry:return []
  try:
   text,_,_=self.text(entry,force=False,timeout=20,referer=article_url);d=preloaded(text).get("photoDetail") or {}
   if str(d.get("contentId") or "").lower()!=article_id.lower():return []
   out=[];seen=set()
   for p in d.get("images") or []:
    if not isinstance(p,dict):continue
    raw=compact(((p.get("view") or {}).get("uri")))
    if not raw:continue
    absolute=urllib.parse.urljoin(entry,raw);u=urllib.parse.urlparse(absolute)
    if u.scheme!="https" or not (u.hostname or "").endswith(".yimg.jp"):continue
    key=(u.hostname,u.path)
    if key in seen:continue
    seen.add(key);out.append({"url":absolute,"caption":compact(p.get("caption") or d.get("headline") or "記事の写真")})
   return out[:40]
  except:return []

 def comments(self,article_url,article_id):
  url=f"{ORIGIN}/articles/{article_id}/comments";items=[];seen=set();visited=set()
  while url and len(items)<30 and url not in visited:
   visited.add(url)
   try:text,_,_=self.text(url,force=True,timeout=20,referer=article_url)
   except:break
   st=preloaded(text)
   if str(((st.get("commentArticle") or {}).get("commentArticleId") or "")).lower()!=article_id.lower():break
   full=st.get("commentFull") or {}
   if full.get("commentGetStatus")!="success":break
   added=0
   for c in full.get("userCommentList") or []:
    if not isinstance(c,dict) or str(c.get("commentArticleId") or "").lower()!=article_id.lower():continue
    if c.get("isVisible") is False or c.get("isBlocked") or not c.get("text"):continue
    cid=str(c.get("commentId") or "")
    if cid and cid in seen:continue
    if cid:seen.add(cid)
    items.append({"user":compact(c.get("name")),"time":compact(c.get("postDate")),"text":compact(c.get("text")),"empathy":int(c.get("empathyCount") or 0),"insight":int(c.get("insightCount") or 0),"negative":int(c.get("negativeCount") or 0)});added+=1
    if len(items)>=30:break
   if len(items)>=30 or not added:break
   p=st.get("commentParameter") or {};base=p.get("paginationUrl")
   try:n=int(p.get("commentPage") or 1)+1
   except:break
   if not base:break
   nxt=urllib.parse.urljoin(url,str(base)+str(n));u=urllib.parse.urlparse(nxt)
   if u.scheme!="https" or u.hostname!="news.yahoo.co.jp" or u.path!=f"/articles/{article_id}/comments":break
   url=nxt
  return items[:30]
