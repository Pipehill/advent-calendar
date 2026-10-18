# 00008: Backend user management and authentication

Status: Not implemented

Last updated: 2026-10-18

Implementation type: feature

## Overview

Introduce backend-managed username/password accounts, authentication, and the
three roles `superadmin`, `calendarAdmin`, and `calendarUser`. Require an
authenticated administrator with the appropriate creation permission on every
user-creation API operation. Superadmins are provisioned manually in PostgreSQL;
the application must never seed or automatically bootstrap accounts.

This plan does not authorize frontend implementation. The owner explicitly
deferred changes to calendar endpoints and enforcement of calendar
ownership/recipient access to a separate task. Existing calendar endpoints
therefore retain their current access behavior in this increment; this plan must
not describe them as protected. Completion of this plan alone does not authorize
production use: calendar authorization, frontend/BFF security integration and
plan 00009 must be completed and verified first.

## Requirements

1. Implement this increment in the backend, its authored API contract, database
   migrations, backend verification, and directly relevant documentation/tooling.
   Do not edit maintained frontend/BFF source, UI, message catalogs, or browser
   flows. Regenerating ignored contract output for build compatibility is allowed.
2. Support exactly the three requested privilege levels. A superadmin has all
   permissions within the implemented user-management boundary, including creation
   of both calendaradmins and calendar users. A calendaradmin may create only
   calendar users, not another calendaradmin or a superadmin.
   A calendar user must not create accounts or grant administrator privileges.
3. Require backend authentication and explicit authorization to create accounts,
   including direct API requests that bypass the website. No public self-service
   registration, caller-supplied identity/role headers, or unguarded provisioning
   route may create an account or assign privileges.
4. Provide password verification as part of backend authentication. Preserve the
   repository's ASP.NET Core Identity, custom Npgsql/Dapper stores, cookie-based
   session model, and PostgreSQL session validity rules unless a confirmed
   decision below explicitly supersedes them.
5. Allow superadmin provisioning only as an intentional manual database operation.
   Neither an API request nor startup, migrations, setup scripts, configuration,
   environment flags, deployment hooks, or development seeding may create one.
   Apply the no-seeding rule to every account type in every application environment.
6. Treat usernames as global account identities, independently of calendar IDs.
   Accept 3-64 characters consisting of letters (including Norwegian letters),
   digits, dot, hyphen and underscore, with case-insensitive identity matching.
   Reject an existing username in account creation; do not replace its password,
   change its role, merge identities, or silently grant access. Existing-user
   assignment belongs to the separate calendar task.
7. Never store or expose plaintext or reversibly encrypted passwords. Use a
   maintained password-hashing implementation with per-password random salts,
   versioned hash metadata, and tested verification. Do not implement new
   cryptographic primitives or rely on concealment of code or algorithms.
   Use Argon2id. Require 15-128 Unicode code points for both administrator roles
   and 8-128 for ordinary calendar users. All roles require at least one uppercase
   letter, one lowercase letter, and one punctuation or
   symbol character. Whitespace alone does not satisfy the special-character
   requirement; digits are permitted but not mandatory. Reject known weak
   passwords. Do not silently trim or truncate passwords.
8. Keep real credentials, keys and operational secrets out of the plan, source,
   fixtures, URLs, logs and ordinary API DTOs. Never return passwords or password
   hashes through the API. Authentication cookies and CSRF tokens are intentionally
   transported only through their designated, protected authentication exchange.
   The design must retain its security properties when the code and plan are known.
   Password guessing must be made costly and online attempts constrained; no
   claim of absolute brute-force immunity or impossible reverse engineering is made.
9. Keep all changes to calendar creation/retrieval, recipient assignment, invitation
   flows, and calendar access enforcement out of this increment. Record the
   confirmed future rule: each calendar has one recipient account, and one
   recipient may access multiple assigned calendars after authentication.
10. Preserve published migrations and existing calendar data. Add new, numbered
    migrations for accounts and authentication state. Continue parameterized
    Npgsql/Dapper SQL, DbUp startup migrations, and the exclusion of Entity Framework.
11. Verify the user-management authorization boundary, password handling, persistent
    session validity, and zero automatic account creation against the actual API
    and isolated PostgreSQL, without requiring frontend changes.
12. Support account maintenance with the confirmed matrix below. Everyone may
    change their own password after verifying the current password. Superadmins
    may reset passwords, enable/disable other calendaradmin/calendar-user accounts,
    and change those accounts between the two nonsuperadmin roles. Other changes
    to superadmin accounts remain manual database operations. Calendaradmins may
    also reset passwords for their assigned ordinary calendar users, including
    those created on their behalf by superadmins.
    Persist the calendar-user/calendaradmin relationship and verify it in the
    backend on each reset; role membership alone does not authorize the operation.
    Every ordinary calendar user must belong to one calendaradmin. The association
    is fixed; do not expose a reassignment API or allow recreation/role changes to
    bypass it. Block calendaradmin demotion while ordinary users remain attached.
13. Initial passwords for every API-created account, reset passwords and promotion
    passwords are temporary. A reset password must differ from the current password.
    Set the mandatory-password-change flag and credential deadline atomically with
    account creation or credential replacement. Revoke all existing sessions;
    after a successful login using the temporary password, permit only password
    change, current-authentication inspection, required CSRF token refresh, and
    logout until the account holder supplies a different compliant password.
    Never expose normal administrative privileges through that restricted session.
    Password change invalidates all sessions and requires a new login. Persist a
    temporary-password expiry 30 minutes after account creation or subsequent
    issuance. Restricted sessions expire after at most ten minutes and no later
    than that credential deadline; neither login
    nor activity may extend it. A later reset supersedes every earlier one.
14. Persist five failed attempts within a rolling 15-minute account window followed
    by a fixed 15-minute pause. Successful password verification or completion of
    the pause resets the failed-attempt counter. Attempts during the pause neither
    verify passwords nor extend its deadline. Apply additional IP/global resource
    limits before expensive hashing, including current-password verification.
    Restarts and concurrent requests must not bypass these controls.
15. Use ASP.NET Core's built-in token-based antiforgery protection on state-changing
    authentication/user operations, including login. Do not substitute SameSite,
    a hidden route, or the presence of a frontend control for backend validation.
16. Require password verification within the preceding five minutes by the acting
    administrator before creating accounts, resetting another account's password,
    changing account
    status or changing roles. Bind that verification to the current session and
    account security version. It does not extend session expiry, replace ordinary
    authorization, or grant unrestricted access to a temporary-password session.
17. Promotion to calendaradmin must replace the old credential with a different,
    compliant temporary administrator password unknown to the former responsible
    calendaradmin. Atomically replace the credential, change the role, require
    password change, advance the security version and revoke all sessions.
    Do not promote while retaining a password known at the lower trust level.
18. Bind login and current-password verification to a persisted account security
    version. At the mutation/session-creation transaction, reject stale verification
    if credentials, role or status changed in the meantime. Include actors and
    targets in concurrent authorization checks. Hash upgrades must not overwrite a
    newer password, and concurrent password changes must not both succeed.
19. Set `Cache-Control: no-store` on all new authentication and user-management
    responses, including errors and responses issuing cookies or CSRF tokens.
    Exclude these operations from shared response/output caching. This backend
    requirement is part of this increment; only frontend/BFF integration remains
    deferred. Do not substitute `no-cache` or `Vary: Cookie` for `no-store`.

## Outstanding questions

None. On 2026-10-18 the owner approved the second review's initial-password
lifecycle recommendation after clarification: every API-created account starts
with a temporary password expiring 30 minutes after creation, a restricted session
of at most ten minutes capped by that deadline, and mandatory password change
before normal access. Backend response-cache protection was already approved.

On the same date the owner accepted the first security review's recommendations and
confirmed the five-minute recent-verification window, 30-minute temporary-password
lifetime, ten-minute restricted-session limit, private identity-verified promotion
handover, and rolling 15-minute failed-attempt window with a fixed 15-minute pause.
The earlier account-responsibility and immutable-association choices remain.
Database hardening is explicitly deferred to
[plan 00009](00009-database-hardening.md), which must be completed before production.
The earlier calendar-endpoint and frontend deferrals remain.

No running database, credentials, privileges, firewall rules or containers were
changed by this planning update or the read-only inspection.

## Implementation details and work order

### Confirmed decisions and repository context

- The owner requested a new feature plan on 2026-10-18. Planning starts from
  synchronized, clean `main` at `5256fc0`, on `plan/backend-user-management`.
- The owner requires three roles and administrator-authenticated user creation,
  with explicit API enforcement and no user seeding. A future superadmin web
  function will create calendaradmins; that interface is outside this plan.
- On 2026-10-18 the owner rejected automatic reuse of existing usernames during
  account creation. Assignment to an existing account is a separate operation.
- On 2026-10-18 the owner selected one recipient per calendar and multiple
  calendars per recipient, and explicitly deferred changes to calendar endpoints.
  Do not create a parallel unprotected copy of a new user-management endpoint.
- On 2026-10-18 the owner approved globally unique, case-insensitive usernames
  of 3-64 characters, allowing letters including Norwegian letters, digits, dot,
  hyphen and underscore.
- The owner clarified that superadmins create both calendaradmins and calendar
  users, and calendaradmins create only calendar users. No API creates superadmins.
- On 2026-10-18 the owner strengthened the superadmin minimum to 15 characters.
  After the security review, the owner accepted the same minimum for calendaradmins.
  Only ordinary calendar users retain the approved eight-character minimum. This
  remains a product-policy exception to NIST's single-factor length guidance;
  Argon2id does not make weak passwords unguessable or protect against phishing.
- All roles retain uppercase/lowercase/special-character requirements, a maximum
  of 128 Unicode code points, Argon2id, and rejection of known weak passwords.
  A special character is punctuation or a symbol, not merely a space. Share
  role-aware validation and hashing between the API and local hash tool. The
  manual superadmin provisioning tool must enforce the 15-character minimum.
- The owner included password changes, administrator resets, account disabling
  and role changes. On 2026-10-18 the owner extended calendaradmins' permissions:
  they may reset passwords for their own ordinary calendar users. Every ordinary
  account has a fixed responsible calendaradmin. A calendaradmin creating a user
  automatically becomes responsible; a superadmin creating an ordinary user must
  explicitly select the responsible calendaradmin, who gains reset authority.
  Retain the actual authenticated creator separately for audit. Neither actor may
  later reassign the association. A calendaradmin cannot reset another
  administrator's ordinary users or any account currently holding an admin role.
- The owner rejected account reassignment. Block calendaradmin demotion while
  ordinary users remain attached. Deactivation still revokes the administrator's
  own sessions immediately; it does not silently deactivate the attached users,
  for whom superadmin retains maintenance authority.
- The owner deferred database hardening to a separate preproduction task, now
  recorded in plan 00009. Current development connectivity is not changed here.
- The owner requires administrator resets to set a temporary password and force
  an account-holder password change after the next login. Revoke all prior sessions.
  The resetting administrator supplies the replacement through the protected API;
  it is not returned in a response. Email/password delivery integration is outside
  this task, as are frontend screens for these backend flows.
- On 2026-10-18 the owner accepted the security review's recommendations covering
  promotion credentials, recent administrator verification, expiring reset
  credentials/restricted sessions, concurrent login and password changes, and
  lockout abuse. The owner confirmed five-minute recent verification, 30-minute
  temporary-password validity, restricted sessions of at most ten minutes capped
  by the credential deadline, and five failures within a rolling 15-minute window
  followed by a fixed 15-minute pause. Successful verification or expiry of the
  pause resets the counter; attempts during a pause do not extend it.
- The owner approved promotion through a new temporary administrator password
  supplied by superadmin, who directly verifies the recipient's identity and
  privately delivers the credential outside the application. The former
  calendaradmin must not receive it. No email/SMS integration is added here.
- After the second security review on 2026-10-18, the owner approved backend
  `no-store` response policy and exclusion from shared caching for all new
  authentication/user-management operations. After receiving the requested
  explanation, the owner also approved applying the same temporary-password
  lifecycle to initial API account creation for both calendaradmins and calendar
  users, regardless of which authorized administrator creates them.
- The owner approved a local hash-generation tool with hidden input and shared
  validation, but no database connection or writes; actual account insertion is
  manual. This is not a seed mechanism or an automatic bootstrap path.
- The owner approved five failed account attempts followed by a 15-minute pause,
  with additional per-IP and global resource limits. Do not make the lockout
  permanent, omit persisted account enforcement, or rely on hiding login routes.
- The owner selected ASP.NET Core's built-in token-based antiforgery protection.
  Verify token/cookie behavior directly against the backend now. Document the
  additional allowlisted CSRF cookie/header relay required in the future BFF;
  do not implement that frontend/BFF change in this task.
- The current API only implements anonymous calendar POST/GET and health routes.
  `Calendar.Api/Program.cs` has no Identity or authentication middleware yet.
  `0001_create_calendars.sql` stores calendars and doors, with no users, owners,
  recipients, or sessions. `Infrastructure/LocalSeed.cs` seeds only a development
  example calendar. It must never start creating users as part of this work.
- The current [authentication rules](../rules/authentication-and-calendar-access.md),
  [architecture](../../docs/architecture.md#authentication-and-calendar-access)
  and root project description were aligned with this plan on 2026-10-18 at the
  owner's explicit request. This plan replaces the earlier public email
  registration, invitation-membership and owner-CLI account-creation decisions.
  The plan index records that those earlier decisions are superseded; the
  implemented architecture plan itself is preserved unchanged as historical evidence.
  Rules, forms terminology, diagrams, backend workflow documentation and the plan
  index reflect the approved design while keeping authentication, calendar
  authorization and frontend/BFF integration explicitly unimplemented.
- Retain applicable [architecture](../rules/architecture.md),
  [API contract](../rules/api-contracts.md),
  [data/migration](../rules/data-and-migrations.md),
  [development quality](../rules/development-quality.md), and
  [documentation](../rules/documentation.md) rules.
- Existing session requirements are fixed persistent lifetimes of at most 30
  days for ordinary users and eight hours for administrators, no sliding expiry,
  current-session logout, and immediate account-wide invalidation after password,
  disabling, or privilege changes. Backend-owned Data Protection keys are durable
  and protected; production hosting/key protection details remain deployment work.

### Confirmed permission matrix

All authenticated rows require a valid, enabled, unexpired session without a
pending mandatory password change, except the explicitly allowed restricted-session
operations. Authorization is checked from backend-validated account state.

Account creation and changes to another account's password, status or role also
require the acting administrator's password to have been verified within the last
five minutes in this session. A successful unrestricted login can establish that
verification; otherwise use the dedicated authenticated re-verification operation.
Ordinary authorization still applies. Listing accounts, session inspection,
logout and CSRF refresh do not require this additional recent verification.

| Operation | Anonymous | Calendar user | Calendaradmin | Superadmin |
| --- | --- | --- | --- | --- |
| Obtain an antiforgery token / attempt login | Allowed with abuse controls | Allowed | Allowed | Allowed |
| Inspect own session / log out | No authenticated session | Own session | Own session | Own session |
| Change own password with current password | Denied | Allowed | Allowed | Allowed |
| Refresh recent administrator password verification | Denied | Denied | Own unrestricted session | Own unrestricted session |
| Create calendar user | Denied | Denied | Allowed | Allowed |
| Create calendaradmin | Denied | Denied | Denied | Allowed |
| Create/promote to superadmin through API | Denied | Denied | Denied | Denied |
| List accounts | Denied | Denied | Only currently ordinary users assigned to this administrator | All accounts |
| Reset another account's password | Denied | Denied | Only own ordinary calendar-user accounts; never another administrator's users or an administrator account | Calendaradmin/calendar-user targets only |
| Enable/disable another account | Denied | Denied | Denied | Calendaradmin/calendar-user targets only |
| Change another account between calendaradmin/calendar-user roles | Denied | Denied | Denied | Allowed |
| Reassign an ordinary user's calendaradmin | Denied | Denied | Denied | Denied: fixed association |
| Other changes to superadmin accounts | Denied | Denied | Denied | Manual database operation only |

The ordinary account list contains only authorized public account metadata, never
hashes, security stamps, reset credentials, session secrets, or lockout internals.
Apply filtering in the database query rather than fetching all accounts for a
calendaradmin and filtering a response later. Disabled accounts retain their
username reservation; creation cannot replace one or take over its identity.

Store a non-null responsible-calendaradmin foreign key for every current ordinary
user. Derive it from the authenticated actor for calendaradmin creation; require
superadmins to select an existing calendaradmin when creating on their behalf.
The immutable creator audit field is not the reset-authorization field. Ordinary
users and calendaradmins cannot nominate a different responsible administrator.

Role transitions must preserve the fixed-association rule. An ordinary user
promoted to calendaradmin is no longer visible/resettable as an ordinary user by
their previous administrator; retain the original association for history and any
later demotion. An administrator entering the ordinary role for the first time
must be assigned a responsible calendaradmin by superadmin. A returning ordinary
account can use only its original administrator, who must still have the
calendaradmin role; otherwise reject the transition. Never clear an association
and select a replacement merely by toggling roles. Check administrator demotion
dependencies and concurrent user creation within the same transaction boundary.

Every promotion to calendaradmin, including a repeated promotion after demotion,
requires a different temporary password satisfying the administrator policy.
Never carry the old password into the new role. Superadmin supplies the credential
and directly hands it to an identity-verified recipient over a private channel
outside the application, without involving the previous calendaradmin. The backend
never returns the password. Promotion atomically replaces the credential, sets its
30-minute deadline and mandatory-change flag, changes the role, advances the account
security version and revokes every session. On failure, no partial promotion may
persist. The next login is restricted until the recipient chooses a different
compliant password; a forced-change flag alone is not proof of recipient identity.

Every account created through `POST /users` starts with a temporary password
satisfying its role's policy, a mandatory-change flag and a persisted deadline
30 minutes after creation. Persist those values atomically with the new account;
do not create a normal-access interval before adding the restriction. The creating
administrator supplies the initial password and privately hands it to the verified
recipient. Never return the password or automatically sign the creator into the
new account. Reuse the reset/promotion restricted-login and own-password-change
flow rather than adding an unrestricted first-login path. Password change requires
a different compliant password, revokes all sessions and requires a new login.

If the recipient does not complete password change before the deadline, retain
the account, username reservation and fixed responsible-calendaradmin association.
An authorized administrator must issue a fresh temporary password through the
existing protected reset operation. Creation retries or first login must not
restart the deadline, replace the account or activate it automatically. Accounts
created well before calendar delivery therefore need a fresh reset near handover.
This decision applies to API-created accounts; manual database-only superadmin
provisioning and the prohibition on seeding remain as already specified.

A temporary-password session can inspect itself, obtain the required CSRF token,
change its own password with the temporary password, and log out. Its normal
role must not bypass that restriction. Its fixed expiry is the earlier of ten
minutes after login and the temporary-password deadline, also bounded by the
normal role lifetime. Reject login, password change and other authenticated use
once the relevant deadline is reached; logout may still clear an expired cookie.
Expiry never clears the mandatory-change flag. A session expiry alone permits
another restricted login only while the temporary password remains valid; an
expired temporary password requires a fresh authorized reset. Any newer reset
invalidates all earlier reset credentials and restricted sessions.
The current calendar API remains outside this matrix by the owner's explicit
scope deferral; do not claim that its currently public reads are secured by this work.

### Backend contract and generation boundaries

Document the following logical operations in authored OpenAPI. Keep operation IDs
unique and controllers separate from internal credential/session persistence.

| Route | Purpose and access |
| --- | --- |
| `GET /auth/csrf` | Issue the framework antiforgery cookie/token pair for the current principal. No state-changing account operation. |
| `POST /auth/login` | Verify username/password and controls; create a fixed-expiry session, possibly password-change restricted. |
| `POST /auth/reauthenticate` | Verify the current administrator's password in an existing unrestricted session; record recent verification bound to that session and security version for five minutes. CSRF and account/IP/global guessing limits apply. Never accept another account's identity or return a credential-verification token. |
| `GET /auth/session` | Return own user ID, username, effective role, original expiry, and password-change requirement. |
| `POST /auth/logout` | Revoke the current session and clear its cookie. |
| `POST /auth/change-password` | Verify current password, validate a different new password, clear reset requirement, revoke all account sessions. |
| `POST /users` | Create a calendaradmin or calendar user according to the matrix, atomically requiring password change and setting a 30-minute initial-password deadline. Derive the ordinary user's administrator for a calendaradmin caller; require superadmins to select one. Never accept superadmin as an assignable API role, return the password or grant unrestricted first-login access. |
| `GET /users` | Return a bounded account list scoped to the caller's permissions. |
| `POST /users/{id}/reset-password` | Superadmin reset of a nonsuperadmin account, or calendaradmin reset of an authorized own calendar-user account. Mandatory password change and immediate session revocation apply to both. |
| `PATCH /users/{id}/status` | Superadmin-only enable/disable of a nonsuperadmin account. Disabling revokes all sessions; enabling does not revive them. |
| `PATCH /users/{id}/role` | Superadmin-only change between calendaradmin and calendar user; revoke sessions. Promotion requires a different compliant temporary administrator password and atomic credential/role replacement. Enforce fixed responsibility, first-time ordinary-role assignment, and the prohibition on demoting an administrator with attached ordinary users. |

Use safe request/response DTOs, approved role enums, UUIDs, UTC instants, structured
ProblemDetails, and the existing unknown-JSON-property rejection. Use API 401/403
responses, not HTML redirects; failed login must not distinguish a nonexistent
account from an incorrect password. Do not add a separate unthrottled password
checking endpoint. Return 409 for a conflicting creation after authentication and
authorization, never silently mutate the existing account.

Apply `Cache-Control: no-store` to every response under the new authentication
and user-management routes, including session inspection, scoped account lists,
CSRF issuance, successful mutations and authentication/validation/error responses.
Preserve the directive when middleware emits a challenge or error and when the
framework writes CSRF/authentication cookies. Do not use shared response/output
caches for these routes, and do not treat cookie-based authentication as an
automatic cache exclusion. The future BFF must preserve equivalent response
protection; its implementation and browser cache cleanup remain deferred.

Apply authorization policies to the new account operations. Do not accidentally
protect existing calendar/health routes with a blanket controller policy while
changing generator grouping; those calendar changes were explicitly deferred.

Preserve `CalendarClient` and its existing `get`/`create` methods in generated
TypeScript so maintained frontend code need not change. Current NSwag settings
put all C# operations in `CalendarsControllerBase`; adjust backend generation to
group new authentication/user controllers while preserving the calendar contracts.
Verify the actual emitted bases and binding rather than editing generated code or
forcing unrelated account operations into the calendar controller.

### Security implementation constraints and explicit deferrals

- Use a maintained .NET-compatible Argon2id provider behind Identity's maintained
  password-hasher interface. Select and pin its supported compatible version during
  implementation, verify its maintenance/security status, and share its hash format
  with the offline tool. Do not write an Argon2 implementation or custom cipher.
- Calibrate and record memory/time costs on the actual backend runtime, meeting at
  least current OWASP Argon2id guidance. Record cost metadata per hash, support
  upgrading hashes after successful verification, and bound concurrent hashing and
  queues. Do not lower production strength merely to speed up tests.
- Apply the approved username character/length policy and one shared normalization
  to lookups, creation, manual provisioning and a database uniqueness constraint.
  Use Unicode code-point lengths consistently; handle Norwegian case and concurrent
  collisions. Keep password values case-sensitive and untrimmed/untruncated.
- Derive password requirements from the account's backend-validated role, never
  an untrusted role supplied with a password-change request. Enforce the 15-character
  minimum for both administrator roles in creation, reset, promotion, self-service
  password changes and the role-aware manual hash-generation workflow.
- Enforce the known-weak-password check locally without sending candidate passwords
  to an external service or storing them. Select and document a maintained, pinned
  source for the local checks at implementation alongside the hashing provider.
- Persist account lockout/session validity. Validate current account status and
  privileges on every protected request; cookie deletion or delayed periodic stamp
  checks do not meet the invalidation requirement. Serialize security-sensitive
  updates so concurrent role changes, resets and disable operations cannot bypass
  actor/target-role checks or preserve stale sessions. Follow the transaction and
  security-version requirements below, including login and hash upgrades.
- Persist and check account responsibility separately from caller-supplied IDs.
  Scope calendaradmin reset queries to their own ordinary calendar users, and
  recheck current target role/responsibility within the mutation transaction so
  promotion cannot race a reset into another administrator's account. Disallow
  reassignment and check demotion/creation dependencies atomically. Calendaradmins
  cannot select an arbitrary creator/owner in user input.
- Framework antiforgery validation must cover the new unsafe endpoints. Refresh
  tokens after principal changes. Keep authentication and CSRF cookies distinct,
  with host-only scope and secure production attributes. Document precisely which
  cookies and request token header the future BFF must relay; do not forward all
  cookies or trust arbitrary identity/proxy headers. CSRF renewal cannot extend
  the original authentication session lifetime.
- Log administrative/authentication results with actor/target IDs, operation,
  timestamp and existing trace context. Do not log credential bodies, cookie/token
  headers, hashes, or raw password validation inputs. Keep secret configuration
  outside the repository. Manual database write access is a trusted administrative
  boundary, not an unauthenticated bootstrap feature.
- **Deferred to a separate calendar backend task:** owners/recipients, one-recipient
  assignment/reassignment, existing-user assignment, access to all calendars assigned
  to the logged-in account, calendar read/create authorization, and invitation
  behavior. This task neither alters existing calendar schema/records for ownership
  nor claims calendar data is private yet.
- **Deferred to frontend/BFF integration:** login controls/screens, superadmin and
  calendaradmin screens, calendar-create forms, cookie/token relay, SSR/browser
  user-cache handling, and actual browser/BFF/API authentication/CSRF verification.
  Backend `no-store` headers and response-cache exclusion are included now.
- **Deferred to deployment as established by the repository:** production hosting,
  secret delivery, concrete protected Data Protection key storage and TLS/proxy
  configuration. Provide backend configuration hooks and tested local durable keys
  now; never silently use development keys or ephemeral fallback keys in production.
- **Deferred to preproduction database hardening:** the concrete requirements in
  [plan 00009](00009-database-hardening.md), including private database connectivity,
  least-privilege runtime/migration/operator separation and external secrets.
  This feature does not claim the current development database is production-safe.

### Recent verification and concurrent authentication

Persist the account security version and session-bound recent-verification time.
Use backend time, not a client timestamp or claim, to enforce the five-minute
window. Reject sensitive administrative mutations at or beyond its deadline and
require another password verification. A separate session cannot reuse it. Login
or re-verification must not extend the authentication session's original expiry;
session revocation or a security-version change invalidates recent verification.
Restricted sessions cannot establish unrestricted recent administrator verification.

Password verification is potentially expensive and may run outside a short
database transaction, but its result is valid only for the account version/hash
that was read. Before issuing a session or committing password-dependent work,
atomically recheck the account version, enabled status, role, applicable lockout
and temporary-password deadlines. A stale result must not create a valid session,
clear a mandatory-change flag or update credentials. Sessions must reference the
verified account version, not an unverified newer version observed after hashing.

For sensitive mutations, also recheck the acting administrator's session/version,
current authority and recent-verification deadline, plus the target's current
role/responsibility, within the transaction. A hash upgrade must condition its
write on the verified hash/version and never restore a password superseded by a
reset. Concurrent own-password changes using the same old credential may commit
at most once; the loser must not overwrite the winner or clear newer reset state.
Use database concurrency control across application instances, not process-only
locks. Account/session validity checks must fail closed if persistence is unavailable.

### Failed attempts, temporary credentials and residual risks

Persist timestamped failed-password-verification state sufficient to enforce a
rolling 15-minute window. At the fifth failure in that window, set the pause end
to 15 minutes after that failure. Do not start another password hash for an account
already known to be paused; an already in-flight result must still pass the final
transactional check. Attempts rejected during the pause must not move its end,
add account failures or extend it by resetting the window. At pause expiry clear
the old failures before applying new attempts. Successful verification resets the
counter only for the account whose password was verified and only if its version
and lockout state still permit acceptance. Logout remains available to clear cookies.

IP/global limits and hash concurrency/queue bounds apply independently; successful
authentication must not reset those aggregate budgets. Do not treat arbitrary
forwarded IP headers as trusted client addresses. Use the actual peer or an
explicitly trusted proxy configuration. Keep failed-login responses generic and
avoid distinguishable unknown/disabled/locked-account responses. Log lockout and
administrative security events without logging submitted credentials.

An attacker can still repeatedly trigger later pauses for a known account after
each pause expires. The policy limits extensions of an active pause; it does not
guarantee availability against targeted lockout. Document that residual risk and
the trusted operator recovery procedure, particularly for superadmin accounts,
without adding a public lockout bypass or automatic account creation.

Document private, identity-verified handover for administrator-issued temporary
passwords at initial creation, reset and promotion. Such a credential is a secret, not evidence that
the person presenting it is the intended recipient. Retire it and every restricted
session atomically when the account holder completes password change. Later
resets, role changes or disabling must invalidate prior restricted sessions too.
Password rules remain the owner's agreed policy: the ordinary-user eight-character
minimum and required character classes are not a claim of NIST compliance. This
increment does not add MFA or phishing resistance, and hashing is not a substitute
for those controls.

### Current database access findings (read-only inspection, 2026-10-18)

These findings describe the current local development instance, not a production
security assessment. Repository configuration and running PostgreSQL were both
checked; no database state or network configuration was changed.

- [Compose](../../compose.yaml) publishes PostgreSQL on host loopback only,
  `127.0.0.1:5432` by default. The running container confirms that binding. Direct
  database connections from the developer host are therefore possible; this is
  not a configuration in which the API is the only route to data.
- The container reports `listen_addresses=*`, with host-network authentication
  rules using `scram-sha-256`. Unix-socket and container-internal loopback rules
  use `trust`. This is not the same as unauthenticated access from arbitrary
  machines: the trust rules are local to the database container. Access to the
  container engine itself is already a privileged operational boundary.
- Compose and [backend configuration](../../src/backend/Calendar.Api/appsettings.json)
  contain a fixed development database credential. Its value is intentionally
  not repeated here. This configuration must not be used as a production secret.
- The running PostgreSQL role used by the backend has `rolsuper`, `rolcreatedb`
  and `rolcreaterole` enabled. The application consequently has full database
  privileges rather than a limited runtime role. PostgreSQL superuser is distinct
  from the planned application `superadmin` role.
- [Program.cs](../../src/backend/Calendar.Api/Program.cs) uses one configured
  connection string for runtime repositories and startup migrations through
  [DatabaseStartup.cs](../../src/backend/Calendar.Api/Infrastructure/DatabaseStartup.cs).
  Runtime and migration privileges are not separated today.
- PostgreSQL reports `ssl=off`; database transport encryption is not enabled.
  Current Compose services share the default network, rather than isolating a
  backend/database-only network from the frontend service.
- Existing repository queries use parameterized Npgsql/Dapper SQL, which is
  relevant to injection resistance but does not authorize or block a client
  connecting directly to PostgreSQL with valid database credentials.

The security objective is to deny ordinary application users any database network
or credential access, with account operations going through the authorized API.
Backend connectivity and an explicitly privileged operator path must remain,
because the owner requires manual database provisioning of superadmins. Application
role checks do not protect against someone already possessing database superuser
credentials, host/container administration, or unrestricted database-file access.

The owner selected a separate preproduction hardening task. Its concrete
requirements are recorded in [plan 00009](00009-database-hardening.md). Do not claim
those controls already exist. For an existing PostgreSQL volume, changing
initialization environment variables alone is not a credential rotation or a
privilege migration; preserve data and plan the actual operator changes and
verification in that task.

### 1. Finalize scope, authorization, and security requirements

- [x] Resolve the reopened ownership/database questions before presenting the plan
  as ready for implementation. Record approved choices and explicit deferrals here.
- [x] Record the accepted security-review changes and confirmed durations, handover
  procedure and failed-attempt policy. Implementation and verification remain open.
- [x] Resolve the second review's initial-password lifecycle question. The owner
  approved the same temporary-password flow at API account creation; backend
  response-cache protection was also approved. Implementation remains open.
- [x] At the owner's request on 2026-10-18, align the owning documentation now;
  this plan supersedes conflicting earlier account/access decisions. Preserve
  unaffected architecture/calendar requirements and historical verification.
- [ ] Define a permission matrix for anonymous callers and each role, including
  direct API calls, role injection, disabled accounts, and expired sessions.
- [ ] Specify required authentication/user-creation endpoints and their maintained
  OpenAPI request/response models, error codes, cookie/security requirements,
  and validation. Login must not become an account-enumeration or unthrottled
  password-checking oracle. Do not return password hashes or accept arbitrary
  privilege changes through ordinary account fields.
- [ ] Document the backend-only boundary: new account operations are protected;
  existing calendar access remains the separately acknowledged follow-up.

### 2. Add account persistence and manual provisioning support

- [ ] Add account models, validated role representation, custom Identity stores,
  and repositories under `src/backend/Calendar.Api`. Use UUIDs and enforce the
  approved normalized-username uniqueness at the database boundary as well as
  in application validation, including concurrent requests. Persist the ordinary
  user's responsible calendaradmin relationship using a UUID foreign key and
  retain the authenticated creator separately for audit when those differ.
  Enforce the fixed association and role-transition dependency rules; do not add
  an account-transfer API.
- [ ] Add ordered DbUp migrations for account and session validity data, plus
  rolling-window failures, lockout deadlines, credential/security versions,
  temporary-password deadlines and session-bound recent-verification state.
  Do not modify migration 0001 or seed users.
- [ ] Implement the approved hash generation/provisioning support and a manual
  operator procedure with placeholders only. Apply the same validation and hash
  format to manually provisioned accounts and API-created accounts. Never place
  a reusable password or precomputed working account into a checked-in example.
- [ ] Keep automatic user provisioning absent even on an empty database and when
  all development/startup flags are enabled. Test accounts must be created by
  individual tests in disposable, isolated test databases, never by app startup
  or by shared development/production seed paths.

### 3. Implement backend authentication and authorized user creation

- [ ] Integrate the agreed maintained hashing implementation with Identity stores
  and managers; pin compatible dependencies and retain lockfiles. Use safe password
  comparison through that library and retain an upgrade path for stored hash costs.
- [ ] Implement login, current-authentication inspection and logout through the
  backend's cookie/session infrastructure. Return structured API errors instead
  of HTML redirects; never trust caller-supplied roles or user IDs as identity.
- [ ] Apply CSRF, guessing/resource limits, session expiry, persisted invalidation,
  and safe request/log handling using the finalized policies. Verification of
  authorization must not depend on a frontend hiding a button.
- [ ] Enforce `Cache-Control: no-store` for all new authentication/user-management
  responses and exclude the routes from shared response/output caches, including
  middleware-generated errors and framework-generated CSRF/cookie responses.
- [ ] Implement session-bound recent administrator verification and the atomic
  creation/reset/promotion handover state. Enforce 15-character passwords for both admin
  roles, 30-minute temporary credentials and ten-minute restricted sessions capped
  by the temporary deadline. Add the approved operator handover procedure.
- [ ] Make login, current-password changes, hash upgrades and administrative
  mutations reject stale security versions. Verify concurrency across independent
  requests/connections, including actor revocation during an in-flight mutation.
- [ ] Implement account creation according to the approved matrix. Reserve the
  superadmin privilege for manual provisioning even when the caller is superadmin.
  Check permissions before mutations and prevent races from replacing accounts.
  Create the mandatory-change flag and 30-minute credential deadline in the same
  transaction; first login must use the restricted password-change flow. Document
  fresh authorized reset when the initial credential expires before handover.
- [ ] Implement the approved self-service, superadmin and scoped calendaradmin
  maintenance operations, list queries, reset restriction, security-event logging
  and immediate session revocation. Calendaradmin reset requires both the ordinary
  target role and the approved administrator/account association, never role alone.
- [ ] Keep the existing calendar routes and frontend/BFF implementation unchanged.
  Do not imply that a backend login automatically enables the future website flow.

### 4. Update contracts, documentation, and verification evidence

- [ ] Extend `src/contract/openapi.json` and relevant generation settings, regenerate
  C# and TypeScript contract output through the existing shared workflow, and
  confirm generated output remains ignored. Do not edit frontend consumers.
- [x] Align authentication rules, architecture descriptions, forms terminology,
  backend workflow documentation and the root project description with the
  approved account model. Record superseded architecture decisions in the plan index
  while preserving the implemented architecture plan unchanged. Preserve the
  production gate for calendar/API authorization, frontend/BFF
  integration and plan 00009. This documentation alignment does not implement the feature.
- [ ] After implementation, update documentation with actual backend commands,
  configuration, operator procedures and verified behavior without claiming that
  deferred calendar/API or frontend/BFF security work has been delivered.
- [ ] Add backend API examples using placeholders or runtime-supplied credentials,
  never committed usable accounts. Document manual initial provisioning and the
  requirement that the application starts with zero accounts after migrations.
- [ ] Record actual test/security verification and the quality comparison. Mark
  this plan and its index implemented only when the approved backend deliverables
  are complete and verified; no frontend completion is implied.

## Verification

- Start and restart the application against an empty PostgreSQL database, including
  Development with the existing seed flag enabled. Assert zero account rows and
  no usable default or bootstrap credentials. Preserve the calendar-only seed.
- Provision a superadmin manually in an isolated test database using the approved
  hash format. Verify login and account creation without enabling app seeding.
- Exercise new user APIs directly as anonymous, calendar user, calendaradmin,
  superadmin, disabled account and expired/revoked session. Verify the matrix,
  appropriate authentication/authorization errors, and zero unauthorized writes.
- Attempt role injection and every API route that could create/promote an account.
  Verify no API caller can create a superadmin and ordinary users cannot create
  accounts. Calendaradmin-to-calendaradmin creation must follow the final matrix.
- Test malformed/missing/null input, normalization, username collisions and
  concurrent duplicate creation. Existing account credentials and roles must remain
  unchanged; account creation must not grant calendar membership as a side effect.
- Verify scoped account lists, including a user promoted from ordinary user to
  calendaradmin, and duplicate attempts against disabled accounts. Calendaradmins
  must not receive other administrators' users or newly promoted peer accounts.
- Verify superadmin-created ordinary accounts require a responsible calendaradmin
  and become visible/resettable by that administrator even though superadmin is
  the audit creator. Reject missing/invalid administrator IDs, arbitrary creator
  fields and reassignment attempts. Verify role toggles do not replace an existing
  association, and administrator demotion is blocked while ordinary dependants
  remain, including concurrent child creation/demotion cases.
- Verify correct/incorrect password handling, per-password random salts, no plaintext
  persistence or logging, safe hash-format handling, supported hash upgrade behavior,
  common-password rejection and the approved guessing/resource limits.
- Verify 7/8/128/129-code-point boundaries for ordinary calendar users and
  14/15/128/129 boundaries for both administrator roles, including administrator
  creation/reset/promotion, self-service changes and manual hash generation.
  Verify uppercase/lowercase/special requirements, Norwegian characters, symbols
  versus whitespace, allowed digits,
  and absence of silent truncation or trimming. A supplied lower-privilege role
  must not bypass either administrator's minimum. Verify the local tool rejects
  invalid inputs, does not echo the password, creates verifiable salted hashes, and never
  opens a database connection or writes an account.
- Verify account lockout at the fifth failed attempt, rejection during the pause,
  reattempt at its 15-minute boundary, persisted state across restarts, concurrent
  attempts, unknown-account behavior and bounded IP/global hash-resource usage.
  Use controlled time to test the rolling observation window, expiration of old
  failures, successful-verification counter reset and clearing at pause expiry.
  Repeated attempts during the pause must not alter its deadline or start hashes;
  new requests across different IPs/instances must not bypass account limits.
  Confirm success does not clear IP/global budgets or another account's counter.
- Create a calendaradmin as superadmin and ordinary users as each permitted admin
  role. Verify the initial password follows the role policy, the mandatory-change
  flag/deadline are persisted with account creation, and first login grants only
  restricted access. Administrative and ordinary protected user-management actions
  must stay denied until a different compliant password is set and a new login
  succeeds. The creator's identity/session must not change to the new account.
- With controlled time, test initial credential expiry 30 minutes after creation,
  restricted-session expiry at the earlier of ten minutes after login and that
  deadline, and immediate rejection of the original password/sessions after password
  change. Creation retries, late login and restarts must not extend the deadline.
  Verify a fresh authorized reset restores only the restricted setup flow while
  preserving account ID, reserved username and fixed responsible administrator.
- Reset a nonsuperadmin account while multiple sessions exist. Assert every old
  session is rejected immediately, the temporary-password login is restricted,
  other new user-management/admin actions remain denied, the temporary password
  cannot simply be reused as its replacement, and compliant password change clears
  the restriction while requiring a new login. Verify the same invalidation for disable and role
  changes and that reactivation never restores revoked sessions.
- With controlled time, reject temporary-password use at its 30-minute deadline.
  Cap the restricted session at ten minutes and the remaining credential lifetime;
  CSRF renewal and activity must never extend either deadline. A repeated login
  may create only a new restricted session within the original credential deadline.
  Verify a newer reset rejects reuse of the current credential, supersedes earlier
  reset state and invalidates every earlier restricted session. Expiry must never
  restore normal privileges or permit password change under expired authorization.
- Verify an authenticated calendaradmin can reset an authorized own calendar user,
  but cannot reset another calendaradmin's ordinary user, a calendaradmin, or a
  superadmin by guessing an ID or supplying creator/owner fields. Verify that a
  promoted user is no longer resettable by their former administrator. Apply the
  same temporary-password and session-revocation checks to either reset actor.
- Promote an ordinary user whose old password is known to their calendaradmin.
  Reject the old credential and all previous sessions after commit. Verify promotion
  requires a different administrator-compliant temporary password and recent
  superadmin verification, and permits only the restricted flow until password
  change. Test rollback, repeated promotion after demotion, concurrent resets and
  role changes, and the documented identity/private-handover procedure.
- Test all sensitive administrator endpoints with missing, fresh and expired
  recent verification, including the exact five-minute boundary, a different
  session, revoked sessions and changed security versions. Reject client-supplied
  verification timestamps and actor identities. Verify re-verification is protected
  by CSRF/guessing controls, cannot escape a restricted session and never extends
  the original session lifetime.
- Coordinate concurrent requests with deterministic barriers: pause login after
  password verification, commit a reset/password change/role change/disable, then
  resume login. No session valid under the newer account state may result from
  the stale verification. Also test reset racing hash upgrade, two password changes
  using the same old password, actor demotion/revocation during target mutations,
  and loss of validity-store access. Require one accepted current state and no
  restored password, stale authority or valid replay after revocation.
- Attempt every API creation, reset, status and role operation targeting a
  superadmin. Creation/promotion and other-account superadmin maintenance must
  fail; a valid superadmin may still change their own password with the old one.
- Test cookie attributes, CSRF failures, no API-to-HTML redirects, request isolation,
  fixed expiry boundaries, logout of one session while another remains valid,
  and immediate rejection of replayed invalidated sessions. Use controlled time.
- Verify `Cache-Control` includes `no-store` on the new authentication/user routes
  for successful, anonymous, forbidden, validation-failed, throttled and unexpected-
  error responses. Verify CSRF issuance and cookie-writing handlers preserve that
  policy. With any configured backend response/output cache enabled, consecutive
  requests from different users must not reuse another user's body or cookies,
  and logout/disable must not be bypassed through a cached successful response.
  Browser/BFF/proxy end-to-end cache verification remains a later integration gate.
- Test migrations, restart behavior and session persistence with real PostgreSQL,
  plus production configuration validation for secure transport/key handling.
- Run the shared backend validation/generation/build/integration-test/publish
  commands, relevant lint, saved-source quality checks, and final health comparison.
  Verify clean generation/build compatibility for both contract consumers without
  changing maintained frontend source. Report frontend/BFF authentication/CSRF
  end-to-end coverage as deferred, not passed.

## Security references checked on 2026-10-18

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html):
  maintained slow hashing, unique salts, memory-hard algorithms, and cost upgrades.
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html):
  password length and online guessing controls; use the final guidance rather
  than earlier drafts. No absolute resistance to guessing is implied.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html):
  safe authentication failures, recent authentication for sensitive actions and
  automated-attack controls, including lockout denial-of-service trade-offs.
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html):
  recovery credential lifecycle, private handover and session invalidation.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html):
  session expiry, reauthentication, changes in privilege and `no-store` protection
  for sensitive session responses.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html):
  enforce authorization at the backend boundary on every relevant request.
- [ASP.NET Core antiforgery guidance](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0):
  framework token validation and the cookie/header contract for future BFF relay.
- [PostgreSQL host authentication](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html)
  and [role attributes](https://www.postgresql.org/docs/18/role-attributes.html):
  database authentication and privileged database roles are separate from app roles.
- [Official PostgreSQL container image](https://hub.docker.com/_/postgres):
  local initialization defaults, local trust, superuser creation, and the fact that
  initialization variables do not update an existing database volume.
