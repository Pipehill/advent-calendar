# Quality verification during development

Read [advisory code health](../../tools/quality/health.md) for commands, measurement
scope, MCP setup and limitations. Use the pinned repository tools; all analysis is
check-only. Quality measurements supplement relevant tests and review.

## Markdown-only exception

For work that changes only regular `.md` files, including plans, skip automatic
lint, tests and advisory health measurements. Do not capture a baseline or run
the required sequence below solely for Markdown edits. Follow the scope and
reporting policy in [code quality](../../docs/code-quality.md#markdown-only-changes).
Mixed code/configuration changes still require the normal checks, even when the
latest commit contains only Markdown. Explicitly requested verification and
manual CI dispatch remain available. The protected-branch guard still applies.

## Test readability

- All automated tests follow Given/When/Then, including backend C# tests and
  JavaScript tooling tests in `.mjs` files. Use explicit `// Given`, `// When`,
  and `// Then` comments with short scenario-specific explanations, separated by
  blank lines: prepare the scenario, perform the action, then verify its outcome.
- Give each test a readable sentence describing its condition, action, and
  expected observable behavior: `Given ..., When ..., Then ...`. In xUnit,
  set `DisplayName` on every `[Fact]` and `[Theory]` so runners display that
  sentence; keep method names descriptive. Use the same sentence format for
  Node test descriptions, including a meaningful case label for parameterized
  inputs. Theory arguments may supplement the shared display name.
- Keep one behavior per test. Split unrelated actions and outcomes into separate
  tests; use theories or parameterized cases for the same behavior across inputs.
  A lifecycle scenario can contain multiple steps when those steps are necessary
  to verify one outcome, with each transition clearly identified.
- Store successful operation results in the When phase and assert in Then.
  For expected exceptions, prepare an action delegate in When and execute it
  with the framework's exception assertion in Then.
- Keep setup and cleanup in fixtures or small clearly named helpers when useful.
  Helpers must not hide the behavior being tested. Preserve existing coverage
  when reorganizing tests, including failure cases and isolation checks.

## Required sequence

1. Before coding, capture `node tools/quality/health.mjs baseline` on saved source.
   Preserve existing baselines; archive them explicitly before another task. If
   tooling is unavailable, record the missing evidence and remedy. When introducing
   these tools, measure the unmodified base tree under the new shared configuration.
2. Use MCP `check_duplication` for substantial proposed snippets and
   `get_file_clones` when investigating duplication. After saves, call
   `check_current_directory` before `get_statistics`; statistics describe the last
   scan. Verify the tool list, schemas and results before relying on them.
3. After meaningful edits, run targeted lint, relevant tests and necessary type/build
   checks on saved working-tree source using existing check-only tools and shared
   configuration. Staging incomplete edits is unnecessary. Broaden checks to
   affected consumers when integration boundaries change, and run
   `node tools/quality/run.mjs full` when shared quality configuration/tooling changes
   or an equivalent targeted check is unavailable. A full lint run is not required
   for every iteration. Keep required commit hooks enabled; hook verification and
   receipts still describe staged source.
4. Before reporting completion, run `node tools/quality/run.mjs full`,
   `node tools/quality/health.mjs compare`, and all required tests/builds on the
   final saved inputs. Preserve required security and migration verification;
   targeted iteration checks do not replace full final or PR verification.
   Explain metric regressions, remaining findings, supported dimensions, missing
   evidence and measurement limitations.
   Keep actual old/new values and deltas, duplication percentages, absolute clone/
   line counts, scope, input identity, tool version and configuration with reports.
5. Before the first push/PR publication and before pushing any later PR update,
   perform the pre-publication review below. Regenerate it after every head/base
   change. GitHub Actions publishes Code health in the same comment as MegaLinter;
   the PR body retains Description and Local QA. Keep stale/conflicting evidence
   unavailable. Use the compact comment layout: commit identity above metrics,
   separate complexity and dead-code findings tables, and detailed explanations
   and limitations in report artifacts. Preserve the description when updating
   generated sections; these commands do not authorize publishing a PR.

## Pre-publication regression review

Run this review automatically without waiting for the user to request a PR review.
It applies to every code/configuration PR, including direct fixes outside a plan
and updates whose latest commit contains only Markdown. Only a completely
Markdown-only PR receives the shared exception.

1. Finish edits and required verification, then commit with hooks enabled. Rebuild
   and rerun affected tests after any subsequent source cleanup, including imports;
   earlier build output does not verify the final saved source.
2. Fetch the actual PR target and run
   `node tools/quality/health.mjs pr <target-ref> HEAD` on the final committed head,
   using `origin/main` for the usual target. Measure application, tooling and the
   whole-repository reference with identical analyzer version, settings, scope and
   platform for both sides. Do not compare Windows absolute scores with Linux ones.
3. Read the comparison and raw findings before publishing. Inspect every regressed
   metric independently: overall health, dimension scores/shares, duplication
   percentage, absolute duplicated lines/clones, complexity hotspots and heuristic
   dead-code findings. A better overall score must not hide a contributing decline;
   a lower percentage must not hide growing absolute counts. Missing/failed or
   mismatched evidence remains unavailable and requires investigation.
4. Trace introduced regressions to changed source, verify callers and heuristic
   findings, and correct avoidable duplication, complexity or unused code within
   the agreed architecture. Preserve behavior and test coverage. Do not accept a
   regression merely because tests pass, more coverage was added, or the number
   seems small. Do not change exclusions, scoring or test names solely to improve
   metrics. Split growing test suites by behavior when this improves maintenance.
   Record concrete behavior-driven tradeoffs only when the remaining
   increase is necessary after investigating reasonable corrections.
5. After corrections, repeat relevant tests/builds, full final quality checks and
   committed-head comparison. Continue until no avoidable regressions remain;
   do not leave them for the user's PR review. Verify target/head identities and
   regenerate Local QA with `node tools/quality/pr-report.mjs` before publishing.
   After publication, inspect CI and its health evidence, resolve new failures or
   regressions, and repeat the review for any further correction.

This is required agent review and corrective work. Scores remain advisory, with
no numeric minimum, automatic score-based merge gate or new user-approval step.

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

The owner approved separate application/tooling views on 2026-10-25. Use the scope
definitions in [advisory health](../../tools/quality/health.md#whole-codebase-scope-and-limitations);
preserve the whole-repository reference in raw artifacts and compare identical
scopes/settings. Reports show only application and tooling sections.
Prefer lower maintenance and easier autonomous execution; a modest advisory score
decline is acceptable when that tradeoff is supported by concrete evidence.

## Container artifact cleanup

- Clean up container artifacts created by agent builds and verification before
  reporting completion. Record the initial inventory when starting container work
  so newly created artifacts can be identified.
- Use disposable containers with automatic removal where supported. After builds,
  inspect for abandoned build containers, untagged intermediate images and obsolete
  project test/quality images; successful commands can still leave build artifacts.
- Remove only artifacts whose project ownership and lack of active use have been
  verified. Check running, stopped and external build containers. Preserve current
  application images and required pinned base/tool images. Remove intermediate
  build cache when it is no longer needed or the user requests artifact cleanup.
- Never delete database volumes, unrelated images or active build state as cleanup.
  Avoid global system/image pruning and forced image removal. Prefer explicit IDs
  or project labels; report artifacts that cannot safely be attributed or removed.

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
