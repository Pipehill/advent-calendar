# Developer setup and doctor

Prepare a checkout once, then use the [root local launcher](../../README.md#run-the-application-locally).
Invoke these entry points by absolute path from any directory; spaces are supported.

| Platform | Setup | Read-only diagnosis |
| --- | --- | --- |
| Windows / PowerShell | `./tools/development/setup.ps1` | `./tools/development/doctor.ps1` |
| macOS / Linux / Bash | `bash tools/development/setup.sh` | `bash tools/development/doctor.sh` |

Setup installs missing prerequisites, restores private tools and locked dependencies,
prepares the quality image and installs hooks. Matching installations and runtime
machines are reused. Rerun after dependency changes, partial installation or restart.
Doctor reports all detected paths, versions, failures and remedies; it installs
nothing, starts no machines and returns nonzero until every check passes. It runs
a disposable offline Linux container with a read-only repository mount.

## Prerequisites and installation routes

Exact versions live in `requirements.mjs`, `global.json` and package manifests.
Host requirements are Node 24 LTS, Python 3.14, Git and a Linux container runtime.

| Platform | Installer | Missing prerequisites |
| --- | --- | --- |
| Windows | WinGet | Git.Git, OpenJS.NodeJS.LTS, Python.Python.3.14, RedHat.Podman or selected Docker.DockerDesktop |
| macOS | Homebrew | git, node@24, python@3.14, podman or selected Docker cask |
| Ubuntu/Debian | apt | Git, selected runtime, Python/venv; NodeSource 24 for missing Node |
| Other Linux | Manual | Doctor diagnoses; setup explains unsupported installation routes. |

Setup preserves incompatible Node/venv installations and reports the manual remedy.
Select Node 24 on the terminal/IDE PATH; WinGet's LTS package may change major.
Homebrew's `node@24` is keg-only: add `$(brew --prefix node@24)/bin` to persistent
PATH. Restart the terminal and IDE after PATH changes.

If apt lacks Python 3.14, the official pinned uv installer supplies managed Python
under `.quality-cache/python`, with uv under `.quality-cache/uv`; profiles and
system Python symlinks are unchanged. Discovery also supports `py -3.14` and an
existing venv's base interpreter. Disable Windows Store execution aliases if they
shadow real Python. Relocate an incompatible `.quality-cache/venv` manually.

A matching .NET SDK is reused; otherwise setup installs the exact `global.json`
SDK privately under `.quality-cache/dotnet`. pnpm is installed privately under
`tools/frontend/node_modules`; global pnpm is preserved. Setup restores the local
NSwag tool, Redocly and frozen frontend/backend dependencies.

Compose must work through the selected runtime. Missing providers use WinGet's
Docker.DockerCompose, Homebrew's docker-compose or apt's docker-compose-v2;
unsupported distributions require manual provider installation.

Install missing package managers yourself. Installation may require UAC/sudo,
virtualization, a permitted PowerShell execution policy and a terminal/IDE restart.
Denied privileges, network failure and pending reboot remain explicit failures.

## Persistent settings and recovery

Setup saves runtime, Python and SDK paths in ignored `.quality-cache/development.json`.
`QUALITY_CONTAINER_RUNTIME` and `DOTNET_EXE` override saved choices. CI ignores local
settings and defaults to Docker. Malformed settings fail rather than being discarded.
Each clone needs its own setup and hooks.

Podman is preferred for new installations; existing reachable Docker/Podman engines
are retained. On Windows/macOS, setup creates a Podman machine only when none exists,
or starts the stopped machine matching the default connection. It never resets
machines or changes ambiguous connections. Inspect `podman machine list` and
`podman system connection list` when recovery is needed. Windows usually needs WSL2;
Docker Desktop must already serve Linux containers. Setup does not change Linux
services or Docker group membership.

On macOS, Podman's Homebrew formula is community maintained. If it fails, use the
official upstream installer, expose its CLI on PATH and rerun setup. For mounts,
check runtime sharing/permissions; for a missing/stale quality image run
`node tools/quality/run.mjs setup`. Missing hook dependencies need setup again.
Custom `core.hooksPath` is preserved and must be resolved explicitly before hook
installation; unrelated hooks are retained as legacy hooks rather than overwritten.

## Maintenance and verification

| Workflow | Command owner |
| --- | --- |
| Local start and mode/skip flags | [Root launch instructions](../../README.md#run-the-application-locally) |
| Contract generation, restore/build/test/publish | [Backend native commands](../../src/backend/README.md#contract-build-and-tests) |
| Frozen install, frontend dev/test/build | [Frontend package scripts](../../src/frontend/README.md#contracts-builds-and-tests) |
| Staged/full checks, hooks and reports | [Code quality](../../docs/code-quality.md) |
| Health baseline/comparison and MCP | [Advisory health](../quality/health.md) |

Prefix native dotnet arguments with `node tools/development/dotnet.mjs` to use the
saved private SDK or `DOTNET_EXE`; it preserves the current directory.
Use `node tools/frontend/pnpm.mjs <arguments>` from the repository root for private
pnpm; it runs in `src/frontend` and exposes its executable to nested package scripts.

Setup's ordered workflow lives in `environment.mjs`, read-only checks in
`diagnostics.mjs`, versions in `requirements.mjs`, platform installation in
`adapters.mjs` and argument-array execution in `commands.mjs`. The launcher owns
Vite signals, port checks and tests-before-start; Compose owns service dependencies
and persistent volumes. The Podman Testcontainers adapter preserves explicit
`DOCKER_HOST`/`TESTCONTAINERS_RYUK_DISABLED` and never changes shell settings.

Run `node --test tools/development/*.test.mjs` for simulations and lifecycle checks.
Actual platform evidence and inherited deferrals are in [verification](verification.md);
the current simplification assessment is in [tooling review](tooling-review.md).
Native Ubuntu/Debian/macOS installation evidence remains outstanding.

Installation references: [WinGet](https://learn.microsoft.com/windows/package-manager/winget/install),
[Homebrew](https://docs.brew.sh/Installation), [Podman](https://podman.io/docs/installation),
[NodeSource](https://github.com/nodesource/distributions/blob/master/DEV_README.md),
[uv](https://docs.astral.sh/uv/getting-started/installation/).
