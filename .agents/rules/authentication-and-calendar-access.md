# Authentication and calendar access implementation rules

Apply these rules to credentials, sessions, administrator provisioning, calendar
authorization/editing, and protected SSR/cache data. See the
[architecture description](../../docs/architecture.md) for flows and rationale,
[data rules](data-and-migrations.md) for storage/migrations, and
[API contracts](api-contracts.md) for validation, representation, and error mapping.

## Agreed design and implementation scope

The owner confirmed on 2026-10-18 that
[plan 00008](../plans/00008-backend-user-management.md) supersedes the earlier
email-registration, invitation-membership and owner-provisioning-CLI decisions.
These rules reflect that account model. Backend authentication and user management
are implemented; current calendar POST/GET endpoints remain anonymous. See the
[backend authentication workflow](../../src/backend/authentication.md).

Plan 00008 covers backend accounts, authentication, contracts, persistence and
verification. Plan 00011 adds frontend/BFF login, password change, logout and
protected personal pages with a read-only superadmin account list.
Plan 00013 extends those pages with dedicated account creation, scoped administrator
lists, password reset, status/role maintenance and recoverable recent verification.
Calendar authorization/assignment and
[database hardening in plan 00009](../plans/00009-database-hardening.md) must be
completed and verified before production. The calendar rules below remain
requirements for that follow-up; do not claim them as delivered by plan 00008.

## Accounts and permissions

- Use ASP.NET Core Identity with custom Npgsql/Dapper stores for username/password
  accounts and roles, without Entity Framework. Support exactly `superadmin`,
  `calendarAdmin` and `calendarUser`. Derive identity and authority from
  backend-validated account/session state, never caller-supplied identity or roles.
- Require authenticated, authorized account creation on every API path. Superadmins
  may create calendaradmins and calendar users; calendaradmins may create only
  calendar users. No public self-service registration or API creation/promotion
  to superadmin is permitted, including by a superadmin caller.
- Provision superadmins only by an intentional manual PostgreSQL operation.
  Startup, migrations, scripts, configuration, deployment and development seeds
  must never create accounts of any role. Disposable tests may create their own
  fixtures in isolated databases. Startup must not create sample calendars.
- Provide an offline hash tool with hidden input and shared role-aware password
  validation/hashing. It must not connect to a database or write an account.
  Actual provisioning is manual; this replaces the former account-creation CLI.
- Accept globally unique, case-insensitive usernames of 3-64 Unicode code points:
  letters including Norwegian letters, digits, dot, hyphen and underscore. Use
  shared normalization for creation, lookup and manual provisioning, backed by a
  database uniqueness constraint. Reject duplicates, including disabled accounts;
  never replace credentials, merge identities or assign access through creation.
- Require one display name distinct from username and authority. Trim surrounding
  Unicode whitespace, then accept 1-100 Unicode code points including internal
  spaces; reject missing/null/blank names, NUL and invalid Unicode. Enforce this
  in the contract, shared backend policy and PostgreSQL. Names need not be unique;
  preserve them through security operations and render them as user-authored text.
  Existing usernames are backfilled by migration 0003; profile editing is deferred.
- Every ordinary user has one fixed responsible calendaradmin. Derive it from a
  calendaradmin creator; a superadmin must select an existing calendaradmin.
  Persist the actual creator separately for audit. No reassignment API is allowed.
- Calendaradmins may list and reset only their assigned accounts that currently
  hold the ordinary role. Apply list filtering in SQL and recheck target role and
  responsibility when committing a reset. Superadmins may list all accounts and
  reset, enable/disable or change roles of nonsuperadmin accounts. Other-account
  superadmin maintenance remains manual; every user may change their own password
  after current-password verification. Return only authorized public metadata.
- Preserve responsibility through promotion and later demotion. On first entry to
  the ordinary role, require superadmin assignment; on returning, require the
  original responsible account still to be a calendaradmin. Block calendaradmin
  demotion while ordinary users remain attached, including concurrent creation.
  Disabling an administrator revokes their sessions but does not disable their
  users; superadmin retains maintenance authority.
- Enforce the [confirmed permission matrix](../plans/00008-backend-user-management.md#confirmed-permission-matrix)
  on direct API requests independently of frontend controls. Account creation does
  not grant calendar access. No OAuth2, external identity provider or MFA is added.

## Passwords and sensitive operations

- Use a maintained, pinned Argon2id provider through Identity's password-hasher
  interface, with random per-password salts, versioned cost metadata and safe
  verification/upgrade handling. Calibrate at least to current OWASP guidance on
  the backend runtime and bound hashing concurrency and queues. Never store
  plaintext/reversibly encrypted passwords or return passwords/hashes in the API.
- Require 15-128 Unicode code points for both administrator roles and 8-128 for
  ordinary users, with uppercase, lowercase and punctuation/symbol characters.
  Whitespace is not a special character; digits are optional. Keep passwords
  case-sensitive and untrimmed/untruncated. Reject known weak passwords using a
  maintained, pinned local source without sending candidates to external services.
  Derive policy from the validated role, including reset, promotion and the hash
  tool. This owner-approved policy does not claim NIST compliance or phishing resistance.
- Initial API passwords, reset passwords and promotion passwords are temporary.
  Set the mandatory-change flag and 30-minute credential deadline atomically with
  creation/replacement. Replacement passwords must differ from the current one.
  Administrators privately hand credentials to identity-verified recipients; do
  not return them or sign the creating administrator into the new account.
- Temporary-password login grants only session inspection, required CSRF refresh,
  own-password change and logout. Its fixed session expiry is at most ten minutes
  after login and no later than the credential deadline. Role privileges cannot
  bypass the restriction. Login/activity cannot extend the credential deadline.
  Expiry retains the mandatory-change flag, account and username reservation;
  a fresh authorized reset is needed after credential expiry.
- Own-password change verifies the current password, requires a different compliant
  password, clears the temporary restriction atomically, revokes all sessions and
  requires a new login. A later reset supersedes every previous credential and
  restricted session. Reject expired authorization rather than restoring access.
- Every promotion to calendaradmin replaces the credential with a different
  administrator-compliant temporary password supplied by superadmin and unknown
  to the former responsible administrator. Superadmin verifies recipient identity
  and hands it over privately. Atomically change role/credential, set temporary
  state, advance the account security version and revoke all sessions.
- Creating accounts or changing another account's password, status or role requires
  the acting administrator's password verification within the preceding five
  minutes, bound to the current unrestricted session and account security version.
  Unrestricted login may establish it; otherwise use authenticated re-verification.
  Use backend time, reject at the deadline and never extend session expiry.
- Distinguish expired recent verification using the authored ProblemDetails
  `verificationRequired` boolean. Only that denial sets it true. BFF/UI access
  denials must not trigger an automatic write retry or unconditional logout;
  wrong re-verification credentials do not necessarily invalidate the session.
- Persist five failed password verifications within a rolling 15-minute account
  window, followed by a fixed 15-minute pause. Successful accepted verification or
  pause expiry clears account failures. Attempts during the pause must not verify
  passwords, add failures or extend it. Enforce independent IP/global resource
  limits before hashing, including current-password verification; success does not
  clear aggregate budgets. Restarts/concurrent requests must not bypass controls.
  Trust only actual peers or explicitly configured proxies for client addresses.
- Keep failed-login responses generic across unknown, disabled, locked and
  incorrect-password cases. Document targeted lockout denial-of-service risk and
  trusted operator recovery without a public bypass or automatic provisioning.
- Persist account security versions and session-bound recent-verification times.
  Hashing may run outside a short transaction, but session creation and mutations
  must atomically recheck verified version/hash, current status/role, lockout and
  credential deadlines. Recheck actor session/authority/recent verification and
  target role/responsibility in sensitive mutations. Stale verification must not
  issue valid sessions, restore old hashes or clear newer temporary state.
  Concurrent own-password changes using the same credential may commit at most
  once. Use database concurrency control across instances, not process-only locks.
- Log security results with actor/target IDs, operation, timestamp and trace context;
  exclude credential bodies, hashes, cookies/tokens and raw password inputs.

## Cookie transport and session validity

- Let the .NET backend issue/validate ASP.NET Core authentication cookies. Use
  host-only, HttpOnly, SameSite=Lax cookies, Secure in production, scoped to the
  public frontend/BFF origin.
- Relay only the designated authentication and distinct antiforgery cookies and
  request-token header in request-scoped BFF/API calls, including SSR where needed.
  Document the explicit allowlist; never forward all browser cookies.
  Relay relevant backend Set-Cookie headers for login/logout, CSRF issuance or
  reissuance separately, preserving their attributes and public-origin scope.
- Do not decrypt cookies in the BFF or trust browser-supplied identity/role headers.
  Return API authentication errors rather than HTML login redirects; describe
  authentication operations and cookie security in authored OpenAPI.
- Use ASP.NET Core's built-in token-based antiforgery validation for state-changing
  authentication/user operations, including login. SameSite alone is insufficient.
  Refresh tokens after principal changes without extending authentication expiry.
  The implemented BFF allowlist is `advent.auth`, `advent.csrf` and `X-CSRF-TOKEN`.
  Refresh CSRF before browser mutations outside query caches and use newly issued
  cookies within the login exchange. Never issue an unsafe backend operation with
  a BFF-manufactured token in place of the caller's principal-bound token.
- Keep Data Protection keys owned by the backend, durable and protected across
  replacement. Resolve concrete storage alongside hosting/secrets in deployment;
  the BFF does not need these keys.
- Use persistent fixed-expiration sessions from successful login: at most 30 days
  for ordinary users, eight hours for administrators based on authenticated privileges.
  Disable sliding expiration; activity, validation, or cookie reissuance must not
  extend original expiry. Keep ticket and cookie expiry consistent and preserve
  login across normal browser restarts within the lifetime.
- Invalidate only the current session on logout and clear its cookie. Invalidate
  all account sessions on password changes, account disabling, or administrator
  privilege changes. Reject invalidated cookies on subsequent API/BFF/SSR requests,
  including replay; cookie deletion or delayed periodic validation is insufficient.
- Persist session/account validity through the selected PostgreSQL stores and
  preserve original expiry during checks. Validate current account status,
  privileges, session validity and security version on every protected request;
  fail closed if persistence is unavailable. Verify multiple sessions, unaffected
  sessions after logout and controlled expiration for both account types.
- Apply `Cache-Control: no-store` to all authentication/user-management responses,
  including errors, CSRF issuance and cookie responses, and exclude those routes
  from shared response/output caches. Preserve protection through middleware and
  the BFF and production Nitro adapter. `no-cache` or `Vary: Cookie` alone is insufficient.

## Calendar access boundary

- Keep the landing page public and require authentication for future calendar use.
  Each calendar has one recipient account; a recipient can access multiple assigned
  calendars. Existing-user assignment, assignment/reassignment, invitation behavior
  and calendar creation/read authorization belong to a separate calendar task.
  Do not retain the former public email-registration/invitation-membership flow
  as an approved design or assume an invitation grants identity/admin privileges.
- Let calendaradmins manage calendars they own. Enforce ownership and assigned
  recipient access in the backend; administrator role alone must not grant access
  to another administrator's calendar. The superadmin permission grant in plan
  00008 applies to implemented user management, not unspecified calendar authority.
- In plan 00008, preserve the current calendar API behavior and frontend/BFF source.
  Do not add a blanket authentication policy to those deferred routes or describe
  them as protected. Complete access enforcement and browser/cache verification
  in the follow-up tasks before production.

## Calendar opening and administrator editing

- Use Europe/Oslo for every calendar initially; do not add per-calendar timezone
  selection. Derive each opening instant from its assigned date at 07:00 using
  named-zone rules, independent of browser/container timezone or fixed UTC offset.
  Keep UTC instant transport/storage and date-only business dates per API rules.
- For recipients, enforce opening using current backend server time plus valid session
  and recipient assignment. Keep earlier doors available; direct API access and altered
  browser clocks must not bypass future-door restrictions.
- Give calendaradmins full preview/edit access to owned calendars before and during
  the period, including future content. Allow moves only while both source and
  destination are before scheduled opening, determined by backend time rather than
  recipient clicks. Check ownership/privileges and both opening boundaries for moves.
- Withhold future content from recipient API responses, SSR HTML, hydration data,
  prefetches, and caches. Separate administrator/recipient responses and caches,
  including current user/calendar context. Clear protected browser data on session
  changes and prevent shared response caches from leaking authorized output.
- Refresh relevant data at opening and after edits/moves, preventing stale locked
  states while preserving access checks. Client timers trigger fetches only; the
  backend decides availability.
- Verify unauthorized/cross-owner access, role escalation through account operations
  or any future invitation flow, concurrent SSR/user isolation and future-content
  absence. Use controlled time immediately before/at/after 07:00, different client/server timezones, altered
  clocks, moves across either opening boundary, and refresh after changes.
