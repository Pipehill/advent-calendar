# Architecture implementation rules

Apply these rules to application structure, frontend/BFF work, builds, tests,
dependency selection, and diagnostics. See the
[architecture description](../../docs/architecture.md) for rationale and diagrams.
Read [API contracts](api-contracts.md), [data and migrations](data-and-migrations.md),
and [authentication and calendar access](authentication-and-calendar-access.md)
when changing those boundaries; those files own their respective instructions.

## Stack and service boundaries

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

## Builds, environments, and tests

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

- Use latest LTS where available; otherwise use latest stable supported compatible
  releases. Do not label every dependency LTS. Pin tools/dependencies, retain
  lockfiles, and check direct/transitive security updates instead of floating latest.
- Preserve the accepted TanStack Start Release Candidate exception with compatible,
  security-patched pinned versions. Recheck dated baselines and compatibility at
  runnable setup; PostgreSQL follows its supported-major policy.
- Emit structured JSON console logs in BFF/API with timestamp, severity, service,
  and request context. Use .NET built-in JSON console formatting and equivalent
  BFF output. Propagate W3C Trace Context, create valid context when absent,
  and include shared request-scoped `traceId` values, including SSR.
- Verify correlation across concurrent requests. Leave full distributed tracing,
  collection/storage, and visualization to observability/operations work.
