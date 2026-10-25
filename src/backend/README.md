# Calendar backend

The initial API creates calendars from a title and retrieves their persisted
contents. Calendar and account/authentication controllers implement generated
contracts and consume service interfaces. Services apply business and authorization
rules through repositories, which use Npgsql/Dapper with parameterized SQL.
The frontend/BFF
already displays persisted calendars. Backend authentication and user management
are implemented; calendar authorization, editing and scheduled opening remain
future features. Current
calendar endpoints are anonymous. See the agreed
[authentication design](../../docs/architecture.md#authentication-and-calendar-access).
Calendar authorization and
production database hardening must be completed and verified before production.
See [backend authentication](authentication.md) for the protected API, manual
superadmin provisioning, temporary-password handover, session lifecycle and key
configuration. The frontend/BFF implements login, password changes, logout and
session-protected personal pages, including the superadmin read-only account list.

## Local containers

Run developer setup, then `./run-local.ps1` on Windows or
`bash run-local.sh` on macOS/Linux from the repository root. The launcher uses the saved
Docker/Podman selection, builds current source including contract validation and
generation, runs backend integration and frontend unit tests, starts PostgreSQL
and the API, and prints the URL after readiness. The frontend runs with Vite hot
reload by default; `--frontend=container` builds and starts it in a container.
`--skip-build` reuses existing application images; tests and dev contract generation
can still compile source. `--skip-test` skips both test suites. Use both for a
quick repeat launch. Ctrl+C stops Vite and leaves database/API containers running.
Use `QUALITY_CONTAINER_RUNTIME` for an explicit engine override, `API_PORT` for
the API port and `DATABASE_PORT` for the host database port. Ports bind to localhost.

The stable Compose project `advent-calendar` and named volume retain calendars
across repeat launches and stops. With the selected runtime, inspect and stop:

```bash
podman compose -f compose.yaml -p advent-calendar logs --tail 100 backend
podman compose -f compose.yaml -p advent-calendar ps
podman compose -f compose.yaml -p advent-calendar stop
podman compose -f compose.yaml -p advent-calendar down
```

Replace `podman` with `docker` when selected. `down` preserves the named volume;
do not add `--volumes` unless intentionally deleting development data. A failed
launch exits nonzero; readiness timeout prints service status and recent logs.
The timeout defaults to 120 seconds after Compose returns, configurable through
`LOCAL_START_TIMEOUT_SECONDS` (1-600). Compose build/start reports engine errors,
provider failures and port conflicts; it does not reset existing services or data.

## Host development

Start only PostgreSQL with `podman compose -f compose.yaml up -d database`.
Stop the backend container first when switching to host development:
`podman compose -f compose.yaml stop backend`. Configure the host connection
through `ConnectionStrings__Calendar` when using a nondefault database port.

Use the SDK installed by setup (or a matching SDK on PATH):

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
./.quality-cache/dotnet/dotnet.exe watch --project src/backend/Calendar.Api --urls http://localhost:8080
```

```bash
ASPNETCORE_ENVIRONMENT=Development \
  .quality-cache/dotnet/dotnet watch --project src/backend/Calendar.Api --urls http://localhost:8080
```

If setup found an existing SDK, use its saved `dotnet` executable instead. NSwag
regenerates before compilation, including watch builds. For direct dotnet commands,
make the selected SDK directory available on PATH so MSBuild invokes that SDK.

## Configuration and migrations

`appsettings.json` has a local host database connection. Nonlocal deployments must
supply their connection string. The Compose file is exclusively for local
development and selects `Development`.

Startup applies migrations without creating calendars or sample data. Create
calendars through `POST /calendars` and use the returned ID to retrieve them.
Startup, migrations, setup and deployment must never seed user accounts.
The superadmin provisioning path is an intentional
manual database operation using an offline password-hash tool that cannot connect
to the database or create an account.

Startup retries database connection at most `Database__StartupAttempts` times
(default 10; allowed 1-30), with one-second waits and a three-second connection
timeout in shipped configuration. DbUp executes numbered embedded SQL resources
in deterministic order with its PostgreSQL `schemaversions` journal and one
transaction per script. Failure prevents HTTP startup and exits nonzero. Published
migrations must remain unchanged; future corrections use new numbered scripts.
Prior-release integrity checks and deployment integration await release tooling.

`GET /health/live` checks the process; `GET /health/ready` requires migrations and
a current database query within two seconds. During a database outage, liveness
remains 200 and readiness returns 503. Readiness never precedes migration success.

## Manual API examples

Open [calendars.http](Calendar.Api/calendars.http) in an HTTP-capable editor.
Change `baseUrl` and copy an ID returned by POST into `calendarId`.
The file covers creation (201 with `Location`), retrieval (200), an
invalid title (400), and an unknown UUID (404). Malformed UUIDs return 400.

```bash
curl -i -H 'Content-Type: application/json' \
  -d '{"title":"  My calendar  "}' http://localhost:8080/calendars
curl -i 'http://localhost:8080/calendars/<id-returned-by-post>'
```

Only `title` is accepted. It is trimmed before the 1-100 Unicode code point limit;
Norwegian letters and simple emoji count as one, combining marks and compound
emoji components separately. Null/missing/blank/overlong titles and unknown input
properties return ProblemDetails with structured errors and a request trace ID.
NUL is rejected because PostgreSQL text cannot store it. Service-generated UUIDs
are v4; the 24 doors are numbered 1-24 and have non-null empty text. Timestamps
are identical UTC instants, normalized to PostgreSQL microsecond precision before
both persistence and the creation response. GET returns stored text and timestamps.

## Contract, build and tests

Exact pins are committed in `global.json`, `.config/dotnet-tools.json`, project
files and package lockfiles. Generated code under `Calendar.Api/generated` is
ignored; clean builds require no generated output or running API. The authored
OpenAPI 3.0.3 document and NSwag System.Text.Json settings are under the sibling
`src/contract/` directory. Backend application and tests live in `src/backend/`;
frontend source belongs in `src/frontend/` and shares the same authored contract.

After setup, use the same commands as GitHub Actions:

```bash
npm ci --prefix src/contract
dotnet tool restore
dotnet restore src/backend/Calendar.slnx --locked-mode
dotnet build src/backend/Calendar.slnx --no-restore -c Release
dotnet test src/backend/Calendar.slnx --no-build -c Release
dotnet publish src/backend/Calendar.Api --no-build --no-restore -c Release -o src/backend/publish
dotnet format src/backend/Calendar.slnx --verify-no-changes --no-restore
```

`dotnet build` validates OpenAPI and generates both consumers through
`src/contract/Contract.proj` before API compilation. Generate without building with
`dotnet msbuild src/contract/Contract.proj -t:GenerateContract`. The generator is
restored once during setup, rather than during each generation/build. Commands
with `--no-build` consume the preceding successful build. Standalone publish/test
can build with `-p:RestoreLockedMode=true` instead.

When the pinned SDK is private or `DOTNET_EXE` is set, replace the `dotnet` prefix
with `node tools/development/dotnet.mjs`. This selector forwards native arguments
and the current working directory; it contains no build workflow. With a matching
SDK on PATH, the native commands above are identical to CI. `dotnet format` checks
SDK formatting/analyzers without changing files. Shared repository
quality checks additionally run CSharpier 1.3.0 and SQLFluff 4.3.0 offline against
authored code; generated output and build artifacts are excluded.

xUnit uses PostgreSQL Testcontainers with the actual embedded migrations. Test
databases are disposable and isolated from the persistent development volume.
For rootless Podman, set `TESTCONTAINERS_RYUK_DISABLED=true`; fixture disposal still
removes test containers, but an abruptly terminated run may require manual cleanup.
The local launcher derives the local Podman endpoint and rootless reaper setting
for its test subprocesses without changing the shell. Explicit `DOCKER_HOST` and
`TESTCONTAINERS_RYUK_DISABLED` settings take precedence. Remote Podman connections
require an explicit test endpoint. Direct test commands still use the shell settings.
On this Windows Podman machine, tests use
`DOCKER_HOST=npipe://localhost/pipe/podman-machine-one`. Replace the machine name
with your selected machine's pipe. Docker Desktop normally requires no override.
Linux/macOS endpoint setup follows the
[Testcontainers runtime guidance](https://dotnet.testcontainers.org/supported_docker_environment/).

See [verification evidence](verification.md) for actual runtime coverage and
remaining platform limitations.
