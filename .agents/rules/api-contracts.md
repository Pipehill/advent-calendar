# API contract implementation rules

Apply these rules to backend contracts/controllers, generated code, BFF inputs,
API serialization/validation, and BFF backend calls. See the
[architecture description](../../docs/architecture.md) for explanations and
[architecture rules](architecture.md) for build/test tooling.

## Sources and generation

- Author an OpenAPI 3.0.x backend contract as the source of truth for BFF/API
  communication. Keep it separate from browser/BFF types derived from the tRPC
  router. Choose the exact dialect patch with the pinned NSwag toolchain at setup.
- Generate C# DTOs and abstract ASP.NET Core controller contracts, plus TypeScript
  DTOs and an HTTP client, with NSwag from the same authored document. Implement
  endpoints in separate hand-written derived controller classes.
- Commit the spec, generator settings, and pinned tools; exclude generated output
  from Git. Never edit generated DTOs, clients, or controllers by hand.
- Generate before consumer compilation using the same local/CI workflow, without
  a running/compiled API. Clean builds must pass Redocly CLI checks, generation,
  .NET compilation, explicit TypeScript checks, and Vite builds. Do not compare
  output with committed generated files.
- Regenerate both languages after spec changes, then adapt controller/BFF code.
  Verify concrete routes, methods, parameter binding, bodies, status codes,
  and runtime validation in API integration tests; signatures alone are insufficient.
- Keep validation and both consumer generators in `src/contract/Contract.proj`.
  Invoke its `GenerateContract` target before API compilation and from frontend
  package scripts. Restore the pinned local tool during setup/CI installation;
  generation itself must not restore dependencies. Keep one generation invocation
  per check sequence and independent trees for concurrent application builds.
- Use System.Text.Json for the API and configure C# generation explicitly for it.
  Verify attributes/converters and representative schemas, including any used
  polymorphism. Report incompatibility rather than silently changing serializer.

## Wire representations

- Use camelCase OpenAPI/JSON/TypeScript names and PascalCase C# properties with
  preserved wire names. Require and disallow null by default as an authoring
  convention: use `required` arrays and declare exceptions explicitly. Treat
  presence independently from `nullable: true`; test missing and null separately.
- Declare enums as strings with explicit camelCase allowed values. Preserve exact
  values through generation/serialization and reject numeric or unlisted values.
- Use UUIDs for all unique identifiers: OpenAPI string/uuid, JSON and TypeScript
  strings, C# Guid, PostgreSQL uuid. Leave UUID version/generation location to setup.
- Use OpenAPI date strings, C# DateOnly, and PostgreSQL date for date-only values;
  use OpenAPI date-time RFC 3339 UTC strings, UTC DateTimeOffset, and PostgreSQL
  timestamp with time zone for instants. Keep both as TypeScript strings and
  verify generation, serialization, and Npgsql/Dapper round trips. Follow
  [calendar time rules](authentication-and-calendar-access.md) for business dates.
- Give every JSON integer number explicit bounds within -9007199254740991 to
  9007199254740991. For fields that can exceed that range, use integer-formatted
  strings for every value, declare syntax/range as strings, and preserve digits
  without conversion through JavaScript number. Choose internal types by field range.
- If exact decimals become necessary, declare string syntax/range/precision/scale
  within C# decimal limits; retain TypeScript strings, calculate with domain decimal,
  and persist numeric with explicit precision/scale. Map DTO strings explicitly
  using culture-independent conversion and verify exact round trips. This rule
  does not require decimal fields or a frontend decimal library.

## Validation and errors

- Validate tRPC inputs at runtime with Zod, including applicable format, presence,
  nullability, enum, and numeric constraints. Independently validate backend
  requests against OpenAPI and enforce business rules; types and BFF checks do
  not substitute for backend validation. Check invalid input at both boundaries.
- Define API ProblemDetails, status codes, and structured field errors in OpenAPI.
  Translate generated-client errors and transport failures consistently to tRPC:
  invalid input/Zod -> BAD_REQUEST; authentication -> UNAUTHORIZED; denied access
  -> FORBIDDEN; missing resource -> NOT_FOUND; conflict -> CONFLICT; unavailable
  backend -> SERVICE_UNAVAILABLE; total deadline -> TIMEOUT; unexpected failure
  -> INTERNAL_SERVER_ERROR. Preserve structured field errors in client error data.
- Verify mapping for ProblemDetails, BFF Zod failures, and transport failures
  without an API error body. Follow [form rules](architecture.md) for display and
  [authentication rules](authentication-and-calendar-access.md) for cookies/security.

## Deadlines and retry ownership

- Give ordinary BFF/API calls a configurable 10-second total deadline including
  all attempts and waits; cancel HTTP work at expiry or caller cancellation.
- Retry GET/HEAD at most once for network failures or HTTP 502/503/504, delaying
  250-500 ms only within the remaining deadline. Never reset the deadline or retry
  other errors, explicit cancellation, or expired calls.
- Do not automatically retry writes without a separately agreed idempotency
  mechanism. Keep retries in the BFF and disable additional TanStack Query retries
  for corresponding browser/SSR queries. Justify operation-specific timeout changes.
- Verify total elapsed limits, cancellation, attempts, and final error mapping.
