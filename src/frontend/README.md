# Calendar frontend

The React/TanStack Start landing page at `/` welcomes visitors with a warm
Norwegian Christmas illustration, Norwegian/English text, and a login link at the
top right. It renders without reading calendar data. The illustration is served locally; see its
[generation record](illustration.md).

The page at `/calendars/<id>` shows a stored title and 24 static numbered doors.
Create a calendar through `POST /calendars` on the backend and open
`/calendars/<id>` using the returned ID. Startup does not create sample calendars.
The browser uses tRPC; the BFF uses the NSwag-generated HTTP client to call the
ASP.NET Core backend, which reads PostgreSQL. API connection settings stay in
server code. The initial calendar is server-rendered and its query cache hydrates
without a duplicate request. Door contents are omitted from this page's BFF data.

## Sign-in and personal pages

`/login` accepts username and password through a TanStack Form/Zod form.
Successful login opens `/my-page`, or `/change-password` for a restricted temporary
session. Own-password change revokes all sessions and requires a fresh login.
Protected pages include logout. Forms use maintained shadcn/ui inputs,
accessible labels/errors, password autofill and Norwegian/English messages.

The personal page displays the backend-validated name and a circle with initials.
Calendar users see the initial calendar placeholder. Calendaradmins can create
calendar users and list/reset their assigned ordinary accounts. Superadmins see
all accounts and can create either assignable role, reset nonsuperadmin passwords,
enable/disable accounts and change between calendaradmin/calendar-user roles.
Superadmin targets remain view-only. Lists show name, username, localized role
and enabled state, with pagination and refresh. Calendar creation remains unavailable.

`/create-account` is a dedicated, session-protected TanStack Form/Zod creation page.
Superadmins select a responsible calendaradmin for ordinary users; calendaradmin
responsibility is derived by the backend. Administrator options load across backend
pages and are revalidated on submission. After creation, the BFF locates the returned
ID in the authorized ordering so the new row appears even on a different page.
The success notice and focus ID use request/router-local memory; secrets never
enter route data, query keys, URLs or browser persistence.

Maintenance forms identify the account and operation before confirmation. Password
reset and promotion take a different temporary password, expire it after 30 minutes,
require recipient password change and revoke target sessions. Credentials must be
handed over privately to identity-verified recipients. Status and role changes also
revoke target sessions. Enabling never restores revoked sessions, and disabling a
calendaradmin leaves their users enabled. Responsibility stays fixed across role
changes; first demotion requires assignment and attached ordinary users block demotion.
Profile editing, deletion and calendar access are separate work.

Sensitive operations require backend recent password verification. An explicit
`verificationRequired` error opens a separate acting-administrator password field;
the next explicit confirmation reauthenticates and submits the operation. Other
forbidden errors remain access denials. Incorrect verification does not discard an
otherwise valid login, and successful verification never extends its fixed deadline.
Mutations refresh CSRF individually, disable pending forms and never retry writes.

The BFF relays only `advent.auth`, `advent.csrf` and `X-CSRF-TOKEN`; backend
`Set-Cookie` headers remain separate with their original attributes. CSRF tokens
are fetched outside the query cache before mutations and refreshed after login.
SSR and every protected navigation inspect the session directly against the
backend, bypassing cached roles. Authentication responses/errors and protected
HTML/hydration carry no-store. Returning tabs revalidate; session changes discard
query caches and perform a document navigation to clear router data and inputs.
Account lists use zero stale/garbage-collection times and reauthorize each read.
Credentials and tokens never enter URLs, localStorage or SSR hydration.

Calendar authorization/assignment and production database hardening remain
separate production gates. No startup fixture accounts are provisioned.

## Run locally

After developer setup, run `./run-local.ps1` on Windows or
`bash run-local.sh` on macOS/Linux from the repository root. It builds the backend
image, runs backend integration and frontend unit tests, starts backend/PostgreSQL
containers, waits for API readiness and starts Vite in the current terminal.
Frontend changes use hot reload; backend changes require another launch to rebuild.
Open `http://localhost:3000`; the API remains at `http://localhost:8080`.

```powershell
# Entire application in containers, including the built frontend.
./run-local.ps1 --frontend=container

# Quick repeat development run using the existing backend image.
./run-local.ps1 --skip-build --skip-test
```

The Bash launcher accepts the same flags. `--frontend=dev` explicitly selects the
default Vite mode; `--help` lists available options. `--skip-build` only skips
application image builds and fails if a required image is missing. Tests and
dev contract generation can still compile source. `--skip-test` skips both test
suites. Container mode builds both images unless skipped and exits after readiness.

`FRONTEND_PORT`, `API_PORT` and `DATABASE_PORT` override published host ports.
Vite uses `FRONTEND_PORT` with strict port selection, binds to localhost and calls
the API at the selected `API_PORT`; container BFF calls `http://backend:8080`.
`LOCAL_START_TIMEOUT_SECONDS` bounds each application's readiness wait (default
120 seconds). Reruns preserve the existing database and service identities.
Switching to dev stops the frontend container before Vite starts. Stop a running
Vite session with Ctrl+C before switching to container mode; the launcher never
kills another host process to free an occupied port. Ctrl+C leaves backend/database
running so another frontend run can reuse them.
Use `podman compose stop` or `docker compose stop` to stop the stack without
removing the database volume.

## Host backend development

For backend hot reload as well, start only PostgreSQL in Compose, avoiding
duplicate application instances. Stop the launcher's Vite session first:

```powershell
podman compose stop frontend backend
podman compose up --detach database
```

Use `docker` instead of `podman` when it is the selected runtime. In another
terminal, start the backend with the repository's pinned SDK:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://localhost:8080'
node tools/development/dotnet.mjs watch --project src/backend/Calendar.Api
```

The backend's development connection string uses localhost and database port
5432. Override `ConnectionStrings__Calendar` for another database port or settings.
On macOS/Linux use the saved/pinned `dotnet` executable without `.exe`, and set
the same environment variables with `export`.

In a third terminal, run:

```text
node tools/frontend/pnpm.mjs run dev
```

This uses repository-local pnpm. With pnpm 12.11.2 on PATH, `cd src/frontend` and
`pnpm dev` is equivalent. The frontend calls `http://localhost:8080` by default;
set `BACKEND_API_URL` for another API address and `BACKEND_DEADLINE_MS` for the
total read deadline (default 10000 ms). Compose uses `http://backend:8080`.
Vite uses port 3000 with strict port selection. Restart after changing server
environment settings.

## Contracts, builds and tests

Run commands from the repository root:

```text
npm ci --prefix tools/frontend
npm ci --prefix src/contract
node tools/development/dotnet.mjs tool restore
node tools/frontend/pnpm.mjs install --frozen-lockfile
node tools/frontend/pnpm.mjs run check
```

The frozen install uses `pnpm-lock.yaml`. Generation validates authored OpenAPI
and emits both C# and TypeScript contracts without a running API, then compiles
translations for standalone tests. Builds/dev let the Paraglide Vite plugin own
translation generation; Vite also generates the route tree. The combined `check`
generates contracts once, then runs the unit tests and application build directly.
Generated output, route trees and build artifacts remain untracked. CI uses the
same commands. `check` runs Vitest, production build with explicit TypeScript
checking, and Biome. Individual package scripts are `generate`, `test`, `typecheck`,
`build`, `lint` and `dev`. Invoke them with `node tools/frontend/pnpm.mjs run <script>`
or `pnpm run <script>` from `src/frontend` with pinned pnpm on PATH. Internal
`test:unit` and `build:app` require generated contracts; prefer `test`/`build` for
standalone runs. Code quality hooks use the same pinned Biome configuration.

The production build packages Start's fetch entry and client assets using stable
Nitro 2.13.4. It deliberately uses Nitro's build API instead of the Nitro 3 beta
Vite plugin. From `src/frontend`, run `node .output/server/index.mjs`; `HOST` and
`PORT` configure the Node server. The container runs the same output as user `node`.
The frontend readiness endpoint probes API readiness with a bounded timeout.

## Interface languages

Paraglide JS generates translations from `messages/nb.json` (Norwegian Bokmål)
and `messages/en.json`. Norwegian is the default, independent of browser language.
The language selector writes `PARAGLIDE_LOCALE` and reloads the current page so
SSR and browser hydration agree. The cookie allows the server to remember the
selection; the current URL stays unchanged. Request-local language state avoids
mixing concurrent readers' languages.

Translate interface text, labels/prompts and user-facing errors. Calendar titles
and door contents remain exactly as authored; translations do not add language
variants to persistence. Project documentation and code comments remain English.

## Browser verification

With the complete stack running:

```text
node tools/frontend/smoke.mjs
```

This Playwright smoke workflow uses Node's test runner separately from Vitest/API
integration tests and runs against an already started environment. Eight named
scenarios each get a fresh browser context, with page/hydration/asset checks and
cleanup after every test. It verifies the landing page,
login navigation, exact welcome text, mobile layout, stored calendars, SSR
hydration, actual browser/tRPC communication, language selection, translated
errors, unchanged user-authored titles, static doors and a narrow layout.
It creates its own calendar fixtures through the existing API, including two
distinct calendars whose IDs are recorded in `calendars.json`. Test results are
saved in `smoke.xml` (JUnit), and screenshots are saved under ignored
`quality-reports/frontend/`. A failed test or browser startup exits nonzero.

Windows uses installed Edge by default. Elsewhere install Playwright Chromium
with `pnpm exec playwright install chromium` from `src/frontend`; use
`BROWSER_CHANNEL` to select another installed channel. `FRONTEND_URL` and `API_URL`
override environment addresses. See [verification](verification.md) for actual
results, dependency audit findings and platform coverage.

The authentication browser suite starts its own disposable PostgreSQL database,
host API and built production Nitro server, and removes its container afterwards:

```text
node tools/development/dotnet.mjs restore tools/frontend/browser-fixture/BrowserFixture.csproj --locked-mode
node tools/development/dotnet.mjs build tools/frontend/browser-fixture/BrowserFixture.csproj --no-restore -c Release
node tools/frontend/pnpm.mjs run build
node --test tools/frontend/browser/authentication.test.mjs
```

It uses the selected container runtime/SDK and installed Edge or Playwright
Chromium. Fixture credentials remain in runner memory; only isolated `browser_*`
databases are accepted. The suite covers roles, real cookies/CSRF, temporary
credentials, creation/maintenance, list isolation, pagination, recent verification,
logout/replay, revoked-session SSR and the existing eight public/calendar smoke tests.
Each independent scenario replaces the isolated API process to reset aggregate
request budgets while preserving database-backed account/session state and the
production rate-limit settings. Reports/screenshots are kept under
`quality-reports/plan00013/`. It is separate from normal unit/API tests.
