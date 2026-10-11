#!/usr/bin/env bash
# Bootstrap only the Node prerequisite; shared JavaScript handles the rest.
set -euo pipefail

mode="$1"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

install_node_on_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    echo 'Homebrew is missing: follow https://docs.brew.sh/Installation, then rerun setup.' >&2
    exit 1
  fi

  brew install node@24

  # node@24 is keg-only. The developer must make its PATH persistent.
  echo 'Add the Homebrew node@24 bin directory to your persistent PATH, restart terminal/IDE, and rerun setup.' >&2
  exit 1
}

require_supported_linux() {
  # Only the explicitly supported distributions may install with apt.
  . /etc/os-release

  case "${ID:-}" in
    ubuntu|debian)
      ;;
    *)
      echo 'Automatic installation supports Ubuntu/Debian only. Install Node.js 24 LTS manually.' >&2
      exit 1
      ;;
  esac

  if ! command -v apt-get >/dev/null 2>&1; then
    echo 'apt-get is missing; install Node.js 24 LTS manually.' >&2
    exit 1
  fi
}

run_as_administrator() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo 'sudo is missing; ask an administrator to install Node.js 24 LTS.' >&2
    exit 1
  fi

  sudo "$@"
}

install_node_on_linux() {
  require_supported_linux

  # NodeSource supplies the required major when distribution Node is older.
  installer="$(mktemp)"
  trap 'rm -f -- "$installer"' EXIT

  run_as_administrator apt-get update
  run_as_administrator apt-get install -y curl ca-certificates

  curl -fsSL https://deb.nodesource.com/setup_24.x -o "$installer"
  run_as_administrator bash "$installer"
  run_as_administrator apt-get install -y nodejs

  rm -f -- "$installer"
  trap - EXIT
}

bootstrap_node() {
  # Doctor must explain missing prerequisites without installing anything.
  if [ "$mode" = doctor ]; then
    echo 'FAIL Node: install Node.js 24 LTS, restart your terminal/IDE, and run setup.sh.' >&2
    exit 1
  fi

  case "$(uname -s)" in
    Darwin)
      install_node_on_macos
      ;;
    Linux)
      install_node_on_linux
      ;;
    *)
      echo 'Unsupported platform. Install Node.js 24 LTS manually.' >&2
      exit 1
      ;;
  esac
}

if ! command -v node >/dev/null 2>&1; then
  bootstrap_node
fi

exec node "$script_dir/environment.mjs" "$mode"
