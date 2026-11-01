# 00014: Improve the administrator UI

Status: Implemented (2026-11-01)

Last updated: 2026-11-01

Implementation type: refactor

## Overview

Make account administration easier to scan by reducing button size and visual
weight, adding meaningful icons, and grouping each account's maintenance actions
in a three-dot menu. Place session controls beside the signed-in user's name and
account creation beside the account-list heading. Include the account-creation
and maintenance forms in the compact button treatment.

Build on the implemented account administration from
[plan 00013](00013-user-administration.md). Preserve that plan as a historical
record and retain its existing account behavior and permission boundaries.

## Requirements

1. Make buttons and button-styled links in the administrator personal page,
   account list, and account-creation/maintenance forms visibly smaller and less
   dominant. Give every action an appropriate icon. Retain visible text for
   creation, session actions, form actions, and menu items; refresh, pagination,
   and the account-menu trigger use icons alone.
2. Replace the visible "Refresh accounts" text button with a compact secondary
   icon button showing two arrows in a circle. Keep a localized accessible name
   and preserve its existing refresh and disabled behavior.
3. Replace the separate maintenance buttons on each account row with one compact
   three-dot menu trigger. Menu items show an icon and the existing localized
   action label. Opening a menu must not perform an account mutation.
4. Preserve the existing action matrix: calendaradmins can reset passwords for
   their assigned ordinary users; superadmins can reset passwords, enable/disable,
   and change roles for nonsuperadmin targets. Superadmin target rows have no
   maintenance menu. Retain the existing target-dependent action labels.
5. Selecting a maintenance item opens the existing action form with the correct
   account and operation. Keep explicit confirmation, recent password
   verification, validation, pending guards, success/error feedback, and list
   refresh. Selecting a status or role item must not immediately submit a write.
6. Move "Change password" and "Log out" from the bottom of `/my-page` into the
   header containing the signed-in user's name. Right-align them on wide screens
   and let them wrap cleanly on narrow screens. Keep both actions recognizable
   with text and icons, including localized pending and error feedback.
7. Move the existing account-creation link into the account-section header,
   right-aligned beside its heading. Preserve access for both administrator
   roles and navigation to `/create-account`, with an account-creation icon.
   Keep the calendaradmin's unavailable calendar-creation control and explanation
   separate from account creation, using the compact icon treatment.
8. Replace pagination text buttons with secondary left-arrow and right-arrow
   icon buttons. Retain localized accessible names, the visible page number,
   navigation semantics, page boundaries, loading/error guards, and creation
   focus behavior.
9. Apply compact icon-and-text actions to the account forms' confirm/save and
   cancel buttons. Distinguish the primary submission action from secondary
   cancellation. Preserve the separate account-creation page and inline
   maintenance forms.
10. Support keyboard, screen-reader, mouse, and touch operation. Give icon-only
    controls localized accessible names; identify the account in each menu
    trigger's accessible name. Keep decorative icons out of accessible names,
    visible focus indicators, usable pointer targets, sufficient contrast, and
    working disabled states. Menus must fit the viewport and work with long
    names and translated labels.
11. Maintain Norwegian and English through Paraglide, preserving user-authored
    names and usernames. Preserve account/session authorization, credential
    handling, cache isolation, and existing routes throughout the UI changes.

## Outstanding questions

None.

## Owner-requested follow-up (2026-11-01)

The owner explicitly requested updating this implemented plan and implementing
these presentation corrections on the existing `refactor/improve-admin-ui` branch.
The original implementation date and evidence below remain historical records.

Additional requirements:

1. Every enabled button and account-menu item shows a pointer cursor on hover;
   disabled controls retain their disabled treatment.
2. Left-align every account value in consistent columns across rows, including
   long names and usernames, with role/type and enabled status in separate columns.
   Preserve usable narrow layouts and the existing action menus and focus behavior.
   The owner corrected the initial right-alignment request to left alignment
   during implementation on 2026-11-01.
3. Display the authorized total beside the list heading, for example
   `Alle kontoer (6)`. Calendaradmins see only their assigned ordinary-user count.
4. Show both current and total pages, localized as `Side 1 av 2` / `Page 1 of 2`.
   Empty lists show page 1 of 1; exact page-size multiples have no phantom page.
   Preserve navigation/loading/error guards and newly created-account focus.

Implementation iterations (one commit each):

- [x] 6. Add an authorized `totalCount` to the authored user-list contract,
  repository/service/controller and BFF. Reuse the SQL authorization predicate;
  do not scan every account merely to count. Derive `hasMore` from the count.
  Verify scoped, empty, partial, full and exact-boundary pagination in existing
  backend integration and BFF tests; regenerate contracts and run saved-source quality.
- [x] 7. Apply shared pointer styling, four aligned account-value columns,
  heading totals and translated page totals. Extend existing production browser
  scenarios for both administrator scopes, languages, desktop/mobile alignment,
  cursors and pagination boundaries. Run unit/API tests, explicit TypeScript,
  production build, browser scenarios, full quality and final advisory comparison.
  Record the result here and in frontend verification and update the index.
- [x] Obtain explicit publication permission required by automatic approval
  review. After its initial rejection, the owner explicitly authorized pushing
  the completed commits to the public `Pipehill/advent-calendar` repository and
  creating a draft PR on 2026-11-01. All implementation and verification work is complete.

Follow-up iteration 6: contract generation and backend build passed, as did 82
frontend/BFF tests and full saved-source quality after correcting C# formatting.
All 178 backend integration tests subsequently passed. MCP snippet inspection
found no clones for the count implementation. Interim
application health remains 86.9, tooling 52.3; application complexity changes
79.6 to 79.5 (maximum 73 to 75) for the additional count/pagination coverage.
Application clones/duplicated lines remain 4/32, tooling 1/6. The previous
baseline is archived as `baseline-before-00014-adjustments-20261101`.

Follow-up iteration 7: all 43 production browser scenarios and the eight public/
calendar smoke scenarios passed with left-aligned columns. Both administrator
roles, Norwegian/English and 1280px/320px layouts verify actual column edges,
separate role/status cells, pointer cursors and authorized heading/page totals.
Empty lists show `(0)` and page 1 of 1. The empty/error scenario initially tried
to click a now-disabled previous-page button; using refresh for the error request
corrected the test, and the complete rerun passed. Screenshots were inspected.
All 82 unit tests, explicit TypeScript, production packaging, Biome and full
quality passed. Application health declines 86.9 to 86.8 (-0.1), tooling remains
52.3 with increased browser-test complexity; clone and heuristic finding counts
are unchanged. Detailed metrics, identities and inherited limits are in
[frontend verification](../../src/frontend/verification.md#2026-11-01-administrator-list-corrections-plan-00014-follow-up).

## Implementation details and work order

The owner selected `refactor` on 2026-11-01 because this work changes the
presentation of existing functionality. Implementation uses
`refactor/improve-admin-ui` from the existing planning HEAD, carrying the pending
plan and index changes into the implementation branch.

Each numbered step below is a separate implementation commit. Step 1 verifies
dependency peers, shared controls, lint and the production build; step 2 verifies
header placement and existing session consumers; step 3 verifies menu dispatch,
keyboard operation, focus and pagination; step 4 verifies form behavior,
translations and shared consumers; step 5 runs the complete production browser,
unit, type/build and quality checks and records the final health comparison.
Cross-component browser integration is completed in step 5.

### 1. Establish compact shared controls and icons

The owner confirmed on 2026-11-01 that the button changes include account forms
and that Lucide icons and a shadcn/ui three-dot action menu may introduce new
frontend dependencies.

Current repository facts:

- `src/frontend/src/components/ui/button.tsx` is maintained shadcn/ui source with
  a single dark-green style, `min-h-11`, and generous horizontal padding. It has
  no size or visual-variant API.
- `src/frontend/src/routes/my-page.tsx` duplicates button styling on the
  account-creation link and renders session controls after the account list.
- `src/frontend/src/components/account-list.tsx` renders maintenance buttons
  below each account's metadata and text buttons for refresh and pagination.
- The frontend has no icon-library dependency or shared dropdown-menu component.
- Account creation uses `/create-account`; the personal page uses `/my-page`.
  Historical plan references to `/min-side` do not describe the current route.

- [x] Follow the [architecture](../rules/architecture.md),
  [authentication and calendar access](../rules/authentication-and-calendar-access.md),
  and [development quality](../rules/development-quality.md) rules.
- [x] Extend the maintained Button with explicit compact, icon-only, and
  secondary treatments. Share the appropriate style with navigation links while
  preserving link semantics. Use scoped variants so existing consumers remain
  deliberate; reduce visible padding/height without making touch targets or
  focus indicators difficult to use.
- [x] Add Lucide React icons and a maintained shadcn/ui dropdown-menu component
  under `src/frontend/src/components/ui/`. Verify and pin compatible supported
  dependencies and update the frontend lockfile during implementation, including
  SSR/hydration and React compatibility. Keep customized component source in
  the repository. See the official
  [Lucide React documentation](https://lucide.dev/guide/react) and
  [shadcn/ui dropdown-menu documentation](https://ui.shadcn.com/docs/components/radix/dropdown-menu).
- [x] Use a consistent icon size and spacing. Import only required icons. Use
  the following visual meanings; confirm the exported component names against
  the selected Lucide version during implementation.

| Action | Icon meaning | Presentation |
| --- | --- | --- |
| Create account | User with plus | Compact primary link with text |
| Refresh accounts | Two arrows in a circle | Secondary icon button |
| Account actions | Three horizontal dots | Quiet icon menu trigger |
| Reset password | Key | Menu item with text |
| Enable / disable | Enable / disable account symbol | State-dependent menu item with text |
| Promote / demote | User role up / down | Direction-dependent menu item with text |
| Change own password | Key or lock | Compact secondary link with text |
| Log out | Exit arrow | Compact secondary button with text |
| Previous / next page | Left / right arrow | Secondary icon buttons |
| Confirm and save | Check or save | Compact primary button with text |
| Cancel | Cross | Compact secondary button with text |
| Retry a failed list load | Circular arrow | Compact secondary button with text |
| Unavailable calendar creation | Calendar with plus | Compact disabled button with text |

### 2. Reorganize the personal-page and account headers

- [x] Update `src/frontend/src/routes/my-page.tsx` so the avatar/name group and
  right-aligned session actions share a responsive header. Allow long names and
  controls to wrap without overlap or horizontal scrolling.
- [x] Adapt `src/frontend/src/components/session-controls.tsx` to support this
  placement without its current forced top margin. Preserve exactly one active
  session-controls instance per page, including expiry, returning-tab
  revalidation, pending logout, and failure feedback. Check its existing
  consumers on `/create-account` and `/change-password` when changing its API.
- [x] Put the authorized creation link in the account-section header in
  `account-list.tsx`, alongside the heading and refresh control. Remove the
  previous creation entry from the personal-page action section. Preserve the
  appropriate localized creation label for each administrator role.
- [x] Keep the unavailable calendar action and explanatory text visible for
  calendaradmins, with the new compact appearance and calendar icon.

### 3. Replace row actions and pagination

- [x] Adjust account-row layout so metadata remains easy to scan and the
  three-dot trigger sits at the row's trailing edge. Keep name, username, role,
  enabled status, and `data-account-id` available.
- [x] Reuse the current role/action predicates and `actionLabel` behavior when
  constructing menu items. Do not introduce additional maintenance permissions.
  Preserve the list's existing busy guards while an action form is selected.
- [x] Close the menu on selection and open the existing `AccountForm` with the
  selected target/action. Preserve focus on the action heading, accounting for
  menu focus restoration so it does not steal focus from the opened form. Restore
  focus to a meaningful row control after cancellation or completion, including
  when a successful mutation removes the target from the current list.
- [x] Support Enter/Space opening, arrow-key item navigation, Escape dismissal,
  outside dismissal, and usable focus return. Ensure menu positioning works at
  viewport edges and on mobile, and disabled triggers/items cannot activate.
- [x] Replace refresh and pagination visuals with the specified secondary icon
  controls. Reuse the current refetch, offset, limit, `hasMore`, error, selected
  action, and newly created-account focus logic.

### 4. Apply form treatment and localized accessible labels

- [x] Update `src/frontend/src/components/account-form.tsx` with compact
  icon-and-text confirm/save and cancel controls. Keep submission and verification
  logic intact, including synchronous duplicate-submission protection.
- [x] Apply the matching compact retry treatment to list error feedback through
  `src/frontend/src/components/auth-feedback.tsx`, keeping shared consumers
  functional. Keep localized loading/success/error messages visible.
- [x] Maintain labels in `src/frontend/messages/nb.json` and `en.json`, reusing
  existing refresh, previous/next, and action messages. Add a target-specific
  account-actions label for the three-dot trigger. Generate Paraglide output
  through the existing workflow.
- [x] Review shared controls on ordinary-user personal pages, login, own-password
  change, and creation pages for regressions. The account-form scope does not
  require redesigning credential forms or changing application routes.

### 5. Verify and record the result

- [x] Complete the verification below and record implementation evidence in
  `src/frontend/verification.md` following the existing project workflow.
- [x] Update this plan and its index to implemented only after the planned
  behavior and required verification are complete.

## Verification

### Iteration evidence

Step 1: 77 frontend tests, explicit TypeScript, production Vite/Nitro build,
Biome and full repository quality passed. The sandboxed Nitro build first
failed on parent-directory readlink permissions; the same build passed outside
the sandbox. Lucide React 1.66.0 and Radix Dropdown Menu 2.2.1 declare React 19
support. The temporary health decline (87.5 to 86.6) is an unused-component
heuristic for the dropdown, whose first consumer arrives in step 3; application
clones remain four / 32 lines. Integrated browser verification completes
SSR/hydration and dependency audit evidence.

Step 2: 77 unit tests, standalone TypeScript and full repository quality passed.
Both non-header SessionControls consumers explicitly retain their spacing, with
one instance per page and unchanged session lifecycle handlers. Saved-source
health is reviewed against the baseline; the unused dropdown finding remains
temporary until step 3. Existing administrator browser scenarios passed before
reorganization and their screenshots are retained for comparison. Final browser
scenarios verify integrated header layout in both languages.

Step 3: 77 unit tests, TypeScript, production build and full quality passed.
Five focused production browser scenarios passed, including reset/promotion/
demotion, enable/disable, assigned-only reset, keyboard menu cancellation with
zero mutation requests, form focus and focus fallback when a refreshed target
disappears. Initial browser checks found a missing Lucide Node export in Nitro's
traced output; bundling Lucide through Vite SSR fixed real server rendering and
hydration without copying the full icon library into standalone output.
The temporary unused-dropdown finding is resolved. Application health is 86.9
versus baseline 87.5; additional focus guards and responsive controls explain
the complexity tradeoff, with unchanged clone counts/lines and heuristic findings.
Localized trigger messages moved forward from step 4 because the menu requires
them to remain accessible in every intermediate commit.

Step 4: 77 unit tests, TypeScript, Biome and full repository quality passed.
Only account form controls and shared retry presentation changed; form validation,
recent verification and the synchronous duplicate-submit guard remain intact.
Default Button consumers retain their original size. The complete browser run
in step 5 checks shared consumers, both catalogs and session/layout regressions.

Step 5: all 77 frontend/BFF tests, 43 production browser scenarios and the eight
public/calendar smoke scenarios passed, alongside explicit TypeScript, contract/
translation generation, production packaging, frozen installation, Biome and
final full repository quality. Four maintenance scenarios additionally verify
focus after successful saves on the final test inputs. Both administrator roles
were checked in both languages at 1280px and 320px; keyboard and emulated touch
operation passed, including menu/form focus, outside dismissal, missing-target
fallback, pending/error guards, session expiry and returning-tab revalidation.
Test databases and quality containers were removed; the existing development
services/volumes/images and external build containers remain unchanged.

The required dependency audit found two inherited Seroval advisories. The final
verification iteration updates only its compatible transitive lockfile resolution
to 1.7.5; the production audit is clear. Six high, five moderate and five low
build-dependency findings remain recorded. Application health declines 87.5 to
86.9 (-0.6); tooling improves 52.0 to 52.3 (+0.3), with increased browser-suite
complexity. Absolute duplication and heuristic finding counts are unchanged.
The focus/control branches and expanded production scenarios justify the
complexity tradeoff; no scoring/exclusion changes were made. Full identities,
metrics, SSR packaging repair and platform/manual-testing limits are recorded in
[frontend verification](../../src/frontend/verification.md#2026-11-01-compact-administrator-controls-plan-00014).

- **Visual layout:** compare the administrator page before/after on desktop and
  narrow mobile widths in Norwegian and English. Confirm smaller, quieter
  controls, meaningful icons, right-aligned session actions beside the name,
  account creation beside the heading, and one three-dot trigger per eligible
  row. Check long names/usernames, multi-line menu labels, empty/loading/error
  lists, and menu placement near viewport edges. Confirm the calendar placeholder
  and its explanation remain usable.
- **Menus and permissions:** exercise all three maintenance action types as a
  superadmin and assigned-user password reset as a calendaradmin. Verify target
  status/role determines the correct label and operation, superadmin targets have
  no action menu, and an ordinary user has no administration controls. Opening a
  menu or selecting an item must not issue a mutation before form confirmation.
- **Account flows:** verify account creation from the moved link, cancel,
  validation failures, pending guards, successful creation and list focus,
  maintenance confirmation, recent-verification expiry/recovery, errors and
  successful list refresh. Confirm compact form controls preserve existing
  duplicate-submission protection and credentials remain in the established flow.
- **Refresh and pagination:** verify icon controls' accessible names, refetch,
  first/middle/last pages, empty and failed lists, disabled/pending states, page
  number announcements, and creation focus on a page other than the first.
- **Accessibility:** operate headers, menus, forms and pagination with keyboard
  and touch. Check screen-reader names, account identity in menu triggers,
  decorative-icon hiding, focus visibility, focus transfer into forms and return
  after cancel/save, Escape/outside dismissal, contrast, and pointer targets.
- **Session and regression:** exercise logout success/failure/pending behavior
  and navigation to own-password change from the header. Verify session expiry,
  returning-tab revalidation, restricted-session handling, and shared controls
  on creation/password pages. Check ordinary-user personal pages, login, public
  landing and calendar views, SSR/hydration, and production language switching.
- **Build and quality:** use the project's required saved-source quality/health
  workflow and frontend unit tests, type checking, production build, and relevant
  browser scenarios. Extend behavior coverage for menu interactions, focus, and
  action dispatch where needed. Avoid tests that only mirror CSS or icon markup.
  Recheck dependency compatibility and report remaining findings or limitations.
