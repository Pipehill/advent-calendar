# Data and migration implementation rules

Apply these rules to persistence, Identity storage infrastructure, SQL migrations,
backend startup, and migration release checks. See the
[architecture description](../../docs/architecture.md) for startup diagrams and
[API contracts](api-contracts.md) for field representations/mapping checks.

## Persistence

- Use PostgreSQL, Npgsql, Dapper, and hand-written parameterized SQL for database
  access and C# result mapping. Do not use Entity Framework, its Identity stores,
  migrations, or EF-based application templates.
- Keep schema changes in DbUp SQL migrations; SQL execution through Dapper does
  not replace migration management. Follow [authentication rules](authentication-and-calendar-access.md)
  for shared Identity logic and session validity behavior.

## Script packaging and integrity

- Package SQL scripts as embedded resources with ordered unique sequence numbers,
  such as `0001_create_calendars.sql`. Preserve deterministic order and stable
  resource names because DbUp journals identities by name.
- Keep published scripts unchanged in name and content; correct them with new
  numbered migrations. In CI, reject edits, deletions, or renames by comparing
  against a reliable prior-release baseline established in build/release work.
- Use the standard PostgreSQL DbUp journal initially. It records names and
  application timestamps, not runtime content hashes; do not assume checksum
  enforcement or introduce a custom checksum journal as an agreed requirement.
- Verify resource packaging/identity/order, the integrity check, and journal-based
  restart behavior against PostgreSQL in the subsequent runnable setup.

## Transactions and startup

- Package the DbUp PostgreSQL provider with the backend and run migrations in its
  startup process at runtime, not during image building or in another container.
- Wait for database availability using bounded connection retries, apply pending
  scripts, then start accepting API requests and report readiness. On connection
  exhaustion or migration failure, prevent API startup and exit nonzero.
- Explicitly use `WithTransactionPerScript()`. Commit successful scripts separately;
  roll back the failed script's transactional changes while retaining earlier
  commits/journal entries. Abort on failure and let the journal select remaining
  scripts on restart.
- Document each operation needing non-transactional execution and its recovery
  procedure for partial changes. Do not globally disable migration transactions.
- Verify transactional rollback, retained earlier scripts, failure/readiness,
  and restart with actual application migrations in PostgreSQL integration tests.
- Stop the old API before schema-changing deployment migrations; bring the new
  API into service after successful startup. Reverting an application image does
  not revert database migrations; preserve recovery decisions for deployment work.

Local Compose persistence and readiness workflows belong to
[architecture rules](architecture.md). Production storage, backups, restoration,
and hosting remain decisions for the later deployment task.
