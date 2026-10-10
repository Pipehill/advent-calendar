# Authentication and calendar access implementation rules

Apply these rules to credentials, sessions, administrator provisioning, calendar
authorization/editing, and protected SSR/cache data. See the
[architecture description](../../docs/architecture.md) for flows and rationale,
[data rules](data-and-migrations.md) for storage/migrations, and
[API contracts](api-contracts.md) for validation, representation, and error mapping.

## Accounts and permissions

- Keep the invitation-code landing page public; require login for calendar use.
  Support ordinary email/password registration and login. Invitation codes grant
  calendar membership through the invitation flow, never identity or admin rights.
- Provide separate administrator accounts/pages. Restrict administrator creation
  to an owner-operated on-demand .NET CLI with database access; expose no public
  administrator-creation endpoint. The tool is not another long-running service.
- Use ASP.NET Core Identity with custom Npgsql/Dapper stores for the interfaces
  needed by email/password accounts and roles. Share account creation/validation
  and maintained password hashing/verification between API and CLI. Store salted
  hashes, never decryptable passwords. Preserve the EF exclusion in data rules.
- Do not require OAuth2, external identity providers, or multifactor authentication.
  Resolve concrete CLI packaging and production invocation in setup/deployment.
- Let administrators create owned calendars and calendar-specific invitation codes.
  Enforce roles, ownership, and member access in the backend independently of UI;
  do not let an administrator manage another administrator's calendars by role alone.

## Cookie transport and session validity

- Let the .NET backend issue/validate ASP.NET Core authentication cookies. Use
  host-only, HttpOnly, SameSite=Lax cookies, Secure in production, scoped to the
  public frontend/BFF origin.
- Relay only the designated authentication cookie in request-scoped BFF/API calls,
  including SSR. Relay relevant backend Set-Cookie headers for login/logout or
  reissuance separately, preserving their attributes and public-origin scope.
- Do not decrypt cookies in the BFF or trust browser-supplied identity/role headers.
  Return API authentication errors rather than HTML login redirects; describe
  authentication operations and cookie security in authored OpenAPI.
- Protect state-changing browser requests, including authentication operations,
  against CSRF; SameSite alone is insufficient. Verify the chosen mechanism through
  browser/BFF/API during runnable setup without treating a particular library as selected.
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
  preserve original expiry during checks. Resolve the concrete schema at runnable
  setup; verify multiple sessions, unaffected sessions after logout, and controlled
  expiration for both account types.

## Calendar opening and administrator editing

- Use Europe/Oslo for every calendar initially; do not add per-calendar timezone
  selection. Derive each opening instant from its assigned date at 07:00 using
  named-zone rules, independent of browser/container timezone or fixed UTC offset.
  Keep UTC instant transport/storage and date-only business dates per API rules.
- For members, enforce opening using current backend server time plus valid session
  and membership. Keep earlier doors available; direct API access and altered
  browser clocks must not bypass future-door restrictions.
- Give administrators full preview/edit access to owned calendars before and during
  the period, including future content. Allow moves only while both source and
  destination are before scheduled opening, determined by backend time rather than
  member clicks. Check ownership/privileges and both opening boundaries for moves.
- Withhold future content from member API responses, SSR HTML, hydration data,
  prefetches, and caches. Separate administrator/member responses and caches,
  including current user/calendar context. Clear protected browser data on session
  changes and prevent shared response caches from leaking authorized output.
- Refresh relevant data at opening and after edits/moves, preventing stale locked
  states while preserving access checks. Client timers trigger fetches only; the
  backend decides availability.
- Verify unauthorized/cross-owner access, role escalation through registration or
  codes, concurrent SSR/user isolation, and future-content absence. Use controlled
  time immediately before/at/after 07:00, different client/server timezones, altered
  clocks, moves across either opening boundary, and refresh after changes.
