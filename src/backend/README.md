# Calendar backend

The protected API creates owned calendars for assigned recipients, lists the
owner's calendars and saves numbered door content and persisted layouts.
Calendar and account/authentication controllers implement generated
contracts and consume service interfaces. Services apply business and authorization
rules through repositories, which use Npgsql/Dapper with parameterized SQL.
The frontend/BFF
implements creation, administration and full owner preview. Backend authentication,
user management and owner-only calendar administration are implemented. Recipient
viewing and scheduled opening remain future features. Owner calendar endpoints
require an unrestricted current calendaradmin session. Dedicated system-wide
calendar list/preview endpoints require an unrestricted current superadmin and
grant no writes. See the agreed
[authentication design](../../docs/architecture.md#authentication-and-calendar-access).
Recipient authorization/opening and production database hardening remain
production gates.
See [backend authentication](authentication.md) for the protected API, manual
superadmin provisioning, temporary-password handover, session lifecycle and key
configuration. The frontend/BFF implements login, password changes, logout and
session-protected personal pages and authorized account creation/maintenance lists.

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
calendars through the protected `POST /calendars` and use the returned ID for
owner administration. Migration 0004 removes only the legacy ownerless test
calendars/doors once, then adds required ownership, recipient, stored year,
background and layout/order constraints. Accounts, credentials, sessions and
unrelated data survive. Journaled repeat startup preserves new calendars.
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
Both routes allow anonymous access and return `text/plain`: `Healthy` on success,
or `Unhealthy` for failed readiness. The OpenAPI `health` group generates
`HealthControllerBase`, implemented by `HealthController`; the `calendars` group
and `CalendarsController` own calendar creation, retrieval, listing and updates. The frontend
retains a single generated `CalendarClient` for all API groups.

## Manual API examples

Open [calendars.http](Calendar.Api/calendars.http) in an HTTP-capable editor.
Use an unrestricted calendaradmin cookie, its principal-bound CSRF token and an
assigned calendar-user UUID from the authenticated account workflow. The file
covers creation (201 with `Location`), owner read/list, door/layout saves,
validation and unknown IDs. Missing/revoked sessions return 401, excluded roles
403 and unknown/foreign calendars 404. All protected successes/errors use no-store.

Creation accepts `title`, `recipientId` and `background` (`woodland`, `sleigh`,
`playtime`, `aurora`). Ownership comes from the session. The service stores the
current Europe/Oslo year and exactly 24 doors; reads never recalculate the year.
Calendar titles trim surrounding Unicode whitespace before the 1-100-code-point
limit. Door titles allow 0-50 and messages 0-5000 code points without trimming;
empty fields support preparation. Missing/null/NUL/invalid Unicode and unknown
properties are rejected. Plain text and line breaks are preserved.

`PUT /calendars/{id}/doors/{number}` accepts `title` and `text` and preserves other
doors/settings. `PUT /calendars/{id}/layout` accepts `chronological` or `random`;
the latter generates and stores a permutation once per explicit selection.
Reads and preview reuse it. `GET /calendars?offset=0&limit=20` returns ownership-
scoped metadata and total count. The full GET response is an owner-only
administration/preview contract, never a recipient payload. Services recheck
actor/session, ownership and recipient role/responsibility under security lock
800008 in the committing transaction shared with account maintenance. No recent
password check applies to calendar operations. Writes never retry automatically.

Both calendar detail and list responses include `recipientName` and
`recipientUsername`, read from the stored recipient account rather than inferred
from a selectable-user list. `PUT /calendars/{id}/recipient` accepts `recipientId`
and returns the updated calendar. Only the owner can assign an existing ordinary
user under that owner's fixed responsibility, using the same recipient eligibility
as creation. Validation and persistence share the security transaction; account
responsibility, calendar ownership, doors and layout remain unchanged.

`GET /administration/calendars?offset=0&limit=12` lists all calendars with bounded
paging (offset 0-1000000, limit 1-100), total count and stable newest-first order
(`created_at DESC, id`). Each row includes ID/title/year and both stored account
IDs with current names/usernames, even if those accounts are disabled or have
changed role. Parameterized joins exclude door content and security metadata.
`GET /administration/calendars/{id}/preview` returns the full saved calendar,
including future doors, without writes or modification-time changes. The service
rechecks the actor's current superadmin role and unrestricted session under the
shared security transaction/lock before lookup. These endpoints need no recent
password verification; excluded roles return 403, missing/revoked sessions 401
and an authorized unknown calendar 404. All responses/errors are no-store,
including pre-controller authentication and binding errors. Superadmins remain
denied on owner read/list/create/door/layout/recipient endpoints.

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
