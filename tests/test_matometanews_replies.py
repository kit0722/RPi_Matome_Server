"""MatometaNews reply 2+ integrity and recovery tests (offline/static)."""
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class MatometaNewsReplyIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reader=(ROOT/'web/reader.js').read_text(encoding='utf-8')
        cls.snapshot=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        cls.viewer=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')
        cls.worker=(ROOT/'prepare_worker.py').read_text(encoding='utf-8')

    def test_fragment_bundle_is_scoped_and_ordered(self):
        src=self.reader
        self.assertIn('function isMatometaNewsUrl(url)',src)
        self.assertIn("return host==='matometanews.com'",src)
        self.assertIn('function makeMatometaNewsBodyBundle(doc,title=',src)
        self.assertIn('.article-body-inner,#article-body-inner,.article-body-more,#article-body-more',src)
        self.assertIn('blocks.sort((a,b)=>',src)
        self.assertIn('wrap.append(block.cloneNode(true))',src)
        self.assertIn('cloneLeadImageWithLink(lead)',src)
        self.assertIn('if(source>=2)',src)
        self.assertIn('const matometaRoot = isMatometaNewsUrl(finalUrl)',src)
        # Other site-specific roots can be inserted ahead of MatometaNews.
        # Verify selection priority, not a brittle literal line.
        suffix=src.split('const matometaRoot = isMatometaNewsUrl(finalUrl)',1)
        self.assertEqual(len(suffix),2,'site-scoped root declaration missing')
        root_match=re.search(r'\bconst root\s*=\s*([^;]+);',suffix[1])
        self.assertIsNotNone(root_match,'article root expression missing')
        priority=[p.strip() for p in root_match.group(1).split('||')]
        for item in ('matometaRoot','vipperRoot','pickArticleRoot(doc)'):
            self.assertIn(item,priority)
        self.assertLess(priority.index('matometaRoot'),priority.index('vipperRoot'))
        self.assertLess(priority.index('matometaRoot'),priority.index('pickArticleRoot(doc)'))
        self.assertIn('matometaRoot?.dataset?.matometanewsBodyBundle',src)

    def test_missing_responses_prevent_completed_snapshot(self):
        src=self.reader
        for marker in ('matometanewsSourceReplies','matometanewsPreparedReplies','matometanewsFinalReplies',
                       'if(PREPARING && expected>=2','if(expected>=2 && finalReplies<expected)',
                       '後続レスが整形で消えました',
                       'isMatometaNewsUrl(baseUrl) && replySignalCount(block)>0'):
            self.assertIn(marker,src)

    def test_stats_persist_and_worker_logs(self):
        self.assertIn('reply_stats:matometaReplyStats',self.snapshot)
        self.assertIn("kind:'matometanews'",self.snapshot)
        self.assertIn("mstats=snapshot.get('reply_stats')",self.worker)
        self.assertIn("print('MATOMETA_REPLIES '",self.worker)

    def test_old_article_repair_is_bounded(self):
        src=self.viewer
        for marker in ('function matometanewsVisibleReplyCount(root)',
                       'function maybeRepairMatometanewsReplies(article)',
                       'matome_matometanews_reply_repair_v260:',
                       'actual<=1 && hasThreadLink','24*60*60*1000',
                       'maybeRepairMatometanewsReplies(article)'):
            self.assertIn(marker,src)

    def test_viewer_restores_reply_payload_after_cleaning(self):
        self.assertIn('matometaDisplayBackup=contentEl.cloneNode(true)',self.viewer)
        self.assertIn('matometanewsVisibleReplyCount(contentEl)<matometaDisplayCount',self.viewer)
        self.assertIn('MATOMETA_DISPLAY_RESTORED',self.viewer)

    def test_scripts_match_update_gate(self):
        html=(ROOT/'web/reader.html').read_text(encoding='utf-8')
        prep=(ROOT/'web/prepare.html').read_text(encoding='utf-8')
        legacy=(ROOT/'web/legacy_reader.html').read_text(encoding='utf-8')
        update=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        for page,assets in ((html,('ready_viewer.js',)),(prep,('reader.js','prepare_snapshot.js'))):
            for asset in assets:
                found=re.search(r'src="('+re.escape(asset)+r'\?v=\d+)"',page)
                self.assertIsNotNone(found,asset+' cache-buster missing')
                self.assertIn(found.group(1),update)
        current=re.search(r'src="(reader\.js\?v=\d+)"',prep)
        old=re.search(r'src="(reader\.js\?v=\d+)"',legacy)
        self.assertIsNotNone(current)
        self.assertIsNotNone(old)
        self.assertEqual(current.group(1),old.group(1))
