# 00010: Simplify developer tooling

Status: Not implemented

Last updated: 2026-10-25

Implementation type: chore

## Goal and confirmed decisions

Reduce the maintenance needed for agents to build, verify and diagnose the project
autonomously. The owner's main manual workflow is easy local startup through the
existing root launchers. Prefer native commands and maintained libraries when they
remove project-owned responsibilities; a modest health-score decline is acceptable
for demonstrably smaller, easier tooling.

On 2026-10-25 the owner authorized implementation on the existing
`plan/simplify-developer-tooling` branch with its pending plan/index/TODO edits.
The owner subsequently requested documentation cleanup and separate application
and tooling health measurements while retaining the whole-repository reference.

## Requirements

- Preserve Windows, Ubuntu/Debian and macOS setup/doctor behavior, private SDK/pnpm
  selection, explicit overrides, existing installations and runtime/data preservation.
- Preserve local dev/container modes, launch/skip options, readiness, port errors,
  tests-before-start, Ctrl+C behavior and isolated Testcontainers databases.
- Use native dotnet/MSBuild for locked restore, validation, generation, compilation,
  analyzers, tests and publishing without requiring a compiled/running API.
  Preserve frontend unit tests, explicit TypeScript checking, SSR and packaging.
- Preserve Docker/Podman, pinned offline checks, read-only inputs, writable reports,
  credential isolation, staged/full distinction, partial staging, incoming links,
  configuration expansion and verified hook/PR evidence.
- Reduce responsibilities and duplicated instructions. Keep the current command
  with its owning documentation; keep raw verification output in ignored reports.
  Do not translate scripts, compress code or add a task framework to lower counts.
- Evaluate larger replacements with executable compatibility checks, authored-code
  savings and dependency/installation cost before choosing them.
- Report application (`src/`), tooling (other authored source) and whole-repository
  health independently under identical analyzer settings. Preserve the original
  whole-repository baseline, disclose unsupported dimensions and reject mismatched
  scope/identity. Keep lint and hook evidence independent of advisory scores.
- Preserve implemented plans as historical records. Existing native-platform
  follow-ups and inherited browser failures remain explicit.

## Outstanding questions

None. Technical alternatives require compatibility evidence rather than additional
owner choices. Any proposed functionality reduction requires a separate decision.

## Work and acceptance

- [x] Preserve the baseline; inventory tooling, callers and behavior before edits.
- [x] Replace task dispatchers with native dotnet/MSBuild and frontend package scripts;
  retain argument-only selectors for private executables.
- [x] Make the direct offline quality-container invocation visible; preserve image,
  snapshot, failure-report and receipt behavior.
- [x] Verify clean generation, invalid/stale-input failures, native builds, frontend
  checks, setup/doctor, available startup modes and disposable-clone hooks.
- [x] Consolidate documentation and agent workflow navigation without duplicating
  setup, command ownership, rules or verification evidence.
- [x] Re-evaluate larger responsibility replacements with actual prototypes,
  including MCP transport and snapshot operations.
- [x] Add separate health scopes and reports locally and in CI; retain a comparable
  whole-repository reference and test scope isolation/stale evidence.
- [x] Run final saved-source lint, relevant tests and unchanged-setting comparisons;
  record net code/configuration/documentation cost in the concise review.
- [ ] Close the outstanding Vite/browser and unavailable-platform verification.

## Evidence

The [tooling review](../../tools/development/tooling-review.md) owns disposition,
tradeoffs and current verification results. Operational commands belong in
[developer setup](../../tools/development/README.md),
[code quality](../../docs/code-quality.md) and
[advisory health](../../tools/quality/health.md).

The initial inventory was 36 tool `.mjs` files / 5,671 physical lines
(3,426 non-test and 2,245 test). The original jscpd 5.4.1 baseline identifies
`2c2a5221c27eb31d7b97f042374c25a6db76c173`; it remains in
`quality-reports/health/baseline/`. The prior task baseline was archived separately.

Verification includes clean-checkout builds and changed/invalid spec/settings,
missing consumers/tools, frozen frontend installation, TypeScript/Nitro packaging,
invalid/corrected linter fixtures, index/source preservation, hook receipts,
stale/missing CI evidence and actual Windows/Podman startup. Docker and native
macOS/Linux evidence remain unavailable. Production browser smoke passed all eight
cases; Vite reproduced three language-switch failures on the original commit.
The [existing stabilization TODO](TODO.md) remains open.
