# Architecture implementation rules

Apply these rules to application structure, frontend/BFF work, builds, tests,
dependency selection, and diagnostics. See the
[architecture description](../../docs/architecture.md) for rationale and diagrams.
Read [API contracts](api-contracts.md), [data and migrations](data-and-migrations.md),
and [authentication and calendar access](authentication-and-calendar-access.md)
when changing those boundaries; those files own their respective instructions.

## Stack and service boundaries

- Keep application source under root `src/`: backend in `src/backend`, frontend/BFF
  in `src/frontend`, and authored API contracts/generator settings in `src/contract`
  alongside those application folders. Developer tooling remains under `tools/`.

- Use TypeScript, React, TanStack Start, TanStack Router, and TanStack Query for
  the frontend; host the TypeScript BFF in TanStack Start.
- Keep three long-running containers: frontend/BFF, ASP.NET Core C# backend,
  and PostgreSQL. Run browser code in the browser, served by frontend/BFF.
- Use tRPC with `@trpc/tanstack-react-query` between browser and BFF. Keep
  backend HTTP clients and connection configuration in BFF server code.
- Build frontend/BFF with pnpm and Vite; use Nitro on Node.js LTS in production.
  Verify its build output and `node .output/server/index.mjs` start command
  against the pinned toolchain during runnable setup.
- Build the backend with dotnet CLI/MSBuild restore, build, test, and publish.
  Use separate SDK build and ASP.NET runtime Dockerfile stages; package published
  application dependencies and embedded migrations in the runtime image.

## Rendering, UI, and forms

- Default to SSR. Create a QueryClient and mutable request context per server
  request; prefetch initial authorized data through the BFF and hydrate the
  browser cache through TanStack Start's Query integration. Never share mutable
  server query caches or credential headers between requests.
- Use Tailwind CSS through Vite and shadcn/ui components. Maintain and commit
  customized component source; the generated API-code policy belongs to
  [API contracts](api-contracts.md).
- Use TanStack Form with Zod and shadcn/ui for login, registration, and
  administration forms. Reuse compatible form/BFF schemas when inputs match.
  Attach structured server field errors to fields and show submission-wide
  errors separately; client checks do not replace server validation.
- Verify UI/form dependencies together with React, Start, Vite, and Zod,
  including SSR/hydration behavior, when creating runnable setup.
- Follow [calendar access rules](authentication-and-calendar-access.md) for
  protected data, user/session cache changes, access-mode isolation, and refresh.

## Readable developer tooling

- Write scripts under `tools/development/` for humans to read and maintain,
  including Bash, PowerShell, JavaScript modules, and their tests. Use descriptive
  names, explicit control flow, consistent indentation, and whitespace between
  logical steps. Avoid compressed one-line branches, nested ternaries, and long
  expressions that combine discovery, execution, evaluation, and reporting.
- Keep the main setup and doctor workflows visible as ordered, named steps.
  Extract cohesive operations into small functions when this clarifies the flow;
  do not add abstractions merely to shorten code. Use named intermediate values
  and multiline argument arrays or objects for complex commands and diagnostics.
- Add short comments explaining intent, platform constraints, and preservation
  decisions. Do not narrate obvious statements. Apply these conventions when
  adding or changing a local prerequisite and its verification.

## Temporary Linux/macOS installation follow-up

Plan 00003 was accepted on 2026-10-11 with native Linux/macOS installation testing
deferred because test machines were unavailable. When someone runs setup on
Ubuntu/Debian or macOS, investigate any installation failure and fix defects in
the bootstrap, adapters, shared setup/doctor checks, or recovery instructions.
Record the failure, fix, and rerun result in
[developer tooling verification](../../tools/development/verification.md).

After setup, a repeat setup run, doctor, and the quality/hook workflow have been
confirmed on both supported Linux and macOS, record the platform evidence and
remove this temporary rule. A successful run on one platform only clears that
platform's follow-up. Preserve the verification history and the permanent
developer-tooling maintenance rules.

## Builds, environments, and tests

- Adopting or changing a local prerequisite must update developer setup, doctor,
  their shared requirements, developer documentation, and relevant verification
  in the same change. See [developer tooling](../../tools/development/README.md).
  Keep system installation in platform adapters; use shared checks for readiness.
  Record real platform integration evidence separately from simulated tests.

- Use GitHub Actions for CI/CD. Share generation, validation, and build workflows
  between local and CI execution; follow [API contracts](api-contracts.md) for
  generation order and clean-build checks. Run explicit TypeScript type checking
  alongside Vite; transpilation alone is insufficient.
- Use Vitest through pnpm locally and in GitHub Actions for focused frontend/BFF
  unit behavior, including input validation and error translation. Choose runtime
  per test and isolate external dependencies as needed.
- Use xUnit with isolated PostgreSQL Testcontainers for backend API integration
  tests. Apply actual DbUp migrations and exercise Npgsql/Dapper data access,
  request/response behavior, and authored-contract agreement. Require a compatible
  container runtime locally and in CI; isolate test data from development/deployment.
- If end-to-end tests are introduced, use Playwright against the environment
  after deployment. Keep them distinct from unit and API integration tests.
- Provide full local Docker Compose with a named persistent PostgreSQL volume,
  health checks, and readiness dependencies: database, then API after migrations,
  then frontend/BFF. Preserve the API's bounded database connection retries.
- Also support PostgreSQL-only Compose with host `pnpm dev` and `dotnet watch`.
  Generate contracts for development builds and avoid running duplicate application
  services. Use service DNS inside containers and configured localhost/published
  ports from the host. Keep Testcontainers databases separate.
- Retain one deployed instance per container and accepted deployment downtime.
  Resolve production hosting and deployment-stage integration in the deployment
  task; Sliplane is a candidate only.

## Versions and diagnostics

- Always pin GitHub Actions workflow dependencies to immutable SHAs. Repository
  actions and remote reusable workflows must use full 40-character commit SHAs;
  container images, including Docker actions, job containers and services, must use
  `sha256` digests. Tags and branches do not satisfy this rule. Keep the release
  version in a comment beside each action/workflow SHA and verify pins against the
  official upstream repository before adding or updating them.
- Use latest LTS where available; otherwise use latest stable supported compatible
  releases. Do not label every dependency LTS. Pin tools/dependencies, retain
  lockfiles, and check direct/transitive security updates instead of floating latest.
- The digest-pinned MegaLinter quality image may retain its bundled Node/Python
  runtimes even when they are not LTS. This accepted exception is limited to
  quality tooling; contributor host Node and application runtimes follow the
  usual version policy. Record bundled versions in quality reports.
- Preserve the accepted TanStack Start Release Candidate exception with compatible,
  security-patched pinned versions. Recheck dated baselines and compatibility at
  runnable setup; PostgreSQL follows its supported-major policy.
- Emit structured JSON console logs in BFF/API with timestamp, severity, service,
  and request context. Use .NET built-in JSON console formatting and equivalent
  BFF output. Propagate W3C Trace Context, create valid context when absent,
  and include shared request-scoped `traceId` values, including SSR.
- Verify correlation across concurrent requests. Leave full distributed tracing,
  collection/storage, and visualization to observability/operations work.
