# Developer setup and doctor

These scripts prepare the quality workflow and runnable backend/frontend prerequisites.
They require PowerShell on Windows or Bash on macOS/Linux. Invoke them from any
directory using their absolute paths; paths containing spaces are supported.

```powershell
# Windows, from the repository root
./tools/development/setup.ps1
./tools/development/doctor.ps1
```

```bash
# macOS / Linux, from the repository root
bash tools/development/setup.sh
bash tools/development/doctor.sh
```

Setup installs missing tools, prepares `.quality-cache/venv` from the existing
pinned requirements, prepares the quality image using the existing runner, and
installs and initializes commit hooks. Rerun it after cloning, dependency changes,
partial installation, or a required restart. It also installs lockfile-pinned jscpd
5.4.1 platform packages and reuses a matching installation. Doctor checks its binary,
MCP initialization/tool schemas/refresh, authored-source scope and CLI reports without
persisting measurements. See [code health](../quality/health.md) for client setup and
diagnostics. Rerun setup if optional native packages were omitted or are missing.

Compatible tools, machines and images are reused. Existing incompatible Node
installations and venvs are preserved and
require the reported manual remedy. Python 3.14 can be installed alongside older
system Python; setup never changes the distribution's Python symlink.

Doctor prints `PASS`/`FAIL`, resolved paths and versions, expected requirements and
remedies. Exit zero means every required check passed; a nonzero exit means work
remains. It never installs packages, hooks or images, changes settings, or starts
machines. It executes a temporary, offline Linux container with a read-only mount
using the already installed quality image, then removes that container. A runtime
which cannot execute Linux containers or read the mount is not ready.

## Prerequisites and installation routes

| Platform | Package manager | Missing tools |
| --- | --- | --- |
| Windows | WinGet / Microsoft App Installer | `Git.Git`, `OpenJS.NodeJS.LTS`, `Python.Python.3.14`, `RedHat.Podman` (or selected `Docker.DockerDesktop`) |
| macOS | Homebrew | `git`, `node@24`, `python@3.14`, `podman` (or selected Docker cask) |
| Ubuntu / Debian | apt | Git, Podman (or selected `docker.io`), Python 3.14 and venv if available; NodeSource 24 apt repository for missing Node |
| Other Linux | Manual installation | Doctor works; setup explains the distribution-specific prerequisites without attempting apt installation. |

The baseline is Node.js 24 LTS and Python 3.14. Setup evaluates the actual `node`
on PATH, including the process used for IDE commits. It does not silently upgrade
an incompatible installed Node. Select/install Node 24 and restart the terminal
and IDE before rerunning. The WinGet LTS package can change its major over time;
the shared version check still requires 24. Choose a Node 24 installer if needed.
Homebrew's `node@24` is keg-only: add its `bin` directory to your persistent shell
PATH using `brew --prefix node@24`, then restart the terminal and IDE.

If apt does not offer Python 3.14, setup uses the official versioned uv 0.13.0
installer and downloads managed Python 3.14 to `.quality-cache/python`. uv is kept
in `.quality-cache/uv` without modifying shell profiles. Its path is not needed
for commits. The resolved Python path is saved locally and the hook embeds the
venv Python path. Python discovery also supports the Windows `py -3.14` launcher
and the base interpreter in an existing venv's `pyvenv.cfg`. Store execution
aliases which fail to launch Python are diagnosed rather than treated as installed.

Install a missing package manager yourself using its upstream instructions below.
Windows installation can require UAC and a terminal/IDE restart. Homebrew requires
its supported macOS environment and developer tools. apt requires root or sudo;
denied privileges, network failures and pending restarts are failures, not readiness.
PowerShell must permit local repository scripts under your organization's policy.

Podman is preferred for a new installation. An existing reachable Docker or Podman
engine is retained. Windows/macOS Podman requires a Linux machine and supported
virtualization; Windows usually requires WSL2 and may require a reboot. Setup creates
a machine only if none exists, and starts the stopped machine matching the existing
default connection. It refuses to reset machines or change an ambiguous/unreachable
connection. Start Docker Desktop yourself and select Linux containers when needed.
Linux Docker may require administrator-managed daemon/group configuration; setup
does not grant group membership or change system services.

On macOS, automatic Podman installation uses the Homebrew formula. Podman's upstream
documentation recommends its official installer and cautions that Homebrew is
community maintained. If the formula does not work, install the upstream package,
make its CLI visible on PATH, and rerun setup. Existing runtimes are preserved.

## Persistent settings and recovery

Setup writes the absolute runtime path and Python path to ignored
`.quality-cache/development.json`. The runner and disposable-clone verifier use
this runtime in new processes without requiring a setup-only environment variable.
`QUALITY_CONTAINER_RUNTIME` overrides it; CI ignores the local file and defaults
to Docker. A fresh clone needs setup and hook installation of its own.

Fix PATH in the committing terminal/IDE, not only inside setup. After installation,
open a new terminal and restart the IDE, then run doctor there. If the runtime moves,
correct/remove only its entry in the local settings or use an explicit override
and rerun setup. Malformed settings fail with an error rather than being discarded.

For a stopped Podman engine, inspect `podman machine list` and
`podman system connection list`, start the selected machine and rerun doctor.
For mount failures, check runtime file sharing and repository permissions. Missing
or stale images need `node tools/quality/run.mjs setup`. Missing/mismatched hook
dependencies need developer setup. A custom `core.hooksPath` is preserved; resolve
that configuration explicitly before installing these hooks. Setup does not
overwrite unrelated hooks with `--overwrite`; pre-commit retains them as legacy
hooks. Relocate an incompatible venv manually before rerunning setup.

After preparation, run `node tools/quality/run.mjs full` and
`node tools/quality/verify.mjs` for quality and disposable-clone hook verification.
Commits on `main` remain blocked. See [code quality](../../docs/code-quality.md)
for staged snapshots, receipts and reports.

## Maintenance and verification

`environment.mjs` owns the ordered setup workflow and runtime preparation.
`diagnostics.mjs` collects read-only readiness checks; `commands.mjs` owns
argument-array command execution and PATH discovery. Platform installation stays
in `adapters.mjs`, and versions remain in `requirements.mjs`.

When introducing or changing a local prerequisite, update setup, doctor, their
shared requirements, these instructions and relevant tests in the same change.
Dependency lists and image pins remain owned by the existing quality files.
Frontend setup installs pnpm 12.11.2 privately under `tools/frontend/node_modules`,
installs the frozen frontend lockfile, and generates API contracts and translations.
Doctor checks the pinned pnpm and installed frontend dependencies. Global pnpm is
preserved; use `node tools/frontend/check.mjs dev` when pnpm is not on PATH.
Backend setup installs the
exact .NET SDK from `global.json` into `.quality-cache/dotnet` when no matching
SDK exists, preserves system installations, and saves its resolved executable.
Doctor reports the matching SDK and selected runtime's Compose provider. A missing
provider uses WinGet `Docker.DockerCompose`, Homebrew `docker-compose`, or apt
`docker-compose-v2`; distributions without that package need manual installation.
Setup restores locked backend packages, the pinned NSwag tool and Redocly CLI.
`DOTNET_EXE` explicitly overrides the saved SDK for shared backend commands.

After setup, run `./run-local.ps1` or `bash run-local.sh` from the repository root.
These entry scripts forward arguments to `tools/development/run-local.mjs`; all
implementation helpers remain under `tools/`. Absolute script paths work from
another directory, including paths with spaces.

The launcher builds the backend image, runs backend integration and frontend unit
tests, starts PostgreSQL/API containers, waits for readiness and starts Vite with
hot reload in the terminal. `--frontend=dev|container` selects the frontend mode
(default `dev`). Container mode builds both application images and exits after
frontend readiness. `--skip-build` reuses existing images and never builds missing
ones; tests and dev contract generation can still compile source. `--skip-test`
skips both suites. `--help` prints usage without requiring a container engine.
An incompatible Node version fails before builds or runtime commands, using the
same prerequisite version check as setup/doctor. Select Node 24 on PATH first.

Dev mode stops the frontend container before starting Vite. Ctrl+C stops only the
owned Vite process; backend/database stay running and preserve data. Stop Vite
before switching to container mode. Port conflicts fail with a diagnostic rather
than choosing another port or terminating an unrelated process. Failed tests stop
launch before services are started. Readiness failures print service status/logs.

The launcher reuses the
saved runtime; `QUALITY_CONTAINER_RUNTIME` overrides it. `API_PORT` (default
8080), `FRONTEND_PORT` (3000), `DATABASE_PORT` (5432) and
`LOCAL_START_TIMEOUT_SECONDS` (120, at most 600) are configurable. Vite binds to
localhost on the configured frontend port and the BFF calls the published API port.

Launcher tests use the selected local Podman machine/socket, disable Ryuk for
rootless Podman unless explicitly configured, and preserve explicit `DOCKER_HOST`
and `TESTCONTAINERS_RYUK_DISABLED`. Remote connections need an explicit test endpoint.
Test databases remain disposable and separate from the persistent development
database. Docker retains native Testcontainers discovery. No persistent shell
settings, machine connections or volumes are changed.

See [frontend workflows](../../src/frontend/README.md) for host backend hot reload,
language selection, production builds and browser verification, and
[backend workflows](../../src/backend/README.md) for API examples and configuration.

Run focused regressions with `node --test tools/development/environment.test.mjs`.
The tests cover requirement evaluation, runtime precedence, platform adapters,
failure propagation, machine preservation and missing-tool diagnoses. CI also
executes the Bash missing-Node bootstrap test. Simulated checks do not establish
platform integration readiness. Actual results and unverified scenarios are
recorded in [verification](verification.md).

Native Linux/macOS installation verification is deferred because test machines
were unavailable when the implementation was accepted. If installation fails on
Ubuntu/Debian or macOS, investigate the cause, correct script or recovery guidance
defects, and record the fix and rerun results in the verification report. The
[temporary follow-up rule](../../.agents/rules/architecture.md#temporary-linuxmacos-installation-follow-up)
can be removed once successful installation and workflow evidence is recorded for
both platforms.

Installation references checked during implementation:
[WinGet](https://learn.microsoft.com/windows/package-manager/winget/install),
[Homebrew](https://docs.brew.sh/Installation),
[Node 24 formula](https://formulae.brew.sh/formula/node@24),
[Python 3.14 formula](https://formulae.brew.sh/formula/python@3.14),
[Podman installation](https://podman.io/docs/installation),
[NodeSource](https://github.com/nodesource/distributions/blob/master/DEV_README.md),
[uv installation](https://docs.astral.sh/uv/getting-started/installation/), and
[managed Python](https://docs.astral.sh/uv/guides/install-python/).
