#!/usr/bin/env bash
# Diagnose this clone without installing or repairing prerequisites.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$script_dir/bootstrap.sh" doctor
