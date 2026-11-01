#!/usr/bin/env bash
# Read-only MAGI source tests; no app build, IPA, sudo or active server changes.
set -uo pipefail
cd "$(dirname "$0")/.."
python3 tools/magi_runner.py --config tools/magi_plan.json --out .build/magi_report
rc=$?
echo "MAGI_REPORT=.build/magi_report/report.json"
echo "IOS_COMPILE=NOT_TESTED IPA=NOT_BUILT DEVICE=NOT_TESTED"
exit "$rc"
