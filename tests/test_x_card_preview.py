"""X card news-link preview images and clickable short links regressions."""
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class XCardPreviewTests(unittest.TestCase):
    def test_syndication_card_images_are_saved(self):
        source=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        self.assertIn('function xCardPreviewCandidates(tweet)',source)
        self.assertIn('card.binding_values',source)
        self.assertIn('card.legacy?.binding_values',source)
        self.assertIn('Array.isArray(bindings)',source)
        self.assertIn('thumbnail_image_original',source)
        self.assertIn('img.src=await prepareAsset(preview)',source)
        self.assertIn("img.alt='リンク先の記事画像'",source)

    def test_retains_picture_from_original_x_embed(self):
        source=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        self.assertIn('async function restoreXSourceImages',source)
        self.assertIn('await restoreXSourceImages(card,existing,required,warnings)',source)
        self.assertIn('img.src=await prepareAsset(raw)',source)

    def test_shortlink_is_clickable(self):
        source=(ROOT/'web/prepare_snapshot.js').read_text(encoding='utf-8')
        self.assertIn('fillXTextLinks(body,tweet.text,tweet)',source)
        self.assertIn('expanded.get(raw)||raw',source)
        self.assertIn("link.target='_blank'",source)
        self.assertIn("link.rel='noopener noreferrer'",source)

    def test_prepared_old_text_only_x_cards_reprepare(self):
        source=(ROOT/'web/ready_viewer.js').read_text(encoding='utf-8')
        self.assertIn('function maybeRepairMissingXCardPreview(article)',source)
        self.assertIn('maybeRepairMissingXCardPreview(article)',source)
        self.assertIn("card.querySelector('img,video,.prepared-video,.x-static-media')",source)
        self.assertIn('24*60*60*1000',source)

    def test_styles_and_update_gate(self):
        css=(ROOT/'web/reader.css').read_text(encoding='utf-8')
        self.assertIn('.content .x-static-card > img',css)
        reader=(ROOT/'web/reader.html').read_text(encoding='utf-8')
        prep=(ROOT/'web/prepare.html').read_text(encoding='utf-8')
        update=(ROOT/'UPDATE_ONLY.sh').read_text(encoding='utf-8')
        for page,asset in ((reader,'reader.css'),(reader,'ready_viewer.js'),
                           (prep,'reader.js'),(prep,'prepare_snapshot.js')):
            version=re.search(r'(?:href|src)="('+re.escape(asset)+r'\?v=\d+)"',page)
            self.assertIsNotNone(version,asset+' missing cache-buster')
            self.assertIn(version.group(1),update)
