"""Full-list regression checks for cross-provider embedded video fallbacks."""
from pathlib import Path
import re
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
        # Read the versioned filenames from the HTML, then compare to the
        # deploy gate. Avoid stale test expectations on subsequent releases.
        for resource in ('reader.css','ready_viewer.js'):
            match=re.search(r'(?:href|src)="('+re.escape(resource)+r'\?v=\d+)"',reader)
            self.assertIsNotNone(match,resource+' needs a cache-buster')
            self.assertIn(match.group(1),update)
        for resource in ('prepare_snapshot.js','reader.js'):
            match=re.search(r'src="('+re.escape(resource)+r'\?v=\d+)"',prep)
            self.assertIsNotNone(match,resource+' needs a cache-buster')
            self.assertIn(match.group(1),update)
        prep_css=re.search(r'href="(reader\.css\?v=\d+)"',prep)
        reader_css=re.search(r'href="(reader\.css\?v=\d+)"',reader)
        self.assertIsNotNone(prep_css)
        self.assertIsNotNone(reader_css)
        self.assertEqual(prep_css.group(1),reader_css.group(1))
