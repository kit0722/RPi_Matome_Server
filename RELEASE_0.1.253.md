# RPi Matome Server v0.1.253 b253 — update self-test repairs

Base: f1e3b0be1b94bdabda2f797d2736f0de1448455a (v0.1.252 b252).

## Reported update failure
The Pi update preflight (42 tests) refused to install v0.1.252 because two tests failed. Existing running v0.1.251 and all saved cache/DB data were preserved by UPDATE_ONLY.sh.

1. `test_reader_controls.py` still asserted literal version/build 0.1.251/251, while the release metadata and server health were correctly updated to 0.1.252/252. It now compares against the actual server health version/build and the installer verification, with no hardcoded release number.
2. `test_stability.py` seeded retired article files as `retire-normal.json`; production article bodies use SHA-256 filename `<64 hex>.json`, and the GC intentionally refuses to unlink noncanonical names. The fixture now writes real production-format SHA-256 body names. The success assertion checks that canonical path, and the simulated unlink-error test now actually exercises the protected deletion path.

No need to loosen body filename validation. No change to the protected retention logic, article content, new buffer, hidden stock or read history. Runtime test execution is still required on Pi by the existing **pre-install** test gate; no server installation or service restart has been triggered.
