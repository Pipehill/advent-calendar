# Frontend verification

Last updated: 2026-10-25

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
