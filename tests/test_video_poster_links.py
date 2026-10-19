"""Regression: a poster image linked to a video must not open only the image lightbox."""
import unittest
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class VideoPosterLinkTests(unittest.TestCase):
    def test_current_reader_capture_keeps_video_click(self):
        js=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')
        marker="contentEl.addEventListener('click', e=>{"
        self.assertIn(marker,js)
        code=js.split(marker,1)[1].split('loadPreparedArticle().catch',1)[0]
        self.assertIn("if(/^https?:\\/\\//i.test(href)",code)
        self.assertIn("mp4|webm|m4v|m3u8",code)
        self.assertLess(code.index("mp4|webm|m4v|m3u8"),code.index("e.preventDefault()"))
        self.assertIn("openLightbox(img.dataset.originalSrc",code)

    def test_img_click_fallback_keeps_video_href(self):
        current=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')
        legacy=(ROOT/'web/ready_reader.js').read_text(encoding='utf-8')
        full=(ROOT/'web/reader.js').read_text(encoding='utf-8')
        self.assertIn('img.onclick=null;',current)
        self.assertIn('img.onclick=(/^https?',legacy)
        self.assertIn('const videoAnchor=img.closest?',full)

    def test_reader_versions_updated_without_css_changes(self):
        html=(ROOT/'web/reader.html').read_text(encoding='utf-8')
        prep=(ROOT/'web/prepare.html').read_text(encoding='utf-8')
        legacy=(ROOT/'web/legacy_reader.html').read_text(encoding='utf-8')
        update=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        # Derive versions from the deployed HTML instead of pinning obsolete ones.
        viewer=re.search(r'src="(ready_viewer\.js\?v=\d+)"',html)
        preparer=re.search(r'src="(ready_reader\.js\?v=\d+)"',prep)
        prep_reader=re.search(r'src="(reader\.js\?v=\d+)"',prep)
        legacy_reader=re.search(r'src="(reader\.js\?v=\d+)"',legacy)
        for name,match in (('viewer',viewer),('preparer',preparer),
                           ('preparation reader',prep_reader),('legacy reader',legacy_reader)):
            self.assertIsNotNone(match,name+' lacks a versioned script')
        self.assertIn(viewer.group(1),update)
        self.assertEqual(prep_reader.group(1),legacy_reader.group(1))
