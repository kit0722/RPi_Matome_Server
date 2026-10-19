# RPi Matome Server v0.1.254 b254 (2026-10-19)

- Preserve original MP4/WebM/M4V links during snapshot preparation. Video deduplication no longer removes source anchors or source-only paragraphs.
- Add clickable video URL fallback to every new prepared video card; if only a tweet ID is present, link to the X post.
- Reconstruct missing video URL links from stored records for already cached articles. Keep fallback clickable after playback starts and when it fails.
- Preserve fallback URLs in the legacy reader too, with regression tests and viewer stylesheet/script cache busting.
- Existing new/standby count, article database, live relay, and maintenance behavior unchanged.

## Validation
- Source invariants and JavaScript parser checks performed before commit.
- Pi upgrade, live replay, iPhone/iPad validation are NOT YET tested.
- Old image-only snapshots without video records may require targeted re-preparation.
