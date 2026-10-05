"""Durable publication gate. Only validated, complete local snapshots are visible."""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
import uuid
from collections import OrderedDict
from contextlib import contextmanager
from pathlib import Path

SCHEMA = 33
VIEW_SCHEMA_MIN = 33
# v0.1.231: 500 committed + 300 visible new + configurable hidden standby.
MAX_BODY_CACHE = 500
MAX_NEW_BUFFER = 300
STANDBY_CHOICES = (500, 1000, 1500, 2000, 2500, 3000)
DEFAULT_STANDBY = 1000
MAX_STANDBY = max(STANDBY_CHOICES)
MAX_PUBLISHED = MAX_BODY_CACHE + MAX_NEW_BUFFER + MAX_STANDBY
MAX_DISCOVERY = MAX_PUBLISHED

# v0.1.215 topic de-duplication policy.  The enforcement window stays at the
# existing 48 hours; a wider 7-day observation window is kept only to measure
# whether that window should ever change.  Audit rows are tiny, so keep 30 days
# for later inspection without affecting article/cache retention.
TOPIC_DUP_WINDOW_MS = 48 * 60 * 60 * 1000
TOPIC_OBSERVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
TOPIC_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
TOPIC_PREFIX_RE = re.compile(r'^(?:(?:【|\[|（|\()?(?:悲報|朗報|速報|画像|動画|衝撃|緊急|炎上|話題|驚愕|注意|困惑|疑問|唖然|愕然)(?:】|\]|）|\))?[!！?？:：\s]*)+', re.I)


def _topic_normalize(title):
    s = str(title or '').replace('\u00a0', ' ').strip()
    try:
        s = unicodedata.normalize('NFKC', s)
    except Exception:
        pass
    s = s.lower()
    while True:
        n = TOPIC_PREFIX_RE.sub('', s)
        if n == s:
            break
        s = n
    s = re.sub(r'[wｗ]{2,}', '', s, flags=re.I)
    out = []
    for ch in s:
        if ch == '_' or ch.isspace():
            continue
        cat = unicodedata.category(ch)
        if cat and cat[0] in ('P', 'S', 'Z'):
            continue
        out.append(ch)
    return ''.join(out)


def _topic_fuzzy_form(s):
    x = str(s or '')
    x = re.sub(r'(?:さん|ちゃん|くん|君|氏|様)', '', x)
    x = re.sub(r'(?:いたしました|致しました)', 'した', x)
    x = x.replace('しました', 'した')
    x = re.sub(r'(?:いたします|致します)', 'する', x)
    x = x.replace('します', 'する')
    x = re.sub(r'(?:なお|ちなみに|ただし)', '', x)
    x = re.sub(r'(?:ガチで|まじで|マジで|マジに|ガチに)', '', x)
    return re.sub(r'[はがをにへともで]', '', x)


def _topic_bigram_dice(a, b):
    if a == b:
        return 1.0
    if len(a) < 2 or len(b) < 2:
        return 0.0
    aa = {a[i:i+2] for i in range(len(a)-1)}
    bb = {b[i:i+2] for i in range(len(b)-1)}
    return (2.0 * len(aa & bb)) / float(len(aa) + len(bb) or 1)


def _topic_numbers(s):
    # NFKC has already normalized full-width digits.  If both titles contain
    # explicit numbers and those values differ, keep both: price/age/count/date
    # differences can change the meaning of an article.
    return tuple(sorted(re.findall(r'\d+(?:\.\d+)?', str(s or ''))))


TOPIC_NEGATION_RE = re.compile(r'(?:ない|なし|無し|せず|しない|できない|なかった|ません|未確認|否定)')


def _topic_important_conflict(norm_a, norm_b):
    nums_a, nums_b = _topic_numbers(norm_a), _topic_numbers(norm_b)
    if nums_a and nums_b and nums_a != nums_b:
        return ('important_number_conflict', {'candidate_numbers':list(nums_a),'matched_numbers':list(nums_b)})
    neg_a = bool(TOPIC_NEGATION_RE.search(str(norm_a or '')))
    neg_b = bool(TOPIC_NEGATION_RE.search(str(norm_b or '')))
    if neg_a != neg_b:
        return ('negation_conflict', {'candidate_negation':neg_a,'matched_negation':neg_b})
    return None


def _topic_match(norm_a, norm_b, protect_important=True):
    if not norm_a or not norm_b:
        return None
    if protect_important and _topic_important_conflict(norm_a, norm_b):
        return None
    if norm_a == norm_b:
        return {'reason':'normalized_exact','score':1.0}
    min_len = min(len(norm_a), len(norm_b))
    max_len = max(len(norm_a), len(norm_b))
    if min_len < 8:
        return None
    ratio = min_len / float(max_len or 1)
    if min_len >= 10 and ratio >= 0.78 and (norm_a in norm_b or norm_b in norm_a):
        return {'reason':'containment','score':1.0}
    if ratio < 0.82 or norm_a[:3] != norm_b[:3]:
        return None
    score = _topic_bigram_dice(_topic_fuzzy_form(norm_a), _topic_fuzzy_form(norm_b))
    if score >= 0.86:
        return {'reason':'dice','score':score}
    return None
MAX_RETRY_ATTEMPTS = 5
RETRY_BASE_SECONDS = 15
RETRY_MAX_SECONDS = 300
ASSET_RE = re.compile(r"^/prepared/assets/([a-f0-9]{64}\.[a-z0-9]{1,8})$")


class ReadyStore:
    def __init__(self, cache):
        self.root = Path(cache) / 'prepared'
        self.assets = self.root / 'assets'
        self.bodies = self.root / 'bodies'
        self.mobile = self.root / 'mobile'
        self.assets.mkdir(parents=True, exist_ok=True)
        self.bodies.mkdir(exist_ok=True)
        self.mobile.mkdir(exist_ok=True)
        self.db = self.root / 'ready.sqlite3'
        self._article_cache = OrderedDict()
        self._article_cache_lock = threading.RLock()
        # Expensive ownership/GC scans must not run once per downloaded image.
        # A completed article still calls maintain() explicitly, while capacity probes
        # use this per-process throttle to avoid hammering SQLite + the SD card.
        self._maintain_lock = threading.RLock()
        self._maintain_last = 0.0
        with self.connect() as c:
            c.execute('PRAGMA journal_mode=WAL')
            c.executescript('''
                CREATE TABLE IF NOT EXISTS articles (
                  url TEXT PRIMARY KEY, item TEXT NOT NULL, source_time REAL NOT NULL,
                  ready_time REAL, state TEXT NOT NULL DEFAULT 'pending',
                  attempts INTEGER NOT NULL DEFAULT 0, retry_at REAL NOT NULL DEFAULT 0,
                  body_file TEXT, assets TEXT, title TEXT, thumb TEXT, error TEXT, view_until REAL NOT NULL DEFAULT 0,
                  schema_version INTEGER NOT NULL DEFAULT 33, legacy_public_time REAL NOT NULL DEFAULT 0,
                  revision TEXT NOT NULL DEFAULT '', release_time REAL NOT NULL DEFAULT 0);
                CREATE INDEX IF NOT EXISTS ready_order ON articles(state,ready_time DESC);
                CREATE INDEX IF NOT EXISTS queue_due ON articles(state,retry_at,attempts,source_time DESC);
                CREATE TABLE IF NOT EXISTS status (key TEXT PRIMARY KEY,value TEXT);
                CREATE TABLE IF NOT EXISTS asset_sources (url TEXT PRIMARY KEY,path TEXT NOT NULL,kind TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS asset_files (path TEXT PRIMARY KEY,size INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS asset_claims (
                  article TEXT NOT NULL,path TEXT NOT NULL,touched REAL NOT NULL,
                  PRIMARY KEY(article,path));
                CREATE INDEX IF NOT EXISTS asset_claims_touched ON asset_claims(touched);
                CREATE TABLE IF NOT EXISTS capacity_reservations (
                  token TEXT PRIMARY KEY, bytes INTEGER NOT NULL, touched REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS capacity_reservations_touched ON capacity_reservations(touched);
                CREATE TABLE IF NOT EXISTS raw_gc (url TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS topic_history (
                  url TEXT PRIMARY KEY,title TEXT NOT NULL,norm TEXT NOT NULL,bucket2 TEXT NOT NULL,
                  source TEXT NOT NULL DEFAULT '',source_time REAL NOT NULL,
                  first_seen REAL NOT NULL,last_seen REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS topic_history_bucket_time ON topic_history(bucket2,source_time DESC);
                CREATE INDEX IF NOT EXISTS topic_history_time ON topic_history(source_time DESC);
                CREATE TABLE IF NOT EXISTS topic_dedupe_log (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,created_at REAL NOT NULL,action TEXT NOT NULL,
                  candidate_url TEXT NOT NULL,candidate_title TEXT NOT NULL,candidate_source TEXT NOT NULL DEFAULT '',candidate_time REAL NOT NULL,
                  matched_url TEXT NOT NULL,matched_title TEXT NOT NULL,matched_source TEXT NOT NULL DEFAULT '',matched_time REAL NOT NULL,
                  reason TEXT NOT NULL,score REAL NOT NULL DEFAULT 0,age_hours REAL NOT NULL DEFAULT 0,details TEXT NOT NULL DEFAULT '');
                CREATE INDEX IF NOT EXISTS topic_dedupe_log_created ON topic_dedupe_log(created_at DESC);
                CREATE TABLE IF NOT EXISTS shared_reads (
                  url TEXT PRIMARY KEY,read_at REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS shared_reads_time ON shared_reads(read_at DESC);
            ''')
            cols={r['name'] for r in c.execute('PRAGMA table_info(articles)')}
            if 'legacy_public_time' not in cols:
                c.execute('ALTER TABLE articles ADD COLUMN legacy_public_time REAL NOT NULL DEFAULT 0')
            if 'revision' not in cols:
                c.execute("ALTER TABLE articles ADD COLUMN revision TEXT NOT NULL DEFAULT ''")
            release_added = False
            if 'release_time' not in cols:
                c.execute("ALTER TABLE articles ADD COLUMN release_time REAL NOT NULL DEFAULT 0")
                c.execute("""UPDATE articles SET release_time=COALESCE(ready_time,0)
                             WHERE body_file IS NOT NULL AND ready_time IS NOT NULL""")
                release_added = True
            # Existing installations already have their committed 500-item cache.
            # Freeze its newest completion time as the buffer boundary on first v0.1.209 start.
            marker=c.execute("SELECT value FROM status WHERE key='new_buffer_cutoff'").fetchone()
            if marker is None:
                row=c.execute("SELECT MAX(release_time) t FROM articles WHERE body_file IS NOT NULL AND ready_time IS NOT NULL AND release_time>0 AND state IN ('ready','retry','preparing')").fetchone()
                if row and row['t']:
                    c.execute('INSERT INTO status(key,value) VALUES (?,?)',('new_buffer_cutoff',json.dumps(float(row['t']))))
                    marker=c.execute("SELECT value FROM status WHERE key='new_buffer_cutoff'").fetchone()
            # One-time migration: preserve at most 300 currently-visible new rows.
            # Older excess rows become hidden standby, never deleted.
            if release_added and marker is not None:
                try:
                    cutoff=float(json.loads(marker['value']))
                except Exception:
                    cutoff=0
                if cutoff>0:
                    excess=c.execute("""SELECT url FROM articles
                      WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                        AND release_time>? AND state IN ('ready','retry','preparing')
                      ORDER BY release_time DESC,url LIMIT -1 OFFSET ?""",
                      (VIEW_SCHEMA_MIN,cutoff,MAX_NEW_BUFFER)).fetchall()
                    if excess:
                        c.executemany("UPDATE articles SET release_time=0 WHERE url=?",[(r['url'],) for r in excess])
            c.execute('INSERT OR IGNORE INTO status(key,value) VALUES (?,?)',('standby_target',json.dumps(DEFAULT_STANDBY)))
            self._topic_seed_history(c)
            c.execute('INSERT OR REPLACE INTO status(key,value) VALUES (?,?)',('topic_dedupe_policy_version',json.dumps(215)))

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.db, timeout=15)
        c.row_factory = sqlite3.Row
        try:
            c.execute('PRAGMA synchronous=NORMAL')
            with c:
                yield c
        finally:
            c.close()

    @staticmethod
    def atomic(path, data):
        tmp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
        try:
            with tmp.open('wb') as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)

    def set_status(self, key, value):
        with self.connect() as c:
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)', (key, json.dumps(value, ensure_ascii=False)))

    def mark_shared_reads(self, urls):
        """Persist shared read state without delaying article navigation."""
        clean=[];seen=set()
        for raw in urls or []:
            url=str(raw or '').strip()
            if not url.startswith(('http://','https://')) or url in seen:
                continue
            seen.add(url);clean.append(url)
            if len(clean)>=3000:
                break
        if not clean:
            return {'count':self.shared_read_count(),'updated_at':self.shared_read_updated_at()}
        now_ms=time.time()*1000.0
        with self.connect() as c:
            c.executemany(
                "INSERT INTO shared_reads(url,read_at) VALUES (?,?) ON CONFLICT(url) DO UPDATE SET read_at=MAX(shared_reads.read_at,excluded.read_at)",
                [(u,now_ms) for u in clean])
            # Keep the same bounded history size as the old browser-only read list.
            c.execute("DELETE FROM shared_reads WHERE url NOT IN (SELECT url FROM shared_reads ORDER BY read_at DESC,url LIMIT 3000)")
            row=c.execute('SELECT COUNT(*) n,COALESCE(MAX(read_at),0) updated_at FROM shared_reads').fetchone()
            return {'count':int(row['n'] or 0),'updated_at':float(row['updated_at'] or 0)}

    def shared_read_state(self, since=0):
        """Return only read URLs newer than ``since`` for fast multi-device sync."""
        try: since=float(since or 0)
        except Exception: since=0.0
        with self.connect() as c:
            row=c.execute('SELECT COUNT(*) n,COALESCE(MAX(read_at),0) updated_at FROM shared_reads').fetchone()
            updated_at=float(row['updated_at'] or 0)
            rows=c.execute('SELECT url,read_at FROM shared_reads WHERE read_at>? ORDER BY read_at,url LIMIT 3000',(since,)).fetchall()
        return {
            'urls':[str(r['url']) for r in rows],
            'updated_at':updated_at,
            'count':int(row['n'] or 0),
        }

    def shared_read_count(self):
        with self.connect() as c:
            return int(c.execute('SELECT COUNT(*) FROM shared_reads').fetchone()[0] or 0)

    def shared_read_updated_at(self):
        with self.connect() as c:
            return float(c.execute('SELECT COALESCE(MAX(read_at),0) FROM shared_reads').fetchone()[0] or 0)

    def status(self):
        with self.connect() as c:
            result = {r['key']: json.loads(r['value']) for r in c.execute('SELECT * FROM status')}
            result['counts'] = {r['state']: r['n'] for r in c.execute('SELECT state,COUNT(*) n FROM articles GROUP BY state')}
        return result

    def _topic_seed_history(self, c):
        now_ms = time.time() * 1000.0
        cutoff = now_ms - TOPIC_OBSERVE_WINDOW_MS
        rows = c.execute("""SELECT url,item,source_time,state FROM articles
                            WHERE source_time>=? AND state='ready'""", (cutoff,)).fetchall()
        for row in rows:
            try:
                item = json.loads(row['item'])
            except Exception:
                continue
            title = str(item.get('title') or '')
            norm = _topic_normalize(title)
            if not norm:
                continue
            source = str(item.get('source') or '')
            seen = now_ms
            c.execute("""INSERT INTO topic_history(url,title,norm,bucket2,source,source_time,first_seen,last_seen)
                         VALUES (?,?,?,?,?,?,?,?)
                         ON CONFLICT(url) DO UPDATE SET title=excluded.title,norm=excluded.norm,bucket2=excluded.bucket2,
                           source=excluded.source,source_time=excluded.source_time,last_seen=excluded.last_seen""",
                      (row['url'], title, norm, norm[:2], source, float(row['source_time'] or 0), seen, seen))
        c.execute('DELETE FROM topic_history WHERE source_time<?', (cutoff,))
        c.execute('DELETE FROM topic_dedupe_log WHERE created_at<?', (now_ms - TOPIC_AUDIT_RETENTION_MS,))

    def _topic_log(self, c, action, item, ts, match, reason, score, age_hours, details=None):
        now_ms = time.time() * 1000.0
        title = str(item.get('title') or '')
        source = str(item.get('source') or '')
        details_text = json.dumps(details or {}, ensure_ascii=False, separators=(',',':'))
        c.execute("""INSERT INTO topic_dedupe_log(
                     created_at,action,candidate_url,candidate_title,candidate_source,candidate_time,
                     matched_url,matched_title,matched_source,matched_time,reason,score,age_hours,details)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (now_ms, action, str(item.get('link') or ''), title, source, float(ts or 0),
                   str(match['url']), str(match['title']), str(match['source'] or ''), float(match['source_time'] or 0),
                   str(reason), float(score or 0), float(age_hours or 0), details_text))
        payload = {
            'action': action, 'url': str(item.get('link') or ''), 'title': title[:180], 'source': source,
            'matched_url': str(match['url']), 'matched_title': str(match['title'])[:180],
            'matched_source': str(match['source'] or ''), 'reason': str(reason),
            'score': round(float(score or 0), 6), 'age_hours': round(float(age_hours or 0), 3)
        }
        if details:
            payload.update(details)
        print('TOPIC_DEDUPE '+json.dumps(payload, ensure_ascii=False, separators=(',',':')), flush=True)

    def _topic_existing_match(self, c, item, ts):
        title = str(item.get('title') or '')
        norm = _topic_normalize(title)
        if not norm or len(norm) < 2 or not ts:
            return None
        low = float(ts) - TOPIC_OBSERVE_WINDOW_MS
        high = float(ts) + TOPIC_OBSERVE_WINDOW_MS
        rows = c.execute("""SELECT url,title,norm,source,source_time FROM topic_history
                            WHERE bucket2=? AND source_time BETWEEN ? AND ? AND url<>?
                            ORDER BY ABS(source_time-?) ASC LIMIT 400""",
                         (norm[:2], low, high, str(item.get('link') or ''), float(ts))).fetchall()
        best_observe = None
        best_protected = None
        best_gate = None
        for row in rows:
            other = str(row['norm'] or '')
            age_ms = abs(float(ts) - float(row['source_time'] or 0))
            raw_match = _topic_match(norm, other, protect_important=False)
            safe_match = _topic_match(norm, other, protect_important=True)
            if raw_match and not safe_match:
                # Audit safety guard: important numeric values or explicit negation differ.
                conflict = _topic_important_conflict(norm, other)
                reason, details = conflict if conflict else ('important_semantic_conflict', {})
                protected = {'action':'protected','match':row,'reason':reason,
                             'score':float(raw_match.get('score') or 0),'age_ms':age_ms,'details':details}
                if best_protected is None:
                    best_protected = protected
                continue
            if not safe_match:
                # High fuzzy similarity that current gates intentionally leave alone.
                # Record only; do not widen the automatic suppression rule yet.
                if not _topic_important_conflict(norm, other):
                    diag = _topic_bigram_dice(_topic_fuzzy_form(norm), _topic_fuzzy_form(other))
                    if diag >= 0.86 and min(len(norm),len(other)) >= 8 and best_gate is None:
                        best_gate={'action':'observe_gate','match':row,'reason':'current_gate_blocked',
                                   'score':diag,'age_ms':age_ms,
                                   'details':{'first3_same':norm[:3]==other[:3],
                                              'length_ratio':round(min(len(norm),len(other))/float(max(len(norm),len(other)) or 1),6)}}
                continue
            data = {'match':row,'reason':safe_match['reason'],'score':float(safe_match.get('score') or 0),'age_ms':age_ms,'details':{}}
            if age_ms <= TOPIC_DUP_WINDOW_MS:
                data['action'] = 'skip'
                return data
            if best_observe is None:
                data['action'] = 'observe_window'
                best_observe = data

        # The production rule deliberately buckets by the first two normalized characters.
        # Audit a small number of nearby rows outside that bucket too, but never suppress them.
        if best_gate is None:
            outside = c.execute("""SELECT url,title,norm,source,source_time FROM topic_history
                                   WHERE bucket2<>? AND source_time BETWEEN ? AND ? AND url<>?
                                   ORDER BY ABS(source_time-?) ASC LIMIT 200""",
                                (norm[:2], low, high, str(item.get('link') or ''), float(ts))).fetchall()
            for row in outside:
                other=str(row['norm'] or '')
                if _topic_important_conflict(norm,other) or min(len(norm),len(other))<8:
                    continue
                diag=_topic_bigram_dice(_topic_fuzzy_form(norm),_topic_fuzzy_form(other))
                if diag>=0.86:
                    age_ms=abs(float(ts)-float(row['source_time'] or 0))
                    best_gate={'action':'observe_gate','match':row,'reason':'bucket_or_gate_blocked',
                               'score':diag,'age_ms':age_ms,
                               'details':{'first2_same':False,'first3_same':norm[:3]==other[:3],
                                          'length_ratio':round(min(len(norm),len(other))/float(max(len(norm),len(other)) or 1),6)}}
                    break
        return best_protected or best_observe or best_gate

    def _topic_upsert_history(self, c, url, item, ts):
        title = str(item.get('title') or '')
        norm = _topic_normalize(title)
        if not norm or not ts:
            return
        now_ms = time.time() * 1000.0
        c.execute("""INSERT INTO topic_history(url,title,norm,bucket2,source,source_time,first_seen,last_seen)
                     VALUES (?,?,?,?,?,?,?,?)
                     ON CONFLICT(url) DO UPDATE SET title=excluded.title,norm=excluded.norm,bucket2=excluded.bucket2,
                       source=excluded.source,source_time=excluded.source_time,last_seen=excluded.last_seen""",
                  (url, title, norm, norm[:2], str(item.get('source') or ''), float(ts), now_ms, now_ms))

    @staticmethod
    def _clamp_standby_target(value):
        try:
            n=int(value)
        except Exception:
            n=DEFAULT_STANDBY
        return min(STANDBY_CHOICES,key=lambda x:abs(x-n))

    def standby_target(self):
        with self.connect() as c:
            row=c.execute("SELECT value FROM status WHERE key='standby_target'").fetchone()
            try:return self._clamp_standby_target(json.loads(row['value'])) if row else DEFAULT_STANDBY
            except Exception:return DEFAULT_STANDBY

    def set_standby_target(self, value):
        n=self._clamp_standby_target(value)
        with self.connect() as c:
            c.execute('INSERT OR REPLACE INTO status(key,value) VALUES (?,?)',('standby_target',json.dumps(n)))
        self.maintain()
        return n

    def standby_count(self):
        with self.connect() as c:
            return int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time<=0 AND state IN ('ready','retry','preparing')""",
                (VIEW_SCHEMA_MIN,)).fetchone()[0] or 0)

    def discover(self, items, authoritative=True):
        clean = {}
        for item in items:
            url = str(item.get('link') or '')
            if not re.match(r'^https?://', url):
                continue
            # Input timestamps and public timestamps are milliseconds since Unix epoch.
            source_time = float(item.get('source_time') or item.get('timestamp') or 0)
            if source_time != source_time or source_time < 0:
                source_time = 0
            clean[url] = (dict(item, source_time=source_time), source_time)
        discovery_limit=min(MAX_DISCOVERY,MAX_BODY_CACHE+MAX_NEW_BUFFER+self.standby_target())
        latest = sorted(clean.items(), key=lambda x: x[1][1], reverse=True)[:discovery_limit]
        with self.connect() as c:
            initial = c.execute("SELECT value FROM status WHERE key='initial_urls'").fetchone()
            initial_urls = []
            if initial:
                try: initial_urls = list(json.loads(initial['value']))
                except Exception: initial_urls = []
            # The initial preparation target remains the committed 500-item cache.
            # v0.1.214 only expands the separate unconsumed new-item buffer to 500.
            if latest and (not initial_urls or len(initial_urls) != min(MAX_BODY_CACHE, len(latest))):
                initial_urls = [u for u, _ in latest[:MAX_BODY_CACHE]]
                c.execute('INSERT OR REPLACE INTO status VALUES (?,?)', ('initial_urls', json.dumps(initial_urls)))
                ready_now = {r['url'] for r in c.execute("SELECT url FROM articles WHERE state='ready' AND url IN (%s)" % ','.join('?'*len(initial_urls)), initial_urls)} if initial_urls else set()
                c.execute('INSERT OR REPLACE INTO status VALUES (?,?)', ('initial_completed', json.dumps(sorted(ready_now))))
            latest_urls=[u for u, _ in latest]
            known={}
            if latest_urls:
                placeholders=','.join('?' for _ in latest_urls)
                known={r['url']:(str(r['state'] or ''),str(r['error'] or '')) for r in
                       c.execute(f"SELECT url,state,error FROM articles WHERE url IN ({placeholders})",latest_urls)}
            topic_stats={'checked_new':0,'skipped':0,'protected':0,'observe_window':0,'observe_gate':0}
            for url, (item, ts) in latest:
                prior=known.get(url)
                # v0.1.215: only genuinely new URLs are compared against topic history.
                # Existing URLs must retain their ready/retry state and are never reclassified
                # merely because the worker restarted or a saved snapshot was loaded.
                decision=None
                if prior is None:
                    topic_stats['checked_new']+=1
                    decision=self._topic_existing_match(c,item,ts)
                    if decision:
                        age_hours=float(decision['age_ms'])/(60*60*1000.0)
                        self._topic_log(c,decision['action'],dict(item,link=url),ts,decision['match'],
                                        decision['reason'],decision['score'],age_hours,decision.get('details'))
                        topic_stats[decision['action']]=topic_stats.get(decision['action'],0)+1
                        if decision['action']=='skip':
                            err='類似タイトル重複(48h): '+str(decision['match']['url'])
                            c.execute("""INSERT INTO articles(url,item,source_time,state,error) VALUES (?,?,?,'evicted',?)
                                         ON CONFLICT(url) DO NOTHING""",
                                      (url,json.dumps(item,ensure_ascii=False),ts,err))
                            continue

                # A temporary latest-window eviction must be reversible.  Previously an item
                # that disappeared during a partial discovery stayed evicted forever even after
                # the same URL came back.  Site-policy evictions are still re-applied immediately
                # by filter_unpublished_sources().
                c.execute('''INSERT INTO articles(url,item,source_time) VALUES (?,?,?)
                  ON CONFLICT(url) DO UPDATE SET
                    item=excluded.item,source_time=excluded.source_time,
                    state=CASE WHEN articles.state='evicted' AND articles.error IN ('最新300件の対象外','最新500件の対象外','最新待機枠の対象外') THEN 'pending' ELSE articles.state END,
                    retry_at=CASE WHEN articles.state='evicted' AND articles.error IN ('最新300件の対象外','最新500件の対象外','最新待機枠の対象外') THEN 0 ELSE articles.retry_at END,
                    error=CASE WHEN articles.state='evicted' AND articles.error IN ('最新300件の対象外','最新500件の対象外','最新待機枠の対象外') THEN NULL ELSE articles.error END
                ''', (url, json.dumps(item, ensure_ascii=False), ts))
            now_ms=time.time()*1000.0
            c.execute('DELETE FROM topic_history WHERE source_time<?',(now_ms-TOPIC_OBSERVE_WINDOW_MS,))
            c.execute('DELETE FROM topic_dedupe_log WHERE created_at<?',(now_ms-TOPIC_AUDIT_RETENTION_MS,))
            topic_stats['history_rows']=int(c.execute('SELECT COUNT(*) n FROM topic_history').fetchone()['n'])
            topic_stats['log_rows']=int(c.execute('SELECT COUNT(*) n FROM topic_dedupe_log').fetchone()['n'])
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',('topic_dedupe_last',json.dumps(topic_stats,ensure_ascii=False)))
            active_urls=[u for u, _ in latest]
            # Missing URLs are only evidence of eviction when every configured discovery source
            # completed.  A partial antenna/RSS outage must not permanently discard candidates.
            if authoritative and active_urls:
                placeholders=','.join('?' for _ in active_urls)
                c.execute(f"UPDATE articles SET state='evicted',error='最新待機枠の対象外' "
                          f"WHERE state IN ('pending','retry','failed') AND url NOT IN ({placeholders})", active_urls)
                c.execute("DELETE FROM asset_claims WHERE article IN (SELECT url FROM articles WHERE state='evicted')")
        self.set_status('last_discovery', int(time.time()*1000))
        return len(latest)

    def filter_unpublished_sources(self, allowed):
        allowed = set(str(x) for x in (allowed or []) if x)
        if not allowed:
            return 0
        changed = 0
        with self.connect() as c:
            rows = c.execute("SELECT url,item,state FROM articles WHERE state IN ('pending','retry','failed','ready')").fetchall()
            for row in rows:
                try: source = str(json.loads(row['item']).get('source') or '')
                except Exception: source = ''
                if source in allowed:
                    continue
                if row['state'] == 'ready':
                    c.execute("UPDATE articles SET state='retired',view_until=0,error='許可サイト外のため公開終了' WHERE url=?", (row['url'],))
                else:
                    c.execute("UPDATE articles SET state='evicted',error='許可サイト外のため候補除外' WHERE url=?", (row['url'],))
                changed += 1
            c.execute("DELETE FROM asset_claims WHERE article IN (SELECT url FROM articles WHERE state='evicted')")
            # Disabled-source topics must not suppress articles from still-enabled sources.
            c.execute("DELETE FROM topic_history WHERE url IN (SELECT url FROM articles WHERE state IN ('evicted','retired') AND error LIKE '許可サイト外%')")
        return changed

    def next_job(self):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            while True:
                row = c.execute("""SELECT * FROM articles
                  WHERE state IN ('pending','retry') AND retry_at<=?
                  ORDER BY CASE
                    WHEN state='retry' AND error='表示品質チェックによる優先再抽出' THEN 0
                    WHEN state='retry' AND error LIKE '優先再抽出:%' THEN 1
                    WHEN state='pending' THEN 2
                    ELSE 3 END,
                    attempts ASC, source_time DESC LIMIT 1""", (time.time(),)).fetchone()
                if not row:
                    return None
                # Recheck duplicate topics immediately before expensive preparation.
                # This catches two similar URLs discovered in the same batch: once the first
                # completes and enters topic_history, the second is evicted before rendering.
                if row['state']=='pending' and not row['body_file']:
                    try:
                        candidate=json.loads(row['item'])
                        decision=self._topic_existing_match(c,candidate,float(row['source_time'] or 0))
                    except Exception:
                        decision=None
                    if decision and decision.get('action')=='skip':
                        age_hours=float(decision['age_ms'])/(60*60*1000.0)
                        self._topic_log(c,'skip',dict(candidate,link=row['url']),float(row['source_time'] or 0),
                                        decision['match'],decision['reason'],decision['score'],age_hours,decision.get('details'))
                        c.execute("UPDATE articles SET state='evicted',error=? WHERE url=?",
                                  ('類似タイトル重複(48h): '+str(decision['match']['url']),row['url']))
                        c.execute('DELETE FROM asset_claims WHERE article=?',(row['url'],))
                        continue
                c.execute("UPDATE articles SET state='preparing',attempts=attempts+1 WHERE url=?", (row['url'],))
                break
        item=json.loads(row['item'])
        # v0.1.102: Preserve queue provenance for structured retry/success logging.
        # These private keys are ignored by the article extractor.
        item['_queue_state']=str(row['state'] or '')
        item['_attempt_number']=int(row['attempts'] or 0)+1
        # v0.1.97: Alfalfalfa/GOSSIPの再準備は、古いraw HTMLを再利用すると公開後に増えた
        # コメントが永久に反映されない。retry時だけ記事HTMLをoriginから取り直す。
        if row['state']=='retry' and (
            re.search(r'://(?:www\.)?(?:alfalfalfa\.com|gossip1\.net)/', str(item.get('link') or ''), re.I)
            or re.search(r'://news23vip\.livedoor\.blog/', str(item.get('link') or ''), re.I)
            or re.search(r'://blog\.livedoor\.jp/news23vip/', str(item.get('link') or ''), re.I)
            or re.search(r'://(?:blog\.)?esuteru\.com/', str(item.get('link') or ''), re.I)
        ):
            item['_force_article_refresh']=True
        return item

    def recover(self):
        with self.connect() as c:
            c.execute("UPDATE articles SET state='retry',retry_at=0,error='処理中の再起動から再開' WHERE state='preparing'")

    def migrate_retry_policy(self, version=2):
        """Apply retry-policy migrations once without deleting ready cache.

        v2 makes single remote media failures non-fatal, so old retries created by the
        stricter policy are worth retrying promptly.  Stagger them to avoid a Chromium
        burst immediately after upgrade.
        """
        key='retry_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return 0
            rows=c.execute("SELECT url FROM articles WHERE state='retry' ORDER BY source_time DESC").fetchall()
            for i,row in enumerate(rows):
                c.execute("UPDATE articles SET retry_at=?,attempts=MIN(attempts,2) WHERE url=?",(now+min(i*3,300),row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return len(rows)

    def migrate_extraction_policy(self, version=177):
        """Rebuild current articles whose site-specific extraction changed through v0.1.78.

        Existing completed snapshots stay readable while state is retry/preparing, so this
        migration is invisible to readers.  Jobs are staggered to avoid a startup burst.
        """
        key='extraction_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return 0
            rows=c.execute("""SELECT url FROM articles
              WHERE state='ready' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND (url LIKE '%://konoyubitomare.jp/%'
                  OR url LIKE '%://www.konoyubitomare.jp/%'
                  OR url LIKE '%://world-fusigi.net/%'
                  OR url LIKE '%://www.world-fusigi.net/%'
                  OR url LIKE '%://usi32.com/%'
                  OR url LIKE '%://www.usi32.com/%'
                  OR url LIKE '%://news23vip.livedoor.blog/%'
                  OR url LIKE '%://itainews.com/%'
                  OR url LIKE '%://www.itainews.com/%'
                  OR url LIKE '%://blog.esuteru.com/%')
              ORDER BY ready_time DESC""").fetchall()
            for i,row in enumerate(rows):
                c.execute("""UPDATE articles SET state='retry',retry_at=?,attempts=0,
                  error='v0.1.78 本文・X埋め込みルールで裏更新中' WHERE url=?""",
                  (now+2+i*2,row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return len(rows)

    def migrate_direct_video_policy(self, version=183):
        """Rebuild ready itaishinja snapshots after preserving naked MP4/video.twimg links."""
        key='direct_video_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return 0
            rows=c.execute("""SELECT url FROM articles
              WHERE state='ready' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND (url LIKE '%://itaishinja.com/%' OR url LIKE '%://www.itaishinja.com/%')
              ORDER BY ready_time DESC""").fetchall()
            for i,row in enumerate(rows):
                c.execute("""UPDATE articles SET state='retry',retry_at=?,attempts=0,
                  error='v0.1.83 動画直リンク保護ルールで裏更新中' WHERE url=?""",
                  (now+2+i*2,row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return len(rows)

    def migrate_navigation_cleanup_policy(self, version=184):
        """Rebuild providers whose article tail/navigation blocks were previously mixed into body."""
        key='navigation_cleanup_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return 0
            rows=c.execute("""SELECT url FROM articles
              WHERE state='ready' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND (url LIKE '%://goldennews.blog.jp/%'
                  OR url LIKE '%://blog.livedoor.jp/goldennews/%'
                  OR url LIKE '%://vippers.jp/%'
                  OR url LIKE '%://www.vippers.jp/%'
                  OR url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%')
              ORDER BY ready_time DESC""").fetchall()
            for i,row in enumerate(rows):
                c.execute("""UPDATE articles SET state='retry',retry_at=?,attempts=0,
                  error='v0.1.88 記事内おすすめ・関連記事除去ルールで裏更新中' WHERE url=?""",
                  (now+2+i*2,row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return len(rows)

    def migrate_queue_policy(self, version=189):
        """Bound retry backlog and retire stale migration retries without losing ready snapshots."""
        key='queue_policy_version'
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'stale_ready':0,'stopped_ready':0,'stopped_failed':0}
            stale_ready=c.execute("""UPDATE articles SET state='ready',retry_at=0,
              error='旧バージョンの再準備待ちを整理・旧完成版を継続表示'
              WHERE state='retry' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND error LIKE 'v0.1.%裏更新中'""").rowcount
            stopped_ready=c.execute("""UPDATE articles SET state='ready',retry_at=0,
              error='再準備を5回失敗したため旧完成版を継続表示'
              WHERE state='retry' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND attempts>=? AND NOT (error='表示品質チェックによる優先再抽出' OR error LIKE '優先再抽出:%')""",
              (MAX_RETRY_ATTEMPTS,)).rowcount
            stopped_failed=c.execute("""UPDATE articles SET state='failed',retry_at=?,
              error=COALESCE(error,'') || ' / 5回失敗で自動停止'
              WHERE state='retry' AND (body_file IS NULL OR ready_time IS NULL)
                AND attempts>=? AND NOT (error='表示品質チェックによる優先再抽出' OR error LIKE '優先再抽出:%')""",
              (time.time(),MAX_RETRY_ATTEMPTS,)).rowcount
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'stale_ready':stale_ready,'stopped_ready':stopped_ready,'stopped_failed':stopped_failed}

    def migrate_site_profile_policy(self, version=208):
        """Priority-rebuild only providers whose dedicated profile changed.

        v0.1.90 introduced several provider profiles. v0.1.91 changed only GOSSIP/ラビット.
        v0.1.93 changed JIN/comment/media handling. v0.1.94 additionally fixes VIPPERな俺 and Alfalfalfa reader comments.
        v0.1.97 rebuilt Alfalfalfa/GOSSIP with reply-only body extraction and fresh reader comments. v0.1.98 fixes the migration trigger and GOSSIP full-reply range selection. v0.1.103 rebuilds Alfalfalfa/GOSSIP comments with semantic-only cards and complete comment dedupe rules. v0.1.104 adds VIPPERな俺 comment extraction and unified reader text sizing. v0.1.107 strictly scoped Alfalfalfa comments to the real Livedoor comment container. v0.1.111 switches Alfalfalfa to heading-bounded semantic comment extraction and fixes the migration trigger. v0.1.110 adds GOSSIP heading-bounded comment extraction for 「この記事へのコメント」. v0.1.111 forces Alfalfalfa rebuild after the corrected comment parser and preserves Fesoku replies below the visible Comment heading.
        """
        key='site_profile_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return 0
            if version>=213 and current<213:
                where="""(url LIKE '%://gossip1.net/%' OR url LIKE '%://www.gossip1.net/%')"""
                label='優先再抽出:v0.1.114 GOSSIP本文末尾保持'
            elif current>=207:
                where="""(url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%'
                  OR url LIKE '%://fesoku.net/%'
                  OR url LIKE '%://www.fesoku.net/%')"""
                label='優先再抽出:v0.1.111 アルファ再抽出強制/Fesoku Commentレス保持'
            elif current>=206:
                where="""(url LIKE '%://gossip1.net/%'
                  OR url LIKE '%://www.gossip1.net/%')"""
                label='優先再抽出:v0.1.110 GOSSIPコメント見出し対応'
            elif current>=204:
                where="""(url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%')"""
                label='優先再抽出:v0.1.111 アルファ実コメント復元/関連記事除外'
            elif current>=203:
                where="""(url LIKE '%://news23vip.livedoor.blog/%'
                  OR url LIKE '%://blog.livedoor.jp/news23vip/%')"""
                label='優先再抽出:v0.1.104 VIPPERな俺コメント追加/文字サイズ統一'
            elif current>=196:
                where="""(url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%'
                  OR url LIKE '%://gossip1.net/%'
                  OR url LIKE '%://www.gossip1.net/%')"""
                label='優先再抽出:v0.1.103 アルファ・GOSSIPコメント再構築/メタ情報修正'
            elif current>=194:
                where="""(url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%'
                  OR url LIKE '%://gossip1.net/%'
                  OR url LIKE '%://www.gossip1.net/%')"""
                label='優先再抽出:v0.1.96 アルファ・GOSSIP本文/コメント更新'
            elif current>=192:
                where="""(url LIKE '%://jin115.com/%'
                  OR url LIKE '%://www.jin115.com/%'
                  OR url LIKE '%://news23vip.livedoor.blog/%'
                  OR url LIKE '%://blog.livedoor.jp/news23vip/%'
                  OR url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%'
                  OR url LIKE '%://blog.esuteru.com/%'
                  OR url LIKE '%://esuteru.com/%'
                  OR url LIKE '%://hamusoku.com/%'
                  OR url LIKE '%://www.hamusoku.com/%'
                  OR url LIKE '%://gossip1.net/%'
                  OR url LIKE '%://www.gossip1.net/%'
                  OR url LIKE '%://kinisoku.com/%'
                  OR url LIKE '%://www.kinisoku.com/%'
                  OR url LIKE '%://blog.livedoor.jp/kinisoku/%')"""
                label='優先再抽出:v0.1.94 JIN・VIPPER・アルファ・はちま・ハム速・GOSSIP・キニ速'
            elif current>=191:
                where="""(url LIKE '%://jin115.com/%'
                  OR url LIKE '%://www.jin115.com/%'
                  OR url LIKE '%://kinisoku.com/%'
                  OR url LIKE '%://www.kinisoku.com/%'
                  OR url LIKE '%://blog.livedoor.jp/kinisoku/%'
                  OR url LIKE '%://news23vip.livedoor.blog/%'
                  OR url LIKE '%://blog.livedoor.jp/news23vip/%'
                  OR url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%')"""
                label='優先再抽出:v0.1.94 JIN・キニ速・VIPPER・アルファ'
            elif current>=190:
                where="""(url LIKE '%://gossip1.net/%'
                  OR url LIKE '%://www.gossip1.net/%'
                  OR url LIKE '%://rabitsokuhou.2chblog.jp/%'
                  OR url LIKE '%://news23vip.livedoor.blog/%'
                  OR url LIKE '%://blog.livedoor.jp/news23vip/%'
                  OR url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%')"""
                label='優先再抽出:v0.1.94 GOSSIP・ラビット・VIPPER・アルファ'
            else:
                where="""(url LIKE '%://gossip1.net/%'
                  OR url LIKE '%://www.gossip1.net/%'
                  OR url LIKE '%://negisoku.com/%'
                  OR url LIKE '%://www.negisoku.com/%'
                  OR url LIKE '%://blog.esuteru.com/%'
                  OR url LIKE '%://esuteru.com/%'
                  OR url LIKE '%://fesoku.net/%'
                  OR url LIKE '%://www.fesoku.net/%'
                  OR url LIKE '%://nanjpride.blog.jp/%'
                  OR url LIKE '%://rock1963roll.livedoor.blog/%'
                  OR url LIKE '%://blog.livedoor.jp/rock1963roll/%'
                  OR url LIKE '%://crx7601.com/%'
                  OR url LIKE '%://www.crx7601.com/%'
                  OR url LIKE '%://kinisoku.com/%'
                  OR url LIKE '%://www.kinisoku.com/%'
                  OR url LIKE '%://blog.livedoor.jp/kinisoku/%'
                  OR url LIKE '%://rabitsokuhou.2chblog.jp/%'
                  OR url LIKE '%://news23vip.livedoor.blog/%'
                  OR url LIKE '%://blog.livedoor.jp/news23vip/%'
                  OR url LIKE '%://alfalfalfa.com/%'
                  OR url LIKE '%://www.alfalfalfa.com/%')"""
                label='優先再抽出:v0.1.94 サイト別本文プロファイル'
            rows=c.execute(f"""SELECT url FROM articles
              WHERE state='ready' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND {where}
              ORDER BY ready_time DESC""").fetchall()
            for i,row in enumerate(rows):
                c.execute("""UPDATE articles SET state='retry',retry_at=?,attempts=0,
                  error=? WHERE url=?""",(now+1+i*0.35,label,row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return len(rows)


    def migrate_failure_resilience_policy(self, version=199):
        """Retry old hard-failed articles once after v0.1.99 media/fallback fixes.

        Successful ready rows also start clean so historical preparation starts do not
        count as future failures.  Failed rows are staggered to avoid a retry storm.
        """
        key='failure_resilience_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0,'ready_reset':0}
            ready_reset=c.execute("UPDATE articles SET attempts=0 WHERE state='ready' AND attempts<>0").rowcount
            rows=c.execute("SELECT url FROM articles WHERE state='failed' ORDER BY retry_at ASC,url ASC").fetchall()
            for i,row in enumerate(rows):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.99 失敗耐性修正後の再準備' WHERE url=?",
                          (now+5+i*5,row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(rows),'ready_reset':ready_reset}

    def migrate_v0113_targeted_policy(self, version=213):
        """Requeue only hard failures fixed by v0.1.114."""
        key='v0113_targeted_policy_version'
        now=time.time()
        media_terms=('重要画像を取得できません','重要画像が本文整形中に失われました','X投稿を取得できません')
        exact_urls=('https://itsoku.org/archives/63504737.html','https://rabitsokuhou.2chblog.jp/archives/69037000.html')
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("SELECT url,error FROM articles WHERE state='failed' ORDER BY retry_at ASC,url ASC").fetchall()
            targets=[]
            for row in rows:
                err=str(row['error'] or '')
                if row['url'] in exact_urls or any(term in err for term in media_terms):targets.append(row['url'])
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.114 対象限定再試行' WHERE url=?",(now+1+i*0.35,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}

    def migrate_v0114_targeted_policy(self, version=214):
        """Requeue v0.1.114 site-specific fixes without rebuilding unrelated articles."""
        key='v0114_targeted_policy_version'
        now=time.time()
        exact_urls=(
            'https://itsoku.org/archives/63504737.html',
            'https://rabitsokuhou.2chblog.jp/archives/69037000.html',
            'https://rabitsokuhou.2chblog.jp/archives/69036693.html',
        )
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            targets=[]
            for url in exact_urls:
                r=c.execute('SELECT url FROM articles WHERE url=?',(url,)).fetchone()
                if r: targets.append(url)
            # GOSSIPの既存ready/retryも新しいent_res固定抽出へ更新。
            rows=c.execute("SELECT url FROM articles WHERE url LIKE '%://gossip1.net/%' OR url LIKE '%://www.gossip1.net/%'").fetchall()
            for r in rows:
                if r['url'] not in targets: targets.append(r['url'])
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.114 サイト専用再抽出' WHERE url=?",(now+1+i*0.20,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}

    def migrate_v0115_targeted_policy(self, version=215):
        """Rebuild only providers changed by v0.1.116: GOSSIP full ent_res and Esuteru real comments."""
        key='v0115_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE url LIKE '%://gossip1.net/%' OR url LIKE '%://www.gossip1.net/%'
                 OR url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%'
              ORDER BY url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.116 GOSSIP全レス/はちま実コメント再抽出' WHERE url=?",(now+1+i*0.15,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}

    def migrate_failed_visibility_policy(self, version=190):
        """Start a 24h visibility window for pre-v0.1.90 auto-stopped history."""
        key='failed_visibility_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return 0
            changed=c.execute("UPDATE articles SET retry_at=? WHERE state='failed' AND retry_at<=0",(now,)).rowcount
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return changed

    def fail(self, url, error):
        """Record a failed article preparation and return structured retry metadata.

        v0.1.102 keeps the durable retry policy unchanged, but returns enough detail for
        prepare_worker.py to emit one machine-readable journal line per failure.
        """
        with self.connect() as c:
            row = c.execute('SELECT attempts,body_file,ready_time,error FROM articles WHERE url=?', (url,)).fetchone()
            attempts=int(row['attempts'] or 0) if row else 1
            priority=bool(row and ((row['error'] or '')=='表示品質チェックによる優先再抽出' or (row['error'] or '').startswith('優先再抽出:')))
            if attempts >= MAX_RETRY_ATTEMPTS and not priority:
                now=time.time()
                if row and row['body_file'] and row['ready_time']:
                    c.execute("UPDATE articles SET state='ready',retry_at=0,error=? WHERE url=?",
                              ('再準備を5回失敗したため旧完成版を継続表示: '+str(error)[:380], url))
                    return {'state':'ready','attempts':attempts,'retry_at':0,'delay_seconds':0,'kept_old_ready':True}
                c.execute("UPDATE articles SET state='failed',retry_at=?,error=? WHERE url=?",
                          (now,'5回失敗で自動停止: '+str(error)[:420], url))
                return {'state':'failed','attempts':attempts,'retry_at':now,'delay_seconds':0,'kept_old_ready':False}
            delay=min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * 2**min(5,max(0,attempts-1)))
            retry_at=time.time()+delay
            c.execute("UPDATE articles SET state='retry',retry_at=?,error=? WHERE url=?", (retry_at, str(error)[:500], url))
            return {'state':'retry','attempts':attempts,'retry_at':retry_at,'delay_seconds':delay,'kept_old_ready':False}

    def asset_path(self, public):
        match = ASSET_RE.fullmatch(public or '')
        if not match:
            raise ValueError('invalid prepared asset path')
        return self.assets / match.group(1)

    def save_asset(self, data, mime, source='', article=''):
        types = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp',
                 'image/avif':'avif','image/svg+xml':'svg','image/bmp':'bmp'}
        mime = mime.split(';')[0].strip().lower()
        if mime not in types or not data:
            raise ValueError('unsupported/empty media: ' + mime)
        name = hashlib.sha256(data).hexdigest() + '.' + types[mime]
        public = '/prepared/assets/' + name
        path = self.asset_path(public)
        if not path.exists():
            self.atomic(path, data)
        with self.connect() as c:
            c.execute('INSERT OR REPLACE INTO asset_files VALUES (?,?)',(public,len(data)))
            if source:
                c.execute('INSERT OR REPLACE INTO asset_sources VALUES (?,?,?)', (source, public, mime))
            if article:
                c.execute('INSERT OR REPLACE INTO asset_claims(article,path,touched) VALUES (?,?,?)',
                          (article,public,time.time()))
        return {'path':public,'mime':mime,'bytes':len(data)}

    def known_asset(self, source, article=''):
        with self.connect() as c:
            row = c.execute('SELECT * FROM asset_sources WHERE url=?', (source,)).fetchone()
            if row and article:
                c.execute('INSERT OR REPLACE INTO asset_claims(article,path,touched) VALUES (?,?,?)',
                          (article,row['path'],time.time()))
        if row:
            path = self.asset_path(row['path'])
            if path.is_file() and path.stat().st_size:
                return {'path':row['path'],'mime':row['kind'],'bytes':path.stat().st_size}
            if article:
                with self.connect() as c:c.execute('DELETE FROM asset_claims WHERE article=? AND path=?',(article,row['path']))

    def forget_asset_source(self, source):
        """Forget only the source->asset mapping. Never delete a shared asset here."""
        with self.connect() as c:
            c.execute('DELETE FROM asset_sources WHERE url=?',(source,))

    def publish(self, url, snapshot):
        if snapshot.get('schema') != SCHEMA or not snapshot.get('complete'):
            raise ValueError('incomplete snapshot')
        if not snapshot.get('html') or not snapshot.get('title'):
            raise ValueError('empty extracted article')
        assets = set(snapshot.get('assets') or [])
        if snapshot.get('thumb') not in assets:
            raise ValueError('thumbnail not prepared')
        # Serialized DOM cannot retain live proxies, blob URLs, scripts or remote src attributes.
        from html.parser import HTMLParser
        class Check(HTMLParser):
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag in ('script','iframe','object','embed') or any(k.startswith('on') for k in attrs):
                    raise ValueError('active/unprepared element: '+tag)
                for key in ('src','poster','data-prepared-gif','data-prepared-poster'):
                    if attrs.get(key) and attrs[key] not in assets:
                        raise ValueError('unprepared media reference: '+attrs[key])
                if attrs.get('srcset') or ('url(' in attrs.get('style','').lower()):
                    raise ValueError('unprepared media alternative')
        Check().feed(snapshot['html'])
        for asset in assets:
            path = self.asset_path(asset)
            if not path.is_file() or path.stat().st_size == 0:
                raise ValueError('missing asset: '+asset)
        now = time.time()*1000
        with self.connect() as c:
            previous = c.execute('SELECT * FROM articles WHERE url=?', (url,)).fetchone()
            if not previous:
                raise ValueError('unknown candidate')
            if previous['state'] == 'ready':
                try:
                    self._topic_upsert_history(c,url,json.loads(previous['item']),float(previous['source_time'] or 0))
                except Exception:
                    pass
                return previous['ready_time']
            # v0.1.102 publication ordering:
            # - The first successful completed snapshot is new *now*, even when this URL had
            #   an old legacy/raw public timestamp or spent time in retry/failed.
            # - A rebuild of an article that was already completed keeps its original
            #   ready_time, so manual/quality reprepare does not make an old read article
            #   jump back to the top.
            was_completed = bool(previous['body_file'] and previous['ready_time'])
            publish_time = previous['ready_time'] if was_completed else now
            marker=self._buffer_cutoff(c)
            if was_completed:
                release_time=float(previous['release_time'] or previous['ready_time'] or 0)
            elif marker is None:
                release_time=publish_time
            else:
                # v0.1.232: while standby is still being built, do not make genuinely
                # current articles wait behind the hidden queue. Fresh source articles
                # publish immediately (up to the visible-new cap); older catch-up work
                # is kept hidden and becomes the standby stock.
                visible_now=int(c.execute("""SELECT COUNT(*) FROM articles
                  WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                    AND release_time>? AND state IN ('ready','retry','preparing')""",
                    (VIEW_SCHEMA_MIN,marker)).fetchone()[0] or 0)
                source_time=float(previous['source_time'] or 0)
                source_age=max(0.0,now-source_time) if source_time>0 else 10**12
                live_arrival=source_age<=20*60*1000
                release_time=publish_time if live_arrival and visible_now<MAX_NEW_BUFFER else 0
            revision_seed = json.dumps({
                'title': snapshot.get('title') or '',
                'html': snapshot.get('html') or '',
                'assets': sorted(assets),
                'videos': snapshot.get('videos') or [],
                'site_feedback': snapshot.get('site_feedback') or []
            }, ensure_ascii=False, sort_keys=True, separators=(',',':')).encode('utf-8')
            revision = hashlib.sha256(revision_seed).hexdigest()[:20]
            snapshot = dict(snapshot, source_time=previous['source_time'], ready_time=publish_time, url=url, revision=revision)
            name = hashlib.sha256(url.encode()).hexdigest()+'.json'
            self.atomic(self.bodies / name, json.dumps(snapshot, ensure_ascii=False, separators=(',',':')).encode())
            # The DB transaction is the only publication point, AFTER files are durable.
            c.execute("UPDATE articles SET state='ready',ready_time=?,release_time=?,body_file=?,assets=?,title=?,thumb=?,error=NULL,attempts=0,retry_at=0,schema_version=?,revision=? WHERE url=?",
                      (publish_time, release_time, name, json.dumps(sorted(assets)),snapshot['title'],snapshot['thumb'],SCHEMA,revision,url))
            try:
                self._topic_upsert_history(c,url,json.loads(previous['item']),float(previous['source_time'] or 0))
            except Exception:
                pass
            c.execute('DELETE FROM asset_claims WHERE article=?',(url,))
            old=c.execute("SELECT value FROM status WHERE key='initial_completed'").fetchone()
            completed=set(json.loads(old['value'])) if old else set()
            initial=c.execute("SELECT value FROM status WHERE key='initial_urls'").fetchone()
            if initial and url in json.loads(initial['value']):completed.add(url)
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',('initial_completed',json.dumps(sorted(completed))))
            marker=c.execute("SELECT value FROM status WHERE key='new_buffer_cutoff'").fetchone()
            if marker is None:
                ready_n=int(c.execute("SELECT COUNT(*) FROM articles WHERE body_file IS NOT NULL AND ready_time IS NOT NULL AND state IN ('ready','retry','preparing')").fetchone()[0] or 0)
                if ready_n>=MAX_BODY_CACHE:
                    newest=c.execute("SELECT MAX(release_time) t FROM articles WHERE body_file IS NOT NULL AND ready_time IS NOT NULL AND release_time>0 AND state IN ('ready','retry','preparing')").fetchone()['t']
                    if newest:c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',('new_buffer_cutoff',json.dumps(float(newest))))
        return publish_time

    def reprepare(self, url):
        """Queue one already-published article for extraction rebuild without changing its ready_time."""
        with self.connect() as c:
            row=c.execute("SELECT state,ready_time,item FROM articles WHERE url=?",(url,)).fetchone()
            if not row:return False
            if row['state']=='preparing':return True
            if row['state']=='pending':return True
            if row['state']=='failed':
                c.execute("UPDATE articles SET state='retry',retry_at=0,attempts=0,error='表示品質チェックによる優先再抽出' WHERE url=?",(url,))
                return True
            if row['state']=='retry':
                c.execute("UPDATE articles SET retry_at=0,attempts=0,error='表示品質チェックによる優先再抽出' WHERE url=?",(url,))
                return True
            if row['state'] not in ('ready','retired'):return False
            c.execute("UPDATE articles SET state='retry',retry_at=0,attempts=0,error='表示品質チェックによる優先再抽出' WHERE url=?",(url,))
        return True

    def _buffer_cutoff(self, c):
        row=c.execute("SELECT value FROM status WHERE key='new_buffer_cutoff'").fetchone()
        if not row:return None
        try:return float(json.loads(row['value']))
        except Exception:return None

    def buffer_count(self):
        with self.connect() as c:
            cutoff=self._buffer_cutoff(c)
            if cutoff is None:return 0
            return int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time>? AND state IN ('ready','retry','preparing')""",
                (VIEW_SCHEMA_MIN,cutoff)).fetchone()[0] or 0)

    def release_waiting(self):
        """Release at most one fully-prepared standby article while a viewer is active."""
        now_ms=time.time()*1000.0
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            cutoff=self._buffer_cutoff(c)
            if cutoff is None:
                return {'released':False,'new_buffer':0,'standby':0,'next_interval_seconds':30}
            target_row=c.execute("SELECT value FROM status WHERE key='standby_target'").fetchone()
            try:target=self._clamp_standby_target(json.loads(target_row['value'])) if target_row else DEFAULT_STANDBY
            except Exception:target=DEFAULT_STANDBY
            visible=int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time>? AND state IN ('ready','retry','preparing')""",
                (VIEW_SCHEMA_MIN,cutoff)).fetchone()[0] or 0)
            standby=int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time<=0 AND state IN ('ready','retry','preparing')""",
                (VIEW_SCHEMA_MIN,)).fetchone()[0] or 0)
            interval=10 if standby>=200 else 15 if standby>=50 else 30
            last_row=c.execute("SELECT value FROM status WHERE key='standby_last_release_ms'").fetchone()
            try:last=float(json.loads(last_row['value'])) if last_row else 0
            except Exception:last=0
            if visible>=MAX_NEW_BUFFER or standby<=0 or (last and now_ms-last<interval*1000):
                return {'released':False,'new_buffer':visible,'standby':standby,'standby_target':target,
                        'next_interval_seconds':interval,'max_new':MAX_NEW_BUFFER}
            row=c.execute("""SELECT url FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time<=0 AND state='ready'
              ORDER BY source_time DESC,ready_time DESC,url LIMIT 1""",(VIEW_SCHEMA_MIN,)).fetchone()
            if not row:
                return {'released':False,'new_buffer':visible,'standby':standby,'standby_target':target,
                        'next_interval_seconds':interval,'max_new':MAX_NEW_BUFFER}
            c.execute("UPDATE articles SET release_time=? WHERE url=?",(now_ms,row['url']))
            c.execute('INSERT OR REPLACE INTO status(key,value) VALUES (?,?)',('standby_last_release_ms',json.dumps(now_ms)))
            visible+=1;standby=max(0,standby-1)
            return {'released':True,'new_buffer':visible,'standby':standby,'standby_target':target,
                    'next_interval_seconds':interval,'max_new':MAX_NEW_BUFFER}

    def consume_new_buffer(self):
        """Merge all currently completed new-buffer articles into the committed 500-item cache."""
        with self.connect() as c:
            row=c.execute("""SELECT MAX(release_time) t FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time>0 AND state IN ('ready','retry','preparing')""",(VIEW_SCHEMA_MIN,)).fetchone()
            newest=float(row['t'] or 0)
            if newest:
                c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',('new_buffer_cutoff',json.dumps(newest)))
        self.maintain()
        return {'new_buffer':self.buffer_count(),'committed':min(MAX_BODY_CACHE,self.completed_count()),'new_buffer_cutoff':newest}

    def completed_count(self):
        with self.connect() as c:
            return int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND state IN ('ready','retry','preparing')""",(VIEW_SCHEMA_MIN,)).fetchone()[0] or 0)

    def list_ready(self):
        with self.connect() as c:
            cutoff=self._buffer_cutoff(c)
            if cutoff is None:
                rows=c.execute("""SELECT * FROM articles
                  WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                    AND release_time>0 AND state IN ('ready','retry','preparing')
                  ORDER BY release_time DESC,url LIMIT ?""",(VIEW_SCHEMA_MIN,MAX_BODY_CACHE)).fetchall()
            else:
                fresh=c.execute("""SELECT * FROM articles
                  WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                    AND release_time>? AND state IN ('ready','retry','preparing')
                  ORDER BY release_time DESC,url LIMIT ?""",(VIEW_SCHEMA_MIN,cutoff,MAX_NEW_BUFFER)).fetchall()
                base=c.execute("""SELECT * FROM articles
                  WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                    AND release_time>0 AND release_time<=? AND state IN ('ready','retry','preparing')
                  ORDER BY release_time DESC,url LIMIT ?""",(VIEW_SCHEMA_MIN,cutoff,MAX_BODY_CACHE)).fetchall()
                rows=list(fresh)+list(base)
                rows.sort(key=lambda r:(float(r['release_time'] or 0),str(r['url'])),reverse=True)
            # v0.1.209: any article handed to the visible list gets a short lease.
            # This closes the race where maintain() could retire/remove a body after
            # /api/ready-list returned it but before the user clicked it.
            visible_urls=[str(r['url']) for r in rows if r['url']]
            if visible_urls:
                now=time.time();lease_until=now+600;renew_before=now+300
                # Do not issue up to 1000 UPDATE statements on every list poll. Renew only
                # rows with less than half of the 10-minute safety lease remaining, in
                # small batches that stay below old SQLite variable limits.
                for off in range(0,len(visible_urls),400):
                    chunk=visible_urls[off:off+400]
                    marks=','.join('?' for _ in chunk)
                    c.execute(f'UPDATE articles SET view_until=? WHERE view_until<? AND url IN ({marks})',
                              [lease_until,renew_before,*chunk])
        items=[]
        for row in rows:
            if not (self.bodies / row['body_file']).is_file():
                self.fail(row['url'], '完成本文キャッシュが見つかりません'); continue
            try:
                item=json.loads(row['item'])
                if not isinstance(item,dict):raise ValueError('item is not an object')
            except Exception:
                self.fail(row['url'],'完成一覧メタデータの破損を検出・再準備中')
                continue
            revision=(row['revision'] or str(int(float(row['ready_time'] or 0))))
            public_time=float(row['release_time'] or row['ready_time'] or 0)
            item.update(source_time=row['source_time'],ready_time=public_time,timestamp=public_time,
                        thumb=row['thumb'],ready=True,title=row['title'],revision=revision)
            items.append(item)
        return items

    def app_manifest(self):
        """Return compact immutable-ready metadata for the iPhone offline sync client.

        This is deliberately read-only and does not alter publication/read state.
        The app may retain older rows locally even after they leave the server's
        current 500-item publication window.
        """
        with self.connect() as c:
            rows=c.execute("""SELECT url,item,source_time,ready_time,release_time,body_file,assets,title,thumb,revision
              FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time>0 AND (state='ready' OR state IN ('retry','preparing'))
              ORDER BY release_time DESC,url LIMIT ?""",(VIEW_SCHEMA_MIN,MAX_BODY_CACHE)).fetchall()
            asset_sizes={r['path']:int(r['size'] or 0) for r in c.execute('SELECT path,size FROM asset_files')}
        out=[]
        for row in rows:
            body_path=self.bodies / row['body_file']
            try: body_bytes=int(body_path.stat().st_size)
            except OSError: continue
            try:item=json.loads(row['item'])
            except Exception:item={}
            try:assets=[a for a in json.loads(row['assets'] or '[]') if ASSET_RE.fullmatch(str(a or ''))]
            except Exception:assets=[]
            asset_bytes=0
            valid_assets=0
            for public in assets:
                size=asset_sizes.get(public)
                if size is None:
                    try:size=int(self.asset_path(public).stat().st_size)
                    except OSError:continue
                asset_bytes+=max(0,int(size));valid_assets+=1
            url=str(row['url'] or '')
            out.append({
                'id':hashlib.sha256(url.encode('utf-8')).hexdigest(),
                'url':url,
                'title':str(row['title'] or item.get('title') or ''),
                'source':str(item.get('source') or ''),
                'source_time':float(row['source_time'] or 0),
                'ready_time':float(row['release_time'] or row['ready_time'] or 0),
                'thumb':str(row['thumb'] or ''),
                'revision':str(row['revision'] or str(int(float(row['ready_time'] or 0)))),
                'body_bytes':body_bytes,
                'asset_count':valid_assets,
                'asset_bytes':asset_bytes,
                'total_bytes':body_bytes+asset_bytes,
            })
        return out

    def app_cache_info(self, url):
        """Return exact prepared asset inventory for one completed article."""
        with self.connect() as c:
            row=c.execute("""SELECT url,ready_time,body_file,assets,revision FROM articles WHERE url=?
              AND schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
              AND (state='ready' OR state IN ('retry','preparing'))""",(url,VIEW_SCHEMA_MIN)).fetchone()
            if not row:return None
            try:assets=[a for a in json.loads(row['assets'] or '[]') if ASSET_RE.fullmatch(str(a or ''))]
            except Exception:assets=[]
            sizes={r['path']:int(r['size'] or 0) for r in c.execute('SELECT path,size FROM asset_files')}
        body_path=self.bodies / row['body_file']
        try:body_bytes=int(body_path.stat().st_size)
        except OSError:return None
        entries=[];asset_bytes=0
        for public in assets:
            size=sizes.get(public)
            if size is None:
                try:size=int(self.asset_path(public).stat().st_size)
                except OSError:continue
            size=max(0,int(size));asset_bytes+=size
            entries.append({'path':public,'bytes':size})
        revision=str(row['revision'] or str(int(float(row['ready_time'] or 0))))
        return {
            'id':hashlib.sha256(str(url).encode('utf-8')).hexdigest(),
            'url':str(url),
            'revision':revision,
            'ready_time':float(row['ready_time'] or 0),
            'body_bytes':body_bytes,
            'asset_count':len(entries),
            'asset_bytes':asset_bytes,
            'total_bytes':body_bytes+asset_bytes,
            'assets':entries,
            'videos_cached':False,
        }

    def article(self, url):
        # Fast path: reading an already-prepared article must never wait for a DB write.
        # The viewer renews the lease asynchronously after first paint.
        with self.connect() as c:
            row=c.execute("""SELECT body_file FROM articles WHERE url=?
              AND body_file IS NOT NULL AND ready_time IS NOT NULL
              AND (state='ready' OR state IN ('retry','preparing') OR (state='retired' AND view_until>?))
              AND schema_version>=?""", (url,time.time(),VIEW_SCHEMA_MIN)).fetchone()
        if not row:
            return None
        try:
            path=self.bodies / row['body_file']
            st=path.stat()
            key=(row['body_file'],st.st_mtime_ns,st.st_size)
            with self._article_cache_lock:
                cached=self._article_cache.get(key)
                if cached is not None:
                    self._article_cache.move_to_end(key)
                    return cached
            value=json.loads(path.read_text(encoding='utf-8'))
            with self._article_cache_lock:
                # One URL always uses one body filename; discard older generations of it.
                for old_key in [k for k in self._article_cache if k[0]==row['body_file'] and k!=key]:
                    self._article_cache.pop(old_key,None)
                self._article_cache[key]=value
                while len(self._article_cache)>32:self._article_cache.popitem(last=False)
            return value
        except (OSError, ValueError):
            self.fail(url,'完成本文キャッシュが見つかりません')
            return None

    def lease(self,url):
        # Lease renewal is best-effort only.  Never let a busy preparation writer
        # stall article display for up to the normal 15 s SQLite timeout.
        c=None
        try:
            c=sqlite3.connect(self.db, timeout=0.05)
            c.execute('PRAGMA synchronous=NORMAL')
            result=c.execute("""UPDATE articles SET view_until=? WHERE url=?
              AND body_file IS NOT NULL AND ready_time IS NOT NULL
              AND (state='ready' OR state IN ('retry','preparing') OR (state='retired' AND view_until>?))""", (time.time()+180,url,time.time()))
            c.commit()
            return result.rowcount>0
        except sqlite3.OperationalError:
            return False
        finally:
            if c is not None:c.close()


    def migrate_v0117_targeted_policy(self, version=217):
        """Rebuild VIPPERな俺 after title-anchored body-root fallback fix."""
        key='v0117_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE state='ready' AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND (url LIKE '%://news23vip.livedoor.blog/%'
                     OR url LIKE '%://blog.livedoor.jp/news23vip/%')
              ORDER BY ready_time DESC""").fetchall()
            for i,row in enumerate(rows):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.121 VIPPERな俺本文再抽出' WHERE url=?",
                          (now+1+i*0.15,row['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(rows)}


    def migrate_v0118_targeted_policy(self, version=218):
        """Rebuild only GOSSIP after marker-bounded real-comment extraction fix."""
        key='v0118_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://gossip1.net/%' OR url LIKE '%://www.gossip1.net/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.121 GOSSIP実コメント再抽出' WHERE url=?",
                          (now+1+i*0.12,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}

    def migrate_v0119_targeted_policy(self, version=219):
        """Fresh-rebuild only GOSSIP and Esuteru after v0.1.121 comment completeness fixes."""
        key='v0119_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE ((url LIKE '%://gossip1.net/%' OR url LIKE '%://www.gossip1.net/%')
                  OR (url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%'))
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.121 GOSSIP/はちま実コメントfresh再抽出' WHERE url=?",
                          (now+1+i*0.10,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}

    def migrate_v0120_targeted_policy(self, version=220):
        """Fresh-rebuild only GOSSIP after protected reply-unit extraction fix."""
        key='v0120_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://gossip1.net/%' OR url LIKE '%://www.gossip1.net/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.121 GOSSIPレス完全保持fresh再抽出' WHERE url=?",
                          (now+1+i*0.10,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}

    def migrate_v0122_targeted_policy(self, version=222):
        """Fresh-rebuild VIPPERな俺 after lite real-comment fallback restoration."""
        key='v0122_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://news23vip.livedoor.blog/%'
                     OR url LIKE '%://blog.livedoor.jp/news23vip/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.122 VIPPERな俺本文/実コメントfresh再抽出' WHERE url=?",
                          (now+1+i*0.10,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0123_targeted_policy(self, version=223):
        """Priority fresh-rebuild VIPPERな俺 after fixing the retry refresh path itself."""
        key='v0123_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://news23vip.livedoor.blog/%'
                     OR url LIKE '%://blog.livedoor.jp/news23vip/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.123 VIPPERな俺fresh本文/実コメント' WHERE url=?",
                          (now+1+i*0.05,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}



    def migrate_v0130_targeted_policy(self, version=230):
        """Fresh-rebuild only Esuteru after full pagination + fresh-origin comment fix."""
        key='v0130_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.130 はちま全コメントfresh再抽出' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}



    def migrate_v0131_targeted_policy(self, version=231):
        """Fresh-rebuild only Esuteru after full pagination + fresh-origin comment fix."""
        key='v0131_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.131 はちまコメント取得再検証（curl fallback）' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}



    def migrate_v0133_targeted_policy(self, version=233):
        """Fresh-rebuild only Esuteru after protecting saved comment sections from snapshot cleanup."""
        key='v0133_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.133 はちまコメント保存保護' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0134_targeted_policy(self, version=234):
        """Fresh-rebuild Esuteru after fixing preparation proxy referer/force/curl fallback."""
        key='v0134_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.135 はちま準備proxy修正' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0138_targeted_policy(self, version=238):
        """Fresh-rebuild Esuteru so structured comment records are persisted for display."""
        key='v0138_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://blog.esuteru.com/%' OR url LIKE '%://esuteru.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.138 はちまコメント構造データ化' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0139_targeted_policy(self, version=239):
        """Fresh-rebuild Alfalfalfa after supporting standalone-number reply DOM."""
        key='v0139_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://alfalfalfa.com/%' OR url LIKE '%://www.alfalfalfa.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.139 アルファルファ新DOM本文復元' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0140_targeted_policy(self, version=240):
        """Rebuild Alfalfalfa after final/display standalone-number protection."""
        key='v0140_targeted_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE '%://alfalfalfa.com/%' OR url LIKE '%://www.alfalfalfa.com/%')
                AND state IN ('ready','retry','failed','pending')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.141 アルファルファ表示保護' WHERE url=?",
                          (now+1+i*0.08,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0180_heartlog_gif_policy(self, version=283):
        """Rebuild HeartLog snapshots so GIFs linked from static JPG thumbnails become prepared GIFs."""
        key='v0180_heartlog_gif_policy_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE (url LIKE 'http://blog.livedoor.jp/love120331/%'
                     OR url LIKE 'https://blog.livedoor.jp/love120331/%')
                AND state IN ('ready','retry','failed','pending','retired')
              ORDER BY COALESCE(ready_time,0) DESC, url ASC""").fetchall()
            targets=[];seen=set()
            for r in rows:
                u=r['url']
                if u in seen:continue
                seen.add(u);targets.append(u)
            for i,url in enumerate(targets):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='優先再抽出:v0.1.183 はーとログGIF完全再構築' WHERE url=?",
                          (now+1+i*0.12,url))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(targets)}


    def migrate_v0192_esuteru_clean_fix(self, version=292):
        """Requeue Esuteru articles stopped by the prepare_snapshot clean() scope bug fixed in v0.1.209."""
        key='v0192_esuteru_clean_fix_version'
        now=time.time()
        with self.connect() as c:
            row=c.execute('SELECT value FROM status WHERE key=?',(key,)).fetchone()
            try: current=int(json.loads(row['value'])) if row else 0
            except Exception: current=0
            if current>=version:return {'requeued':0}
            rows=c.execute("""SELECT url FROM articles
              WHERE state='failed'
                AND error LIKE '%ReferenceError: clean is not defined%'
                AND (url LIKE 'http://blog.esuteru.com/%' OR url LIKE 'https://blog.esuteru.com/%')
              ORDER BY retry_at ASC,url ASC""").fetchall()
            for i,r in enumerate(rows):
                c.execute("UPDATE articles SET state='retry',attempts=0,retry_at=?,error='v0.1.209 はちま clean定義漏れ修正後の再準備' WHERE url=?",
                          (now+1+i*0.20,r['url']))
            c.execute('INSERT OR REPLACE INTO status VALUES (?,?)',(key,json.dumps(version)))
            return {'requeued':len(rows)}


    def audit(self):
        with self.connect() as c:
            rows=c.execute("SELECT url,body_file,assets FROM articles WHERE state='ready'").fetchall()
        for row in rows:
            try:
                assets=json.loads(row['assets'] or '[]')
                if not isinstance(assets,list):raise ValueError('assets is not a list')
                paths=[self.bodies / row['body_file']]+[self.asset_path(a) for a in assets]
                broken=any(not p.is_file() or not p.stat().st_size for p in paths)
            except (OSError,ValueError,TypeError,json.JSONDecodeError):
                broken=True
            if broken:
                self.fail(row['url'],'完成キャッシュの欠損またはメタデータ破損を検出・再準備中')

    def initial_progress(self):
        # Read status/counts from one SQLite snapshot.  Older builds opened the
        # database four times for a single status response, which added lock churn
        # and could mix counts from slightly different moments.
        now=time.time()
        with self.connect() as c:
            status={}
            for r in c.execute('SELECT key,value FROM status'):
                try: status[r['key']]=json.loads(r['value'])
                except Exception: continue
            urls=status.pop('initial_urls',[])
            if not isinstance(urls,list):urls=[]
            completed_raw=status.pop('initial_completed',[])
            completed_set=set(completed_raw if isinstance(completed_raw,list) else [])
            completed=sum(u in completed_set for u in urls)
            ready_count=int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND state IN ('ready','retry','preparing')""",(VIEW_SCHEMA_MIN,)).fetchone()[0] or 0)
            standby_count=int(c.execute("""SELECT COUNT(*) FROM articles
              WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                AND release_time<=0 AND state IN ('ready','retry','preparing')""",(VIEW_SCHEMA_MIN,)).fetchone()[0] or 0)
            state_counts={r['state']:int(r['n'] or 0) for r in c.execute('SELECT state,COUNT(*) n FROM articles GROUP BY state')}
            qrow=c.execute("""SELECT
              SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) pending,
              SUM(CASE WHEN state='retry' AND retry_at<=? THEN 1 ELSE 0 END) retry_due,
              SUM(CASE WHEN state='retry' AND retry_at<=? AND (error='表示品質チェックによる優先再抽出' OR error LIKE '優先再抽出:%') THEN 1 ELSE 0 END) priority_due,
              SUM(CASE WHEN state='retry' THEN 1 ELSE 0 END) retry_total,
              SUM(CASE WHEN state='preparing' THEN 1 ELSE 0 END) preparing,
              SUM(CASE WHEN state='failed' AND retry_at>=? THEN 1 ELSE 0 END) failed
              FROM articles""",(now,now,now-86400)).fetchone()
            q={k:int(qrow[k] or 0) for k in ('pending','retry_due','priority_due','retry_total','preparing','failed')}
            cutoff=self._buffer_cutoff(c)
            if cutoff is None:
                buffer_count=0
            else:
                buffer_count=int(c.execute("""SELECT COUNT(*) FROM articles
                  WHERE schema_version>=? AND body_file IS NOT NULL AND ready_time IS NOT NULL
                    AND release_time>? AND state IN ('ready','retry','preparing')""",(VIEW_SCHEMA_MIN,cutoff)).fetchone()[0] or 0)
        normal = ready_count >= MAX_BODY_CACHE or (urls and completed==len(urls))
        counts=dict(state_counts)
        counts['retry_total']=q['retry_total']
        counts['retry_due']=q['retry_due']
        counts['priority_due']=q['priority_due']
        counts['retry_waiting']=max(0,q['retry_total']-q['retry_due'])
        counts['pending']=q['pending']
        counts['preparing']=q['preparing']
        counts['failed']=q['failed']
        status['counts']=counts
        released_count=max(0,ready_count-standby_count)
        committed_count=max(0,min(MAX_BODY_CACHE,released_count-buffer_count))
        return dict(status, initial_total=min(MAX_BODY_CACHE,len(urls)),
                    initial_ready=min(MAX_BODY_CACHE,max(completed,committed_count)),
                    active_ready=committed_count, new_buffer=min(MAX_NEW_BUFFER,buffer_count),
                    retained_total=committed_count+min(MAX_NEW_BUFFER,buffer_count)+standby_count,
                    phase='normal' if normal else 'building')

    def asset_bytes(self):
        with self.connect() as c:
            return c.execute('SELECT COALESCE(SUM(size),0) FROM asset_files').fetchone()[0]

    def queue_stats(self):
        now=time.time()
        with self.connect() as c:
            row=c.execute("""SELECT
              SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) pending,
              SUM(CASE WHEN state='retry' AND retry_at<=? THEN 1 ELSE 0 END) retry_due,
              SUM(CASE WHEN state='retry' AND retry_at<=? AND (error='表示品質チェックによる優先再抽出' OR error LIKE '優先再抽出:%') THEN 1 ELSE 0 END) priority_due,
              SUM(CASE WHEN state='retry' THEN 1 ELSE 0 END) retry_total,
              SUM(CASE WHEN state='preparing' THEN 1 ELSE 0 END) preparing,
              SUM(CASE WHEN state='failed' AND retry_at>=? THEN 1 ELSE 0 END) failed
              FROM articles""",(now,now,now-86400)).fetchone()
        return {k:int(row[k] or 0) for k in ('pending','retry_due','priority_due','retry_total','preparing','failed')}

    def maintain(self):
        """Keep the newest publications and garbage-collect only truly unowned assets.

        Assets are protected by published/rebuilding snapshots and by short-lived preparation
        claims. This prevents a cleanup pass from deleting a shared image while another article
        is still being rebuilt.
        """
        now=time.time()
        claim_ttl=2*3600
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('DELETE FROM asset_claims WHERE touched<?',(now-claim_ttl,))
            cutoff=self._buffer_cutoff(c)
            target_row=c.execute("SELECT value FROM status WHERE key='standby_target'").fetchone()
            try:standby_target=self._clamp_standby_target(json.loads(target_row['value'])) if target_row else DEFAULT_STANDBY
            except Exception:standby_target=DEFAULT_STANDBY
            if cutoff is None:
                keep_urls={r['url'] for r in c.execute("SELECT url FROM articles WHERE state='ready' AND release_time>0 ORDER BY release_time DESC LIMIT ?",(MAX_BODY_CACHE,))}
            else:
                # Never allow more than 300 released-but-unconsumed rows. Migration/races
                # demote older excess rows back into hidden standby instead of deleting them.
                excess=c.execute("""SELECT url FROM articles WHERE state='ready' AND release_time>?
                                    ORDER BY release_time DESC,url LIMIT -1 OFFSET ?""",(cutoff,MAX_NEW_BUFFER)).fetchall()
                if excess:
                    c.executemany("UPDATE articles SET release_time=0 WHERE url=?",[(r['url'],) for r in excess])
                keep_urls={r['url'] for r in c.execute("SELECT url FROM articles WHERE state='ready' AND release_time>0 AND release_time<=? ORDER BY release_time DESC LIMIT ?",(cutoff,MAX_BODY_CACHE))}
                keep_urls.update(r['url'] for r in c.execute("SELECT url FROM articles WHERE state='ready' AND release_time>? ORDER BY release_time DESC LIMIT ?",(cutoff,MAX_NEW_BUFFER)))
                keep_urls.update(r['url'] for r in c.execute("SELECT url FROM articles WHERE state='ready' AND release_time<=0 ORDER BY source_time DESC,ready_time DESC LIMIT ?",(standby_target,)))
            rows=c.execute("SELECT url,body_file FROM articles WHERE state='ready'").fetchall()
            retired=[r for r in rows if r['url'] not in keep_urls]
            for row in retired:
                c.execute("UPDATE articles SET state='retired' WHERE url=?",(row['url'],))
            expired=c.execute("SELECT * FROM articles WHERE state='retired' AND view_until<=?",(now,)).fetchall()

            keep=set()
            # Rebuilds retain their previous snapshot/assets until the replacement commits.
            for row in c.execute("SELECT assets FROM articles WHERE state IN ('ready','retry','preparing') OR (state='retired' AND view_until>?)",(now,)):
                keep.update(json.loads(row['assets'] or '[]'))
            # Newly downloaded assets are not yet in articles.assets, so protect explicit claims.
            keep.update(r['path'] for r in c.execute('SELECT path FROM asset_claims WHERE touched>=?',(now-claim_ttl,)))

            candidates=set()
            for row in expired:
                candidates.update(json.loads(row['assets'] or '[]'))
                if row['body_file'] and re.fullmatch(r'[a-f0-9]{64}\.json',row['body_file']):
                    (self.bodies/row['body_file']).unlink(missing_ok=True)
                c.execute('INSERT OR IGNORE INTO raw_gc VALUES (?)',(row['url'],))
                c.execute("UPDATE articles SET state='evicted',body_file=NULL,assets=NULL WHERE url=?",(row['url'],))

            # Failed/abandoned preparations can leave assets with no article owner. Reclaim them
            # once they are no longer claimed. This prevents the media cap from filling forever.
            all_assets={r['path'] for r in c.execute('SELECT path FROM asset_files')}
            candidates.update(all_assets-keep)
            for public in candidates-keep:
                try:path=self.asset_path(public)
                except ValueError:continue
                source_hash=path.name.split('.',1)[0]
                path.unlink(missing_ok=True)
                for derived in self.mobile.glob(source_hash+'_w*_q*.webp'):
                    derived.unlink(missing_ok=True)
                for marker in self.mobile.glob(source_hash+'_w*_q*.orig'):
                    marker.unlink(missing_ok=True)
                for source in c.execute('SELECT url FROM asset_sources WHERE path=?',(public,)).fetchall():
                    c.execute('INSERT OR IGNORE INTO raw_gc VALUES (?)',(source['url'],))
                c.execute('DELETE FROM asset_sources WHERE path=?',(public,))
                c.execute('DELETE FROM asset_files WHERE path=?',(public,))

            protected={r['url'] for r in c.execute("SELECT url FROM articles WHERE state IN ('ready','retry','preparing') OR (state='retired' AND view_until>?)",(now,))}
            protected.update(r['url'] for r in c.execute('SELECT url,path FROM asset_sources') if r['path'] in keep)
            return [r['url'] for r in c.execute('SELECT url FROM raw_gc') if r['url'] not in protected]

    def maintain_if_due(self, min_interval=30.0):
        """Run expensive ownership GC at most once per interval in this process."""
        interval=max(0.0,float(min_interval or 0))
        with self._maintain_lock:
            now=time.monotonic()
            if self._maintain_last and now-self._maintain_last < interval:
                return []
            result=self.maintain()
            self._maintain_last=time.monotonic()
            return result

    def reserve_asset_capacity(self, additional_bytes, max_bytes, turnover_reserve_bytes=0):
        """Reserve media bytes atomically across preparation threads/processes.

        The newest article may temporarily use a bounded turnover reserve so the retained 500
        completed bodies do not have to be destroyed before a replacement is safely published.
        """
        additional=max(0,int(additional_bytes or 0))
        limit=max(0,int(max_bytes or 0))
        reserve=max(0,int(turnover_reserve_bytes or 0))
        token=uuid.uuid4().hex
        self.maintain_if_due(30.0)
        now=time.time()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('DELETE FROM capacity_reservations WHERE touched<?',(now-900,))
            used=int(c.execute('SELECT COALESCE(SUM(size),0) FROM asset_files').fetchone()[0] or 0)
            pending=int(c.execute('SELECT COALESCE(SUM(bytes),0) FROM capacity_reservations').fetchone()[0] or 0)
            if limit and used+pending+additional > limit+reserve:
                return None
            c.execute('INSERT INTO capacity_reservations(token,bytes,touched) VALUES (?,?,?)',(token,additional,now))
        return token

    def release_asset_capacity(self, token):
        if not token:return
        with self.connect() as c:c.execute('DELETE FROM capacity_reservations WHERE token=?',(str(token),))

    def capacity_reserved_bytes(self):
        with self.connect() as c:
            c.execute('DELETE FROM capacity_reservations WHERE touched<?',(time.time()-900,))
            return int(c.execute('SELECT COALESCE(SUM(bytes),0) FROM capacity_reservations').fetchone()[0] or 0)

    def acknowledge_raw_gc(self,urls):
        with self.connect() as c:
            c.executemany('DELETE FROM raw_gc WHERE url=?',[(u,) for u in urls])
