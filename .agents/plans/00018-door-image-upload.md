# 00018: Upload images to calendar doors

Status: Implemented (2026-11-08)

Last updated: 2026-11-08

Implementation type: feature

Let calendar administrators add one optional image to a door alongside its title
and description. Save all three through the existing explicit Save action. Store
the processed image as binary data in PostgreSQL and automatically adapt larger
JPEG/PNG uploads to the persisted size limit.

## Requirements

1. An unrestricted calendaradmin can select one optional image for a door in a
   calendar they own. They can replace or remove an existing image. Selecting or
   removing an image changes the draft; the common Save button persists title,
   description and image together. Do not upload or persist automatically on file
   selection.
2. Accept JPEG and PNG. The persisted image must be at most 1 MB. Automatically
   resize/re-encode larger supported images before storage; explain processing
   failures without losing the current draft or overwriting saved content. The
   user has approved introducing an image-processing library for this purpose.
3. Store image bytes as a database binary value, not a filesystem path, remote
   URL or base64 text column. Persist the detected output media type and the
   metadata needed to retrieve and display the image correctly.
4. Image, title and description are independent optional content: support an
   image by itself and an image with either or both text fields. Preserve the
   existing title/message limits and plain-text behavior. Existing doors start
   without images and retain all their saved content and calendar settings.
5. Show the saved image with the selected door's content in owner administration,
   owner preview and superadmin read-only preview. Preserve its aspect ratio and
   fit it to narrow and wide screens. An image-only door must not display the
   existing empty-door message.
6. Preserve existing backend authorization: only the current calendaradmin owner
   can write; a current unrestricted superadmin can read through the dedicated
   system-preview authority. Image reads must independently authorize the
   calendar and door. Anonymous, other-owner, ordinary-user and restricted
   sessions receive no image authority. Recipient viewing/opening remains a
   separate task.
7. Saving is atomic: title, description, image changes and calendar modification
   time commit together. Failed validation, processing or persistence preserves
   the previous saved state. Saving text alone preserves the existing image;
   removing the image preserves text. Editing one door leaves other doors intact.
8. Validate uploads in the backend independently of browser/BFF checks. Reject
   unsupported or malformed image data and enforce bounded request, decoded
   image and processing sizes. Never trust the filename or supplied MIME type
   as proof of the image format.
9. Preserve CSRF on writes, no automatic mutation retries, protected no-store
   responses/errors, cancellation/deadline handling, SSR request isolation and
   session/access-mode cache separation. Do not preload all 24 image payloads
   when loading calendar details or preview.
10. Provide Norwegian and English file controls, help, processing/save feedback
    and errors, using the existing accessible form conventions. Preserve authored
    text across interface-language changes.

## Outstanding questions

None.

## Implementation details

### Confirmed decisions and repository facts

- The user confirmed one optional image per door, replacement/removal and one
  common Save button. Only JPEG and PNG are accepted. Automatic adaptation and
  a new backend image library are approved.
- `DoorModel` currently contains `Number`, `Title` and `Text`. The existing
  `PUT /calendars/{id}/doors/{number}` and `SaveDoorAsync` save title/message and
  return the calendar. `CalendarRepository` reads door content through explicit
  SQL projections. There is no image-processing dependency in `Calendar.Api`.
- `CalendarDoorForm` owns the explicit save action. `CalendarWorkspace` shares
  content presentation across `owner-edit`, `owner-preview` and `system-preview`.
  The current empty-door presentation tests message text alone and must account
  for title/image content.
- Browser mutations use tRPC, the request-scoped BFF and the generated backend
  client. API contracts are authored in `src/contract/openapi.json`; generated
  files remain ignored. `ContractRequestFilter` currently checks top-level JSON
  presence/null/enum/length and must not be assumed to validate nested image data.
- The published migration sequence currently ends at
  `0004_protect_calendars.sql`. Add the next unused migration at implementation
  time and preserve all published scripts and implemented plans.

### Agent-selected implementation choices

These are technical defaults selected for this plan, not additional user-confirmed
product decisions.

#### Storage and size policy

- Interpret 1 MB as **1,000,000 bytes of encoded image data**, excluding transport
  encoding and metadata. Use the same constant and boundary tests throughout.
- Add nullable image bytea/media-type/dimension/version columns to the existing
  `doors` row. One image belongs directly to one door; a separate image table is
  unnecessary. Keep bytes out of ordinary calendar/list projections. PostgreSQL
  `bytea` is the binary/blob representation for this stack; base64 is transport
  encoding only.
- Add database constraints requiring either all image fields to be absent or
  consistent nonempty bytes of at most 1,000,000 bytes, a supported media type,
  positive dimensions and a version identifier. Generate a new version on
  replacement; removal clears all image fields. The migration preserves existing
  rows with null image columns, without deleting or backfilling calendar content.
- Bound source uploads at 10,000,000 encoded bytes and 40,000,000 decoded pixels,
  with positive dimensions and a maximum of 10,000 pixels on either side. These
  limits protect processing resources; the stored-image limit remains 1,000,000
  bytes. Show the source-file limit separately from the final storage limit in
  localized help.

#### Image processing

- Use SkiaSharp as the implementation library, with the matching Linux
  native-assets package required by the existing backend runtime image. Pin
  supported, compatible, security-reviewed package versions and lockfiles during
  implementation. No new browser/BFF image library is needed. Verify actual
  Windows host and Linux runtime-image decoding/encoding before relying on it.
- The official [SkiaSharp package documentation](https://github.com/mono/SkiaSharp/blob/main/documentation/dev/packages.md)
  explains Linux native assets. Its [bitmap encoding guide](https://mono.github.io/SkiaSharp/docs/guides/bitmaps/saving.html)
  documents JPEG/PNG output. This is a bounded decode/resize/encode operation;
  no external image service or background job is planned.
- Detect and decode JPEG/PNG with the library, inspecting dimensions before full
  allocation. Reject malformed/truncated data and unsupported formats even when
  renamed to `.jpg`/`.png`. Support static images; reject animated/multiframe
  inputs. Apply orientation, preserve aspect ratio and PNG transparency, and
  re-encode from pixels without copying EXIF/location or other source metadata.
- Start with a maximum long edge of 1600 pixels without upscaling. Keep JPEG
  output for JPEG input and PNG output for PNG input. Use a bounded sequence of
  smaller dimensions, with bounded JPEG-quality reduction as appropriate, until
  actual output bytes fit. PNG needs dimension reduction rather than a JPEG
  quality setting. Reject cleanly if processing cannot meet the limit; never
  persist oversized bytes or use an unbounded retry loop.
- Authorize the actor/calendar before expensive processing. Process outside the
  shared security transaction/lock, with bounded concurrency and cancellation
  checks between stages. Revalidate session, role and ownership inside the
  committing transaction under lock 800008, then write title/text/image/time
  atomically. Do not hold the global security lock while decoding images.

#### Contracts, BFF and protected retrieval

- Extend the existing door-save request with an explicit image action
  (`keep`, `replace`, `remove`) and bounded base64 data for replacement. Prefer a
  flat schema compatible with current validation/generation. Reject contradictory
  action/data combinations. Preserve existing text-only caller behavior by
  defining omitted image action as `keep`; validate missing/null independently.
  Allow absent image data for `keep`/`remove`; require nonempty data for `replace`.
  Bound the base64 field to 13,333,336 characters and verify decoded byte length.
- Specify image metadata in `DoorDto` without image bytes, including presence,
  version, media type and dimensions. Update service/repository mappings and both
  generated consumers. Avoid returning all images on each text/layout save.
- Add dedicated protected image reads, for example owner
  `GET /calendars/{id}/doors/{number}/image` and superadmin
  `GET /administration/calendars/{id}/preview/doors/{number}/image`. Keep the
  authorities separate and deny superadmin writes. Return a bounded JSON DTO
  containing base64 bytes and metadata through the generated client and tRPC,
  loading only the selected door's image. A missing image returns not found.
- Reuse request-scoped cookie/CSRF relay, backend session checks, structured
  errors and the existing total deadline. Add a structured upload-too-large
  response and BFF/UI mapping, including HTTP 413 where applicable. Enforce body
  limits before unrestricted buffering/JSON parsing in both BFF and backend;
  use a 14,000,000-byte total request-body limit for these upload requests,
  including base64 expansion, JSON overhead and aggregate batched tRPC bodies. Do
  not globally enlarge unrelated endpoint limits or introduce mutation retries.
- Key image queries by validated session scope, access mode, calendar, door and
  image version. Prevent late responses from a previous door/session/version
  from becoming the displayed image. Refresh/invalidate image metadata and
  preview data after save/removal, and remove protected bytes on session changes.
  Preserve no-store through Nitro, API errors, SSR and hydration. No public image
  URL, static directory or anonymously accessible thumbnail route is introduced.

#### Editor and preview

- Extend `calendar-door-form.tsx`, `calendar-workspace.tsx`, `lib/calendar-input.ts`,
  `lib/auth-client.ts`, `server/calendars.ts`, `server/trpc.ts` and the message
  catalogs. Extract shared image presentation/validation helpers when cohesive.
- Provide a labelled JPEG/PNG picker, local draft preview and replace/remove
  controls. File selection and removal mark the form dirty. Keep the current
  draft after errors, prevent duplicate submission and show adaptation/save
  feedback. Retain existing behavior when switching doors; dispose the outgoing
  draft and revoke object URLs so it cannot attach to a different numbered door.
- Display saved output after success, rather than assuming the original local
  preview matches the processed image. Use a semantic image with alternative text
  derived from the door title, falling back to a localized door-image label.
  Keep the full image visible without cropping, retain message line breaks, and
  preserve read-only superadmin presentation.
- Revoke local/display object URLs on replacement, removal, unmount and session
  changes. Keep file bytes out of localStorage, route/query parameters and logs.

### Work steps

Each step is one implementation iteration and commit, following
[implement-plan](../skills/implement-plan/SKILL.md) when implementation is requested.

- [x] **1. Define contracts and persistence.** Add the data-preserving migration,
  constraints, image metadata and save/read contracts. Regenerate both consumers,
  adapt affected mappings and verify fresh/populated databases and generation.
  Contract validation and both consumers generated successfully (four inherited
  OpenAPI warnings). The actual migration preserved populated door content in
  isolated PostgreSQL; 1,000,000 bytes passed, 1,000,001 bytes and incomplete
  metadata failed the database constraint. Full DbUp/journal integration follows
  step 2: this intermediate build intentionally reports the two new abstract
  image-read methods awaiting backend implementation (CS0534).
- [x] **2. Implement image processing and backend operations.** Add/pin the image
  library and runtime assets, bounded validation/adaptation, protected reads and
  atomic saves. Verify actual HTTP binding, PostgreSQL storage/rollback,
  authorization/CSRF and Windows/Linux runtime-image compatibility.
  Release build and 36 focused image/migration tests pass, including independent
  reads, atomic rollback and session/role/ownership changes during processing.
  SkiaSharp and Linux.NoDependencies are pinned to stable 4.155.0; NuGet's direct
  and transitive vulnerability audit reports no findings. Real native processing
  on Windows and the built Ubuntu runtime produced identical bounded outputs:
  detailed PNG 5,390,853 to 865,071 bytes, JPEG 1,945,958 to 936,726 bytes.
  Saved-source custom checks pass. Application health is 90.8 to 91.2; the one
  added 11-line clone is standard integration-test imports/namespace/collection
  structure, retained for readable, independently discoverable tests. Tooling
  remains 54.1. Production HTTP/body-limit/browser evidence follows steps 3–4.
- [x] **3. Integrate BFF and editor/preview.** Add strict inputs, body-size limits,
  error translation, scoped image queries and the localized common-save flow.
  Verify focused frontend/BFF cases, types, build and production browser behavior.
  All 191 frontend/BFF tests, explicit TypeScript, production Vite/Nitro build,
  Biome and saved-source custom checks pass. Five production browser scenarios
  verify PNG/JPEG, all three modes, common-save lifecycle, retained invalid drafts,
  object-URL cleanup, language/keyboard behavior and 320/1280px aspect ratio.
  Image query scope now comes from validated SSR loader data, rather than mutable
  server context that is not hydrated into the browser. NSwag's TypeScript null
  policy is explicitly `Null`, matching the backend's required nullable image
  metadata; no generated files are edited. Streamed and declared aggregate tRPC
  body limits have focused tests, including the exact 14,000,000-byte boundary.
  Application/tooling health is 91.6/54.7. Absolute application clones add four
  lines overall (standard integration-test headers replace a removed form clone).
- [x] **4. Complete verification and documentation.** Run applicable generation,
  tests, builds, production browser scenarios and the shared quality/health
  workflow. Update owning documentation and HTTP examples, record actual evidence
  and remaining limits, and change plan/index status only after implementation
  and verification. Keep recipient viewing/opening as separate work.
  Final checks pass: 301 backend tests, 191 frontend/BFF tests, 81 production
  browser scenarios and eight separate smoke checks, with seven affected image
  scenarios repeated after the final JPEG validation correction. Release build,
  SDK formatting/analyzers, publish, byte-identical clean contract generation,
  explicit TypeScript, Vite/Nitro production packaging, Biome and full quality
  pass. Windows and final Linux runtime decode/encode agree; isolated Linux HTTP
  saves, restart persistence, declared/chunked body limits and no-store pass.
  Browser imagery was reviewed at 320/1280px. Owning backend/frontend verification
  and HTTP examples document actual evidence and inherited platform/tool warnings.
  Final application/tooling health is 91.7/55.0 (baseline 90.8/54.1); application
  duplication decreases from 81 lines/10 clones to 79 lines/9 clones, with tooling
  unchanged at 12 lines/2 clones. Shared route rendering removes avoidable growth.
  Native host macOS/Linux, physical-device/assistive-technology coverage and
  production/recipient follow-ups remain separate and are not claimed delivered.

## Verification

- Save JPEG and PNG on a door with title/message; refresh and restart, then verify
  persisted image bytes, metadata and all three presentation modes. Also cover
  image-only, title-only, text-only and completely empty doors, and exactly one
  image associated with the intended calendar/door.
- Add, replace, keep and remove an image through the common Save action. Verify
  that selection/removal alone does not write; text-only saves preserve bytes;
  failed processing/transactions preserve all saved values and modification time;
  unrelated doors/layout/recipient/year are unchanged. Revoke/change authority
  between initial processing authorization and commit and verify denial.
- Verify the 1,000,000-byte storage boundary and PostgreSQL constraint independently
  of application validation. Adapt source files over 1 MB within the source limits
  to decodable output at or below the limit; inspect real photos, detailed PNGs,
  portrait orientation and PNG transparency for sensible visual results.
- Exercise source byte/pixel/side limits, invalid base64, empty data, corrupt or
  truncated files, false MIME/extensions, WebP/GIF/SVG/other unsupported data and
  multiframe images. Check bounded processing, cancellation, queued concurrency,
  request limits including base64/batches, localized 413/error handling and no
  writes/retries after rejection or deadline expiry.
- Exercise owner and system-preview reads and owner writes through direct API,
  BFF and browser paths. Deny other owners, ordinary users, anonymous/restricted,
  expired/revoked/disabled sessions and superadmin mutations. Verify CSRF and
  that guessed calendar/door/image identifiers grant no authority.
- Confirm normal calendar/list/save responses omit image payloads, selected-door
  fetches do not preload 24 images, and replacement/removal updates the display.
  Check late responses after door/session changes, cache isolation by access
  mode/version, no-store on success/errors/SSR/hydration and no image bytes in
  logs, localStorage or public assets.
- Verify actual decode/resize/encode in the backend Linux runtime image and on
  the supported Windows host. Apply fresh and populated migrations, restart with
  the journal and check rollback/data preservation and parameterized bytea access.
- Verify Norwegian/English controls/errors, unchanged authored text, keyboard
  and touch operation, screen-reader labels, narrow/wide aspect-ratio display,
  draft cleanup and accurate pending/dirty/saved states in production browsers.
- Run the relevant backend integration and frontend/BFF tests, clean contract
  generation, type checking/builds and required final quality checks. Record
  evidence and limitations in the existing verification owners without claiming
  recipient access or production hardening is delivered.
