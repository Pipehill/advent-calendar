# Code health verification

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
