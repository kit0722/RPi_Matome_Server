# RPi Matome Server v0.1.256 b256 (2026-10-19)

## Root-cause follow-up for video posters
The reader's image-click lightbox intercepted clicks on images wrapped in direct MP4/WebM/M4V/HLS source anchors. This could make a preserved "クリックで閲覧" video link appear broken even after the URL-retention update.

- Exempt image-with-video links from both image onclick and the capturing lightbox event listener in the current reader.
- Apply equivalent exemption in preparation/legacy reader paths.
- Keep the normal JPEG/PNG image lightbox and GIF behavior unchanged.
- Retain v0.1.255 multi-provider player and iframe URL fallback fixes. Update script cache-busters and add isolated regression checks.

No cache reset, article/data schema change, retention/standby count change, settings override, or Yahoo server change.

Verification: static checks and isolated event-handler simulation passed for MP4/WebM/M4V/m3u8 and regular JPG. Full Python integration suite and Raspberry Pi/iPhone live tests remain unperformed; site access/auth/cross-origin conditions may still prevent playback.
