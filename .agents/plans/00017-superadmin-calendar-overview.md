# 00017: Superadmin calendar overview and read-only preview

Status: Not implemented

Last updated: 2026-11-08

Expand the [superadmin calendar-list TODO](TODO.md) into a system-wide calendar
table showing each calendar's owner and recipient. Let superadmins preview
calendars through a read-only flow while preserving owner-only editing.

## Requirements

1. An authenticated, unrestricted superadmin can view all persisted calendars in
   the system, across calendaradmins and recipients, in a table.
2. Each row identifies the calendar, its calendaradmin owner and its calendar-user
   recipient. Display human-readable account identities rather than UUIDs alone.
3. The table provides an action to preview that calendar. Preview shows the
   calendar's background, saved layout and numbered door contents, including
   future doors, consistently with the existing full owner preview.
4. Superadmin preview is read-only: selecting a door displays its content but
   does not edit or open it on behalf of the recipient. No calendar editing,
   layout saving, ownership/recipient reassignment or other write is granted.
5. Enforce the new list/preview authority in the backend. Superadmin calendar
   mutations and direct access to the owner editing flow remain denied even if
   the caller crafts requests or changes browser state.
6. Preserve calendaradmins' own-calendar listing, editing and preview, their
   cross-owner denials and the existing recipient-access boundary. Anonymous,
   ordinary-user and restricted sessions cannot use the new system-wide reads.
7. Preserve protected SSR/session validation, request isolation, cache separation
   and `Cache-Control: no-store` for authorized data and errors. Session changes
   must remove previously authorized calendar data from browser caches.
8. Localize interface text in Norwegian and English while leaving calendar titles,
   door content and account names unchanged. Provide accessible table headings,
   keyboard-operable preview controls and a usable table on narrow screens.

## Outstanding questions

None.

## Implementation details

### Confirmed scope and repository facts

- The owner requested a table of all calendars with both associated accounts,
  and superadmin preview without edit access. This adds a specific calendar read
  permission; existing superadmin user-management permissions are unchanged.
- The existing backend service restricts calendar list/get/mutations to a current
  calendaradmin owner. `CalendarRepository.ListAsync` filters by owner ID; its
  summary includes recipient ID but no owner/recipient display names.
- `calendar.preview` and `calendar.get` currently call the same owner-only BFF
  reader. `loadCalendarPage` uses a calendaradmin-only session guard.
- `CalendarWorkspace` already displays door content without an edit form when
  `preview` is true, but its preview notice describes the owner and its return
  link leads to the owner editor. Those assumptions must change for superadmins.
- `/my-page` already hosts role-specific sections: the owner calendar list for
  calendaradmins and the account table for superadmins. The proposed system-wide
  calendar table belongs alongside the superadmin account section.
- Calendar ownership and recipient references already exist in PostgreSQL. No
  schema change or new dependency is expected for these read operations.
- Recipient calendar viewing/opening, image upload and other calendar maintenance
  remain separate work. [Plan 00016](00016-calendar-door-layouts.md) covers visual
  layouts; this feature must reuse the shared board without requiring that plan
  to be implemented first or changing stored layout semantics.

### Agent-selected implementation choices

- Add a dedicated `SuperadminCalendarList` component on `/my-page`, rendered only
  for the backend-validated superadmin role. Use a semantic table with columns
  Calendar, Year, Calendaradmin, Calendar user and Preview. Show current names
  and usernames for both accounts so duplicate names remain distinguishable.
- Reuse existing paging/refresh patterns, initially 12 rows per page. Include
  total calendars and current/total pages. Use stable newest-first ordering by
  `created_at DESC, id`, bounded offset/limit validation and an explicit empty
  state. Provide loading, refresh and error states without retaining stale
  privileged data after an authorization failure. Keep the table horizontally
  scrollable when required and preserve readable wrapping for long names/titles.
- List all calendar records without filtering by the current enabled state or
  role of their linked accounts. Resolve the owner/recipient from the calendar's
  stored IDs, rather than inferring ownership from current account responsibility.
  Account role/status changes must not silently remove calendars from the list.
- Introduce explicit superadmin read operations, for example backend
  `GET /administration/calendars` and
  `GET /administration/calendars/{id}/preview`, with corresponding dedicated tRPC
  queries and cache keys such as `calendar.systemList` and `calendar.systemPreview`.
  Keep existing owner reads/mutations scoped to their existing authority.
- Define a dedicated paginated summary DTO containing calendar ID/title/year,
  owner and recipient ID/name/username, plus total count. Read names through
  parameterized SQL joins in the backend; do not fetch every account or calendar
  into the browser/BFF to assemble the table. List responses exclude door content
  and account security metadata. Preview can reuse the full `CalendarDto`.
- Keep new authorization/use-case logic in `CalendarService` or a cohesive service
  following the existing controller/service/repository layers. Revalidate the
  acting session, current superadmin role and unrestricted status inside the
  shared security transaction. A known session cookie or BFF role check alone
  must not grant access. A missing calendar returns the normal not-found response
  after authorization, with existing error translation and no-store behavior.
- Reuse `/calendar-preview/$id` with a server-validated owner-preview or
  superadmin-preview mode. Choose the appropriate BFF query from the validated
  session, never from a caller-controlled role/mode parameter. Keep `/calendars/$id`
  and creation/edit guards calendaradmin-only. Superadmin preview returns to the
  overview on `/my-page` and has a localized read-only notice, without an editor
  link or layout controls. Shared presentation may use an explicit mode instead
  of expanding the current preview boolean into scattered role checks.
- Preserve separate owner-edit, owner-preview and superadmin-preview query keys,
  including the existing validated session scope. No route prefetch; revalidate
  direct navigation and refresh. Handle expiry/revocation and concurrent SSR
  without leaking list rows or preview data across sessions or access modes.
- Author API changes in `src/contract/openapi.json`, then regenerate both C# and
  TypeScript consumers through the existing generation workflow. Keep generated
  files untracked and unedited by hand. Document status codes and validation for
  both new reads; do not add a superadmin write endpoint.

### Work steps

- [ ] **1. Implement backend reads and contract.** Add the two read operations,
  paginated DTOs, service/repository methods and thin controller adaptation.
  Join current account names/usernames using stored associations. Verify against
  isolated PostgreSQL with calendars owned by multiple administrators, and prove
  that existing owner-only writes remain denied to superadmins.
- [ ] **2. Integrate BFF and protected preview.** Add strict Zod inputs, dedicated
  server readers/tRPC queries and role-aware preview navigation in
  `src/frontend/src/server/calendars.ts`, `server/trpc.ts`,
  `lib/auth-navigation.ts`, `lib/calendar-navigation.ts` and the preview route.
  Preserve deadline/error behavior, no-store, cache scoping and owner edit guards.
- [ ] **3. Add the superadmin table and preview presentation.** Implement the
  table, pagination/refresh and preview links on `routes/my-page.tsx`. Adapt
  `components/calendar-workspace.tsx` for a read-only superadmin notice and return
  navigation. Reuse `CalendarBoard` and native door selection. Add maintained
  Norwegian/English messages and verify both languages and responsive behavior.
- [ ] **4. Verify and align documentation.** Extend backend tests, frontend/BFF
  tests and the existing isolated browser scenarios. Update current capability
  descriptions in `README.md`, `docs/architecture.md`, component READMEs and
  `.agents/rules/authentication-and-calendar-access.md` when implementing the
  new read grant. Preserve implemented plans as historical records. Record actual
  verification evidence, then update this plan, its index and the TODO status.

## Verification

- Backend integration tests must cover paginated calendars across multiple owners
  and recipients; duplicate/Unicode display names; correct stored associations;
  stable ordering and counts; empty/last/out-of-range pages; invalid paging/UUIDs;
  and calendars whose linked accounts are disabled or have changed role.
- A superadmin can preview all 24 doors, including future content, while the
  persisted order, content and `last_modified_at` remain unchanged. Previewing
  must not call writes or affect any recipient opening state.
- Verify direct API and BFF denials for anonymous callers, restricted sessions,
  calendar users and calendaradmins on the new system-wide operations. Verify
  revoked/expired/disabled superadmin sessions fail on subsequent requests.
- With valid CSRF where applicable, attempt existing create, door-save and
  layout-save operations as superadmin and assert authorization denial and
  unchanged data. Preserve the owner success cases and cross-owner denials.
- Browser scenarios cover the superadmin table, both account columns, pagination,
  refresh, total/page counts, keyboard preview activation, all-door reading and
  return navigation. Assert absence of edit forms/layout actions/editor links,
  and denial of direct owner-editor navigation and crafted write requests.
- Test Norwegian and English, long/duplicate names, narrow screens and preview
  at desktop/mobile sizes. Calendar content and saved layout must survive language
  changes and refresh. Reuse the current board and, when available, plan 00016's
  chronological/scattered layouts without a separate superadmin rendering path.
- Check protected SSR HTML/hydration/errors for no-store and role correctness,
  concurrent requests for session isolation, and account switching/logout for
  cleared system-list/preview data. Reusing a calendar ID in another access mode
  must not reuse superadmin preview authority or cached content.
- Follow [development quality](../rules/development-quality.md),
  [API contract rules](../rules/api-contracts.md) and
  [code quality](../../docs/code-quality.md) during implementation: generation,
  relevant backend/frontend/browser tests, explicit type checking, builds and
  required final quality/health comparisons. Record missing evidence and inherited
  failures rather than claiming unexecuted checks passed.

This plan does not implement the feature. No new superadmin calendar access is
available until implementation and verification are complete.
