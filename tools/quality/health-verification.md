# Code health verification

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
