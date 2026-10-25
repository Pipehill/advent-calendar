# 00013: Frontend user administration

Status: Implemented (2026-10-25)

Last updated: 2026-10-25

Implementation type: feature (confirmed by the owner on 2026-10-25).

## Overview

Let administrators create and maintain accounts from the frontend and see the
results in their authorized user list. Superadmins can create calendaradmins and
calendar users; calendaradmins can create calendar users. Include password reset,
enable/disable and role changes according to the existing backend permissions.
Build on the existing account operations and protected personal page from
plan 00011, with a dedicated page for the account-creation form.

Calendar lists requested alongside this task are recorded separately in
[TODO](TODO.md).

## Requirements

1. Provide an enabled account-creation button on `/min-side` for unrestricted
   superadmins and calendaradmins. Activating it navigates to a dedicated page
   with the account-details form. Protect direct navigation and refresh as well.
2. Superadmins choose between `calendarAdmin` and `calendarUser` in the form.
   Calendaradmins can create only `calendarUser` accounts, with no role selector
   permitting administrator creation. Ordinary users have no administration UI.
3. Collect the existing required account details: display name, username and an
   initial temporary password. Apply the established Unicode name/username rules
   and role-aware password policy; do not add email, invitations or public signup.
4. When a superadmin creates a calendar user, require selection of an existing
   responsible calendaradmin. When a calendaradmin creates one, derive that
   responsibility from the authenticated creator. Do not send a responsibility
   value for calendaradmin creation or calendaradmin callers.
5. Show all accounts to superadmins, extending their existing list with permitted
   maintenance actions and localized enabled/disabled status.
   Add a list for calendaradmins containing only their assigned ordinary users,
   using backend filtering. Show name, username and localized role labels, with
   usable pagination and loading, empty and error states.
6. After successful creation, show confirmation and the new account visibly in
   the authorized list without a manual browser reload. Handle accounts inserted
   outside the currently displayed page. Do not claim success before API success
   or show a failed submission as a persisted account. Preserve the acting
   administrator's session and identity.
7. Enforce all role, responsibility and unrestricted-session checks independently
   in the backend and BFF. Account creation and maintenance must retain recent
   administrator password verification, CSRF protection, fixed session deadlines,
   no-store responses and protected-cache isolation. Support re-verification when
   needed.
8. Retain temporary-password behavior: initial, reset and promotion credentials
   expire after 30 minutes and the recipient must change them before ordinary use.
   Explain the private handover and expiry to the administrator. Keep passwords out of
   response DTOs, lists, URLs, logs, persisted browser state and SSR/hydration.
9. Use TanStack Form, Zod, shadcn/ui and maintained Norwegian/English Paraglide
   messages. Show field validation, duplicate-username conflicts and operation
   failures accessibly. Prevent duplicate submissions while a request is pending;
   do not automatically retry writes.
10. Let calendaradmins reset passwords only for their assigned accounts that
    currently hold `calendarUser`. Let superadmins reset passwords, enable/disable
    and change roles of nonsuperadmin accounts. Provide no other-account
    maintenance actions for superadmin targets and no account deletion or profile
    editing. Keep the existing own-password-change flow separate.
11. Support `calendarUser` to `calendarAdmin` promotion and the reverse only for
    superadmin callers. Promotion requires a different administrator-compliant
    temporary password supplied by the superadmin. Preserve fixed responsibility
    across role changes; require selection on first demotion and reuse the original
    calendaradmin on subsequent demotion only if that account still holds the role.
    Block demotion while ordinary users remain attached. Show these conflicts
    without suggesting reassignment as a workaround.
12. Refresh the authorized list after successful maintenance so enabled status and
    roles reflect persisted state. Reset and promotion revoke the target's sessions;
    status and role changes retain the existing backend session invalidation.
    Disabling a calendaradmin does not disable their users. Do not imply that
    enabling an account restores previously revoked sessions.
13. Keep calendar creation, calendar assignment/access enforcement, calendar
    listing and door opening in their respective follow-up tasks. Account
    creation alone grants no calendar access. Preserve implemented plans as
    historical records.

## Outstanding questions

None.

## Implementation details and work order

### 1. Preserve the confirmed scope and account model

The owner confirmed on 2026-10-25 that this increment includes password reset,
enable/disable and role changes under existing permissions, and that creation
uses a separate form page.

| Operation | Calendaradmin | Superadmin |
| --- | --- | --- |
| Create account | Calendar users only; responsibility derived from caller | Calendaradmins or calendar users; select responsibility for calendar users |
| List accounts | Assigned accounts currently holding the calendar-user role | All accounts |
| Reset another account's password | Assigned ordinary users only | Calendaradmin and calendar-user targets |
| Enable/disable another account | Denied | Calendaradmin and calendar-user targets |
| Change another account's role | Denied | Calendaradmin/calendar-user transitions with existing dependency and credential checks |

All mutations require an unrestricted administrator session and recent password
verification. Listing requires unrestricted role authorization without recent
verification. Superadmin account maintenance remains manual; responsibility is
fixed and cannot be reassigned through these forms.

- [x] Follow the current [authentication rules](../rules/authentication-and-calendar-access.md),
  [architecture rules](../rules/architecture.md) and
  [API contract rules](../rules/api-contracts.md).
- [x] Reuse `POST /users`, paginated `GET /users`,
  `POST /users/{id}/reset-password`, `PATCH /users/{id}/status`,
  `PATCH /users/{id}/role` and `POST /auth/reauthenticate` from
  `src/contract/openapi.json` and the generated client. The backend already
  enforces account creation permissions, responsible
  administrator validation and recent verification through `UsersController`,
  `UserAdministrationService` and the session/authentication services.
- [x] Keep manual-only superadmin provisioning, fixed responsibility, credential
  policy, temporary credential restrictions and account/session concurrency
  protections. This plan does not require a new account table or migration.
  Existing profile editing remains deferred by the account rules.

### 2. Extend the BFF and browser administration boundary

- [x] Extend `src/frontend/src/server/trpc.ts` and the account helpers currently
  in `src/frontend/src/server/auth.ts` with runtime-validated account creation,
  password reset, status changes, role changes and administrator re-verification.
  Validate sessions using the backend before exposing account administration.
  Never trust browser roles or creator IDs.
- [x] Extend the current superadmin-only `accounts.list` guard to accept an
  unrestricted calendaradmin as well. Preserve backend SQL scoping rather than
  downloading all accounts and filtering them in the browser.
- [x] Add reusable form/BFF schemas alongside `src/frontend/src/lib/auth-input.ts`
  or in a focused administration input module. Encode UUID target IDs,
  required booleans, allowed roles, conditional responsibility/promotion-password
  inputs, name normalization and Unicode code-point bounds.
  Backend validation remains authoritative, including common-password rejection.
- [x] Provide superadmins with selectable responsible calendaradmins from the
  authorized backend list, retaining IDs only where needed for selection. Load
  enough pages to reach eligible administrators beyond the first page. Show an
  actionable empty state when none exist; do not fabricate an administrator or
  create an unassigned calendar user. Revalidate the selection on submission.
- [x] Extend the current list projection of name, username and role with the
  account ID, enabled state and fixed responsible-administrator ID needed for
  authorized maintenance and demotion. Keep credential and creator/audit data
  out of personal-page hydration. Derive permitted controls from backend-validated
  session and account metadata; the backend independently rechecks each target.
- [x] Extend the request-scoped browser client in
  `src/frontend/src/lib/auth-client.ts` and its router context as needed. Reuse
  the principal-bound CSRF refresh and cookie allowlist for every mutation.
  Do not cache request tokens or create replacement tokens in the BFF.
- [x] Integrate recent password verification with `auth.reauthenticate`. Support
  an administrator whose session remains valid after the five-minute verification
  window. Show verification failures without treating every `FORBIDDEN` as a
  revoked login; distinguish access denial from a recoverable verification need
  without weakening the backend guard. Retain lockout and rate-limit handling.
- [x] Reuse generated-client error translation, structured field errors,
  cancellation and total deadlines. Keep all account/verification responses,
  including failures, no-store through tRPC, SSR and the production adapter.

### 3. Build the dedicated creation page and lists

- [x] Replace the applicable disabled controls in
  `src/frontend/src/routes/min-side.tsx` with navigation to the creation page.
  Use a general account-creation entry point for superadmins with a type choice;
  give calendaradmins the ordinary-user form. Preserve the calendar-creation
  placeholder and explain its unavailable state separately.
- [x] Add a dedicated protected route under `src/frontend/src/routes/` and a form
  component with compatible shared UI components, labeled inputs, masked password
  entry, pending state, field
  errors, submission errors and a cancel action returning to `/min-side`.
  Validate the session and administrator role on direct requests and reloads;
  keep submitted secrets out of route loaders and search parameters.
  Separate the recipient's temporary password from any acting-administrator
  verification password.
- [x] When changing the superadmin role choice, adjust conditional fields and
  validation so obsolete responsibility values cannot reach administrator-account
  creation. Display role-appropriate password guidance.
- [x] Extend `src/frontend/src/components/account-list.tsx` for both administrator
  scopes. Preserve pagination, render user-authored names as text and handle long
  Unicode names on mobile. Keep ordinary users out of account list queries.
- [x] Return to `/min-side` after confirmed creation, refresh the authorized list
  and make the returned account visible even when its username sorts onto a
  different page. Existing
  backend ordering is by normalized username and ID; invalidation of the current
  page alone does not guarantee the newly created row is visible.
- [x] Clear secret form values after success/cancellation and on session changes.
  Reuse protected-cache clearing on logout, expiry and account changes; never
  leave another administrator's list or drafts in the next user's view.
- [x] Add all new interface, validation, verification and success messages to
  `src/frontend/messages/nb.json` and `en.json`, preserving user-authored content.

### 4. Add maintenance actions to the authorized list

- [x] Add password-reset actions for each permitted target. Accept a replacement
  temporary password matching the target's current role policy, verify the acting
  administrator when required, and invoke the existing reset operation. Explain
  expiry, mandatory change, private handover and session revocation. Never return
  or redisplay the secret in a success message.
- [x] Add superadmin-only enable/disable and role-change actions for nonsuperadmin
  targets. Identify the selected account and operation clearly before submission;
  expose pending, success and error feedback. Calendaradmins receive neither
  status nor role-change controls. Superadmin rows remain view-only.
- [x] On promotion, collect a different administrator-compliant temporary password
  and omit responsibility changes. On demotion, omit the promotion password and
  preserve any existing association; request a responsible calendaradmin only on
  first entry to the ordinary role. Surface backend dependency conflicts and
  concurrent target changes without weakening checks or retrying automatically.
- [x] Refresh affected authorized account data after a successful mutation. Ensure
  a newly promoted user disappears from the former calendaradmin's ordinary-user
  list on its next authorized refresh, and role/status changes are reflected on
  superadmin pages. Recheck authorization on each mutation rather than treating
  an already-rendered row as continuing permission.
- [x] Clear reset, promotion and verification secrets on success/cancellation and
  session changes. Keep form errors and pending state tied to the selected target,
  so switching actions cannot apply a request or feedback to a different account.

### 5. Verify and document the increment

- [x] Extend focused BFF/schema tests and browser scenarios for the confirmed
  scope, including the changed calendaradmin list authorization expectations in
  `src/frontend/src/server/auth.test.ts`.
- [x] Reuse isolated PostgreSQL API coverage for the established permissions;
  extend backend contract/integration tests if backend behavior needs to change.
  Update authored OpenAPI before regenerating consumers for any required contract
  change; never edit generated files directly.
- [x] Update the current authentication rules, architecture description and
  frontend/backend documentation where the delivered increment changes them.
  Record actual verification in the existing verification documents. Preserve
  historical plan 00011 while documenting its superseded placeholder behavior
  here and in current documentation.
- [x] Run required code quality, health and relevant build/test workflows during
  implementation. Mark this plan and its index implemented only after completing
  the confirmed behavior and verification.

## Implementation notes

- Implementation branch: `feature/user-administration`; baseline: `92e218d`.
- Reused existing account operations without database schema/migration changes. Added
  an optional authored ProblemDetails `verificationRequired` boolean and regenerated
  both consumers to distinguish recent-verification expiry from other denials.
- Responsible-administrator options, target checks and new-account page location
  use authorized backend pagination within one total deadline; no new unrestricted
  browser list or account lookup endpoint was introduced.
- Creation success/focus metadata is transient router memory. Temporary and acting
  passwords stay in form/request memory, outside query/mutation caches and hydration.
- Browser coverage found and fixed repeated submissions during pending validation;
  a synchronous form guard prevents another write, including lost-response cases.
- Verification completed on 2026-10-25: 77 frontend tests, 172 backend tests,
  five sharpened backend boundary cases, 28 production browser scenarios and eight
  public/calendar smoke scenarios passed. Three final browser feedback/submission
  regressions passed after the last UI refinement. Builds, type checks, formatting,
  full quality and the final advisory comparison passed.
- Application health regresses 90.8 to 87.5; tooling changes 51.5 to 52.0. Required
  permission/form/test branches and small scaffold clones are documented in
  [frontend verification](../../src/frontend/verification.md#2026-10-25-plan-00013-account-administration),
  including source identities, unsupported metrics and inherited platform/Vite limits.
- Existing application containers, external build artifacts and data were preserved;
  disposable test containers were removed. No commit, push or PR was requested.

## Verification

- **Creation matrix:** verify superadmin creation of both assignable roles and
  calendaradmin creation of an ordinary user through the actual browser/BFF/API
  flow. Verify direct BFF/API denial for ordinary users, anonymous and restricted
  sessions, attempted superadmin creation and calendaradmin role escalation.
- **Responsibility:** require a valid selected administrator for a
  superadmin-created ordinary user; verify a calendaradmin creator is assigned
  automatically. Reject forged responsibility and invalid or stale role choices.
  Exercise zero administrators and administrators beyond the first list page.
- **Maintenance matrix:** exercise each allowed password reset, enable/disable and
  role change through the browser/BFF/API. Verify denied direct calls for ordinary,
  restricted and anonymous callers, calendaradmin status/role changes, another
  calendaradmin's users, promoted former users and all superadmin targets.
- **Role transitions:** verify promotion replaces the credential, enforces the
  administrator password policy and revokes sessions. Verify first demotion
  requires responsibility selection, later demotion retains the original
  association, invalid original administrator roles block the operation and
  attached ordinary users block demotion, including concurrent creation. Verify
  no-op/invalid role changes and stale target operations show useful conflicts.
- **Status and reset effects:** verify disabled accounts cannot sign in, enabling
  does not revive revoked sessions, and disabling a calendaradmin leaves their
  ordinary users enabled. Verify reset supersedes prior credentials/restricted
  sessions, rejects the current password and leaves the actor signed in. Confirm
  successful role/status changes update the list and failed mutations do not
  produce misleading row state or success feedback.
- **Visible persistence:** create an account and verify its name, username and
  role appear without reload. Exercise creation from a later page and usernames
  sorting before/after the current page. Reload to prove persistence and confirm
  the acting administrator remains signed in. Failed/conflicting submissions
  must not add rows or show a success message.
- **List isolation:** verify superadmins see all roles and calendaradmins see
  only their assigned ordinary users across pages. Use two calendaradmins and
  verify cross-owner exclusion, including direct BFF/API calls, SSR, hydration,
  concurrent requests and browser account switching.
- **Validation and feedback:** exercise Unicode limits, required/blank name,
  invalid username, case-insensitive duplicate username including a disabled
  account, role-specific password length/content and structured field errors.
  Check accessible loading, empty, error, verification and success states in both
  languages; names and usernames remain unchanged when the language changes.
- **Verification and credentials:** use controlled backend time immediately before
  and at the five-minute recent-verification boundary. Verify re-authentication,
  wrong password, lockout/rate limits and revoked-session handling. Confirm
  30-minute initial/reset/promotion credential expiry, required password change
  and no credential disclosure in list/API output, SSR, hydration, logs or browser
  persistence.
- **Transport and failure:** reject missing/invalid/stale CSRF tokens, preserve
  allowed cookies and no-store headers, handle backend unavailability and
  cancellation, and verify no automatic write retry or double submission. Do not
  repeat an uncertain creation automatically after a lost response; a later list
  refresh must remain able to reveal a committed account.
- **Presentation and regression:** verify keyboard/focus and mobile/desktop behavior
  for the dedicated creation page and maintenance forms, direct navigation,
  refresh, cancel/back navigation, list refresh and language switching. Preserve
  login, password change, logout, landing page and calendar
  behavior. Report the existing Vite-dev language issue separately.
- **Build and quality:** run applicable Vitest, browser integration and isolated
  backend checks, frontend type checking/production build, contract validation
  and generation as relevant, plus the required saved-source quality and health
  comparison. Record results and limitations before updating implementation status.
