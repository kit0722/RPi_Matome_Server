"""1000mg video blog: prevent site-slogan-only publication and retain media/comments."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]

class Site1000mgTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reader=(ROOT/'web/reader.js').read_text(encoding='utf-8')
        cls.viewer=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')
        cls.preparer=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')

    def test_1000mg_is_scoped_and_title_anchored(self):
        src=self.reader
        for marker in ("function is1000mgUrl(url)",
                       "host==='1000mg.jp'" if "host==='1000mg.jp'" in src else "==='1000mg.jp'",
                       "function make1000mgBodyBundle(doc,title='',base='')",
                       "const site1000mgRoot=is1000mgUrl(finalUrl)",
                       "const root = site1000mgRoot ||",
                       "site1000mgRoot?.dataset?.site1000mgBody"):
            self.assertIn(marker,src)

    def test_site_slogan_is_not_an_article(self):
        src=self.reader
        self.assertIn('1000mgはYouTubeを中心に',src)
        self.assertIn('1000mgの記事本文を見つけられません',src)
        self.assertIn('1000mgの動画を取得できません',src)
        self.assertIn('1000mgの動画がありません',src)
        self.assertIn('if(PREPARING && is1000mgUrl(finalUrl))',src)
        self.assertIn('site1000mgSourceMedia',src)

    def test_video_sources_preserved_separately_from_navigation(self):
        src=self.reader
        for marker in ('function videoProviderSource(raw,base)',
                       'function retain1000mgVideoEmbeds(root,base)',
                       'function restore1000mgPageVideoMetadata(bundle,doc,base)',
                       "script[type=\"application/ld+json\"]",
                       "if(/VideoObject/i.test(type))",
                       "a.dataset.videoEmbedFallback='1'",
                       "anchor.textContent='動画の提供元を開く'",
                       "if(is1000mgUrl(base))retain1000mgVideoEmbeds(clone,base)"):
            self.assertIn(marker,src)
        self.assertNotIn("window.open(source)",src)

    def test_comment_capture_keeps_wordpress_cards(self):
        src=self.reader
        for marker in ("function append1000mgComments(box,source)",
                       ".commentlist > li.comment",
                       ".comment-list > li.comment",
                       "section.className='site-feedback-section'",
                       "section.dataset.site1000mgComments='1'",
                       "card.className='site-feedback-card'",
                       "append1000mgComments(box,root.ownerDocument?.body||root)"):
            self.assertIn(marker,src)
        self.assertIn("saved1000mgComments=section.cloneNode(true)",self.viewer)
        self.assertIn("contentEl.append(saved1000mgComments.cloneNode(true))",self.viewer)

    def test_existing_slogan_only_snapshots_get_targeted_reprepare(self):
        src=self.viewer
        for marker in ('function maybeRepair1000mgArticle(article)',
                       "if(host!=='1000mg.jp')return false",
                       "matome_1000mg_article_repair_v261:",
                       "24*60*60*1000",
                       "maybeRepair1000mgArticle(article)",
                       "'/api/reprepare'"):
            self.assertIn(marker,src)

    def test_cache_busters_match_deploy_gate(self):
        gate=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        pages=[(ROOT/'web/reader.html',('ready_viewer.js',)),
               (ROOT/'web/prepare.html',('reader.js','prepare_snapshot.js')),
               (ROOT/'web/legacy_reader.html',('reader.js',))]
        for path,assets in pages:
            html=path.read_text(encoding='utf-8')
            for asset in assets:
                found=re.search(r'src="('+re.escape(asset)+r'\?v=\d+)"',html)
                self.assertIsNotNone(found,asset)
                self.assertIn(found.group(1),gate)

if __name__=='__main__':
    unittest.main()
