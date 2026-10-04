#!/bin/bash
set -euo pipefail
exec bash "$(dirname "$0")/UPDATE_ONLY.sh"
