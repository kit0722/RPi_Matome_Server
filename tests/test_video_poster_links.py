"""Regression: a poster image linked to a video must not open only the image lightbox."""
import unittest
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
        self.assertIn('ready_viewer.js?v=0309',html)
        self.assertIn('ready_viewer.js?v=0309',update)
        self.assertIn('ready_reader.js?v=0287',prep)
        self.assertIn('reader.js?v=0301',prep)
        self.assertIn('reader.js?v=0301',legacy)
