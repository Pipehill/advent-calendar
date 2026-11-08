# Frontend verification

Last updated: 2026-11-08

## 2026-11-08: Superadmin calendar overview and read-only preview

All **163 frontend/BFF unit tests**, explicit TypeScript checking, production
Vite/Nitro packaging, full MegaLinter/custom repository checks, and the production
dependency audit pass. npm reports **no known production vulnerabilities**.
Backend Release build, publish, formatting/analyzers and all **245 isolated
PostgreSQL integration tests** pass. No dependencies or migrations changed.

New browser scenarios use the existing isolated PostgreSQL, production API/Nitro
and Windows Edge lifecycle. They exercise accessible Users/Calendars tabs and
one mounted panel, system-wide identity/paging/counts, loading/error/retry/empty
states, keyboard preview, all 24 doors in both saved layouts, both interface
languages, unchanged Unicode/plain-text content and 320/1280px layouts. They also
exercise API/BFF write denials, foreign/anonymous/restricted-session SSR,
revocation, logout replay and account switching. Screenshots are retained under
ignored `quality-reports/plan00017/`.

All **74 production browser scenarios** pass, including the scenario running
**eight public/calendar smoke scenarios**, with no page/hydration errors.
An initial run exposed shared test credentials changed by earlier account-reset
scenarios; the new scenarios now use an untouched account. That initial run was
also invalidated by a concurrent frontend rebuild. Final browser evidence uses
one completed, unchanged production build. Cache review added a regression test
and fix to clear protected data before restricted-session password-change redirects.

Advisory comparison against the preserved main baseline on Windows:

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Overall health | 89.4 / 90.8 | 53.2 / 54.1 |
| Complexity score / share | 83.2 / 85.8; 12.1% / 9.7% | 56.4 / 57.3; 46.4% / 44.8% |
| Complex lines / maximum file complexity | 1581 / 1374; 75 / 75 | 3683 / 3691; 227 / 228 |
| Duplication | 0.641026% / 0.569740% | 0.151324% / 0.145613% |
| Clones / duplicated lines | 10 / 10; 84 / 81 | 2 / 2; 12 / 12 |
| Dead-code score / share | 89.0 / 89.8; 0.6% / 0.5% | 27.7 / 28.6; 16.7% / 16.2% |
| Heuristic findings / dead lines | 2 / 2; 29 / 29 | 8 / 8; 1276 / 1285 |
| Dead-code analysis coverage | 39.8% / 40.9% | 96.4% / 96.5% |
| Analyzed files / lines | 120 / 127; 13104 / 14217 | 51 / 52; 7930 / 8241 |

**Tooling maximum complexity regresses from 227 to 228**, and complex lines rise
by eight despite a lower share. The added fixture bridge in
`authentication.test.mjs` lets the isolated system tests revoke persisted sessions
without embedding database setup in every case. New feature scenarios live in
their own module; shared cookie/logout helpers remove the introduced clone.
The existing test-only-fixture heuristic now counts nine additional lines in
`calendar-fixture.mjs`, although both helpers have real test callers. These are
retained test-support behaviors, not unused application code. Shared list framing,
pagination and authorization-failure handling remove avoidable UI duplication;
the remaining added C# overlap is the declarative unauthorized-session matrix.
No new heuristic findings remain. Denominator growth also contributes to improved
shares, so absolute counts are reported independently.

jscpd **5.4.1** uses identical scopes and configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Baseline commit: `3aa7ca5a968413a93fcbc2c986c51db246a23640`.
Application source SHA-256 changes from
`e42a5b17bdd129f4a343e05d9baba1341d115ae3aa16964840a03c6cbb0b2e35`
to `64384f50b016d050a983572edf79659023b3c26c0bac4e15e55fdff8b453a67d`;
tooling changes from
`bb8d0a9a148ac100de0f1e58ba1af7dbcd911a38368844aa82c00277e2acc1d8`
to `afaa38d5e7c9f37874546cf2371dbd4389c6e4faa3f45d95e91edabfa3feb756`.
Raw identities, MCP schema/refresh/statistics and the whole-repository reference
are retained under `quality-reports/health/`; hook receipts and committed-head PR
comparisons remain separate. Analysis is partial and heuristic. Physical-device,
screen-reader and native Linux/macOS coverage remain outside this Windows run.
The inherited Vite-development language-switch issue and production recipient/
database-hardening gates remain deferred.

## 2026-11-08: PR 43 quality regression follow-up

Repeated calendar submission guards and localized field-error mapping now share
small implementations. Recipient/responsible selectors share account options;
their existing labels, selection, accessibility and focus behavior are preserved.
The browser suite registers separate recipient, creation/list, editing and access
modules within its existing isolated production-stack lifecycle. No original
scenario actions or assertions were removed.

All **60 production browser scenarios** passed on Windows/Edge, including the
scenario running **eight public/calendar smoke scenarios**. This complete rerun
also verifies existing account creation/maintenance through the shared options,
both languages, mobile controls, recipient persistence/cancel/field errors,
protected caching, SSR/hydration, repeated pending submissions and explicit retry.
All **124 frontend/BFF tests**, frontend lint, production Vite/Nitro build with
explicit TypeScript checking and .NET formatting/analyzers passed. Nitro's first
build hit the filesystem sandbox's home-directory readlink restriction; the build
passed with the required filesystem access, without a source workaround.

The avoidable application duplication and tooling health regressions are removed:
application duplicated lines/clones fall from **169/17 to 84/10**, below target
**117/12**. Tooling health rises from **45.7 to 53.5**, above target **48.0**;
application health remains **89.2**, above target **88.9**. The
[quality verification record](../../tools/quality/health-verification.md#2026-11-08-pr-43-regression-corrections)
contains all scopes, absolute counts, dimensions, input hashes, classification
effects and measurement limitations. Analyzer configuration/exclusions are unchanged.
The development-quality rule now requires investigating introduced regressions
and removing avoidable repetition/complexity before accepting the result.

The independent CI image failure was corrected by updating the unavailable
Chromium package pin; image setup and offline Mermaid rendering passed.
Logs are retained under ignored `quality-reports/pr43-*` and
`quality-reports/health/pr43-mcp-final.json`. Native macOS/Linux, Docker and the
inherited Vite-dev language cases were not reverified.

## 2026-11-08: Calendar recipient identity and reassignment

Owner calendar cards and administration now show the stored recipient's current
name and username. Change recipient beside the identity opens an inline editor;
the selector is initially hidden and loads eligible users only when opened.
Save recipient commits and returns to the name; Cancel discards the selection
and errors. Both restore focus to Change recipient, and the loaded selector
receives focus on opening. Preview has no recipient-edit controls. The form
reuses creation's assigned-user selector. Successful writes update
the detail query and remove cached owner list/preview data; failures retain the
stored identity and show localized field/operation errors. No dependency or
database migration was introduced.

All **124 frontend/BFF unit tests**, the production Vite/Nitro build with explicit
TypeScript checking, frontend lint and .NET formatting/analyzers passed.
The full Windows/Edge production browser run passed 58 of 60 scenarios, including
the scenario invoking eight public/anonymous-denial smoke tests. Two test
assumptions required correction: await completed preview navigation before
checking edit-control absence, and scope repeated door submissions to the door
form now that recipient editing adds another form. The focused rerun passed all
three selected scenarios (recipient persistence/list refresh/preview/languages,
rejected recipient field errors, and repeated door saves). No application change
was needed for these test corrections. Mobile screenshot inspection confirmed
the new controls and recipient text fit at 375 CSS pixels.

The subsequent inline-editor refinement verified ten affected production browser
scenarios: nine passed in the first run, and the remaining recipient scenario
passed after its focus assertion waited for asynchronous options to load.
Coverage includes collapsed/expanded state, cancel without a write, restored
selection/focus, saved identity/list refresh, server field errors, Norwegian and
English, unchanged creation forms and existing door editing/touch navigation.
Updated screenshots were inspected for both collapsed and expanded mobile views.
Recipient text, labels, dropdown and action buttons use 14px text; compact
controls share a 36px minimum height with 44px targets for coarse pointers.
Frontend lint, the 124 unit tests and the production build/type check passed;
the unchanged backend was not rerun for this UI-only refinement.

Advisory health uses jscpd 5.4.1 with unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`, comparing saved
working-tree source against the preserved baseline at
`5dde02421b70024fe03e8a143febd710fb19b8e9`.

| Scope | Overall health | Duplication | Duplicated lines | Clones |
| --- | --- | --- | --- | --- |
| Application | 88.9 to 89.2 (+0.3) | 0.95037% to 1.30947% (+0.35910 pp) | 117 to 169 (+52) | 12 to 17 (+5) |
| Tooling | 48.0 to 45.7 (-2.3) | 0.15760% to 0.15510% (-0.00250 pp) | 12 to 12 (0) | 2 to 2 (0) |

**Tooling health regressed**, with complexity share rising from 48.3% to 53.1%
and heuristic dead-code share from 20.9% to 22.2%. Added browser scenarios extend
an existing module classified as unused despite its explicit suite registration;
the unchanged seven tooling findings are heuristic. Application duplication also
regressed: additional form error/submission patterns and transaction-lock test
setup match existing code. The selector and recipient authorization rule are
shared; further form/test infrastructure was not introduced solely to improve
the score. Application/tooling authored source scopes and exclusions follow
[advisory health](../../tools/quality/health.md); the whole-repository reference
is retained in raw artifacts. These are working-tree measurements, not commit
hook or PR merge evidence.

Detailed input hashes, source manifests, tool schemas, clone locations and
complexity/dead-code limitations remain in `quality-reports/health/` and
`quality-reports/recipient-inline-health-final.log`. The feature's initial
reports remain under `quality-reports/calendar-recipients-*` and refinement
reports under `quality-reports/recipient-inline-*`. Browser logs retain the
initial failures and successful focused rerun separately. Native macOS/Linux,
Docker and the inherited Vite-dev language cases were not reverified.

## 2026-11-01: Plan 00015 calendar creation and owner administration

Implemented and verified on Windows/Edge with the production Vite/Nitro build,
host .NET API and isolated Linux PostgreSQL 18.4 containers. All **121 focused
frontend/BFF tests** and **58 production browser scenarios** passed, together with
the separately invoked **eight public/anonymous-denial smoke scenarios**.
Explicit TypeScript checking, production compilation and saved-source quality
passed. The backend's 211-test evidence is recorded in its verification document.
No dependency or prerequisite changed.

Browser coverage includes creation through the dedicated form with every local
background; persisted ownership/recipient/year and exactly 24 doors; refresh and
return to the own-calendar list; explicit plain-text door saves and error recovery;
one write during repeated pending submissions; empty recipient selection; saved
random/chronological layouts; preview of all 24 doors, including future dates;
Norwegian/English SSR and unchanged authored Unicode titles/messages/line breaks;
and plain-text rendering of HTML-like content. Calendar list pagination, empty
results, failures and retry controls replace stale cards. Unit tests also cover
recipient loading beyond a full backend account-list page and exact Unicode bounds.

Anonymous/ordinary/superadmin/restricted callers cannot open calendar creation or
preview. Foreign-owner SSR, BFF reads/updates and direct API reads return no content.
Successful/error responses are no-store. Preview logout invalidates the backend
session; cookie replay and later direct navigation expose no protected content.
The existing account/session/CSRF suite still passes after enabling calendar lists.
Route errors now transport plain failure codes so localization survives SSR error
serialization, and calendar refresh has a distinct accessible label from accounts.

The BFF emits a non-credential SHA-256 cache discriminator only after backend
session validation. Different opaque authentication cookies remain distinct even
for the same username and expiry; the HttpOnly ticket stays private. Navigation
clears protected queries when that scope changes. Administration and preview
queries are distinct, and calendar links disable prefetch. Focused tests verify
scope replacement, preservation for an unchanged validated session, concurrent
equal-expiry isolation and removal of protected queries after owner denial.

The 375px touch/keyboard scenario passed again with browser timezone
`Pacific/Honolulu`, preserving the backend-stored year, all 24 usable doors and
visible editor focus without horizontal overflow. Desktop preview and narrow
administration screenshots were inspected. Backend-controlled tests cover the
Europe/Oslo year boundary; no year selector or browser-derived creation year exists.

Initial integrated tests found the duplicate refresh label and SSR custom-error
property loss; both were fixed. Other failed cases were fixture dependencies on
a previously reset user's password, exact title selectors that omitted the visible
year, and language-navigation waits that raced reload. Those scenarios were
corrected, passed in focused reruns, then the full suite passed. Nitro required an
unsandboxed build for the Windows profile symlink (initial EPERM); compilation
then passed. The now-unused static Card component was removed after a caller search.

Application advisory health improves **86.8 to 88.9**; **tooling declines 52.3 to
48.0**. Absolute duplication increases in both scopes, and the new executed browser
module is heuristically marked unused. Metrics, hashes, clone counts, rationale
and supported/unsupported dimensions are in
[health verification](../../tools/quality/health-verification.md#plan-00015-comparison-2026-11-01).
Raw build/test/quality logs use ignored `quality-reports/plan15-*`; production
screenshots and stack logs use `quality-reports/plan00015/browser/`. Disposable
test containers/processes were cleaned up; existing application containers/images
and volumes were preserved.

Recipient lists/viewing/timed opening and production database hardening remain
deferred. Existing native macOS/Linux, local Docker, physical-device/manual-screen-
reader and Vite-dev language-switching limitations remain unchanged. Edge touch
emulation and Linux database containers do not establish those platform results.

## 2026-10-25: English route names

Refactored on `refactor/english-routes` from main
`f64d124930cc404a2ae22d9dbfe909be73815f48`. Route files and URL paths now use
`/login`, `/my-page`, `/create-account` and `/change-password`. Navigation,
session redirects, browser assertions and current documentation use those paths.
The previous Norwegian routes are removed without compatibility redirects.
Interface translations remain in the existing Norwegian/English message catalogs.
The shared English-content rule now explicitly covers source code, identifiers,
file/directory names, route names and URL paths across interface languages.

- All **77 Vitest tests** passed.
- Vite production build, explicit TypeScript checking, Nitro packaging and frontend
  Biome checks passed. Nitro packaging required execution outside the filesystem
  sandbox because its dependency tracer reads parent-directory metadata.
- All **28 Playwright/Edge authentication scenarios** and their **eight public/calendar
  smoke scenarios** passed against production Nitro and isolated PostgreSQL.
- Full MegaLinter and custom repository checks passed.
- jscpd 5.4.1 reports unchanged application health **87.5** and tooling health
  **52.0**. Application duplication remains **0.329421%**, **4 clones / 32 lines**;
  tooling remains **0.084710%**, **1 clone / 6 lines**. Complexity and heuristic
  dead-code findings are unchanged. Dead-code coverage remains **33%** for
  application source and **96%** for tooling; unsupported dimensions and heuristic
  entry-point findings retain the analyzer limitations documented previously.

Baseline/current identities, configuration hashes, full metrics and refreshed MCP
schemas/statistics are retained under ignored `quality-reports/health/`.
Browser evidence remains under `quality-reports/plan00013/browser/` and
`quality-reports/frontend/`. The disposable database container was removed;
existing application containers and images were preserved. This evidence covers
Windows/Podman, Edge and production Nitro on local HTTP.

## 2026-10-25: Plan 00013 account administration

Implemented on `feature/user-administration`, based on synchronized main
`92e218d53f54261a3e5b69430fce1740182f3106`. Creation uses `/opprett-konto`;
authorized personal-page lists support reset, status and role maintenance according
to the existing permission matrix. This supersedes plan 00011's placeholders and
read-only list in current behavior; its implemented plan remains unchanged.

- All **77 Vitest tests** passed, including runtime Unicode/conditional schemas,
  direct anonymous/ordinary/restricted denials, calendaradmin escalation/ownership,
  manual-only superadmin targets, role-aware reset policy, immutable responsibility,
  later-page administrator options and new-account location, minimal projections,
  verification-error translation and existing transport/cookie/deadline coverage.
- All **28 Playwright/Edge production-browser scenarios** passed, plus the **eight
  public/calendar smoke scenarios** invoked by that suite. Creation covers both
  superadmin assignable roles and calendaradmin ordinary users, sorting before/after
  the displayed page, reload persistence and preserved actor identity. Maintenance
  covers allowed resets/status/roles, target-session revocation, first/subsequent
  demotion, attached-user conflict and cross-owner denial. The suite also verifies
  direct/restricted navigation, cancellation, Unicode names/mobile layout, duplicate
  username field errors, English guidance, empty administrator options, wrong/fresh
  re-verification with fixed expiry, no-store and protected-cache regression.
  Three focused browser scenarios then passed on the final build after refining
  account-validation feedback, including backend common-password rejection,
  English guidance and repeated/lost-response submission.
- Pending/lost-response coverage initially found duplicate form submission. The
  synchronous guard now permits one write even when submission is repeated before
  pending UI settles. A response lost after commit produces no success notice or
  automatic retry; a subsequent authorized list reveals the persisted account.
- Production Vite/Nitro build, explicit TypeScript checks, frontend lint and full
  MegaLinter/custom repository checks passed. The backend's **172 integration tests**
  passed. Five sharpened controlled-time/authority cases then passed, distinguishing
  4:59.999 from 5:00.000 and ordinary forbidden responses from verification expiry.
- Existing principal-bound CSRF/cookie allowlists and no-store behavior remain
  enforced through production Nitro. Recipient and acting passwords stay out of
  lists, URLs, browser storage, response DTOs and SSR/hydration. Test credentials
  remain in runner memory. Test containers are removed; existing application and
  external build containers/images are preserved.

The suite replaces its isolated API process between independent scenarios to keep
aggregate per-peer budgets from coupling tests. Database-backed sessions/lockout
and production limit settings remain unchanged. No application account seeding, migration,
dependency change or calendar authorization was introduced. Initial sandbox-only
Nitro metadata denial was resolved by running the same build outside the sandbox;
initial burst-rate and pending-submission failures were corrected and rerun.

Artifacts are under ignored `quality-reports/plan00013/`: production build/format
logs, browser JUnit/screenshots, backend TRX, and MCP schemas/snippet/clone evidence.
The smoke artifacts remain under `quality-reports/frontend/`. Redocly retains its
four advisory private-license/localhost/health warnings. Existing Vite-dev language
behavior, native macOS/Linux and local Docker gaps remain separate follow-ups;
this evidence is Windows/Podman with production Nitro and local HTTP. Calendar
authorization/assignment and database hardening remain production gates.

### Plan 00013 advisory health

**Application overall health regresses from 90.8 to 87.5 (-3.3).** Tooling overall
health improves from 51.5 to 52.0 (+0.5), with complexity and duplication regressions
in both views. The new BFF independently checks permissions/targets and conditionally
validates creation, reset, status and role operations; the UI handles verification,
pending submissions and target-specific feedback. These required branches explain
the complexity increase. Form payload/validation and responsible selection were
separated from rendering/transport, reducing the initial form hotspot from 107 to
65. The final application maximum is the permission-matrix test file at 73.
The expanded browser lifecycle/cleanup suite reaches 145. No scoring/exclusions
were changed to improve the report.

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Overall health | 90.8 / 87.5 (-3.3) | 51.5 / 52.0 (+0.5) |
| Complexity score / share | 89.5 / 81.2; 4.8% / 13.8% | 57.8 / 55.9; 45.1% / 47.8% |
| Maximum file complexity | 60 / 73 | 94 / 145 |
| Duplication percentage | 0.134163% / 0.329421% | 0% / 0.084710% |
| Clones / duplicated lines | 1 / 4; 11 / 32 | 0 / 1; 0 / 6 |
| Dead-code score / share | 79.8 / 85.1; 1.7% / 0.9% | 24.6 / 26.1; 18.9% / 17.9% |
| Heuristic findings | 2 / 2 | 6 / 6 |
| Dead-code analysis coverage | 21.0% / 33.0% | 96.1% / 96.0% |
| Analyzed files / lines | 83 / 91; 8199 / 9714 | 44 / 44; 6698 / 7083 |

MCP clone inspection retained the existing 11-line C# test-header clone. New clones
are six lines of loading/error presentation, 15 lines of repeated security-test
assertions and six lines of browser setup. Shared error presentation was extracted;
the remaining short query-state/test scaffolding stays visible in raw evidence.
The unchanged two application findings are executable Nitro build/server entry
points. Tooling entry-point findings are also retained after caller review; lower
dead-code shares reflect expanded measured source rather than removed findings.
C# dead-code support remains unavailable, and other unsupported dimensions do not
prove cleanliness. Scores are rounded, advisory saved-source evidence, separate
from staged hook receipts and committed PR merge comparisons.

jscpd 5.4.1 uses unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Application source SHA-256 changes from
`d6a4d476bbebc9988aeb5b136b1e343776fd846a80c4452dc2ad320277e70836`
to `12ea115329c9828a851ad8847ddb4f23787071d82042bbad522fc4ad96b4fb85`.
Tooling changes from
`e0160653aeaa7b75b5b6fb4a05aee64acc44a84996dd14f24c758283c0284614`
to `ebbab7830a5cd99389ab931aacd84ea49bbf8cd08db99520771fbb9f02bda024`.
Scope manifests, refreshed MCP/CLI results and the whole-repository reference are
retained in `quality-reports/health/` under identical application/tooling settings.

## Plan 00010 command ownership verification

Current build/browser evidence, inherited Vite failures and platform limits are
recorded in the [tooling review](../../tools/development/tooling-review.md#verification-record).
Earlier entries below retain their original commands and dates.

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

## Landing page verification (2026-10-18)

Plan 00007 replaces the root redirect with the Norwegian Christmas landing page.
Implementation is on `feature/norwegian-christmas-landing-page`, based on
`58bc208734a855c65aaac236dd2164246b0367f1`, with the owner's authorization to carry
the uncommitted planning files onto that branch.

- `node tools/frontend/check.mjs check` passed: 21 Vitest tests, Vite client/server
  builds, explicit TypeScript checking, Nitro production packaging, and Biome.
  The sandboxed first build could not read Windows profile links; rerunning with
  the necessary filesystem access succeeded. The four existing OpenAPI warnings
  and dependency bundler annotation/directive warnings remain advisory.
- `node tools/quality/run.mjs full` passed all applicable saved-source lint and
  custom checks. Initial CSS formatting and prompt line-length findings were
  corrected without suppressions.
- `node tools/frontend/smoke.mjs` passed against the built Nitro frontend on
  Windows/Edge and the existing backend/PostgreSQL images running in Podman.
  It verifies the exact Norwegian heading and introduction, `/` navigation and
  refresh, SSR HTML, no hydration errors, no landing calendar reads, a disabled
  login button, translated English/Norwegian text, and mobile positioning.
- Retained smoke coverage passed for the directly addressed local example,
  two API-created persisted calendars, 24 static doors, actual browser/tRPC/API
  communication, unchanged user-authored titles, and translated failure states.
- Inspected `quality-reports/frontend/landing-desktop.png` (1280 × 1000) and
  `landing-mobile.png` (375 × 812 viewport). The nisse, snowman and tree are
  recognizable, text is readable, and mobile cropping retains the main subjects.
  Wide-screen review at 1920 × 1080 prompted a stronger cream gradient behind
  the copy and full-width header placement to preserve text contrast and keep
  login close to the right edge.
- A separate production frontend with `BACKEND_API_URL=http://127.0.0.1:1`
  returned 503 for readiness but 200 for the landing page and illustration.
  Browser checks at widths 320, 375, 640, 768, 1280 and 1920 passed without
  horizontal overflow or page errors; login remained disabled at the top right.
  Evidence is in `quality-reports/frontend/landing-backend-unavailable.json`.
- The locally served illustration is 460,858 bytes. Its generation method,
  dimensions and final prompt are recorded in [the illustration record](illustration.md).

### Initial landing page advisory code health

**Overall health declined from 53.8 to 53.2 (-0.6).** Dead-code score declined
from 21 to 20.1 (-0.9), and dead-code share increased from 21.3% to 21.8%
(+0.5 percentage points). The eight heuristic findings are unchanged. In
particular, the expanded, executed `tools/frontend/smoke.mjs` remains classified
as an unused file because the analyzer does not recognize its command-line entry
point. Adding the required browser verification increases the weight of that
existing finding; it is retained rather than suppressed or excluded.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Complexity score | 65.9 | 66.2 | +0.3 |
| Complexity share | 32.5% | 32% | -0.5 percentage points |
| Duplication / clones / duplicated lines | 0% / 0 / 0 | 0% / 0 / 0 | Unchanged |
| Maximum file complexity | 94 | 94 | Unchanged |
| Heuristic dead-code findings | 8 | 8 | Unchanged |
| Measured files / lines | 68 / 7737 | 70 / 7856 | +2 / +119 |
| Dead-code coverage | 81.2% | 81.4% | +0.2 percentage points |

jscpd 5.4.1 used unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
The source hashes are
`d207d77acae2c0e30f12ddae1d23fdc79fbf50154174f875d54f88a3b3bd30aa`
before and `1a57ba41d8d001f1140be382eefad07810de4e26aa590707981b718fdc68b71e`
after. The previous baseline was preserved as `baseline-before-00007-20261018`.
Raw reports, scope manifests, identities and limitations are retained under
`quality-reports/health/`; CSS, imagery, translations and prose do not contribute
to authored-code scoring. MCP schemas were checked, the proposed landing snippet
had no matches, and the final directory scan preceded statistics (zero clones).
The saved Button snippet matched itself when queried after saving; that is not
a cross-file clone. These are working-tree advisory measurements, not hook
receipts, hosted CI results or PR merge evidence. Prior platform and dependency
audit limitations above remain applicable; no new dependency was added.

### PR 23 quality follow-up (2026-10-18)

The [initial CI comment](https://github.com/Pipehill/advent-calendar/pull/23#issuecomment-6249384270)
reported a setup failure before lint and a separate advisory health regression.
The unavailable Chromium pin was corrected and verified with a fresh quality
image build, full lint and checker regressions; details belong to
[quality tool verification](../../tools/quality/health-verification.md#2026-10-18-pr-23-quality-image-recovery).

The monolithic browser script is now a small CLI invoking eight named Node tests
in `tools/frontend/browser/smoke.test.mjs`. Each scenario gets an isolated browser
context, request/error collection, and guaranteed cleanup. Shared hooks check page,
hydration and asset failures after every scenario, including the last mobile check.
Language switching and screenshot coverage are retained, and independent tests no
longer rely on cookies and navigation state left by earlier scenarios. The runner
prints individual results, saves a JUnit report, and propagates nonzero exit codes.
The private fixture stays in its only consuming suite rather than exporting an
otherwise unused helper module.

All eight browser tests passed on Windows/Edge against the unchanged production
frontend at port 3010 and the existing backend/PostgreSQL services. An intentionally
unavailable browser channel returned exit 1 and a failure report; the successful
run then regenerated the normal report. The earlier 21 frontend unit tests and
production build remain applicable because application source did not change.

| Metric | Target main | Initial PR head | After review |
| --- | --- | --- | --- |
| Overall health | 53.8 | 53.2 | 56.4 |
| Complexity score | 65.9 | 66.2 | 66.4 |
| Complexity share | 32.5% | 32% | 31.7% |
| Dead-code score | 21 | 20.1 | 24.6 |
| Dead-code share | 21.3% | 21.8% | 18.9% |
| Heuristic dead-code findings | 8 | 8 | 8 |
| Duplication / clones / duplicated lines | 0% / 0 / 0 | 0% / 0 / 0 | 0% / 0 / 0 |
| Maximum file complexity | 94 | 94 | 94 |
| Measured files / lines | 68 / 7737 | 70 / 7856 | 71 / 7934 |
| Dead-code coverage | 81.2% | 81.4% | 81.6% |

Overall health improves by 2.6 points over main and 3.2 over the initial PR head.
No scoring settings, exclusions or thresholds changed. jscpd still classifies
the 20-line CLI as unused, but recognizes the executable Node test suite as tests.
The reduced dead-code share reflects that classification and the thinner CLI,
not deletion of proven dead application code. Measured complexity lines remain
2514; lower complexity share partly reflects the larger test source denominator.
The practical improvements are test isolation, localized failures, complete
per-scenario error checks, and reliable cleanup/reporting, rather than a claim
that the heuristic scores prove application correctness.

The review baseline preserves head `88be4cc2535cb51dbea62f9aefef6de60c727da0`
with source hash `1a57ba41d8d001f1140be382eefad07810de4e26aa590707981b718fdc68b71e`;
the final source hash is
`8e5c97b2cd169ab6bcc707d14651a10c32aa640b928516224f37b31e422cb60f`.
Pinned jscpd/configuration are unchanged. The earlier baseline was archived as
`baseline-before-pr23-quality-review-20261018`. MCP refreshed before statistics
and reported zero clones. Raw source identities and comparisons remain under
`quality-reports/health/`; execution logs are in
`quality-reports/pr-23-setup-diagnosis/`. Platform and heuristic limitations above
continue to apply.

## 2026-10-25: Login and personal page (plan 00011)

The production frontend now provides username login, own-password change, logout
and backend-validated `/min-side`. Restricted credentials cannot reach ordinary
personal content before password change and fresh login. Pages display unchanged
names and initials, disabled role-specific creation placeholders and, only for
unrestricted superadmins, a paginated read-only account list. Names are rendered
as text; the 97-code-point markup-like fixture fits a 375px viewport without
horizontal overflow. Both interface languages use maintained Paraglide catalogs.

Validation on Windows, Node 24.20.0, .NET SDK 10.0.401 and Podman/PostgreSQL:

- All **37 Vitest frontend/BFF tests** passed. Coverage includes allowlisted
  cookies/headers, separate Set-Cookie values and attributes, newly issued cookies
  during login CSRF refresh, minimal session/list projections, bounded pagination,
  unauthorized/restricted role denial, concurrent request isolation, write failures
  without retries and the existing total-deadline/cancellation/read-retry cases.
- Production Vite/Nitro build and explicit TypeScript checks passed. Shared
  frontend lint, full MegaLinter and custom repository checks passed.
- All **14 Playwright/Edge authentication scenarios** passed against a separately
  started production Nitro server, real API and disposable PostgreSQL database.
  They verify keyboard login navigation, every role, direct protected refresh,
  all-role superadmin pagination beyond 50 accounts, list loading/empty/error
  states, safe long-name rendering, localized form errors and backend weak-password
  field errors, required password change and fresh login, expired temporary
  credentials, missing/invalid/principal-stale CSRF tokens, revoked-cookie replay,
  logout with another session preserved, browser history and switching from a
  superadmin to an ordinary user without retaining list data in UI/HTML/hydration.
- The authentication suite also ran all **eight public/calendar browser smoke
  scenarios** successfully against those isolated services. Existing landing copy,
  mobile layout, language selection, persisted calendars and SSR/hydration remain
  covered. Browser tests reported no page or hydration errors.

Actual browser cookies remain host-only, HttpOnly, SameSite=Lax and path `/`.
Ordinary cookies expire after 30 days and administrator cookies after eight hours.
The production Nitro boundary preserves backend CSRF issuance/deletion and
no-store on tRPC success/errors and protected SSR. BFF unit evidence separately
verifies multiple allowed Set-Cookie headers without folding or attribute loss,
including Secure and Expires. Backend controlled-time tests cover exact fixed
deadlines; this host run uses local HTTP and does not claim deployed HTTPS evidence.
Fixture accounts are limited to disposable `browser_*` databases; credentials
remain in runner memory and do not enter reports. Test containers were removed;
pre-existing external build containers and images were preserved.

Evidence is retained in ignored `quality-reports/plan00011/`, with browser JUnit,
API TRX, build/format/lint logs, screenshots and MCP records. The existing smoke
JUnit/screenshots remain under `quality-reports/frontend/`. The setup requirement
is documented in the [frontend README](README.md#browser-verification).

Only pinned TanStack Form 1.33.5 was added, with its lockfile and React 19 peer
compatibility checked. Production dependency audit reports zero advisories.
Full audit still reports build-only `node-forge` (high) through Nitro's development
HTTPS helper and `serialize-javascript` (low) through its minifier. The production
image contains `.output` only. The known Vite-dev language-switching TODO and
native macOS/Linux/Docker platform gaps remain visible; this task verifies
production Nitro on the available Windows/Podman environment. Calendar
authorization/assignment and database hardening remain separate production gates.

### Plan 00011 advisory health

Application overall health improves from **89.4 to 90.3 (+0.9)**. Tooling overall
health improves from **50.6 to 51.5 (+0.9)**. Regressions remain explicit:
application maximum file complexity rises from 63 to 64; tooling complexity score
falls from 59.6 to 57.7 (-1.9) and complexity share rises from 42.6% to 45.4%
(+2.8 percentage points). Shared name validation adds one branch to
`UserAdministration.cs`. The fixture and named browser lifecycle scenarios add
branches to isolate accounts and guarantee cleanup. No scoring settings or
exclusions changed.

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Complexity score / share | 87.6 / 89.0; 6.0% / 5.1% | 59.6 / 57.7; 42.6% / 45.4% |
| Maximum file complexity | 63 / 64 | 94 / 94 |
| Duplication score | 93.4 / 94.3 | 93.2 / 93.6 |
| Duplication percentage | 0.171553% / 0.143979% | 0% / 0% |
| Clones / duplicated lines | 1 / 1; 11 / 11 | 0 / 0; 0 / 0 |
| Dead-code score / share | 74.1 / 79.8; 3.6% / 1.7% | 22.8 / 24.5; 20.3% / 19.0% |
| Heuristic findings | 2 / 2 | 6 / 6 |
| Dead-code analysis coverage | 12.6% / 22.5% | 97.5% / 96.1% |
| Analyzed files / lines | 53 / 68; 6412 / 7640 | 41 / 43; 6153 / 6663 |

jscpd 5.4.1 uses unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Baseline identity is synchronized main
`f6981d5b7f6726613bc92a0ea7ac0ef8713e5e2d`; measurements include saved authored
source and tests in their separate application/tooling scopes, with the whole
repository reference retained in raw artifacts. Application source SHA-256 changes
from `fc54990c8cabd2a763bf3fce042bf3e00deedd013d634bbea770475fadde86eb`
to `049b5b83e843b5397090f6c944ca505538c1e49b5b7a552de658de48a21ff3f4`.
Tooling changes from
`9fe1a48f6a4f1f774181068171008897c992c2b472ff2c91c28a8a4c8bf9839d`
to `e2510db2943d39088e1facd22a694d03971180eae441c83090447e4df52ef0cc`.

MCP schemas, snippet checking, refreshed statistics and file-clone inspection are
recorded in `quality-reports/plan00011/`. The sole 11-line clone remains existing
test imports/namespace setup in authentication lifecycle/administration tests.
Lower duplication/dead-code shares partly reflect a larger measured denominator,
not removed findings. The two application dead-code findings are executable
Nitro build/server entry points, retained after caller review. Unsupported
dimensions remain unavailable; heuristic findings and rounded scores do not prove
correctness. These are saved-source comparisons, separate from staged receipts
and committed PR merge evidence.

## 2026-11-01: Compact administrator controls (plan 00014)

The personal header now groups compact password/logout actions beside the name.
Account creation sits beside the account-list heading, refresh/pagination use
named secondary icon buttons, and eligible rows expose a three-dot action menu.
Account forms retain explicit confirmation and credential handling, with compact
primary save and secondary cancel controls. The calendaradmin's unavailable
calendar action and explanation remain separate. Ordinary users and superadmin
targets retain their existing permission boundaries and routes.

Verification on Windows, Node 24.20.0, .NET SDK 10.0.401, Edge and Podman:

- **77 frontend/BFF unit tests** passed. Explicit TypeScript, contract/Paraglide
  generation, production Vite/Nitro packaging, Biome and frozen installation passed.
  Full repository quality passed at each iteration and on the final saved inputs.
- **43 production browser scenarios** passed against a disposable PostgreSQL
  database and separately started API/Nitro processes. The suite also passed all
  **eight public/calendar smoke scenarios**. No page or hydration errors occurred.
  The final focus assertion after maintenance saves was additionally checked
  through reset, promotion/demotion, enable/disable, assigned-only reset and first
  demotion scenarios.
- Menus support Enter/Space/ArrowDown opening, Home/End and arrow navigation,
  Escape/outside dismissal, account-specific accessible names, and focus transfer
  into the existing form. Cancellation and successful saves return focus to the
  row; an absent refreshed target falls back to the account heading. Opening and
  canceling all three actions issued zero account writes. Eligible actions and
  their state-dependent labels were verified for both administrator roles.
- Creation from a later list page locates and focuses the created account. Tests
  retain validation, recent-verification recovery, duplicate-submission protection,
  real credential/session revocation, error handling and no automatic write retry.
  Refresh and first/middle/last navigation retain pending/error/boundary guards,
  localized accessible names and visible polite page announcements.
- Both administrator roles were checked at **1280px and 320px** in Norwegian and
  English. Screenshots were inspected against retained before images. Long
  markup-like names remain plain text, menu labels wrap, and menus stay within
  the viewport. Emulated touch checks confirm 44px controls/items, tap selection,
  cancel/focus return and no horizontal overflow. Keyboard focus is visible;
  icons are decorative and foreground/focus colors retain strong contrast.
- Header logout pending/failure/retry, own-password navigation, client session
  expiry, returning-tab revalidation, restricted credentials, ordinary-user pages,
  creation/password-page session consumers and public/calendar SSR were verified.
  A controlled browser clock checks the client timer; backend deadline security
  remains covered by the existing backend suite, which this UI task did not rerun.

Lucide React **1.66.0** and Radix Dropdown Menu **2.2.1** are pinned and declare
React 19 peer compatibility. The maintained dropdown is adapted from
[shadcn/ui](https://ui.shadcn.com/docs/components/radix/dropdown-menu); Radix owns
keyboard navigation, collision positioning and menu focus. Only required Lucide
icons are imported. Initial production browser checks found Nitro tracing the
wrong Lucide export target; Vite SSR now bundles the icons, resolving missing
server modules and hydration fallback. The standalone output is 4.91 MB. The
first sandboxed Nitro attempt also hit parent-directory readlink restrictions;
the build passed with the required filesystem access. A touch-test locator was
corrected to measure its trigger before the modal menu hides background content
from accessibility queries; the corrected touch scenario passed.

The dependency audit identified two existing Seroval serialization advisories.
Updating only its compatible transitive lockfile resolution from 1.6.9 to 1.7.5
cleared them; the final production audit reports **zero advisories**. The complete
development audit still reports 16 advisories (six high, five moderate, five low)
in Nitro's build dependencies: node-forge, serialize-javascript, deepmerge,
minimatch and glob. These are recorded in ignored audit artifacts; broader
build-tool upgrades remain outside this UI refactoring. The production image
continues to contain only standalone output.

Evidence lives in ignored `quality-reports/plan00014/`: final unit/build/lint
logs, production/development audit JSON, JUnit, before screenshots, localized
desktop/mobile menu/header screenshots and MCP schemas/snippet/refresh/statistics.
Quality containers use automatic removal, and disposable browser databases are
stopped and removed after each run. Existing development services, volumes,
images and external build containers are preserved. Physical-device and manual
screen-reader testing were not performed; accessibility evidence uses browser
roles/names, focus, keyboard operation and emulated touch. Available-platform
coverage remains Windows/Podman/Edge, with inherited Vite-dev language-switching,
native macOS/Linux/Docker and deployment HTTPS limitations unchanged.

### Plan 00014 advisory health

Application health **declines from 87.5 to 86.9 (-0.6)**. Tooling health improves
from **52.0 to 52.3 (+0.3)**, while its complexity also regresses. The application
adds explicit button variants, menu dispatch and focus restoration guards. The
browser suite adds real layout, touch, keyboard and session lifecycle scenarios,
raising its file complexity from 145 to 214. These branches support the required
behaviors; preserving the existing isolated fixture and scenario structure avoids
introducing a second test harness. No scoring settings or exclusions changed.

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Complexity score / share | 81.2 / 79.6; 13.8% / 15.6% | 55.9 / 54.7; 47.8% / 49.6% |
| Maximum file complexity | 73 / 73 | 145 / 214 |
| Duplication score | 95.2 / 95.3 | 93.9 / 94.0 |
| Duplication percentage | 0.329421% / 0.321964% | 0.084710% / 0.081777% |
| Clones / duplicated lines | 4 / 4; 32 / 32 | 1 / 1; 6 / 6 |
| Dead-code score / share | 85.1 / 85.7; 0.9% / 0.8% | 26.1 / 27.1; 17.9% / 17.3% |
| Heuristic findings | 2 / 2 | 6 / 6 |
| Dead-code analysis coverage | 33.0% / 34.5% | 96.0% / 96.1% |
| Analyzed files / lines | 91 / 93; 9714 / 9939 | 44 / 44; 7083 / 7337 |

jscpd 5.4.1 uses unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
The preserved baseline is saved source at
`3d452d660743dada9c01aef51a0d5ddb739c9de7`; the preceding baseline was archived as
`baseline-before-00014-20261101`. Raw reports retain separate application/tooling
manifests, source hashes and the whole-repository reference. Application source
identity changes from
`1b6ef6fd9610ad917199b0305550ca9005854998fa76a0039eee5cd97eb7de48` to
`f55ab430c2bf811859632aed7f1564d98173079890a5779cf00b756d81975bd9`.
Unchanged absolute duplication counts mean the lower shares reflect larger
denominators. Existing heuristic unused-file findings include real Nitro and
quality-tool entry points; caller review retains them. Dead-code coverage is
partial, unsupported dimensions remain unavailable, and rounded scores do not
establish correctness. Working-tree reports remain separate from hook receipts
and the committed PR merge comparison.

## 2026-11-01: Administrator list corrections (plan 00014 follow-up)

The owner authorized updating plan 00014 and corrected the requested alignment
to **left alignment** during implementation. Account names, usernames, roles and
enabled states now occupy four consistently aligned desktop columns, with two
columns on narrow screens. Reserving the action-control column keeps account
values aligned even when a superadmin row has no menu. Shared enabled buttons,
styled links and menu items use a pointer cursor; disabled buttons retain their
disabled cursor and behavior.

List headings include the authorized account total in parentheses. Pagination
shows `Side 1 av 2` / `Page 1 of 2`, including page 1 of 1 for an empty list.
The authored OpenAPI user-list response now requires `totalCount`; the repository
reuses the same SQL authorization predicate for page and count queries, the
service keeps both within its protected transaction, and the BFF derives
`hasMore` from the total. Calendaradmin counts exclude unrelated accounts.
Full pages at exact multiples of the limit no longer enable a phantom next page.

On Windows/Podman/Edge, all **178 backend integration tests** and **82 frontend/BFF
tests** passed, including scoped and empty counts, offsets beyond the last row,
partial/full pages and exact page-size boundaries. Contract/Paraglide generation,
explicit TypeScript, production Vite/Nitro packaging and Biome passed. Nitro again
required filesystem access outside the sandbox for its parent-directory readlink.
No dependency, schema migration, authorization or credential-flow changes were made.

All **43 production browser scenarios** and **eight public/calendar smoke
scenarios** passed with the corrected left alignment. Both administrator roles
were checked in Norwegian/English at 1280px and 320px, measuring shared column
edges, separate role/status cells, enabled-control/menu cursors and heading/page
totals against authorized API data. Empty lists show `(0)` and page 1 of 1 with
both navigation buttons disabled. Desktop/mobile screenshots were inspected.
The eight localized layout scenarios also passed on the final test source after
simplifying their expected heading lookup.
The initial empty/error scenario attempted a now-disabled previous-page button;
using refresh for the error request fixed that test, and the full rerun passed.
Full saved-source quality passed. Disposable containers are automatically removed;
existing development services, images and volumes are preserved.

### Follow-up advisory health

Application health **declines from 86.9 to 86.8 (-0.1)**. Tooling remains **52.3**,
with a complexity regression. Count coordination, pagination coverage and actual
browser measurements of alignment/cursors add the relevant branches. The browser
scenarios reuse the existing fixture and test combinations. Absolute duplication
and heuristic finding counts remain unchanged; no scoring/exclusion changes were made.

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Complexity score / share | 79.6 / 79.4; 15.6% / 15.7% | 54.7 / 54.6; 49.6% / 49.8% |
| Maximum file complexity | 73 / 75 | 215 / 226 |
| Duplication percentage | 0.321964% / 0.318566% | 0.081777% / 0.081444% |
| Clones / duplicated lines | 4 / 4; 32 / 32 | 1 / 1; 6 / 6 |
| Heuristic findings | 2 / 2 | 6 / 6 |
| Dead-code analysis coverage | 34.5% / 34.5% | 96.1% / 96.1% |
| Analyzed files / lines | 93 / 93; 9939 / 10045 | 44 / 44; 7337 / 7367 |

jscpd **5.4.1** retains configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
The follow-up baseline is saved source at
`1ead425fd422119caff873c51c57e20a77f7221c`; the previous baseline is preserved as
`baseline-before-00014-adjustments-20261101`. Application source SHA-256 changes
from `f55ab430c2bf811859632aed7f1564d98173079890a5779cf00b756d81975bd9`
to `ec9509726c3e0fbe46c46e5407c6868996aa9b6f3aad4ebce394163b09e89987`;
tooling changes from `47cbb1b18a4e161826f62cc4f544923ae36afa1a17564584c7538b317e44bb9b`
to `f6f4872417187e7c5356694014dd4136fb0443af0a8ca98c5b0cb5e2813153d8`.
Raw identities, whole-repository reference, MCP schemas/refresh/statistics and
logs are retained under ignored `quality-reports/health/` and
`quality-reports/plan00014/adjustments-*`. Lower duplication shares reflect larger
denominators. Analysis remains partial and heuristic; the inherited dependency,
platform, physical-device and manual-screen-reader limitations above still apply.

## 2026-11-08: Scattered calendar layouts (plan 00016)

The shared owner administration/preview board now uses 70%-cell chronological
doors and a deterministic scattered Random canvas. All surface variants remain
translucent, with opaque dark numerals, local pale backing, selected borders and
double-contrast keyboard focus. Door 24 has exactly 1.5 times the ordinary area
only in Random; its centre remains within the central third on both axes.
The persisted permutation seeds placement; reads, language changes and responsive
measurement never mutate layout. No API, migration, access or dependency changes
were needed.

On Windows/Podman/Edge, all **146 frontend/BFF unit tests** pass, including 22
geometry cases at board widths 248/303/624/1008. These cover adversarial valid
orders, forced bounded fallback, target clearance, bounds, Christmas Eve area and
centrality, repeatability after resizing and influence of the complete saved order.
Explicit TypeScript, production Vite/Nitro packaging, Biome and full repository
quality pass. Existing upstream contract/bundler warnings remain unchanged.

All **66 production browser scenarios** and **eight public/calendar smoke
scenarios** pass. Six new scenarios measure actual targets on all four backgrounds
in both modes at 320/375/768/1280px, including at least 44px targets, 8px scattered
clearance, canvas bounds, Christmas Eve area/centrality, transparent variants and
keyboard focus. Refresh, preview and language changes preserve numbered geometry;
resizing preserves selection and sends zero layout writes. A 320px touch context
successfully selects all 24 matching editors. Existing owner/foreign/role/session
denials and plain-text content regressions remain covered; no main-page or
hydration errors were reported. New touch coverage supplements, rather than
replaces, physical-device and assistive-technology testing.

Thirty-two before and thirty-two after board screenshots, four comparison sheets,
per-background rectangle measurements and complete browser/build logs remain under
ignored `quality-reports/plan00016/`. Visual review of all four sheets and full-size
mobile/desktop examples confirms smaller ordinary doors, readable numbers, visible
selection/focus, exposed artwork and an irregular Random arrangement. The original
grid's background cropping remains responsive; Random has a taller mobile canvas.
Disposable database containers were removed automatically; existing development
services, images and database volumes were preserved.

The initial browser measurement run exposed frequent fallback on the shortest
mobile canvas. Increasing the minimum canvas height to eleven ordinary door
widths permits more scattered packing; a verified irregular reserve pattern also
meets every geometry guarantee. Two browser assertions were corrected: distinct
positions now retain subpixel precision, and preview waits for its loaded notice
before keyboard selection. The original failed run is retained as
`quality-reports/plan00016/layout-browser.log`.

### Advisory health and regression review

Application health improves **89.2 to 89.4 (+0.2)**. **Tooling health declines
53.5 to 53.2 (-0.3)** because heuristic dead-code analysis marks the new
`calendar-layout-assertions.mjs` helper as unused. It is directly imported and
executed by the registered production layout scenarios; retaining the cohesive
measurement/assertion helper keeps those scenarios readable. Caller review found
no actual unused new code. No exclusions, scoring or analyzer settings changed.

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Complexity score / share | 83.0 / 83.2; 12.3% / 12.1% | 55.9 / 56.4; 47.4% / 46.4% |
| Maximum file complexity | 75 / 75 | 227 / 227 |
| Duplication percentage | 0.652275% / 0.641026% | 0.154500% / 0.151324% |
| Clones / duplicated lines | 10 / 10; 84 / 84 | 2 / 2; 12 / 12 |
| Dead-code score / share | 88.7 / 89.0; 0.6% / 0.6% | 28.3 / 27.7; 16.5% / 16.7% |
| Heuristic findings | 2 / 2 | 7 / 8 |
| Dead-code analysis coverage | 38.7% / 39.8% | 96.3% / 96.4% |
| Analyzed files / lines | 118 / 120; 12878 / 13104 | 49 / 51; 7767 / 7930 |

jscpd **5.4.1**, configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`,
measures identical application/tooling scopes on Windows. Baseline commit:
`ec2207177eb20726b5c44602c6dcbccf0de36627`. Application source SHA-256 changes
from `b4dd26e692252c9f412dfac3fcbf8618f7863c15215867ecbb4df55b4dbf6019`
to `e42a5b17bdd129f4a343e05d9baba1341d115ae3aa16964840a03c6cbb0b2e35`;
tooling changes from
`176cff227b5d04e532bf959a3fdb7a17c16091f8758997dc379b7b8a1c9adf4e`
to `bb8d0a9a148ac100de0f1e58ba1af7dbcd911a38368844aa82c00277e2acc1d8`.
Lower duplication shares reflect larger denominators with unchanged absolute
counts. Raw findings, source identities, MCP schemas/refresh/statistics and the
whole-repository reference remain in ignored `quality-reports/health/`; working
source evidence is separate from hook receipts and committed PR comparisons.
Analysis remains partial and heuristic. Physical-device, screen-reader and
native Linux/macOS coverage remain outside this Windows/Edge run.

## Plan 00018: optional door images (2026-11-08)

All **191 frontend/BFF tests**, explicit TypeScript checks, production Vite/Nitro
packaging and Biome pass. The complete production Edge/Windows suite passes
**81 scenarios**, including the smoke-suite wrapper; its eight separate smoke
checks also pass. Seven new browser scenarios cover actual JPEG and detailed PNG
adaptation, image-only content, owner administration/preview and read-only system
preview, explicit add/keep/replace/remove saves, retained invalid drafts, object-URL
cleanup, localized keyboard controls and 320/1280px aspect-ratio display.
Additional HTTP scenarios cover independent API/BFF/batch body limits, no-store,
CSRF rejection, preserved saved state and a delayed response after door selection
changes. Screenshots are visually reviewed; the full image fits without cropping
or horizontal overflow. Native file-dialog wording follows the browser/OS; the
application-owned labels, help, remove controls and feedback are localized.

An initial browser run exposed missing image requests after SSR hydration:
mutable server context was not carried into the browser. Image queries now use
the backend-validated cache scope in loader data, and the BFF verifies it against
the current session before reading bytes. A shared calendar page renderer keeps
failure handling, mode and scope wiring consistent across both routes. The
TypeScript generator explicitly emits `null` for nullable JSON metadata, matching
the backend contract. Late responses remain separated by scope/mode/door/version;
removed blobs and all outgoing object URLs are released.

Saved-source full quality passes. Application/tooling health is **91.7/55.0**,
compared with **90.8/54.1** before the task. The
[health record](../../tools/quality/health-verification.md#plan-00018-door-images-2026-11-08)
records absolute duplication, complexity, scope identities and analysis limits.
Build output retains inherited dependency directive/comment warnings; they do not
prevent TypeScript or Nitro completion. Browser logs/screenshots remain under
ignored `quality-reports/plan00015/browser/`, backend/TRX evidence under
`quality-reports/plan00018/`, and raw health/quality evidence under their existing
report owners. Physical devices, assistive technology and native Linux/macOS
browser execution are not established by this Windows/Edge run. Recipient
viewing/opening and production hardening remain separate tasks.

## PR 48 follow-up: local Vite login (2026-11-08)

The original positive login coverage used production Nitro. A reported local
failure was reproduced in an isolated Vite browser run and a focused unit test:
native `new Request(adapter, ...)` attempts to read private state absent from
TanStack's lazy `srvx` NodeRequest. The body boundary now rebuilds from public
URL, method, headers, signal and bounded bytes. Cookies, CSRF, trace context and
caller cancellation are preserved without depending on adapter internals.

All **193 frontend/BFF tests**, production build/TypeScript, Biome and full quality
checks pass. **13 selected Vite browser scenarios** pass for all three role
logins, refresh, CSRF and image lifecycle/display. Two additional Vite scenarios
repeat native credential submission and the real HTTP size boundary, including
a chunked upload. **15 matching production Nitro scenarios** pass, also covering
account creation and maintenance. The running local server's empty login request
returns protected HTTP 400 instead of the reported internal error. Disposable
accounts/databases and free ports keep these checks separate from local user data.

Vite verification also exposed that cancelling an oversized incoming stream
could reset the shared socket before HTTP 413 was delivered. Declared oversized
bodies remain unread; streamed rejection releases its reader and closes the
connection after sending structured no-store 413. Real declared, batch and chunked
HTTP scenarios pass in both runtimes. Credential forms explicitly use POST even
before hydration; the JavaScript-disabled scenario confirms fields stay out of
URLs. The login helper waits for client modules before ordinary interaction.

The suite now supports `BROWSER_FRONTEND_MODE=development` alongside its default
production mode. Vite logs are under ignored
`quality-reports/pr48-local-login/browser/`; production reports retain their
existing location. Application health remains **91.7**, tooling improves
**55.0 to 55.1**, and absolute duplication remains **79 lines/9 clones** and
**12 lines/2 clones** respectively. Harness maximum file complexity rises
**228 to 232** for explicit runtime selection, argument factories and invalid-mode
validation. A separate credential transport scenario keeps that coverage out of
the already large authentication harness. The required runtime choices are
retained after replacing repeated conditionals with named configuration; scoring
and exclusions remain unchanged. Detailed source identities, supported dimensions,
raw findings and the separate committed-head review remain in
`quality-reports/health/`.

## Recipient viewing and animated opening (2026-11-08)

All **218 frontend/BFF tests**, explicit TypeScript checking, production Nitro
packaging and Biome pass. Production dependency audit reports no known
vulnerabilities. Tests cover recipient-only role/session/scope checks, paging,
structured errors, principal-bound CSRF, no write retries, concurrent request
isolation, SSR guards, image versions, backend-relative timers and stale-content
visibility independent of opening history.

The complete isolated production run passes **99 scenarios plus eight smoke
checks**. It exercises safe future SSR, explicit
keyboard opening, hinge/zoom effects, long plain text, Escape/Close and focus
containment/return, persisted green frames, image-only content, image retry and
reduced motion. Additional scenarios prove timer-driven backend refresh, bounded
invalidation after another device empties/reassigns a calendar, and rejection of
duplicate/late openings across navigation/logout. All four backgrounds, both
layouts, Norwegian/English and 320/375/768/1280px produce 64 responsive captures.
Mobile geometry includes actual coarse-pointer/touch emulation and 44px targets.
The suite budget is ten minutes for the expanded matrix; individual action
timeouts remain bounded. The existing reset-focus scenario now creates its own
target instead of replacing the shared recipient fixture's credential.

Two focused **Vite development browser scenarios** pass after reproducing and
fixing StrictMode's cleanup/reopen close event. The dialog now ignores queued
close events while it is open, so development mode displays authorized content
like production. This does not depend on animation completion. Actual root
launcher orchestration also passes container/dev with bypass enabled/disabled,
preserving the same calendar ID and first-open timestamp throughout.

Targeted rechecks cover final dialog centering and image-only gifts whose title
contains only whitespace: the modal/image retain localized accessible names,
while meaningful authored text remains unchanged.

Evidence is under ignored `quality-reports/final-frontend.log`,
`quality-reports/step5-vite-browser.log`, `quality-reports/final-stable-browser.log`,
`quality-reports/final-recipient-browser.log`,
`quality-reports/final-accessible-browser.log` and
`quality-reports/plan00019/`. Physical devices, assistive technology and native
macOS/Linux browser execution remain unverified; touch/reduced motion are browser
emulation. Other-device changes use a bounded 30-second refresh rather than push.
