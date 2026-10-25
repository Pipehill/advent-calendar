# 00011: Frontend login and personal page

Status: Implemented (2026-10-25)

Last updated: 2026-10-25

Implementation type: feature

## Overview

Connect the landing-page login button to a dedicated sign-in page and the existing
backend authentication. After successful unrestricted login, navigate to
`/min-side`, with a personal greeting, avatar and role-appropriate initial content.
Add a single account name field, limited to 100 characters including spaces.
Superadmins also receive a read-only list of accounts across all three roles.

## Requirements

1. Enable `Logg inn` on the public landing page. Navigate to a dedicated login
   page with username and password fields; do not open a popup or modal.
2. Authenticate against the existing backend through the frontend's tRPC BFF.
   Use backend-validated identity and roles; incorrect credentials must show a
   generic localized error and must not grant access or reveal account existence.
3. Successful unrestricted login navigates to `/min-side`. Direct navigation and
   refresh must validate the session on the server before exposing personal data.
   Anonymous, expired and revoked sessions must return to the login page.
4. Show the signed-in user's name and an avatar at the top of the personal page.
   Use a greeting such as `Hei, <Navn>!`, with a localized English equivalent.
   Render the avatar as a simple circle containing initials; no uploaded image
   or external avatar service is needed.
5. Add one name field to accounts, without splitting first and last names. Enforce
   a maximum of 100 Unicode code points including spaces across the contract,
   backend, database and applicable frontend validation. Keep identity, role and
   display name separate; the name does not grant authority or need to be unique.
   Trim surrounding whitespace and require 1-100 code points after trimming.
   Reject missing, null, empty and whitespace-only names for new accounts. Copy
   existing accounts' usernames into the new name field during migration.
6. For `calendarAdmin`, show placeholder buttons `Lag ny kalender` and
   `Lag ny kalenderbruker`. Calendar and account creation forms are later work;
   placeholders must not submit creation requests or imply completed functionality.
7. For `calendarUser`, show `Du har ikke noen kalendere enda...` as the initial
   page content below the greeting/avatar, with no administrator controls.
   This is a placeholder state, not a claim based on calendar assignment queries.
8. For `superadmin`, show only the placeholder button `Lag ny kalenderadmin`
   and a read-only list of all accounts, including superadmins, calendaradmins
   and calendar users. Show name, username and role. Support the backend's existing
   pagination so the list can reach every account. Do not expose this list to
   other roles or add edit/reset/status/role controls in this increment.
9. Preserve existing temporary-password restrictions, fixed session lifetimes,
   backend invalidation and CSRF requirements. Restricted sessions must not reach
   the ordinary personal page or display privileged actions before password change
   and the required fresh login. Include the required password-change page and a
   `Logg ut` control for authenticated unrestricted and restricted sessions.
10. Relay only the agreed authentication/antiforgery cookies and token header,
    preserve separate backend `Set-Cookie` headers, and apply `no-store` to
    authentication responses and protected SSR/hydration, including errors.
    Keep request contexts and protected browser/server caches isolated by session.
11. Use the established SSR, TanStack Form, Zod, shadcn/ui and Paraglide architecture.
    Translate application-owned text in Norwegian Bokmal and English; preserve
    user-authored names. Support keyboard use, accessible labels and errors,
    password autofill, loading feedback, and mobile/desktop layouts.
12. Keep username-only login. Do not introduce email fields or email authentication.
13. Preserve the public landing page and existing calendar routes. Calendar
    ownership/recipient enforcement, actual creation/listing, profile editing,
    avatar uploads and production database hardening remain separate work.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed scope and repository context

- The owner requested a new feature plan on 2026-10-25. This task plans the work;
  application implementation is not authorized by this planning request.
- On 2026-10-25 the owner confirmed username-only login, mandatory trimmed names
  with existing usernames as the backfill, required password change and logout,
  and the proposed initials avatar. The owner specified only the calendaradmin
  creation placeholder for superadmins and a read-only account list with name,
  username and role, explicitly including all three roles.
- Planning starts from clean `main`, synchronized with `origin/main`, on
  `plan/login-and-my-page`. The next unused plan number is 00011.
- [Plan 00008](00008-backend-user-management.md) delivered the backend account
  model and authentication, while explicitly deferring frontend/BFF integration.
  This plan takes on that integration for login and the personal page; calendar
  authorization and [database hardening](00009-database-hardening.md) remain
  production gates. Preserve implemented plans as historical records.
- `src/frontend/src/routes/__root.tsx` owns the disabled login button and shared
  header. `routes/index.tsx` owns the public welcome content. There are no login
  or personal-page routes yet.
- `src/frontend/src/server/trpc.ts` currently exposes only calendar retrieval;
  `context.ts` carries tracing/cancellation, without cookies or response headers.
  `backend.ts` currently implements only calendar reads through the generated
  backend client. `router.tsx` creates request-local query clients, with a default
  60-second query stale time that must not bypass authentication validation.
- `src/frontend/src/server.ts` handles browser tRPC and SSR separately. Existing
  SSR responses are `private, no-store`; extend protection to authentication tRPC
  responses and errors. `src/frontend/server/entry.mjs` adapts production Nitro
  requests; verify that response cookies survive that final boundary.
- `Calendar.Security/Account.cs` and migration `0002_create_accounts.sql` have
  username and role but no personal name. There is no email account model.
- Existing backend operations are `/auth/csrf`, `/auth/login`, `/auth/session`,
  `/auth/change-password` and `/auth/logout`. The session DTO contains the public
  user, expiry and `mustChangePassword` flag. `AuthController.ToUserDto` maps user
  data for both authentication and administration responses.
- Backend temporary credentials last 30 minutes. Restricted sessions last at
  most ten minutes and never outlast the credential deadline. Own-password change
  revokes all sessions and requires login again. Keep these rules unchanged.
- Follow the [architecture](../rules/architecture.md),
  [API contract](../rules/api-contracts.md),
  [data/migration](../rules/data-and-migrations.md),
  [authentication](../rules/authentication-and-calendar-access.md) and
  [development quality](../rules/development-quality.md) rules.

Implementation began from synchronized main `f6981d5` on
`feature/login-and-my-page`, with commit and PR publication authorized by the
owner. The pre-edit application/tooling/reference baseline was captured before
source changes. Verification passed on 2026-10-25: 164 backend tests, 37 frontend
unit tests, 14 production-Nitro browser scenarios and the eight existing public/
calendar smoke scenarios. Release builds, generated contracts, TypeScript,
formatting and full quality checks passed. Application health improved 89.4 to
90.3; tooling improved 50.6 to 51.5, with complexity regressions and heuristic
limitations recorded in the frontend verification document. The inherited Vite
language-switching/platform follow-ups and remaining calendar/database production
gates are unchanged. No outstanding implementation questions remain.

### 1. Prepare implementation

- [x] Review the confirmed decisions and current backend contracts before coding.
  Keep the superadmin list read-only. Profile editing and real calendar/account
  creation screens belong to later increments.
- [x] Capture the required application quality baseline before coding.

### 2. Extend the account name through storage and contracts

- [x] Add the name property to `src/backend/Calendar.Security/Account.cs` and a
  new numbered DbUp migration under `Calendar.Api/Migrations`. Do not modify
  `0002_create_accounts.sql`. Apply the agreed backfill and database constraints
  without deleting accounts, changing credentials or provisioning any accounts.
- [x] Extend the authored `src/contract/openapi.json` creation/user schemas and
  shared backend validation for the agreed name policy. Regenerate both language
  consumers through `src/contract/Contract.proj`; never edit generated files.
- [x] Update `Authentication/AccountStore.cs`, `AuthDatabase.cs`,
  `UserAdministration.cs`, and the concrete `UsersController` and `AuthController`
  mappings. Include the name in all relevant reads, inserts and DTO projections,
  including session inspection and authorized lists. Preserve it during password,
  status and role operations. Avoid adding an unrelated profile-update endpoint.
- [x] Update the manual-superadmin SQL example in
  `src/backend/authentication.md` for the agreed name policy. Keep provisioning
  manual; the offline password tool still cannot write accounts. Update direct
  API examples and disposable test fixtures to use the changed creation contract.

### 3. Integrate browser, BFF and backend authentication

- [x] Extend the request-local BFF context and generated-client transport with an
  explicit request allowlist: `advent.auth`, `advent.csrf` and `X-CSRF-TOKEN`.
  Never forward arbitrary cookies, browser identity headers or shared credentials.
- [x] Relay only designated backend authentication/antiforgery `Set-Cookie`
  headers as separate headers. Preserve host-only scope, path, HttpOnly,
  SameSite, Secure and fixed expiry through development and production adapters.
  Handle newly issued cookies within the same exchange when CSRF refresh follows
  login; the BFF must not decrypt backend cookies or manufacture authentication.
- [x] Add tRPC authentication procedures and Zod inputs for the agreed scope.
  Fetch antiforgery tokens before login and refresh them after principal changes.
  Unsafe operations must use the backend's principal-bound antiforgery exchange.
  SSR session checks must receive the incoming request's allowlisted cookies.
- [x] Add a protected superadmin account-list procedure using the existing
  generated `/users` client and bounded offset/limit pagination (maximum 100 per
  page). Check the backend-validated unrestricted superadmin session before
  listing; backend list authorization remains independently enforced. Project
  only the required name, username and role into personal-page data. Do not
  expose the calendaradmin's differently scoped list through this screen.
- [x] Keep credentials and CSRF tokens out of URLs, logs, persistence and SSR
  hydration. Expose only public session data needed by the page. Do not store
  authentication in localStorage or use cached client roles to authorize access.
- [x] Retain the established total deadline/cancellation and read retry limits;
  never automatically retry login, password change or logout. Preserve structured
  field errors and provide localized handling of generic login failures, resource
  limits, expired credentials and backend unavailability without exposing secrets.
- [x] Set `no-store` on authentication tRPC results, errors and cookie responses.
  Clear protected queries and router data on session changes and unauthorized
  results. Revalidate protected navigation/SSR against the backend; cached session
  data must not keep revoked accounts on the personal page. Treat the superadmin
  account list as protected user-management data with the same no-store and
  session/cache isolation requirements.

### 4. Build login and the protected personal page

- [x] Add a dedicated login route and connect the existing header control to it.
  Use a normal page form with username/password labels, autocomplete semantics,
  a password input, pending state and accessible field/submission errors.
- [x] Add the protected `/min-side` route with server-side session validation,
  the user's name, greeting and agreed avatar. Render the name as plain user text
  and accommodate the 100-character limit without horizontal overflow.
- [x] Render role-appropriate initial content from the validated session. For
  superadmins, render the read-only paginated account list with localized role
  labels, loading, empty and error states, and only `Lag ny kalenderadmin` as
  the creation placeholder. Disable placeholders and explain that they
  are not yet available; do not add fake creation navigation or API mutations.
- [x] Implement the agreed mandatory-password-change flow before unrestricted
  navigation. Keep restricted users out of `/min-side`, explain expired temporary
  credentials generically, and require fresh login after successful change.
  Include logout on the personal and required-password-change pages, using
  backend session revocation and cache clearing, then return to the public page.
- [x] Add maintained Norwegian/English messages and reuse the shared header,
  language selector and UI styles. Add compatible pinned TanStack Form/shadcn
  components as needed, following the repository's dependency policy.

### 5. Verify and document the completed increment

- [x] Implement the boundary and browser verification below using isolated
  disposable accounts/databases, with no startup seeds or persistent test users.
- [x] Update `src/backend/authentication.md`, relevant frontend/backend READMEs,
  `docs/architecture.md` and current authentication rules to describe the actual
  delivered BFF integration. Preserve the remaining calendar/deployment gates.
- [x] Record evidence in frontend/backend verification documents. Keep the known
  Vite-dev language-switching TODO visible; do not claim it resolved by this plan.
- [x] Run applicable saved-source quality checks and the required health comparison
  using the owning [code quality](../../docs/code-quality.md) and
  [health](../../tools/quality/health.md) workflows. Update this plan and its index
  status only after implementation and verification.

## Verification

- **Navigation and roles:** activate `Logg inn` with keyboard and pointer and
  verify page navigation with no popup. Sign in as each role, verify `/min-side`
  and its exact permitted controls/empty state, then directly refresh the route.
  Check anonymous and expired/revoked-session navigation, with no personal HTML
  or hydration data before successful authorization.
- **Superadmin list:** verify all three roles appear with the correct name,
  username and role, and that later pages are reachable when the account count
  exceeds one API page. Check loading/empty/error states and direct BFF denial
  for anonymous, ordinary, calendaradmin and restricted-superadmin sessions.
  Verify one superadmin's list cannot remain in another user's browser cache,
  HTML or hydration, and no edit actions or credential data are exposed.
- **Names:** verify creation and login/session/list round trips through real
  PostgreSQL, including Norwegian letters, internal spaces and supplementary
  Unicode characters. Accept exactly 100 code points and reject 101; test missing,
  null, empty and whitespace-only values are rejected and surrounding whitespace
  is trimmed before validating the limit. Verify the
  backfill on existing accounts and preservation through credential/role changes.
  Render markup-like names as text and long names safely on mobile.
- **Errors and forms:** verify invalid credentials have generic localized output,
  passwords stay masked and unlogged, invalid fields map to the right inputs,
  and submission-wide failures retain accessible feedback. Exercise backend
  unavailability, rate limits, cancellation/deadlines and absence of write retries.
- **Cookies and CSRF:** exercise the actual browser/BFF/API exchange, cookie
  issuance and deletion, separately relayed `Set-Cookie` headers, public-origin
  scope, and rejection of missing/invalid/principal-stale tokens. Confirm unrelated
  browser cookies and identity headers do not reach the backend and that no-store
  survives tRPC, SSR, error and production Nitro response handling.
- **Temporary credentials:** verify initial/reset/promotion login cannot bypass
  the password-change requirement, including direct `/min-side` access. Exercise
  a different compliant replacement, revoked sessions, mandatory fresh login and
  expired temporary credentials without extending either fixed deadline.
- **Session isolation:** use controlled backend time for the 30-day ordinary and
  eight-hour administrator limits and browser-restart persistence. Exercise
  revocation/replay and concurrent users in SSR, hydration and browser caches.
  Verify logout causes current-session revocation, cleared personal UI
  and protected caches, and preservation of another valid session.
- **Presentation and regression:** check mobile/desktop layout, keyboard/focus,
  labels, errors, both interface languages and unchanged names, SSR/hydration,
  public landing content and existing direct calendar routes. Report known Vite
  development language failures separately from any new regression.
- **Build and quality:** validate OpenAPI, regenerate consumers, compile backend,
  explicitly type-check/build frontend, and run focused Vitest and isolated
  PostgreSQL API tests plus browser integration checks for the new boundaries.
  Record actual quality results and limitations before marking implemented.
