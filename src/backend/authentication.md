# Backend authentication

The backend implements username/password accounts, persistent cookie sessions and
the three roles `superadmin`, `calendarAdmin` and `calendarUser`. New account
operations enforce authentication/authorization independently of the website.
Calendar POST/GET remain anonymous. Calendar authorization, frontend/BFF security
integration and database hardening are required before production.

## Direct API exchange

1. Call `GET /auth/csrf` with a cookie jar. Preserve `advent.csrf` and read the
   `requestToken` response field.
2. Send `POST /auth/login` with JSON `username`/`password`, the cookie and
   `X-CSRF-TOKEN: <requestToken>`. Preserve the `advent.auth` response cookie.
3. Refresh `/auth/csrf` after login or any principal change. Tokens are bound to
   that principal. Both cookies are host-only, HttpOnly, SameSite=Lax, path `/`,
   and Secure outside Development/Testing.
4. Inspect `/auth/session`. A temporary-password session permits only inspection,
   CSRF refresh, own-password change and logout. Send `currentPassword` and a
   different `newPassword` to `/auth/change-password`, then log in again.
5. Send a fresh principal-bound token with every unsafe authentication/user
   operation, including login, logout, re-verification and administration.

All `/auth` and `/users` responses carry `Cache-Control: no-store`, including
errors and responses issuing cookies or CSRF tokens. Controller metadata also
disables framework response/output caching. Errors are structured ProblemDetails,
never HTML redirects. API responses contain no passwords or password hashes.

The [authored OpenAPI](../contract/openapi.json) defines the routes and required
fields. Unknown properties, missing/null required fields, numeric enums and
unsupported roles are rejected. `GET /users?offset=0&limit=50` permits at most 100
results/page; calendaradmins see only their current assigned ordinary users.
Creation never grants calendar access.

An unrestricted administrator login establishes five minutes of recent verification
in that session. At the exact deadline, creation, reset, status and role mutations
require `POST /auth/reauthenticate` with the current `password`. Re-verification
does not extend session expiry. Listing does not require recent verification.

The future BFF must allowlist only `advent.auth`, `advent.csrf` and `X-CSRF-TOKEN`
on request-scoped exchanges and separately relay their designated `Set-Cookie`
headers with attributes preserved. Preserve `no-store`, refresh CSRF on principal
changes, and never relay arbitrary cookies/identity headers or decrypt backend
cookies. Frontend/BFF relay and browser end-to-end verification remain deferred.

## Responsibility, temporary credentials and sessions

Superadmins create calendaradmins or ordinary users. Calendaradmins create only
ordinary users. No API creates/promotes superadmins. Every ordinary user has one
fixed responsible calendaradmin, derived from a calendaradmin creator or explicitly
selected by superadmin using `responsibleAdministratorId`. The actual `createdById`
is separate audit metadata. Responsibility cannot be reassigned through role
toggles. Demotion with ordinary dependants is blocked; disable does not disable
the dependants. Calendaradmins reset only their own currently ordinary users.

API-created, reset and promotion passwords are temporary for **30 minutes**.
Administrators supply them in protected requests; they are never returned and
creation never signs the actor into the new account. Verify the recipient's
identity and hand over privately outside the application. Promotion always
requires a different administrator-compliant temporary password delivered directly
by superadmin, without involving the former administrator. Possession of a
temporary credential alone does not prove recipient identity.

Restricted sessions last at most **ten minutes**, capped by the original credential
deadline. Login, CSRF refresh and activity never extend the deadline. Expiry
preserves the account, username reservation and responsible administrator; issue
a fresh, different temporary credential through the authorized reset endpoint.
A newer reset supersedes earlier credentials and sessions. Own-password change
requires the current password and a different compliant replacement, atomically
clears temporary state, revokes all sessions and requires a new login.

Unrestricted ordinary sessions last 30 days and administrator sessions eight hours.
Lifetimes are fixed and persistent. Logout revokes only the current session.
Password replacement, disabling and role changes advance the security version and
invalidate every account session. Enabling never revives revoked sessions.

## Manual superadmin provisioning

Startup creates **zero accounts**, including Development with calendar seed enabled.
There are no default credentials, bootstrap flags, automatic hooks or provisioning
routes. Build with the pinned SDK, then use its `dotnet` executable interactively:

```text
dotnet run --project src/backend/Calendar.PasswordTool -- <username> superadmin
```

Replace the username placeholder. The tool accepts only username/role arguments,
rejects redirected input, reads the password without echo and applies the shared
role-aware policy. It prints the normalized username and salted Argon2id PHC hash.
Protect this operator output. Its dependency graph has no database library,
connection option or account-write path. Never put real passwords in arguments,
URLs, logs, saved SQL or repository files.

An authorized operator separately connects to PostgreSQL using externally supplied
credentials and intentionally inserts the account. This psql template uses
operator-supplied variables, with no working account/hash. Use exact normalized
output from the tool and safely bound/quoted database-client values:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(800008);
INSERT INTO accounts (
    id, user_name, normalized_user_name, password_hash, account_role,
    security_version, created_at
) VALUES (
    gen_random_uuid(), :'username', :'normalized_username', :'password_hash',
    'superadmin', gen_random_uuid(), CURRENT_TIMESTAMP
) RETURNING id, user_name, account_role;
COMMIT;
```

Usernames accept 3-64 Unicode letters/digits/dot/hyphen/underscore and normalize
with .NET invariant uppercase, without trimming. PostgreSQL enforces unique
normalized values using `C` collation. Manual operators must use the tool's output,
including for Norwegian letters, rather than database-locale-specific `upper()`.
Disabled usernames remain reserved.

Other-account superadmin maintenance is manual too. In an explicit transaction,
take advisory lock `800008`, verify the target and relationship rules, advance its
`security_version` to a new UUID and revoke all its `account_sessions`. For manual
password replacement use a fresh shared-format hash; clear obsolete failures/pause
state and set intended temporary state/deadline atomically. Never restore an old
hash/session. Keep database operator access separate from application roles.

## Password policy, guessing and concurrency

The shared Identity hasher uses [Geralt 4.4.0](https://www.nuget.org/packages/Geralt/4.4.0)
and locked libsodium 1.0.22. The maintained
[Argon2id API](https://www.geralt.xyz/password-hashing) generates random 128-bit
salts and PHC metadata: version 19, 64 MiB, three passes, parallelism one. This
exceeds the [OWASP minimum](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Verification bounds encoded costs before native work. Supported older costs upgrade
after successful verification and a final version/hash check; stronger costs are
not downgraded. No cryptographic primitives are authored.

Both administrator roles require 15-128 Unicode code points; ordinary users need
8-128. Uppercase, lowercase and punctuation/symbol characters are required. Digits
are optional; spaces do not satisfy the symbol requirement. Passwords are
case-sensitive and never trimmed, normalized or truncated. Invalid UTF-16 is
rejected. The owner-approved policy does not claim NIST compliance, MFA or phishing
resistance.

Known weak passwords are checked locally against lowercase SHA-256 fingerprints
of the SecLists 10k list at commit `913b327317496d062bcc7cace524aaad8a693be2`.
Common capitalization/digit/punctuation decorations of listed words are rejected
too. These fast fingerprints are public blocklist data, never account password
storage; no candidate is sent to an external service. See
[source attribution and update procedure](Calendar.Security/README.md).

Five failures within a rolling 15-minute account window produce a fixed 15-minute
pause. Successful accepted verification or pause completion clears failures.
Attempts during a pause do no password hashing, add no failures and do not extend
it. Current-password checks share these persisted controls. Login failures have
generic output and a common 500 ms minimum reply time to reduce simple timing
signals; this is not a constant-time network guarantee.

Per instance, account writes allow 30 requests/minute per actual peer and 120
globally. Reads, including CSRF, allow 120/peer and 600 globally. At most two
potentially hashing operations run concurrently, with zero queue capacity. Excess
work returns 429 before hashing. Logout/status operations do not occupy hash slots.
Untrusted forwarding headers cannot manufacture peer budgets; successful requests
never reset resource budgets. Account failures, versions and sessions persist
across restarts/instances; aggregate resource budgets are per process and restart
with it. Deployment scaling must account for that per-instance capacity.

Security decisions use short PostgreSQL transactions and advisory lock `800008`
across instances. Expensive verification/replacement hashing runs outside the lock,
then atomically rechecks verified version/hash, actor session/authority/recent
verification, target role/responsibility, status and deadlines. This favors clear
correctness over maximum administrative throughput. Store failure denies access
with 503; stale verification/hash upgrades cannot revive older credentials or
authority. Concurrent password changes can commit at most once.

Targeted lockout denial of service remains possible across successive pauses.
Trusted operators must investigate and recover through intentional database
maintenance, especially for superadmins, with version/session invalidation as
above. There is no public bypass or automatic account provisioning. Structured
events include operation, actor/target IDs, result, timestamp and trace context;
they exclude bodies, passwords, hashes and cookie/token values.

## Keys and transport

Host Development/Testing persists local keys in ignored `.auth-keys` under the
backend content root unless `Authentication__KeyDirectory` overrides it. Protect
these files; Docker build contexts exclude them. Local Compose persists keys in
`development-authentication-keys` at `/var/lib/advent-keys`, writable by the image's
nonroot application user. Preserve that volume during ordinary cleanup.

Other environments require an existing absolute `Authentication__KeyDirectory`
and an external PFX certificate at absolute `Authentication__KeyCertificatePath`,
with externally supplied `Authentication__KeyCertificatePassword` when needed.
The current certificate must contain its private key; Data Protection encrypts
persisted keys to it. No ephemeral/development fallback is allowed. Preserve keys
and the certificate through replacement/rotation. Secret delivery, volume
protection, rotation and trusted TLS/proxy configuration remain deployment work.
Account routes require HTTPS outside Development/Testing. Arbitrary forwarded
headers are not trusted. Local Compose remains Development-only.
