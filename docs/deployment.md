# Production deployment on Sliplane

The production design is one Sliplane Starter server in Germany with three
containers: public frontend/BFF, private backend and private PostgreSQL. Development
continues on `main`; only reviewed releases merged into `deploy` deploy automatically.
Brief downtime is accepted. This runbook prepares owner operations; it does not
claim that any paid server, secret, branch protection or live release is configured.
Record actual local and hosting evidence in
[deployment verification](deployment-verification.md) before inviting users.

## Responsibilities and trust boundary

Repository automation builds/tests isolated copies, opens a release PR when asked,
and tags the exact merged release. The owner creates the server/services, enters
secrets, configures GitHub protection, performs SSH/database operations and merges
releases. Payment is already arranged; no payment-method setup is needed.

Only the frontend is internet-facing. Backend HTTP and PostgreSQL traffic use the
trusted same-server network, without additional database TLS. Private services are
reachable by other services on that server; this is not per-service network
isolation. Keep unrelated/untrusted workloads off it. The frontend receives no
database credentials or Data Protection material. The application identity owns
its own schema and can change/delete that data. Host/database operators and holders
of backups remain trusted. [Sliplane private networking](https://docs.sliplane.io/private-networking/overview/)
defines this server boundary.

## Bootstrap GitHub before connecting application services

1. Before the implementation PR is merged into `main`, create persistent `deploy`
   at the current clean `main` baseline. If implementation already landed, select
   its recorded parent baseline deliberately. This is an owner bootstrap operation;
   **Prepare release** refuses to create a missing branch. Do not connect Sliplane
   to the unprepared baseline application.
2. Keep `main` as the default branch. Enable merge commits and preserve `main`
   after release PRs; disable automatic head-branch deletion if it would delete it.
   Release PRs must be same-repository `main` to `deploy`. Never squash/rebase them
   or use **Update branch** to merge `deploy` back into `main`.
3. In Settings > Actions > General > Workflow permissions, allow GitHub Actions
   to create pull requests if organization policy permits. Preparation uses
   `contents: read` and `pull-requests: write`; it never approves/merges a PR or
   pushes a ref. Do not add a PAT when policy prevents this; open the release PR
   manually with the workflow-owned metadata required by validation instead.
4. After the first release PR emits `Deploy readiness`, protect `deploy`: require
   PRs and that check; block direct/force pushes and deletion. Check whether the
   repository's actual GitHub plan enforces these rules. Configure checks without
   the strict up-to-date-source requirement: deploy merge commits must not force
   release history back into `main`. Serialize releases and verify the tested
   base SHA immediately before merge.
5. Permit finalization's `contents: write` token to create annotated `v*` tags,
   while protecting existing tags against update/deletion where supported. Do not
   grant a branch-protection bypass merely to create tags.
6. Run/approve the first release checks, verify an intentional failing check blocks
   an ordinary merge, then merge with **Create a merge commit**. Only now connect
   the prepared application services to `deploy`. Exercise a second release to
   verify the long-lived branch flow. Record actual protection and run URLs.

GitHub may require owner approval of workflows for PRs created using `GITHUB_TOKEN`.
Approve pending runs when requested; a passing preparation action is not the PR's
required test result. See [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token).

For the manual fallback, create `[CHORE]: Release X.Y.Z` from `main` to `deploy`,
include the release checklist below and this metadata with the current mirrored
version and exact 40-character `main` SHA substituted. Validation rejects absent
or stale metadata:

```text
<!-- advent-release:start -->
Release version: <X.Y.Z>
Prepared source: <40-character-main-SHA>
<!-- advent-release:end -->
```

## Service creation and configuration

Create each service individually, rather than deploying local Development Compose.
Use the exact internal hostnames displayed in service settings. Verify exposure
before creation: some choices require recreating/copying the service to change.
Grant the Sliplane GitHub App access only to this repository. Use root build context
`/`, existing Dockerfiles, automatic deployment of `deploy` and no path exclusions
that skip shared version/contract/build inputs. Do not configure hooks or registry
credentials. [Service creation](https://docs.sliplane.io/services/deploying-a-service/)
and [service settings](https://docs.sliplane.io/services/service-settings/) describe
the available controls.

| Service | Source and port | Exposure, storage and readiness |
| --- | --- | --- |
| PostgreSQL | `docker.io/library/postgres:18.7@sha256:9f4fd4aa918f52ae3d6f3b687f1de90d8f867cd4d520021545a9a50c120eae3b`, port 5432 | Private; durable volume at `/var/lib/postgresql`; initialize the separate operator first. |
| Backend | `deploy`, `src/backend/Dockerfile`, context `/`, HTTP 8080 | Private; key-ring volume at `/var/lib/advent-keys`; `/health/ready`. |
| Frontend/BFF | `deploy`, `src/frontend/Dockerfile`, context `/`, HTTP 3000 | Public HTTP service with edge HTTPS; no volume; `/health/ready`. |

The PostgreSQL 18.7 manifest was resolved and pulled on 2026-11-14; it is the
repository's pinned PostgreSQL 18 baseline, not a floating update policy. Review
supported patch/security updates before initial hosting, using
[PostgreSQL's support policy](https://www.postgresql.org/support/versioning/)
and the [official image](https://hub.docker.com/_/postgres). A version upgrade is a
separate reviewed image change; do not replace the digest silently. PostgreSQL 18
uses `/var/lib/postgresql` for this volume. Never use `POSTGRES_HOST_AUTH_METHOD=trust`.

Start PostgreSQL first, prepare its restricted role/database, then start backend
with its secrets/volume, followed by frontend. Measure startup and configure
`SLIPLANE_GRACE_PERIOD` accordingly. Attached volumes disable backend replacement
without downtime: verify the old backend stops before replacement migrations.
Check actual running commits and readiness after each deployment.

### Environment and secret inventory

[environment.example](../tools/deployment/environment.example) contains placeholders
only. Enter each service's values directly in Sliplane. Mark secrets using its
secret control and keep an independent password-manager/recovery copy. Never put
filled environment files, secrets, hashes, PFX data or screenshots of values in Git,
Actions inputs, images or chat. Dockerfiles do not declare secret build arguments.

| Service | Settings | Secret handling |
| --- | --- | --- |
| PostgreSQL | `POSTGRES_USER=advent_operator`, `POSTGRES_DB=postgres`, `POSTGRES_INITDB_ARGS=--encoding=UTF8 --auth-host=scram-sha-256` | Unique `POSTGRES_PASSWORD` is the operator initialization secret. The official image makes `POSTGRES_USER` a superuser; do not use it in backend settings. |
| Backend | `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_URLS=http://+:8080`, `PORT=8080`, `CalendarOpening__DisableTimeCheck=false` | `ConnectionStrings__Calendar` uses only `advent_app`, the actual private DB host and a unique password. Use `SSL Mode=Disable;Maximum Pool Size=10;Timeout=3;Command Timeout=10` initially. |
| Backend keys | `Authentication__KeyDirectory=/var/lib/advent-keys` | Exactly one of `Authentication__KeyCertificateBase64` or absolute `Authentication__KeyCertificatePath`, plus `Authentication__KeyCertificatePassword`. Base64 is transport encoding, not encryption. |
| Backend proxy | `Hosting__KnownProxies__0=<actual-BFF-IP>` or `Hosting__KnownNetworks__0=<verified-server-CIDR>` | Nonsecret deployment trust. Indexed entries support additional peers. Never use wildcard addresses, broad/trust-all networks or automatic forwarded-header switches. |
| Backend volume | `SLIPLANE_USER_ID`, `SLIPLANE_GROUP_ID` from inspected image user/group | Nonsecret volume ownership; verify the nonroot user can write the mount before startup. Inspect the pinned image rather than assuming host IDs. |
| Frontend | `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`, `BACKEND_API_URL=http://<actual-private-backend-host>:8080`, `PUBLIC_ORIGIN=https://<actual-public-domain>`, optional `BACKEND_DEADLINE_MS=10000` | No database or PFX secrets. Both origins are server-only; neither accepts credentials, paths or query strings. |
| Owner only | SSH private key, initial superadmin credential/hash, backup/PFX recovery material | Keep outside deployment configuration and GitHub. Attach only the SSH public key to relevant services. |

Production rejects absent/default database credentials, excessive pool/timeouts,
missing/unwritable key directories, missing/ambiguous/invalid PFX material, invalid
proxy trust and the opening-time bypass before migrations/readiness. Frontend
Production startup rejects missing/invalid origins instead of falling back locally.

### HTTPS and the private BFF hop

The frontend listens for HTTP behind Sliplane's
[managed HTTPS edge](https://docs.sliplane.io/more/ssl/). Confirm public HTTP redirects
to HTTPS. `PUBLIC_ORIGIN` must be that canonical HTTPS origin. The BFF supplies
`X-Forwarded-Proto: https` from validated deployment configuration, independently
of browser forwarding headers. Backend forwarding processes only that scheme,
with one trusted hop, before the HTTPS/authentication guards. It does not trust
client-selected host/IP/identity chains; resource limits retain the actual BFF peer.

Inspect the backend's actual BFF peer after frontend replacement and configure
that exact IP or the narrow server-container CIDR (IPv4 /24 or narrower, IPv6 /64
or narrower). Sliplane's edge gateway range is a different hop; do not copy it as
backend BFF trust. Recheck after replacement. Verify host-only Secure cookies,
separate Set-Cookie headers, real login/CSRF, no-store and protected SSR through
the actual edge. Shared peer budgets initially allow two hashing operations in
flight and 30 authentication writes/minute per peer; measure normal simultaneous
logins before changing limits.

## Restricted database initialization

These are intentional owner operations over
[direct service SSH](https://docs.sliplane.io/services/ssh/), using the exact command
and host fingerprint for the created service. This connects to the container,
not an assumed host-root shell. Do not assume SCP, rsync or port forwarding exists.

1. Create a new empty PostgreSQL service with the operator settings above. Attach
   the data volume and owner's SSH public key. Never import local/sample data.
2. Open its SSH session. Start `psql -X -v ON_ERROR_STOP=1 -U advent_operator -d postgres`.
   Set `\set HISTFILE /dev/null`. The operator's local socket access is inside
   the trusted SSH boundary; remote network access must require SCRAM authentication.
3. Review and paste [database-role.sql](../tools/deployment/database-role.sql).
   It creates `advent_app` with LOGIN and no superuser, CREATEDB, CREATEROLE,
   REPLICATION or BYPASSRLS powers, owning only database `advent`. It intentionally
   fails on existing identities/databases; investigate rather than dropping them.
4. Use `\password advent_app` to supply a unique password through the interactive
   prompt. Do not embed it in SQL, shell history or command-line connection strings.
   Save it privately and enter the backend secret.
5. Use `\connect advent`, then review/paste
   [database-schema.sql](../tools/deployment/database-schema.sql). No accounts are
   inserted. Backend startup runs the existing embedded migrations using this same
   application identity, with bounded retries and per-script transactions.
6. Verify role attributes and `pg_has_role('advent_app', 'advent_operator', 'MEMBER')`
   as operator. It must be false. From a password-authenticated app session, verify
   migrations, schema CRUD and `SELECT pg_advisory_xact_lock(800008)` inside a
   rolled-back transaction. `CREATE ROLE`, `CREATE DATABASE`,
   `SET ROLE advent_operator` and connections to `postgres`/`template1` must fail.
   Confirm no unrelated databases grant PUBLIC/app CONNECT if any are added later.

Only `advent_app` owns the application schema; PUBLIC grants on the application
database/schema and maintenance databases are revoked by the templates. The
operator remains separate for recovery. The app cannot assume that superuser,
but can alter/delete its own data. Frontend has no authorized DB identity.

## Data Protection and manual first superadmin

Generate a password-protected PFX with private key using trusted local certificate
tooling; record its fingerprint/expiry and protect the original in recovery storage.
Use a certificate valid now and renew well before expiry. This is the backend's
key-encryption certificate, separate from the public HTTPS certificate. Enter its
Base64 representation/password as backend secrets. Keep the key-ring volume stable
and writable by the pinned image's nonroot UID/GID. The active certificate must
have its private key, be current and come from exactly one configured source.

For example, on a trusted computer with OpenSSL installed, first create a private
working directory (POSIX `umask 077`; on Windows restrict its ACL to the owner).
Run these commands there; all key/export password prompts are interactive:

```text
openssl genpkey -algorithm RSA -aes-256-cbc -pkeyopt rsa_keygen_bits:3072 -out advent-keys.pem
openssl req -new -x509 -key advent-keys.pem -sha256 -days 730 -subj "/CN=Advent Data Protection" -out advent-keys.crt
openssl pkcs12 -export -inkey advent-keys.pem -in advent-keys.crt -out advent-keys.pfx
openssl base64 -A -in advent-keys.pfx -out advent-keys.base64
openssl x509 -in advent-keys.crt -noout -enddate -fingerprint -sha256
```

The self-signed certificate encrypts application keys; it does not replace HTTPS.
Transfer the Base64 file directly into the backend secret control, without printing
it in a terminal/log. Store the PFX and its export password securely, then remove
temporary PEM/Base64 copies after verifying recovery storage. Renew before the
recorded expiry using the procedure below.

After migrations, query `SELECT count(*) FROM accounts` as operator: empty startup
and repeated startup must create zero accounts. Then follow
[manual superadmin provisioning](../src/backend/authentication.md#manual-superadmin-provisioning):

```text
dotnet run --project src/backend/Calendar.PasswordTool -- <username> superadmin
```

Run this trusted offline tool locally and enter its hidden password prompt. It
does not access the database. Preserve its exact normalized username/hash; do not
substitute PostgreSQL `upper()`. In SSH/psql with history disabled, use the linked
parameter-quoted transaction, advisory lock `800008`, intentional INSERT and COMMIT.
Use enabled permanent-superadmin defaults with no creator/responsible administrator
or temporary deadline. Abort on duplicate username rather than updating it. Verify
exactly one intended account without printing the hash, then remove transient hash
material. Log in over public HTTPS and create the first calendaradmin in the UI.
No startup, migration, release script or production test creates accounts.

### Certificate renewal and session continuity

1. Back up the key ring and old PFX/password before changing anything. Produce and
   securely retain a new current PFX with private key.
2. Move the previous PFX source/password to
   `Authentication__DecryptionCertificates__0__Base64` and
   `Authentication__DecryptionCertificates__0__Password` (or indexed `Path`).
   Add further indexed retained certificates if earlier rotations exist. Each
   retained entry requires exactly one source and its password; expired retained
   certificates may decrypt old keys. Replace the active KeyCertificate values
   with the new PFX/password, leaving the key directory/application identity intact.
3. Redeploy with ordinary downtime. Verify an existing login still works and
   new protected requests/sessions work after another restart. .NET's built-in
   certificate support decrypts old keys while new keys use the active certificate.
4. Retain old decryption certificates as long as keys/backups protected with them
   may be needed. Never remove all retained material simply because the old
   certificate expired. Rehearse renewal and recovery on isolated copied storage.

## Release procedure

1. Take an off-server consistent database dump and key/certificate recovery copy.
   Review migration effects; published SQL scripts must remain byte-for-byte
   unchanged. New scripts receive new unique sequence numbers. The deploy check
   protects both the initial `deploy` baseline and released migration history.
2. For a new release, bump the shared stable SemVer through an ordinary PR to
   `main`, for example `node tools/deployment/version.mjs set 1.0.1`; verify with
   `node tools/deployment/version.mjs check`. The command updates `VERSION`, frontend
   package version and API `info.version` together. OpenAPI format remains `3.0.3`;
   tool/dependency versions are separate. Patch means compatible fix, minor means
   compatible feature, major means incompatible supported application/contract
   change. First production release is `1.0.0`.
3. From Actions, run **Prepare release** on `main`. It compares current trees:
   equal trees succeed without a PR/tag/deploy; missing `deploy` fails with a
   bootstrap error. Otherwise it creates/reuses the one `main` to `deploy` PR,
   records the captured source SHA/version and returns its link. It never pushes
   source commits or creates the final tag. Versions must exceed existing stable
   tags numerically; resolve any prior merged release's missing tag first.
4. Keep one release PR at a time. Its source remains live `main`; new commits rerun
   PR checks. An unchanged version can remain in the candidate. If VERSION changes,
   rerun preparation to refresh only workflow-owned metadata, preserving owner
   prose/checklist. A token-authored body edit does not itself restart PR tests:
   rerun failed validation in Actions after repairing stale metadata and approve
   pending runs when requested. Do not substitute preparation success.
5. Wait for **Deploy readiness**, including candidate-merge provenance/tree/version
   checks, contract generation, backend/frontend suites, both actual image builds
   and isolated Production smoke. Markdown-only releases still run these tests.
   Confirm tested source/base SHAs are current, backup exists and migration/overlap
   risks are accepted. If base changed, rerun against it before merging.
6. Merge manually using **Create a merge commit**. Native Sliplane integration
   builds/deploys both application services independently; temporary frontend/API
   version overlap must remain compatible or use a maintenance window. Merging
   ordinary work into `main` must not deploy.
7. Finalization creates annotated `vX.Y.Z` on that event's exact `deploy` merge
   commit, even if branches later advance. A retry with the same tag/commit succeeds;
   a tag pointing elsewhere fails and must never be moved/deleted. Unmerged closure
   creates no tag. Tagging and hosting progress independently: a tag identifies
   source, not production health. Retry a failed finalization run after correcting
   token/ruleset restrictions; this needs no new version or redeployment.
8. Inspect both running service commits, `/health/ready`, visible version footer
   before/after login, cookie/CSRF/SSR behavior and preserved account/calendar/image/
   opening data. Verify an existing session after backend replacement. Record
   version, tag/merge SHA, source SHA, running commits and results in verification.

## Backups, restore and credential rotation

Retain daily platform volume backups and verify the configured retention. Sliplane
documents daily backups with seven-day retention, but warns that live database
snapshots may be inconsistent. Use logical PostgreSQL backups and rehearse restores;
see [volume backup semantics](https://docs.sliplane.io/servers/volumes/).

Take a `pg_dump -Fc` daily during active editing and before every release/schema
operation. Keep the last seven daily dumps outside the server and retain a
pre-release dump until that release is verified. This is an owner obligation;
there is no unattended logical-backup guarantee in this version. Save encrypted
PFX/passwords and key-ring material separately, preserving ownership/permissions.
After confirming `tar` is available in the backend container, download its key ring
with the same binary-safe helper, targeting the backend's exact SSH endpoint:

```text
node tools/deployment/ssh-backup.mjs keys <protected-keyring.tar> -- -p <port> <backend-user>@<host>
```

This runs `tar -C /var/lib/advent-keys -cf - .` without printing its contents. Store
the archive off-server alongside a separately protected PFX/password recovery copy.
If direct archive transfer is unavailable, resolve a verified off-server volume
export before treating backups as recoverable. Never print key XML/PFX into logs/chat.

Use the PostgreSQL container's matching tools via the actual database SSH endpoint.
The helper below uses file descriptors, avoids shell/native PowerShell binary
redirection and never passes passwords. Restrict the local backup directory ACL
to the owner; POSIX output is created mode 0600. Host-key verification stays enabled.
Replace SSH arguments with the service's exact command, retaining `-T` (no PTY):

```text
node tools/deployment/ssh-backup.mjs dump <protected-file> -- -p <port> <database-user>@<host>
```

A completed archive is published from `.partial` only after SSH succeeds. Investigate
and remove failed partial files; never treat them as backups. Verify archive listing
with matching `pg_restore --list`, checksum it and copy it to separate secure storage.
Direct SSH command execution/socket authentication must be confirmed on the actual
service; do not assume SCP/rsync/tunneling or put passwords into arguments.

For a restore rehearsal, create a separate private PostgreSQL instance/volume,
run the role/database/schema templates and set the application password there.
Use an empty application database with no migrated tables; never restore over
the live database. Recreate `advent_app` ownership first because a single-database
dump does not restore cluster roles. Then target only that isolated endpoint:

```text
node tools/deployment/ssh-backup.mjs restore-isolated <protected-file> -- -p <port> <isolated-user>@<host>
```

The restore uses `--single-transaction --exit-on-error`, without dropping live data.
Attach a copied key ring and retained PFX material to an isolated backend. Verify
account/session validity, migration journal, calendar images and recipient opening
history, then clean up only the isolated test resources. Record restore time,
archive checksum, counts and behavior, not passwords/hashes or private contents.

Rotate the application credential on existing storage by using operator SSH/psql
and `\password advent_app`, then update `ConnectionStrings__Calendar` and redeploy
backend. Verify readiness/CRUD and prove a new connection using the superseded
credential fails. Keep the operator recovery route. To rotate the operator,
use `\password advent_operator` and update its stored secret/recovery copy.
Changing `POSTGRES_PASSWORD` alone does not alter an initialized role's password.
Never recreate a volume to rotate credentials. Rehearse both rotations off production.

## Failed release and capacity checks

If a build fails, inspect the actual running version: it may still be the previous
image. A failed backend startup after volume-attached replacement may leave the
backend down. Inspect migration/startup logs without exposing configuration. Prefer
a reviewed forward fix returning through `main` to `deploy`; rerun full checks.
Reverting code does not revert DbUp or data migrations. Restore only deliberately
with a chosen recovery point and accepted data loss, preserving the failed volume
for investigation. Do not reset volumes or edit published SQL as a shortcut.

Before invitations, record representative use with all three services on Starter:
idle/peak RAM, CPU, disk/database/image growth, response times, concurrent logins
and maximum supported image uploads, OOMs/restarts, 429/503 responses and remaining
headroom. Start with pool size 10 and the existing hashing concurrency limit;
PostgreSQL's server connection ceiling must leave operator headroom. Check actual
Starter resources/price in the dashboard rather than assuming the plan fits.
If measurements require a larger server, report measurements and the next-tier
quote for owner approval before upgrading. Live edge, persistence, restore,
two-release history and capacity results remain pending until recorded.
