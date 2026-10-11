# Repository code health review

Reviewed on 2026-10-11, on `qa/code-health-review`, against main
`9c1f880b4966bf4377dc19409313ded77932d12e`. The initial baseline was captured at
`9a0469315324fb9f74c1d8f0f86963c9969d99b8`; the subsequent main update merged
PR #17's plan without changing authored source or analysis settings. This is the
result of a QA review; implementation did not use a new task plan.

## PR #17 evidence and dead-code verification

The [PR #17 Code Quality comment][comment] reports unchanged health 46.3,
maximum file complexity 122, zero duplication and five heuristic unused-file
findings. The PR adds planning documentation; its code measurements match the
main source reviewed here. It remains independent of this QA change.

Every reported unused file has a real caller:

| Reported file | Confidence | Verified use | Disposition |
| --- | --- | --- | --- |
| `checks.mjs` | 95% | Imported by `container.mjs`; `run.mjs` mounts both files into the quality container. | Retain: active repository checks. |
| `container.mjs` | 95% | `runChecks()` in `run.mjs` invokes `/quality/container.mjs` with the selected mode. | Retain: container entry point. |
| `ci-comment.mjs` | 70% | `.github/workflows/code-quality.yml` invokes it to publish the checked PR report; its tests import it. | Retain: CI entry point. |
| `pr-report.mjs` | 70% | Documented contributor command; invoked by `verify.mjs` and `health.test.mjs`. | Retain: verified Local QA generator. |
| `verify.mjs` | 95% | Documented integration-test entry point in the contributor and tooling guides. | Retain: disposable-clone enforcement suite. |

These are verified false positives, not five safe deletions. The raw findings and
confidence values remain visible. No analyzer exclusions, thresholds, scoring
weights, dependency pins or rules were changed to hide them. Internal exports
without external callers were narrowed in `jscpd.mjs`, `health.mjs` and the
extracted diagnostics module; their implementation remains in use.

## Concrete corrections

- Separate read-only readiness checks and command discovery from setup and runtime
  mutation. `environment.mjs` retains the ordered setup steps; `diagnostics.mjs`
  and `commands.mjs` own the separate responsibilities. Installation remains in
  platform adapters. Doctor tests copy only the prerequisite manifests they need,
  instead of recursively copying installed native analyzer dependencies.
- Separate saved/indexed snapshot creation, QA scope selection and source identity
  from image/container orchestration in `run.mjs`. The new `snapshot.mjs` handles
  saved tracked deletions without crashing full checks, preserves indexed contents
  in staged mode, and rejects nonregular source. Focused tests exercise preservation,
  deletion, inbound links and unsupported source paths.
- Split URL delimiters before decoding Markdown link targets. Previously a target
  such as `target%23part.md` was interpreted as file `target` with a fragment, and
  `%3F` was interpreted as a query delimiter. Encoded filenames and actual queries/
  fragments now remain distinct; container regressions exercise both delimiters.
- Extract metric rendering, identity validation, regression explanations and clone
  lists from the large health renderer. Share clone rendering, avoid unused row
  fields and string-search mutation of table headers, and explicitly report an
  unavailable comparison even when an execution failure lacks a reason string.
- Correct the contributor guide's required status name to `Code Quality Checks`,
  matching the workflow and [the actual PR #17 job][job]. Owner-managed merge
  settings remain a separate follow-up.

## Measurements and tradeoffs

Both source snapshots use jscpd 5.4.1 and the unchanged `.jscpd.json`, configuration
SHA-256 `043c883df49ada47a331de6608c7b79064f1789677657a459b3bb162793def8c`.
The baseline was captured before edits; the previous task's baseline was archived.
MCP tool schemas were negotiated, file-clone lookups and proposed snippets checked,
and scans refreshed before reading statistics.

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| Overall health | 46.3 | 48.3 | +2.0 |
| Complexity score | 59.3 | 65.4 | +6.1 |
| Complexity share | 47.4% | 36.0% | -11.4 pp |
| Maximum file complexity | 122 | 77 | -45 |
| Sum of CLI folder complexities | 791 | 817 | +26; regression |
| Duplication score | 90.1 | 90.4 | +0.3 |
| Duplication / duplicated lines / clones | 0% / 0 / 0 | 0% / 0 / 0 | Unchanged |
| Heuristic dead-code score | 17.8 | 18.3 | +0.5 |
| Heuristic dead-code share | 28.0% | 27.1% | -0.9 pp |
| Heuristic findings | 5 | 5 | Unchanged; verified callers above |
| Heuristic dead lines / analyzed JS lines | 931 / 3,325 | 946 / 3,486 | +15 / +161; verified false positives |
| Dead-code coverage | 95.8% | 96.0% | +0.2 pp |
| Measured files / lines | 20 / 3,469 | 24 / 3,630 | +4 / +161 |

**Raw summed complexity increases by 26**, despite the improved score and smaller
largest file. New regression scenarios and named helper boundaries contribute to
that total. The file-level improvements mainly reflect separation of responsibilities, not
removal of prerequisite or validation branches. Added tests and helper functions
also affect size normalization. The dead-code sub-score increase does not mean
dead code was removed. `health-report.mjs` rises from 71 to 77 as named helper
boundaries and missing-reason handling replace one large renderer; `checks.mjs`
rises from 60 to 61 for correct URL decoding; developer tests rise from 72 to 74
for their smaller manifest fixture. These increases are retained as tradeoffs.
Remaining hotspots include reporting, diagnostic checks and scenario-based tests;
their branches serve supported outcomes and do not justify deleting behavior.

Before source SHA-256:
`2e5b5319f5bcd94565d3df0bad7a162d2a70e58dc82d1956e5bf24a4215b5302`.
After source SHA-256:
`b6f950d261a6b2a4a93a746ea47ef4f7b2ed7928ae9d6ca73b69c4bd59052cf4`.
Raw reports, manifests, schema negotiation and CLI findings remain under ignored
`quality-reports/health/`. Final committed PR comparisons identify target/head and
candidate merge tree separately; the CI comment publishes those measurements.

## Scope and limitations

The target inventory contains 75 tracked files: 22 under `.agents`, 10 at the root,
three under `.github`, two under `docs`, 12 under `tools/development` and 26 under
`tools/quality`. Four new source files and this report bring the reviewed inventory
to 80 files, including 28 authored source files (24 measurable at current thresholds).

| Authored source file | Review result |
| --- | --- |
| `tools/development/adapters.mjs` | Retain explicit platform/package-manager branches, privilege failure propagation and managed Python recovery. |
| `tools/development/bootstrap.ps1` | Retain missing-Node setup/doctor boundary and persistent PATH guidance; syntax and Windows bootstrap regression checked. |
| `tools/development/bootstrap.sh` | Retain supported-distribution and missing-manager guards; Bash syntax and missing-Node regression checked in Linux. |
| `tools/development/doctor.ps1` | Retain small script-relative entry point. |
| `tools/development/doctor.sh` | Retain small script-relative entry point. |
| `tools/development/setup.ps1` | Retain small script-relative entry point. |
| `tools/development/setup.sh` | Retain small script-relative entry point. |
| `tools/development/requirements.mjs` | Retain centralized pins, package identifiers, image inputs and normalized dependency names. |
| `tools/development/environment.mjs` | Separate diagnosis/execution from ordered setup and runtime preparation. |
| `tools/development/commands.mjs` | New boundary for argument-array execution and executable discovery. |
| `tools/development/diagnostics.mjs` | New read-only readiness boundary; private Python discovery helper. |
| `tools/development/environment.test.mjs` | Narrow fixture copying; retain scenario branches needed to simulate missing tools and platform behavior. |
| `tools/quality/checks.mjs` | Correct encoded link delimiters; retain filename, text, heading and Markdown checks. Verified active import. |
| `tools/quality/container.mjs` | Add encoded-link regressions; retain check-only execution, offline tooling and failure reports. Verified entry point. |
| `tools/quality/run.mjs` | Extract snapshot responsibility; retain image lifecycle, input identity, offline containers and hook receipts. |
| `tools/quality/snapshot.mjs` | New snapshot/scope boundary; correct saved-deletion handling while preserving index inputs. |
| `tools/quality/snapshot.test.mjs` | New preservation, deletion, inbound-link and unsupported-source regressions, also run in CI. |
| `tools/quality/health-report.mjs` | Extract cohesive rendering/validation helpers; correct missing-reason handling and remove unused row data. |
| `tools/quality/health.mjs` | Narrow internal exports; retain immutable snapshots, identity checks and independent MCP/CLI evidence. |
| `tools/quality/health.test.mjs` | Add missing-reason regression; retain clone, protocol, unsupported-scope, merge-conflict and receipt tests. |
| `tools/quality/jscpd.mjs` | Make the internal wrapper path private; retain platform-pinned binary resolution and direct child lifecycle. |
| `tools/quality/mcp-client.mjs` | Retain protocol/schema validation, request timeouts, subprocess diagnostics and awaited shutdown. |
| `tools/quality/install-analysis.mjs` | Retain lock-hash/platform reuse and explicit installation/readiness failure. |
| `tools/quality/local-settings.mjs` | Retain environment precedence, CI isolation and platform-specific pre-commit discovery. |
| `tools/quality/ci-comment.mjs` | Retain tested outcomes, bounded reports, stale-identity guards and explicit publication failures. Verified CI entry point. |
| `tools/quality/ci-comment.test.mjs` | Retain success/failure, Unicode limits, bot ownership, pagination and stale base/head regressions. |
| `tools/quality/pr-report.mjs` | Retain machine/tree/parent verification, stale body removal and separate Local QA evidence. Verified contributor entry point. |
| `tools/quality/verify.mjs` | Retain ordered disposable-clone scenarios and preservation assertions. Verified integration-test entry point. |

| Remaining inventory | Review result |
| --- | --- |
| `.agents/**` (22 files) and `AGENTS.md` | Existing rules, skills, plans and verification records retain their scope/status. The newly merged calendar plan was reviewed as future work. Markdown, links and applicable diagrams checked; no plan created or changed. |
| Root `README.md`, `docs/architecture.md`, `docs/code-quality.md` | Product/architecture separation retained; contributor status name corrected against actual CI. Four architecture diagrams checked. |
| `tools/development/{README,verification}.md` | Responsibility boundaries documented; existing platform history/deferred onboarding retained. |
| `tools/quality/{README,health,health-verification}.md`, `analysis/README.md`, this report | Tool commands, caller evidence, measurement limitations and prior verification history checked; snapshot boundary and review linked. |
| `.editorconfig`, `.gitattributes`, `.gitignore` | Existing text/line-ending, binary and ignored-cache policies retained. |
| `.jscpd.json`, `.markdownlint.json`, `.mega-linter.yml`, `.yamllint.yml` | Shared analyzer/linter scope and settings retained; no scoring or exclusion changes. |
| `.pre-commit-config.yaml` | Existing main guard and staged-quality contract retained and integration-tested. |
| `.github/{CODEOWNERS,pull_request_template.md,workflows/code-quality.yml}` | Ownership/template retained; new snapshot regressions added to existing CI checks. Immutable action pins retained. |
| `tools/quality/Dockerfile`, package manifests/lockfiles in `tools/quality` and `analysis`, both requirements files, `puppeteer.json` | Existing image/tool pins, patched override, separate analyzer package and browser configuration retained and validated by current checks. |

The review inventories every tracked file and each newly authored file. Existing
JavaScript, PowerShell and Bash source was checked for responsibility boundaries,
entry points, error handling, preservation guarantees and test coverage. Prose and
configuration were checked for consistency, filenames, links, diagrams and the
shared lint rules. Dependency manifests/lockfiles retain their existing pins;
dependency code and ignored caches/reports are outside authored-source review.

There is no application, API contract, SQL, or frontend/backend build to analyze
yet. The proposed calendar feature in PR #17 was not implemented here. Small shell
launchers below the analyzer's minimum size still belong to the manual inventory.
Dead-code analysis covers supported inputs only; unsupported dimensions are n/a.
The complexity CLI ranks hotspots and can truncate its list; per-file decreases
and rounded scores do not establish lower algorithmic complexity or correctness.
Native macOS/Linux onboarding and an interactive IDE MCP connection remain outside
the available platform evidence.

## Verification

Verification on Windows x64 used Node 24.14.0, Git 2.55.0, Python 3.14.8,
pre-commit 4.6.2, Podman 6.0.2 and jscpd 5.4.1. Linux x64 musl checks used the
existing pinned quality image with its bundled Node 26.5.1 runtime exception.

| Check | Result |
| --- | --- |
| Windows regression suite | 34 passed, one Bash-only test skipped; no failures. |
| Linux container regression suite | 34 passed, one Windows-only test skipped; no failures. |
| Focused repository checker regressions | Passed, including encoded `#`/`?` targets with real query/fragment delimiters. |
| Whole working-tree MegaLinter and custom checks | Passed; source remained unchanged. |
| Developer doctor | Passed with Node 24 and the saved runtime without an override; hook/settings hashes unchanged. |
| Linux analyzer doctor, Bash syntax and JavaScript syntax | Passed against the disposable container source copy. |
| PowerShell syntax | Passed for all three scripts. |
| Disposable-clone integration verifier | All 11 scenarios passed, including main guard, partial staging, hook receipts, invalid/corrected inputs and stale reports. |
| Development health comparison and diff whitespace | Passed; values and limitations recorded above. |

The integration verifier caught a missing `splitGitPaths` import during extraction;
the import was restored and the complete suite passed on rerun. Earlier EOF formatting
diagnostics were corrected explicitly. No failure was suppressed. Detailed local
logs are retained under ignored `quality-reports/code-health-review/` and
`quality-reports/verification/`. The host's global Node 20 installation was preserved;
verification selected the existing isolated Node 24 installation in the test process.

Reproduction uses the selected Node 24 and the existing pinned quality image:

```text
node --test tools/development/environment.test.mjs tools/quality/*.test.mjs
node tools/quality/run.mjs test
node tools/quality/run.mjs full
node tools/development/environment.mjs doctor
node tools/quality/verify.mjs
node tools/quality/health.mjs compare
git diff --check
```

After committing with hooks, fetch the current target and regenerate
`node tools/quality/health.mjs pr origin/main HEAD` and
`node tools/quality/pr-report.mjs`. Matching Local QA belongs in the PR body;
Code health belongs in the existing Actions comment.

[comment]: https://github.com/Pipehill/advent-calendar/pull/17#issuecomment-6109875182
[job]: https://github.com/Pipehill/advent-calendar/actions/runs/38146085001/job/114489620721
