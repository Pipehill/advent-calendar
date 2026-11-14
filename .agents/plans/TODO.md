# TODO

- [x] Select hosting: Sliplane Starter, confirmed on 2026-11-14; payment is set up.
- [ ] Implement [plan 00021](00021-sliplane-deployment.md): production configuration,
  a protected `deploy` branch with tested `main`-to-`deploy` release PRs and a manual
  Prepare release action to open/reuse the PR, a shared SemVer version starting
  at `1.0.0` shown in the frontend with final release tags after merge, secrets,
  persistent storage and the owner-run Sliplane/SSH setup for the first superadmin.
  This replaces the stricter production gate in [plan 00009](00009-database-hardening.md).
- [ ] Complete the Sliplane first-deployment, restore and Starter-capacity checks
  in plan 00021 before inviting users; configure the documented backup routine.
- [x] Remove mandatory password changes for calendar users after account creation
  and administrator password resets, including existing temporary/expired
  credentials and accounts demoted to calendarUser; planned in
  [plan 00020](00020-calendar-user-passwords.md). Preserve administrator password
  setup requirements and voluntary password changes.
- [ ] Fix Vite-dev interface language switching: English selection remains Norwegian
  in three browser smoke cases; the same cases pass in production mode.
- [x] Add calendar creation and administration in the frontend; implemented in
  [plan 00015](00015-create-calendars.md).
- [x] Add frontend user administration; implemented in
  [plan 00013](00013-user-administration.md).
- [x] Let superadmins view all calendars with owner/recipient identities and
  read-only preview; implemented in [plan 00017](00017-superadmin-calendar-overview.md).
- [x] Let calendaradmins upload an image to a calendar door; planned in
  [plan 00018](00018-door-image-upload.md).
- [x] Let calendaradmins view a list of their own calendars; implemented in
  [plan 00015](00015-create-calendars.md).
- [x] Add recipient calendar lists/viewing and enable calendar users to open doors
  at the agreed backend-controlled time, with local `--no-time-check`, persisted
  opening history and animated content presentation; implemented in
  [plan 00019](00019-recipient-calendar-view.md), following the deferral in plan 00015.
