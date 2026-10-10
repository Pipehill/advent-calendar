# Quality report analysis

The main agent owns corrections, verification and commits. Specialists diagnose
only and must not edit files or commit changes. Use the contributor
[report guide](../../docs/code-quality.md) to collect evidence.

Dispatch lint/configuration failures to [lint analysis](lint-analysis.md), Mermaid
and local links to [documentation analysis](documentation-analysis.md), and setup,
dependency, crashes or missing reports to [tool execution analysis](tool-execution-analysis.md).
Use the same instructions directly when delegation is unavailable. Never suppress
rules solely to obtain a passing result.

## Input contract

Provide the exact run URL/commit or staged snapshot, input.json, result.json,
MegaLinter summary and detailed logs, custom findings/logs, affected source, shared
configuration and versions.log. Match the revision and snapshot hashes to source
before diagnosing. Request missing evidence and state uncertainty instead of guessing.

## Output contract

Return concise findings grouped by cause. Each finding identifies the failing
check and rule/error identifier (or error text), a specific report/log as evidence,
repository file and line/column or diagram/link location, supported cause, remaining
uncertainty, smallest correction and pinned reproduction/verification command with
input scope. State "no source location" for execution failures.

The main agent verifies the evidence, applies corrections, reruns affected checks
and node tools/quality/run.mjs full, then reviews the diff before any authorized
commit. A different snapshot's report does not verify current changes.

See [verified example findings](verification.md) for direct-use diagnosis evidence.
