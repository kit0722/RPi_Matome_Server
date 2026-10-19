"""Reply-1 integrity and per-comment media preservation regressions.

Runs without network, Pi device state, or downloaded assets.
"""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

class ReplyOneIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extract=(ROOT/'web/reader.js').read_text(encoding='utf-8')
        cls.prep=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        cls.view=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')

    def test_first_reply_checked_again_after_dedup(self):
        self.assertIn("let protectedRawFirst=null",self.extract)
        self.assertIn("firstReplyNeedsRestore(contentEl,protectedRawFirst)",self.extract)
        self.assertIn("source.images>0 && final.images===0",self.extract)
        self.assertIn("source.video && !final.video",self.extract)
        self.assertIn("レス1の本文・画像・動画が失われました",self.extract)

    def test_same_picture_retained_across_replies(self):
        for src in (self.extract,self.view):
            with self.subTest(stage='extract' if src is self.extract else 'display'):
                self.assertIn("const scoped=",src)
                self.assertIn("WeakMap()",src)
                self.assertIn("scopes",src if src is self.view else src.replace("replyScopes","scopes"))

    def test_missing_first_reply_triggers_rebuild(self):
        self.assertIn("if(!first){",self.view)
        self.assertIn("markerInfo(el)===3",self.view)
        self.assertIn("suspicious=true",self.view)

    def test_missing_x_photos_are_reported(self):
        self.assertIn("media_type:'x-image'",self.prep)
        self.assertIn("required_reply:required",self.prep)
        self.assertIn("completed:!required",self.prep)
        self.assertIn("tweet.extended_entities?.media",self.prep)
        self.assertIn("tweet.entities?.media",self.prep)

    def test_first_reply_image_degradation_requests_repair(self):
        self.assertIn("required_reply:firstReplyMedia",self.prep)
        self.assertIn("completed:!firstReplyMedia",self.prep)
        self.assertIn("maybeRepairRequiredReplyMedia(article)",self.view)
        self.assertIn("w?.required_reply===true&&w?.completed===false",self.view)
        self.assertIn("6*60*60*1000",self.view)

    def test_x_video_without_mp4_keeps_x_post_url(self):
        self.assertIn("requiredVideo && !url && tweetId",self.prep)
        self.assertIn("media_type:'x-video'",self.prep)
        self.assertIn("if(requiredVideo && !url && !tweetId)",self.prep)

    def test_script_cache_busting(self):
        reader=(ROOT/'web/reader.html').read_text(encoding='utf-8')
        preparer=(ROOT/'web/prepare.html').read_text(encoding='utf-8')
        update=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        self.assertIn("ready_viewer.js?v=0309",reader)
        self.assertIn("reader.js?v=0302",preparer)
        self.assertIn("prepare_snapshot.js?v=0283",preparer)
        for marker in ("ready_viewer.js?v=0309","reader.js?v=0302","prepare_snapshot.js?v=0283"):
            self.assertIn(marker,update)

if __name__=='__main__':
    unittest.main()
