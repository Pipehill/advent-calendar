# Backend verification

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
