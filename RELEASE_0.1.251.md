# RPi Matome Server v0.1.251 b251 — stability and latency audit

Baseline main: be28b5adb166ddfe8970866de8228abff4a6a3d9 (v0.1.250 b250).
Companion app: v0.1.75 b75. No Pi deployment or IPA build was performed.

## Confirmed defects corrected

1. Authoritative discovery evicted `retry` articles outside the latest feed
   even when they already had a prepared body. A visible article undergoing
   refresh could become unreadable solely because discovery ran. Preserve all
   completed snapshots; evict only unfinished candidates. Temp-DB reproduction
   now proves the article remains listed/readable while obsolete unfinished
   candidates can still be evicted.
2. `list_ready` always attempted a write for lease renewal, including updates
   affecting zero rows. A preparing/maintenance writer could hold the list for
   the 15-second SQLite busy timeout. Read list rows in a WAL snapshot, close it,
   and renew only short leases through a separate 50ms best-effort writer.
   Existing long view leases are never shortened. Counts/manifests now explicitly
   use one read snapshot rather than mixing autocommit SELECTs.
3. A malformed discovery row/timestamp could abort discovery and delay all good
   candidates. Ignore non-object rows and normalize invalid/nonfinite source
   times; retain valid rows from the same batch.
4. Read-history synchronization, frozen-list leases and article-prefetch promises
   could stay pending after device suspension. Bound complete JSON delivery and
   cancel these requests on hiding, releasing each pending guard/map entry.
5. Malformed JSON/non-object POSTs and invalid acknowledgement timestamps could
   fall back to an empty/default request and consume the whole new buffer.
   Reject these with 400; reject oversized lengths before reading. Valid omitted
   `through` remains compatible, and valid bounded retries remain idempotent.

Maintenance requested by acknowledgement is throttled rather than rescanning
all assets for every retry/tap. Add release/hidden-stock query indexes without
resetting tables or settings. New small-state diagnostics include standby_target,
standby_full, auto_slide_eligible and auto_slide_waiting_for_standby.
The v0.1.250 rule remains: auto-promote 100 only at new=300 AND hidden MAX;
manual acknowledgement remains available independently of hidden stock.

## Companion app defect

v0.1.74's bounded-fetch refactor lost the `fromOfflineSnapshot` declaration and
response-header handling. JS syntax/static source checks did not detect the
ReferenceError in `fetchReadyList`. v0.1.75 restores the flag and native offline
header propagation, with tests executing the actual list parser online/offline
and exercising the transport metadata. The new tests cover this regression;
they are not DOM rendering or physical iOS tests.

## Verification

- 40 Python tests PASS: real loopback HTTP, 6 concurrent reader tasks with a
  writer (120 read cycles plus 60 writes), held-writer list/body access, parallel
  release, restart persistence, discovery retention, malformed input, manual
  acknowledgement, full-stock auto-slide, read history and active leases.
- Node tests PASS: actual online/offline list parser; stalled headers/body,
  hide cancellation/resume, native offline header, HTTP failure; existing native
  new-badge acknowledgement/failure/concurrent-release/duplicate-tap scenarios.
- Python/JS syntax, shell syntax, app source/version contracts and whitespace
  checks PASS. No new runtime dependency. Node is not required on the Pi.

## Local performance evidence

`VALIDATION_v0.1.251_performance.json` records the synthetic comparison against
v0.1.250: 500 committed + 300 new + 1000 hidden + 20,000 old metadata rows.
Thirty samples per operation after three warm-ups; one sequential comparison
run on this environment, not controlled Pi/network measurements. Ordinary
median list latency: 18.909ms baseline / 13.655ms current; cached body:
0.589ms / 0.491ms. Do not generalize these ratios across devices.
With an intentionally held 800ms DB writer, a warm list took 912.363ms baseline
and 23.461ms current. This specifically demonstrates avoiding an unnecessary
write lock during list rendering. A separate test covers first-time lease
renewal while the writer remains locked, requiring response under 1 second.

Reproduce: `python3 tests/benchmark_store.py --baseline-ref be28b5a`.

## MAGI three-perspective self-review and limits

MELCHIOR: transaction boundaries, idempotent ack, bounded asynchronous guards,
existing hidden-MAX gate, caches/history/lease preservation reviewed and tested.
BALTHASAR: no new runtime dependencies or BundleID changes; paired app/server
API remains compatible; native offline response metadata preserved.
CASPER: server health/latest/installer 0.1.251/251 and app plist/project
0.1.75/75 consistent. HTML cache keys and update verification agree.
Three perspectives were reviewed in one session, not by independent agents.

Not verified: live Raspberry Pi, upstream source throughput, real iPhone/iPad
lock/unlock and offline mode, Swift/iOS compilation, arm64 IPA/signing. Browser
executables were unavailable, so no full-browser DOM smoke test completed.
Existing WKWebView recovery/HTTP-listener Swift code was reviewed but not
changed in v0.1.75. Available sources/preparation speed can still limit stock.
Next device check: update server/app, read new article, lock/unlock, tap new
badge, verify saved article offline and monitor actual standby_ready/inventory.
