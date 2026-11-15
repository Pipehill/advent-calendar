# 00026: Fix interface language switching in Vite development

Status: Not implemented

Last updated: 2026-11-15

Implementation type: bugfix

Resolve the inherited TODO where selecting English leaves Norwegian interface
text in three development browser smoke cases, while the equivalent production
cases pass. Earlier implemented plans recorded this as a follow-up rather than
delivering a dedicated fix. This plan owns investigation, correction and evidence
for that remaining defect; it does not rewrite their verification history.

## Requirements

1. Selecting English or Norwegian updates application interface text and the HTML
   language consistently in Vite development, survives reload/navigation and has
   the same observable language behavior in production Nitro.
2. Preserve the established cookie-first, Norwegian-default language policy.
   A new visitor remains Norwegian even with English browser preferences. The
   language switch stays on the same route and preserves its relevant URL state;
   English route names remain identical across interface languages.
3. SSR, initial browser hydration and subsequent rendering agree on the selected
   locale. Concurrent requests/browser contexts with different language cookies
   remain isolated; one visitor cannot change another visitor's output.
4. Translate application-owned interface/errors while preserving authored names,
   calendar titles, door messages and stored values exactly. Language selection
   must not change authentication, roles, calendar access, CSRF or no-store policy.
5. Reproduce and identify the reported development failures against current HEAD,
   then verify the corrected equivalent scenarios in both modes. Keep meaningful
   assertions; do not hide the defect with language-test exclusions, longer waits,
   hardcoded English labels or an unverified global locale override.

## Outstanding questions

None at the product level: the existing architecture rules define the language
policy and the TODO asks for parity with production. The root cause and current
reproducibility are investigation tasks, not owner decisions. If fixing the
confirmed cause requires a new dependency, unsupported version change or a major
localization design change, record that consequential choice here for the owner
before dependent implementation; no such change is pre-approved by this plan.

## Implementation details

### Repository facts and investigation starting points

- [Plan 00010](00010-simplify-developer-tooling.md) records three inherited Vite
  language-switch failures and owner acceptance of that follow-up on 2026-10-25.
  [Plan 00011](00011-login-and-my-page.md) explicitly left it unresolved. Later
  Vite login/recipient checks are not proof that these language cases were fixed.
  The current smoke suite has evolved, so identify the affected scenario names
  and assertions instead of assuming its historical test count still applies.
- `src/frontend/vite.config.ts` configures `paraglideVitePlugin` with
  `strategy: ['cookie', 'baseLocale']`. `project.inlang/settings.json` defines
  `nb` as the base locale and `nb`/`en` message catalogs.
- `components/language-selector.tsx` uses generated `getLocale`/`setLocale`;
  `routes/__root.tsx` gets the HTML language from that runtime.
  `src/frontend/src/server.ts` wraps SSR in generated `paraglideMiddleware`.
- `server/localization.test.ts` already tests Norwegian default and concurrent
  middleware requests with separate `PARAGLIDE_LOCALE` cookies. Those unit tests
  do not exercise Vite's actual SSR module graph and browser hydration.
- `package.json` has both an explicit translation-generation command and Vite
  plugin generation. The command does not visibly specify the Vite strategy.
  Inspect the pinned compiler's actual output and invocation order; differing
  generation options are a hypothesis, not a confirmed cause.
- Existing browser evidence is owned by
  [frontend verification](../../src/frontend/verification.md). Use
  [frontend browser instructions](../../src/frontend/README.md#browser-verification),
  `tools/frontend/smoke.mjs`, `browser/smoke.test.mjs` and relevant authenticated
  browser cases rather than introducing another runner.

### Agent-selected work order

Implementation commit boundaries: iteration 1 records reproduction/investigation
and baseline regression coverage (steps 1–3); iteration 2 corrects the demonstrated
cause and verifies focused unit/browser behavior (steps 4–6); iteration 3 completes
the full mode/quality review, documentation and publication (step 7). A failing
baseline is evidence for iteration 1, not a claim that the fix is complete.

1. [x] Start an isolated development stack through the existing launcher, without
   changing the owner's running data. Run the current smoke scenarios and capture
   failing names, exact expected/actual text, URL, cookie, response HTML, DOM locale,
   hydration errors and tool versions. Run equivalent cases against production
   Nitro built from the same source and message inputs.
2. [x] Trace selection, cookie persistence, incoming SSR cookie, middleware locale,
   server-rendered labels and browser hydration as separate observations. Inspect
   request-local locale storage/module identity in Vite and generated runtime
   strategy/output after CLI generation, Vite startup and hot reload. Check whether
   browser and SSR code are loading distinct or stale generated module copies.
3. [x] If the historical failures no longer reproduce, document the precise current
   evidence and locate the intervening fix before changing code. Establish
   regression coverage for the actual language flow; do not manufacture a fix or
   report old failures as current observations.
4. [x] Correct the demonstrated cause at its owning compiler configuration,
   runtime integration or supported Vite SSR boundary. Keep existing pinned
   dependencies unless evidence shows an update is necessary. Do not patch
   ignored generated files, bypass request-local storage or maintain separate
   message catalogs for development and production.
5. [x] If compiler-option drift is confirmed, use one maintained source for the
   relevant generation options across CLI, Vite and verification. If module
   identity is the cause, repair the integration at that boundary instead. Follow
   the evidence rather than implementing both speculative remedies.
6. [x] Add regression coverage at the smallest seam that reproduces the real
   failure, plus actual browser verification in both modes. Keep the existing
   concurrent middleware tests and add server-rendered/browser assertions so a
   hydrated DOM alone cannot mask a language mismatch.
7. [ ] Update the current frontend documentation and verification record with
   baseline, cause, affected paths, correction, mode-specific results and remaining
   platform limitations. Close the local TODO item only after the fix/evidence
   meets the requirements. Preserve all implemented plans as historical records.

### Implementation decisions and resume record

- The owner authorized autonomous choices without questions and explicit PR
  documentation. Plans 00023/#60 and 00024/#61 are green and ready for review;
  this final plan starts independently from clean synchronized `main` at `58fc70b`.
- Baseline captured before edits; previous baseline archived under
  `quality-reports/health/baseline-before-00026-20261115`.
- Preserve pinned dependencies and the cookie-first Norwegian-default policy.
  Diagnose the selection/cookie/SSR/hydration boundary before choosing a fix;
  compiler-option drift remains a hypothesis until demonstrated.
- Iteration 1 baseline: unchanged Vite passes 7/8 smoke checks; the landing switch
  expects `en` but retains `nb`. Identical-source Nitro passes 8/8. The historical
  anonymous calendar cases are now protected, so the current equivalent matrix
  includes authenticated calendar/error paths rather than reviving anonymous reads.
- A fully hydrated login selection proves the existing cookie setter, incoming
  request, raw SSR and hydrated DOM agree in both languages. The compiler options
  differ between standalone CLI and Vite, but both prioritize the cookie; that
  drift is not the demonstrated cause and is intentionally left unchanged.
- Controlled script loading proves the defect: SSR offers an enabled native
  selector before React attaches its handler. Selecting English does not set a
  cookie; after hydration the cookie/document stay Norwegian while the native
  select can still display English. Cold selection also observes same-document
  hydration navigation (`waitForNavigation` returns null), explaining why the old
  smoke proceeded without a successful language document reload.
- Added nine normal browser regression cases and an opt-in actual Vite HMR probe.
  Baseline cold/script-held cases fail as expected; the hydrated transport probe
  passes. Node syntax/diff checks pass. Raw evidence is in
  `quality-reports/plan00026-baseline-*.log`, the saved failing smoke XML and
  `quality-reports/plan00026-cold-baseline.log`.
- Iteration 2 fix: use the already-pinned router's `useHydrated()` and native
  `disabled` attribute. Its server and first hydration snapshots are false, then
  it enables the control after handlers attach. No locale resolver, compiler
  configuration, dependency or generated file is patched.
- Clean-output verification: removed only the verified ignored translation output
  directory and ran normal CLI generation, 251 frontend/BFF tests, explicit
  TypeScript, production Nitro packaging and Biome successfully. The unchanged
  Vite smoke now passes all 8 checks. Nine focused locale cases pass in both Vite
  and Nitro; actual My page/localized-404 and actual Vite HMR cases also pass.
  The HMR probe waits for a real Vite event, restores source timestamps and
  verifies the selector content hash remains unchanged.
- Corrected browser evidence capture to read each raw response before subsequent
  navigation can evict it, and wait for an actual main-frame HTTP response rather
  than treating same-document history changes as language reloads. Assertions
  remain cookie/request/raw SSR/hydrated DOM checks without fixed readiness waits.
- Normal coverage now includes ten locale cases plus a dedicated opt-in HMR case.
  New tests avoid assumptions about PR #60's required-form field count and PR
  #61's recipient post-login destination, preserving independent plan integration.
- Next unfinished step: iteration 3 full final production and Vite checks,
  documentation, TODO closure and committed-head review before publication.

### Dependencies and verification scope

This investigation can be implemented independently and is useful before the
new bilingual UI/browser work in plans
[00023](00023-restricted-session-password-setup.md),
[00024](00024-login-progress-and-calendar-routing.md) and
[00025](00025-recipient-interface-and-locked-door-feedback.md). Those plans remain
responsible for their own new messages and behavior; this plan owns the shared
development-language defect. No backend/API/schema change is expected.

Use isolated existing fixtures and remove only processes/containers created for
verification. Do not reset development volumes or change language preferences in
the owner's active browser profile to obtain a clean test.

## Verification

| Requirement | Evidence to collect during implementation |
| --- | --- |
| 1, 5 | Name the historical/current equivalent failures and record before/after Vite and Nitro results from identical source. English then Norwegian selection, reload and navigation show correct translated labels without fixed waits or skipped assertions. |
| 2 | New context with English Accept-Language still renders Norwegian. Valid language cookie wins; missing/invalid cookie safely falls back. Language switching preserves the URL path and relevant query state. |
| 3 | Assert server response HTML language/text, first hydrated DOM and no hydration/page errors. Overlap real SSR requests/independent contexts with opposite locales; exercise reload and Vite hot updates without cross-request locale contamination. Existing middleware isolation tests remain green. |
| 1, 4 | Check landing, login, required/voluntary password UI, My page and recipient/administrator calendar interfaces, including translated errors. Use unchanged Norwegian/Unicode authored names, titles and door text while switching languages. |
| 4 | Login/logout, cookie allowlisting, CSRF-bound mutations, role checks, no-store and protected SSR/cache isolation retain their current behavior in both modes. Language selection does not issue content writes. |
| 5 | From a clean generated-output state, exercise normal CLI generation followed by Vite and production build/start. Run affected unit/browser tests, explicit TypeScript/build checks and the required full quality/health review for the actual code/configuration diff. Record unavailable native-platform evidence without claiming it passed. |

## Sources checked on 2026-11-15

Paraglide documents ordered locale strategies in its
[strategy guide](https://paraglidejs.com/strategy) and request-isolated rendering
in its [SSR guide](https://paraglidejs.com/server-side-rendering). Treat current
documentation as a guide and verify behavior against the repository's pinned
Paraglide version; it does not establish this defect's root cause.
