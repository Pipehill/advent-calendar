# 00024: Login progress and direct routing to a single assigned calendar

Status: Not implemented

Last updated: 2026-11-15

Implementation type: feature

Keep the login form stable and visibly busy until authenticated navigation
completes. After login, send a calendar user with exactly one assigned calendar
directly to that calendar; use My page when there are multiple calendars. These
two open TODO items share the login-to-destination transition and belong together.

## Requirements

1. Keep the entered login values in their existing form fields until navigation
   away from the login document completes. A successful login must not briefly
   display an empty, enabled login form while the destination is loading.
2. Show a visible loading spinner with localized accessible status throughout
   login and subsequent authenticated navigation. Prevent duplicate submission
   during either phase. A failed login retains the inputs and allows correction
   and retry with a clear error.
3. For an unrestricted `calendarUser`, determine the destination from current,
   authorized assignments: exactly one goes to the existing `/my-calendars/{id}`;
   multiple go to `/my-page` to choose. Zero assignments use the existing My page
   empty state. Count all current assignments without a new year/content filter.
4. Mandatory-change sessions go to `/change-password` before any calendar lookup.
   Unrestricted administrators continue to use `/my-page`. Check the backend
   session and recipient permissions independently of browser-provided state.
5. Keep `/my-page` usable as an explicit destination, including the return link
   from a single calendar. Automatic single-calendar routing applies to the
   post-login transition rather than every My page visit.
6. Preserve the document-navigation cache/session boundary, no-store responses,
   principal-bound CSRF handling and fresh authorization on the target calendar.
   Assignment/session changes during navigation must fail safely without exposing
   another user's cached list, door text or images.

## Outstanding questions

None identified from the TODO request and current navigation conventions.
Routing only after login, the existing empty-list page and existing recoverable
list-error UI provide the boundary cases. Any new consequential uncertainty found
during implementation must be recorded here for the owner, who explicitly deferred
clarification on 2026-11-15.

## Implementation details

### Repository facts

- `components/credential-form.tsx` calls `formApi.reset()` immediately after
  `context.auth.login`, then calls `leaveSession`. Its busy state subscribes only
  to `form.isSubmitting`, and renders pending text without a spinner.
- `lib/auth-navigation.ts` clears the QueryClient and uses
  `window.location.replace`. Its comment identifies document navigation as the
  boundary that discards protected route data, mutation inputs and CSRF state.
  Preserve that security property when fixing the visible transition.
- Login currently chooses only `/change-password` or `/my-page` using the returned
  session. The login mutation refreshes principal-bound CSRF before returning.
- `/my-page` validates the live session and prefetches the authorized recipient
  list. `recipient.list` already returns `totalCount` and calendar metadata with
  backend filtering and a session-bound cache scope; no new list endpoint or
  database schema is needed.
- `lib/recipient-navigation.ts` independently validates a recipient detail visit.
  `RecipientCalendar` has an explicit My page return link. Neither should become
  an unconditional single-calendar redirect.

### Agent-selected implementation approach

1. Introduce a small post-login entry route, proposed `/login-complete`, whose SSR
   loader validates the current session, prioritizes mandatory setup and resolves
   the role-specific destination. Keep this route separate from the explicit
   `/my-page` list to prevent a back-link redirect loop. It carries no credentials,
   caller-selected identity or arbitrary redirect URL.
2. For an unrestricted calendar user, request the first page of the authorized
   recipient list with a small limit such as two and the fresh session scope.
   Redirect directly only when `totalCount === 1` and the response contains that
   one calendar. Use the backend total rather than first-page length; paginate
   neither every assignment nor owner/superadmin calendars just to choose a route.
3. Use server redirects so the intermediate entry does not render a second login
   form. Continue through the normal recipient route authorization. On a list
   service failure, fall back to My page's recoverable list UI; an invalid session
   returns to login. Do not replay the login write to retry destination selection.
4. Remove the successful-login reset before navigation, and keep a separate
   navigation-pending latch after login succeeds. Render pending while submitting
   or navigating, with a spinner from the already installed Lucide library,
   `aria-busy` and localized status text. Preserve input values/masking until the
   current document is discarded; do not copy passwords into storage, route data,
   a global store, query caches or logs.
5. Keep failure handling distinct: rejected credentials return to an editable
   form; successful authentication followed by a destination error uses protected
   route error/retry behavior. A retry must resolve navigation, not resubmit saved
   credentials. Handle a synchronous navigation failure without clearing values
   or leaving the submit action permanently busy.
6. Update browser helpers that currently assume every ordinary login lands on
   `/my-page`. Preserve scenario intent: list-selection tests can visit My page
   explicitly, while the new login tests must observe the real chosen destination.
   Do not weaken account switching, restricted-login or protected-cache assertions.

### Dependencies and work order

[Plan 00023](00023-restricted-session-password-setup.md) shares `CredentialForm`
and `/change-password`; implement either first, then reconcile both modes.
[Plan 00025](00025-recipient-interface-and-locked-door-feedback.md) adjusts recipient
controls. [Plan 00026](00026-vite-development-language-switching.md) owns the inherited
Vite language defect; this plan still verifies its new text in both languages.

- [x] Iteration 1: add the SSR post-login entry route and destination helper;
  verify live session, role, scoped assignment counts and failure cases with unit
  tests before committing.
- [x] Iteration 2: preserve form values, latch pending navigation and add an
  accessible localized spinner; verify frontend unit/type/build/lint checks and
  commit the form change.
- [ ] Iteration 3: add delayed login/document browser coverage and actual assignment
  counts/races; adapt explicit helper destinations, verify production and focused
  Vite behavior and commit the browser integration.
- [ ] Iteration 4: update frontend documentation and verification, complete full
  quality and advisory comparisons, commit completion and publish the PR.

### Implementation decisions and resume record

- The owner authorized autonomous choices without questions; record material
  choices/uncertainties in this plan and the PR. Each implementation branches
  independently from `main` and targets `main`.
- Plan 00023 is green in PR #60 before this work begins. This branch starts from
  synchronized clean `main` at `58fc70b`, keeping the PR independent rather than
  including that unmerged implementation. Keep form edits focused so its required
  setup mode can merge with this login-only behavior.
- Use the planned `/login-complete` server entry and existing recipient list total
  with limit two; no backend endpoint, schema, dependency or product filter changes.
- Baseline captured before edits; prior baseline archived as
  `quality-reports/health/baseline-before-00024-20261115`.
- Iteration 1: nineteen destination-selection cases pass (32 focused navigation
  tests; 270 frontend/BFF tests before the pending coordinator cases). Restrictions,
  administrators, zero/one/many/inconsistent assignment totals, fresh scopes,
  uncached reads and service/revocation failures are covered. Session service
  errors retain a fixed GET retry link to `/login-complete`, never a login replay.
  Route-tree generation and full TypeScript/build integration follow in iteration 2.
- Iteration 2: all 273 frontend/BFF tests, production Vite/TypeScript/Nitro build
  and Biome pass. A per-form coordinator retains only accepted/pending flags;
  synchronous navigation retry never replays credentials. A form ref also guards
  duplicate submission before React renders its disabled button. Login values
  are not reset; localized spinner/status remain through document replacement.
- Browser measurement decision: Chromium suspends old-frame script inspection
  during held native navigation. Verify actual fields/status before navigation
  and at `beforeunload`, then compare direct compositor PNGs while the destination
  response is held. The reduced-motion/caret-hidden viewport is byte-identical;
  artifacts contain masked fields only. Bounded gates and unconditional release
  prevent test cleanup from deadlocking. The first Norwegian case passes.
- Next unfinished step: iteration 3 complete production/Vite browser regressions.

## Verification

| Requirement | Evidence to collect during implementation |
| --- | --- |
| 1, 2 | Hold the login response, then hold the destination document response after authentication succeeds. At both points assert original username/masked password values, a visible spinner/status and disabled submit; confirm one login mutation and no empty-form flash before the final destination. Failed credentials keep values and restore an editable form. |
| 3 | Real recipient fixtures with zero, exactly one, two and more-than-one-page assignments reach the intended route. Include calendars from different years and an empty-content single calendar to ensure no invented filtering. Verify reload at the chosen calendar and My page chooser selection. |
| 4 | Required administrator setup bypasses recipient lookup and reaches password setup. Both unrestricted administrator roles reach My page without recipient calls. Forged browser roles, stale cache scopes and unrelated calendar IDs grant no access. |
| 5 | A one-calendar user can open My page directly and use the calendar's return link without looping; multiple-calendar users can choose, return and choose another calendar. |
| 6 | Reassign/remove the sole calendar or revoke/disable/change the session between login, list selection and detail load. Existing recipient authorization/error handling withholds content; switch accounts without stale metadata/images. Verify no-store and normal cookie/CSRF handling. |
| 2, 6 | Check spinner/status in Norwegian and English, reduced motion, keyboard and mobile layouts, SSR/hydration and no password persistence/logging. Run focused unit/BFF and delayed-navigation browser cases in Vite and production Nitro, then required type/build and quality verification. |
