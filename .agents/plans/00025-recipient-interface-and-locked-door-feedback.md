# 00025: Simplify recipient controls and explain time-locked doors

Status: Implemented (2026-11-17)

Implementation type: feature

Last updated: 2026-11-17

Address three related calendar-user TODO items: remove the idle `recipient_hint`
text, remove the change-password button from that role's interface, and explain
when a prematurely selected door opens. Retain the recipient calendar delivered
by [plan 00019](00019-recipient-calendar-view.md) and the permanent-password
lifecycle from [plan 00020](00020-calendar-user-passwords.md).

## Requirements

1. Remove the helper text “Choose an available door. A green frame and check mark
   show doors you have opened.” and its Norwegian equivalent from the calendar-user
   view. Preserve actual opening progress, success/error announcements and the
   green-frame/check-mark indication of personal opening history.
2. Remove the change-password button/link from the calendar-user interface.
   Preserve administrator controls and logout. This is a UI simplification;
   voluntary password-change authorization and its current-password check remain
   as defined in current rules and plan 00020.
3. When a calendar user activates a time-locked door, visibly explain its opening
   time. Use the approved Norwegian sentence:
   “Du må vente til kl 7 den {date} før du kan åpne denne luken.” The approved
   English equivalent is “You must wait until 07:00 on {date} before you can open
   this door.” Maintain both messages in the interface catalogs. Format the
   opening date as day and month, adding the year only when the opening year
   differs from the current year in `Europe/Oslo`.
4. Derive the displayed date from authorized backend `opensAt` metadata, not the
   door's screen position, browser timezone or current browser year. Keep backend
   enforcement of December N at 07:00 Oslo and the existing local time bypass.
5. An attempted early opening must reveal no hidden title, text or image, create
   no opening-history entry and run no success animation. A locally known locked
   door supplies feedback without sending an opening write. Distinguish empty
   doors and general access/network failures from a confirmed time restriction.
6. Make the message usable by keyboard, pointer, touch and assistive technology
   in both languages and layouts. Keep protected-cache/session checks, automatic
   availability refresh, previously opened markers and owner/superadmin previews.

## Outstanding questions

None. The owner approved the date format, punctuation and English wording on
2026-11-17; the confirmed choices are recorded below.

## Implementation details

### Confirmed wording and date format

The owner approved both proposals on 2026-11-17:

- Use a localized day and full month name: `1. desember` in Norwegian and
  `1 December` in English. Include the opening year only when it differs from the
  current year, comparing both years in `Europe/Oslo`: `1. desember 2027` and
  `1 December 2027`, for example, when the current Oslo year is 2026.
- Norwegian: “Du må vente til kl 7 den 1. desember før du kan åpne denne luken.”
  With a different opening year: “Du må vente til kl 7 den 1. desember 2027 før du
  kan åpne denne luken.” Keep `kl 7`; there is no extra period after the date.
- English: “You must wait until 07:00 on 1 December before you can open this
  door.” With a different opening year: “You must wait until 07:00 on 1 December
  2027 before you can open this door.”

### Current behavior and scope

- `RecipientCalendar` renders `recipient_hint` in the idle branch of a status
  paragraph, alongside real opening/success states. Its `SessionControls` already
  omits a password link; `routes/my-page.tsx` enables that link for every role.
- `CalendarBoard` keeps unavailable buttons focusable with `aria-disabled`, but
  its click handler ignores unavailable doors. `useRecipientOpening` also rejects
  doors whose current state is not `available`. Consequently, timing metadata is
  available in the accessible label/title but no visible click feedback appears.
- `recipientDoorLabel` already formats `opensAt` using the selected locale and
  `Europe/Oslo`. `RecipientDoorDto` exposes state, opening time and history without
  locked content; no new content API or database migration is expected.
- `recipient-opening.test.mjs` already activates locked doors by keyboard and
  pointer and verifies that no write/hidden content is produced. Extend those
  assertions with the new feedback instead of replacing the security tests.

### Agent-selected implementation approach

1. Remove only idle hint rendering and, after checking callers, the unused
   `recipient_hint` messages from both catalogs. Render live progress/success
   feedback when there is actual state to announce; do not leave a visible gap
   solely for the removed text.
2. Pass the password-link option only for administrator roles on My page and
   inspect all `SessionControls`/account menu uses for calendar-user links. Keep
   logout and the existing voluntary-change route/API; no new backend restriction
   follows from removing the button.
3. Add an explicit locked-door feedback path through `CalendarBoard` and the
   recipient component/hook. Keep owner/preview selection independent of recipient
   state. Activating a locked door displays a localized inline status near the
   board without calling `openRecipientDoor` or the image API.
4. Preserve focus on the selected tile, announce feedback politely and ensure
   repeated selection is understandable. Describe locked actions accurately:
   content opening is unavailable, while timing help is discoverable. Adjust
   `aria-disabled`, `aria-describedby` and dialog hints consistently; do not mark
   a locked tile as an available content-opening action just to receive a click.
5. Format the authorized `opensAt` instant in Europe/Oslo and insert the approved
   localized date into a maintained message. Compare its Oslo year with the
   current Oslo year to decide whether to include the year. Avoid date arithmetic
   from door numbers or hardcoded UTC offsets.
6. Clear or replace timing feedback when another door is selected, the calendar
   changes, authorization fails or refreshed state no longer says locked. Keep
   existing next-opening/30-second/focus/reconnect refresh behavior. A local bypass
   means a populated available door follows the ordinary opening path.
7. If an apparently available door is denied during an opening race, refresh
   authorized board state before classifying it as time-locked. Display the wait
   message only when that refreshed state confirms the selected door is locked.
   Empty doors, reassignment, lost sessions and generic conflicts retain their
   corresponding safe feedback; do not translate every HTTP 409 into a wait.

### Dependencies and work order

This plan needs no change to password lifecycle or the opening-time rule.
[Plan 00024](00024-login-progress-and-calendar-routing.md) changes post-login routing
but intentionally leaves My page reachable, so test controls on both destinations.
[Plan 00026](00026-vite-development-language-switching.md) owns the inherited
development-language defect; it does not own this new message's translation.

- [x] Resolve date/punctuation and English wording (owner approved 2026-11-17).
- [x] Iteration 1: remove idle guidance and role-inappropriate password controls;
  verify translation generation, focused tests, lint and TypeScript.
- [x] Iteration 2: implement locked-door feedback using existing authorized
  metadata; verify date formatting, security/race browser cases and type/build checks.
- [x] Iteration 3: recheck accessible/visual behavior and opening security in both frontend
  modes; record evidence in [frontend verification](../../src/frontend/verification.md).
  Run final full quality, all unit/backend tests, production build and advisory
  comparison, then commit completion metadata and review the committed PR head.

### Implementation evidence

- Iteration 1: removed both unused hint messages and idle paragraph; My page now
  offers password controls only to administrators. Other session-control callers
  already omit the link. Translation generation, targeted Biome, all 287
  frontend/BFF unit tests, Vite typecheck-mode build and explicit `tsc --noEmit`
  passed. Baseline archived and recaptured before edits. The browser lifecycle
  suite will retain voluntary recipient changes through direct route navigation.
- Iteration 2 implementation: locked buttons are explicitly named timing-help
  actions, retain `data-state="locked"` and omit dialog hints; `aria-disabled`
  applies to pending/empty actions. This lets assistive technology activate help
  without presenting locked content as available. A sticky board-adjacent live
  status stays in the viewport without moving tile focus; each selection replaces
  its announcement node. The current year comes from the backend `serverTime`,
  comparing both instants in Europe/Oslo. Conflict recovery cancels an older board
  read before requesting subsequent authorized metadata, so deduplication cannot
  classify an opening failure from a pre-denial read.
- All 292 frontend/BFF unit tests and explicit TypeScript checking pass. All 444
  backend tests pass, including actual migrations, controlled 07:00 boundaries
  and production bypass rejection. Initial Nitro packaging hit sandbox readlink
  permissions; an unrestricted retry passed. All 19 final targeted Vite browser
  scenarios pass, including viewport visibility, pointer pass-through,
  unobscured keyboard focus, repeated announcements and delayed-read recovery.
  All 13 date/presentation cases also pass with host `TZ=Pacific/Honolulu`.
- Wider Vite checking found an existing owner-edit SSR limitation: the completed
  document can contain loading output while hydration displays the correct saved
  recipient. The identical test fails at the same assertion on clean `origin/main`
  `1842b8d`, verified in a disposable checkout. This plan does not change owner
  loading/cache behavior. Baseline diagnostics are retained under ignored
  `quality-reports/plan00025/baseline-vite-*`.
- Routed browser tests release delayed responses and drain callbacks before
  returning, preventing fixture teardown from disposing their request context.
  The expanded full suite has a 15-minute bound instead of ten minutes; the
  new timing/date/race scenarios add meaningful runtime.
- Final verification: all 148 production browser scenarios plus eight smoke
  checks pass without page/hydration errors. The final production build, explicit
  TypeScript, Biome, full repository quality, all 292 frontend/BFF unit tests,
  all 444 backend tests and 19 focused Vite scenarios pass. Screenshots and
  automated focus/viewport checks cover both layouts and languages; actual human
  assistive-technology use and physical devices remain unverified.
- Final advisory review: application health stays 92.5; tooling improves
  50.5 to 51.0. Duplicated lines/clones stay 147/15 and 12/2, with unchanged
  heuristic findings and maximum file complexity. Tooling complexity score
  declines 64.7 to 64.1 and share rises 33.1% to 33.9% because the asynchronous
  failure matrix and gated transport cleanup require extra control flow. Shared
  assertions remove introduced duplication and behavior-focused suites retain
  the needed lifecycle coverage. The concrete tradeoff and measurement limits
  are recorded in frontend verification; raw reports preserve exact identities,
  percentages and the whole-repository reference. Final committed-head review
  and draft publication follow these completion updates.

## Verification

| Requirement | Evidence to collect during implementation |
| --- | --- |
| 1, 2 | Calendar users see neither idle hint nor change-password button on My page or recipient calendars in either language. Administrator password controls, all logout controls, opened marks and real progress/error statuses remain available. Voluntary API behavior/current-password checks remain covered. |
| 3, 4 | Assert exact approved Norwegian/English output for early, same-day-before-07:00 and different-year doors, using non-Oslo browser/host timezones as well as Oslo. Verify day/full-month formatting, Norwegian ordinal punctuation, no extra period after the date, and a year only when the opening year differs from the current Oslo year, including an Oslo/browser year-boundary case. Both saved layouts show the date from `opensAt`, independently of tile order. |
| 5 | Pointer, touch, Enter and Space on a locked tile show timing feedback with zero opening/image writes, no new history, no hidden content in HTML/cache/dialog and no success animation. Empty-door activation does not show a false schedule warning. |
| 4, 6 | Immediately before, at and after backend 07:00, refresh changes the state correctly; an already-open page becomes usable and stale warnings clear. Local bypass opens populated future doors normally; Production still rejects bypass configuration. Previously opened-but-now-locked doors keep history without exposing content. |
| 5, 6 | Race opening against changed schedule/state, content removal, reassignment and session revocation. Only refreshed authorized locked state produces the timing message; other failures stay distinct and no protected content survives loss of access. |
| 6 | Inspect live announcements/focus, reduced motion, 320px/mobile and desktop, both layouts/backgrounds and owner/superadmin preview regressions. Run targeted unit/browser cases, explicit type/build checks and the normal quality review for the eventual code change. |
