# Developer tooling verification

## Plan 00010: native build ownership (2026-10-25)

Current outcomes and limitations are maintained once in the
[tooling review](tooling-review.md#verification-record).

## Root local launcher and frontend modes (2026-10-13)

The root `run-local.ps1` and `run-local.sh` entry scripts forward flags to the
shared launcher under `tools/development`. The default starts backend/database
containers and host Vite; `--frontend=container` builds and starts the complete
stack. Backend integration and frontend unit tests run before services start unless
`--skip-test` is supplied. `--skip-build` skips application image builds only;
tests and dev contract generation can still compile source.

Actual Windows verification used Node 24.14.0, Podman 6.0.2, Compose 5.5.1 and
the saved .NET SDK 10.0.401. The root PowerShell launcher built both images,
automatically selected the existing Podman machine's named-pipe test endpoint,
passed all 42 backend integration tests and 21 frontend unit tests, and announced
both readiness endpoints. PowerShell native stderr progress remains visible
without turning a successful build into a failure when output is redirected.

All developer-tooling regressions passed: 83 passing and one existing
platform-specific skip. The targeted launcher suites cover invalid flags, modes,
custom ports, image/test skips, failed builds/tests, readiness diagnostics,
occupied ports, Vite startup/exit/interrupt cleanup and Podman endpoint selection.
Linux/macOS endpoint cases are simulated, not native integration evidence.

Actual Edge browser verification confirmed the stored calendar through host Vite
on frontend port 4000 and container backend port 9090. A temporary CSS change and
its restoration both appeared without browser navigation. The temporary source
was restored byte-for-byte. The first probe restored the file immediately after
the update and missed a second Windows filesystem event; spacing the two saves
by one second verified both updates without application changes. An emitted
launcher SIGINT terminated its real Vite child while backend/database remained
ready. Native console Ctrl+C delivery remains separate from this signal-handler
and process-cleanup evidence.

Switching back to container mode with both skip flags preserved the sample
calendar and its doors. Root PowerShell launch also passed from another working
directory and a copied source path containing spaces. Invalid mode returned exit
1; Node 20 failed before runtime commands with a targeted Node 24 remedy. A
read-only, offline Linux Node container ran the root Bash entry script from a
foreign directory and forwarded `--help` successfully. This does not establish
native Linux/macOS engine readiness or Docker host integration.

The final saved-source lint workflow passed. jscpd 5.4.1 used the unchanged shared
authored-code configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
The prior task baseline was archived before measuring unmodified `11eb478`.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Overall health | 52.5 | 53.8 | +1.3 |
| Duplication score | 93.9 | 94.3 | +0.4 |
| Complexity score | 67.1 | 65.9 | -1.2 |
| Complexity share | 31.0% | 32.5% | +1.5 pp |
| Dead-code score | 18.6 | 21.0 | +2.4 |
| Dead-code share | 23.5% | 21.3% | -2.2 pp |
| Dead-code coverage | 79.7% | 81.2% | +1.5 pp |
| Duplication percentage / lines / clones | 0.0% / 0 / 0 | 0.0% / 0 / 0 | unchanged |
| Maximum file complexity | 94 | 94 | 0 |
| Heuristic dead-code findings | 8 | 8 | 0 |
| Analyzed files / lines | 62 / 7130 | 68 / 7737 | +6 / +607 |

**Complexity regressed by 1.2 score points and 1.5 percentage points of share.**
The added mode selection, verification gates, runtime discovery and lifecycle
handling support the requested behavior. New failure/lifecycle scenarios also
increase test-file complexity; `run-local.test.mjs` is a reported hotspot at 76.
No scoring, suppression or exclusion changes were made. Proposed-snippet MCP
feedback found no clones; refresh preceded statistics. Dead-code coverage is
partial and findings remain heuristic, especially for script entry points and
`.mjs` imports; unchanged finding counts are not proof of absence of dead code.

Baseline source SHA-256:
`68841e99c06362a947039734a0a4720e5f2b143b0c74d1790f6cab221603ed3b`.
Final source SHA-256:
`d207d77acae2c0e30f12ddae1d23fdc79fbf50154174f875d54f88a3b3bd30aa`.
Full scope, identities, raw MCP/CLI results and limitations remain under ignored
`quality-reports/health/`; these saved-source measurements are advisory and do not
constitute staged hook receipts or PR merge evidence. Existing native platform
and Docker verification limitations remain in force.

## Frontend toolchain verification (2026-10-13)

The frontend task adds repository-local pnpm 12.11.2, frozen package installation,
dual-language contract/translation generation and frontend readiness checks.
Windows setup and doctor both passed with the explicitly selected Node 24.14.0
runtime, retaining system installations and selected Podman runtime settings.
Developer-tooling tests passed (57 passing, one existing skip). The extended
launcher started all three services, waited for API/frontend readiness, printed
both URLs and preserved calendars on repeated startup. Host `dotnet watch` and
Vite with PostgreSQL-only Compose passed browser verification. See
[frontend verification](../../src/frontend/verification.md) for complete evidence
and the inherited Docker/native-platform coverage limitations.

## Previous verification (2026-10-11)

Verification date: 2026-10-11.

## Reference Windows inventory

| Component | Actual process evidence |
| --- | --- |
| Git | `C:\Program Files\Git\cmd\git.exe`, 2.55.0.windows.5 |
| Node on PATH | `C:\Program Files\nodejs\node.exe`, 20.11.0; incompatible with required Node 24 |
| Python on PATH | Windows Store aliases fail to launch Python; no usable `py` launcher |
| Managed host Python | `.quality-cache/python/cpython-3.14-windows-x86_64-none/python.exe`, 3.14.8 |
| Repository venv | `.quality-cache/venv/Scripts/python.exe`, 3.14.8; pre-commit 4.6.2 |
| Hook | Default `.git/hooks/pre-commit`, embedding this clone's venv Python |
| Runtime | Podman 6.0.2; existing WSL machine; process override `podman` |
| Container | Linux engine reachable; current quality image available; read-only repository mount works |

The existing `node tools/quality/run.mjs test` passed with Podman. Container
dependencies include the content linters, diagram renderer and Chromium; they do
not need separate host installations. GitHub CLI is not a quality prerequisite.
The observed Node 20 can run the existing runner but does not satisfy the documented
host policy. Doctor fails accordingly, and setup preserves that installation.

## Verification record

| Verification | Result |
| --- | --- |
| Reference `run.mjs test` | Passed: focused checker regressions and applicable checks |
| Full quality workflow | Passed: MegaLinter and custom repository checks |
| Windows setup twice | Both passed with isolated Node 24.14.0 on the test process PATH; reused Python, pinned packages, hooks, Podman machine and dependency image |
| Persistent runtime in a subsequent process | Doctor passed with `QUALITY_CONTAINER_RUNTIME` removed, using the saved absolute Podman path |
| Foreign caller directory | PowerShell doctor passed when invoked by absolute path from the Windows temporary directory |
| Doctor preserves configuration | SHA256 of hook, local runtime settings and venv configuration identical before/after |
| Wrong host Node | Doctor and setup returned exit 1 with Node 20 and actionable remediation; installed Node unchanged |
| Windows focused regressions | 9 passed; Bash-specific bootstrap test skipped |
| Linux-container focused regressions | Requirement, adapter, failure, runtime, diagnosis and Bash bootstrap tests passed; PowerShell-specific bootstrap test skipped |
| Disposable-clone hook enforcement | All scenarios passed: quality-image lifecycle, main protection, valid/invalid commits, partial staging, receipts, line endings, links, shared configuration, detached full checks and unavailable runtime |
| Existing CI comment tests | 8 passed |

The isolated Node archive was downloaded from the official Node distribution and
checked against its published SHA256 manifest. It remains in ignored
`.quality-cache/node-verification`; it was not installed globally and does not
change the developer's persistent PATH. A ready isolated test process does not
attest to an IDE still using Node 20. Runtime persistence was verified separately
by removing the environment override in a later process.

The actual Linux container test includes missing-Node doctor bootstrap, invocation
from another directory and script paths containing spaces. It verifies Bash
behavior but does not exercise apt/Homebrew installation or a native Linux engine.
Simulated adapter tests do not establish fresh-machine onboarding.

## Deferred platform integration scenarios

On 2026-10-11 the owner accepted plan 00003 as implemented and explicitly deferred
the remaining platform integration tests because no test machines are available.
The results below remain unverified; implementation status does not mean they
passed.

The readability refactoring on 2026-10-11 was checked with the existing Windows
and Linux-container regression suites. Each passed nine applicable scenarios;
the other platform's bootstrap test was skipped. Setup and doctor retain the
same requirements and recovery behavior.

Fresh-machine missing-tool installation on Windows, macOS and Ubuntu/Debian,
real denied elevation and reboot recovery, macOS machine startup, native Linux
rootless configuration, existing Docker selection, and commits from a restarted
IDE require their respective environments. No macOS or full Linux onboarding
environment is available in this workspace. The reference Windows PATH still
requires developer selection of Node 24 before doctor can attest to that process.

The [temporary Linux/macOS installation follow-up rule](../../.agents/rules/architecture.md#temporary-linuxmacos-installation-follow-up)
requires investigating installation failures and correcting script or recovery
instruction defects when those platforms are first used. Add dated results here,
including operating system, relevant tool versions, failure details, fixes and
successful reruns. Record Linux and macOS independently. Once both platforms have
successful setup, repeat setup, doctor and quality/hook evidence, the temporary
rule can be removed while retaining this history.

See the [plan](../../.agents/plans/00003-developer-setup-doctor.md) for the original
verification scenarios and the owner-approved acceptance exception.

## jscpd onboarding extension (2026-10-11)

Plan 00004 adds lockfile-pinned jscpd 5.4.1 installation/reuse and readiness checks.
On Windows x64, installation, repeat installation and full developer doctor passed
with Node 24.14.0 selected in the process PATH. Doctor checked the native binary,
MCP initialization/schema/refresh, authored-source scope and CLI health reports.
Linux x64 musl container installation/reuse and analyzer readiness also passed;
this is not native Linux onboarding evidence. Shared Windows/Linux test suites
passed with the other platform's bootstrap test skipped as appropriate.

The owner explicitly deferred native macOS/Linux jscpd setup/doctor and client tests
on 2026-10-11. Follow the [code health platform rule](../../.agents/rules/development-quality.md#temporary-native-platform-follow-up)
and record actual installation failures, fixes and reruns in
[health verification](../quality/health-verification.md). Interactive Codex client
connection remains unverified; protocol tests use the repository's stdio client.

## Backend prerequisites and launcher (2026-10-11)

Plan 00005 adds exact .NET SDK 10.0.401 discovery/private installation, saved SDK
selection, contract dependencies and selected-runtime Compose-provider checks.
Actual Windows setup, repeat setup and doctor passed with Node 24.14.0, Podman
6.0.2, Docker Compose provider 5.5.1 and the repo-local SDK. Doctor also verified
offline CSharpier 1.3.0 and SQLFluff 4.3.0 execution in the quality image.

The launcher passed actual backend/database startup, readiness, repeat runs,
persistent data across stop/start, execution from another directory and a source
path with spaces, and nonzero failure on an occupied API port. Shared script tests
cover missing engine/provider, failed builds and readiness timeout separately from
runtime evidence. See [backend verification](../../src/backend/verification.md).
Docker execution was explicitly deferred by the owner; native macOS/Linux host
verification remains unavailable and existing follow-up rules remain in force.
