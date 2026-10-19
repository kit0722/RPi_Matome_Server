"""Full-list regression checks for cross-provider embedded video fallbacks."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class CrossSiteVideoTests(unittest.TestCase):
    def test_unknown_iframe_cannot_abort_preparation(self):
        script=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        self.assertNotIn("if (!id) throw new Error('未整理の埋め込みが残っています')",script)
        self.assertIn('if(id){frame.replaceWith(preparedYouTubeCard(id));continue;}',script)
        self.assertIn("const rawSrc=String(frame.getAttribute('src')||'').trim()",script)
        self.assertIn('frame.replaceWith(card)',script)
        self.assertIn("warnings.push({media_type:'embed'",script)
        self.assertIn("sourceLink.href=sourceUrl",script)

    def test_direct_links_play_inline_without_removing_url(self):
        script=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')
        self.assertIn('const directPlayers=new Set()',script)
        self.assertIn(r'/\.(?:mp4|webm|m4v)(?:$|[?#])/i.test(href)',script)
        self.assertIn("if(record?.key && preparedKeys.has(record.key))continue",script)
        self.assertIn("v.preload='none'",script)
        self.assertIn("a.insertAdjacentElement('afterend',v)",script)
        self.assertIn("directPlayers.add(href)",script)

    def test_assets_have_new_cache_busters(self):
        reader=(ROOT/'web/reader.html').read_text(encoding='utf-8')
        prep=(ROOT/'web/prepare.html').read_text(encoding='utf-8')
        update=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        for marker in ('reader.css?v=0305','ready_viewer.js?v=0307'):
            self.assertIn(marker,reader)
            self.assertIn(marker,update)
        self.assertIn('prepare_snapshot.js?v=0282',prep)
        self.assertIn('prepare_snapshot.js?v=0282',update)
        self.assertIn('reader.css?v=0305',prep)
