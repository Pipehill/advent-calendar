#!/usr/bin/env bash
# Resolve from this file so callers can use any working directory.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$script_dir/tools/development/run-local.mjs" "$@"
