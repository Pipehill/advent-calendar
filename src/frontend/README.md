# Calendar frontend

The React/TanStack Start page at `/calendars/<id>` shows a stored title and 24
static numbered doors. `/` redirects to the existing local example calendar.
The browser uses tRPC; the BFF uses the NSwag-generated HTTP client to call the
ASP.NET Core backend, which reads PostgreSQL. API connection settings stay in
server code. The initial calendar is server-rendered and its query cache hydrates
without a duplicate request. Door contents are omitted from this page's BFF data.

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
$env:LocalSeed__Enabled = 'true'
$env:ASPNETCORE_URLS = 'http://localhost:8080'
node tools/backend/check.mjs generate
./.quality-cache/dotnet/dotnet.exe watch --project src/backend/Calendar.Api
```

The backend's development connection string uses localhost and database port
5432. Override `ConnectionStrings__Calendar` for another database port or settings.
On macOS/Linux use the saved/pinned `dotnet` executable without `.exe`, and set
the same environment variables with `export`.

In a third terminal, run:

```text
node tools/frontend/check.mjs dev
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
node tools/frontend/check.mjs install
node tools/frontend/check.mjs check
```

The frozen install uses `pnpm-lock.yaml`. Generation validates authored OpenAPI
and emits both C# and TypeScript contracts without a running API, then compiles
translations. Builds/dev/tests regenerate first; Vite generates the route tree.
Generated output, route trees and build artifacts remain untracked. CI uses the
same commands. `check` runs Vitest, production build with explicit TypeScript
checking, and Biome. Individual modes are `generate`, `test`, `typecheck`, `build`,
`lint` and `dev`. Code quality hooks use the same pinned Biome configuration.

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
selection; URLs remain `/calendars/<id>`. Request-local language state avoids
mixing concurrent readers' languages.

Translate interface text, labels/prompts and user-facing errors. Calendar titles
and door contents remain exactly as authored; translations do not add language
variants to persistence. Project documentation and code comments remain English.

## Browser verification

With the complete stack running:

```text
node tools/frontend/smoke.mjs
```

This Playwright smoke workflow is separate from Vitest/API integration tests and
runs against an already started environment. It verifies stored calendars, SSR
hydration, actual browser/tRPC communication, language selection, translated
errors, unchanged user-authored titles, static doors and a narrow layout.
It creates two test calendars through the existing API and records their IDs,
results and screenshots under ignored `quality-reports/frontend/`.

Windows uses installed Edge by default. Elsewhere install Playwright Chromium
with `pnpm exec playwright install chromium` from `src/frontend`; use
`BROWSER_CHANNEL` to select another installed channel. `FRONTEND_URL` and `API_URL`
override environment addresses. See [verification](verification.md) for actual
results, dependency audit findings and platform coverage.
