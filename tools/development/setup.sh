#!/usr/bin/env bash
# Prepare this clone through the shared Bash bootstrap.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$script_dir/bootstrap.sh" setup
