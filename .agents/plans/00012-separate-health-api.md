# 00012: Separate health and calendar API controllers

Status: Not implemented

Last updated: 2026-10-25

Implementation type: refactor

## Overview

Separate health operations from calendar operations in the authored OpenAPI
contract. Generate a dedicated health controller contract and move the existing
liveness/readiness implementation into its own hand-written controller, preserving
the public HTTP contract and existing calendar behavior.

## Requirements

1. Declare distinct `health` and `calendars` API groups in
   `src/contract/openapi.json`. Assign `GET /health/live` and `GET /health/ready`
   to `health`; retain calendar creation and retrieval under `calendars`.
2. Generate `HealthControllerBase` with `Live` and `Ready`, while
   `CalendarsControllerBase` contains only the calendar operations. Keep the
   authored contract and existing NSwag workflow as the source of generated code.
3. Implement health operations in a separate `HealthController` derived from
   `HealthControllerBase`. Remove health actions and the `HealthCheckService`
   dependency from `CalendarsController`.
4. Preserve routes, HTTP methods, operation IDs, response bodies, content types,
   status codes and anonymous access. Liveness returns `200` and `Healthy` as
   `text/plain`. Readiness returns `200` and `Healthy` when checks pass, or `503`
   and `Unhealthy` when they fail, still checking migration completion and current
   database availability and passing request cancellation to the health service.
5. Regenerate both C# and TypeScript consumers through
   `src/contract/Contract.proj`. Preserve the existing single TypeScript
   `CalendarClient` and its callable methods, including BFF calendar retrieval.
6. Verify generated controller ownership and actual HTTP behavior, including
   readiness during a database outage and recovery. Preserve existing calendar,
   authentication and user-management behavior.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed scope and repository context

- The owner requested a new refactor plan on 2026-10-25 and removal of the
  corresponding TODO item. This plan tracks that work; implementation is separate.
- Planning starts from clean `main`, synchronized with `origin/main`, on
  `plan/separate-health-api`.
- Both health operations currently use the `calendars` tag. The C# generator in
  `src/contract/nswag.json` already uses
  `MultipleClientsFromFirstTagAndOperationId`, so tag separation fits the existing
  generation configuration. Auth and users already have separate groups.
- `src/backend/Calendar.Api/Controllers/CalendarsController.cs` currently
  implements `Create`, `Get`, `Live` and `Ready`, and injects both
  `ICalendarService` and `HealthCheckService`.
- `Infrastructure/DatabaseHealthCheck.cs` owns migration/database readiness;
  `Program.cs` registers services and maps controllers. The refactor uses those
  existing registrations and health checks.
- The TypeScript generator uses `SingleClientFromOperationId` with the explicit
  class name `CalendarClient`. Separating backend controller groups does not
  require splitting the frontend client or changing BFF calls.
- Generated output is ignored by Git and must never be edited manually or
  committed. Existing implemented plans remain unchanged.

### Work steps

1. [ ] Follow the [development quality rules](../rules/development-quality.md)
   before implementation, including the baseline for source changes. Reinspect
   the contract, controllers and existing health integration coverage.
2. [ ] Add a top-level `health` tag with a description and apply it to both health
   operations in `src/contract/openapi.json`. Retain existing operation IDs and
   response definitions. Keep the generator settings and pinned tools unchanged.
3. [ ] Add `src/backend/Calendar.Api/Controllers/HealthController.cs`, following
   the existing `[ApiController]` and generated-base-class pattern. Move `Live`
   and `Ready` there with `HealthCheckService` as its dependency. Leave calendar
   actions, mapping and `ICalendarService` in `CalendarsController`; remove its
   unused health imports and constructor parameter.
4. [ ] Validate and regenerate through `Contract.proj`, then compile against the
   regenerated base classes. Run generation once per check sequence using the
   existing build dependency order; do not invoke NSwag separately or introduce
   a running-API dependency.
5. [ ] Extend backend integration coverage to prove that MVC maps both health
   routes to `HealthController` and calendar routes to `CalendarsController`.
   Assert health status, plain-text body and media type. Reuse the existing
   outage/recovery scenario in `Calendar.Api.Tests/CalendarApiTests.cs` and its
   isolated PostgreSQL fixture rather than duplicating container lifecycle setup.
   Follow the repository's Given/When/Then test conventions.
6. [ ] Update the relevant backend documentation to describe the controller split
   and record verification in `src/backend/verification.md`. Mark this plan and
   its index entry implemented only after implementation and verification pass.

## Verification

- Use the existing [backend contract/build/test commands](../../src/backend/README.md#contract-build-and-tests)
  to validate OpenAPI, regenerate both consumers, build the solution, run backend
  tests and verify formatting. A clean build must succeed without pre-existing
  generated output. Inspect the generated bases to confirm that `Live` and
  `Ready` belong only to `HealthControllerBase`.
- Exercise anonymous `GET /health/live` and `GET /health/ready` through the test
  server. Check route ownership, status, `text/plain` and exact response bodies.
  During an isolated PostgreSQL outage, liveness stays healthy and readiness
  becomes unhealthy; after recovery readiness becomes healthy again.
- Keep calendar creation/retrieval and authentication/user-management integration
  tests passing to detect route discovery or dependency-injection regressions.
- Follow the [frontend contract/build/test commands](../../src/frontend/README.md#contracts-builds-and-tests)
  for explicit TypeScript checks, BFF tests and production build against the
  regenerated client. Confirm the existing `CalendarClient` methods remain
  compatible; avoid concurrent builds sharing generated output.
- Run applicable final lint and advisory health comparisons under the development
  quality rules. Record actual results and any missing runtime evidence; verify
  that generated files are absent from the Git diff.
