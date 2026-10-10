# 00003: Developer setup and doctor scripts

Status: Not implemented

Last updated: 2026-10-11

Implementation type: qa

## Overview

Provide setup and doctor scripts that help developers prepare and diagnose their
local environment on Windows, macOS, and Linux. Use the owner's working Windows
environment as the reference for the existing quality workflow, while respecting
platform differences. Setup installs missing system tools through the platform's
package manager and prepares the repository. Doctor explains whether the local
environment is ready and how to resolve failures.

Initially cover the tooling already used by this repository. Extend both scripts
whenever a newly adopted technology requires local installation. This task creates
developer tooling; it does not create the planned application.

## Requirements

1. Provide documented setup and doctor entry points for Windows, macOS, and Linux.
   Use PowerShell on Windows, Bash on Linux/macOS, and shared Node.js logic.
   Bootstrap must work when Node is missing.
2. Automate installation of missing system tools using the platform package
   manager. Support Ubuntu/Debian with apt for Linux installation in this version;
   other distributions receive diagnostics and manual installation guidance.
3. Cover Git, host Node and Python, the repository-local Python environment and
   pinned pre-commit dependencies, hook installation, a Linux container runtime,
   and the quality dependency image. Apply the repository's documented version
   policy and existing pins rather than copying incidental executable versions
   from the reference machine.
4. Reuse a configured Docker or Podman runtime. Prefer Podman for new installations
   and honor an explicit `QUALITY_CONTAINER_RUNTIME` selection. Check runtime
   connectivity and Linux container execution, not just executable presence.
5. Make repeated setup runs safe and useful: reuse compatible installations,
   environments, hooks, and images, and report remaining prerequisites or failures.
   Preserve existing developer files, unrelated installations, containers, and data.
6. Doctor must diagnose without installing or repairing the environment. Report
   detected executable paths and versions, expected requirements, readiness, and
   actionable platform-specific remedies. Return a failing exit code when a
   required prerequisite is missing or unusable.
7. Make the selected runtime and executable paths usable by subsequent terminal
   and IDE commits. Setup success must not depend on environment variables that
   exist only inside the setup process. Diagnose PATH and restart requirements.
8. Keep the existing quality commands and pre-commit enforcement functional on
   all supported platforms. Correct Windows-specific path defaults where needed.
9. Defer pnpm, .NET, Compose, application dependencies, and database preparation
   until their inputs and local workflows are introduced. Add them to setup and
   doctor in the same change that adopts the technology.
10. Document onboarding, doctor output, rerunning setup, supported platforms,
    privilege/restart requirements, and manual recovery. Record the obligation to
    maintain both scripts in the implementation rules as well as developer docs.
11. Verify bootstrap, setup repeatability, diagnostics, and actual quality workflow
    readiness across the supported operating systems. Record unverified platform
    scenarios explicitly instead of claiming support from mocked tests alone.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed decisions and current baseline

- Planning uses `plan/developer-setup-doctor` and `[PLAN]:` for a separately
  requested planning PR. Implementation uses `qa/...` and `[QA]:`, registered in
  the [naming rules](../rules/pull-requests.md).
- Automatic system-tool installation is in scope. Initial Linux installation
  covers Ubuntu/Debian with apt. Other distributions receive manual guidance.
- PowerShell and Bash entry points perform the bootstrap needed before shared
  Node logic can run. Keep these entry points small and share subsequent checks,
  requirement definitions, diagnostics, and setup orchestration.
- Podman is the default for a new installation; an existing configured Docker or
  Podman environment is retained. Runtime overrides remain supported.
- The current prerequisites and pins are owned by
  [code quality](../../docs/code-quality.md),
  [architecture rules](../rules/architecture.md), and existing quality configuration.
  The documented host baseline is Node.js 24 LTS and Python 3.14. Reconcile the
  actually invoked executables with that baseline during implementation.
- `tools/quality/run.mjs setup` already prepares the pinned dependency image.
  Reuse it rather than adding a second image build or dependency lifecycle.
- The host Python environment is `.quality-cache/venv`, populated from
  `tools/quality/pre-commit-requirements.txt`. Windows uses `Scripts`; Linux and
  macOS use `bin`. `tools/quality/verify.mjs` currently defaults to the Windows
  pre-commit path and supports a `QUALITY_PRE_COMMIT` override.
- The working Windows workflow uses Podman, installed pre-commit hooks, and local
  QA receipts. Earlier execution in this session showed that runtime selection
  and PATH can differ between processes. Diagnose the environment actually used
  by the script and hook, including Windows Python launcher/alias behavior.

### Work steps

- [ ] Inventory the reference Windows environment and existing requirements.
  Record resolved paths, versions, runtime selection, hook configuration, and a
  successful quality invocation. Distinguish host dependencies from tools already
  supplied by the container. GitHub CLI is not a required quality prerequisite.
- [ ] Add `tools/development/setup.ps1`, `setup.sh`, `doctor.ps1`, and `doctor.sh`,
  with shared Node modules in the same directory. Use script-relative repository
  paths and argument arrays so paths with spaces work independently of the caller's
  directory. Doctor bootstrap must report missing Node without installing it.
- [ ] Add platform installation adapters for Windows, macOS, and Ubuntu/Debian.
  Validate package identifiers, supported versions, installation methods, and
  executable discovery against upstream documentation during implementation.
  Detect a missing package manager and explain how to install it. Make required
  elevation, virtualization prerequisites, shell refresh, or reboot steps visible;
  do not report the environment ready before those steps have completed.
- [ ] Implement shared requirement checks and diagnoses. Keep one definition for
  each prerequisite used by both setup and doctor; reference existing pinned files
  instead of duplicating dependency lists. Report incompatible installed tools
  with remediation rather than silently replacing unrelated installations.
- [ ] Implement setup orchestration: install missing prerequisites, resolve and
  prepare the selected runtime, create or reuse the local Python environment,
  install pinned hook dependencies, prepare the quality image through the existing
  command, and install hooks. Finish by running the readiness checks used by doctor.
  Propagate failures and allow rerunning after a partially completed installation.
- [ ] Handle runtime readiness on each platform. Podman requires a Linux machine
  on Windows/macOS; Linux can use its native engine. Reuse existing machines and
  connections. Validate access to the repository mount and Linux container execution.
  Do not reset an existing machine to repair a failed check.
- [ ] Integrate persistent repository-local runtime selection with the quality
  runner and verification command as needed. Explicit environment overrides take
  precedence. Keep machine-specific paths/settings ignored by Git and account for
  disposable clones and CI, which must not depend on a developer's local settings.
- [ ] Update Windows-specific pre-commit discovery in `tools/quality/verify.mjs`
  and any other affected tooling. Preserve staged snapshots, check-only behavior,
  hook enforcement, local QA receipt semantics, and the existing CI runtime path.
- [ ] Update `README.md`, `docs/code-quality.md`, and `tools/quality/README.md`
  with onboarding commands and links to detailed setup/doctor documentation.
  Add a developer-tooling README if needed. Add the maintenance rule to
  `.agents/rules/architecture.md`: adopting or changing a local prerequisite must
  update setup, doctor, documentation, and relevant verification in the same change.
  Keep agent-specific instructions under `.agents`.
- [ ] Complete platform verification and record results before marking this plan
  implemented. Keep the plan index and status consistent with actual evidence.

### Installation references

Use [WinGet installation documentation][winget] for Windows and
[Homebrew installation documentation][homebrew] when evaluating macOS packages.
Verify the Podman installation route against its [official installation guidance][podman]:
the upstream guidance cautions about Homebrew-managed Podman installations.
Account for [Podman machine requirements][podman-machine] on Windows and macOS.
Select and verify package identifiers and platform version baselines during
implementation; this plan does not freeze unverified package-manager commands.

## Verification

- On Windows, macOS, and Ubuntu/Debian, verify a fresh clone with missing tools:
  bootstrap works without Node, missing tools are installed, and doctor reports
  readiness after repository preparation. Verify unsupported Linux distributions
  receive manual guidance rather than an attempted apt installation.
- On the reference Windows environment and prepared Linux/macOS environments,
  run setup twice. Confirm existing valid installations, runtime configuration,
  and project data are preserved and the second run succeeds.
- Exercise missing executables, wrong versions, PATH aliases, stopped/unreachable
  runtime, missing or stale image, missing Python environment, missing hooks,
  installation failure, denied elevation, and pending restart. Check remedies,
  failing exit codes, and successful recovery after rerunning setup.
- Confirm doctor leaves environment, hooks, packages, images, and tracked files
  unchanged. Verify paths with spaces and invocation from another directory.
- Test both Podman and existing Docker selection, explicit runtime overrides,
  and commits from a fresh terminal or IDE after setup. Demonstrate that runtime
  selection survives beyond the bootstrap process.
- Run existing quality checks and relevant disposable-clone hook verification.
  Confirm a valid task-branch commit passes, an invalid staged change fails,
  and main-branch protection remains active. Verify Linux/macOS executable paths
  without requiring a Windows-only `QUALITY_PRE_COMMIT` workaround.
- Use focused automated tests for requirement evaluation, adapter failures,
  runtime selection, and bootstrap behavior. Record actual platform integration
  evidence separately. Run the repository's required quality checks for the changes.
- Review the maintenance rule and developer docs together: a future local
  prerequisite change must identify updates to both setup and doctor and their
  verification. Confirm deferred application tools are not installed prematurely.

[winget]: https://learn.microsoft.com/en-us/windows/package-manager/winget/install
[homebrew]: https://docs.brew.sh/Installation
[podman]: https://podman.io/docs/installation
[podman-machine]: https://docs.podman.io/en/latest/markdown/podman-machine.1.html
