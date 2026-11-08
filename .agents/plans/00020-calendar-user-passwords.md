# 00020: Permanent administrator-set passwords for calendar users

Status: Not implemented

Last updated: 2026-11-08

Let administrators set a calendar user's password once, without requiring the
recipient to choose another password before using the application. This reduces
setup steps for children. Apply the same rule to existing calendar users and
accounts demoted to that role, while retaining temporary credentials and required
password changes for administrator roles.

## Requirements

1. When an authorized calendaradmin or superadmin creates a `calendarUser`, the
   administrator-supplied password is immediately usable for ordinary login.
   Do not require a recipient password change or impose the current 30-minute
   temporary-credential deadline on that password.
2. An authorized administrator's password reset for a current `calendarUser`
   supplies another permanent password. Preserve existing target permissions,
   recent administrator verification, different-password validation, security
   version rotation and revocation of all target sessions. The user must log in
   with the replacement password; the resetting administrator keeps their session.
3. Existing calendar users retain their current passwords without mandatory
   replacement, including users whose temporary passwords have already passed
   the 30-minute deadline. Remove the mandatory-change state and credential
   deadline without changing hashes, identities, responsibility or calendar data.
   Do not enable disabled accounts or remove existing failed-attempt/lockout state.
4. Apply the same rule whenever an account becomes a `calendarUser`, including
   demotion of an administrator whose password is still temporary or expired.
   Preserve the current hash, clear mandatory-change/deadline state and revoke
   previous sessions. Existing demotion permissions and responsibility rules apply.
5. Calendar users receive normal unrestricted sessions and navigate directly to
   `/my-page` after login. Keep the existing fixed 30-day ordinary-user session
   lifetime. Removing a password deadline does not remove session expiry, logout,
   lockout, disabled-account checks or calendar assignment authorization.
6. Calendar users may still voluntarily change their own passwords using the
   existing current-password verification flow. Preserve validation, revocation
   of all sessions and the requirement to log in again after a successful change.
7. Administrator credentials retain their current behavior: calendaradmin
   creation/reset and promotion to calendaradmin use a different compliant
   temporary password, a 30-minute credential deadline, restricted setup sessions
   and required password change. Superadmin provisioning/maintenance stays manual.
8. Update Norwegian and English labels/help so creation/reset of a calendar user
   clearly supplies a password that can be kept. Only administrator operations
   describe passwords as temporary or say they expire and must be changed.
   Preserve private handover instructions and never return, store in plaintext,
   redisplay after submission or log passwords.
9. Keep existing password strength/length/weak-password policies, hashing,
   recent verification, CSRF, no-store, concurrency protection, role authorization
   and responsibility boundaries. Determine credential lifecycle from the
   backend-validated target role; do not add a caller-controlled bypass flag.
10. Keep this task independently implementable alongside
    [plan 00019](00019-recipient-calendar-view.md). It changes account setup and
    login, without granting calendar viewing or opening authority itself.

## Outstanding questions

None.

## Implementation details

### Confirmed decisions and repository facts

- The user requested a separate plan in the existing
  `plan/recipient-calendar-view` branch, so calendaradmins can set lasting
  passwords for calendar users, who will often be children.
- The user confirmed that existing calendar users also keep their passwords,
  including expired temporary passwords, and that all calendar users follow the
  same rule, including accounts demoted from calendaradmin.
- `UserAdministrationService.CreateAsync` currently sets `MustChangePassword =
  true` and `TemporaryPasswordExpiresAt = now.AddMinutes(30)` for every created
  role. `ResetPasswordAsync` always calls `ReplacePasswordAsync` with
  `temporary: true`. Promotion also explicitly requests temporary credentials;
  demotion currently leaves credential state unchanged and revokes sessions.
- `AccountCredentialService.ReplacePasswordAsync` already supports permanent
  credentials through `temporary: false`, rotating the security version, clearing
  password-attempt state and revoking sessions after password replacement.
- `PasswordAttempts` in `Services/PasswordVerification.cs` rejects expired
  temporary credentials. `AuthenticationService` makes sessions restricted when
  `MustChangePassword` is set; `SessionService` checks current stored state.
  `AuthController` exposes `SessionDto.mustChangePassword` from session restriction.
- Frontend login and route guards already follow the backend's
  `mustChangePassword`. `AccountForm` currently always uses temporary-password
  labels and handover text, including ordinary-user creation/reset.
- The database requires `must_change_password` to agree with presence of
  `temporary_password_expires_at`; clear them together. The latest published
  migration is `0005_add_door_images.sql`, and plan 00019 also anticipates a new
  migration. Choose the next unused number when implementing each plan.
- This plan supersedes the universal temporary-password requirement only for
  accounts in the `calendarUser` role. Implemented plans 00008/00011/00013 remain
  unchanged historical records. Update the owning rules/documentation when the
  new behavior is implemented, rather than presenting it as already delivered.

### Agent-selected implementation choices

These are routine technical choices for the confirmed scope. No new library,
endpoint, authentication mechanism or deployment setting is needed.

#### Role-specific credential lifecycle

- In `UserAdministrationService`, derive initial credential state from the
  authorized created role: ordinary users get `MustChangePassword = false` and
  a null deadline; calendaradmins retain temporary state and the current deadline.
  Leave ordinary-user responsibility/creator assignment unchanged.
- For resets, use the target role revalidated inside the committing security
  transaction to select `temporary`. Keep role-aware password validation and
  hashing outside the transaction, and the existing snapshot/version checks to
  reject concurrent target changes. Do not weaken checks because the result is
  a permanent password or infer policy from the acting administrator's role.
- Preserve the promotion flow's explicit administrator temporary password and
  requirement that it differ from the current password. A child account's
  permanent password must never become an administrator credential unchanged.
- On demotion, clear temporary state/deadline without replacing the hash,
  resetting lockout or clearing failed attempts. Extend the repository operation
  so role/security-version/credential-state changes commit together under the
  shared transaction and lock 800008. Revoke all sessions, and do not call the
  password-replacement helper merely to clear metadata, since that helper also
  clears failed-attempt state. Responsibility/dependant checks remain mandatory.
- Keep authentication/session code driven by validated persisted credential state.
  Do not special-case frontend redirects to ignore `mustChangePassword` for
  ordinary users, or bypass temporary-password checks globally. Administrator
  restrictions and denial of inconsistent/restricted sessions remain enforceable.

#### Existing-account transition

- Add a new journaled DbUp data migration. Select only accounts currently in the
  `calendarUser` role with pending mandatory-change/deadline state. Clear both
  values and rotate each affected account's security version; revoke all existing
  sessions for those affected accounts within the same migration transaction.
  A fresh login with the retained hash then creates a normal unrestricted session.
  Do not upgrade restricted sessions in place or extend their persisted expiry.
- Include expired credentials as explicitly approved by the user. Preserve
  `enabled`, `locked_until`, password failures, hashes, names, usernames,
  responsibility, creator, calendars, door content/images and any opening history.
  Disabled or locked accounts still fail login under the existing rules.
- Leave administrator rows and sessions unchanged, as well as calendar users
  whose passwords are already permanent. Repeated startup uses the DbUp journal
  without repeating the conversion or logging out users again. Create no accounts.
- Stop the old backend before applying the migration as required by the existing
  deployment rules; otherwise older code could create new temporary ordinary-user
  state after conversion. Document that reverting code does not revert this data
  transition or restore expired credential deadlines.
- Coordinate migration sequence numbers with whichever plan is implemented first.
  The conversion does not depend on plan 00019's opening-history schema and must
  preserve it if present. Never edit a published migration to resolve a collision.

#### Frontend, contract and documentation

- Keep create/reset wire fields and `SessionDto.mustChangePassword` intact;
  update authored OpenAPI operation descriptions to explain target-role-specific
  permanent/temporary behavior. Regenerate both consumers through the normal
  contract workflow; generated files stay ignored.
- In `account-form.tsx` and `account-form-values.ts`, reuse the effective target
  role logic for password labels and handover guidance: creation follows selected
  role, reset follows target role and promotion remains an administrator action.
  Ensure switching the creation role updates the help and retains existing draft
  clearing/validation behavior. Do not add a mandatory-change checkbox.
- Add localized ordinary-user password/handover/reset text. Say that the recipient
  can use the supplied password directly and may change it later. Keep the
  temporary label, expiry and required-change text for calendaradmins/promotion.
  Reset guidance still explains session revocation and replacement of the former
  password. Preserve the private-handover and password-not-shown-again guidance.
- Preserve the generic login error across account roles; any reference to expired
  temporary credentials must remain conditional and accurate for administrators.
  The voluntary password-change page and header action remain available to users.
- Update `.agents/rules/authentication-and-calendar-access.md`,
  `docs/architecture.md`, `src/backend/authentication.md`, relevant API `.http`
  examples and root/frontend README descriptions during implementation. Explain
  role differences, legacy conversion, new-login requirements and unchanged
  administrator setup. Add verification evidence to the existing owners.

#### Independent delivery and verification fixtures

- Plan 00019 continues to require unrestricted sessions and current recipient
  assignment. This plan makes ordinary account creation/reset produce those
  sessions after login; it does not change the recipient authorization design.
  Either plan can be implemented and verified first.
- Update backend and browser fixtures that currently assume every created/reset
  ordinary user must change their password before testing other features.
  Preserve voluntary-change coverage where it tests a real behavior.
- Move tests for temporary credential expiry, restricted setup and reset recovery
  to calendaradmin targets where needed, preserving assertions and appropriate
  superadmin actor permissions. Add distinct ordinary-user lifecycle tests instead
  of deleting the old restriction coverage. Explicitly injected restricted-session
  tests may remain when they verify defensive denial rather than normal issuance.

### Work steps

- [ ] 1. Add role-specific creation/reset behavior and demotion metadata handling;
  preserve administrator promotion, concurrency and authorization protections.
- [ ] 2. Add the existing-user conversion migration and database-backed transition,
  restart, revoked-session, expired-credential and disabled/locked-account tests.
- [ ] 3. Update role-aware frontend labels/help, contract descriptions, generated
  consumers, account/login tests and affected browser fixtures.
- [ ] 4. Verify both role lifecycles, voluntary changes and the documented
  transition; update owning rules/docs and complete required quality checks.

## Verification

- Create an ordinary user through a calendaradmin and through superadmin with
  valid responsibility. Assert false mandatory-change state, null deadline and
  normal login immediately, after 30 minutes and after several days. Verify a
  fixed 30-day unrestricted session and direct navigation to `/my-page`.
- Reset an ordinary user's password through each authorized administrator role.
  Assert old password/session denial, new password acceptance without forced
  change, normal session lifetime, preserved responsibility and the actor's
  unaffected session. Reject cross-responsibility/wrong-role/self/unauthorized
  targets, reused passwords, stale verification and concurrent role changes.
- Test migration with pending/unexpired/expired ordinary passwords, already
  permanent users, disabled/locked users, retained failure records and
  administrator controls. Assert unchanged hashes and business data, atomic
  state/version changes, old session denial and new login where otherwise allowed.
  Verify rollback on migration failure and journal-based restart without repeated
  session invalidation; run with plan 00019 schema present when it is available.
- Demote calendaradmins with permanent, temporary and expired credentials. Verify
  unchanged hash, cleared mandatory state/deadline, revoked sessions, retained
  lockout/failures and normal user login where otherwise permitted. Preserve
  responsibility/dependant restrictions. Promote an ordinary user and prove the
  existing password cannot be reused as its administrator credential.
- Retain administrator creation/reset/promotion tests around the 30-minute
  credential deadline and ten-minute restricted-session cap. Verify required
  password change, no normal/admin access before change and fresh login after
  change. Retain recent-verification, lockout, CSRF, no-store and concurrent-write
  tests, including calendar access denial for restricted/revoked sessions.
- Verify voluntary ordinary-user password changes require the correct current
  password, enforce the existing strength rules, revoke all sessions and require
  login with the new password. No weakening of complexity/length/weak-password
  checks is part of this task.
- Frontend/BFF and production browser scenarios cover creation/reset for both
  roles, superadmin role switching, private handover guidance, login destinations,
  voluntary changes and Norwegian/English text. Assert ordinary-user help makes
  no temporary/30-minute/mandatory-change claim while administrator help retains
  it. Verify passwords remain absent from responses, logs and saved UI state.
- Once plan 00019 is available, smoke-test a newly created and reset ordinary
  account going directly from login to its assigned calendar and opening an
  eligible door. This cross-plan check is supplementary; isolated completion of
  this plan does not require implementing recipient viewing.
- During implementation run contract validation/generation, backend migration/
  authentication tests, frontend/BFF tests, affected production browser scenarios,
  explicit TypeScript checks, builds and required full quality/health checks.
  This Markdown-only planning change skips automated application checks under
  the repository exception and does not claim those checks have run.
