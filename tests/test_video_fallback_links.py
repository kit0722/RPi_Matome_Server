"""Regression checks for source URLs retained in prepared and saved articles."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class VideoFallbackLinkTests(unittest.TestCase):
    def test_preparation_keeps_video_urls(self):
        js=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        dedupe=js.split('function deduplicatePreparedVideos(root) {',1)[1]
        self.assertNotRegex(dedupe,r'(?m)^\s*(?:a|p)\.remove\(')
        self.assertIn('const sourceUrl=url || (tweetId ?',js)
        self.assertIn('sourceLink.href=sourceUrl',js)

    def test_old_cache_gets_link_and_keeps_it_during_play(self):
        for filename in ('web/ready_viewer.js','web/ready_reader.js'):
            with self.subTest(file=filename):
                js=(ROOT/filename).read_text(encoding='utf-8')
                self.assertIn('storedVideoUrl=httpVideoCandidates(record)[0]',js)
                self.assertIn("card.querySelector('a.prepared-video-source')",js)
                self.assertIn('sourceLink.href=sourceUrl',js)
                self.assertIn('...(sourceLink?[sourceLink]:[])',js)

    def test_release_busts_viewer_cache(self):
        page=(ROOT/'web/reader.html').read_text(encoding='utf-8')
        update=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        for marker in ('reader.css?v=0305','ready_viewer.js?v=0309'):
            self.assertIn(marker,page)
            self.assertIn(marker,update)
