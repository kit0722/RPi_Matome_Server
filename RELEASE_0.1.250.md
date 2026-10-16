# RPi Matome Server v0.1.250 b250

## Auto-promote 100 only when hidden standby is full

User request 2026-10-17: require hidden inventory MAX before automatically
promoting the oldest 100 of 300 new articles into the rolling 500-item list.

- `_slide_full_new_buffer` now reads the configured standby target in the
  caller's transaction and requires ready hidden stock >= target. The default
  requires 1000 completed hidden articles; 500/1500/2000/2500/3000 settings use
  their own targets. Retry/preparing rows do not qualify as available stock.
- All existing automatic callers (publisher, pre-release and post-release)
  share this gate. A release from 299 to 300 that leaves stock below MAX must
  not promote 100 afterward. When new=300 and stock is below MAX, stop at 300
  and let preparation refill the hidden inventory.
- Manual new-badge acknowledgement remains available at any stock level.
  Normal 5s/max-2 publication below 300 is unchanged. No database reset,
  cache/settings deletion, iPhone source change or automatic deployment.

## Validation and MAGI review

29 Python tests PASS: empty/999/1000 inventory, configurable targets 500 and
1500, retry rows excluded, post-release below-MAX boundary, manual ack with no
stock, and preserved read history/view leases. Existing simulated JS recovery
tests PASS. Python compilation, shell syntax and whitespace checks PASS.

Three-perspective self-review in one session (no independent agents):
MELCHIOR: automatic entry points use the same transaction-scoped gate; manual
ack and 300-item ceiling preserved.
BALTHASAR: no new dependency or endpoint; schema/files unchanged.
CASPER: health/latest/installer metadata consistent at 0.1.250 b250; iPhone
stays v0.1.74 b74. Pi deployment and actual behavior remain untested.
