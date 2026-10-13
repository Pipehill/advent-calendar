# Frontend verification

Last updated: 2026-10-13

## Implementation and toolchain

Plan 00006 is implemented on `feature/calendar-frontend`, based on `main` at
`f38bd4e`.

The pinned stack uses React 19.3.0, Start 1.169.1, Router 1.170.44, Query 5.104.2,
tRPC 11.19.0, Paraglide 2.27.0, Vite 8.3.4, TypeScript 7.0.2, Vitest 5.0.4,
Tailwind 4.3.3, pnpm 12.11.2 and Biome 2.5.15. Stable Nitro 2.13.4 packages the
Start fetch handler and copies the client assets through its build API.
Exact package metadata/peer requirements were checked against the official npm
registry; frontend packages and pnpm tooling have retained lockfiles.

The shared Node 24.14.0 and .NET 10.0.401 image digests are reused from the backend
toolchain. Frontend CI action SHAs were verified through the official upstream
repositories. Builds regenerate both NSwag language outputs and Paraglide
messages. Generated code and route trees are excluded from Git and authored-code
analysis. The generator-owned pnpm lockfile is validated by frozen installs,
instead of applying authored-YAML formatting rules to generated content.

## Verification results

- 21 Vitest checks passed for generated wire values, input validation, error/field
  mapping, network/HTTP retries, deadline expiry, cancellation, display-only BFF
  payloads, request-local locale state, Norwegian default and trace context.
  Cancellation includes an already-cancelled caller and an active transport;
  Nitro's Node adapter propagates client disconnects through the request signal.
- Windows host production build and explicit TypeScript checking passed.
- Windows Edge browser smoke checks passed against the built Node server and
  PostgreSQL-backed API: sample redirect, exactly 24 ordered static doors,
  hydration without repeated reads, English selection/reload and Norwegian
  switching, original user-authored titles, actual browser/tRPC HTTP retrieval,
  two distinct persisted calendars, translated invalid/missing states, no browser
  direct-API requests, no hydration/asset errors and 375 px layout without overflow.
- Screenshots and created test-calendar IDs are in ignored
  `quality-reports/frontend/`; the browser workflow creates two local test calendars.
- 57 developer-tooling tests passed with one existing skip; no failures.
- All 42 backend PostgreSQL integration tests passed with the documented Podman
  pipe and `TESTCONTAINERS_RYUK_DISABLED=true`. An initial run without the
  rootless settings was stopped and its test helper cleaned up; a correctly
  configured rerun passed. Test databases remain separate from development data.
- The Podman/Docker Compose provider built the frontend image from source without
  dependencies, generated clients/translations or a route tree. Three-container
  startup/readiness, repeat launcher execution and calendar persistence across
  stop/start/rebuild passed. The final stack is reachable at localhost:3000/8080.
- Windows host development with PostgreSQL-only Compose, `dotnet watch` and Vite
  passed the same browser smoke. Concurrent SSR requests for different IDs and
  languages returned the correct data and correlated BFF/API trace IDs.
- A real host API outage returned the localized unavailable page without sample
  data. Restoring the full stack preserved both test calendars and the local seed.
- Setup and doctor passed with the explicitly selected Node 24 executable.
  Five repository-snapshot regression tests passed. Pinned Biome fixtures rejected
  invalid TypeScript, TSX and CSS and accepted corrected versions.
- A clean saved-source checkout passed frozen installation, dual-language
  generation, frontend tests/type checking/production build/lint and backend
  consumer compilation, without generated output or dependencies copied in.
- Browser bundles were inspected for the generated backend client and API
  configuration; neither is present. Browser requests only target the BFF.

The initial browser smoke identified missing client assets in the Nitro package.
Adding `copyPublicAssets` and normalizing Windows paths corrected the defect;
the final smoke checks assets as well as page errors. The language selector
intentionally reloads the page; verification waits for that navigation.

The Linux container build additionally exposed Tailwind scanning build artifacts
when `.gitignore` was absent, producing different client and SSR stylesheet names.
Explicit `@source` directories correct this; container browser smoke checks the
final CSS/JS resources and layout as well as hydration.

## Dependency audit

The direct h3 dependency was updated from 1.15.4 to the latest stable 1.x patch,
1.15.11, after audit identified known vulnerabilities. The final production-only
audit reports zero vulnerabilities. Full dependency audit still reports two high
advisories without a patched release: build-only `node-forge@1.4.0` (Nitro's
development HTTPS helper) and `braces@3.0.3` (Nitro's build globbing). The runtime
image contains only `.output`, not the build toolchain. Record these findings
explicitly; do not treat a clean production audit as a clean full audit.
Quality tooling's updated npm lockfile audit reports zero vulnerabilities.

## Advisory code health and limitations

The original baseline was preserved before measuring unmodified `f38bd4e`.
jscpd 5.4.1 used the same configuration before/after; MCP snippet and clone
inspection, refresh-before-statistics, and final CLI comparison are recorded in
ignored `quality-reports/`. A duplicate pair of retry tests was consolidated into
a parameterized test while preserving both network and HTTP cases.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Overall health | 52.2 | 52.5 | +0.3 |
| Complexity score | 64 | 67.1 | +3.1 |
| Complexity share | 35.8% | 31% | -4.8 percentage points |
| Duplication | 0% | 0% | Unchanged |
| Clones / duplicated lines | 0 / 0 | 0 / 0 | Unchanged |
| Maximum file complexity | 94 | 94 | Unchanged |
| Heuristic dead-code findings | 5 | 8 | +3 |
| Measured files / lines | 43 / 6073 | 62 / 7130 | +19 / +1057 |
| Dead-code coverage | 76% | 79.7% | +3.7 percentage points |

The added heuristic findings are actual entry points: `build-nitro.mjs` runs from
the package build script, `server/entry.mjs` is configured as Nitro's handler, and
`tools/frontend/smoke.mjs` is the documented browser workflow. Existing five
tooling findings are unchanged. These script/configuration callers are not
recognized by the analyzer; the increase remains visible rather than suppressed.
CSS, prose/configuration/lockfiles, generated code and below-threshold inputs do
not contribute to these authored-code scores. CSS is linted by Biome; metric
absence is not evidence of cleanliness. Health values are rounded and advisory.
Raw identities/configuration/scope and reports retain these measurement limits.

Windows/Edge, Windows host workflows and Linux application/quality containers
were exercised. Native macOS/Linux host installation and Docker-engine execution
remain the previously owner-deferred platform follow-ups; Podman execution does
not establish Docker-engine coverage. CI definitions were checked locally and
their action pins verified; no new hosted CI run is claimed without a pushed PR.
The existing OpenAPI validation still emits its four documented advisory warnings.
