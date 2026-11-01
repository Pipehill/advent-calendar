# 00015: Create and administer calendars

Status: Not implemented

Last updated: 2026-11-01

Implementation type: feature

## Overview

Let calendar administrators create calendars for their assigned calendar users
through a dedicated form, then prepare the calendars on a dedicated administration
page. Include background selection, door titles and messages, chronological or
random door layouts, and a full administrator preview.

Include a list of the administrator's own calendars on their personal page so
they can return to administration later. Only calendar administrators are included
in this increment. Superadmin calendar administration and recipient viewing/opening
belong to separate work.

## Requirements

1. Enable the existing create-calendar action on the calendar administrator's
   personal page at `/my-page`. It must navigate to a separate creation page.
   Protect direct navigation, refresh and browser/BFF/API operations using the
   current unrestricted backend-validated session and role.
2. Collect the calendar name, one existing calendar user and a background image.
   Keep the existing calendar-title policy: trim surrounding Unicode whitespace,
   require 1-100 Unicode code points and reject NUL/invalid Unicode. The selected
   recipient must currently hold `calendarUser` and belong to the acting calendar
   administrator under the fixed account-responsibility model.
3. Automatically use the current year in Europe/Oslo when creating the calendar.
   Persist that year; do not recalculate it on subsequent reads or add a year
   selector. Each calendar contains exactly 24 doors, numbered 1-24, corresponding
   to December 1-24 of its stored year.
4. Provide three or four original background proposals covering the requested
   directions: cute, action-filled, suitable for small children, and suitable for
   older children. The form must show understandable image choices and persist
   the chosen background. Produce and integrate the images during implementation.
5. The create button must persist the calendar and all 24 initially empty doors
   before navigating to that calendar's administration page. Derive ownership
   from the validated administrator session; do not accept a caller-supplied owner.
   Show validation and submission errors, retain form values after failure and
   prevent duplicate submissions while pending. Do not automatically retry writes.
6. Let the owner choose a door and edit its content title and message. Persist both
   fields and show their saved values after refresh and later visits. Keep the
   door number independent of its position in the visual layout. Use an explicit
   Save button and plain text with line breaks. Limit door titles to 50 Unicode
   code points and messages to 5000; both fields may be empty during preparation.
7. Provide chronological and random arrangements of the 24 doors. Changing the
   visual order must not change door numbers, content associations or their dates.
   New calendars start chronologically. Generate and persist the random order
   when random layout is selected; reuse that order in preview, after refresh and
   on later visits. Reading or previewing a calendar must not reshuffle it.
8. Provide actions on the administration page to return to `/my-page`, preview
   the calendar and log out. Reuse the existing session/logout behavior, including
   backend session invalidation and removal of protected browser data.
9. Show the selected background, stored calendar title, layout and all 24 doors
   in the administrator preview. Let the owner inspect titles and messages for
   every door, including future dates. Include a clear way back to administration.
   This unrestricted preview must remain available only to the owner.
10. Enforce ownership, current role and session validity in the backend for
    creation, administration, editing and preview. A calendar administrator must
    not access another administrator's calendar. Calendar users, superadmins,
    anonymous visitors and restricted temporary-password sessions receive no
    calendar administration or preview authority in this increment.
11. Protect the existing calendar read and creation paths as part of this work;
    the current anonymous API must not remain a bypass to stored content. Apply
    CSRF to mutations and `Cache-Control: no-store` to protected responses,
    including errors, SSR and hydration transport. Isolate caches by session,
    calendar and access mode and clear them when sessions change.
12. Use the existing browser -> tRPC BFF -> generated HTTP client -> ASP.NET Core
    controller/service/repository -> PostgreSQL flow. Maintain authored OpenAPI,
    generated C#/TypeScript contracts, runtime validation and structured errors.
13. Use responsive, keyboard-accessible TanStack Form/Zod/shadcn/ui controls and
    the existing compact administrator UI conventions. Translate application text
    and errors into Norwegian and English with Paraglide. Preserve user-authored
    names, door titles and messages unchanged when switching interface language.
14. Leave recipient calendar lists, recipient viewing, timed opening, opened-door
    tracking and future-content delivery to a separate plan. Do not expose the
    administrator preview as an interim recipient view. Existing opening rules
    remain requirements for that follow-up.
15. List only the acting calendar administrator's own calendars on `/my-page`,
    with a link to resume administration of each one. Show a newly created calendar
    after returning to the page, and provide loading, empty and error states and
    pagination as needed. Filter by ownership in the backend query.
16. Delete the existing ownerless/recipientless calendars and their doors as
    disposable test data during the migration to the protected calendar model.
    The owner authorized this one-time transition cleanup. Preserve accounts,
    credentials, sessions and unrelated data, and never delete database volumes.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed decisions and repository context

- On 2026-11-01 the owner requested this numbered plan and authorized switching
  from `refactor/improve-admin-ui` to synchronized `main`, then creating
  `plan/create-calendars`. Planning starts from `9d5c59f`.
- The owner confirmed that only calendar administrators are included; superadmin
  creation/administration is excluded. Calendar administrators select their own
  calendar users and manage their own calendars.
- The owner explicitly deferred recipient viewing and door opening to a separate
  plan and selected automatic use of the current year.
- The owner confirmed the administrator's own-calendar list is included, new
  calendars start chronologically, and random ordering is persisted across preview
  and subsequent visits.
- The door editor uses an explicit Save button and plain text with line breaks;
  fields may be empty during preparation. The owner adjusted the proposed title
  limit to 50 characters and retained the 5000-character message limit. Count
  Unicode code points consistently with existing project string policies. These
  door-title limits do not change the 100-code-point calendar-name limit.
- The owner confirmed existing calendars are disposable test data and authorized
  deleting them at the transition. Scope the one-time migration cleanup to the
  legacy calendars and their doors; do not reset the database or delete accounts.
- On 2026-11-01 the owner selected `feature` for implementation. Implementation
  starts from synchronized `main` at `78c7b1c` on `feature/create-calendars`.
- `src/frontend/src/routes/my-page.tsx` currently has a disabled calendar-creation
  button for `calendarAdmin` and an empty-calendar placeholder for `calendarUser`.
  Account lists and session controls are already implemented.
- `src/contract/openapi.json` currently defines anonymous `POST /calendars` with
  only a title and `GET /calendars/{id}` returning all door text. A frontend-only
  guard or BFF projection cannot protect that direct backend response.
- `CalendarService`, `CalendarRepository` and `CalendarModel` support calendar
  IDs, names, timestamps and 24 numbered doors with non-null `Text` only. The
  repository already inserts the aggregate atomically and reads one consistent
  SQL snapshot. There is no door title, ownership, recipient, year, background,
  layout or update operation.
- `src/frontend/src/routes/calendars.$id.tsx` currently renders static numbered
  doors. `server/trpc.ts` projects out door contents and `server/backend.ts` owns
  the generated HTTP calls, deadline, retry and error translation.
- Existing account listing is backend-scoped and paginated. Recipient selection
  must include eligible users beyond the first page without leaking other
  administrators' accounts or credential data. Validate the selected account
  again when committing calendar creation.
- `AuthHosting.IsAccountPath` currently applies backend response protection to
  `/auth` and `/users`, excluding calendars. Extend the appropriate protection
  without accidentally applying password-hashing work limits to door saves.
- Published migrations currently end at `0003_add_account_name.sql`. Add new
  migration(s) using the next free sequence at implementation time; do not edit
  any published script or implemented plan.
- Follow the [architecture](../rules/architecture.md),
  [API contract](../rules/api-contracts.md),
  [data and migration](../rules/data-and-migrations.md),
  [authentication/calendar access](../rules/authentication-and-calendar-access.md)
  and [development quality](../rules/development-quality.md) rules.

### 1. Establish the agreed scope and contracts

Implementation iterations (one commit each):

1. Specify and generate protected contracts and add migration 0004. Verify
   OpenAPI generation; consumer compilation depends on iteration 2.
2. Implement transaction-scoped backend administration and integration coverage.
   Verify backend build/tests, saved-source lint and duplication feedback.
3. Produce four local background assets and their thumbnails/provenance.
   Inspect all artwork and verify asset identifiers and dimensions.
4. Implement validated BFF operations and localized creation, administration,
   preview and own-list UI. Verify focused tests, type checking and build.
5. Complete security, migration and production-browser verification, update
   owning documentation, run quality/health comparison and publish a draft PR.

Contract and persistence decisions:

- Retain protected `POST /calendars` and owner-only `GET /calendars/{id}`;
  add paginated `GET /calendars`, `PUT /calendars/{id}/doors/{number}` and
  `PUT /calendars/{id}/layout`. These are administrator contracts only.
- Creation accepts `title`, `recipientId` and `background` (`woodland`, `sleigh`,
  `playtime`, `aurora`); owner and Europe/Oslo year are server-derived.
- Calendar responses include owner/recipient UUIDs, year, background, layout,
  persisted `doorOrder`, timestamps and 24 numbered doors with `title`/`text`.
  Lists contain metadata only, a total count and bounded offset/limit pagination.
- Door updates require non-null `title`/`text` (0-50/0-5000 code points).
  Layout updates accept `chronological` or `random`; selection persists a new
  permutation. Reads never generate order. Missing/null/unknown fields and
  invalid Unicode/NUL are rejected at the respective boundaries.
- All calendar operations require an unrestricted current `calendarAdmin`
  session. Service checks and writes share security transaction lock 800008 with
  account maintenance. Cross-owner access returns 404; other roles receive 403.
  No recent-password check applies. Mutations require CSRF; responses use no-store.
- Journaled transactional migration 0004 deletes only legacy calendars (cascading
  doors), then adds required references, year/background/layout/order and content
  constraints. Accounts and sessions are preserved; published scripts stay intact.

- [x] Resolve the planning questions and record the owner's decisions in the
  requirements and implementation details.
- [x] Track creation, administration and the own-calendar list in this plan and
  TODO; keep recipient lists/viewing/opening as a separate TODO follow-up.
- [x] Specify exact request/response schemas, validation, ownership constraints
  and the authorized legacy-data cleanup before changing the API or database.

Iteration 1 evidence: authored OpenAPI validation and both generators passed
(four inherited Redocly warnings). Full saved-source quality passed after SQL
formatting fixes. MCP refresh reports no SQL clones; repository duplication is
38 lines / 5 clones (0.21783%). Backend consumer compilation and real migration
execution depend on iteration 2; no successful runtime check is claimed yet.

### 2. Extend persistence and the authored API

- [x] Add calendar owner and recipient account references, stored year,
  background selection and layout state. Add initially empty door content titles
  alongside messages. Store and validate a random permutation of doors 1-24;
  persist it when selecting random layout and reuse it on reads without
  renumbering doors or moving their contents to different dates.
- [x] Add database constraints for supported values, required new-calendar data,
  door bounds, content lengths and the persisted permutation. Use the new DbUp
  migration to delete legacy calendars/doors before enforcing required ownership
  and recipient data. Keep this cleanup journaled and transactional; do not add a
  recurring startup cleanup. Verify populated upgrades and fresh installations.
- [x] Extend OpenAPI for protected creation and administration reads, door updates,
  layout updates and an owner-scoped paginated calendar list. Keep preview/administration
  responses separate from the future recipient contract. Define authentication,
  antiforgery, validation, forbidden/not-found and other applicable errors.
- [x] Define door titles as non-null strings of 0-50 Unicode code points and
  messages as non-null strings of 0-5000. Reject missing/null fields, NUL and
  invalid Unicode at the relevant boundaries. Preserve plain text and message
  line breaks; do not introduce rich-text/HTML content.
- [x] Regenerate C# DTOs/controller bases and the TypeScript client from the
  authored contract before updating consumers; keep generated files untracked.
- [x] Extend the hand-written controller, service and repository interfaces and
  implementations. Keep authorization and calendar business rules in services,
  with parameterized persistence and atomic writes in repositories.
- [x] Recheck actor session/status/role, ownership and recipient eligibility in
  committing transactions. Coordinate with existing account/security transactions
  so concurrent role/status changes cannot produce unauthorized committed writes.
  Do not add calendar operations to the existing recent-password-verification
  requirement for account/credential maintenance without an agreed requirement.
- [x] Persist updates and modification timestamps consistently. Preserve other
  doors and settings when saving one door or changing a layout. Report failed
  writes accurately and leave stored data intact after rollback.

### 3. Add the protected BFF and frontend flow

Iteration 2 evidence: Release build and all 211 PostgreSQL-backed backend tests
passed, including populated transition/fresh migrations, journal restart, rollback,
Oslo year boundary, Unicode limits, role/session/CSRF denial, SQL ownership and
concurrent actor/recipient changes. Full saved-source quality passed. Initial
runs were interrupted after the container-pause outage fixture stalled; the test
now denies/terminates connections only to its disposable database and verifies
recovery without pausing the container. The legacy-upgrade test filter was fixed
to exclude the embedded OpenAPI resource. No runtime application behavior was
changed for those fixture repairs. MCP reports 59 duplicated lines / 7 clones
(0.32041% repository); added matches are controller security setup and test setup.
Intermediate application health improved 86.8 to 87.7; absolute duplication rose
32 to 53 application lines (4 to 6 clones). Keep explicit security attributes and
scenario setup for clarity; final measurements follow the frontend iteration.

- [x] Add shared calendar-input validation and focused server helpers alongside
  the existing auth/account modules. Extend `server/trpc.ts` and the browser
  mutation client with typed creation, editing, layout and preview operations.
- [x] Reuse `callBackend`, session inspection, the designated auth/CSRF cookie
  allowlist, principal-bound CSRF refresh, structured errors, cancellation and
  total deadlines. Keep mutation retries disabled.
- [x] Replace the disabled creation action with navigation to a dedicated English
  route, following existing route conventions. Add owner-protected administration
  and preview routes keyed by calendar UUID and support direct navigation/refresh.
- [x] Build the creation form with name, eligible recipient and illustrated
  background choices. Show name/username when necessary to distinguish recipients;
  include pending, empty and recoverable failure states for recipient loading.
- [x] Navigate using the successfully persisted calendar ID. Display exactly 24
  selectable doors on administration, the title/message editor and layout controls,
  plus personal-page, preview and logout actions.
- [x] Share calendar rendering between preview and subsequent recipient work
  where appropriate, while keeping privileged queries and content isolated.
  In this increment only the owner can open all door contents in preview.
- [x] Reflect successful saves in administrator and preview query data so the
  owner sees the persisted result. Save door edits through an explicit Save
  action, show pending/success/error feedback and retain unsaved values on failure.
- [x] Add the owner-scoped personal-page calendar list with links to administration,
  pagination and loading/empty/error states. Refresh it after creation so the
  calendar is visible on return. Keep this separate from the existing account
  list and do not add a superadmin or recipient calendar list.
- [x] Extend session checks and no-store coverage to calendar routes and API/BFF
  responses. Prevent route prefetch, SSR/hydration and browser history/session
  changes from reusing another account's protected calendar data.

### 4. Produce the background choices and localized interface

Iterations 3-4 evidence: four inspected 1536 x 1024 JPEG backgrounds and 384 x 256
thumbnails are local with stable identifiers and documented provenance. Frontend
creation is `/create-calendar`, administration retains `/calendars/$id`, and the
separate owner preview is `/calendar-preview/$id`. All 117 frontend/BFF tests,
explicit TypeScript checking, production Vite/Nitro build and full saved-source
quality passed. Nitro needed an unsandboxed build to inspect the Windows profile
symlink; the first sandboxed attempt failed with EPERM and was rerun successfully.
Production browser/keyboard/touch verification follows in iteration 5. MCP reports
132 duplicated lines / 14 clones (0.67395% repository), mainly explicit form/route
security and test setup; inspect final health after integrated verification.

The following are creative proposals for implementation, not approved final artwork:

| Direction | Proposed motif |
| --- | --- |
| Cute | Friendly woodland animals preparing Christmas in a snowy forest |
| Action-filled | A playful sleigh adventure through a snowy mountain landscape |
| Small children | Soft shapes, cheerful animals and a simple bright Christmas scene |
| Older children | A more atmospheric winter landscape with northern lights and adventure details |

- [x] Produce three or four distinct usable images covering all four directions.
  Keep door labels and content legible across backgrounds, narrow screens and
  wider previews. Supply useful thumbnails and suitable full-calendar assets.
- [x] Store assets locally under the frontend public assets with stable selection
  identifiers and document their provenance as appropriate. Avoid user-entered
  remote image URLs or uploads in the specified background-choice flow.
- [x] Translate background labels, form controls, door editor, layout labels,
  preview indicators, confirmations and error states in `messages/nb.json` and
  `messages/en.json`. Do not bake interface labels into the background images.
- [ ] Verify keyboard selection, visible focus, accessible labels, usable contrast
  and touch controls with the existing compact UI components.

### 5. Verify and document the implemented result

- [ ] Extend backend integration tests, focused frontend/BFF tests and production
  browser scenarios for the requirements below. Adapt the existing calendar smoke
  fixtures: anonymous creation/read must cease to be their successful setup path.
- [ ] Update backend HTTP examples, project/frontend/backend documentation,
  architecture implementation status and current calendar-access rules to describe
  what was actually delivered and the remaining recipient/deployment work.
- [ ] Run the applicable shared generation, build, test, lint and quality workflow.
  Record actual evidence, remaining findings and limitations without claiming
  deferred recipient behavior or inherited platform gaps have been verified.
- [ ] Mark this plan and its index implemented only after implementation and
  verification are complete.

## Verification

- From an unrestricted calendar administrator session, open the new creation page,
  select an assigned user and each available background, and create a calendar.
  Verify successful navigation, persisted owner/recipient/background/year, exactly
  24 doors and preservation after refresh and application restart.
- Use controlled backend time around the Europe/Oslo year boundary and different
  host/browser timezones. Verify the creation year is correct and remains unchanged
  when time advances. No year input should appear in the form.
- Verify title normalization and Unicode limits, missing/invalid recipients and
  background values, backend/BFF validation, pending duplicate clicks, failures
  and absence of automatic write retries. Include a recipient beyond the first
  account-list page and the no-eligible-recipient case.
- Save distinctive door titles/messages, refresh and preview; verify the correct
  values stay attached to their numbered door. Edit one door and confirm other
  doors/settings are unchanged. Verify the explicit Save action, empty fields,
  titles of 50/51 and messages of 5000/5001 Unicode code points, including emoji,
  Norwegian characters and line breaks. Verify missing/null/NUL/invalid Unicode
  rejection and safe text rendering without HTML interpretation.
- Switch between chronological and random layouts and verify each door occurs
  exactly once. Verify new calendars start chronologically and the saved random
  order is identical across refresh, preview and later visits, preserving
  day/content associations and responsive rendering.
- Verify preview opens every door for its owner before and during December,
  shows current persisted settings/content and returns to administration. Verify
  personal-page navigation and logout, including a rejected replayed session.
- Test anonymous, calendar-user, superadmin, restricted, expired, revoked and
  disabled sessions against browser/BFF and direct API paths. With two calendar
  administrators, verify cross-owner read/edit/preview and foreign-recipient
  creation are denied, including manipulated IDs and bodies. Recheck concurrent
  actor/recipient account changes at commit.
- Inspect direct API responses, SSR HTML, hydration, prefetch and shared/cache
  behavior. Verify no-store on successful/error protected responses, CSRF rejection
  on writes, concurrent request isolation and clearing after account/session
  changes. Recipient login must not gain preview content through this increment.
- Verify the transition migration deletes existing legacy calendars and their
  doors while preserving accounts, credentials, sessions and unrelated data.
  Verify repeat startup preserves calendars created after migration, anonymous
  access is denied and no accounts or sample calendars are created. Apply real
  migrations to fresh and populated isolated PostgreSQL databases; check atomic
  creation, rollback and journal-based repeat startup.
- Verify Norwegian/English forms, errors and preview with unchanged authored
  names/titles/messages, matching SSR/hydration locale, keyboard/touch access and
  readable layouts/backgrounds at narrow and wide sizes.
- Verify the own-calendar list's SQL ownership scoping and reopening
  administration after returning to `/my-page`, creation visibility and appropriate
  pagination/empty/error states without adding a superadmin or recipient list.
- Run clean contract generation, backend integration tests, frontend type checks,
  focused tests and production build/browser verification, plus applicable quality
  checks. Record evidence in the owning verification documents and retain explicit
  limits for recipient opening and production database/deployment readiness.
