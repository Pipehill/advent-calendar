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
  after restarting PostgreSQL returned 503 instead of 200. The test now polls
  only transient 503 responses within a 30-second deadline before requiring 200;
  outage and liveness assertions remain strict. The full shared backend command
  passed locally with all 30 tests and publish after this correction, and full
  repository lint passed. See [PR #19 checks][pr19-checks] for the corrected
  commit's remote result.
- 14 development tooling checks passed; the native Bash bootstrap check was
  skipped on Windows. Launcher tests cover runtime override, stable absolute
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
- Development/launcher/snapshot tests passed (18 passed, one Windows-inapplicable
  Bash bootstrap skipped); quality health/report tests passed (20 passed).

## Advisory code health

jscpd 5.4.1 used the shared authored scope including C# and SQL. The original
pre-edit baseline was archived, then unmodified `main` at `f098d82` was measured
under the adopted SQL configuration for a like-for-like comparison. Configuration
SHA-256: `8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Generated code, dependencies and build/report/cache directories are excluded.

| Metric | Base | Final source | Change |
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

## Limitations and follow-up

- On 2026-10-11 the owner explicitly deferred actual Docker verification because
  Docker is absent. The Docker-compatible launcher/Compose path and CI workflow
  exist, but Docker execution must be confirmed on a Docker host.
- Native macOS/Linux host installation and launcher verification remain unavailable
  on this Windows workstation. Linux containers do not establish native host
  readiness. Existing development-tooling follow-up rules remain in force.
- The initial GitHub Actions backend run for PR #19 failed the health recovery
  assertion after 29 passing tests; its Code Quality workflow passed. Current
  Ubuntu/Docker evidence is available in [PR #19 checks][pr19-checks].
  Prior-release migration integrity checks await release tooling.
- Redocly recommended rules report four advisory warnings for the private
  license, localhost-only server and health endpoints without 4xx responses.
  No contract validation errors occur; these accurately describe the local API.

[pr19-checks]: https://github.com/Pipehill/advent-calendar/pull/19/checks
