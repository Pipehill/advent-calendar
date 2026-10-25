# Tooling review: plan 00010

Updated 2026-10-25. [Plan and acceptance](../../.agents/plans/00010-simplify-developer-tooling.md).
The owner prioritizes agent autonomy, easy local startup and lower maintenance;
small advisory-score declines are acceptable when tooling becomes smaller and easier.

## Ownership and disposition

Paths are relative to `tools/` unless rooted at `src/` or `.github/`.
Tests remain with the behavior they verify. Setup commands belong in
[developer setup](README.md), quality commands in [code quality](../../docs/code-quality.md),
and measurement commands in [advisory health](../quality/health.md).

| Component | Decision and reason |
| --- | --- |
| `backend/check.mjs`, `frontend/check.mjs` | Removed task dispatch. Native dotnet/MSBuild and frontend package scripts own sequencing. |
| `src/contract/Contract.proj`, API project | One Redocly/NSwag sequence emits both consumers before compilation; unconditional generation avoids stale/missing output. Independent builds use separate trees. |
| `development/dotnet.mjs`, `frontend/pnpm.mjs` | Retain private-executable selection and argument forwarding; no task dispatch. |
| `development/backend-tools.mjs`, `frontend-tools.mjs` and its tests | Update native restore/frozen-install callers; preserve private tools and read-only checks. |
| `development/environment.mjs`, `diagnostics.mjs`, `requirements.mjs`, `adapters.mjs`, `commands.mjs`, `environment.test.mjs` | Retain ordered installation/read-only diagnostics, platform preservation and shared requirements. Official installers already supply downloads; an environment-manager migration has no demonstrated saving. |
| `development/bootstrap.*`, `setup.*`, `doctor.*`, root `run-local.ps1`/`run-local.sh` | Retain thin platform entry points and missing-Node diagnostics. |
| `development/run-local.mjs` and tests, `local-frontend.mjs` and tests, `local-readiness.mjs` | Retain test gating, Vite ownership/signals, ports and host readiness; use native/package commands. Compose alone does not own these host processes. |
| `development/local-test-environment.mjs` and tests | Retain Podman endpoint/override adaptation for isolated Testcontainers. |
| `quality/run.mjs`, `local-settings.mjs` | Retain runtime/image/snapshot/evidence adapter; print the direct Docker/Podman argument array. |
| `quality/container.mjs`, `checks.mjs`, `snapshot.mjs` and tests | Retain selected offline checks, index-byte preservation, incoming links and failure reports pending equivalent replacements. |
| `quality/verify.mjs`, `pr-report.mjs` | Retain disposable-clone/receipt verification; overlay now respects saved deletions. |
| `quality/ci-comment.mjs` and tests | Retain combined report, stale base/head guards, pagination, size/error handling and credential isolation. |
| `quality/jscpd.mjs`, `install-analysis.mjs`, `mcp-client.mjs`, `health.mjs`, `health-report.mjs`, `health.test.mjs` | Official SDK owns transport/request/shutdown; existing measurement engine produces separate application/tooling scores plus the reference, with scope/stale-input tests. |
| `frontend/smoke.mjs`, `frontend/browser/smoke.test.mjs` | Retain separate browser behavior/JUnit reporting. |
| `src/frontend/build-nitro.mjs`, `server/entry.mjs` | Retain stable Nitro 2 packaging and disconnect cancellation; no verified supported replacement. |
| Application Dockerfiles, `.github/workflows/*.yml`, `compose.yaml`, pre-commit configuration | Update native/package callers; retain pins, service/data boundaries, main guard, artifact and publication behavior. |
| Quality Dockerfile/manifests/`puppeteer.json` | Retain exact offline CSharpier/.NET, SQLFluff, Biome, Chromium/Mermaid and official hooks. |

## Replacement decisions

- Keep pinned local NSwag 14.7.1: actual `Net100` generation works. A NuGet
  integration must still support standalone frontend generation and validation.
- Generic text/link replacements remain unproven for exact EOF/BOM, indexed LF
  versus batch CRLF, directory case, encoded paths and GitHub/HTML anchors.
  Official conflict/case/mixed-ending hooks already run. Replacements must pass
  existing fixtures before removal of custom checks.
- Mermaid CLI accepts Markdown, but the existing small fence mapping preserves
  source lines alongside actual rendering and temporary output.
- Adopt MCP SDK 1.32.2 after real handshake/refresh/statistics and malformed-protocol,
  schema, tool-error and missing-process checks. The client shrinks 92 → 46 lines;
  cost: 95 installed packages and 1,205 generated lockfile lines, with no new install
  entry point. Frozen installation/reuse and audit passed (zero reported vulnerabilities).
- Native snapshot fixtures confirm `checkout-index` applies CRLF attributes and
  `git archive` omits export-ignore files; retain blob reads to preserve candidate bytes.
- GitHub transport is small; any standard replacement must also remove installation
  or API lifecycle responsibility while retaining mocked publication tests.

## Verification record

Detailed commands/raw findings are in `quality-reports/00010-*` and
`quality-reports/health/`; they are execution artifacts rather than maintained prose.

| Check | Actual result |
| --- | --- |
| Clean checkout, path with spaces, no generated output | Locked restore, build/analyzers, 144 backend tests, publish, 21 frontend tests, TypeScript/Nitro packaging passed. Missing consumers regenerate; changed spec/settings propagate; invalid spec/settings, unavailable tool version and missing validator fail despite stale outputs. |
| Quality and hooks | Full lint, Linux invalid/corrected fixtures, 157 tooling tests (one additional Bash-only skip) and disposable-clone main/staging/link/configuration/receipt/image-lifecycle checks passed before this follow-up. |
| Follow-up | 160 tooling tests passed / 1 platform skip; full lint, SDK/MCP schema/snippet/refresh, grouped local/PR/CI rendering, locked analyzer installation/reuse and read-only doctor passed. |
| Setup/startup | Windows/Podman setup twice and doctor passed; both image builds, container/repeat-skip modes, actual Vite/custom port, occupied-port rejection, SIGINT cleanup and data preservation passed. Physical Ctrl+C was not exercised. |
| Browser | Production: 8 passed. Vite: 5 passed / 3 language-switch failures, reproduced on original commit; [stabilization TODO](../../.agents/plans/TODO.md) remains. |
| Unavailable | Docker, native Ubuntu/Debian/macOS and interactive IDE MCP evidence. Existing platform follow-ups remain open. |
| Cleanup | Disposable clones, verification containers/network, two owned Buildah containers and unused build stages removed; three older external build containers, current images and database/key volumes preserved. |

## Measurements

Compared with the original commit, non-test tool modules decrease 3,426 → 3,388
lines; tests increase 2,245 → 2,309 for the new scope feature. Total tool JavaScript
therefore grows by 26 lines. Documentation is over 600 lines smaller than the first
implementation. The dependency/lockfile cost above is additional; this is not a net
line reduction across every file. One authoritative command owner replaces repeated
setup/command/evidence prose; raw logs remain ignored artifacts.

| Comparable jscpd 5.4.1 scope | Original | Current | Clones / duplicated lines |
| --- | --- | --- | --- |
| Application (`src/`, including tests/build entry points) | 89.4 | 89.4 | 1 / 11 unchanged |
| Tooling (remaining authored source) | 49.9 | 49.6 | 0 / 0 unchanged |
| Whole repository reference | 64.6 | 64.3 | 1 / 11 unchanged |

Tooling/reference scores regressed as scope/reporting logic and behavior tests were
added. Reference analyzed lines are 12,236 → 12,262. No settings/exclusions/scoring
changed. Scope baselines were derived only after their committed source manifest
exactly matched the original saved baseline; its original bytes are archived in
`quality-reports/health/baseline-original-00010.json`. Current reports retain hashes,
coverage limitations and heuristic entry-point findings; scope changes are never
reported as improvements.
