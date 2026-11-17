# Deployment verification

## 2026-11-17: release descriptions and GitHub Releases (plan 00022)

Implemented on `ci/release-descriptions-and-github-releases` from
`eee0a165e3c0cdf01548dec0c2783fd2a583ae3e`. Verification used Windows, Node 24.20.0
and the existing Podman quality image. No production Release was published and
no hosting configuration or application/runtime behavior changed.

| Check | Evidence/result |
| --- | --- |
| Release/version suites | 80/80 pass through `node --test tools/deployment/release*.test.mjs tools/deployment/version.test.mjs`. The API fixture runs the exact inline write-token workflow; unexpected API paths/mutations fail. Covers fresh/refreshed checkbox-free bodies, retained owner text/links/metadata, repeated refresh, version rules and existing validation. |
| Publication provenance and range | Current mirror/merge/provenance/conflicting-tag cases reject before writes. Notes use the exact event merge, validated nearest deploy first-parent predecessor and paginated exact commits/associated source PRs. Initial history, historical predecessors without Releases, unrelated/newer/off-chain tags and later PR associations are covered. |
| Retry/publication policy | Fixtures cover historical annotated/lightweight tags, delayed old events, immutable policy/workflow records, successful tag then failed publication/retry, existing owner edits, incompatible draft/prerelease metadata, concurrent 409/422 creation and genuine validation failures, forbidden/rate-limited reads/writes and changed tags. Stable publication and explicit Latest protection cover pagination, a newer release appearing during note generation, multi-digit versions, large integer components and manual tag names without `v`. |
| Actual GitHub note preview | Requested generated notes for `v1.0.1...v1.0.2` using API version `2022-11-28`, without creating/editing a Release. Output includes source PRs #59, #60, #61, #62, #63 and #65 plus release wrapper #64. The exact comparison `1a4ed250e2355f05be148172ab1d680d56c2faee...3706b288bf690c4824f8026fdc38bef731805d96` contains those seven commits. Local raw evidence: `quality-reports/plan00022-generated-notes.json` and `quality-reports/plan00022-source-range.json`. |
| Privilege boundary | Existing contents-write/PR-read permissions and serialized API-only finalization remain. No checkout, repository JavaScript execution, additional token or runtime dependency was introduced. Existing Releases and final tags are never updated. Release existence remains outside the preparation gate. |

Full repository quality checks and saved-source checks passed after correcting
YAML line lengths. The final mixed PR receives full quality/health verification;
the prose-only completion commit does not substitute for these checks.

Application health is unchanged at 92.5. Tooling health declines **50.7 to 50.5**
(-0.2), with duplication improving 0.1019108280% to 0.0978792822% while absolute
counts remain 12 lines/two clones. Complexity score improves 63.9 to 64.7 and share
34.3% to 33.1%; maximum complexity stays 231. Dead-code score declines 20.7 to
20.2, share rises 19.5% to 19.7%, and heuristic findings rise 22 to 23. The added
70%-confidence unused-file finding is `release-tag-fixture.mjs`, directly imported
by all three workflow suites. This shared simulator removes duplicated setup;
the finding reflects the used-only-by-tests heuristic on a dedicated test fixture. Notes/publication
suites were split and an introduced six-line clone removed before acceptance.

Measurements use pinned jscpd 5.4.1 and configuration
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Application source hash remains
`a43f58db31c6fb90642d080a7a5d4d88008bdfb1054c0deb0e02fee9b9f206ea`;
baseline tooling hash is
`d61c8b813e70cce4c55c2bdf54a96fb77871da6398f4af5ed8197df9963093bb`.
Exact final input identities, per-scope measurements, raw clone/complexity/dead-code
findings and the whole-repository reference remain in ignored
`quality-reports/health/`. Working-tree MCP was refreshed before statistics and
found no new clones. Proposed inline numeric SemVer code matches six lines in
`release-api.mjs`; keeping this small comparator in the workflow preserves the
API-only privilege boundary. YAML/inline JavaScript is outside authored-code
health scoring and is instead exercised by the exact-workflow fixture and lint.

Local evidence rehearses publication through API fixtures. GitHub documents that
published Release creation sends ordinary notifications, but notification delivery
and an actual future production Release under the Actions token are not claimed
by fixtures or the read-only note preview. Earlier live deployment/platform
limitations remain recorded in the historical sections below; no app/database
build or live migration is needed for this tooling-only change. Verification
containers use automatic removal; no images or database volumes are created.

## 2026-11-14: repository implementation for plan 00021

Repository work is on `feature/sliplane-deployment`, based on
`422cc2049ff04df4457a4d2543c2063f93f7ef36`. No production server, service, secret,
GitHub protection or production release was configured by this implementation.
The plan remains **Not implemented** until its required owner/live evidence exists.
Use [the deployment runbook](deployment.md) for those operations.

### Local evidence

The Windows workstation uses Node 24.20.0, pinned .NET SDK 10.0.401 and the existing
Podman Linux VM. Repository image builds use their pinned Node/.NET stages and
repository-root contexts with `.git` excluded. PostgreSQL 18.7 was pulled from the
official registry and resolved to
`sha256:9f4fd4aa918f52ae3d6f3b687f1de90d8f867cd4d520021545a9a50c120eae3b`.
Historical verification records are retained unchanged.

Registry content negotiation confirms that this OCI index's Linux amd64 member is
`sha256:c7fedce47eff6a78cb35dad6b627f0d684107f75ab15c0870e40c093766ba452`,
the exact image used in the passing local database suites. The committed index
pin preserves other supported development architectures; those architectures
were not locally exercised.

| Check | Evidence/result |
| --- | --- |
| Version tools | Eight tests cover coordinated source updates, check-only drift rejection and stable-version syntax. OpenAPI format remains 3.0.3; application metadata starts at 1.0.0. |
| Release tooling | 31 release tests cover preparation/no-op/bootstrap/reuse, numeric version order, source metadata refresh, pending finalization, candidate/migration integrity and exact inline tag execution. Validation/tag retries read repaired PR metadata while rejecting changed source/merge provenance and retaining exact event source identity. |
| SSH transfer helper | Five tests cover binary preservation, failed partial output, preexisting/racing backup destinations and transactional isolated restore arguments. |
| Backend | 404/404 pass on final PostgreSQL 18.7, including 28 new configuration/proxy/PFX/key-retention scenarios. Locked restore, build, publish and format verification pass. Generated assembly/file version is 1.0.0.0 and informational version includes the source commit. |
| Frontend | 251/251 tests, contract/translation generation, TypeScript, Vite/Nitro packaging and Biome pass after the final HTTP correction, including queue, byte-budget and stalled-upload bounds. Production dependency audit finds no known vulnerabilities; backend transitive audit is also clear. |
| Actual images and Production smoke | Both Dockerfiles built. Final PostgreSQL 18.7/template-based smoke passes: isolated HTTPS edge to HTTP BFF/backend, real login/CSRF, administrator creation, protected no-store SSR, image save/read and recipient opening. Login survives backend container replacement with retained key volume/PFX. Footer checked on landing/login/authenticated pages in both languages at 375/1280px, with no overlap or page/hydration errors. Binary custom dump and transactional operator restore preserve exact content checksums, ownership and PUBLIC schema restrictions. Application credential rotation rejects the old password and a replacement backend becomes ready with the new secret. Both images reject missing Production configuration before listening. |
| Subsequent-version rebuild | Disposable source snapshot updated to 1.0.1 and actual frontend Dockerfile rebuilt without Git history. Browser and SSR show 1.0.1 with no backend/GitHub access; canonical source remains 1.0.0. |
| Existing browser regression | The broad 108-case suite reached 94 passes before its 600-second parent deadline. All 15 recipient/smoke scenarios rerun separately pass, including the eight child smoke checks. Four role/SSR cases pass after extracting shared page/hydration monitoring. The independently failing HTTP boundary case is corrected and passes 20 repeated declared uploads, a 28 MB aggregate batch and a genuine chunked upload; separate stress improves from seven resets in 60 requests to zero in 60. Coverage was completed in bounded runs; the original timed-out run remains failed. |
| Full lint, health and publication review | Full lint/custom checks pass. Final committed-head review follows the final implementation commit; raw source/commit identities are retained in health artifacts. |

Ignored `quality-reports/plan00021-*.log`, backend TRX and
`quality-reports/health/plan00021-*.json` retain detailed local evidence. The old
baseline is archived at `quality-reports/health/baseline-before-00021-20261114`;
the new baseline precedes implementation edits. Initial sandboxed Nitro packaging
failed on filesystem metadata access; the authorized rerun succeeded. An initial
backend fixture pool mismatch caused connection exhaustion; it was corrected and
all 404 tests passed. Smoke assertions were aligned with the authored CSRF status
and recipient opening envelope before successful reruns. These failures are not
reported as passing evidence.

Forty emitted browser JavaScript assets were inspected: backend configuration
markers and database/PFX option names are absent. Filled `.env` files and private
PFX/PEM/key material are excluded from Git and Docker build context as an additional
guard; the deployment inventory contains placeholders only.

The final images were rebuilt and complete Production/database smoke passed
again. An initial half-close implementation passed native Node but stalled behind
Podman's TCP port forwarder. Final rejection cleanup reads/discards through the
existing backpressured stream for at most 32 MiB or one second, retains a 64 KiB
queue and then completes HTTP normally. Native repeated/batched/chunked requests
and **60/60 actual Linux-image requests through the published port pass without
resets or timeouts**. Input beyond that cleanup budget is closed rather than
drained indefinitely. Separate `plan00021-finite-discard-*`,
`plan00021-browser-final-*` and `plan00021-linux-body-stress` logs retain results;
the earlier failed half-close log is retained separately. These tests exercise the served build;
they do not assert that the owner has configured Sliplane or GitHub.

### Code-health review

Pinned jscpd 5.4.1 and unchanged configuration
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`
measure the same Windows application/tooling scopes before and after the task.
**Application health declines from 92.8 to 92.1** after the required HTTP fix.
Its dead-code heuristic score declines 91.6 to 85.9, measured share 0.4% to 1.3%
and findings two to three. The added `node-request.ts` is called directly by the
Nitro entry, which the analyzer already misclassifies as unused. This helper is
retained to isolate/test backpressure and the bounded 413 response lifecycle; its
actual runtime use is proved by real HTTP, rebuilt Nitro and image smoke tests.
Duplication improves **0.75325% to 0.71715%**, with unchanged **145 duplicated lines /
15 clones** and unchanged maximum file complexity 75. The other two heuristic
findings remain the existing Nitro build/entry scripts.

**Tooling health declines from 57.0 to 49.6**, driven by the dead-code heuristic:
19 findings instead of eight, score 32.0 to 20.1 and measured dead-code share
14.4% to 20.1%. Every introduced finding was traced to an actual caller:
`release-prepare`, `release-validation` and `production-smoke` are workflow entry
points; `release-api`, `version` and `smoke-*` are imported by those commands;
`ssh-backup` and `verify-version-build` are documented operator/verification entry
points; `page-errors` is shared by the actual browser suites. The analyzer does not
fully recognize these `.mjs` imports or YAML/command entry points. Retaining these
cohesive modules preserves independently testable release policy, browser/runtime/
database boundaries and binary-safe operations. No unused implementation was found
and no scoring/exclusion changes were made to hide the decline.

After removing avoidable test/listener duplication, tooling duplication improves
**0.13010% to 0.11208%**, remains **12 lines / two clones**, and maximum file
complexity improves **233 to 229**. Complexity score improves 59.9 to 61.6, share
40.5% to 37.5%; application complexity score improves 88.9 to 89.4, share 7.2% to
6.8%. These advisory
scores do not replace lint/test evidence. Raw reports retain complete source
identities, tool/settings, scopes, clone locations and heuristic confidence;
unsupported formats and rounded measurements retain the existing limitations.

### Required owner evidence before production completion

Record concrete settings, commit IDs, run URLs and measurements here after setup;
keep secrets, credential hashes and private calendar content out of this record.

- [ ] Three actual Starter services, observed private hostnames, HTTPS domain,
  image/commit IDs, volume ownership, startup grace and narrow actual BFF trust.
- [ ] GitHub Actions PR permissions, protected `deploy`, required `Deploy readiness`,
  merge-commit policy, retained `main` and immutable tag controls are enforced.
- [ ] Preparation with GITHUB_TOKEN creates/reuses one PR, owner approves pending
  runs when requested, an intentional failure blocks merge and two successive
  main-to-deploy release PRs work. Main-only merges do not deploy.
- [ ] Exact deploy merge tag, same-commit retry and visible finalization failure
  recovery; actual running frontend/backend commits and visible release version.
- [ ] Internet cannot reach backend/PostgreSQL; edge login/CSRF/cookie/no-store/SSR
  work and sessions/data survive actual service replacement.
- [ ] Empty/repeated production startup creates zero accounts; intentional manual
  SSH/psql first-superadmin provisioning and initial UI administration succeed.
- [ ] Off-server backup storage/retention, isolated copied-key/PFX restore,
  certificate renewal, app/operator credential rotation and failed-release recovery
  are rehearsed using the actual SSH/container capabilities.
- [ ] Starter idle/peak RAM/CPU/disk/headroom, concurrent hashes/logins, maximum image
  workload, response times, OOM/restarts and 429/503 counts justify invitations.

Local simulated TLS/containers and API mocks do not attest to Sliplane's edge,
GitHub rules/token approvals, direct SSH capabilities or Starter capacity.
