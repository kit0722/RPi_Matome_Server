"""Regression checks for article font buttons and informative new-buffer polling."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class ReaderFontControlsTests(unittest.TestCase):
    def test_reader_has_font_plus_and_minus(self):
        html=(ROOT/"web/reader.html").read_text(encoding="utf-8")
        css=(ROOT/"web/reader.css").read_text(encoding="utf-8")
        script=(ROOT/"web/ready_viewer.js").read_text(encoding="utf-8")
        self.assertIn("reader.css?v=0303",html)
        self.assertIn('class="reader-font-step reader-font-dec"',html)
        self.assertIn('class="reader-font-step reader-font-inc"',html)
        self.assertIn('applyReaderFont(',script)
        self.assertIn("reader-font-inc')?.addEventListener",script)
        self.assertIn("reader-font-dec')?.addEventListener",script)
        self.assertIn("#readerHeader .reader-font-size-control .reader-font-step",css)
        # The final rule must override the old tablet/PC display:none setting.
        self.assertLess(css.index(".reader-font-size-control .reader-font-step { display:none"),
                        css.rindex("#readerHeader .reader-font-size-control .reader-font-step"))
        self.assertIn("display:inline-flex !important",css[css.rindex("#readerHeader .reader-font-size-control .reader-font-step"):])

    def test_latest_matches_served_api_and_update_script(self):
        latest=json.loads((ROOT/"latest.json").read_text(encoding="utf-8"))
        self.assertEqual(latest["version"],"0.1.248")
        self.assertEqual(latest["build"],248)
        script=(ROOT/"UPDATE_ONLY.sh").read_text(encoding="utf-8")
        self.assertIn('reader.css?v=0303',script)

    def test_buffer_state_reports_real_stock(self):
        server=(ROOT/"server.py").read_text(encoding="utf-8")
        for expected in ('"standby_empty"','"buffer_full"',
                         '"can_release_from_standby"','"refill_state"'):
            self.assertIn(expected,server)


if __name__=="__main__":
    unittest.main()
