# Quality verification during development

Read [advisory code health](../../tools/quality/health.md) for commands, measurement
scope, MCP setup and limitations. Use the pinned repository tools; all analysis is
check-only. Quality measurements supplement relevant tests and review.

## Required sequence

1. Before coding, capture `node tools/quality/health.mjs baseline` on saved source.
   Preserve existing baselines; archive them explicitly before another task. If
   tooling is unavailable, record the missing evidence and remedy. When introducing
   these tools, measure the unmodified base tree under the new shared configuration.
2. Use MCP `check_duplication` for substantial proposed snippets and
   `get_file_clones` when investigating duplication. After saves, call
   `check_current_directory` before `get_statistics`; statistics describe the last
   scan. Verify the tool list, schemas and results before relying on them.
3. After meaningful edits, run applicable lint checks on saved working-tree source
   using `node tools/quality/run.mjs full`, and run relevant tests. Staging incomplete
   edits is unnecessary. Hook verification and receipts still describe staged source.
4. Before reporting completion, run `node tools/quality/health.mjs compare`, lint and
   relevant tests on the final saved inputs. Explain metric regressions, remaining
   findings, supported dimensions, missing evidence and measurement limitations.
   Keep actual old/new values and deltas, duplication percentages, absolute clone/
   line counts, scope, input identity, tool version and configuration with reports.
5. When a PR is authorized, fetch its target and regenerate the whole-codebase merge
   comparison and PR body using the documented commands after each head/base change.
   Place Code health after Description and before Local QA. Keep stale/conflicting
   evidence unavailable. Preserve the description and regression explanations when
   updating generated sections; these commands do not authorize publishing a PR.

An overall decline and contributing regressions must remain prominent even when
other metrics improve. Added complexity can support required behavior; document
that tradeoff. Dead-code analysis is heuristic: verify actual entry points/callers
and confidence before deleting code. Unsupported or missing dimensions are n/a,
not evidence of cleanliness. MCP measurements of working source are never local
hook receipts. A failed scan is unavailable, not an unchanged or improved result.

Refactor only concrete findings within architecture boundaries. Never suppress
findings or change exclusions/scoring solely to report improvement. Health scores
and colored indicators are advisory: no minimum score, merge gate or new approval
requirement applies. Existing lint failures continue to block as configured.

## Language and tool maintenance

When adopting a programming language, add/configure its applicable MegaLinter
linters and local staged/working-tree execution in the same change. Reuse shared
rules in CI; verify an invalid fixture fails and a corrected fixture passes both
paths. Do not enable placeholder application checks before inputs exist. Include
the language in authored-code scope and disclose unsupported analyzer dimensions.
Keep generated API code excluded according to the API contract rules.

Adopting/changing a prerequisite requires setup/doctor, shared requirements,
documentation and relevant verification updates in the same change. Pin versions
and lockfiles. MCP and CLI must use compatible versions/settings; the older
MegaLinter-bundled jscpd is not enabled as a new blocking check.

## Temporary native platform follow-up

On 2026-10-11 the owner deferred native macOS/Linux jscpd installation and client
verification. When these environments become available, run setup, repeat setup,
doctor, the MCP snippet/refresh sequence and the quality/hook workflow. Investigate
and fix installation/protocol failures; record OS, versions, errors, fixes and rerun
results in [health verification](../../tools/quality/health-verification.md) and
[developer verification](../../tools/development/verification.md). Record the
interactive Codex client separately from the test client's protocol evidence.
Remove this temporary follow-up only after both native platforms have evidence.
