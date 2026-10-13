# 00006: Display a persisted calendar in the frontend

Status: Implemented (2026-10-13)

Last updated: 2026-10-13

Implementation type: feature

## Overview

Build the first frontend page: the calendar title above 24 numbered doors.
Retrieve the displayed calendar through the agreed browser/BFF/API/PostgreSQL
architecture, establishing a working end-to-end read flow. Reuse the existing
backend retrieval endpoint and local seed rather than adding frontend sample data.

Include Norwegian and English interface translations through Paraglide JS, with
Norwegian as the default language. User-authored calendar content remains in its
original language.

Calendar creation from the browser, door opening, door contents, editing,
authentication, invitations, and production deployment belong to later tasks.
This increment uses the existing API without user context; it does not implement
the final product's calendar access rules.

## Requirements

1. Provide a calendar page at `/calendars/<id>`, where `id` identifies a stored
   calendar. Direct navigation and page refresh must work.
2. The root page redirects to the existing local example calendar. Its ID is
   `5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026`; preserve the existing development-only,
   explicitly enabled, idempotent seed. Do not create a calendar on page load.
3. Display the retrieved calendar title at the top and exactly 24 numbered doors
   below, ordered 1 through 24. Read both title and door numbers from the API
   response backed by PostgreSQL. Do not substitute hardcoded title/door data
   when a request fails.
4. Keep the page simple and usable on narrow and wide screens. Doors are static
   tiles without opening behavior; do not display their text contents.
   Apply the shared interface localization rules to application-owned text.
5. Complete the read flow through browser -> tRPC BFF -> generated TypeScript
   HTTP client -> ASP.NET Core API -> repository -> PostgreSQL, with the retrieved
   result returned to the page. Backend connection configuration and the generated
   backend client remain in server code.
6. Use the agreed TypeScript/React/TanStack Start/Router/Query stack under
   `src/frontend`, tRPC with `@trpc/tanstack-react-query`, Zod input validation,
   Tailwind through Vite, and maintained shadcn/ui component source.
7. Server-render the initial calendar through the BFF and hydrate its query data
   for the browser. Use a separate QueryClient and mutable context per server
   request. Browser queries use the same BFF operation and calendar-specific keys.
8. Handle loading, malformed IDs, missing calendars, and failed backend requests
   with understandable page states. Preserve the agreed BFF error mapping,
   cancellation, total deadline, and single-owner retry policy.
9. Generate TypeScript DTOs and the HTTP client from the existing authored OpenAPI
   document with NSwag, alongside the existing C# generation. Keep generated
   output untracked and regenerate before development/build/type checks in local
   and CI workflows. A clean checkout must build without a running backend.
10. Extend local Compose and the existing launcher to start frontend/BFF, API,
    and PostgreSQL, waiting for readiness in that order from database to frontend.
    Print the reachable frontend URL and retain access to the API URL. Repeat
    startup must preserve database data and avoid duplicate application instances.
11. Support PostgreSQL-only Compose with host `pnpm dev` and `dotnet watch`, as
    required by the architecture. Document host/container connection settings,
    startup commands, and the example calendar URL.
12. Verify a real database-backed page and actual browser/BFF communication,
    focused BFF behavior, SSR/hydration, clean generation/build, and local startup.
    Extend setup/doctor and local/CI quality coverage for the frontend toolchain.
13. Use Paraglide JS for Norwegian and English interface translations. Default
    to Norwegian and provide a language selector for English and Norwegian.
    Translate labels, prompts, interface text, loading/status messages, and
    user-facing errors. Keep SSR and hydration in the same selected language,
    with request-isolated locale state and the correct HTML language attribute.
14. Preserve calendar titles and all other user-authored content in their original
    language. Language switching must not translate or modify stored content,
    require multiple language versions, or introduce localized content fields.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed decisions and repository context

- Implementation uses `feature/calendar-frontend` from synchronized `main` at
  `f38bd4e`. The original quality baseline was archived before recording this
  task's unchanged source baseline. Completion evidence and platform/dependency
  limitations are in [frontend verification](../../src/frontend/verification.md).
- Norwegian is implemented as Bokmål (`nb`) and English as `en`. Paraglide uses
  the selected-language cookie followed by the Norwegian base locale. Switching
  languages reloads the same URL so SSR/hydration and the HTML language attribute
  agree. No browser-language autodetection overrides the requested default.
- Stable Nitro 2.13.4 packages the Start fetch entry and client assets using its
  build API, preserving the selected Node production command without adopting
  the Nitro 3 beta Vite plugin. The Node adapter propagates client disconnects.
- Shared frontend commands are `node tools/frontend/check.mjs`
  `install|generate|dev|typecheck|test|build|lint|check`; browser verification uses
  `node tools/frontend/smoke.mjs` against a started environment. CI uses the same
  generated contracts, explicit type checking, tests, builds and Biome rules.

- The owner requested a new feature plan for a simple title and 24 numbered,
  non-opening doors, with end-to-end communication to the database and back.
- On 2026-10-13 the owner confirmed calendar selection by ID in the URL, a root
  redirect to the local example, and read/display-only scope without browser
  calendar creation.
- On 2026-10-13 the owner added Norwegian as the default interface language and
  English as an alternative, then selected Paraglide JS. Translation is limited
  to application-owned interface text, labels/prompts, and user-facing errors;
  user-authored content does not need multilingual support. This scope is owned
  by the [interface localization rules](../rules/architecture.md#interface-localization).
- Planning starts from synchronized `main` at `40c4ab7` on
  `plan/calendar-frontend`. The owner explicitly requested switching to `main`
  and fast-forwarding before creating this branch.
- Plan 00005 has implemented `GET /calendars/{id}`, returning a persisted UUID,
  title, 24 ordered doors, and UTC timestamps. Unknown UUIDs return 404;
  malformed UUIDs return 400, using authored ProblemDetails.
- The existing `LocalSeed` creates `Local advent calendar` with the fixed ID
  above only in Development with `LocalSeed:Enabled`. It preserves existing data.
- At planning time `src/frontend` did not exist and `src/contract/nswag.json`
  generated only C#. Implementation adds both frontend/BFF and TypeScript
  generation while preserving shared backend commands and C# generation.
- At planning time `compose.yaml` ran database and backend, with readiness checks and
  a named persistent database volume. `tools/development/run-local.mjs` and its
  PowerShell/Bash wrappers already select Docker or Podman and wait for the API.
  Implementation extends this workflow to the healthy frontend and prints both URLs.
- Follow [architecture rules](../rules/architecture.md),
  [API contract rules](../rules/api-contracts.md), and
  [development quality rules](../rules/development-quality.md). Authentication,
  membership, future-content filtering, and opening schedules remain follow-up
  work under [calendar access rules](../rules/authentication-and-calendar-access.md).
- Verify compatible, supported, security-patched exact dependency/tool/image
  versions against official sources during implementation. Preserve the accepted
  Start release-policy exception as applicable; dated architecture baselines are
  not proof of compatibility. Pin packages and retain lockfiles.

### 1. Establish the frontend and shared generation

- [x] Capture the required quality baseline before implementation; preserve
  existing reports and document unavailable evidence.
- [x] Create `src/frontend` with pinned pnpm tooling, React, TanStack Start,
  Router/Query, Vite, tRPC, Zod, Tailwind, and the shadcn/ui components needed for
  this page. Add package scripts, TypeScript configuration, and ignore rules.
- [x] Configure NSwag TypeScript generation in `src/contract`, preserving UUIDs
  and UTC date-times as strings and the authored wire names. Exclude generated
  output from Git and authored-code quality analysis.
- [x] Share contract lint/generation commands between backend and frontend
  consumers and CI. Generate before compilation without relying on a running
  API; preserve existing C# generator behavior.
- [x] Provide explicit type checking, Vite build, and the Nitro production output.
  Verify `.output/server/index.mjs` and its Node.js LTS start command against the
  actual pinned stack. Update setup/doctor, shared prerequisites, and documentation.
- [x] Add pinned Paraglide JS tooling and maintained Norwegian/English message
  catalogs. Generate translation functions before development/type checks/build
  using the shared local/CI workflow; exclude generated output from Git and
  authored-code analysis. Verify integration with the selected Start/Vite versions.

### 2. Implement the BFF calendar query

- [x] Add a tRPC retrieval procedure accepting a calendar UUID validated with
  Zod, calling the generated backend client in server-only code.
- [x] Keep API base URL configuration and call state request-scoped where
  mutable. Configure service DNS inside Compose and localhost URLs for host work;
  prevent backend configuration/client code from entering browser bundles.
- [x] Apply the repository's configurable 10-second total deadline, caller
  cancellation, and at most one GET retry for network failures or 502/503/504,
  with a 250-500 ms delay inside the remaining deadline. Disable corresponding
  TanStack Query retries for browser and SSR requests.
- [x] Translate ProblemDetails and transport errors using the agreed tRPC codes,
  retaining structured field errors. Distinguish invalid input, missing calendar,
  unavailable backend, timeout, and unexpected failure.
- [x] Emit structured BFF JSON logs and propagate valid W3C trace context to the
  API, with request-scoped trace IDs also for SSR and concurrent calls.

### 3. Build the calendar page and hydration

- [x] Add `/calendars/<id>` through TanStack Router and the root redirect to the
  fixed local example ID. Keep the example shortcut explicit in documentation;
  show a missing-calendar state if the seed is unavailable.
- [x] Prefetch calendar data through the BFF in the initial route load, using
  request-local QueryClient/context and Start's Query hydration integration.
  Reuse the same typed query for browser retrieval without duplicating fetch logic.
- [x] Render the response title as the main heading and the retrieved door numbers
  as a simple responsive grid of static tiles. Use stable keys and semantic markup;
  do not make tiles interactive or render door text.
- [x] Provide loading and error states for invalid IDs, unknown IDs, and unavailable
  data. Avoid a successful-looking fallback calendar when retrieval fails.
- [x] Add a Norwegian/English language selector and translate application-owned
  page text and error states through Paraglide. Default to Norwegian and keep
  the selected language consistent across SSR and hydration, isolated per request.
  Set the HTML language attribute and preserve the retrieved title as written.
  Display localized error messages for the known BFF error outcomes rather than
  exposing backend English prose directly to the user.

### 4. Integrate local startup and CI

- [x] Add a frontend/BFF Dockerfile and Compose service with a readiness check
  and a dependency on the healthy API. Preserve database/API health checks,
  bounded startup, and persistent storage.
- [x] Extend `run-local.mjs` and its existing tests to wait for frontend readiness,
  print the frontend calendar URL and API URL, and report startup failures.
  Reuse runtime selection and the existing PowerShell/Bash wrappers.
- [x] Document PostgreSQL-only Compose plus host backend/frontend development,
  including contract generation and avoiding duplicate application services.
- [x] Add focused Vitest checks for BFF validation, error mapping, retry/deadline
  behavior, and request isolation. Use the repository's Given/When/Then conventions.
- [x] Verify translated error states and language switching, including unchanged
  calendar titles and isolated language state in concurrent SSR requests.
- [x] Share frontend generation/type-check/test/build commands with GitHub Actions.
  Use immutable action/image pins. Extend saved-source/staged and CI lint coverage
  for TypeScript/TSX/CSS and disclose unsupported analyzer dimensions.
- [x] Update root project documentation, architecture implementation status,
  frontend workflow documentation, and verification evidence. Keep agent workflow
  instructions under `.agents/`.

### 5. Verify and record the result

- [x] Perform the checks below against the actual running stack and final source.
  Record actual platform/runtime evidence separately from simulated tests and
  carry forward earlier explicit platform deferrals without claiming coverage.
- [x] Update this plan and its index to the dated implemented status only after
  the feature has been implemented and verified.

## Verification

- Start the full local stack with the existing launcher and open its frontend
  URL. Verify the redirect, stored sample title, and exactly 24 ordered numbered
  tiles. Confirm the page works at narrow and wide widths without opening doors.
- Create two calendars with distinct titles using the existing API, then navigate
  to each returned ID in the browser. Verify the corresponding stored title and
  door numbers, including direct navigation, refresh, and restart of the stack.
  This demonstrates database-backed selection rather than frontend sample data.
- Inspect SSR HTML and hydrated browser state for the expected calendar. Verify
  hydration does not unexpectedly repeat the initial fetch or show warnings.
- Verify Norwegian interface text on initial use, switch to English and back,
  and check labels/prompts, loading/status messages, and error states in both
  languages. Verify the HTML language attribute and matching SSR/hydration output.
- Retrieve a calendar with a distinctive user-authored title and verify the title
  and stored data remain unchanged when the interface language changes. Confirm
  no translation or per-language storage of user-authored content is introduced.
- Trigger a browser query/refetch and inspect the tRPC request, BFF/API logs, and
  returned data. Initial SSR alone is insufficient evidence of browser/BFF HTTP
  communication. Confirm the browser does not call the backend directly.
- Verify malformed and unknown UUIDs and a backend outage produce the intended
  page states without fabricated calendar data. Test ProblemDetails and transport
  error mapping, bounded retries, deadline expiry, and cancellation with Vitest.
- Exercise concurrent requests for different IDs and verify isolated SSR query
  caches/context, the correct title per response, and correct trace correlation.
  Include different selected interface languages to verify locale isolation.
- From a clean checkout without generated files, run contract validation,
  dual-language generation, backend build/tests, frontend type checks/Vitest,
  and the Vite/Nitro production build. Start the built frontend successfully.
- Verify full Compose startup/readiness and persistent data on repeat launcher
  execution; also run PostgreSQL-only Compose with host backend/frontend.
  Record Docker/Podman/platform coverage and any explicitly deferred evidence.
- Run relevant saved-source lint, setup/doctor readiness checks, and final quality
  comparison. Confirm invalid/corrected frontend lint fixtures fail/pass the shared
  local and CI rules; document measurement limitations and findings.
