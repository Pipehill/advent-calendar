# 00005: Create and retrieve calendars through the backend API

Status: Implemented (2026-10-11)

Last updated: 2026-10-11

Implementation type: feature

## Overview

Implement the first backend feature: create a calendar from a title and retrieve
the persisted calendar. Establish the backend controller, service, and repository
layers, using the previously agreed API-contract and PostgreSQL stack. Provide
one locally seeded calendar and a simple script for starting the local backend
and database together in Docker or Podman.

This task includes backend infrastructure required to run and verify these two
operations. Frontend, BFF, user accounts, administrators, ownership, membership,
authentication, door opening schedules, and calendar editing are outside scope.

## Requirements

1. Expose `POST /calendars` accepting only `{ "title": "..." }` as application
   input. Return `201 Created` with the complete calendar and a `Location` header
   pointing to `GET /calendars/{id}`. GET returns the complete calendar with
   `200 OK`, `404 Not Found` for an unknown UUID, and `400 Bad Request` for a
   malformed UUID.
2. A calendar contains a UUID v4 identifier, a required title of 1-100 characters,
   exactly 24 doors numbered 1 through 24, a creation timestamp, and a last-modified
   timestamp. Trim surrounding title whitespace before validation and storage;
   reject missing, null, empty, whitespace-only, and over-limit titles with
   `400 Bad Request`. Spaces and punctuation count toward the limit after trimming.
   Count Unicode code points: each precomposed Norwegian letter and simple emoji
   counts as one; combining marks and components of compound emoji count separately.
   Apply the same counting rule in the API and PostgreSQL.
   Each door has non-null text describing its contents, initially an empty string.
3. The service initializes all calendar values other than the submitted title,
   including the UUID v4, doors, and identical UTC creation/last-modified timestamps.
   Calendar creation requires no user, administrator, owner, or calendar membership.
4. Keep three distinct backend layers: a handwritten implementation of the
   generated controller contract, a service layer, and a repository layer.
   Controllers handle HTTP concerns; services handle initialization and business
   rules; repositories handle persistence. Use one backend application project with
   separate controller/service/repository folders and service/repository interfaces.
5. Store calendars and their doors in separate PostgreSQL tables through Npgsql,
   Dapper, and parameterized SQL. Persist a calendar and its 24 doors atomically.
   Retrieval must return persisted data rather than reconstructing defaults.
6. Author the backend contract in OpenAPI 3.0.x. Generate C# DTOs and abstract
   controller contracts with pinned NSwag settings for System.Text.Json. Keep
   generated files untracked and regenerate before compilation.
7. Use the repository's UUID, camelCase JSON, UTC date-time, validation, and
   ProblemDetails conventions. Define applicable request and error constraints
   in the authored contract and enforce them in the running API.
8. Package schema changes as numbered embedded DbUp SQL migrations. Apply them
   at backend startup, with bounded database connection retries and a transaction
   per script, before accepting requests. Startup failure must exit nonzero.
9. Seed one calendar for local development only, after migrations, when both the
   environment is `Development` and an explicit local seed setting is enabled.
   Seeding is idempotent: restart must not duplicate the sample or overwrite its
   existing content. Nonlocal configurations must not enable this combination.
10. Supply a runnable backend and local PostgreSQL workflow, configuration,
    build/generation commands, and documentation for manual POST and GET testing.
    Keep the development database persistent and integration-test databases isolated.
11. Verify API behavior and persistence using xUnit and PostgreSQL Testcontainers
    with the actual application migrations. Share backend validation, generation,
    build, and test commands between local execution and GitHub Actions.
12. Extend existing setup/doctor and local/CI quality coverage for backend tools,
    C#, and SQL as they are introduced, following the shared maintenance rules.
13. Include a backend `.http` file with runnable examples for creation, retrieval,
    invalid title, and unknown calendar ID, using configurable local URL/ID values.
14. Inject .NET `TimeProvider` into the service for UTC timestamp initialization.
    Tests must be able to control time without relying on the real clock or sleeps.
15. Expose `GET /health/live` for process liveness and `GET /health/ready` for
    completed migrations and current database availability. Healthy checks return
    `200`; failed readiness returns `503`. Do not signal readiness before successful
    migrations. A running process remains live during a database outage.
16. Establish a local application launcher under `tools/development/`, with
    PowerShell and Bash entry points following the existing tooling pattern.
    After developer setup, one command must build and start backend and PostgreSQL
    containers using the selected Docker or Podman runtime, enable local seeding,
    wait for readiness within a bounded timeout, and print the reachable localhost
    API URL. Repeat execution must preserve database data and avoid duplicate
    application instances. Keep the initial launcher focused on these two services
    and structured so later tasks can extend it to the rest of the application.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed decisions and repository context

- Implementation starts from synchronized `main` at `f098d82` on
  `feature/calendar-api`. On 2026-10-11 the owner explicitly deferred actual
  Docker runtime verification because Docker is not installed; complete and
  record Podman/Compose verification now. Docker execution remains a follow-up
  in [backend verification](../../src/backend/verification.md).
- On 2026-10-11 the owner required all application source under root `src/`:
  backend in `src/backend`, future frontend in `src/frontend`, and authored
  contracts in the sibling `src/contract` directory. Tooling remains under `tools`.
- Service timestamps are normalized once to PostgreSQL microsecond precision;
  this prevents POST/GET differences caused by .NET's finer clock resolution.
  NUL titles are rejected because PostgreSQL text cannot store NUL.

- Planning starts from synchronized `main` at `9a04693` on
  `plan/calendar-api`. The next implementation uses work type `feature`.
- On 2026-10-11 the owner confirmed all three clarification proposals: the
  POST/GET routes and responses, title trimming/validation and empty door text,
  and the single-project organization, two-table persistence, service-generated
  UUID v4/equal UTC timestamps, and idempotent locally enabled seeding.
- On 2026-10-11 the owner added `.http` examples, an injected `TimeProvider`,
  concrete liveness/readiness endpoints, and Unicode boundary verification.
  The owner selected Unicode code point counting for the 1-100 title limit.
- On 2026-10-11 the owner required the first version of a local application
  startup script. It starts backend and PostgreSQL in Docker or Podman and makes
  the API reachable from the host. Reuse the existing development tooling pattern
  and selected runtime. This task establishes the script for later extension;
  external API-client usage does not need additional instructions in this plan.
- No application backend, authored OpenAPI contract, .NET solution, SQL
  migrations, application Dockerfiles, or Compose configuration currently exist.
  Existing setup and quality tooling must be extended rather than replaced.
- The owner requested backend-only scope. Generate C# contract output for this
  task; TypeScript client generation and frontend/BFF consumers are deferred to
  their own task, despite the eventual dual-language generation architecture.
- Authentication, authorization, owner provisioning, and scheduled content
  filtering belong to later tasks. These initial endpoints have no user context;
  return the calendar's doors without introducing future access rules.
- Use the stack selected in [architecture rules](../rules/architecture.md),
  [API contract rules](../rules/api-contracts.md), and
  [data and migration rules](../rules/data-and-migrations.md). Follow
  [development quality rules](../rules/development-quality.md) for new languages,
  prerequisites, baseline capture, lint, and advisory comparisons.
- Exact SDK, package, generator, OpenAPI patch, and image pins must be verified
  during implementation against supported compatible releases. Do not treat
  documentation baselines as verified package combinations.

### 1. Establish backend infrastructure

Implemented paths: `src/backend/Calendar.Api`,
`src/backend/Calendar.Api.Tests`, `src/backend/Calendar.slnx`, and sibling
`src/contract`. Shared commands are `node tools/backend/check.mjs`
`restore|generate|build|test|publish|check|lint`; local/CI use the same commands.
Verification and platform exceptions are recorded in
[backend verification](../../src/backend/verification.md).

- [x] Record the owner's answers, remove resolved outstanding questions, and
  adapt requirements and verification to those decisions before implementation.
- [x] Create the backend application and an xUnit integration-test project.
  Record their actual paths and shared restore/build/test/publish commands.
  Keep generated DTO/controller output distinct from handwritten code.
- [x] Pin the .NET SDK, dependencies, NSwag tool, and Redocly contract validator;
  retain the applicable lockfiles. Integrate new prerequisites with setup/doctor,
  shared requirements, platform adapters, and developer documentation.
- [x] Configure C# and SQL quality checks in existing local and CI workflows.
  Exclude generated output and build artifacts from Git and authored-code analysis.
  Verify invalid and corrected fixtures using the same local/CI rules.

### 2. Author and generate the backend contract

- [x] Define the creation request, calendar response, door response, and applicable
  ProblemDetails/field-error schemas in the authored OpenAPI contract.
  Specify wire names, required fields, explicit nullability, title constraints,
  UUID format, UTC timestamps, and integer bounds of 1-24 for door numbers.
- [x] Define the confirmed POST/GET routes, request binding, success/error codes,
  and creation response headers. Reflect title trimming/validation and required,
  non-null door text in both schemas and runtime validation. Apply the title length
  limit to the trimmed value so boundary whitespace is normalized consistently.
  Document this normalization in the creation request contract; generated or
  framework validation must not reject an otherwise valid title solely because
  surrounding whitespace takes its raw input length above 100 characters.
  Document code point counting explicitly; generated/runtime length checks must
  not substitute UTF-16 code unit or visible-grapheme counting.
- [x] Generate abstract ASP.NET controller contracts and DTOs with System.Text.Json
  settings before builds, including clean-checkout and development builds.
  Validate the contract using Redocly without needing a running API.

### 3. Implement the model and three layers

- [x] Keep persistence/domain models distinct from generated HTTP DTOs.
  Register controller/service/repository dependencies using ASP.NET Core DI.
  Use one application project with separate layer folders and interfaces for
  the service and repository, plus the separate test project.
- [x] Implement a calendar service that trims/validates the title, generates a
  UUID v4, initializes all 24 doors with empty text, and assigns one UTC instant
  to both creation and last-modified timestamps. GET must preserve these values.
- [x] Count the trimmed title's Unicode code points using .NET rune enumeration,
  rather than `string.Length`. Keep this consistent with PostgreSQL `char_length`
  in a UTF-8 database. See the [.NET Unicode documentation][dotnet-unicode] and
  [PostgreSQL string functions][postgres-strings] for the respective representations.
- [x] Inject `TimeProvider`, use its UTC clock once per calendar initialization,
  and register `TimeProvider.System` for normal execution. Use a controlled
  provider in service tests. See [TimeProvider documentation][dotnet-timeprovider].
- [x] Implement service retrieval of the stored calendar. Return all doors in
  day-number order. Translate a missing calendar to the agreed HTTP error in
  the controller without introducing HTTP concerns into the repository.
- [x] Implement handwritten controllers derived from generated contracts.
  Validate requests, delegate to the service, map results to generated DTOs,
  and produce the agreed success responses and ProblemDetails errors.
- [x] Pass request cancellation through the service and repository to database
  operations. Use structured JSON console logs with service/request context and
  request-scoped trace IDs according to the existing architecture rules.

### 4. Implement PostgreSQL persistence and startup migrations

- [x] Create separate calendar and door tables with a calendar foreign key.
  Enforce title limits, non-null door text, valid door numbers, and uniqueness
  of door numbers within a calendar in the database. Keep relationships free
  of user/administrator dependencies.
  Enforce the title's 1-100 code point limit with `char_length` in UTF-8 and verify
  that valid supplementary-plane emoji do not fail a different API length check.
- [x] Persist calendar UUIDs as `uuid` and UTC timestamps as
  `timestamp with time zone`. Map explicitly to C# `Guid` and UTC
  `DateTimeOffset` values using Npgsql/Dapper.
- [x] Use a transaction to insert the calendar and all 24 doors. Roll back the
  entire aggregate on failure. Read stored text and timestamps and ensure
  deterministic door ordering when mapping a calendar.
- [x] Add numbered embedded SQL migrations with stable names, the standard DbUp
  PostgreSQL journal, and explicit `WithTransactionPerScript()` configuration.
  Retry database connection only within bounded startup limits; abort before
  accepting API requests on exhausted retries or migration failure.
- [x] Verify migration embedding, deterministic execution order, journal restart,
  and failure behavior. Preserve published migration identities/content. The
  prior-release baseline and deployment integration remain in build/release work.

### 5. Support local execution and seed data

- [x] Provide PostgreSQL-only Compose for host `dotnet watch`, plus backend and
  PostgreSQL Compose execution. Use a named development volume, health checks,
  readiness dependencies, and mode-appropriate connection addresses.
  Add the backend SDK/runtime multistage Dockerfile and embedded migrations.
  No frontend/BFF service is created by this task.
- [x] Add `tools/development/run-local.ps1` and `run-local.sh` launchers with
  shared orchestration in `run-local.mjs`, following the existing PowerShell/Bash
  entry-point pattern and readable-tooling rules. Resolve paths relative to the
  repository so invocation works from another directory and with spaces in paths.
  Reuse setup's saved runtime selection and explicit override behavior.
- [x] Check the selected container engine and Compose provider, build the backend
  from current source with contract generation inside the image build, and start
  the two local services using the shared Compose configuration. Keep containers
  running after the launcher returns. Bind the API's configurable published port
  to localhost, use service DNS for PostgreSQL, and enable `Development` plus the
  explicit local seed setting in this local workflow.
- [x] Wait for PostgreSQL health and API readiness within a bounded timeout.
  Print the API URL only after successful startup; return nonzero with useful
  diagnostics on missing prerequisites, port conflicts, build/start failure, or
  readiness timeout. Reuse the named database volume and existing Compose project
  on subsequent runs. Document startup, stopping services while preserving data,
  and where to inspect logs. Keep runtime/Compose prerequisite management in
  setup/doctor and extend their checks for the provider used with each runtime.
  Verify actual provider compatibility; [Podman Compose][podman-compose] delegates
  to an external provider, and [Docker Compose startup][docker-compose-up] documents
  build, background execution, and readiness options.
- [x] Configure ASP.NET Core health checks at `/health/live` and `/health/ready`.
  Keep database checks out of liveness; readiness requires successful migrations
  and a bounded current database connection/query check. Point the backend Compose
  health check at readiness. Preserve startup's nonzero exit on migration failure.
  See [ASP.NET Core health checks][dotnet-health].
- [x] Implement an idempotent local seeding path after successful migrations.
  Require both `Development` and the explicit local seed setting; ship nonlocal
  configuration with seeding disabled. Seed one usable example calendar with
  all 24 doors through shared service initialization/business rules. Keep local
  sample data out of unconditional schema migrations.
- [x] Ensure repeat startup preserves user-created calendars and existing sample
  content without duplicating the seed. Document seed activation,
  discovering the sample UUID, local run commands, and POST/GET examples.
- [x] Add a backend `.http` file with valid POST, GET by UUID, invalid-title POST,
  and unknown-ID GET examples. Provide editable base URL/calendar ID variables,
  expected status codes, and instructions for copying a returned or seed UUID.
  Keep these manual examples separate from automated integration-test evidence.
- [x] Describe runnable project behavior in project documentation and keep agent
  workflow material under `.agents/`. Update architecture documentation to
  distinguish implemented backend setup from still-future frontend/BFF setup.

### 6. Verify and record implementation evidence

- [x] Add focused service behavior checks and API integration tests with isolated
  PostgreSQL Testcontainers and the real migrations. Verify observable behavior
  instead of mirroring controller/service/repository implementation.
- [x] Add the backend contract/build/test workflow to GitHub Actions using the
  same commands as local execution and immutable action/image pins.
- [x] Verify host and backend-container local workflows, persistent data, seed
  isolation, migration restart/failure, and clean-checkout generation/build.
- [x] Record quality baseline/comparison limitations, relevant test results, and
  local runtime evidence. Update this plan and the plan index to the dated
  implemented status only after implementation and verification are complete.

## Verification

- Create a calendar from only a title and retrieve it using its returned UUID.
  Verify the trimmed title, exactly 24 doors ordered 1-24 with empty non-null text,
  identical UTC timestamps, and the `201` calendar body/Location header. GET using
  that Location must return `200` with the same persisted values.
- Verify creation assigns a nonempty UUID v4 and sets both timestamps to the same
  UTC instant. Independently created calendars
  must have distinct identifiers; identical titles must not imply the same calendar.
- With an injected fixed clock, verify both service timestamps equal that exact
  UTC instant. Advance the clock and verify a later creation uses the new instant;
  retrieving an earlier calendar must preserve its original timestamps.
- Verify a 100-character title succeeds and a 101-character title fails. Test
  missing/null title and empty/whitespace-only title returning `400`. Verify
  surrounding whitespace is trimmed before the length check and storage,
  including a 100-character title with surrounding spaces. Count internal spaces
  and punctuation. Invalid requests must create no database rows.
- Verify Unicode round trips and identical API/database boundary rules: `æ`, `ø`,
  `å`, and a simple supplementary-plane emoji such as `🎄` each count as one code
  point. A title of 100 such emoji succeeds; 101 fails. Include combining marks
  and compound emoji sequences to verify their individual code points count
  separately. Test the database constraint directly as well as through HTTP.
- Verify malformed UUID input returns `400` and an unknown well-formed UUID returns
  `404`, with contract-defined ProblemDetails. Check route/method/body binding
  through the actual handwritten derived controller.
- Round-trip UUIDs, camelCase names, text, required/null values, door numbers,
  and UTC timestamps through generated DTOs, HTTP serialization, and PostgreSQL.
  Persist representative door text directly in an isolated test database and
  verify GET returns it without requiring an editing endpoint.
- Verify creation is atomic: a failure during door persistence leaves neither
  a partial calendar nor partial doors. Verify database constraints reject
  duplicate/out-of-range door numbers and invalid title lengths.
- Restart the backend and verify calendar data is unchanged, the seed is not
  duplicated, and existing seed content is not overwritten. Test `Development`
  with the seed setting on/off and non-Development environments with it on/off.
  Only `Development` with the local setting enabled may seed. Verify shipped
  nonlocal configuration keeps seeding disabled and non-Development execution
  remains unseeded even when the setting is accidentally enabled.
- Verify DbUp executes embedded migrations in order, skips journaled scripts on
  restart, rolls back a failed script while retaining prior successful scripts,
  and prevents API startup on database retry exhaustion or migration failure.
- Run host and container workflows against the persistent development volume.
  Keep test databases isolated and verify API readiness follows migration success.
- Run the local launcher against both Docker and Podman. Verify one command builds
  and starts both services, enables the local seed, waits for readiness, prints the
  correct localhost URL, and leaves the API reachable after the launcher exits.
  Rerun it and stop/start the stack; verify persisted calendars and the single
  seeded calendar remain intact without duplicate service instances.
- Verify launcher path handling from another directory and a path containing
  spaces, runtime selection/override, unavailable engine/provider, occupied port,
  failed build/start, and readiness timeout. Failures must exit nonzero rather
  than report a usable local environment. Record actual runtime/platform evidence
  separately from simulated script tests.
- Verify `/health/live` and `/health/ready` return `200` after successful startup.
  During a database outage the running API's liveness remains `200` and readiness
  becomes `503`; after recovery readiness returns `200`. Preserve the rule that
  failed startup migrations never bring the API into service.
- Exercise all `.http` examples against the local backend and confirm their
  documented status codes, response bodies, and editable URL/ID values.
- From a clean checkout, validate the contract, regenerate C# output, restore,
  build, test, and publish without a prebuilt/running API or tracked generated code.
  Run the same backend checks in CI and the applicable saved-source quality checks.
- Verify setup/doctor recognizes backend prerequisites and the new C#/SQL checks
  reject invalid fixtures and accept corrections. Report unavailable health
  dimensions honestly; no frontend/BFF checks or user/admin infrastructure are
  required for this backend-only feature.

[dotnet-unicode]: https://learn.microsoft.com/en-us/dotnet/standard/base-types/character-encoding-introduction
[postgres-strings]: https://www.postgresql.org/docs/current/functions-string.html
[dotnet-timeprovider]: https://learn.microsoft.com/en-us/dotnet/standard/datetime/timeprovider-overview
[dotnet-health]: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
[podman-compose]: https://docs.podman.io/en/latest/markdown/podman-compose.1.html
[docker-compose-up]: https://docs.docker.com/reference/cli/docker/compose/up/
