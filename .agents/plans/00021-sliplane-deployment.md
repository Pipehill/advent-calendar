# 00021: Deploy the application on Sliplane Starter

Status: Not implemented

Last updated: 2026-11-14

Implementation type: feature

## Implementation progress

The implementation branch is `feature/sliplane-deployment`, based on synchronized
`main`. Owner-operated infrastructure and live verification remain separate gates;
do not mark this plan implemented before its required live evidence exists.

- [x] Iteration 1: canonical version, checked mirrors, build metadata and localized
  footer. Verify version drift/update tests, generation and frontend checks.
- [ ] Iteration 2: Production backend/BFF configuration, proxy trust and certificate
  lifecycle. Verify focused rejection/transport tests and backend integration suite.
- [ ] Iteration 3: release preparation/finalization, deploy candidate validation,
  migration integrity and disposable Production image smoke. Verify automation
  scenarios, actual image builds and Production browser coverage.
- [ ] Iteration 4: SQL/environment templates and deployment runbook; align current
  rules/docs. Verify restricted-role migration/restore/rotation and final quality,
  health and committed-head regression review, then publish a draft PR.
- [ ] Owner gates: Sliplane/GitHub configuration, two real releases, HTTPS/session
  replacement, backup recovery and representative Starter capacity evidence.

Baseline archived as `quality-reports/health/baseline-before-00021-20261114`;
the new baseline was captured before implementation edits. Iteration 1: eight
version-tool tests and 248 frontend/BFF tests pass; contract generation, TypeScript,
Vite and Nitro packaging pass with existing dependency warnings. Initial sandboxed
Nitro packaging lacked filesystem access; the authorized rerun completed. A targeted
Biome rerun verifies the final formatting correction. MCP version-tool feedback
reports only its self-match. Production browser/footer verification follows in
iteration 3. Next: finish iteration 2 and its backend integration tests.

## Overview

Prepare the existing frontend/BFF, backend and PostgreSQL containers for a small
production deployment on one Sliplane Starter server. Keep development on `main`
independent of production: release through a tested pull request from `main` to
a persistent `deploy` branch, which Sliplane watches.
Provide a manually started GitHub Actions workflow that opens or finds that
release PR. The owner merges after the required tests pass; Sliplane then deploys
automatically using the existing branch integration.
Use one SemVer version for backend, frontend and API-document metadata, starting
at `1.0.0`. Prepare release records the version in the PR; a follow-up workflow
creates the immutable `vX.Y.Z` tag on the actual `deploy` merge commit.

The owner selected Sliplane and its entry-level plan, has already configured
payment, and confirmed the simpler database design below on 2026-11-14. This plan
supersedes [00009](00009-database-hardening.md) as the production-readiness task.
The application has a known, limited audience and low data sensitivity; retain
basic access protection and recoverability without adding enterprise operations.

## Requirements

1. Use Sliplane Starter initially, with one frontend/BFF, one backend and one
   PostgreSQL container on the same server. Keep existing application boundaries.
2. Merging into `main` must not deploy. Release only through a PR with source
   `main` and target `deploy`; require a dedicated passing deploy validation check
   before merge. Sliplane application services must track only `deploy`.
3. Test the proposed release with backend integration tests, frontend/BFF tests,
   production image builds and an isolated production-mode smoke test. Do not use
   production credentials or create test accounts in production.
4. Publish only the frontend over HTTPS. Keep backend and PostgreSQL private,
   with no public database port and no database credentials in the frontend.
5. Use a separate PostgreSQL operator identity and one non-superuser identity for
   both runtime operations and startup migrations in the application database.
   Same-server private database traffic does not require separate database TLS.
6. Supply unique production secrets outside Git and images. Reject missing
   production configuration and development defaults before migrations/readiness.
   Run the backend in Production, with the local opening-time bypass disabled.
7. Persist the database and backend Data Protection key ring across deployments.
   Retain the existing requirement to encrypt the key ring with an external PFX.
   Preserve sessions across ordinary restarts and container replacement.
8. Provision the first application superadmin through an intentional manual
   PostgreSQL operation over SSH, using the existing offline password tool.
   Startup, migrations and deployment automation must create zero accounts.
9. Provide a practical backup, restore, credential-rotation and failed-release
   procedure. Preserve data and published migrations; accept brief release downtime.
10. Document agent-executable work separately from owner actions in Sliplane/GitHub.
    Verify Starter capacity with representative use before inviting users.
11. Provide a manual **Prepare release** action that creates or reuses the
    same-repository `main`-to-`deploy` PR. Keep merge under owner control and retain
    the required PR tests and native Sliplane deployment. The action must not push
    commits, merge the PR, or trigger production directly.
12. Give every release a unique SemVer version and Git tag, coordinated with
    Prepare release while preserving the tested `main`-to-`deploy` flow. Record
    the exact commit represented by each version and never move an existing tag.
    Start at `1.0.0`, share the version across backend/frontend/API-document
    metadata, and create the final tag only after the release PR is merged.
13. Show the deployed frontend's application version visibly in the interface,
    including before login, so the owner can easily identify the served release.
    Read it from the shared release-version build input rather than hardcoding it.

## Outstanding questions

None. The owner explicitly approved simplifying 00009 to same-server private
PostgreSQL, no separate database TLS, and a combined non-superuser runtime/migration
identity. Routine choices below are agent-selected proposals within that scope.
Actual hostnames, proxy addresses, secret values and capacity measurements are
implementation inputs to collect from the created services, not unresolved product
decisions. No Sliplane or GitHub settings were changed during planning.
The owner also confirmed one common version starting at `1.0.0` and final tagging
after merge; Prepare release records the intended version in the PR.

## Implementation details

### Confirmed decisions and selected defaults

| Area | Decision |
| --- | --- |
| Hosting | Owner: Sliplane entry-level plan, currently named Starter; payment is already configured. |
| Release flow | Owner: `main` to `deploy` through a PR with its own tests. |
| Release preparation | Owner: start a GitHub Actions workflow with a button to open the release PR, then merge manually when tests are green. |
| Release versions | Owner: one shared backend/frontend/API-document SemVer version, first release `1.0.0`; record it in the PR and tag the actual `deploy` merge commit after merge. |
| Version source and updates | Agent-selected: a root `VERSION` file; reviewed version bumps go through normal PRs to `main`. Prepare release reads the version without making source commits. |
| Visible application version | Owner: make the deployed version easy to see in the frontend. Agent-selected: a discreet, readable shared footer on public and authenticated pages, such as `Versjon 1.0.0` / `Version 1.0.0`. |
| Database | Owner: PostgreSQL on the same server; private unencrypted internal transport; separate operator and combined application/migration identities. |
| Initial region/domain | Agent-selected: Germany and the included frontend `*.sliplane.app` HTTPS address. A custom domain/DNS can be added later. |
| Deployment source | Agent-selected: native Sliplane GitHub integration and existing Dockerfiles; no registry, deploy hook or Sliplane API token in Actions. |
| Availability | One instance per service, accepted short downtime; no replicas, staging server, Redis, VPN or new object store. Door images already live in PostgreSQL. |
| Initial data | New empty production database. Do not copy local accounts, sessions or sample calendars into it. |
| Backups | Daily platform volume backups plus owner-operated consistent PostgreSQL dumps, described below. No scheduled backup service in this first iteration. |

The [current price table](https://sliplane.io/pricing) lists Starter with 1 vCPU,
1 GB RAM and 20 GB storage, with a displayed price of EUR 9 before VAT; the actual
quote depends on region and billing period. Builds use separate build servers.
This is a starting point to measure, not a claim that the application already fits.
Managed PostgreSQL is a separate paid product, not the database container proposed
here. Recheck the dashboard quote when creating the server.

### Assessment of 00009

| Earlier requirement | Treatment for this application |
| --- | --- |
| Private PostgreSQL and no browser database credentials | Keep. Disable public exposure and use password-authenticated internal connections. |
| Local database exposure only on localhost | Already present in `compose.yaml`; preserve it. Do not spend this task adding a new mandatory local opt-in switch. |
| Three database identities and separate migration credentials | Replace with one database/schema-owning application identity without superuser, CREATEDB or CREATEROLE; retain a separate operator identity. |
| Verified PostgreSQL TLS and certificate lifecycle | Defer for the trusted same-server container network. Reconsider when moving the database across servers or exposing it beyond that boundary. |
| Database unreachable from the frontend network | Replace with no credentials/grants for frontend access. Sliplane private services are reachable by other services on the same server; this is not per-service network isolation. |
| External secrets, protected persistent files, manual superadmin access | Keep. |
| Credential rotation and data preservation | Keep a short tested operator procedure; never recreate volumes to rotate a password. |

The combined application identity can change or delete its own schema/data; a
compromised backend is inside that boundary. All workloads and SSH operators on
this server are trusted. Do not claim that private networking or application roles
protect against the database operator, host administrator or stolen backups.

### Current versioning baseline

Read-only inspection on 2026-11-14 found:

| Component | Current configuration |
| --- | --- |
| Backend | No explicit application Version in the project files or `Directory.Build.props`. Evaluating the API project with the pinned MSBuild reports the SDK default `Version=1.0.0`. Dependency and SDK version pins are separate. |
| Frontend | Private `calendar-frontend` package without a `version` field; no coordinated application-release version. |
| API specification | Authored `src/contract/openapi.json` has `info.version=1.2.0`. Its `openapi=3.0.3` identifies the specification format and must not follow application-release bumps. |
| Contract tooling | Private `calendar-contract-tools` package without a `version` field. This is tooling, not the API's declared version. |
| Release automation | Existing workflows do not create release versions/tags; no tags were present in the local repository during inspection. |

The Docker build context excludes `.git`. Production image version metadata must
therefore come from explicit source/build inputs, not a runtime `git describe`
assumption. Deciding release version/tag timing must also account for the release
PR's live `main` source and its distinct `deploy` merge commit.

### Release versioning and tag lifecycle

- [ ] Add a root `VERSION` containing `1.0.0` as the canonical application version.
  Use stable `MAJOR.MINOR.PATCH` versions and `vMAJOR.MINOR.PATCH` Git tags in this
  first iteration. Patch increments are for compatible fixes, minor increments
  for compatible features, and major increments for incompatible supported
  application/contract changes. Do not infer bumps from commit messages or add
  a release/versioning dependency.
- [ ] Make the backend read VERSION through its existing MSBuild configuration.
  Set application Version and generated assembly metadata consistently, retaining
  commit identity in informational/build metadata. Add the same version to
  frontend `package.json` and its emitted build metadata. Mirror it in the
  authored API document's `info.version`; retain `openapi: 3.0.3` as the format.
  The initial API metadata change from `1.2.0` to `1.0.0` is the owner's explicit
  first-production numbering decision, not an API behavior rollback.
- [ ] Provide a small explicit version-update command using existing Node tooling
  to update VERSION and its checked-in frontend/spec mirrors together. Future
  release bumps are ordinary reviewed source changes merged to `main` before
  Prepare release. Checks validate equality and reject drift; they must not
  silently rewrite the authored spec or package files while building/testing.
  Keep tool/dependency versions and private contract-tooling package separate.
- [ ] Copy VERSION into both Docker build contexts/stages and include needed
  version metadata in runtime output. Ensure clean local, CI and Sliplane builds
  use the same committed values without Git history, manually changing Sliplane
  variables, reading a future tag, or requiring a GitHub credential during builds.
- [ ] Render the frontend build's version in a shared footer in
  `src/frontend/src/routes/__root.tsx`, using a small component if useful. Include
  landing/login and authenticated routes. Add the version label to the Norwegian
  and English message catalogs and preserve the numeric SemVer unchanged. Keep
  text readable on mobile and on the landing-page background, in normal document
  flow without overlapping calendar content, dialogs or controls.
  Provide the version through the existing Vite/SSR build configuration or a
  generated public version constant, with the same value in SSR and hydration.
  Do not import backend configuration into browser code or fetch GitHub/latest
  tags to populate the footer: it identifies the actual frontend build being
  served, including while a release is deploying or a newer release is available.
- [ ] In Prepare release, read the intended version from the captured `main` SHA,
  validate version mirrors, and require it to exceed existing stable release tags
  using numeric SemVer comparison when preparing an actual changed release;
  unchanged trees still return the no-op result first. With no release tags,
  require `1.0.0`. Refuse a new release while a prior merged release still lacks
  its final tag. Put the version and source SHA in workflow-owned PR metadata
  and checklist and show them
  in the run summary. Refuse a different release reusing an existing version.
  Do not create a final tag while the PR is open or for a no-change result.
- [ ] Keep the release PR's source as live `main`. New source commits rerun its
  checks. Validate that the PR's recorded version matches its actual source;
  if VERSION changes, rerun preparation to refresh only workflow-owned version
  metadata, preserving the owner's prose/checklist. New commits with an unchanged
  version can remain in that candidate and are covered by the updated PR tests.
  A metadata-only edit using GITHUB_TOKEN does not itself restart PR tests: tell
  the owner to rerun failed PR validation from Actions after repairing stale
  metadata, and approve pending runs when requested. Do not substitute a passing
  Prepare release run for the required PR result.
- [ ] Add `.github/workflows/tag-release.yml` for `pull_request` closed events
  targeting `deploy`, gated on a merged same-repository `main` source. Read VERSION
  and metadata at the event's exact `merge_commit_sha`, never moving `main` or
  the latest `deploy` tip. Create an annotated `vX.Y.Z` tag on that merge commit.
  Use a narrowly scoped `GITHUB_TOKEN` job with `contents: write` and only other
  read permissions needed for verification; no PAT or Sliplane secret is needed.
  Use API operations without executing source code under that write token.
- [ ] Serialize finalization and make retries idempotent: an existing tag pointing
  to the same commit succeeds, one pointing elsewhere fails, and tags are never
  moved/deleted. A closed but unmerged PR creates no tag. Retrying an older failed
  run must still tag that run's exact merge commit, not a later release.
- [ ] Distinguish release identity from hosting status: merging starts Sliplane
  deployment and tag finalization independently. A tag identifies selected release
  source; it does not prove both services are healthy in production. A tagging
  failure must be visible and retryable without another deploy or a new version.
  Keep the normal post-deployment checks and record version plus running commits.

### 1. Prepare release validation and branch workflow: agent work

- [ ] Add `.github/workflows/prepare-release.yml`, named **Prepare release**, with
  only a `workflow_dispatch` trigger. It must be available on the default branch
  and require selection of `main`; reject another selected ref before creating a
  PR. Do not trigger it automatically on merges to `main`.
- [ ] Use the hosted runner's GitHub CLI/API with `GITHUB_TOKEN`,
  `contents: read` and `pull-requests: write`, with no production secrets, PAT or
  additional GitHub App. Keep release validation jobs read-only. Serialize release
  preparation runs so double-clicks cannot create duplicate PRs.
  The separate post-merge tagging job has the additional Contents write permission
  described above; Prepare release itself remains unable to change Git refs.
- [ ] Verify `main` and `deploy` exist and compare their current trees. If there
  is already an open same-repository `main`-to-`deploy` PR, return its link and
  refresh only workflow-owned version metadata when necessary, preserving the
  owner-edited description. If none exists and the trees differ, create that exact
  PR with a type-prefixed English title, intended version and a release checklist.
  Identical trees are a successful no-op. A missing `deploy` branch is a clear
  bootstrap error, not permission to create or push it automatically.
- [ ] Write the PR URL or no-change result in the workflow summary. Include the
  owner steps: approve pending PR workflow runs when GitHub requests it, wait for
  `Deploy readiness`, confirm the backup/release checklist and merge manually.
  With the selected `GITHUB_TOKEN`, GitHub documents approval-required runs for
  automatically created PRs. Do not assume this action alone starts unattended
  tests or replace the required PR check with a manual-dispatch success.
- [ ] Add `.github/workflows/deploy-validation.yml`, triggered for every
  `pull_request` targeting `deploy` and by manual dispatch. Keep existing
  `main` PR validation. Use the normal `pull_request` event, read-only repository
  permissions, pinned Actions and isolated test databases; never execute PR code
  through `pull_request_target` or with production secrets.
- [ ] Require same-repository source branch `main` for a release PR. Check out
  GitHub's candidate merge commit, not just the source commit. Verify its tree
  matches the source `main` tree so deployment-only changes cannot silently enter
  production. Fail on merge conflicts or source/base provenance mismatches.
- [ ] Validate VERSION, frontend/spec mirrors, recorded release-PR version and
  tag availability in the required deploy check. Version drift, a reused version
  or stale preparation metadata must prevent merge as an ordinary check failure.
- [ ] Run the existing contract generation, backend restore/build/test/publish and
  frontend `check` commands. Build both actual Dockerfiles with repository-root
  context, then run them with PostgreSQL and disposable Production configuration.
  Reuse existing command owners rather than introducing a second build system.
- [ ] Add focused production smoke coverage for readiness, landing page, real
  login/CSRF, protected SSR, administrator operations, recipient access and one
  image save/read. Reuse existing browser coverage and isolated fixtures. Create
  the test superadmin intentionally from the test harness, never API startup.
- [ ] Give the required aggregate job the stable name `Deploy readiness`. It must
  report failure when a dependency fails or is cancelled; skipped dependencies
  must not manufacture success. Release PRs run tests even for Markdown-only
  changes. Keep the existing Markdown-only exception for ordinary `main` PRs and
  document this intentional deploy-check exception in the quality rules/docs.
- [ ] Add a published-migration integrity check against the exact PR base SHA on
  `deploy`: reject changes, deletions and renames of previously released SQL
  resources. Allow new uniquely numbered migrations. Existing journal/restart
  tests do not detect historical SQL edits by themselves. Protect the migrations
  in the initial `deploy` baseline too; do not assume a release tag exists.
- [ ] Document one release PR at a time. Use **Create a merge commit** for
  `main` to `deploy`; do not squash/rebase this long-lived source or delete `main`.
  Keep `main` as the default development branch and protect `deploy` against
  direct pushes, force pushes and deletion.
- [ ] Use required checks without GitHub's strict up-to-date-source requirement
  on `deploy`: its release merge commits would otherwise force deployment history
  back into `main`. Before merging, verify the tested base is still current and
  rerun against a changed base. Do not use Update branch on the release PR to
  merge `deploy` into `main`. Document this serialized release procedure.
- [ ] Document initial bootstrap: create `deploy` at the clean `main` baseline
  before merging implementation into `main`, then open the first release PR after
  implementation lands. Set up protection after the named check has run, and
  connect Sliplane only after that first PR passes and merges. Do not deploy the
  currently unprepared backend as a bootstrap shortcut.

### 2. Make Production hosting work: agent work

Affected code: `src/backend/Calendar.Api/Program.cs`,
`Authentication/AuthHosting.cs`, `Infrastructure/DatabaseStartup.cs`,
`appsettings.json`, frontend `src/server.ts`, `src/server/backend.ts`,
`src/server/context.ts`, `server/entry.mjs`, Dockerfiles and deployment documentation.

- [ ] Move checked-in local database defaults to Development-only settings.
  In Production require an explicit connection string with nonlocal credentials,
  explicit key configuration and proxy trust settings. Do not log secret-bearing
  configuration or put secret build arguments in Dockerfiles.
- [ ] Validate frontend Production configuration at startup, including
  `BACKEND_API_URL`. Currently both backend calls and frontend readiness silently
  fall back to localhost. Use one validated configuration for both paths.
- [ ] Fix the TLS-termination boundary. Currently `AuthHosting` rejects protected
  requests when `Request.IsHttps` is false, but the BFF calls a private HTTP backend
  without conveying the external scheme. Production login therefore needs code
  changes; setting `ASPNETCORE_ENVIRONMENT=Development` is not a solution.
- [ ] Make the BFF overwrite the forwarded scheme from validated deployment
  configuration for the canonical HTTPS frontend origin, never from arbitrary
  browser headers. Configure ASP.NET Core forwarded-header processing before the
  HTTPS/authentication guards, trusting only the actual BFF address or narrow
  server-container CIDR. Sliplane's documented gateway range concerns the
  gateway-to-frontend hop; it is not automatically the BFF-to-backend peer range.
  Verify the actual addresses after container replacement. Reject trust-all
  configuration. Keep public HTTP redirected to HTTPS at the Sliplane edge.
- [ ] Keep host-only Secure cookies, principal-bound CSRF, separate Set-Cookie
  headers and no-store through Sliplane/Nitro/SSR. Avoid forwarding client-provided
  identity, host or IP chains. Initially retain backend resource limits on the
  actual BFF peer: users share that budget. Check simultaneous known-user login
  and normal navigation for excessive 429s before changing limits.
- [ ] Add environment-based PFX loading, for example the new
  `Authentication__KeyCertificateBase64`, alongside the existing file option.
  Load it in memory with the existing .NET APIs; keep certificate password delivery
  external. Require one unambiguous source, private key and unexpired certificate.
  Base64 is transport encoding, not encryption. This avoids requiring SCP support
  in the minimal backend image or a manually maintained certificate file.
- [ ] Keep the key ring in `/var/lib/advent-keys`; verify the attached volume is
  writable by the existing nonroot backend user. The PFX must stay stable across
  releases. Record expiry and a tested renewal procedure retaining old certificate
  decryption through .NET's built-in certificate support until old keys are retired.
- [ ] Preserve backend startup DbUp, bounded connection retries, per-script
  transactions and readiness after migration completion. The single application
  identity is used for both pools/operations; no separate migration secret is needed.

### 3. Prepare database and operations documentation: agent work

- [ ] Add `docs/deployment.md` as the runbook owner, linked from the project README.
  Include service settings, secret names, initial setup, release/recovery checklist,
  manual superadmin steps and responsibilities. Add a placeholder-only environment
  table/template under the deployment tooling/docs; never a populated `.env`.
- [ ] Provide a reviewed, manually executed SQL template to create `advent_app`
  with LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE and NOREPLICATION, owning only
  the application database/schema. Restrict PUBLIC access where appropriate and
  verify it cannot assume the operator role. Preserve required function/trigger
  migrations and PostgreSQL advisory lock behavior under that identity.
- [ ] Keep the PostgreSQL initialization/operator account out of backend settings.
  The official image's `POSTGRES_USER` creates a database superuser; it is not
  the restricted application role. Require authenticated network access, not
  `POSTGRES_HOST_AUTH_METHOD=trust`. Local operator socket access inside the
  SSH-authorized container is within the trusted operator boundary.
- [ ] Use the repository's pinned PostgreSQL 18 image after verifying its supported
  patch/digest at implementation time. Mount the data volume at
  `/var/lib/postgresql`, consistent with PostgreSQL 18 and current Compose;
  do not copy older Sliplane/example mount paths blindly.
- [ ] Document rotation on existing data: change the actual PostgreSQL role password,
  update the backend secret, redeploy and verify the superseded credential fails.
  Changing `POSTGRES_PASSWORD` alone does not change an initialized role password.
  Keep a recovery route with the separate operator account.
- [ ] Prepare consistent `pg_dump -Fc` and restore commands using the PostgreSQL
  image's tools over direct SSH, with secure local output and no password arguments.
  Include roles/ownership recreation and separately saved PFX/key-ring material.
  Do not assume direct SSH supports SCP, rsync or port forwarding.
- [ ] Align the current architecture/authentication docs and rules with this plan,
  and retain all implemented plans unchanged. 00009 is superseded, not another
  independent production gate. Keep unrelated Vite-dev language switching separate.

### 4. Create and configure services: owner actions in Sliplane

The agent can prepare/review the exact settings and commands. The owner performs
account access, billable server creation, secret entry and SSH operations. No
payment-method task is necessary. Create the three services individually;
Sliplane is not a full Compose orchestrator, and local Compose is Development-only.

| Service | Source/settings | Exposure and persistence |
| --- | --- | --- |
| PostgreSQL | Explicit pinned PostgreSQL 18 registry image; port 5432; unique operator initialization password and application database. | Private from creation; data volume at `/var/lib/postgresql`. |
| Backend | Repository branch `deploy`, Dockerfile `src/backend/Dockerfile`, context `/`, port 8080, Production environment. | Private from creation; key-ring volume at `/var/lib/advent-keys`; readiness `/health/ready`. |
| Frontend/BFF | Repository branch `deploy`, Dockerfile `src/frontend/Dockerfile`, context `/`, Node production runtime, port 3000. | Public HTTP service with HTTPS edge and `/health/ready`; no persistent volume or DB secrets. |

- [ ] Create one paid Starter server/project in the chosen region. Grant the
  Sliplane GitHub App access only to this repository. Record internal hostnames
  from service settings; do not invent `.internal` names from display names.
- [ ] Create private PostgreSQL first, attach its volume and SSH public key, then
  execute the role/database template. Record application credentials privately.
- [ ] Generate the Data Protection PFX and store its password, certificate and
  recovery copy in a password manager/secure operator storage. Attach the backend
  volume with correct ownership and enter backend secrets before first startup.
- [ ] Create backend and frontend using the settings above and configure only
  `deploy` for automatic deployment. Start backend first, check migrations/readiness,
  then frontend. Configure a startup grace period sufficient for measured startup.
- [ ] Verify public/private choices before creation; Sliplane requires recreating
  or copying services to change some of these settings later.
- [ ] Verify the generated HTTPS domain and redirect behavior. Keep unrelated or
  untrusted services off this server. Review logs and metrics in the dashboard.

### Secrets and ordinary configuration

Names marked **new** are proposed code changes, not variables supported today.
Use Sliplane's secret flag for sensitive values and keep an external recovery copy;
do not send real values through PRs, screenshots or chat.

| Value | Location | Secret? / purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL service | Yes; unique operator initialization credential. Later rotation also requires SQL. |
| `ConnectionStrings__Calendar` | Backend service only | Yes; internal host, database, `advent_app` password and bounded connection pool. Explicit same-server SSL mode. |
| `Authentication__KeyCertificateBase64` (**new**) | Backend service only | Yes; PFX including private key, generated by operator. |
| `Authentication__KeyCertificatePassword` | Backend service only | Yes; password protecting that PFX. |
| Operator SSH private key | Owner's computer/agent | Yes; never upload the private key to GitHub or Sliplane. Attach its public key to the database service. |
| Initial superadmin password/hash | Owner/password manager and intentional SQL session | Yes; not a deploy variable, CI secret, seed or persistent bootstrap flag. |
| `POSTGRES_DB`, `POSTGRES_USER` | PostgreSQL service | No; application DB name and distinct operator role name. |
| `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_URLS=http://+:8080`, `PORT=8080` | Backend service | No; runtime/port settings. |
| `Authentication__KeyDirectory=/var/lib/advent-keys` | Backend service | No; durable mounted path. |
| `CalendarOpening__DisableTimeCheck=false` | Backend service | No; enforce production calendar time. |
| `BACKEND_API_URL=http://<actual-internal-host>:8080` | Frontend service only | No; server-only endpoint. |
| `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000` | Frontend service | No; runtime/port settings. |
| Canonical HTTPS origin and narrow trusted proxy addresses (**new**) | BFF/backend configuration as applicable | No; name and validate the options during implementation, and document actual values after setup. |
| Sliplane API token, deploy-hook URL, registry PAT | Not needed | Native GitHub branch deployment avoids these. |
| GitHub production secrets | None for this design | CI uses disposable configuration and short-lived `GITHUB_TOKEN`: read-only validation, PR write for preparation, Contents write only for final tagging; no production database/SSH/PFX material. |

### 5. Bootstrap the first superadmin: owner operation, prepared by agent

Sliplane documents [direct SSH into a service container](https://docs.sliplane.io/services/ssh/).
Attach an SSH public key to the database service and use the exact SSH command
from its SSH tab. This is container access, not assumed root access to the server.
No separate tunnel service or public PostgreSQL listener is needed for this path.

1. Wait until the backend has applied all migrations, then confirm `accounts` is
   empty through PostgreSQL. Startup must not create any account.
2. On the trusted local computer, run interactively:
   `dotnet run --project src/backend/Calendar.PasswordTool -- <username> superadmin`.
   Supply the password through the hidden prompt. Retain the exact normalized
   username and Argon2id hash; do not use PostgreSQL `upper()` for normalization.
   The tool has no database access, and is not included in the API runtime image.
3. SSH to the PostgreSQL container, launch `psql` against the application database
   as the operator using the socket/authentication configured for that image, and
   disable saved psql history for this session. Follow the existing parameter-quoted
   SQL in [manual superadmin provisioning](../../src/backend/authentication.md#manual-superadmin-provisioning):
   BEGIN, advisory lock `800008`, intentional INSERT, COMMIT. Supply display name,
   username, normalized username and hash through safely quoted client variables;
   never put the raw password in SQL. Abort rather than update on a duplicate name.
4. Use the SQL defaults for an enabled permanent superadmin: no responsible
   administrator/creator, fresh security version, no temporary-password deadline.
   Verify exactly the intended account was created without printing its hash.
5. Log in through public HTTPS, create the first calendaradmin through the UI,
   and verify that user can manage their own ordinary users/calendars. Remove
   temporary hash material and close the operator session. Keep the SSH recovery
   path restricted to the owner; no automatic account bootstrap is added.

### 6. Protect releases and verify operations: shared work

- [ ] Owner/GitHub: create and protect `deploy`, require PRs and `Deploy readiness`,
  block force pushes/deletion/direct pushes, and enable merge commits. Check the
  actual repository plan supports enforcement; never report merely written rules
  as enabled protection. Keep `main` from automatic deletion after release PRs.
- [ ] Owner/GitHub: in Settings > Actions > General > Workflow permissions, enable
  **Allow GitHub Actions to create and approve pull requests** if repository or
  organization policy permits it. This enables PR creation with `GITHUB_TOKEN`;
  the Prepare release workflow must not approve or merge its own PR. Record any
  organization restriction instead of silently adding a long-lived token.
- [ ] Owner/GitHub: permit the finalization workflow to create release tags while
  protecting `v*` tags against modification/deletion where supported. Check actual
  ruleset enforcement and token permissions; do not grant a branch-protection
  bypass merely to write tags.
- [ ] Agent: provide the owner a release checklist: backup, inspect migration
  effects, start Prepare release on `main` (or open the same PR manually), approve
  pending PR runs if requested, inspect checks, verify tested SHAs, merge,
  monitor both service deployments,
  check readiness/login and record deployed commit IDs. Sliplane builds the two
  services independently; coordinated/atomic release is not guaranteed. New changes
  must tolerate the brief frontend/backend version overlap or use maintenance.
- [ ] Owner: retain daily volume backups (documented seven-day retention) and
  take a consistent PostgreSQL dump daily during active editing and before every
  release/schema operation. Download it to secure storage outside the server;
  retain the last seven daily dumps and the pre-release dump until verification.
  This first version has a manual backup obligation and no unattended logical
  backup guarantee. Platform snapshots of a running database alone are insufficient.
- [ ] Agent/owner: restore a dump to an isolated database, reattach a copied key
  ring with the retained PFX and verify accounts, images and opening history.
  Never test destructive restore against the live database. Confirm backup
  storage and image growth remain within the available disk budget.
- [ ] Account for the backend key-ring volume disabling Sliplane zero-downtime
  replacement: the old backend stops before new startup/migrations. Set and verify
  this behavior; it satisfies the repository requirement to stop the old backend
  before schema-changing migrations. A startup failure can leave the backend down.
- [ ] Document recovery: failed builds may leave the old version running, but
  failed startup after volume-attached replacement can cause downtime. Inspect
  actual running commits before action. Reverting code does not reverse DbUp/data
  migrations; prefer a reviewed forward fix, or restore deliberately with accepted
  data loss. Any production code correction returns through `main` to `deploy`.
- [ ] Measure memory/CPU/disk with all three containers and representative users,
  concurrent password hashing and maximum supported image uploads. Bound PostgreSQL
  connections/Npgsql pooling conservatively for Starter. Record idle/peak use,
  response times, OOM/restarts and resource-limit responses. If it does not fit,
  report measurements and the next-tier quote before an owner-approved upgrade.

## Verification

| Requirement | Required evidence before completion |
| --- | --- |
| 1, 10 | Three services run on the selected Starter server; representative-use metrics and remaining headroom are recorded. |
| 2 | A `main` merge triggers no Sliplane deployment; a release PR runs `Deploy readiness`; an intentional failed test blocks merge; a successful release deploys `deploy`. Exercise a second release to verify branch history. |
| 3 | Candidate-merge backend/frontend suites, actual image builds and isolated Production smoke pass. Markdown-only release still runs tests; failed/cancelled prerequisites fail the aggregate check. |
| 4 | Internet access to backend/database is unavailable. Browser/frontend bundles contain no DB secrets. HTTPS login, CSRF, separate cookies, no-store and protected SSR pass through the actual Sliplane edge. |
| 5 | Application migrations and CRUD succeed; application identity cannot create roles/databases, become operator or use unrelated databases. Frontend has neither DB secrets nor an authorized DB identity. Internal traffic is accurately documented as unencrypted. |
| 6 | Missing/default secrets, invalid/expired PFX, missing key directory and time bypass fail before readiness. Untrusted forwarded scheme is rejected; valid BFF proxy configuration works after replacement. |
| 7 | Replace backend without replacing volumes/secrets: existing login remains usable. Account/door/image/opening data survive. Certificate renewal retains access to existing encrypted keys. |
| 8 | Empty DB/repeated startup creates zero accounts. Manual SSH/psql provisioning creates exactly one intended superadmin; real HTTPS login and initial UI administration work. |
| 9 | Released SQL edits fail integrity validation; new migrations/restarts preserve journals/data. Existing-volume password rotation succeeds and rejects old credentials. Restore and failed-release recovery are rehearsed away from production. |
| 11 | Manual Prepare release on `main` creates exactly one correct release PR and returns its URL; repeated/concurrent runs reuse it and preserve owner prose. Equal trees are a no-op, missing `deploy` and a non-main selected ref are rejected. No branch changes, final tag, merge or deployment occur during preparation. With `GITHUB_TOKEN`, approving the pending PR workflows starts the actual required tests; a failing test still prevents merge. Owner merge then triggers native Sliplane deployment. |
| 12 | First release is `1.0.0` in backend build metadata, frontend and authored spec; format remains OpenAPI `3.0.3`. Clean images build without `.git`; mismatched versions and reused tags fail checks. A merged PR creates `v1.0.0` on its exact deploy merge commit, even if main/deploy subsequently advance; unmerged closure creates none. Test numeric bump ordering, source-version changes during preparation, duplicate/concurrent finalization, same-commit retry and conflicting-tag refusal. Tagging failures are visible and can be retried without redeployment. |
| 13 | Production browser smoke confirms a readable version footer before login and on authenticated pages, in Norwegian/English and at mobile/desktop widths, without content overlap or SSR hydration mismatch. Rebuild with a subsequent version and verify the displayed value changes with the served frontend build, without editing UI literals or requiring backend/GitHub access. |

During implementation follow the repository's normal code-quality, test and health
requirements and record actual evidence in the deployment runbook/verification
record. Planning is Markdown-only and does not constitute deployment verification.

## Sources checked on 2026-11-14

- [Sliplane pricing and included resources](https://sliplane.io/pricing).
- [Deployment source, branch, ports and startup behavior](https://docs.sliplane.io/services/deploying-a-service/).
- [Deploy rules and service settings](https://docs.sliplane.io/services/service-settings/).
- [GitHub App permissions](https://docs.sliplane.io/more/github/).
- [Private networking boundary](https://docs.sliplane.io/private-networking/overview/).
- [Gateway proxy trust](https://docs.sliplane.io/services/reverse-proxy/).
- [Automatic edge HTTPS](https://docs.sliplane.io/more/ssl/).
- [Direct service SSH](https://docs.sliplane.io/services/ssh/).
- [Volume backup retention and database consistency caveat](https://docs.sliplane.io/servers/volumes/).
- [PostgreSQL image initialization and PostgreSQL 18 volume layout](https://hub.docker.com/_/postgres).
- [ASP.NET Core proxy configuration](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0).
- [GitHub branch protection and strict/loose checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- [GitHub merge methods and long-lived branch caveats](https://docs.github.com/en/pull-requests/reference/pull-request-merges).
- [GitHub token-triggered PR workflow approval](https://docs.github.com/en/actions/concepts/security/github_token).
- [Allowing GitHub Actions to create pull requests](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
- [OpenAPI Info Object and separate format version](https://spec.openapis.org/oas/v3.0.3.html#info-object).
- [GitHub annotated tag creation and token permissions](https://docs.github.com/en/rest/git/tags).
- [Workflow events for merged pull requests](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#running-your-pull_request-workflow-when-a-pull-request-merges).
