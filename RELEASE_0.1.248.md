# RPi Matome Server v0.1.248 b248

## Fixed: hidden standby never fills despite target 1000

- Root cause: after the initial 500 were committed, the publisher bypassed standby for any article whose source timestamp was within the last 20 minutes, irrespective of active viewers. That path marked new articles released immediately, so the hidden completed stock remained at zero while newer feeds arrived.
- New first-time completions with an established new-buffer cutoff now always enter hidden standby (release_time=0); prior completed/reprepared items retain their original publication timestamp. Initial 500 bootstrap still publishes directly.
- The viewer-active server pump is now the sole releaser: up to 2 previously prepared articles each 5 seconds. Availability is bounded by actual unique source candidates and preparation speed; this does not create 1000 articles instantly.
- /api/standby-settings now reports worker_state, candidate_pending, candidate_retry_due, candidate_preparing, candidate_failed, last_discovery, discovery_health, and refill_state (stock_available, preparing_candidates, no_pending_candidates, worker_unavailable).
- Additional temp-database regression tests prove that current (<20 minute) feed items stay hidden until release, and initial articles still publish.
- Existing ready article bodies, asset files, caches, user settings, Yahoo server, and old read history are not reset. No automatic Pi deployment occurs on GitHub push.

## Verification on Pi

    curl -fsS http://127.0.0.1:8767/api/health
    curl -fsS http://127.0.0.1:8767/api/standby-settings

Note: after installation, wait for new unique candidates to complete while the viewer is inactive to grow hidden stock. If candidate_pending/retry_due/preparing all stay zero, the source discovery pool (not the release timer) limits inventory.
