# Backend verification

## 2026-10-25: Plan 00010 native build commands

Clean generation/build/test/publish and failure evidence are recorded in the
[tooling review](../../tools/development/tooling-review.md#verification-record).
Earlier entries below retain their original commands and dates.

## 2026-10-25: Remove local calendar seeding

Branch: `chore/remove-calendar-seeding`. Removed the startup seed, its settings,
and seed-only identifier/conflict options. Calendar creation remains an explicit
API operation. Published migrations, existing data and development volumes were
not changed. Browser smoke tests now create their own API fixtures.

- Backend contract validation, locked restore and Release build passed with zero
  build warnings/errors. All **144 backend tests** passed against isolated
  PostgreSQL 18.4 Testcontainers. Updated coverage verifies zero accounts,
  sessions, calendars and doors after startup/restart in Development and
  Production, and preserves API-created calendar content through restart.
- All **21 frontend unit tests**, the production Vite/Nitro build and TypeScript
  checking passed. All **8 browser smoke scenarios** passed against the built
  frontend and a separate disposable database. Before browser fixtures were
  created, direct SQL confirmed zero calendars, doors and accounts even with the
  obsolete `LocalSeed__Enabled=true` environment variable present.
- The initial browser run against Vite development mode passed the calendar
  scenarios but failed three locale-switch assertions. The same complete suite
  passed against the production server. No localization implementation changed.
  An earlier verification harness used a one-second HTTP timeout with localhost;
  explicit IPv4 and a three-second readiness timeout resolved that harness issue.
- Backend SDK formatting/analyzers, frontend Biome, CSharpier 1.3.0 on both API
  and test source, Markdown lint on changed documentation, JavaScript syntax and
  `git diff --check` passed. The four existing Redocly advisory warnings remain.
- Full quality verification is **unavailable**: `node tools/quality/run.mjs full`
  found no quality image, and `setup` failed because its pinned Alpine package
  `chromium=155.0.8059.39-r0` was unavailable; the repository offered
  `155.0.8059.84-r0` and reported an ICU package conflict. The quality Dockerfile
  was not changed. Direct CSharpier and Markdown checks reused the pinned build
  stage/base image; they do not establish a complete MegaLinter/custom-check run.
- Advisory jscpd 5.4.1 health **regressed from 64.7 to 64.6 (-0.1)**; complexity
  score fell from 72.5 to 72.4 and its measured share rose from 23.6% to 23.7%.
  Removing seed code changes the measured source mix, while browser fixtures now
  explicitly create test data. Duplication rose from 0.0893074612% to
  0.0898986597% because the measured source shrank from 12,317 to 12,236 lines
  (93 to 92 files); the same single 11-line clone remains. Maximum file
  complexity stays 94, with eight unchanged heuristic dead-code findings.
  Dead-code coverage is partial (52.9%); entry points can be misclassified and
  rounded scores are advisory. MCP snippet checking found no new exact clone,
  followed by a directory refresh before statistics. Source identities, shared
  configuration, schemas and detailed results are retained in ignored
  `quality-reports/health/`; this is working-tree evidence, not a hook receipt.

## 2026-10-18: Backend accounts and authentication

Branch: `feature/backend-user-management`, based on planning commit `12bb0dc`.
The owner authorized unattended implementation with assumptions/questions reported
at completion. The plan was not on synchronized `main`, so the implementation
uses `origin/plan/backend-user-management` without merging/publishing it. Maintained
frontend/BFF source and published migration 0001 are unchanged. Earlier implemented
plans are preserved as historical records.

- `node tools/backend/check.mjs check` passed contract validation, both generated
  languages, locked NuGet restore, Release build, **146 backend tests**, and publish.
  Build completed with zero warnings/errors. The four existing Redocly advisory
  warnings remain: private license URL, localhost server and health routes without
  4xx declarations. `node tools/backend/check.mjs lint` passed SDK formatting/analyzers.
- PostgreSQL 18.4 Testcontainers ran on Windows/Podman with the real embedded
  migrations. Coverage includes zero startup/Development seed accounts and restart,
  manual provisioning, direct API role/maintenance matrix, Norwegian normalization,
  duplicate/disabled reservations, scoped lists/resets, fixed responsibility and
  demotion dependencies, password policy/hash handling, actual CSRF/cookie exchange,
  persisted rolling failures/pause, resource limits, temporary-password deadlines,
  restricted sessions, five-minute session-bound verification, 30-day/eight-hour
  expiry, logout/replay, revocation and production transport/key validation.
- Deterministic barriers pause real verification before reset, own-password change,
  promotion or disable. Stale results cannot create sessions; older hash upgrades
  cannot restore reset passwords; concurrent own-password changes have one winner.
  Another barrier verifies actor revocation during an in-flight target reset.
  Concurrent duplicate creation and child-creation/demotion preserve identity and
  responsibility. Shared output caching, unavailable validity storage and unexpected
  provider errors retain authorization/cache protection. No-store assertions cover
  successful, validation, anonymous, forbidden, throttled, unavailable and unexpected
  error responses, including cookie/token issuance.
- `node tools/frontend/check.mjs check` passed **21 tests**, TypeScript checking,
  production Vite/Nitro build and Biome. `CalendarClient.get/create` remain compatible.
  An initial sandbox-limited Nitro build failed reading a Windows parent path;
  rerunning with the required local read access passed. Existing React Query
  bundler `use client` notices remain. This is contract compatibility evidence,
  not frontend/BFF authentication or browser CSRF coverage.
- NuGet direct/transitive vulnerability audit found no vulnerable packages across
  all four backend projects. Geralt 4.4.0 and libsodium 1.0.22 are lockfile-pinned;
  [provider API](https://www.geralt.xyz/password-hashing) and
  [package metadata](https://www.nuget.org/packages/Geralt/4.4.0) were checked.
- The offline tool was exercised in real Windows and Linux terminals using randomly
  generated disposable values. Input was not echoed. An underlength superadmin
  password was rejected with exit 1; invalid role and redirected input were rejected.
  Valid output was shared-format verifiable PHC data. Observed 64 MiB/three-pass
  calibration was approximately **204 ms on Windows and 62 ms on Linux**. Tests also
  cover supported older costs, malformed/cost-bounded hashes and preservation of
  higher memory during mixed-cost upgrades. No reduced production hashing policy.
- The actual final multistage backend Dockerfile built and published on Linux.
  A separate nonroot runtime container with a disposable PostgreSQL database
  started with zero accounts. Intentional manual SQL provisioning then enabled
  login (200), account creation (201), scoped listing (200) and no-store responses.
  Replacing the API container while preserving only its key volume/database
  retained a valid authentication cookie (200), verifying durable keys and sessions.
  Existing development application/database containers and data were untouched.
- Test containers, the dedicated test network/key volume and **27** verified newly
  created build/test images were removed. Existing application images, pinned
  tool/base images, unrelated external build state and database volumes were
  preserved. Test-generated operator credential/cookie files were deleted.

### Advisory quality comparison

Final saved-source checks use jscpd 5.4.1 and unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
The baseline was archived before replacement; final MCP refresh/statistics and
clone inspection are saved with the comparison under ignored `quality-reports/health`.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Overall health | 56.4 | 64.7 | +8.3 |
| Complexity score / share | 66.4 / 31.7% | 72.5 / 23.6% | +6.1 / -8.1 pp |
| Raw duplication | 0% | 0.21928% | +0.21928 pp (regression) |
| Clones / duplicated lines | 0 / 0 | 3 / 27 | +3 / +27 (regression) |
| Maximum file complexity | 94 | 94 | unchanged |
| Heuristic dead-code findings | 8 | 8 | unchanged |
| Dead-code analysis coverage | 81.6% | 52.6% | -29 pp |
| Analyzed files / lines | 71 / 7,934 | 93 / 12,313 | +22 / +4,379 |

The duplication increase is retained visibly: one 11-line import/header block and
two short test preparation/assertion blocks (10 and six lines) keep distinct API
scenarios readable. No production credential/session logic was duplicated for
these findings; no exclusions or scoring thresholds were altered. Overall score
improvement is advisory and partly reflects more source outside supported dead-code
analysis. C#/SQL dead-code coverage is unavailable, not clean. Existing heuristic
script-entry-point findings are unchanged; complexity hotspots remain existing
developer/quality tooling. This is working-tree evidence, not a staged receipt or
PR candidate-merge comparison.

Scope includes authored code/tests matching the existing shared language patterns,
excluding dependencies, generated code, build output and reports. The exact source
manifest, formats, clone locations and unsupported dimensions remain in the raw
reports. Source hashes: before
`8e5c97b2cd169ab6bcc707d14651a10c32aa640b928516224f37b31e422cb60f`, after
`4736b6a686c0b12dd54f73001c659ddcd6a76a2eadeb8a3c83bb5adcd47c9be8`.

### PR #25 duplication review

The PR report at head `263de962fd6bb083dbfd4acfbf1f63b6f0bc4ac5`, targeting
`2a729c577e458bb6015b72aadd0f91181b74d0b2`, correctly reports three clones and
27 duplicated lines versus zero on the target. A fresh saved-source baseline
reproduced all three locations with the same jscpd version, configuration and
authored-code scope above. These are test-code findings; the 11-line shared
import/namespace/class header is incidental boilerplate.

`AuthTestContext.CountSessionsAsync` now shares the persisted-session count across
four assertions. `CreateAuthenticatedClientAsync` shares independent authenticated
client setup across the session-isolation and concurrent-creation scenarios,
disposing the client if login fails. Assertions, independent cookie containers
and Given/When/Then phases remain in the individual tests.

The final saved-source comparison reduces duplication from **3 clones / 27 lines /
0.219280% to 1 clone / 11 lines / 0.089307%**: two fewer clones, 16 fewer duplicated
lines (59.3%) and -0.129973 percentage points. The remaining header clone is retained;
no exclusions, scoring changes or import rearrangements were used. Compared with
the PR target, the remaining regression is +1 clone / +11 lines / +0.089307 pp.

Overall health remains 64.7, maximum file complexity remains 94 and heuristic
dead-code findings remain eight. Dead-code coverage changes from 52.6% to 52.5%;
unsupported C#/SQL analysis remains a limitation. Scope remains 93 measured files,
with 12,313 to 12,317 measured lines. Source hashes are
`4736b6a686c0b12dd54f73001c659ddcd6a76a2eadeb8a3c83bb5adcd47c9be8` before and
`21d7a5f64eb64e7bc40a4c45cded3e28dd138a303914ae9bd697daf12a4618e3` after.
Raw MCP schema, file-clone inspection, proposed-snippet feedback, refreshed
statistics and comparisons are retained in ignored `quality-reports/`. These are
local saved-source measurements; the published PR still describes its committed head.

### Boundaries and assumptions for owner review

The implementation base is the planning branch because plan 00008 is absent from
`main`. Other implementation selections are documented in
[backend authentication](authentication.md): Argon2id provider/costs, pinned local
weak-password source, advisory-locked security transactions and per-instance
resource budgets. These are technical assumptions within the approved unattended
implementation, not new product requirements. No user answer is required to review
or run the implemented backend increment.

No account seeding or real-account provisioning was performed. No commit, push,
PR, merge or deployment is included. Calendar authorization/recipient assignment,
frontend/BFF security and browser cache/CSRF integration, production hosting/key
delivery/rotation/TLS proxy decisions and plan 00009 remain the agreed production
gates. Native macOS/Linux host workflows and Docker execution retain earlier owner
deferrals; the Linux container verification above does not claim those platforms.

## Calendar API implementation history

Implementation date: 2026-10-11. Branch: `feature/calendar-api`, based on `f098d82`.

## Automated evidence

- .NET SDK 10.0.401, runtime 10.0.12, NSwag 14.7.1 and Redocly 2.62.1 were
  verified against upstream release/package metadata. Locked NuGet restore,
  contract validation, System.Text.Json generation, build and publish passed.
- 30 xUnit checks passed against isolated PostgreSQL 18.4 Testcontainers on
  Windows with Podman 6.0.2 and the real embedded application migration.
  Coverage includes POST/GET binding and persisted contents, UUID v4, identical
  UTC timestamps, whitespace and Unicode boundaries in API/database, missing/null
  input, ProblemDetails, database constraints and atomic rollback, controlled
  TimeProvider, seed conditions/restart, migration journal/transaction rollback,
  startup connection exhaustion and actual migration failure, concurrent trace
  isolation, and database outage health/recovery. NuGet's direct/transitive
  vulnerability audit reported no vulnerable dependencies in either project.
- PR #19's first Ubuntu/Docker CI run passed validation, generation and build,
  but failed the health recovery test: the first readiness request immediately
  after restarting PostgreSQL returned 503 instead of 200. Retrying for 30 seconds
  still failed on Ubuntu/Docker. The outage scenario now suspends and resumes the
  existing PostgreSQL container, retaining its published endpoint throughout the
  lifecycle, and probes real readiness recovery within a bounded deadline.
  Liveness and outage assertions remain strict. After this correction and splitting
  combined scenarios into Given/When/Then tests with readable xUnit display names,
  the full shared backend command passed locally with all 42 tests and publish;
  SDK formatting/analyzers also passed. Commit `2690421` passed both GitHub
  workflows: Ubuntu/Docker validation, generation, build, all 42 tests, publish,
  SDK lint and launcher tests; Code Quality also passed. See
  [PR #19 checks][pr19-checks] for subsequent commits' remote results.
- All backend tests have sentence-style xUnit `DisplayName` values and explicit
  Given/When/Then phases. Node test names and custom checker/hook scenario output
  use the same format, required by the shared development quality rule.
- The five Node suites contain 125 cases: 124 passed with Node 24.14.0 and the
  native Bash bootstrap case was skipped on Windows. Launcher tests cover runtime
  override, stable absolute
  Compose paths containing spaces, invalid port/timeout, unavailable engine,
  failed builds, readiness retry and timeout. Simulated cases are separate from
  actual runtime evidence.

## Runtime and quality evidence

- Actual Windows Podman 6.0.2 with Docker Compose provider 5.5.1 built the
  backend from clean container inputs, including contract validation and generation,
  and started both services. Readiness completed at `http://localhost:8080`.
- Host API execution against the PostgreSQL-only stack passed the four manual
  `.http` scenarios (201, 200, 400, 404) and both health endpoints. The created
  calendar remained unchanged after returning to container execution, repeat
  launches, stopping/starting the stack, and moving source under `src/`.
- The seed remained a single calendar; repeat execution kept one database and
  one backend container. The launcher succeeded from another working directory
  and an actual source path containing spaces. An occupied localhost API port
  exited 1 after readiness timeout and printed service diagnostics; normal
  configuration was restored successfully afterward.
- A clean source copy without generated output/build artifacts passed host
  validation, generation, locked restore, build, integration tests and publish.
  After the structure change, `src/backend` and sibling `src/contract` passed
  the same shared backend command with all 30 tests and a clean container build.
- Setup, repeat setup and final doctor passed with the repo-local pinned SDK,
  saved runtime and Compose provider. CSharpier and SQLFluff rejected invalid
  disposable fixtures and accepted their corrections. Full MegaLinter and
  repository checks passed without editing source; SDK lint also passed.
- The expanded development/launcher/snapshot and quality health/report tests
  preserve the earlier checks while separating unrelated outcomes. Eight custom
  Linux checker regression groups passed, including invalid/corrected C# and SQL.
- All 11 disposable-clone hook integration scenarios passed on Windows, covering
  branch protection, partial staging, preserved edits, stale receipts, checker
  failures/corrections, incoming links, expanded configuration scope, detached
  checks and missing runtime diagnostics. Image cleanup was verified separately
  from concurrent quality runs, which correctly keep images still in use.

## Advisory code health

jscpd 5.4.1 used the shared authored scope including C# and SQL. The original
pre-edit baseline was archived, then unmodified `main` at `f098d82` was measured
under the adopted SQL configuration for a like-for-like comparison. Configuration
SHA-256: `8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Generated code, dependencies and build/report/cache directories are excluded.

| Metric | Base | Initial implementation | Change |
| --- | --- | --- | --- |
| Overall health | 48.3 | 54.0 | +5.7 |
| Duplication score | 90.4 | 92.1 | +1.7 |
| Complexity score | 65.4 | 70.1 | +4.7 |
| Complexity share | 36.0% | 27.6% | -8.4 pp |
| Dead-code score | 18.3 | 19.0 | +0.7 |
| Dead-code share | 27.1% | 25.9% | -1.2 pp |
| Dead-code coverage | 96.0% | 76.1% | -19.9 pp |
| Duplicated lines / clones | 0 / 0 | 0 / 0 | 0 / 0 |
| Duplication percentage | 0.0% | 0.0% | 0.0 pp |
| Maximum file complexity | 77 | 77 | 0 |
| Heuristic dead-code findings | 5 | 5 | 0 |
| Analyzed files / lines | 24 / 3630 | 43 / 4954 | +19 / +1324 |

**Dead-code analysis coverage decreased by 19.9 percentage points.** Supported
dimensions do not cover all new C#/SQL behavior; unavailable dimensions are not
evidence of cleanliness. The same five existing tooling entry-point/import
findings remain heuristic false positives, with verified callers documented in
the earlier quality review. Added tooling has real orchestration complexity;
the improved whole-codebase score does not establish that every file improved.
MCP schemas, snippet feedback, refresh and statistics were inspected; generated
output was corrected to the lowercase excluded path before final measurement.
Detailed identities/raw findings remain in ignored `quality-reports/health/`.
These saved-source reports are advisory, not staged hook receipts or PR evidence.

### Given/When/Then follow-up

**Overall health declined from 54.0 to 52.2 (-1.8)** against the preserved
pre-readability baseline. Complexity score declined from 70.1 to 64.0 (-6.1),
complexity share rose from 27.5% to 35.8% (+8.3 pp), and maximum file complexity
rose from 77 to 94. Dead-code score declined from 19.0 to 18.6 (-0.4), while its
share decreased from 25.9% to 24.7% (-1.2 pp) and coverage rose from 75.9% to
76.0% (+0.1 pp). Duplication score rose from 92.1 to 93.2 (+1.1); duplicated
lines/clones/percentage remained 0/0/0.0%. Analyzed scope remained 43 files,
with 4966 to 6073 lines (+1107); the same five heuristic findings remain.

The extra lines and branches come from explicit input cases, separate behaviors,
and named lifecycle phases in the test suites. The largest hotspots are
`environment.test.mjs` (94) and `health.test.mjs` (82): these file-level totals
combine many individual scenarios. This is a readability and coverage tradeoff;
no exclusions, analyzer suppressions or scoring changes were introduced.
The tool version, authored scope and configuration hash above are unchanged.
Baseline source SHA-256 is
`ebea24f5b095671474972a41b6a80dd918b7998f1426945e0751ec591b4898fb`;
final authored-source SHA-256 is
`da54ccf561f4ff9afaf602bab3e4f650c96c03d11eac9a73dd1947ad32c9cc3d`.
Saved-source measurements and PR merge identities are retained in
`quality-reports/health/`. Tests exercise real MCP refresh/statistics and clone
locations; unsupported analysis dimensions remain unavailable.

## Limitations and follow-up

- Ubuntu/Docker backend execution is confirmed by GitHub Actions. Native local
  Docker launcher verification remains deferred because Docker is absent on this
  workstation; Windows Podman launch and persistence were verified above.
- Native macOS/Linux host installation and launcher verification remain unavailable
  on this Windows workstation. Linux containers do not establish native host
  readiness. Existing development-tooling follow-up rules remain in force.
- Prior-release migration integrity checks await release tooling.
- Redocly recommended rules report four advisory warnings for the private
  license, localhost-only server and health endpoints without 4xx responses.
  No contract validation errors occur; these accurately describe the local API.

[pr19-checks]: https://github.com/Pipehill/advent-calendar/pull/19/checks
