# Frontend verification

Last updated: 2026-10-25

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
