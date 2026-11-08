# 00016: More engaging calendar door layouts

Status: Not implemented

Last updated: 2026-11-08

Implementation type: feature

Make the illustrated calendar background more visible with smaller, translucent
doors. Keep a chronological arrangement and turn the existing Random choice into
a scattered arrangement that encourages people to search for the right number.
In the random layout, Christmas Eve becomes a larger focal point near the centre.

## Requirements

1. Keep the calendaradmin's Chronological and Random layout choices and persist
   changes through the existing owner-authorized layout action.
2. Chronological may retain today's responsive arrangement: three columns on
   small screens, four from the `sm` breakpoint and six from `lg`. Keep numbers
   in ascending order. A new four-column, six-row desktop layout is not required.
3. Make ordinary doors smaller than today's full-cell squares and their surfaces
   more transparent in both layouts, so more of the background illustration shows.
   Numbers, selection and keyboard focus must remain clear on all four backgrounds.
4. Random must scatter all 24 numbered doors without a fixed row/column grid.
   Merely shuffling numbers in the existing grid does not satisfy this requirement.
5. In Random, door 24 must have exactly 1.5 times the area of an ordinary door
   and sit near the centre of the calendar. The larger size applies only to Random.
6. Preserve all 24 doors, their number/content/date associations and the existing
   saved arrangement semantics: reads, refreshes, language changes and owner
   preview must not reshuffle a calendar. Choosing Random explicitly saves a new
   arrangement through the existing action.
7. Keep every door visible, selectable and within the board without overlapping
   other door targets at supported mobile, tablet and desktop widths. Retain
   accessible button names, keyboard access and usable touch targets.
8. Owner administration and owner preview must use the same visual layout for
   the same saved calendar and viewport. Preserve current access restrictions,
   selected-door editing and localized Norwegian/English interface text.

## Outstanding questions

None.

## Implementation details

### Confirmed decisions and existing behavior

- The owner accepted the current chronological row/column arrangement after
  initially suggesting four columns and six rows. Smaller doors are still required.
- The owner confirmed that "50% larger" means area, not width and height.
  For square doors, multiply both dimensions by `sqrt(1.5)` (about 1.224745).
- `src/frontend/src/components/calendar-board.tsx` currently renders both modes
  as the same grid and uses `order` to choose the numbered button sequence.
  `CalendarWorkspace` does not yet pass `calendar.layout` into the board.
- `src/frontend/src/styles.css` supplies opaque `.door-tile` surfaces and
  `nth-child` colour variants; changing only the base surface would leave some
  doors opaque.
- The backend already stores `layout` and a permutation `doorOrder` of 1-24.
  `CalendarService.SaveLayoutAsync` shuffles only on an explicit Random save;
  reads and preview retain the saved permutation. New calendars start chronological.
- Recipient viewing and timed opening remain a separate TODO. This feature
  improves the shared board in administration/preview without introducing a
  recipient route or granting additional calendar access. Image upload also
  remains the separate TODO item.

### Agent-selected implementation choices

- Keep this feature in the existing frontend. Reuse persisted `layout` and
  `doorOrder`; no new dependency, API fields or database migration is needed.
- Add a small pure layout module, such as
  `src/frontend/src/lib/calendar-layout.ts`, with named types for the board and
  door rectangles. Keep geometry separate from React rendering.
- Derive scattered positions deterministically from the entire saved permutation
  with a local seeded generator. Do not use render-time `Math.random`, current
  time, browser storage or session identity. Door 24 stays near the centre while
  the permutation influences placement of the other doors and the overall seed.
- Reserve door 24 first. As a concrete interpretation of "near the centre",
  keep its centre within the central third of the board on both axes. Include
  its enlarged rectangle when checking all boundaries and clearances.
- Generate positions throughout the remaining canvas using bounded candidate
  placement with collision checks and deterministic retries. Provide a verified
  irregular fallback arrangement if packing fails; the fallback must also avoid
  fixed rows/columns, overlap and clipping. Do not allow unbounded packing loops.
- Define responsive board dimensions and door sizes together. As an initial
  styling target, ordinary chronological doors use about 70% of the old cell
  width at an equivalent board size, centred in their cells. Tune final sizes
  against screenshots and preserve at least 44 CSS pixels per touch target.
- In Random, use the same ordinary size within each board and compute door 24's
  dimensions from the area multiplier. Grow the board vertically where needed
  on narrow screens to fit the targets and clearances; keep a scattered layout
  on mobile rather than reverting to the chronological grid.
- Use translucent surface colours, initially around 50% opacity, instead of
  reducing opacity on the whole button. Keep numerals and focus indicators
  opaque; tune their contrast with restrained local backing or text treatment.
  Update all surface variants and hover/selected states together.
- Use deterministic responsive styles for the first SSR/client render. If the
  packer needs a measured container, start with the same deterministic geometry
  on server and client, then adapt to measured dimensions after hydration.
  Recomputing for a viewport change must remain repeatable and retain selection;
  resizing must not call the layout mutation or save new order data.
- Keep semantic list items and native buttons, with a predictable DOM/tab order
  based on the saved door order. Position list items visually in Random without
  replacing button behavior or adding positive tab indices.

### Work steps

- [x] **1. Add layout geometry.** Implement deterministic scattered placement,
  central enlarged door 24, bounds/clearance checks and bounded fallback in the
  pure layout module. Define responsive sizing without changing stored data.
  Add focused tests of geometry and arrangement stability.
- [x] **2. Integrate and style the board.** Pass `calendar.layout` from
  `src/frontend/src/components/calendar-workspace.tsx` into `CalendarBoard`.
  Render chronological cells with smaller buttons and Random with scattered
  positioning. Update scoped surface/focus/selection CSS and preserve background
  rendering, selected-door behavior and administration/preview parity.
- [ ] **3. Verify the complete experience and document it.** Extend the existing
  isolated browser scenarios in `tools/frontend/browser/` (the former single
  scenario file has been split by behavior).
  Update layout help in `src/frontend/messages/nb.json` and `en.json` if needed,
  and describe the scattered behavior in `src/frontend/README.md`.
  Record implementation evidence in `src/frontend/verification.md` and update
  this plan's progress/status and its index entry only when verified.

## Verification

- Unit-test deterministic geometry for representative and adversarial valid
  permutations at mobile, tablet and desktop board sizes. Check exactly one
  rectangle per number 1-24, no intersections or clipping, minimum clearances,
  the central position of door 24 and its 1.5 area ratio. Exercise bounded fallback.
  Check that explicit changes to saved order influence placement, without
  probabilistic assertions that two random backend shuffles must always differ.
- In the existing production browser suite, create or load an owner calendar,
  switch between Chronological and Random, and confirm the active layout persists
  through refresh, preview and language changes. Assert stable geometry at the
  same viewport and unchanged numbered content. Verify keyboard and pointer
  selection, retained selection after resizing, and access-denial regressions.
- Measure actual browser button rectangles at representative widths, including
  320, 375, 768 and 1280 CSS pixels. Confirm bounds, non-overlap, usable touch
  targets, central door 24 and its area ratio within browser rounding tolerance.
  Verify SSR hydration without mismatches or a new layout save on resize.
- Compare before/after screenshots at matching viewport sizes for all four
  backgrounds and both layout modes. Confirm visibly smaller ordinary doors,
  transparent surfaces, more exposed illustration, readable numbers and visible
  focus/selection. Chronological must have uniformly sized doors, including 24;
  Random must visibly lack fixed rows/columns.
- Follow [development quality](../rules/development-quality.md) and the command
  owners in [code quality](../../docs/code-quality.md) and
  [advisory health](../../tools/quality/health.md) during implementation. Run
  relevant frontend unit/browser coverage, type checking, production build and
  required final quality checks; record failures and missing evidence honestly.

## Implementation evidence

- Iteration 1: pure deterministic packing and an irregular bounded fallback;
  22 geometry tests pass at board widths 248, 303, 624 and 1008, including forced
  fallback, clearance, centrality, area and repeatability. Targeted Biome passes.
  Board integration and browser verification follow in iterations 2 and 3.
- The previous advisory baseline is preserved as
  `baseline-before-00016-20261108`; the new baseline was captured before edits.
- Iteration 2: shared board integration, 70%-width chronological buttons,
  translucent surface variants and opaque numeral backings with double-contrast
  focus/selection. Deterministic initial geometry adapts through ResizeObserver
  without writes. All 146 frontend tests, Biome and the production Vite/Nitro build
  with explicit TypeScript pass. Existing production browser content/preview/
  language and narrow touch/keyboard scenarios pass; no hydration errors.
  MCP refreshed the saved directory before statistics. Final advisory comparison
  and full responsive geometry measurements remain in iteration 3.
