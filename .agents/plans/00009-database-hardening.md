# 00009: Database hardening before production

Status: Not implemented

Last updated: 2026-10-18

## Overview

Harden PostgreSQL connectivity, privileges and credential handling before the
application is put into production. The owner explicitly deferred this work from
[backend user management](00008-backend-user-management.md) on 2026-10-18.
That plan records the read-only inspection of the current local development
database; its controls must not be described as production hardening.

Ordinary application users must access data through the authorized API. Backend
database access and a controlled operator path remain necessary, including manual
database provisioning of application superadmins. Application roles do not protect
against a database superuser, a host/container administrator, or unrestricted
access to database files and backups.

## Requirements

1. Complete and verify this task before production deployment. Keep the current
   local development configuration clearly distinguished from production.
2. Place PostgreSQL on a private network reachable only by the backend and
   explicitly authorized operational tooling. Do not publish the production
   database port publicly or give the frontend/browser database connectivity or
   database credentials. Application users must not receive database accounts.
3. Make direct developer-host connections an explicit local-development option,
   bound only to localhost. Retain the ability to run the backend on the host
   when that option is enabled. Do not expose PostgreSQL on all host interfaces.
4. Separate database identities for steady-state application access, schema
   migrations, and privileged operator administration. The runtime identity must
   not be a superuser, create databases/roles, change schema, or acquire migration
   or operator privileges. Grant only the data operations needed by the backend;
   do not grant application accounts access to unrelated databases or schemas.
5. Keep DbUp migrations in backend startup, with the established availability,
   transaction and readiness rules. Use an explicitly separate migration
   connection and narrowly scoped schema privileges. Do not require the runtime
   pool to use migration credentials or introduce Entity Framework.
6. Deliver production secrets outside Git and built images. Require unique
   production credentials, reject missing configuration and development defaults,
   and exclude secrets from logs, diagnostics and ordinary API responses. Provide
   an operational credential-rotation procedure covering existing database volumes.
7. Require encrypted database connections with server identity verification for
   production network access. Limit host authentication rules to intended clients
   and authenticated connections; do not permit reachable unauthenticated `trust`
   access. Document any local socket exception within the trusted operator
   boundary. PostgreSQL authentication does not replace network restrictions.
8. Restrict access to the container engine, persistent database files, backups and
   secret material to trusted operators. Document the explicit administrative
   connection path used for manual application-superadmin provisioning.
9. Preserve existing data and published migrations. Do not seed or automatically
   provision application users, including during deployment or credential rotation.
   A PostgreSQL operational role is distinct from an application account.
10. Verify denied access as well as successful backend operation using the actual
    deployment network and PostgreSQL permissions. Keep evidence free of secrets.

## Outstanding questions

Deployment-specific choices are explicitly deferred to this separate preproduction
task; this is a requirements plan, not an implementation-ready deployment design.
Resolve these before implementation:

- Production hosting and network topology, including the private database endpoint
  and how database access is denied from the frontend and untrusted networks.
- Secret delivery, storage and rotation mechanism, and which operators may use it.
- Certificate authority, server identity and certificate-renewal mechanism for
  verified PostgreSQL TLS connections.
- Controlled operator access mechanism, such as a private tunnel or equivalent
  hosting-provided access; do not assume public database access is acceptable.
- How startup migration credentials are delivered and retired under the chosen
  hosting model while retaining the repository's backend-startup migration rule.

Production storage, backup and restoration design remains part of deployment
planning under the repository's existing data rules. Access protection for those
resources is within this task; this plan does not invent a backup policy.

## Implementation details and work order

### 1. Confirm deployment boundaries

- [ ] Resolve the deferred choices above and record the approved deployment design.
  Follow the [data and migration rules](../rules/data-and-migrations.md) and
  [architecture rules](../rules/architecture.md).
- [ ] Review the current baseline in plan 00008 and recheck the actual target
  environment. Do not assume local Compose bindings represent production.
- [ ] Identify the authorized operator path and document its privilege boundary.
  Ensure manual superadmin provisioning remains possible without publishing the
  database to application users.

### 2. Isolate connectivity and separate privileges

- [ ] Adjust deployment networking and host authentication rules. Relevant current
  files include `compose.yaml` and its eventual production configuration; preserve
  local host-run backend support behind explicit localhost-only access.
- [ ] Introduce distinct runtime, migration and operator PostgreSQL roles and
  narrowly scoped grants. Handle schema/object ownership, default privileges and
  privileges on subsequently migrated objects, not just existing tables.
- [ ] Separate runtime data-source configuration in
  `src/backend/Calendar.Api/Program.cs` from the connection used by
  `Infrastructure/DatabaseStartup.cs`. Preserve fail-closed startup and readiness.
  A startup process that can read migration credentials remains inside that
  privilege boundary; separate pools alone do not contain a compromised process.

### 3. Protect secrets, transport and existing installations

- [ ] Configure external secrets, verified TLS and production validation. Remove
  any production path that silently falls back to checked-in development values
  from `src/backend/Calendar.Api/appsettings.json` or Compose.
- [ ] Write a controlled, data-preserving upgrade/rotation procedure for existing
  volumes. Changing `POSTGRES_*` initialization variables alone does not update
  existing roles, passwords, ownership or grants. Include recovery steps and
  verification that superseded credentials no longer authenticate.
- [ ] Document operator access, credential/certificate rotation and access to
  persistent files and backups without including usable secrets. No operation
  in this workflow automatically creates an application user.

### 4. Verify and record production readiness

- [ ] Test the actual network restrictions and role grants described below.
- [ ] Update the owning setup/deployment documentation and this plan with evidence.
  Keep status `Not implemented` until implementation and verification are complete.

## Verification

- From the backend, run required application data operations successfully. From
  the frontend network and an untrusted client, verify database connectivity is
  denied. Confirm production has no publicly published PostgreSQL port.
- Verify local host access is disabled unless explicitly enabled and, when
  enabled, binds only to localhost, including checks for unintended IPv6 exposure.
- Connect as the runtime role and verify it cannot create roles/databases, change
  schema, read unrelated data, or assume privileged roles. Check both existing
  objects and objects created by a subsequent migration.
- Verify startup migrations use their own credentials, retain per-script rollback
  and restart behavior, and prevent API readiness on migration failure.
- Reject missing/default production secrets, invalid credentials, unencrypted
  network connections and invalid or mismatched server certificates. Check that
  credentials are absent from build output, logs and exposed diagnostics.
- Rotate credentials on an existing volume; preserve data and confirm old
  credentials fail while new runtime/migration connections work. Exercise the
  approved recovery procedure in an isolated environment.
- Verify the controlled operator path supports intentional manual provisioning
  using plan 00008's offline hash tool. Startup, migrations and rotation must
  never create application accounts; repeat the empty-database/restart checks.
- Record the deployment evidence, remaining dependencies and relevant repository
  validation results before marking production readiness complete.

## References

- [PostgreSQL host authentication](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html)
- [PostgreSQL role attributes](https://www.postgresql.org/docs/18/role-attributes.html)
- [Official PostgreSQL container image](https://hub.docker.com/_/postgres)
