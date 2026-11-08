# Code health verification

## 2026-11-08 PR 43 regression corrections

The original recipient change at `c02766ce93e1e2512c6adb6db8fd5227732e370a`
added repeated form submission, field-error mapping, account options, calendar-row
metadata and security-lock test setup. Shared implementations now own those
mechanisms. Calendar browser scenarios are organized into recipient, creation/list,
editing and access test modules, retaining the same production-stack lifecycle.
All 12 original scenario blocks, including parameterized cases, were checked to
exist exactly once after extraction. No analyzer settings or exclusions changed.

| Metric | Main target | Original PR | Corrected saved source |
| --- | --- | --- | --- |
| Application health | 88.9 | 89.2 | 89.2 |
| Application duplication | 0.950370% | 1.309468% | 0.652377% |
| Application duplicated lines / clones | 117 / 12 | 169 / 17 | 84 / 10 |
| Application analyzed files / lines | 111 / 12311 | 114 / 12906 | 118 / 12876 |
| Tooling health | 48.0 | 45.7 | 53.5 |
| Tooling complexity share | 48.3% | 53.1% | 47.4% |
| Tooling heuristic dead-code share | 20.9% | 22.2% | 16.5% |
| Tooling duplication | 0.157604% | 0.155099% | 0.154500% |
| Tooling duplicated lines / clones | 12 / 2 | 12 / 2 | 12 / 2 |
| Tooling analyzed files / lines | 45 / 7614 | 45 / 7737 | 49 / 7767 |

Against the original PR, application duplication falls by 0.657092 percentage
points, 85 duplicated lines and seven clones; tooling health rises by 7.8.
Against target `5dde02421b70024fe03e8a143febd710fb19b8e9`, application duplication
falls by 0.297993 percentage points, 33 lines and two clones; tooling health rises
by 5.5. Application complexity share remains 12.3%, maximum file complexity 75,
and two heuristic findings remain. Tooling maximum file complexity remains 227
in the existing authentication suite; its seven heuristic findings remain.

The tooling score partly improves because actual browser tests now use the
standard `.test.mjs` module convention. The analyzer had classified the entire
437-line scenario registration module as unused despite its explicit import.
Its smaller shared fixture remains a 70%-confidence test-only-module finding.
This is a classification effect alongside the smaller behavior-specific modules,
not deletion of unreachable production code. Tooling complexity lines are 3681
versus target 3674: the lower share also reflects the larger denominator.
Dead-code coverage is 38.7% for application source and 96.3% for tooling;
unsupported/heuristic findings and rounded scores retain their normal limitations.

jscpd remains **5.4.1**, configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Original/corrected application input hashes are
`83a9326277332a975114e81f353044a8ad020d47c80aacdd0f4938401b72709f` /
`14337f3eef6eddb687d12463d04e4e09ded516d5a69d812bf8ba7ddd1568b617`;
tooling hashes are
`3a80227b2474323ca1fc4f0bbace44746e5d4dbc5261649c373e596f71ae4a18` /
`176cff227b5d04e532bf959a3fdb7a17c16091f8758997dc379b7b8a1c9adf4e`.
The original PR baseline, current comparison, whole-repository reference and
MCP schemas/refresh/statistics remain under ignored `quality-reports/health/`;
the prior target baseline is archived as `baseline-before-pr43-review-20261108`.

The independent CI failure in run `42474721269` occurred before lint:
`apk add chromium=155.0.8059.84-r0` could no longer resolve that exact package.
The ICU conflict was secondary solver output. Updating only the Chromium pin
to **156.0.8078.79-r0** built image
`localhost/advent-quality:313696a2437a6e4f52b5` successfully; Alpine replaced
English-only ICU data automatically. Offline repository Mermaid rendering passed
with that browser. Bundled Node is 26.5.1, covered by the existing quality-image
runtime exception; host Node is 24.20.0 on Windows x64 with Podman.
Exact Alpine pins still require maintenance when rolling package indexes replace
builds. Retaining a built dependency image by digest would address package
retention separately; this change does not add an image publication workflow.

## 2026-10-25 Markdown-only quality exception

The owner approved skipping automatic checks for plans and other Markdown-only
changes. The staged runner now classifies the index before resolving container
settings, and the three PR workflows classify the complete merge-base/head diff
before preparing tools. Explicit manual checks remain available. See the
[scope policy](../../docs/code-quality.md#markdown-only-changes).

On Windows with Node 24.20.0 and Podman, the 16 new scope/report tests and the
32 existing snapshot/comment tests passed. Coverage includes Markdown-only
additions/deletions/renames, a missing container runtime, partial staging, stale
receipt removal, code deletions and cross-extension renames, unsupported file
types, an advancing PR base, earlier code commits, manual dispatch and honest
skipped PR evidence. Full lint and repository checks passed after splitting one
overlong workflow command. Disposable-clone checks confirmed branch protection,
partial staging, receipt integrity, mixed-change lint/link enforcement and image
cleanup. The first clone predated that line-wrap fix; the affected configuration
scenario and remaining detached-checkout/missing-runtime scenarios passed when
rerun against final saved source. Command logs and the rerun selection/source
hash are retained under `quality-reports/markdown-skip/` and
`quality-reports/verification/`. GitHub-hosted skip behavior and native
macOS/Linux execution have not been observed in this change.

The baseline at `83c04843f3ea9d7fb7f531dac41f034a16f49fbf` was preserved before
editing source. jscpd 5.4.1 used unchanged configuration SHA-256
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
Application health stays 89.4 across the same 53 files and 6,412 lines, with one
clone, 11 duplicated lines and 0.1715533374922021% duplication. Tooling health
changes from 49.6 to 50.6, complexity score from 58.4 to 59.6 and dead-code score
from 22 to 22.8. Its scope grows from 39 files/5,848 lines to 41 files/6,153 lines;
zero clones and zero duplicated lines remain unchanged. The higher aggregate
scores include the added scope tests, not removal of the existing six heuristic
dead-code findings. Maximum complexity remains 94. Dead-code coverage is partial:
12.6% for application and 97.5% for tooling; script/import false positives remain.

MCP tool schemas, snippet results, refreshed scan and statistics are retained in
`quality-reports/markdown-skip/mcp.json`. Baseline/current/whole-repository raw
measurements and content identities are under `quality-reports/health/`. These
measurements describe saved working source, not passing staged or CI evidence.

## 2026-10-25 plan 00010 tooling simplification

Current measurements, false-positive entry points and platform limitations are in
the [tooling review](../development/tooling-review.md#measurements).
Earlier evidence below retains its original scope and dates.

## 2026-10-25 PR 26 quality image recovery

[CI run 40187781359](https://github.com/Pipehill/advent-calendar/actions/runs/40187781359)
for PR head `1f1804ca0e74ad1f358c968e201e2cef8f85cb7b` failed before linting.
APK exited 9 at `tools/quality/Dockerfile:17`: the stable Alpine v3.24 community
index no longer supplied `chromium=155.0.8059.39-r0`. The reported ICU conflict
was another dependency-resolution symptom of that unavailable version.

Inside the exact digest-pinned MegaLinter base, `apk policy chromium` reported
`155.0.8059.84-r0`. A simulated installation of that pin succeeded and selected
`icu-data-full` in place of `icu-data-en` automatically. Only the Chromium pin
and its documented version changed; no manual package removal was needed.

Windows with Node 24.20.0 and Podman successfully built
`localhost/advent-quality:2398a96fb94141df125d`. Both
`node tools/quality/run.mjs full` and `node tools/quality/run.mjs test` passed,
including Mermaid rendering and invalid/corrected language fixtures. The CI
comment, snapshot and development environment tests passed (72 passed, one
platform-specific test skipped). Logs are retained under ignored
`quality-reports/pr26-*.log`. The unchanged npm lockfile installation reported
three dependency audit findings (two high, one critical); this repair does not
establish that those dependencies are vulnerability-free.

Advisory jscpd 5.4.1 measurements are unchanged: health 64.6, complexity score
72.4, duplication 0.08989865969271003%, one clone and 11 duplicated lines across
92 measured files and 12,236 lines. The before/after source SHA-256 is
`22383cc2f340e0e2ab215ecd4d5c7368f34ea65ae632dbe853ebd80d5602a243`;
configuration SHA-256 is
`8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
These authored-source measurements exclude Dockerfiles and prose, and dead-code
coverage remains partial (52.9%). Raw evidence is in `quality-reports/health/`.

## 2026-10-18 PR 23 quality image recovery

[CI run 39123387404](https://github.com/Pipehill/advent-calendar/actions/runs/39123387404)
failed while building the quality image, before any lint ran. At
`tools/quality/Dockerfile:17`, APK could not satisfy `chromium=152.0.7977.82-r0`;
the official Alpine v3.24 community index only offered `155.0.8059.39-r0`.
The resulting ICU conflict was a dependency-resolution symptom, not a separate
requirement to remove packages manually. APK exited 9 and quality setup exited 1.

Verified current repository indexes inside the exact digest-pinned MegaLinter
base: Alpine 3.24.1 with stable v3.24 main/community sources, not edge. A simulated
single-pin update to `155.0.8059.39-r0` succeeded and automatically selected
`icu-data-full` in place of `icu-data-en`. The Dockerfile and documented Chromium
version were updated together; the base digest and existing lint rules remain.

On Windows with Podman, `node tools/quality/run.mjs setup` successfully rebuilt
image `localhost/advent-quality:203f28c4bae8fe10ca43` from the corrected inputs.
`node tools/quality/run.mjs full` and `node tools/quality/run.mjs test` passed,
including actual Mermaid rendering and valid/invalid checker fixtures. The npm
install in the new image reported zero vulnerabilities. This establishes Linux
container behavior; it does not clear pending native Linux/macOS host evidence.
The initial container inventory and exact CI excerpt, build logs and test logs
are recorded under ignored `quality-reports/pr-23-setup-diagnosis/`.

PR 23 also replaces its monolithic browser script with eight independently
isolated Node tests and a thin CLI. All eight scenarios and deliberate browser
startup failure propagation passed. The unchanged jscpd settings now report
overall health 56.4, compared with main 53.8 and initial PR head 53.2; the detailed
metrics and classification limitations are in
[frontend verification](../../src/frontend/verification.md#pr-23-quality-follow-up-2026-10-18).

## 2026-10-11 implementation evidence

The implementation branch is `qa/agent-code-quality`, based on main `e81e073`.
The pre-task baseline measures that committed source tree using jscpd 5.4.1 and
the new shared `.jscpd.json`: 14 measured files, 2,544 lines, zero clones/duplicated
lines and health 41.9. Raw reports identify the configuration and source hashes.

Windows x64 verification uses Node 24.14.0, Git 2.55.0 and the lockfile-installed
jscpd 5.4.1 native MSVC binary. Installation and repeat installation passed;
the latter reused the installed platform package. npm reported zero vulnerabilities.
Developer doctor passed every check with the explicit Node 24 PATH, including MCP
negotiation/tool schemas, refresh, authored scope and separate CLI reports.
The default system PATH still selects Node 20 and must be corrected by the developer
before doctor can attest to that terminal/IDE process.

Linux x64 musl container verification used the existing digest-pinned quality image
with its bundled Node 26.5.1 (the accepted quality-image runtime exception). The
source was mounted read-only and copied into a disposable container checkout.
Lockfile installation and repeat installation passed, including the Linux 5.4.1
platform package; npm reported zero vulnerabilities. All 28 applicable tests passed
with one Windows-specific bootstrap test skipped. The full MCP/CLI readiness command
passed. The image's bundled analyzer was measured as `cpd 5.0.16`, confirming it is
different from the separately pinned 5.4.1 binary. No copy/paste gate was enabled.

Disposable fixtures verify snippet matches and locations, clone lookup, stale
statistics before refresh, new copies after refresh and removal after refactoring.
Whole-codebase measurement finds clones against unchanged files, applies generated/
dependency exclusions and preserves partial staging, unstaged edits and unrelated
source. Comparisons exercise improvement, unchanged values, regression, mixed
results, changed tool/configuration/dimensions and empty inputs. Protocol tests
exercise failed initialization, invalid schemas/JSON, failed tools and a missing
executable. Supported findings retain confidence; unsupported dead code remains n/a.

PR fixtures use an advanced target, candidate merge tree, additions/deletions,
updated head and conflicts. Generated descriptions retain Description, Code health,
Local QA order, numeric old/new values, signed deltas, percentage-point units,
colored text labels and advisory wording. Valid synthetic local receipts in the
disposable fixtures survive unavailable health; mismatching receipts are rejected.
The actual hook verifier supplies separate real hook/receipt evidence.

The final Windows suite passed 28 applicable tests with the Bash-only bootstrap
test skipped. Saved-source lint initially caught Markdown heading/EOF formatting
and missing documentation targets; those were corrected and the complete MegaLinter
plus repository checks then passed with no findings. No rules were suppressed.

The development comparison reports health 41.9 → 46.2 (+4.3), with zero clones and
duplicated lines before and after. Results are mixed: complexity sub-score declined
60.1 → 59.3 and maximum file complexity rose 116 → 122 in developer environment
checks, which now diagnose/install the analyzer. The new reporting/measurement
modules also contribute measured complexity. Complexity share fell 49.1% → 47.7%,
but the size-adjusted sub-score still declined as code grew from 2,544 to 3,382
measured lines. The higher overall score partly reflects size normalization and
heuristic dead-code shares; it does not establish a correctness or maintainability
improvement. These regressions are retained and explained rather than gated or
hidden. Full raw reports remain in ignored `quality-reports/health/`.

The Windows disposable-clone integration verifier passed all eleven scenarios:
image reuse/cleanup, main branch protection, partial staging, real local hook
receipts/stale receipt rejection, line endings/binaries, invalid/corrected inputs,
renamed/deleted link targets, heading/anchor changes, shared configuration changes,
detached full checks and missing container runtime. The original index was preserved.
Analyzer scores were not added to hook enforcement.

The documented stdio launcher was initialized from an unrelated working directory
and passed refresh/statistics calls. Installed Codex CLI 0.162.0-alpha.17.2 accepted
the example's command/args/cwd values through temporary `-c` overrides and returned
the expected enabled stdio transport with `mcp get --json`; user configuration was
not changed. Interactive IDE reconnection remains outside this recorded evidence.

The npm MCP wrapper originally left a native child alive on Windows, locking a
temporary source directory. The launcher/client now start the installed native
binary directly and await its exit before cleanup. Repeated fixtures passed after
this correction. Reports preserve the heuristic limitation that this jscpd release
can misclassify `.mjs` imports and script/container entry points as dead code.

## Plan 00015 comparison (2026-11-01)

The saved-source comparison uses the unchanged jscpd **5.4.1** configuration
SHA-256 `8db8aa8fa36be20b014e5104f18362dd285bee0ba8f634e4501110eef8982478`.
The baseline is the clean synchronized `78c7b1c` source captured before edits;
the previous baseline is preserved as `baseline-before-00015-20261101`.
Application and tooling use the existing disjoint authored-source scopes and
identical settings. The whole-repository reference and full MCP schemas,
snippet/refresh/statistics and clone locations remain in raw ignored reports.

**Tooling health declined 52.3 to 48.0 (-4.3)**, despite application health
improving 86.8 to 88.9 (+2.1). Duplication increased in both scopes and remains
an explicit tradeoff:

| Metric | Application before / after | Tooling before / after |
| --- | --- | --- |
| Duplication percentage | 0.318566% / 0.950370% | 0.081444% / 0.157604% |
| Percentage-point delta | +0.631803 | +0.076160 |
| Clones / duplicated lines | 4 / 12; 32 / 117 | 1 / 2; 6 / 12 |
| Complexity score / share | 79.4 / 82.4; 15.7% / 12.8% | 54.6 / 55.4; 49.8% / 48.3% |
| Maximum file complexity | 75 / 75 | 226 / 227 |
| Heuristic findings | 2 / 2 | 6 / 7 |
| Dead-code analysis coverage | 34.5% / 38.4% | 96.1% / 96.3% |
| Analyzed files / lines | 93 / 111; 10045 / 12311 | 44 / 45; 7367 / 7614 |

The additional tooling finding marks `calendar-scenarios.mjs` unused at 70%
confidence. It is explicitly imported and registered by the production browser
suite; real executions confirm the call path. This is the known `.mjs` import
heuristic limitation and is retained visibly, without changing analyzer settings.
The scenario module keeps calendar tests separate while reusing the existing
isolated stack lifecycle. Its addition increases the heuristic dead-code share
17.2% to 20.9% and lowers that advisory score. Browser-harness complexity rises
by one for registration. Required explicit failure mocks contribute six duplicate
tooling lines. Existing script/container entry-point findings remain unchanged.

Application matches were inspected with MCP `get_file_clones`: explicit form
validation, structured field errors, duplicate-submission guards, route composition
and controller security attributes account for the new boilerplate. Retain these
visible boundaries rather than add generic form/controller machinery solely to
reduce a score. The newly unused static Card component was removed after confirming
it had no callers. Backend/API business operations remain in service/repository
layers. Duplication is below 1% of the application scope, but its absolute increase
is still recorded rather than described as an improvement.

Application source SHA-256 changes from
`ec9509726c3e0fbe46c46e5407c6868996aa9b6f3aad4ebce394163b09e89987` to
`78f50f64cf651a846a5baa0d825d63c2505bf580e2470d1f9bcd7695bf43a7e7`;
tooling changes from
`f6f4872417187e7c5356694014dd4136fb0443af0a8ca98c5b0cb5e2813153d8` to
`c5401077b52681dc37b2e11b9d01567c8ab195a17874d9c0cc8798e01b1c4530`.
Source identities, raw per-group/reference measurements and reports live under
`quality-reports/health/`; task-specific evidence uses `quality-reports/plan15-*`.
Generated files, dependencies and documentation remain outside authored-code
scoring. Unsupported/partial analysis is not evidence of absence of defects.

## Pending platform evidence

The owner explicitly deferred native macOS/Linux installation, repeat setup,
doctor and Codex client checks on 2026-10-11. This is an acceptance exception,
not evidence that those checks passed. Windows protocol checks use the repository
test client; interactive Codex IDE configuration/reconnection remains unverified.
Linux container evidence is recorded separately when run and does not establish
native host installation or IDE readiness.

Follow the [native platform follow-up rule](../../.agents/rules/development-quality.md#temporary-native-platform-follow-up).
Record OS/architecture, Node/jscpd versions, install/repeat-install results, MCP
handshake/snippet/refresh, doctor and quality/hook results. Fix failures and record
reruns before clearing each platform's follow-up.
