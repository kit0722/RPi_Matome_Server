# RPi Matome Server v0.1.252 b252 — retention safety audit

Baseline: 212a7dcc281b5b4a509a6841f6e44ac8046ce32e (v0.1.251 b251)

- Expired article body JSON is no longer unlinked before its SQLite retirement transaction commits. After commit, a short write transaction rechecks DB ownership before unlinking, so a failed retirement cannot delete an otherwise readable body.
- Transient asset-file unlink errors no longer abort the whole retention transaction.
- Added two regression cases: injected file deletion failure and ordinary retired-body removal.
- Updated health version, kit-tool latest.json, and UPDATE_ONLY.sh verification in lockstep.

Maintained: 500 committed, new 300, standby 500–3000, full-stock 100 promotion rule, read history, existing archives and images. No Pi deployment; Python tests and device behavior have not been executed in this connector environment.
