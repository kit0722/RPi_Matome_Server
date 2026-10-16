# RPi Matome Server v0.1.249 b249 — device-lock network recovery

## Report and evidence

2026-10-17: user confirms v0.1.248 new articles increased on schedule until
device lock, then articles/new articles could no longer be opened. This confirms
release timing before lock, not hidden-stock replenishment during inactivity.
No live Pi log or device trace was available for this fix; the precise runtime
failure remains unverified.

Code defects addressed: new-buffer polling/list/publication requests had no
deadline and could retain running guards after a suspended fetch. Reader retry
awaited an unbounded ready-lease request before its second article attempt.

- Bound full JSON delivery (headers AND body), abort on hiding, release guards
  in finally; preserve atomic/idempotent new-buffer acknowledgements.
- Reader article attempts: 7s each, 2 attempts; lease renewal no longer blocks
  retry. Add a reload action after network failure.
- iPad/desktop article navigation no longer waits for a separate Pi preflight
  that silently removed articles on a transient connection failure.
- Cache-bust modified scripts. Keep 5s/2-item release policy, database, article
  ownership, images, settings, existing reader font controls unchanged.

## Validation / MAGI three-perspective self-review

- MELCHIOR (logic/regression): 23 Python tests PASS; mocked JS network tests
  PASS for stalled headers, stalled body, lock cancellation, resumed success and
  HTTP failure on both server scripts and both app scripts. This is simulation,
  not an iOS device-lock test.
- BALTHASAR (dependencies/linking): both JS syntax checks PASS; Python syntax,
  shell syntax and diff whitespace PASS. No new runtime dependencies. Node test
  is a development check; the Pi update does not require Node.
- CASPER (delivery): latest.json, health/build and UPDATE_ONLY checks agree at
  0.1.249/249; HTML script query keys agree with installer verification. Paired
  app v0.1.74 adds loopback listener checks and foreground connection renewal.

This review used three perspectives in one session, not independent agents.
Pi deployment, iOS compilation/IPA and physical-device behavior remain untested.
Next actual test: open/read new articles, lock/unlock, tap new articles again;
verify list position/settings remain and new-buffer polling resumes. Check
/api/standby-settings for actual standby inventory separately.
