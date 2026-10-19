# RPi Matome Server v0.1.255 b255 (2026-10-19)

## Scope
Inventoried all 67 Git paths and inspected primary implementation and existing tests for article acquisition, parsing, snapshots, video playback, reader display, cache/retention, new buffer, hidden standby, endpoints and update gates. This is a targeted static/source audit, not an exhaustive live-site or all-code-path proof.

## Confirmed fixes
- An arbitrary non-YouTube iframe used to abort entire article preparation with "未整理の埋め込みが残っています". Keep a safe HTTP(S) source link instead and exclude invalid/advertisement sources with a warning; preserve YouTube cards unchanged.
- In previously prepared articles, raw MP4/WebM/M4V links outside video.twimg.com never received an inline player. Now render a click-to-play HTML5 video beside the retained URL, route to Pi relay if a stored video record exists, and avoid duplicate generated/prepared players.
- Don't manufacture links for empty iframe src, and unwrap the existing /api/proxy?url= source.
- Bump content cache-busters, server version/build, and update gate. Add offline regression checks.

## Preservation
No article DB/schema, retention sizes (500 completed/300 new/hidden standby), user configuration, raw cache content, OS settings, and Yahoo server files changed. No Pi update was executed.

## Verification and limitations
JavaScript syntax checked for browser modules; isolated browser-logic simulation PASS for MP4/WebM/M4V, duplicate handling, retained hyperlinks, Vimeo/YouTube iframe, URL proxy, invalid/empty/ad URLs. These do not replace tests against real origins or iOS devices.
Full Python integration-suite and actual Pi deployment are not executed in this session. Already cached image-only snapshots with neither video URL nor video record cannot be magically recovered; they need targeted reprepare.
