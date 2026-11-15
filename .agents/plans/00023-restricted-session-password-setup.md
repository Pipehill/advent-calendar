# 00023: Complete required password setup using the restricted session

Status: Not implemented

Last updated: 2026-11-15

Implementation type: feature

After a temporary-password login, ask only for the replacement password. The
backend-validated restricted session proves the successful login, so the user
does not have to type the temporary password a second time. Voluntary password
changes continue to require the current password. This owns the corresponding
open TODO item and follows the administrator lifecycle in plans
[00008](00008-backend-user-management.md), [00011](00011-login-and-my-page.md) and
[00020](00020-calendar-user-passwords.md).

## Requirements

1. A user with a valid mandatory-change restricted session completes required
   setup by entering only a new password. The UI, BFF and backend must not require,
   retain or replay the temporary password from the login form for this operation.
2. The backend derives eligibility from the live account and persisted session:
   valid restricted session, current mandatory-change state and unexpired
   credential/session deadlines. Browser flags and role labels alone grant no
   permission. Reject expired/revoked sessions, disabled or paused accounts and
   stale account/security-version state.
3. Require a different replacement password under the existing role-aware
   strength, Unicode, weak-password and hashing policies. Complete replacement,
   clear temporary metadata, rotate security version and revoke all sessions
   atomically. Require a new login after successful completion, as today.
4. Unrestricted voluntary changes continue to require correct current-password
   verification and a different compliant replacement. Ordinary calendar users
   retain permanent administrator-set passwords under plan 00020.
5. Preserve CSRF, no-store, protected-cache clearing, resource limits, safe errors
   and secret-free responses/logs. Concurrent setup/reset/role/status operations
   must not restore old credentials, bypass restrictions or commit setup twice.
6. Present required setup and voluntary change correctly in Norwegian and English,
   with field-specific errors, password masking, keyboard operation and usable
   mobile layout.

## Outstanding questions

None identified from the TODO request and existing lifecycle rules. The owner
explicitly deferred any clarification discovered during implementation to this
section. The separate operation below is an agent-selected technical choice;
successful setup continues to require a fresh login rather than introducing an
unrequested automatic sign-in or new password-confirmation field.

## Implementation details

### Current behavior and affected components

- `CredentialForm` always renders `currentPassword` and `newPassword` for password
  changes. `/change-password` already loads a validated session and displays
  required versus voluntary explanatory text, but does not pass that distinction
  into the form. Login and password forms share this component.
- `changePasswordInput`, `browserAuthClient`, `auth.changePassword` in
  `server/trpc.ts` and authored `ChangePasswordRequest` all require the current
  password. The generated backend client/controller follow that OpenAPI contract.
- `AuthenticationService.ChangePasswordAsync` allows a restricted session but
  always calls `PasswordAttempts.CheckAsync` before replacing credentials.
  `SessionService` and `ISecurityTransaction` own persisted validity and atomic
  security checks; `AccountCredentialService.ReplacePasswordAsync` already clears
  temporary state, rotates the security version and revokes sessions.
- `IPasswordVerification` provides existing hash comparison and a race-test seam.
  The new flow must check that the replacement differs without counting a new,
  different password as an incorrect login attempt.

### Agent-selected implementation approach

1. Add a distinct authored `POST /auth/complete-password-setup` operation and
   request schema containing only `newPassword`. Require authentication and CSRF;
   describe validation, denied/stale authorization, conflict, throttling and
   availability responses using existing ProblemDetails patterns. Generate both
   consumers through `src/contract/Contract.proj`; never edit generated output.
2. Add a controller/service operation using the existing layers. Inspect persisted
   eligibility in a short shared security transaction, perform bounded validation,
   same-password hash comparison and hashing, then re-read session/account under
   the committing transaction. Recheck restricted/mandatory state, enabled/lockout
   state, both deadlines, role, security version and original hash before the
   existing atomic replacement. At most one concurrent completion may succeed.
3. Do not use the replacement password as input to `PasswordAttempts.CheckAsync`:
   a failed comparison with the old hash means it is different, not failed
   authentication. Preserve password-policy rejection and resource-budget behavior;
   invalid proposals must not extend deadlines or obtain unrestricted privileges.
4. Keep `/auth/change-password`'s current-password contract for voluntary changes
   and compatible existing callers. The new operation rejects unrestricted or
   no-longer-mandatory sessions. A restricted session still cannot access calendar,
   account maintenance or recent-verification operations.
5. Add a strict Zod input, tRPC mutation and browser-client method for completion.
   Follow the existing principal-bound CSRF/cookie relay and sign-out behavior;
   return no credentials or session upgrade. Clear protected caches and leave for
   `/login?changed=1` on success, using the existing document navigation boundary.
6. Select form mode from the validated `mustChangePassword` value. Required setup
   renders only `newPassword`; voluntary change still renders both password
   fields. Preserve localized administrator policy help and map backend password
   validation errors onto `newPassword` in both modes.
7. Update current owning instructions and examples in
   [authentication rules](../rules/authentication-and-calendar-access.md),
   [backend authentication](../../src/backend/authentication.md),
   `src/backend/Calendar.Api/authentication.http` and the affected frontend docs.
   Explain the narrow session-proof exception to current-password verification.
   Leave implemented plans unchanged as historical records.

### Dependencies and work order

This plan can be implemented independently of release and recipient UI plans.
[Plan 00024](00024-login-progress-and-calendar-routing.md) also touches
`CredentialForm`; preserve its login pending/navigation behavior when combining
the changes. [Plan 00025](00025-recipient-interface-and-locked-door-feedback.md)
removes the calendar-user password button but does not remove the voluntary API.

- [x] Iteration 1: implement the authored operation and backend security transaction;
  verify generated contracts and direct integration/security race tests, then commit.
- [ ] Iteration 2: add the strict BFF/schema operation and localized form modes;
  verify unit tests, type/build checks and actual browser coverage, then commit.
- [ ] Iteration 3: update current rules/examples and verification records; complete
  full tests, lint, baseline comparison and committed-head regression review,
  update the plan/index and publish the draft PR.

### Implementation decisions and resume record

- The owner authorized autonomous choices and deferred any discovered clarification
  to explicit documentation in each PR description. No questions will interrupt
  these implementations. Each plan gets its own branch and PR against `main`.
- The owner explicitly requested marking plan 00021 implemented in this PR.
  Record that acceptance without inventing live deployment measurements or
  changing unchecked historical verification obligations into passing evidence.
- Initial source: `58fc70b` on clean, synchronized `main`. Baseline captured before
  edits under `quality-reports/health/baseline`; previous baseline archived as
  `baseline-before-00023-20261115`.
- Iteration 1 verification: generated contract and Release compilation pass;
  42 setup/concurrency cases pass after formatting, and the broader authentication
  selection passed 86 cases before the final assertion-helper extraction.
  Both administrator roles, strict payloads, CSRF, persisted eligibility, paused
  accounts, concurrent completion/reset/disable/role changes and deadline expiry
  during comparison and actual hashing are covered. No migrations changed.
- Extracted the shared one-winner race assertion and separated setup boundary and
  concurrency suites after inspecting duplication. The remaining new clone is
  11 import/namespace/class declaration lines shared with existing test suites;
  preserving required imports and separate behavioral suites is intentional.
- Next unfinished step: iteration 2 browser regression verification and commit.

## Verification

| Requirement | Evidence to collect during implementation |
| --- | --- |
| 1, 6 | Required administrator setup displays only a masked new-password field in both languages; inspect requests to confirm no temporary/current password is resent. Validate errors, keyboard/mobile behavior and successful navigation to the changed-password login message. |
| 2, 5 | Direct backend/BFF attempts with anonymous, unrestricted, expired-at-boundary, revoked, disabled, locked, reset-superseded or stale-role sessions fail. Missing/wrong CSRF fails; restricted sessions still fail every unrelated protected operation. Test expiry during hashing as well as at entry. |
| 3 | Same password, weak password, length/Unicode and missing/null/unknown-field cases follow policy without resetting credential/session expiry. Valid replacement clears required metadata, changes the hash/version, revokes every old session and permits a fresh unrestricted login. |
| 3, 5 | Race two completions and race completion against administrator reset, disablement and role change through existing verification barriers. At most one applicable mutation wins; stale work cannot overwrite a newer credential or clear a newer restriction. Different-password comparison does not accumulate authentication failures. |
| 4 | Existing voluntary-change cases still reject missing/wrong current passwords and preserve persisted guessing controls. Correct voluntary changes for each role still revoke sessions. Ordinary creation/reset/promotion/demotion lifecycle cases retain their current behavior. |
| 5, 6 | Auth responses/errors remain no-store, cookies retain their attributes, CSRF refresh is principal-bound, and passwords are absent from logs/storage/SSR. Run generated-contract validation, backend integration tests, BFF/unit tests, browser lifecycle regressions, type/build checks and the required quality review. |
