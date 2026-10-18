# 00007: Norwegian Christmas landing page

Status: Implemented (2026-10-18)

Last updated: 2026-10-18

Implementation type: feature

## Overview

Replace the example-calendar redirect at `/` with a welcoming landing page.
Use a warm, drawn illustration of Norwegian Christmas and introduce the
purpose of the application. Show a disabled login button at the top right.
Authentication and login behavior belong to a later task.

## Requirements

1. Visiting `/` displays the landing page as the application's first page,
   including on direct navigation and refresh. Remove the automatic redirect
   to the local example calendar.
2. Display the Norwegian heading exactly as `Velkommen til advent`.
3. Display the Norwegian introductory text exactly as
   `Her kan du lage en adventskalender til en du er glad i eller åpne en kalender noen har laget for deg`.
4. Place a visible `Logg inn` button at the top right. Use a disabled button;
   it must not navigate, submit, open a dialog, or start an authentication flow.
5. Use a warm, drawn background illustration with a Norwegian farm nisse
   (gårdsnisse), a snowman, a Christmas tree, and a snowy winter landscape.
   The scene must convey Norwegian Christmas rather than American Christmas.
6. Keep the heading, introductory text, login button, and existing language
   selector readable and usable on mobile and desktop. Prevent horizontal
   overflow and maintain text contrast against the illustration.
7. Follow the existing Paraglide localization rules: Norwegian Bokmål by
   default, English available through the language selector, translated
   application-owned text, and matching SSR/hydration language and HTML `lang`.
8. Keep the existing `/calendars/<id>` pages available through direct URLs,
   including the local example calendar. Preserve their data retrieval and
   language behavior.
9. Render the landing page through the existing SSR frontend without loading
   calendar data or requiring a successful calendar API response for its content.
   Calendar creation and calendar-opening workflows are outside this task.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed decisions and repository context

- The owner requested a new feature plan on 2026-10-18 and confirmed a warm,
  drawn illustration with a Norwegian farm nisse and winter landscape.
- The owner confirmed that the login button should be visible but disabled.
- The owner authorized creating `feature/norwegian-christmas-landing-page` from
  the planning branch and carrying over both uncommitted plan files on 2026-10-18.
- Planning starts from clean `main` at `58bc208`, synchronized with
  `origin/main`, on `plan/norwegian-christmas-landing-page`.
- `src/frontend/src/routes/index.tsx` currently redirects `/` to
  `/calendars/5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026`. This task supersedes that
  root-redirect behavior from plan 00006; the calendar route remains available.
- `src/frontend/src/routes/__root.tsx` owns the shared header, language selector,
  main element, and constrained page container. Account for that structure when
  placing the background and top-right login control.
- `src/frontend/src/styles.css` contains shared page and calendar-tile styles.
  Scope landing-specific styling so calendar pages retain their existing layout.
- Maintained message catalogs are `src/frontend/messages/nb.json` and
  `src/frontend/messages/en.json`; generated Paraglide files are not authored.
- `tools/frontend/smoke.mjs` currently expects the root redirect before checking
  the seeded calendar. Update that expectation and continue calendar checks at
  their explicit URLs.
- Follow the existing [architecture](../rules/architecture.md),
  [documentation](../rules/documentation.md), and
  [development quality](../rules/development-quality.md) rules during implementation.

### 1. Prepare the page composition and illustration

- [x] Capture the required development quality baseline before implementation.
  Archived the previous baseline as `baseline-before-00007-20261018` and captured
  unmodified source at `58bc208` with the pinned analyzer.
- [x] Prepare the warm, drawn Norwegian Christmas illustration, including all
  requested subjects. Use the farm-nisse and Norwegian winter setting to guide
  clothing, buildings, and decoration rather than an American Santa setting.
- [x] Keep decorative artwork separate from real interface text. Store the
  finished visual assets with the frontend and serve them locally, sized and
  compressed appropriately for mobile and desktop.
- [x] Compose the scene so the heading and introduction have a clear reading
  area. Check responsive cropping so the requested subjects remain recognizable.
  Treat background artwork as decorative for assistive technology.

### 2. Implement the landing route and header integration

- [x] Replace the redirect in `src/frontend/src/routes/index.tsx` with an
  SSR-rendered landing component containing a semantic main heading and
  introductory paragraph. Do not add calendar queries to this route.
- [x] Integrate the background and login placement with `__root.tsx` and
  `styles.css`, preserving a single main landmark and the language selector.
  Keep landing-specific layout changes scoped to the landing page.
- [x] Add a semantic `button` with `type="button"` and native `disabled` state,
  positioned at the top right of the landing page on mobile and desktop.
- [x] Add maintained Paraglide messages for the heading, introduction, and login
  label in both languages. Preserve the exact requested Norwegian wording.
- [x] Preserve direct calendar navigation, calendar SSR/data loading, and
  existing translated error states.

### 3. Update verification and project documentation

- [x] Extend `tools/frontend/smoke.mjs` to check the landing page at `/`, its
  text, disabled login control, language switching, mobile layout, and hydration.
- [x] Start the existing seeded-calendar checks at its explicit URL and retain
  coverage of stored calendars, browser/tRPC communication, translated errors,
  and unchanged user-authored titles.
- [x] Update the root `README.md` and `src/frontend/README.md` to describe the
  new landing page and direct example-calendar URL, replacing redirect claims.
  Review launcher wording for references that now describe the root incorrectly;
  preserve existing readiness checks and startup behavior.
- [x] Record actual browser/build verification in `src/frontend/verification.md`.
- [x] Update this plan and the plan index to the dated implemented status only
  after implementation and verification are complete.

### Completion evidence

- Implemented and verified on `feature/norwegian-christmas-landing-page`.
  The root now displays the localized landing content and disabled top-right
  login control. Direct calendar routes retain the existing read flow.
- The built-in image generator produced the Norwegian Christmas illustration;
  its locally served JPEG, dimensions, encoding and exact prompt are recorded in
  [the illustration record](../../src/frontend/illustration.md).
- Frontend verification passed: 21 tests, production build, TypeScript, Biome,
  full saved-source quality checks, and the extended browser smoke on Windows/Edge.
  The landing page also succeeds with an unreachable backend; widths 320 through
  1920 were checked. Wide-screen review led to a cream gradient behind the copy
  and a full-width header for contrast and login placement.
- [Frontend verification](../../src/frontend/verification.md#landing-page-verification-2026-10-18)
  records actual commands, browser evidence, platform limitations and advisory
  code health. Overall health regressed from 53.8 to 53.2; heuristic findings
  remained eight, and duplication remained zero. The increased weight of the
  executed smoke script's existing unused-file classification is documented.
- No dependencies, API contracts, backend behavior, authentication flow, or
  production deployment were added. No commit, push or PR was requested.

## Verification

- Open `/` directly and refresh. Confirm the URL remains `/`, the exact
  Norwegian heading and introduction appear, and no calendar request is made
  to render the landing content. Check its SSR HTML and absence of hydration errors.
- Verify the top-right `Logg inn` control is a disabled button and cannot
  trigger navigation, a dialog, submission, or an authentication request.
- Review the actual illustration on desktop and a narrow mobile viewport:
  Norwegian farm nisse, snowman, Christmas tree, and winter landscape are
  recognizable; text remains readable; the button stays at the top right;
  the language selector remains usable; there is no horizontal overflow.
- Switch Norwegian to English and back, refreshing each language. Verify all
  landing interface text and the login label, the correct HTML language, and
  consistent server/client rendering.
- Open `/calendars/5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026` and other stored-calendar
  URLs directly. Retain existing checks for titles, 24 static doors, language
  selection, translated errors, and actual browser/BFF communication.
- Run `node tools/frontend/check.mjs check` for frontend tests, production build,
  explicit TypeScript checking, and lint. Run the updated
  `node tools/frontend/smoke.mjs` against the started stack and inspect desktop
  and mobile screenshots. Complete the required quality comparison and record
  actual results without claiming unperformed checks.
