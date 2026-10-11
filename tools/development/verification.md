# Developer tooling verification

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
