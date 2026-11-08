# 00019: Recipient calendar viewing and animated door opening

Status: Not implemented

Last updated: 2026-11-08

Implementation type: feature

Let calendar users find their assigned calendars, open available doors and view
their content through a hinged-door animation followed by a zoomed presentation.
Persist opening history on the server. Add an explicit local startup flag that
allows testing populated doors without waiting for their December opening time.

## Requirements

1. An unrestricted, authenticated `calendarUser` can list and view calendars
   currently assigned to that account. Support multiple calendars, pagination,
   loading, empty and recoverable error states. Replace the unconditional
   no-calendars placeholder on `/my-page` with the actual recipient list.
2. Display all 24 numbered doors using the saved calendar title, year,
   background, layout and door order. Reuse the responsive calendar appearance
   from plans 00015/00016 and display saved title, message and optional image from
   plan 00018. Preserve user-authored text, line breaks and image aspect ratios.
3. In normal operation, door N becomes available on December N of the calendar's
   stored year at 07:00 in `Europe/Oslo`. Use the current backend instant and
   named-zone rules. Earlier doors remain available after that instant, including
   after December. Browser clocks and direct API requests cannot unlock doors.
4. A door without content cannot be opened, both in normal operation and when
   time checks are bypassed locally. Title, message and image are independent
   content: any populated field makes a door nonempty, including an image alone.
5. Support `--no-time-check` through both root local launch scripts and their
   shared orchestrator, in Vite and container frontend modes. With the flag,
   populated doors can be opened regardless of date/year/time. Without the flag,
   enforce the normal schedule. Apply the exception in the backend; it must not
   bypass session, role, assignment, content or image authorization checks.
   Scope the exception to local development and reject enabling it outside that
   environment. Switching startup modes must preserve database content.
6. Persist successful door openings on the server so the opened indication
   survives reloads, logout/login and use of another device. An opening belongs
   to the recipient, calendar and numbered door. Reopening must remain possible
   while that door is available and has content, without duplicating history.
7. Make opening visually engaging: animate the numbered door as a physical flap
   swinging on a hinge, then zoom its content forward into a readable foreground
   presentation. Use a green frame to distinguish opened doors. Provide a
   reduced-motion presentation and accessible keyboard/touch interaction.
8. Never deliver future title/message/image content to recipients through API
   responses, SSR, hydration, prefetch or caches under normal time enforcement.
   Independently authorize every door and image read. Opening history, including
   history created using the local flag, never overrides current access or time
   restrictions. Administrator previews retain their separate full authority.
9. Refresh availability at scheduled opening and when returning to the page;
   refresh relevant door data after content changes. Client timers only trigger
   backend reads. Preserve no-store, request/session cache isolation, CSRF for
   opening writes, structured errors and the established deadline/retry rules.
10. Provide Norwegian and English interface text for calendar lists, door states,
    opening feedback, dialog controls and errors. Preserve existing account,
    owner administration, image upload and superadmin preview behavior.

## Outstanding questions

None.

## Implementation details

### Confirmed decisions and repository facts

- The user requested recipient viewing and opening, the exact startup flag
  `--no-time-check`, local access to every populated door irrespective of the
  usual December/07:00 rule, zoomed content and a physical door-opening effect.
  A green frame is an accepted way to indicate an opened door.
- The user confirmed that opening history must be stored on the server across
  sessions/devices, and empty doors must be unavailable in both local testing
  and normal operation.
- The current `my-page.tsx` always renders `no_calendars` for `calendarUser`.
  Calendar route guards and BFF operations currently permit owner administration
  or dedicated superadmin preview. `CalendarMode` has no recipient mode.
- `CalendarService.GetAsync`/`ListAsync` require the current calendaradmin owner.
  Images also require owner or dedicated superadmin authority. These methods
  return full administrator content and must not become recipient responses.
- `CalendarBoard` renders the saved 24-door layout; `CalendarWorkspace` currently
  selects a door and renders its full content below the board in preview modes.
  Image bytes are fetched separately for the selected door.
- `run-local.ps1` and `run-local.sh` forward arguments to
  `tools/development/run-local.mjs`. Both frontend modes use the Compose backend
  in `Development`. The launcher currently has no time-check option.
- The latest published migration is `0005_add_door_images.sql`. Recheck the next
  migration number during implementation; never edit published scripts.
- Follow the existing [access/time rules](../rules/authentication-and-calendar-access.md),
  [API rules](../rules/api-contracts.md), [data rules](../rules/data-and-migrations.md)
  and [architecture rules](../rules/architecture.md). This plan adds a narrow
  local-development exception to the normal recipient opening rule.

### Agent-selected implementation choices

These are technical choices for implementing the confirmed behavior, rather than
additional user-confirmed product decisions. No new dependency is planned.

#### Recipient authority and time policy

- Add dedicated recipient controller/service/repository operations. Use a
  separate backend route family, proposed as `/recipient/calendars`, and a
  frontend route such as `/my-calendars/$id`. Keep existing owner routes and
  superadmin previews separate; add an explicit `recipient` access mode.
- Revalidate the unrestricted session, ordinary-user role and current stored
  `recipient_id` for list/detail/open/image operations. Do not equate account
  responsibility with calendar assignment or grant recipient access to admins.
  Perform authorization and opening writes inside the existing committing
  security transaction under lock 800008, coordinated with assignment/account
  changes. An assignment change immediately affects subsequent requests.
- Centralize availability in a backend policy using the injected `TimeProvider`,
  calendar year and numbered December date. Capture one current instant for a
  decision, calculate the Oslo opening instant and use an inclusive `now >=
  opensAt` boundary. Return UTC instants and date-only dates in contract formats.
- Treat trimmed nonempty title/message or a stored image as content. Whitespace
  alone is empty; trimming for this predicate does not alter stored display text.
  Reuse one definition for availability and open/image authorization.
- Keep calendaradmins' current full edit/preview access. The flag only changes
  recipient time availability; it does not change editing rules or introduce
  content moving. The existing rule for moves across opening boundaries remains
  a requirement for a separate content-move feature.

#### Recipient contracts and opening persistence

- Author recipient DTOs and operations in `src/contract/openapi.json`, then
  generate both consumers. Proposed operations are paged calendar list, calendar
  board detail, `POST /recipient/calendars/{id}/doors/{number}/open` and a dedicated
  protected door-image GET. Include bounded paging/door parameters and documented
  unavailable-door errors; map unavailable doors to conflict after authorization.
- Calendar summaries contain display/navigation fields without door content or
  unrelated account identities. Board detail contains safe calendar metadata and
  24 door entries with number/date, scheduled opening instant, current
  availability and personal opened status. Keep availability and opening history
  independent so a previously opened door can currently be locked or empty.
- Do not include door titles/messages/image metadata or bytes in board/list
  responses. A successful explicit open returns the current authorized selected
  door content and optional image metadata; load its image separately. This
  reduces accidental SSR disclosure and avoids fetching every image.
- Add a new additive migration for opening history keyed uniquely by calendar,
  recipient and door number, with a first-opened UTC timestamp and suitable
  foreign keys. Existing accounts/calendars/doors/images remain intact. Scope
  history by recipient so reassignment cannot expose another person's history;
  reassignment does not grant either user access outside the current assignment.
- Opening is recorded when the backend successfully authorizes and commits the
  explicit open request. Animation completion is not a database trigger. Use an
  insert-on-conflict approach to preserve the first timestamp under concurrent
  clicks/devices; repeated authorized opens return the content without duplicate
  history. Reads, page loads and administrator previews never mark doors opened.
  Opening does not change the calendar's content modification timestamp.
- Recheck content and time even for already-opened doors. History created with
  the local flag stays persisted, but after a restart without the flag a future
  door is locked again. Emptying a door makes it unavailable without erasing its
  opening history; history alone is never a content permission.
- Independently recheck recipient/session/time/content for image reads, with
  selected image version checks matching the existing image flow. Return no
  bytes after revocation or while time-locked; image fetches never mark openings.

#### Local startup override

- Extend `parseLocalOptions`, help and launcher tests with `noTimeCheck`, default
  false. Existing root wrappers should forward the new flag without separate
  platform-specific behavior. Retain existing skip/build/frontend options.
- Pass a backend-only setting, proposed as
  `CalendarOpening__DisableTimeCheck`, through local Compose environment
  interpolation. Explicitly set true or false from the launcher on every run,
  including flag-on to flag-off transitions. Do not persist it in local settings,
  `.env`, appsettings defaults or frontend bundles, or inherit an ambient true
  value when the command omits the flag.
- Compose must recreate the backend when this setting changes, including with
  `--skip-build` and when switching frontend modes. Keep database/key volumes and
  saved calendars. Do not pass the bypass into the launcher's test subprocesses;
  normal test suites must still verify the real time rule.
- Bind and validate the option at API startup; only `Development` can enable it.
  Reject an enabled setting in Production, Staging or other environments before
  migrations/readiness. Tests may explicitly construct a Development host to
  verify the exception; the normal Testing host enforces the schedule.
- Log enabled local bypass once at API startup and describe it in launcher
  output/help. The browser uses backend availability and has no permission toggle.
  Update root launch documentation with PowerShell/Bash examples, including
  `./run-local.ps1 --no-time-check` and
  `bash run-local.sh --frontend=container --no-time-check`, plus how to restore
  enforcement by restarting without the flag.

#### Recipient UI, motion and protected data lifecycle

- Replace the recipient placeholder with a paged assigned-calendar list using
  existing list/navigation conventions. Add a protected SSR recipient route and
  separate tRPC operations. SSR returns the authorized board, without opening
  anything. Preserve the same saved backgrounds and layout geometry.
- Extend `CalendarBoard` through explicit presentation/state props, keeping
  administrator modes unchanged. Render locked, empty, available and opened
  states with localized accessible labels. Unavailable doors must not trigger an
  open request. Explain scheduled opening or empty status without revealing
  hidden content. Use the green frame plus a non-color cue for personal openings.
- Separate mutation feedback from the visual opening. While the request is
  pending, prevent duplicate activation and announce progress. After successful
  authorization, hinge the selected numbered flap around one vertical edge with
  CSS perspective/rotation and a subtle inner shadow, then scale/translate the
  foreground content from that door's position into the reading dialog. Use
  transform/opacity animation and a brief total sequence, approximately
  500-800 ms. Failed/denied requests show feedback without a success animation.
- Keep the foreground content in an accessible modal dialog, preferably native
  `<dialog>` with existing styling and no added animation library. Show heading,
  message and responsive image, with bounded height/scrolling for long text.
  Support a visible close button, Escape, keyboard focus containment and focus
  return to the originating door. Touch targets stay at least 44px. Handle
  resize, repeated opens, interrupted animations and rapid door changes cleanly.
- Opened doors retain their green frame when the dialog closes; reopening shows
  the same readable presentation. With `prefers-reduced-motion`, omit hinge,
  zoom and spatial transitions and show the content directly. Do not make focus,
  content availability or close controls depend on `animationend` firing.
- Fetch images only for the selected authorized door. Show loading/retry feedback
  if an image fails after an opening committed; preserve the stored opened status.
  Ignore late responses from another door, image version or session.
- Scope list/board/content/image query data by validated session, recipient mode,
  calendar and selected door/version as appropriate. Do not prefetch openings or
  reuse administrator content caches. Clear dialog, mutations and protected data
  on logout/session change. Extend protected backend path/no-store/error handling
  to the new route family, including in `AuthHosting.IsAccountPath`.
- Return backend current time and the next relevant opening instant. Use a
  relative client timer to refetch at the boundary and refetch on focus/reconnect;
  browser time never sets availability. While a calendar is visible, use a bounded
  refresh interval (initially 30 seconds) to discover saved content/assignment
  changes, plus immediate refetch on open/conflict. Clear stale selected content
  when current validation denies access or reports an empty door. Avoid a new
  realtime service; document the refresh interval for other-device changes.

### Scope and documentation

- Deliver recipient list/view/open/history, the local startup option and the
  animated content dialog together. Do not add invitations, public sharing,
  content moves, password-policy changes or production deployment/database
  hardening. Those are separate TODOs or plans.
- Update the owning access rules and architecture/authentication documentation
  during implementation to describe recipient authority, persistence, empty-door
  behavior and the explicit Development-only time exception. Update launcher help
  and its root README command owner without copying operational instructions.
- Record actual frontend/backend/tooling verification in existing verification
  documents. Preserve implemented plans 00001-00018 as historical records.

### Work steps

The five steps below are separate implementation commits. Step 1 uses policy
and launcher tests plus a backend build; step 2 uses migrated PostgreSQL API
tests and contract generation; step 3 uses BFF tests and TypeScript; step 4 uses
frontend checks and production browser interaction tests. Step 5 runs the full
backend/frontend/browser/tooling, lint and advisory comparisons, followed by a
committed-head regression review and draft PR. Work is isolated from plan 00020
in an owner-approved worktree based on origin/main (43524dc).

- [x] 1. Add backend availability policy and local flag plumbing, validation,
  startup documentation and focused boundary/launcher tests.
- [x] 2. Add the opening-history migration, dedicated recipient contracts,
  repository/service/controller operations and database-backed authorization,
  persistence, time and image tests; regenerate both API consumers.
- [ ] 3. Add BFF procedures, recipient route/session guards, scoped queries and
  assigned-calendar list with SSR and protected-data tests.
- [ ] 4. Implement recipient board states, server opening writes, green opened
  indicators, dialog, hinge/zoom motion, image retrieval and reduced motion.
- [ ] 5. Verify time-boundary refresh, account/assignment/content changes,
  cross-device history, both launcher frontend modes and responsive motion.
  Complete required quality checks and documentation before marking implemented.

## Verification

Iteration 1: all 18 policy cases and 30 launcher cases pass; backend Release
build and generated consumers pass. The captured worktree baseline preserves
the main workspace's independent measurements. MCP refresh/statistics completed.
Actual Compose mode/flag transitions are reserved for step 5. Full quality passed;
the QA snapshot initializer now clears inherited hook Git paths, verified by a
regression test, so worktree hooks cannot index the caller's repository.

Iteration 2: 357 backend tests pass (including time/content, real Development
bypass, pre-migration rejection in Production/Staging/Testing, history across
devices/login, assignment/revocation, CSRF, images and lock-800008 races). The
additional scoped-list/pagination test passes after rebuilding. Contract
validation/generation, frontend TypeScript/build and new migration SQL lint pass.
The generated date-only representation is explicitly DateOnly. MCP reports two
new import-only clones; recipient service/repository logic adds no clones.

- Backend integration tests use actual migrations/PostgreSQL and controlled
  `TimeProvider` values immediately before, exactly at and after 07:00 Oslo.
  Cover December 1/24, stored calendar years, November, after December and
  differing host/browser timezones. Earlier doors stay available. Assert empty,
  whitespace-only, title-only, message-only, image-only and mixed-content cases.
- Verify normal enforcement by default, all populated doors available in local
  bypass mode, empty doors still denied, and enabled bypass rejected outside
  Development before startup migrations. Altering browser clocks or adding a
  browser request field never enables the override.
- Exercise anonymous/restricted/disabled/revoked/wrong-role sessions, another
  recipient, reassignment, concurrent account maintenance and direct image/open
  requests. Assert no unauthorized content or image metadata/bytes in responses,
  SSR/hydration/errors/caches. Owner and superadmin reads retain their authority
  and cannot create recipient history. Verify CSRF and protected no-store on all
  new success/error paths, with database outages failing closed.
- Verify first-open history survives new sessions/devices and concurrent/repeated
  opens preserve one timestamp. Test reassignment isolation, failed opens causing
  no history, unchanged calendar modification time and safe migrated restarts.
  Open a future door with the local flag, restart without it and prove persisted
  history does not unlock content or images. Empty a previously opened door and
  verify opening is denied while history remains recorded.
- BFF/frontend tests cover scoped pagination, guard/error translation, no mutation
  retries, SSR isolation, mode/session cache separation, stale response rejection,
  backend-relative refresh, empty/locked door behavior and language switching
  without changing authored content. Opening is always an explicit user action.
- Browser verification covers click/keyboard/touch opening, initial/previously
  opened frames, actual flap-to-zoom sequence, dialog close/Escape/focus return,
  long content, image-only content, image failures, rapid interaction, navigation
  and session expiry. Verify reduced motion without waiting for animation events.
  Review all four backgrounds and both layouts at 320/375/768/1280px in Norwegian
  and English; record visual evidence of hinge, zoom and green-frame states.
- Verify availability updates at 07:00 with an already-open page, after focus/
  reconnect and after another device edits/empties/reassigns the calendar. Use
  controlled backend time, without requiring tests to wait for real December.
- Launcher tests cover parsing/help, default false, option combinations,
  backend-only environment propagation, no override leakage into test processes,
  nonpersistent configuration and backend recreation on flag transitions. Verify
  actual starts with/without the flag in both Vite/container modes using existing
  populated calendars and preserved volumes; record unavailable platform evidence
  separately from simulations.
- During implementation, run contract validation/generation, relevant backend,
  frontend/BFF and launcher tests, explicit TypeScript checks, production builds,
  existing account/owner/superadmin browser regressions and required full quality/
  health checks under the repository's normal workflow. This planning-only change
  uses the Markdown-only quality exception and does not claim implementation tests.
