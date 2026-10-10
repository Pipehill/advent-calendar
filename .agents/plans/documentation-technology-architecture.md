# Document the technology stack and architecture

Status: Not implemented

Last updated: 2026-10-10

## Overview

Document the agreed technology choices, communication contracts, build approach,
and container architecture for the advent calendar in a complete architecture
description with diagrams. Extract the agreed implementation rules into
`.agents/rules`, and summarize the nontechnical product requirements in the root
README. This is a documentation task; creating a runnable application, build
automation, and deployment configuration belongs to a subsequent task.

## Requirements

1. Describe a TypeScript frontend using React, TanStack Start, TanStack Router,
   and TanStack Query, built with Vite and pnpm. Use SSR as the default rendering
   approach, with a separate QueryClient per server request and browser hydration.
   Use Tailwind CSS for styling and shadcn/ui for reusable UI components.
   Use TanStack Form with Zod for form state and client-side validation, and
   display structured field errors returned through the BFF.
2. Describe a TypeScript BFF hosted by TanStack Start. The browser communicates
   with the BFF through tRPC, using its TanStack Query integration. Run the
   frontend/BFF production server on Node.js LTS using Nitro with the Vite build.
   Validate tRPC inputs at runtime with Zod.
3. Describe a C# backend using ASP.NET Core on the latest supported .NET LTS,
   with System.Text.Json for API JSON serialization and generated C# DTOs.
   Implement endpoints in hand-written classes derived from NSwag-generated
   abstract controller contracts.
   Independently validate API requests against the OpenAPI constraints and
   enforce business rules in the backend.
4. Specify PostgreSQL for persistent data and DbUp with SQL scripts for database
   migrations. Use Npgsql with Dapper for database access and hand-written SQL.
   Do not use Entity Framework.
   Use UUIDs for all project identifiers that must be unique, with C# Guid values.
5. Show three long-running containers: frontend/BFF, backend API, and database.
   Browser code is served by the frontend/BFF container and executes in the browser.
   Use Docker Compose for the local container environment with a persistent
   PostgreSQL volume, health checks, and readiness-based startup ordering.
   Support daily development with PostgreSQL in a container and the applications
   running on the host through pnpm dev and dotnet watch.
   Specify structured JSON console logs from BFF and API with a shared traceId
   propagated through W3C Trace Context. Defer full distributed tracing to a
   later observability/operations task.
6. Establish a spec-first backend API: an authored OpenAPI 3.0.x document is the
   source of truth for communication between the BFF and the .NET API. NSwag generates
   C# DTOs and abstract controller contracts, TypeScript DTOs, and a TypeScript
   HTTP client from that same document.
   Use camelCase JSON property names and PascalCase properties in generated C# DTOs.
   Require fields and disallow null by default; explicitly declare optional and
   nullable exceptions in the contract.
   Represent enum values as camelCase JSON strings explicitly listed in OpenAPI.
   Represent date-only values with OpenAPI date and C# DateOnly, and instants with
   OpenAPI date-time and UTC DateTimeOffset. Keep both as TypeScript strings.
   Use Europe/Oslo as the common calendar business timezone in the initial version,
   independently of the browser or server's local timezone. Keep instant storage
   and transport in UTC.
   Open each calendar door at 07:00 Europe/Oslo on its assigned date. Keep earlier
   doors available to authorized members and withhold future door content until
   opening, enforced by the backend and preserved through SSR and caching.
   Give JSON integer fields explicit bounds within JavaScript's safe integer
   range; use strings for any field that can exceed that range, with a fixed
   representation per field.
   If exact decimal values are needed, transport them as strings, calculate with
   C# decimal, and persist with PostgreSQL numeric and explicit precision/scale.
7. Distinguish the OpenAPI contract from the browser/BFF tRPC contract. The BFF
   uses the generated HTTP client to call the backend; tRPC client types derive
   from the TypeScript BFF router. Generated DTOs and controller contracts must
   not be maintained by hand.
   Describe backend errors with OpenAPI-defined ProblemDetails and field errors,
   consistently mapped to tRPC error codes and client field errors by the BFF.
   Give ordinary BFF-to-API calls a configurable 10-second total deadline and
   at most one retry for transient GET/HEAD failures, with retries owned by the BFF.
8. Specify `dotnet` CLI/MSBuild for backend restore, build, test, and publish,
   with a Dockerfile containing separate build and runtime stages for its image.
   Generate contract code before compilation in local and CI builds, without
   committing generated output. Use GitHub Actions for CI/CD and Redocly CLI
   for OpenAPI checks. Describe backend API integration tests using xUnit and
   PostgreSQL Testcontainers, and optional Playwright end-to-end tests against
   the environment after deployment.
   Use Vitest for frontend/BFF unit tests locally and in GitHub Actions.
9. Specify DbUp execution in the .NET backend during startup, before the API
   starts accepting requests. Failed migrations prevent API startup.
   Use one transaction per SQL migration script, with explicit, documented
   exceptions for operations that require execution outside a transaction.
   Package numbered SQL scripts as embedded resources with stable names; keep
   published migrations unchanged and check their integrity against prior
   releases in CI.
10. State the initial deployment constraint: one instance of each container;
    service downtime during deployment is acceptable. DbUp does not require
    an additional container in the selected design.
    Defer production hosting, HTTPS, secrets, persistent storage, and backup/
    recovery choices to a later deployment task; no hosting platform is selected.
11. Use the latest LTS where an LTS policy exists; otherwise use the latest
    stable, supported versions compatible with the selected stack. Explain
    that this does not mean every dependency has an LTS release. TanStack Start's
    Release Candidate status is an explicitly accepted exception; use a
    compatible, security-patched release with pinned dependency versions.
12. Keep project documentation in English and link the architecture document
    from the root README without adding agent workflow content there.
    Provide a complete architecture description with diagrams covering service/
    container boundaries, contract/build flows, and authentication/access flows.
13. Require login for calendar use while keeping the landing page and invitation
    code entry public. Support ordinary user registration with email and password.
    Provide separate administrator accounts and pages; only the project owner
    may create administrators through an owner-operated .NET command-line tool.
    Administrators create their own calendars and invite users through
    calendar-specific codes.
    Give administrators full preview and editing access to their own calendars
    before and during the calendar period, including future doors. Allow content
    to be moved between doors that have not reached their scheduled opening time.
    Use ASP.NET Core Identity with custom Npgsql/Dapper stores and shared account/
    password logic for the API and command-line tool. Store salted password hashes
    in PostgreSQL. Do not require OAuth2, an external identity provider, or
    multifactor authentication; Entity Framework remains excluded.
    Use backend-issued ASP.NET Core authentication cookies relayed by the BFF,
    including during SSR, with HttpOnly, Secure in production, SameSite=Lax,
    and CSRF protection for state-changing browser requests.
    Keep ordinary users signed in for 30 days and administrators for eight hours,
    with persistent cookies and fixed expiration measured from login, without
    automatic extension through activity.
    Logout invalidates the current session. Password changes, account disabling,
    and changes to administrator privileges invalidate all sessions for that account;
    the backend rejects invalidated sessions on subsequent requests.
14. Extract concrete implementation rules from the confirmed decisions into
    focused Markdown files under `.agents/rules`. Make them discoverable through
    `.agents/README.md`, preserve existing shared rules, and keep AGENTS.md minimal.
    Rules must agree with the architecture and must not turn deferred choices or
    unselected proposals into requirements.
15. Add a short, plain-language description of the agreed nontechnical product
    requirements to the root README: intended users, invitation and registration,
    administrator responsibilities, calendar editing, opening times, and login
    duration. Present planned behavior accurately without implying that a runnable
    application or deployment already exists.

## Outstanding questions

None. All questions needed for this documentation task have been answered or
explicitly deferred. Confirmed decisions and the destinations of explicit
deferrals are recorded below.

## Implementation

### Current repository and scope

The repository currently contains a minimal root README, agent resources, and
GitHub contribution files, but no application, contracts, migrations, or build
configuration. Planning started on clean `main`, synchronized with `origin/main`.

Deliver a complete architecture document with diagrams at `docs/architecture.md`,
focused implementation rules under `.agents/rules`, updated rule links in
`.agents/README.md`, and a short nontechnical requirements overview plus the
architecture link in the root `README.md`. No application scaffolding, package
installation, Dockerfiles, OpenAPI contract, migration scripts, CI pipeline, or
deployment is part of this documentation task. The plan itself does not implement
those documentation changes.

### Documentation deliverables and ownership

The user expanded the documentation deliverables after the technology and product
clarification. Use the confirmed decisions in this plan to produce:

- `docs/architecture.md`: the complete description of technologies, responsibilities,
  communication, contracts, builds, migrations, authentication, calendar access,
  testing, operational constraints, and explicit deferrals. Explain the rationale
  and show diagrams for container/service boundaries, authored-contract generation
  and local/CI builds, and login plus BFF/API/SSR access. Include the startup
  migration sequence in the description. Use Mermaid diagrams kept with the document.
- `.agents/rules/architecture.md`: actionable rules for the selected stack,
  browser/BFF/API boundaries, SSR and cache isolation, UI/form tooling, build/test
  workflows, version policy, and logging.
- `.agents/rules/api-contracts.md`: actionable rules for spec-first OpenAPI,
  generation, wire representations, independent validation, error translation,
  timeouts, and retry ownership.
- `.agents/rules/data-and-migrations.md`: actionable rules for PostgreSQL,
  Npgsql/Dapper, exclusion of Entity Framework, and DbUp startup, transactions,
  script ordering, immutability, and failure handling.
- `.agents/rules/authentication-and-calendar-access.md`: actionable rules for
  Identity stores, password handling, owner-only administrator provisioning,
  cookies and session lifecycle, authorization, Norwegian opening times,
  administrator editing, and separation of administrator/member data.
- `.agents/README.md`: links to the new rule files and brief guidance on when each
  applies, using the existing agent-resource overview. Keep the existing
  documentation and pull request rule links.
- Root `README.md`: a brief project introduction and plain-language overview of
  planned behavior. Cover children as users; the public invitation landing page;
  email/password registration and required calendar login; owner-created
  administrators managing their own calendars and invitation codes; full
  administrator editing and moving content between future doors; 07:00 Norwegian
  opening times and continued access to earlier doors; and 30-day user/eight-hour
  administrator login durations. Link to `docs/architecture.md` for the technical
  description. Keep agent instructions and rule-file links in `.agents`.

Keep rules concise and imperative, with one rule file owning each instruction;
link to the architecture document for explanations rather than copying its prose.
Cross-reference related rule files where needed instead of repeating instructions.
The architecture describes how the chosen system works and why the choices were
made. The README summarizes the product for readers without technical background.
Do not add decisions beyond those confirmed here, and retain explicit deferrals
with their destinations. All deliverables are written in English.

### Confirmed decisions from clarification

- **TanStack Start release policy (Q01):** The user accepts using TanStack Start
  while it is documented as a Release Candidate. Retain Start as an explicit
  exception to the stable-release policy, select a compatible security-patched
  version, and pin the dependency versions in the project. Verify resolved
  transitive dependencies against current security advisories when selecting
  versions and building the runnable setup.
- **Frontend/BFF production server (Q02):** Use Node.js LTS with Nitro and
  TanStack Start's Vite integration in the frontend/BFF container. Build with
  pnpm/Vite and start the production server from Nitro's build output. Select
  and pin compatible Nitro, Start, Vite, and Node.js versions when creating
  the runnable setup.
- **Rendering and Query cache (Q03):** Use SSR as the default rendering approach.
  Create a separate QueryClient per server request, prefetch data needed for
  the initial HTML, and hydrate the browser's Query cache from the server data.
  Do not share a server QueryClient across requests.
- **Database access (Q04):** Use Npgsql as the PostgreSQL driver and Dapper
  for parameterized SQL queries and mapping results to C# objects. Write SQL
  explicitly; DbUp remains responsible for schema migrations. Entity Framework
  is excluded.
- **OpenAPI dialect (Q05):** Author the backend API contract using OpenAPI 3.0.x.
  Select a concrete 3.0.x patch version compatible with the pinned NSwag toolchain
  when creating the runnable setup, and verify C# DTO and TypeScript DTO/client
  generation against representative schemas.
- **C# JSON serialization (Q06):** Use System.Text.Json for the .NET API and
  generated C# DTOs. Configure NSwag's C# generation explicitly for this library
  and verify generated attributes, converters, and serialization behavior against
  representative OpenAPI schemas before locking the runnable setup. Verify
  required fields, nullability, enums, and any polymorphism used by the contract;
  report compatibility issues rather than silently changing the selected library.
- **JSON field naming (Q07):** Use camelCase for property names in the authored
  OpenAPI contract, JSON payloads, and generated TypeScript DTOs. Use PascalCase
  properties in generated C# DTOs, with System.Text.Json configuration and
  generated attributes preserving the camelCase wire names.
- **Required fields and nullability (Q07b):** As an authoring convention, fields
  are required and non-nullable unless an exception is explicitly declared.
  List required properties in each OpenAPI schema's `required` array; declare
  optional properties by omitting them from that array, and allow null only with
  `nullable: true`. Presence and nullability are independent choices: a required
  nullable property must be present but may contain null. Verify that generated
  DTOs and request validation preserve these distinctions; C# nullability alone
  does not enforce property presence. This convention does not change OpenAPI's
  default behavior for properties absent from a `required` array.
- **Enum representation (Q07c):** Represent enum values as JSON strings using
  camelCase, such as `draft`, `published`, and `pendingApproval`. Define the
  allowed wire values explicitly with `type: string` and `enum` in OpenAPI.
  Configure and verify NSwag generation and System.Text.Json serialization to
  preserve those exact values in C# DTOs and TypeScript DTOs/client. Verify
  that API validation rejects numeric and unlisted values rather than relying
  on a serializer's default enum behavior.
- **Unique identifiers (Q07d):** Use UUIDs for all identifiers that must be unique
  in the project. Represent them as `type: string` with `format: uuid` in OpenAPI
  and as UUID strings in JSON and generated TypeScript DTOs. Use `Guid` in C#
  and PostgreSQL's `uuid` type when persisting these identifiers. Verify NSwag
  generation, serialization, validation, and Npgsql/Dapper mapping preserve
  those representations. This decision does not select a UUID version or
  generation location; address those details when creating the runnable setup.
- **Date and time representation (Q07e):** Represent date-only values as OpenAPI
  `type: string` with `format: date`, JSON dates such as `2026-12-01`, and C#
  `DateOnly` properties. Represent instants as OpenAPI `type: string` with
  `format: date-time`, RFC 3339 UTC timestamps such as `2026-12-01T08:00:00Z`,
  and C# `DateTimeOffset` values normalized to UTC. Configure generated
  TypeScript DTOs/client to retain both representations as strings; parse or
  format them for display only when needed. Persist dates with PostgreSQL `date`
  and instants with `timestamp with time zone`, using UTC values for Npgsql
  writes. Verify NSwag/System.Text.Json and Npgsql/Dapper round trips, including
  any required type mappings, without editing generated DTOs. Calendar business
  timezone is Europe/Oslo, with member access starting at 07:00 on each door's date
  as confirmed in Q21, with full administrator access to their own calendars.
- **Large integers (Q07f):** Send ordinary integer fields as JSON numbers with
  explicit OpenAPI minimum/maximum values within JavaScript's safe integer range
  of -9007199254740991 to 9007199254740991. If a field can exceed that range, send
  every value of that field as an integer-formatted JSON string and retain it as
  a TypeScript string, including values that happen to fall within the safe range.
  Declare string fields and their accepted syntax/range in the authored contract;
  do not describe them as numeric int64 fields while emitting quoted numbers.
  Verify generated DTOs, System.Text.Json serialization, API validation, and BFF
  forwarding preserve the digits without conversion through JavaScript number.
  Choose internal C# numeric types and any mapping from generated string DTOs
  according to the actual field ranges when implementing concrete API resources.
- **Exact decimal precision (Q07g):** The user does not currently expect exact
  decimal fields but has selected a convention in advance. If needed, declare
  them as OpenAPI strings and transport decimal text such as `123.45` in JSON,
  retaining strings in TypeScript. Use C# `decimal` for backend calculations and
  PostgreSQL `numeric` for persistence. Define allowed syntax, range, precision,
  and scale per field within C# decimal's supported limits when introducing such
  a field. Map generated string DTOs to/from domain decimal values explicitly
  using culture-independent parsing and formatting, without hand-editing DTOs.
  Preserve exact values through the BFF without conversion to JavaScript number,
  and verify serialization and database round trips. This convention does not
  add decimal fields, frontend arithmetic, or a decimal library to the scope.
- **Backend endpoints (Q08):** Use ASP.NET Core controllers with abstract
  controller contracts generated by NSwag from the authored OpenAPI document.
  Configure controller generation for ASP.NET Core and the abstract style, and
  keep generated contracts separate from hand-written derived classes containing
  endpoint implementations. Regenerate contracts and DTOs together after spec
  changes; never edit generated files to implement business logic. Verify the
  generated output compiles with the selected .NET SDK, uses the agreed DTOs,
  and exposes the authored routes, HTTP methods, and parameter bindings through
  the concrete controllers. Contract checks must also verify actual response
  bodies, status codes, and request validation; generated controller contracts
  alone do not enforce all runtime behavior.
- **Runtime validation (Q09):** Use Zod input schemas for tRPC procedures in the
  BFF to validate incoming data at runtime, including applicable UUID formats,
  required fields, nullability, allowed enum values, and numeric bounds. The
  .NET API independently validates requests against the constraints described
  in the authored OpenAPI document and enforces business rules, including for
  calls made by the BFF. Keep backend validation aligned with the generated DTOs
  without editing generated code. Do not treat TypeScript types, generated DTOs,
  or successful BFF validation as substitutes for backend validation. Document
  the distinction between structural input checks and backend business rules,
  and verify representative invalid inputs at both service boundaries.
- **Error contract (Q10):** Return backend API errors as ProblemDetails and
  describe applicable error responses, status codes, and field-validation errors
  in the authored OpenAPI contract. Use consistent BFF translation into tRPC
  errors, distinguishing invalid input, authentication failures, denied access,
  missing resources, conflicts, backend unavailability, timeouts, and unexpected
  failures. For example, map invalid requests to `BAD_REQUEST`, authentication
  failures to `UNAUTHORIZED`, denied access to `FORBIDDEN`, and unavailable
  backend service to `SERVICE_UNAVAILABLE`. Preserve structured field errors in
  the client-facing tRPC error data so the UI can associate messages with the
  appropriate form fields, including Zod input errors at the BFF boundary.
  Document and verify this mapping for errors returned by the generated HTTP
  client as well as transport failures without a backend ProblemDetails body.
  Use the session transport selected in Q19c and display mapped field errors
  through the TanStack Form integration selected in Q20.
- **BFF timeouts and retries (Q11):** Use a configurable 10-second total deadline
  for ordinary BFF-to-API calls, including any retry and waiting time. Cancel the
  HTTP call when its deadline expires; do not reset the total deadline for a
  retry. Allow at most one retry for GET/HEAD calls following network failures or
  HTTP 502, 503, or 504, with a 250-500 ms delay if time remains within the deadline.
  Do not retry other errors, explicit cancellations, or expired calls. Do not
  automatically retry write calls; any future exception requires an agreed
  idempotency mechanism that prevents duplicate actions. The BFF owns automatic
  retries for these calls; disable additional TanStack Query retries in the
  corresponding browser and SSR query configuration. Allow operation-specific
  timeout configuration when concrete requirements justify it, and verify retry
  counts, the total time limit, cancellation, and resulting tRPC error mapping.
- **DbUp transactions (Q12):** Explicitly configure `WithTransactionPerScript()`
  as the migration baseline. Commit successful scripts separately; if a script
  fails, roll back that script's transactional database changes while retaining
  previously committed scripts and their journal entries. Abort migration
  processing and prevent API startup on failure. On the next startup, DbUp's
  journal determines which scripts remain to run. Operations that cannot execute
  inside a transaction require an explicit, documented exception and a recovery
  approach for possible partial changes; do not silently disable transactions
  for all migrations. Verify rollback, retained earlier scripts, and restart
  behavior with PostgreSQL when creating the runnable setup.
- **Migration files and integrity (Q13):** Use ordered, numbered SQL files such
  as `0001_create_calendars.sql` and `0002_add_calendar_title.sql`, packaged as
  embedded resources in the backend assembly. Keep their embedded resource names
  stable because DbUp journals script identities by name; ensure ordering is
  deterministic and sequence numbers are unique. Preserve published scripts,
  including their names and content; make corrections in new migration scripts.
  Add a CI check against migration sets from earlier releases to reject edits,
  deletions, or renames of published scripts. Establish a reliable released
  baseline and verify this check when creating build/release automation. Use
  DbUp's standard PostgreSQL journal initially, without a custom runtime checksum
  journal; it records script names and application timestamps, not content hashes.
  Verify packaged script identities, ordering, and restart behavior when creating
  the runnable setup.
- **Contract generation and CI/CD (Q14):** Generate C# DTOs and abstract controller
  contracts and TypeScript DTOs/client as build outputs from the authored OpenAPI
  document. Commit the spec, generator configuration, and pinned tool versions;
  keep generated code out of Git. Both local and GitHub Actions builds invoke
  the same generation workflow before compiling their respective consumers,
  including from a clean checkout with no generated files present. Generation
  must read the authored spec without requiring a running or compiled backend.
  Generated files are inputs to compilation; the resulting application artifacts
  are packaged for deployment. Run Redocly CLI checks on OpenAPI and verify the
  generated code through .NET compilation and explicit TypeScript type checking
  alongside the Vite build. Do not add a comparison against committed generated
  files to CI, since those files are not versioned.
- **Integration and deployed-environment tests (clarified with Q14):** Use
  backend API integration tests to verify actual request handling, responses,
  status codes, validation, and data access, including their agreement with the
  authored OpenAPI contract. Contract verification can be part of these tests;
  it does not require a separate test suite solely for that purpose. If
  end-to-end tests are added, use Playwright against the deployed environment
  after deployment to exercise browser/BFF/API flows. Backend test tooling is
  confirmed under Q15 and frontend/BFF unit test tooling under Q15b.
  Deployment-stage details belong to the later deployment work.
- **Backend test tooling (Q15):** Use xUnit for backend tests and PostgreSQL
  Testcontainers for API integration tests requiring persistence or migrations.
  Start an isolated PostgreSQL instance for the tests, apply the application's
  actual DbUp scripts, and exercise the API with Npgsql/Dapper database access.
  Run these tests locally and in GitHub Actions with a compatible container
  runtime. Verify API behavior and agreement with OpenAPI, as well as migration
  application, rollback, and journal-based restart behavior. Keep test data
  isolated from development and deployed databases. The temporary test database
  containers do not add a long-running container to the deployment architecture.
  Select compatible, supported stable test package versions and pin them when
  creating the runnable setup.
- **Frontend/BFF unit test tooling (Q15b):** Use Vitest for frontend and BFF unit
  tests, running through pnpm locally and in GitHub Actions. Use focused tests
  for behavior such as Zod input validation, backend-to-tRPC error translation,
  and frontend logic. Configure tests for their applicable runtime and isolate
  external dependencies as needed. Keep these tests distinct from backend API
  integration tests and optional Playwright tests against a deployed environment.
  Pin a supported stable Vitest version compatible with the chosen Vite and
  Node.js versions when creating the runnable setup.
- **Local container workflow (Q16):** Use Docker Compose to run the complete
  frontend/BFF, API, and PostgreSQL environment in containers. Persist local
  database data in a named volume. Use health checks and readiness-based
  dependencies so PostgreSQL is ready for migrations and the API is ready only
  after successful DbUp execution; retain the backend's bounded database
  connection retries. For ordinary development, run PostgreSQL in Compose and
  frontend/BFF with `pnpm dev` and backend with `dotnet watch` directly on the host
  for fast reloads and debugging. Document the two modes, host versus container
  connection addresses, and contract generation needed by the development builds.
  Keep application services from running twice unintentionally in the two modes.
  Testcontainers databases remain separate from the persistent development
  database. Verify startup, migration failure, restart, persistence, and both
  local workflows when creating the runnable setup. This choice does not select
  a production hosting platform.
- **Production hosting and recovery (Q17, explicitly deferred):** Resolve
  production container hosting, HTTPS/TLS termination, secrets management,
  persistent database storage, backups, and restoration checks in a later
  deployment task. Hosting is not yet determined. The user has considered
  Sliplane as one possible alternative; record it as a candidate, not a selected
  platform or an assumed set of capabilities. Preserve the agreed three-container
  architecture and single-instance/downtime constraints as inputs to that task.
  GitHub Actions remains the selected CI/CD platform; production deployment
  integration is to be designed once the hosting platform is chosen.
- **Logging and diagnostics (Q18):** Emit structured JSON console logs from the
  BFF and .NET API, with useful timestamp, severity, service, and request context.
  Use a shared `traceId` to correlate BFF-to-API requests, propagating W3C Trace
  Context in HTTP calls and including the trace ID in relevant logs at both
  services. Generate context where none exists and keep it scoped to the request,
  including SSR requests. Use .NET's built-in logging with JSON console formatting
  and equivalent structured output in the BFF. Verify context propagation and
  log correlation across concurrent requests when creating the runnable setup.
  The user explicitly defers full distributed tracing, trace collection/storage,
  and visualization of service timings to a later observability/operations task;
  do not treat a tracing backend or instrumentation package as selected now.
- **Authentication and calendar roles (Q19):** Calendar use
  requires login. The landing page is public and lets visitors paste a received
  invitation code. A visitor without an account can register with email and a
  password; an existing user can sign in to use the invitation. An invitation
  identifies a calendar and grants membership through the invitation flow; it
  does not grant administrator privileges or replace login for calendar use.
  Provide separate administrator accounts with their own access level and
  administrator pages. Ordinary registration cannot create administrator accounts;
  only the project owner can create them through the owner-operated command-line
  tool selected in Q19b. Administrators can create their own calendars and invite
  users with codes for those calendars. Backend authorization must enforce administrator
  privileges, calendar ownership, and user membership independently of UI checks.
  Do not assume administrators can manage calendars belonging to other
  administrators.
  Use local email/password credentials without OAuth2, an external identity
  provider, or multifactor authentication. Store salted password hashes, not
  decryptable passwords, in PostgreSQL and verify passwords using a maintained
  password-hashing implementation through the selected ASP.NET Core Identity
  integration. Use the session transport selected in Q19c; selecting local
  credentials does not authorize Entity Framework.
- **Credential management (Q19):** Use ASP.NET Core Identity with custom stores
  implemented through Npgsql and Dapper against PostgreSQL. Do not use Identity's
  Entity Framework stores, EF migrations, or EF-based application templates.
  Keep schema changes in DbUp SQL scripts. Share account-creation, password
  hashing/verification, and account validation logic between the API and the
  owner-operated administrator command-line tool. Implement the Identity store
  interfaces needed for the agreed email/password accounts and roles; this does
  not select external login providers or multifactor authentication. Keep the
  public registration flow restricted to ordinary users and administrator creation
  restricted to the owner tool. Preserve UUID/Guid identifiers and verify that
  accounts created through either path work with the same credential logic.
  Use the cookie-based browser/BFF/API session transport selected in Q19c.
- **Owner-controlled administrator provisioning (Q19b):** Use a separate .NET
  command-line tool that only the project owner can run to create administrator
  accounts in PostgreSQL. It is an on-demand administrative operation, not an
  additional long-running service; retain the three-container architecture.
  Public registration and application endpoints must not expose administrator
  creation. Reuse the selected ASP.NET Core Identity account-creation and
  password-handling logic with the same Npgsql/Dapper stores. Describe required database
  access and owner-only execution in the architecture document; concrete packaging
  and production invocation belong to the later setup/deployment work.
- **Sessions and BFF/API authentication (Q19c):** The .NET backend issues and
  validates the ASP.NET Core Identity authentication cookie. The browser sends
  the cookie to the public frontend/BFF origin; the BFF relays only the designated
  authentication cookie to the API on request-scoped calls, including SSR.
  Relay the relevant backend Set-Cookie headers for login, logout, and any cookie
  renewal to the browser response, preserving separate headers and ensuring
  cookie scope matches the public origin. Use a host-only HttpOnly cookie,
  Secure in production and SameSite=Lax. The BFF does not decrypt the cookie
  or treat browser-supplied user IDs or role headers as authenticated identity.
  The API authenticates the cookie and enforces roles, calendar ownership, and
  membership. Authentication failure must produce API errors rather than HTML
  login redirects, with the agreed BFF/tRPC error mapping.
  Protect state-changing browser requests against CSRF, including authentication
  operations; SameSite alone is not the complete protection. Preserve user/session
  isolation across concurrent SSR requests, generated HTTP clients, and caches.
  Describe authentication operations and cookie security in the authored OpenAPI
  contract; keep React authentication screens within the selected frontend.
  The backend owns the .NET Data Protection keys needed to validate its cookies;
  the Node.js BFF does not need those keys. Document durable, protected key storage
  across container replacement as a deployment requirement, with the concrete
  storage configuration addressed alongside the already deferred hosting/secrets
  choices in the later deployment task. No new long-running service is selected.
  Use the session lifetimes and invalidation rules confirmed in Q19d below.
- **Session lifetime (Q19d):** Use persistent authentication
  cookies with an absolute maximum lifetime of 30 days for ordinary users and
  eight hours for administrator accounts, measured from successful login.
  Disable sliding expiration; activity and cookie reissuance must not move the
  original expiration forward. Users must log in again after expiration.
  The user selected the longer ordinary-user lifetime because children will use
  the application and may need help entering their password. Preserve login
  across normal browser restarts within that lifetime; earlier logout or
  invalidation can still end a session. Keep the backend ticket expiration and
  browser cookie expiration consistent, and apply the administrator limit based
  on the authenticated account's privileges.
- **Session invalidation (Q19d):** Logout invalidates only the current session;
  other sessions for that account remain active. Password changes, account
  disabling, and changes to administrator privileges invalidate all sessions for
  the affected account. The API must reject those sessions on subsequent requests,
  including requests through the BFF or SSR. Deleting a browser cookie alone is
  insufficient to implement server-side invalidation of that session; replaying
  an invalidated cookie must fail. Describe the backend's persisted session/account
  validity checks using the agreed PostgreSQL and Npgsql/Dapper stack, with no
  additional long-running service. Preserve the agreed absolute expiration during
  Identity validation or cookie reissuance. Concrete session-state schema and
  storage implementation belong to the subsequent runnable-setup task, which must
  demonstrate both per-session logout and account-wide invalidation.
- **Styling and UI components (Q20):** Use Tailwind CSS with
  Vite integration and shadcn/ui components in the React/TanStack Start frontend.
  Customize these components for the calendar experience and administrator pages.
  shadcn/ui provides component source that the project maintains and commits;
  distinguish this source from NSwag-generated contract code excluded from Git.
  Keep the selected SSR/hydration approach and verify compatibility with the
  chosen React, Vite, and TanStack Start versions when creating the runnable setup.
  Pin the styling/component tooling and supporting dependencies according to the
  agreed version policy. This choice does not install components or determine
  individual page designs in the documentation task.
- **Form handling (Q20):** Use TanStack Form with Zod for form state and
  client-side validation in login, registration, and calendar administration,
  together with the selected shadcn/ui components. Display structured field errors
  returned through tRPC after BFF translation of backend ProblemDetails or Zod
  input errors; distinguish these from errors applying to the whole submission.
  Reuse compatible Zod input schemas between the frontend and BFF where their
  inputs match. Keep independent runtime validation at the BFF and backend;
  client-side validation provides feedback and does not enforce authorization.
  The authored OpenAPI document remains the source of truth for BFF/API contracts;
  choosing form validation does not select a second API contract or automatic
  Zod schema generation. Verify compatibility with the selected React, TanStack,
  and Zod versions when creating the runnable setup, and pin stable compatible
  versions according to the agreed version policy.
- **Calendar business timezone (Q21):** Follow Norwegian time
  in the initial version, using Europe/Oslo as the common timezone for all calendars.
  Calendar date calculations and opening checks must use this named timezone,
  not the browser's timezone, the container's local timezone, or a fixed UTC offset.
  Keep the agreed UTC transport/storage of instants and DateOnly representation
  of calendar dates; interpret business dates/times in Europe/Oslo when deriving
  instants. Use timezone rules rather than assuming one offset throughout the year.
  The initial version does not provide per-calendar timezone selection. Use the
  member opening rules confirmed below.
- **Calendar opening and member access (Q21):** Each door opens at 07:00
  Europe/Oslo on its assigned calendar date. The user chose the morning opening
  time so children do not stay awake past midnight to open the next door.
  Previously opened doors remain available to authorized members. Future door
  content is withheld until opening; changing the browser clock or calling an
  endpoint directly must not bypass the restriction. The backend checks the
  current server time against the opening instant derived from the business date
  and Europe/Oslo rules, alongside session validity and calendar membership.
  Do not send future content to ordinary users in API responses, server-rendered
  HTML, hydrated query data, or prefetched browser caches. Keep request/user
  isolation and ensure cached responses do not bypass access checks or retain a
  stale locked state after opening. Refresh relevant data at or after the opening
  boundary so newly available content can be fetched. Keep administrator access
  separate from member access as confirmed below.
- **Administrator calendar editing (Q21):** Administrators work with a fully
  open view of calendars they own. They can prepare the complete calendar before
  Christmas and preview/edit all doors regardless of their scheduled opening time,
  including changes during the calendar period. They can move content between
  doors that have not yet reached their 07:00 Europe/Oslo opening instant; this
  refers to scheduled availability, rather than whether an individual member has
  clicked a door. The backend checks ownership and administrator privileges for
  preview/edit operations and validates source/destination opening times when
  moving content. Ordinary member responses still withhold future content.
  Separate administrator responses and caches from member responses, including
  SSR and hydrated query data. Refresh relevant cached data after calendar edits
  or moves so administrator changes are reflected without exposing future content
  to ordinary members. Concrete editing screens, content models, and API resources
  belong to subsequent application work; document these agreed access rules now.

### Work order

- [ ] Create `docs/architecture.md` with a complete, clearly structured description
  of the selected technologies and the responsibilities of the browser, BFF,
  backend, and database, covering the confirmed decisions and explicit deferrals.
- [ ] Add an architecture diagram showing browser -> frontend/BFF through tRPC,
  BFF -> backend through HTTP/OpenAPI, and backend -> PostgreSQL. Mark the three
  container boundaries and show that DbUp runs inside the backend container.
- [ ] Add diagrams for authored-contract generation and local/GitHub Actions
  build flows, and for login plus authenticated browser/BFF/API/SSR access.
  Show where credentials are validated, cookies are relayed, and backend checks
  distinguish administrator access from scheduled member access. Keep all diagrams
  consistent with the architecture description and existing container boundaries.
- [ ] Document the contract workflow: author or change the OpenAPI document,
  generate C# DTOs and abstract controller contracts and TypeScript DTOs/client
  through NSwag, then adapt derived controller implementations and BFF procedures.
  Specify OpenAPI 3.0.x as the contract dialect.
  Document camelCase wire names and PascalCase C# properties, and ensure code
  generation preserves the mapping between them.
  Document required, non-nullable fields as the authoring convention and explicit
  optional/nullable exceptions, including the independent meaning of presence
  and nullability in OpenAPI and generated DTOs.
  Specify camelCase string enums and checks that generated code, serialization,
  and request validation preserve the allowed values declared in the contract.
  Document UUIDs for all identifiers requiring uniqueness, using OpenAPI uuid
  strings, C# Guid properties, TypeScript strings, and PostgreSQL uuid columns.
  Document date-only and UTC timestamp formats, C# DateOnly/DateTimeOffset,
  TypeScript strings, and corresponding PostgreSQL storage and mapping checks.
  Document bounded JSON integers and fixed string representations for integer
  fields that can exceed JavaScript's safe range, including precision checks.
  Record the conditional exact-decimal convention: string transport, C# decimal
  calculations, and PostgreSQL numeric with field-specific precision and scale.
  Explain that local and GitHub Actions builds generate unversioned contract code
  before compilation from the authored spec, without a running backend. Describe
  the checked-in spec, generator settings, pinned tools, and generated build
  outputs. The backend implementation must also be verified against the contract
  through API integration tests; generated DTOs alone do not enforce runtime
  routes and status codes.
- [ ] Document GitHub Actions as the CI/CD platform, shared local/CI build and
  generation commands, Redocly OpenAPI checks, .NET compilation, and explicit
  TypeScript type checking alongside Vite. Describe clean-build verification
  without relying on generated files in Git.
- [ ] Document xUnit backend API integration tests using isolated PostgreSQL
  Testcontainers and actual DbUp migrations, including contract agreement and
  local/GitHub Actions execution. Describe optional Playwright end-to-end tests
  against the environment after deployment; keep deployment details aligned with
  later decisions. Document Vitest frontend/BFF unit tests and their pnpm-based
  local/GitHub Actions execution separately from integration and deployed tests.
- [ ] Document NSwag's abstract ASP.NET Core controller generation, the separate
  hand-written derived implementations, and checks for generated code compilation,
  routes, HTTP methods, parameter binding, responses, status codes, and validation.
- [ ] Document System.Text.Json as the API serializer and NSwag's C# generation
  target. Describe the generation and serialization checks needed to ensure the
  DTOs preserve the authored contract's field names, presence, nullability, enums,
  and any polymorphism.
- [ ] Describe tRPC integration through `@trpc/tanstack-react-query` and the
  BFF's use of the generated backend HTTP client. Explain that server-side API
  calls and backend configuration belong in the BFF's server code.
- [ ] Document Zod input validation in tRPC and independent OpenAPI-aligned
  request validation in the .NET API, with backend enforcement of business rules.
  Describe checks for invalid inputs at both boundaries and explain that type
  generation alone does not validate data received at runtime.
- [ ] Document the OpenAPI-described ProblemDetails error contract and field
  errors, BFF translation to tRPC codes and structured field-error data, and
  client behavior for validation, access, and backend availability failures.
- [ ] Document the configurable total BFF-to-API timeout, bounded GET/HEAD retries
  for transient failures, and no automatic retries for writes. Explain how BFF
  retry ownership and TanStack Query configuration prevent multiplied attempts.
- [ ] Document SSR as the default rendering approach, including request-scoped
  QueryClients, initial data loading through the BFF, and browser hydration using
  TanStack Start's Query integration.
- [ ] Document database access through Npgsql and Dapper, including hand-written
  parameterized SQL and result mapping, separately from DbUp schema migrations.
- [ ] Describe frontend builds through pnpm/Vite and backend builds through
  `dotnet restore`, `dotnet build`, `dotnet test`, and `dotnet publish` as the
  agreed toolchain. Explain the separate SDK build stage and ASP.NET runtime
  stage, including the DbUp PostgreSQL provider and SQL migrations packaged
  with the application.
- [ ] Document the frontend/BFF production server: TanStack Start's Vite build
  uses Nitro for Node.js LTS deployment. Describe the build output and production
  start command, and verify the selected package versions together when creating
  the runnable setup.
- [ ] Document backend startup: wait for database availability using bounded
  connection retries, apply pending SQL scripts through DbUp, and start accepting
  API requests only after success. Explain that the application packages ordered
  SQL migration scripts and the `dbup-postgresql` provider. DbUp runs within the
  .NET process, using its journal to track executed scripts. Report migration
  failures through a nonzero container exit status. Migration execution occurs
  at runtime, not during image building.
- [ ] Document explicit DbUp transaction-per-script configuration, rollback of
  a failed script, retention of earlier successful scripts, journal-based restart
  behavior, and handling of operations requiring non-transactional execution.
- [ ] Document numbered embedded SQL migrations, stable resource names and
  ordering, immutable published scripts, corrections through new scripts, and
  CI integrity checks against prior releases with the standard DbUp journal.
- [ ] Describe the deployment sequence: stop the old API instance before
  migrations that may change its schema assumptions, start the new backend
  container, apply migrations, and bring the API into service after startup.
  Record accepted downtime and that reverting the application image does not
  automatically undo applied database migrations. Migrations also run on
  container restarts; DbUp's journal tracks which scripts have already applied.
- [ ] Document Docker Compose for the complete local container environment,
  database persistence and readiness, and host-based pnpm/dotnet watch development
  with PostgreSQL in Compose. Describe connection configuration and build-time
  generation for both modes, separately from isolated Testcontainers databases.
- [ ] Record the explicitly deferred production hosting and recovery decisions
  and their destination in a later deployment task. Identify Sliplane only as
  a candidate and distinguish selected GitHub Actions from unselected hosting.
- [ ] Document structured JSON console logs, request-scoped W3C trace context,
  and shared trace IDs in BFF/API logs. Record full distributed tracing and its
  collection and visualization infrastructure as deferred to later operations work.
- [ ] Document the public invitation landing page, email/password registration
  and login, separate administrator accounts and pages, owner-only administrator
  provisioning, and administrator-owned calendars with invitation codes.
  Specify salted password hashes and backend role/ownership/membership checks.
  Describe the owner-operated .NET command-line tool, its database access, and
  reuse of ASP.NET Core Identity account/password logic with custom Npgsql/Dapper
  stores and DbUp-managed schema, without an additional long-running service.
  Document backend-issued cookies, request-scoped BFF forwarding including SSR,
  Set-Cookie propagation, cookie attributes, CSRF protection, API error behavior,
  and the backend's durable Data Protection key requirement. Reflect authentication
  boundaries in the diagram. Document persistent 30-day ordinary-user sessions
  and eight-hour administrator sessions with fixed expiration from login and no
  sliding extension, including the child-user rationale. Document current-session
  logout and account-wide invalidation after password changes, disabling, or changes
  to administrator privileges, with backend validity checks. Retain concrete
  key-storage configuration in later deployment work.
- [ ] Document Tailwind CSS through Vite and project-maintained shadcn/ui
  component source for the calendar and administrator UI. Distinguish committed
  component source from untracked generated contract code, and describe version
  compatibility and SSR/hydration checks for the subsequent runnable setup.
  Document TanStack Form with Zod for login, registration, and administration
  forms, displaying BFF/API field errors and retaining validation at both server
  boundaries. Explain how form validation relates to the authored OpenAPI contract.
- [ ] Document Europe/Oslo as the common calendar business timezone in the first
  version, with UTC instants for storage/transport and business-date interpretation
  independent of browser/container local settings. Specify 07:00 opening on each
  door's date, continued access to earlier doors, backend enforcement, and
  withholding future content through API/SSR/hydration/prefetch/cache flows.
  Include refresh behavior at the opening boundary. Describe the administrator's
  fully open view of owned calendars, preparation of the whole calendar, editing
  during the calendar period, and moving content between future doors. Document
  backend ownership/scheduling checks and separation of administrator/member data
  in SSR and caches, including refresh after changes.
- [ ] Record the version policy and date any concrete version examples.
  Document the accepted TanStack Start Release Candidate exception, pinned
  versions, and verification of security patches in transitive dependencies.
  Research on 2026-10-10 identified .NET 10 and Node.js 24 as current LTS
  baselines. Verify current releases and mutual compatibility when implementing
  the documentation and again when creating the runnable setup. PostgreSQL
  uses its supported-major-version policy, rather than a separate LTS label.
  Future setup must pin chosen tool versions and retain dependency lockfiles
  so that builds do not depend on floating `latest` versions.
- [ ] Include the backend build alternatives considered: CLI/MSBuild with a
  multistage Dockerfile (selected), SDK container publishing (alternative),
  and NUKE as optional future build orchestration. Explain why the selected
  approach provides explicit control of the .NET runtime and application contents.
- [ ] Extract the confirmed implementation rules into the four focused rule files
  listed under documentation deliverables. Preserve existing shared rules, assign
  each instruction one owning file, and link to related rules and architecture
  explanations. Keep deferred choices out of mandatory rules.
- [ ] Update `.agents/README.md` with discoverable rule links and applicability
  guidance, preserving existing links and the minimal AGENTS.md entry point.
- [ ] Write the short nontechnical product overview in the root README using the
  confirmed user, invitation, administrator, editing, opening, and login-duration
  requirements. Identify it as planned behavior and link `docs/architecture.md`.
- [ ] Review the architecture, diagrams, rules, agent-resource links, and README
  together and run the documentation verification steps.

Technology choices identified by the review are recorded in the confirmed
implementation details above, together with explicit deferrals and their
destinations. The plan is ready for the documentation task; it does not authorize
creation of the runnable setup. Concrete API resources and exact dependency pins
remain work for subsequent application/setup tasks. Verify OpenAPI/NSwag and
package compatibility when creating the runnable setup.

### Reference documentation

Use primary sources when verifying support and integration claims:

- [TanStack Start tRPC example](https://tanstack.com/start/latest/docs/framework/react/examples/with-trpc)
- [tRPC TanStack Query integration](https://trpc.io/docs/client/tanstack-react-query/setup)
- [tRPC input validators](https://trpc.io/docs/server/validators)
- [tRPC error handling](https://trpc.io/docs/server/error-handling)
- [TanStack Query retry configuration](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries)
- [HTTP idempotent methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)
- [ASP.NET Core error handling](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling?view=aspnetcore-10.0)
- [ASP.NET Core password hashing guidance](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/consumer-apis/password-hashing?view=aspnetcore-10.0)
- [ASP.NET Core Identity custom storage providers](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity-custom-storage-providers?view=aspnetcore-10.0)
- [ASP.NET Core cookie authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0)
- [ASP.NET Core CSRF protection](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)
- [ASP.NET Core Data Protection configuration](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0)
- [Tailwind CSS Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui introduction](https://ui.shadcn.com/docs)
- [shadcn/ui TanStack Start integration](https://ui.shadcn.com/docs/installation/tanstack)
- [shadcn/ui TanStack Form integration](https://ui.shadcn.com/docs/forms/tanstack-form)
- [TanStack Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation)
- [NSwag capabilities](https://github.com/RicoSuter/NSwag)
- [NSwag MSBuild integration](https://github.com/RicoSuter/NSwag/wiki/NSwag.MSBuild)
- [Redocly OpenAPI linting](https://redocly.com/docs/cli/commands/lint)
- [Vite TypeScript type checking](https://vite.dev/guide/features.html#typescript)
- [Playwright CI setup](https://playwright.dev/docs/ci-intro)
- [Vitest getting started](https://vitest.dev/guide/)
- [xUnit getting started](https://xunit.net/docs/getting-started/v3/getting-started)
- [PostgreSQL Testcontainers for .NET](https://dotnet.testcontainers.org/modules/postgres/)
- [Docker Compose startup order and health checks](https://docs.docker.com/compose/how-tos/startup-order/)
- [.NET JSON console logging](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/console-log-formatter)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [NSwag controller generation](https://github.com/RicoSuter/NSwag/wiki/CSharpControllerGenerator)
- [NSwag controller generation settings](https://github.com/RicoSuter/NSwag/blob/master/src/NSwag.CodeGeneration.CSharp/CSharpControllerGeneratorSettings.cs)
- [C# DTO generator JSON settings](https://github.com/RicoSuter/NJsonSchema/blob/master/src/NJsonSchema.CodeGeneration.CSharp/CSharpGeneratorSettings.cs)
- [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)
- [.NET Docker builds](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/docker/building-net-docker-images)
- [.NET SDK container publishing](https://learn.microsoft.com/en-us/dotnet/core/containers/sdk-publish)
- [Node.js release schedule](https://github.com/nodejs/Release)
- [PostgreSQL version policy](https://www.postgresql.org/support/versioning/)
- [Vite support policy](https://vite.dev/releases)
- [DbUp usage](https://dbup.readthedocs.io/en/latest/usage/)
- [DbUp PostgreSQL provider](https://github.com/DbUp/dbup-postgresql)
- [DbUp journaling](https://dbup.readthedocs.io/en/latest/more-info/journaling/)
- [DbUp embedded script providers](https://dbup.readthedocs.io/en/latest/more-info/script-providers/)
- [DbUp PostgreSQL journal implementation](https://github.com/DbUp/dbup-postgresql/blob/master/src/dbup-postgresql/PostgresqlTableJournal.cs)
- [DbUp transactions](https://dbup.readthedocs.io/en/latest/more-info/transactions/)
- [Npgsql data access](https://www.npgsql.org/doc/basic-usage.html)
- [Npgsql date and time handling](https://www.npgsql.org/doc/types/datetime.html)
- [OpenAPI data types and formats](https://swagger.io/docs/specification/v3_0/data-models/data-types/)
- [Dapper](https://github.com/DapperLib/Dapper/blob/main/Readme.md)
- [TanStack Start release status](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Start Node.js hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [TanStack Start Query and SSR integration](https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-query)
- [TanStack Start security update](https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989)

## Verification

- Confirm that questions needed for this task have been answered or explicitly
  deferred, and that resolved answers appear in implementation details rather
  than remaining in `Outstanding questions`. Update `Last updated` after edits.
- Review the documentation deliverables against all fifteen requirements, confirming
  that the diagram and prose use the same container and communication boundaries.
- Confirm the complete architecture covers every confirmed decision and explicit
  deferral, with diagrams for container boundaries, contract/build flows, and
  authentication/access flows that agree with the prose and startup sequence.
- Confirm the four implementation rule files contain concise, actionable
  instructions derived from confirmed choices, with one owning file per rule and
  working cross-references. Check agreement with the architecture and preserve
  existing documentation/pull request rules. Verify `.agents/README.md` links to
  each rule with useful applicability guidance and AGENTS.md remains minimal.
- Review the root README's plain-language overview against the confirmed product
  behavior, including children, public invitation entry, registration/login,
  owner-created administrators, calendar ownership/editing and moving future
  content, 07:00 Norwegian opening times, earlier doors, and login durations.
  Confirm it describes planned behavior, links the architecture, and contains
  no agent workflow instructions or links to agent rules.
- Confirm frontend styling uses Tailwind CSS with Vite and shadcn/ui components
  whose source is maintained and committed by the project. Preserve the separate
  policy excluding build-generated contract code from Git, and describe version
  compatibility and SSR/hydration checks without installing UI tooling in this task.
- Confirm forms use TanStack Form with Zod and shadcn/ui components, with
  structured BFF/API errors attached to the appropriate fields and general
  submission errors shown separately. Preserve independent BFF/API validation
  and the authored OpenAPI source of truth. Plan focused frontend/BFF checks for
  invalid input and mapped field errors when implementing the runnable setup.
- Check that OpenAPI generation starts with an authored contract and produces
  both languages' DTOs, uses OpenAPI 3.0.x, and describes browser/BFF tRPC separately.
- Confirm the document specifies build-generated contract code excluded from
  Git, shared local/GitHub Actions generation before compilation, Redocly checks,
  and clean-build verification with .NET and TypeScript compilation/type checks.
- Confirm API integration tests cover actual backend behavior and contract
  agreement, while optional Playwright tests target the environment after deploy.
- Confirm backend tests use xUnit and isolated PostgreSQL Testcontainers with
  actual DbUp migrations, document local/CI container-runtime requirements, and
  keep test containers distinct from the three long-running deployment containers.
- Confirm frontend/BFF unit tests use Vitest through pnpm locally and in GitHub
  Actions, with compatible pinned versions and a clear distinction from API
  integration tests and optional Playwright tests after deployment.
- Confirm endpoint implementation uses NSwag-generated abstract ASP.NET Core
  controller contracts and separate hand-written derived classes, with planned
  compilation and runtime contract checks beyond DTO generation alone.
- Confirm tRPC inputs use Zod and backend validation independently checks the
  authored API constraints and business rules. Verify the document calls for
  invalid-input checks at both boundaries without equating types with validation.
- Confirm backend errors use OpenAPI-described ProblemDetails, with consistent
  BFF mapping to tRPC codes and field-error data. Describe checks for backend
  error responses, Zod failures, and transport failures without an API error body.
- Confirm the BFF call policy documents a configurable 10-second total deadline,
  at most one GET/HEAD retry for network errors or 502/503/504 with a 250-500 ms
  delay, no automatic write retries, and disabled additional TanStack Query
  retries. Describe checks for deadlines, cancellation, attempts, and error mapping.
- Confirm System.Text.Json is selected for the API and generated C# DTOs, with
  explicit generator configuration and planned verification of serialization
  against representative schemas.
- Verify the documentation specifies camelCase OpenAPI/JSON and TypeScript
  property names with PascalCase C# properties, preserving the same wire names.
- Confirm the documentation specifies required, non-nullable fields by default
  as an authoring convention, explicit exceptions, and checks for missing versus
  null values in generated DTO serialization and API request validation.
- Confirm enums are documented as camelCase JSON strings with explicit OpenAPI
  values and checks for consistent generation, serialization, and validation.
- Confirm all identifiers requiring uniqueness use UUIDs, with consistent
  OpenAPI/JSON, generated C#/TypeScript, and PostgreSQL representations.
- Confirm date-only values use DateOnly and date strings, instants use UTC
  DateTimeOffset and date-time strings, and TypeScript DTOs retain strings.
  Describe generation, serialization, and database round-trip checks, keeping
  calendar timezone and visibility rules separate from these transport formats.
- Confirm the initial calendar business timezone is Europe/Oslo for all calendars,
  independently of browser/container timezone, with UTC instant transport/storage
  and no per-calendar timezone selection. Plan checks that the same business date
  and opening decision apply from different client/server timezone settings and
  that named-zone offsets are used rather than a fixed UTC offset. Confirm doors
  open at 07:00 on their assigned dates and earlier doors remain available to
  authorized members. Plan controlled-time integration checks immediately before,
  at, and after 07:00, including direct API access and altered browser clocks.
  Check that future content is absent from ordinary-user API/SSR/hydration/prefetch
  responses and caches, and that data can refresh when a door opens. Confirm
  administrators can preview and edit their whole owned calendar before and during
  the calendar period, including future content, and move content between doors
  that have not reached their scheduled opening time. Plan checks for ownership,
  moves across the opening boundary, refreshed data after edits/moves, and isolation
  of administrator/member API responses, SSR output, and caches.
- Confirm ordinary JSON integers have explicit safe bounds and fields that can
  exceed those bounds consistently use strings in OpenAPI/JSON and TypeScript.
  Describe checks that preserve exact digits through generation and BFF/API calls.
- Confirm the exact-decimal convention specifies string transport, backend
  decimal calculations, PostgreSQL numeric, and explicit field-level limits,
  without implying that the application currently needs decimal fields.
- Confirm the frontend/BFF production configuration documents Node.js LTS,
  Nitro, and the Vite build and production start workflow.
- Confirm SSR is the documented default, with a QueryClient per server request
  and browser cache hydration from server-loaded data.
- Confirm local workflows describe the full three-service Docker Compose setup
  and host-based frontend/BFF and backend development with the database in Compose.
  Verify the document specifies persistence, readiness after migrations, connection
  addresses, and generation needed by local builds, separately from test databases.
- Confirm hosting, HTTPS, secrets, persistent production storage, backups, and
  recovery are explicitly deferred to a later deployment task, with Sliplane
  listed only as a candidate and no assumed production provider capabilities.
- Confirm logging specifies structured JSON console output from BFF/API,
  request-scoped W3C trace propagation and shared trace IDs, with planned
  concurrency/correlation checks and full distributed tracing explicitly deferred.
- Confirm authentication requirements distinguish the public invitation landing
  page from authenticated calendar use, ordinary email/password registration from
  owner-only administrator creation, and administrator-owned calendars from user
  membership. Document separate administrator accounts/pages, salted password
  hashes, and backend authorization independently of frontend visibility checks.
  Verify the final credential/session and provisioning decisions preserve the
  exclusion of Entity Framework and accurately describe deployed service boundaries.
  Confirm administrator provisioning uses an owner-operated .NET command-line
  tool with shared account/password logic and does not add a long-running service
  or expose administrator creation through public application endpoints.
  Confirm credential management uses ASP.NET Core Identity with custom
  Npgsql/Dapper stores, UUID/Guid identifiers, and DbUp SQL migrations, with no
  Entity Framework dependency. Plan integration checks that ordinary registration
  and CLI-created administrator accounts use the same password verification and
  account validation logic while enforcing their distinct creation permissions.
  Confirm session transport uses backend-issued ASP.NET Core cookies, forwarding
  only the designated cookie through the BFF and propagating relevant Set-Cookie
  headers to the public origin. Document cookie attributes, CSRF protection,
  API authentication errors, and durable Data Protection keys owned by the backend.
  Plan login/logout and CSRF checks through browser/BFF/API, authenticated SSR
  checks, and concurrent-user isolation checks when implementing the runnable
  setup. Confirm persistent sessions last at most 30 days for ordinary users and
  eight hours for administrators from login, and that activity or cookie reissuance
  cannot extend those deadlines. Plan checks for returning after browser restart,
  expiration, and separate administrator limits using controlled time in tests.
  Confirm logout invalidates only the current session and password changes,
  account disabling, or administrator privilege changes invalidate all sessions
  for that account. Plan multiple-session integration checks, including rejected
  replay of invalidated cookies through the BFF and SSR, unaffected sessions after
  ordinary logout, and preservation of the original expiration during validation.
  Plan integration checks for unauthorized calendar access, attempts to obtain
  administrator privileges through public registration or invitation codes, and
  access to calendars belonging to another administrator when implementing the API.
- Confirm database access uses Npgsql and Dapper with hand-written SQL, while
  schema migrations remain the responsibility of DbUp and Entity Framework
  remains excluded.
- Check that the selected build toolchain and startup migration sequence are
  explicit, including runtime dependencies, database readiness, migration failure,
  single-instance deployment, and accepted downtime. Confirm DbUp with SQL
  scripts is selected and Entity Framework is excluded.
- Confirm DbUp uses explicit transaction-per-script configuration and the
  documentation describes failure, restart, and documented non-transactional
  exceptions, with planned PostgreSQL checks for rollback and journal behavior.
- Confirm migration files are numbered embedded resources with stable identities,
  published scripts stay unchanged, and CI checks against prior releases reject
  edits, deletions, and renames. Explain the standard journal's role and absence
  of runtime content checksums, with planned ordering and packaging checks.
- Verify concrete version claims against dated primary sources; do not claim
  LTS support for dependencies whose maintainers do not provide it. Confirm the
  accepted TanStack Start Release Candidate exception is documented together
  with its version-pinning and security-update requirements.
- Verify relative documentation links and Markdown diagram syntax, and run
  `git diff --check` for whitespace errors.
- Confirm that the root README remains project documentation and that the diff
  contains only the intended documentation changes. Application runtime tests
  are not applicable to this documentation-only task.
- Mark this plan `Implemented` only after the complete architecture and diagrams,
  implementation rule files, agent-resource links, and root README overview/link
  have been written and all documentation checks have passed.
