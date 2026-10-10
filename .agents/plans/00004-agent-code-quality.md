# 00004: Code quality verification during agent development

Status: Not implemented

Last updated: 2026-10-11

Implementation type: qa

## Overview

Give coding agents repeatable quality feedback while they develop this project.
Retain MegaLinter as the linter orchestrator, extend its coverage when new languages
are adopted, and add jscpd's built-in MCP server for interactive duplication checks.
Compare measurements before and after changes so agents can explain whether the
measured quality improved, stayed unchanged, or deteriorated.

The measurements are advisory. Existing lint failures continue to block as before.
Provide concrete Codex MCP setup and generic stdio guidance for other clients.
Include whole-codebase before/after measurements in PR descriptions so reviewers
can see the quality and complexity impact of merging a change. This plan does not
implement the tooling.

## Requirements

1. Add shared agent instructions requiring quality verification during coding,
   including baseline capture, checks after meaningful changes, and a final
   comparison before reporting completion. Keep detailed instructions under
   `.agents` and discoverable from its overview.
2. Continue using MegaLinter and shared local/CI rules. When a new programming
   language is introduced, add and configure its applicable linters in the same
   change, including local execution, CI coverage, and relevant verification.
   Do not enable placeholder checks for application languages before inputs exist.
3. Provide jscpd's built-in MCP integration so agents can inspect proposed snippets,
   locate existing duplicated code, refresh the scan after editing, and compare
   duplication measurements before and after the task.
4. Report the actual metrics, deltas, affected files, and measurement limitations.
   A lower duplication percentage alone must not conceal an increase in duplicated
   lines or clones. Quality measurements supplement relevant tests and review.
5. Use reproducible tool versions and scan settings. Preserve the baseline's
   identity, measured source scope, configuration, and tool version with reports.
   Distinguish an unavailable or stale measurement from an unchanged result.
6. Cover current authored code, initially including the existing quality scripts.
   Document exclusions for generated output, dependencies, caches, reports, and
   other inputs outside authored-code analysis. Preserve the generated-code policy
   in the [API contract rules](../rules/api-contracts.md).
7. Keep analysis check-only. Refactor based on specific findings and applicable
   architecture boundaries; do not suppress findings or change scoring options
   solely to claim improvement.
8. Make local installation and diagnosis work with the Windows, macOS, and Linux
   onboarding scope established in plan 00003. New jscpd prerequisites must be
   integrated with setup and doctor when those scripts are available.
9. Preserve existing staged snapshot behavior, branch protection, local QA receipt
   semantics, full PR validation, and report publishing. MCP feedback during editing
   describes the working tree and must not be presented as staged hook evidence.
10. Compare duplication through MCP and health-score, complexity, and supported
    dead-code findings through CLI reports. Keep these measurements advisory;
    do not introduce new jscpd score or duplication gates in hooks or CI.
11. Supply a verified Codex MCP configuration example and generic stdio launch
    guidance. Other client-specific configuration is outside this task's scope.
12. Give agents a documented way to run applicable lint checks on the saved working
    tree during development using the same rules as hooks/CI. Do not require staging
    incomplete edits solely to obtain development feedback.
13. Add a `Code health` section to PR descriptions immediately after `Description`
    and before `Local QA`. Include old and new values, numeric deltas, and colored
    status indicators for overall health and related duplication, complexity, and
    supported dead-code measurements.
14. Measure the complete authored codebase using the agreed exclusions, not only
    changed files. Compare the target branch before merging with the candidate
    merged result, identifying the base commit, PR head, and measured result tree.
    Keep this PR comparison distinct from the development-session baseline.
15. Make improvements, unchanged values, regressions, mixed results, and unavailable
    measurements clear in text as well as color. Highlight an overall decline and
    the contributing metric regressions; do not conceal them behind a better metric.
16. State in the PR section that complexity can legitimately increase to support
    required behavior. Explain measured regressions and tradeoffs for reviewers.
    Scores and their colored indicators must not create a merge-blocking check,
    required approval, or mandatory minimum score.
17. Refresh the PR comparison when the PR head or target base changes. Missing,
    stale, conflicting, or noncomparable measurements must be visible as unavailable
    or incomplete, without inventing values or presenting them as passing evidence.

## Outstanding questions

None.

## Implementation details and work order

### Confirmed decisions and repository context

- The user selected implementation type `qa`. Planning uses
  `plan/agent-code-quality`; a separately requested planning PR uses `[PLAN]:`.
- MegaLinter remains the chosen linter orchestrator and gains language coverage
  as the corresponding authored code is introduced.
- jscpd must be available through its built-in MCP server for development-time
  verification. The user selected duplication through MCP and health-score,
  complexity, and dead-code analysis through CLI. These are advisory before/after
  measurements; existing lint enforcement remains unchanged. No new jscpd gate
  or mandatory score threshold is part of this task.
- Provide concrete Codex setup plus generic stdio guidance. Other client-specific
  integrations are outside scope.
- The user requested whole-codebase old/new measurements in the PR description,
  between `Description` and `Local QA`, with both numbers and colors. The section
  informs reviewers about merge impact; legitimate added complexity is allowed
  and the measurements remain advisory even when they visibly deteriorate.
- [Official OpenAI MCP documentation][codex-mcp] defines Codex stdio servers in
  `[mcp_servers.<name>]` TOML tables with `command`, `args`, and optional `cwd`.
  Provide a configuration example that launches the pinned repository command.
  Account for [trusted project configuration][codex-config] when documenting
  `.codex/config.toml`; do not treat a generic client's `.mcp.json` as Codex setup.
  Keep machine-specific absolute paths in local configuration or generated examples.
- Current `.mega-linter.yml` enables Markdown, YAML, JSON, and GitHub Actions
  linters. `COPYPASTE_JSCPD` is not enabled. Ordinary staged checks invoke the
  corresponding underlying tools through `tools/quality/container.mjs`.
- The quality image is digest-pinned to MegaLinter documentation 10.1.0. Its
  [jscpd descriptor][megalinter-jscpd] documents 5.0.16; verify the actual binary
  during implementation rather than assuming that it supports newer features.
- [jscpd's agent documentation][jscpd-agents] describes stdio MCP startup with
  `jscpd --mcp`. `check_duplication` inspects snippets, `get_file_clones` locates
  file clones, `get_statistics` reads the last scan, and
  `check_current_directory` refreshes that scan. Validate the pinned server's
  negotiated tool list and returned schema before using them in a comparison.
- [Health analysis][jscpd-health] is a CLI capability from 5.3.0. It combines
  duplication, complexity, and supported dead-code measurements; unsupported
  dimensions are unavailable, not evidence of clean code. The MCP documentation
  does not establish an equivalent health tool. Use explicit CLI
  reports alongside MCP measurements. Treat scores as indicators of measured
  properties, not proof of correctness or a universal maintainability grade.
- [The current upstream changelog][jscpd-changelog] lists 5.4.1 on 2026-10-11.
  Recheck supported compatible releases when implementing and pin the selected
  version. MCP, CLI, and any enabled MegaLinter copy/paste check must use compatible
  settings and documented version alignment.
- Plan 00003 has already been assigned on `plan/developer-setup-doctor` and is
  available in [PR #11][setup-plan-pr]. It is not on this plan's main-based branch.
  Number 00004 avoids reusing that assignment. Integrate the plans before depending
  on repository-relative paths or implementing setup/doctor changes; do not merge
  the other PR implicitly.

### PR code health reporting

Add `## Code health` to `.github/pull_request_template.md` and extend
`tools/quality/pr-report.mjs` to populate it while preserving `Description` and
the separate verified `Local QA` section. Provide an explicit unavailable state
in the template for PRs without matching measurements.

Compare the current target-branch tree with the candidate merge tree using the
same pinned analyzer, configuration, scoring dimensions, and authored-code scope.
Create the candidate in a disposable checkout or use a verified CI merge tree;
do not merge into or change the developer's working tree to generate the report.
If a merge cannot be formed, report that the comparison is unavailable. Identify
the target commit, PR head, candidate tree, tool/configuration identity, and scope
with the evidence so reviewers can tell which merge was measured. A branch-head
comparison alone cannot represent the merge result when the target has advanced.

Use a compact table with `Metric`, `Before merge`, `After merge`, `Change`, and
`Assessment` columns. Include overall code health, relevant sub-scores, duplication
percentage and absolute clone/line counts, complexity measurements/hotspots, and
supported dead-code measurements. Include analyzed file/line totals to explain
size changes and disclose the exclusions defining the whole-codebase measurement.
Show `n/a` with a reason for unsupported or missing dimensions. Label units and
percentage-point changes, and avoid rounding that hides a measured decline.

Use colored indicators together with plain labels: green `Improved`, red
`Regressed`, yellow `Unchanged` or `Mixed`, and neutral `Unavailable`. Interpret
each metric in its own direction: higher health/sub-scores are better, while
more duplicated code or higher measured complexity is worse. Show individual
regressions even if the overall score improves. Summarize an overall decline and
the metrics contributing to it in prose; explain intentional added complexity
instead of hiding or blocking it.

Include a short advisory note such as:

> These measurements support review and do not block merging. Required behavior
> can legitimately increase complexity; review the changes and their rationale.

Keep the generated comparison tied to the current PR head and target base.
Document regeneration during PR creation and updates, including after changes
to the target branch. Health-report availability is separate from local hook
verification: a missing health comparison cannot fabricate or invalidate an
otherwise valid `Local QA` receipt. Retain detailed machine-readable reports in
the ignored quality-report directory.

### Planned work steps

- [x] Clarify enforcement, metrics, and client scope with the user.
- [ ] Inventory authored-code scope, existing tool versions, report contracts,
  and the available setup/doctor implementation. Verify current jscpd capabilities
  with its CLI and MCP handshake using disposable fixtures.
- [ ] Define shared jscpd configuration and dependency pins. Ensure the launch path
  works on supported platforms and does not download an unpinned release every
  time an agent starts a scan. Use [official installation guidance][jscpd-install].
- [ ] Add a repository launch command for the built-in stdio MCP server, with
  repository path resolution and shared scan settings. Keep stdout reserved for
  protocol traffic and diagnostics separate. Document the agreed client setup,
  server lifecycle, refresh behavior, and failure remedies.
- [ ] Document and connect development-time lint commands against the saved working
  tree. Reuse the existing full-check command initially; extend applicable language
  coverage and any scoped commands with the same configuration when inputs exist.
  Agent instructions must call the relevant checks after meaningful edits and
  before completion while preserving the separate staged verification boundary.
- [ ] Add repeatable baseline and comparison commands under `tools/quality`.
  Capture measurements before the task's edits, rescan saved source afterwards,
  and produce machine-readable evidence and a concise comparison. Keep reports
  ignored by Git and identify both inputs. Preserve existing edits and index state.
  Label whether each metric improved, was unchanged, or regressed, using its actual
  direction; show raw values alongside the overall score and explanations.
  Mark comparisons invalid when versions or measurement settings differ; changed
  source is expected, changed exclusions or scoring dimensions require explanation.
- [ ] Add separate CLI reports for health-score, complexity, and dead-code findings
  with the same version and authored-code scope as the duplication measurements.
  Include overall score, available sub-scores, concrete findings, and deltas in
  the comparison. Report unsupported dimensions and confidence limitations.
  Keep the measurements advisory and preserve existing main/staged/CI enforcement.
  Do not enable MegaLinter's copy/paste checker as a new blocking gate under this
  plan; if used for reporting, verify that its findings remain advisory.
- [ ] Add whole-codebase PR comparison generation using the target base and
  candidate merged tree. Extend `.github/pull_request_template.md` and
  `tools/quality/pr-report.mjs` with the `Code health` section, numeric/color table,
  evidence identity, unavailable states, and advisory note described above.
  Document regenerating the section for each relevant head/base update and
  preserve the existing description and local hook evidence generation.
- [ ] Extend agent instructions with the development verification sequence and
  findings contract. Update `.agents/README.md`, applicable rules, and
  `.agents/skills/implement-plan/SKILL.md` so implementation work discovers the
  checks. Explain regressions, fixes, remaining findings, and missing evidence.
  Keep agent workflow material out of the root README.
- [ ] Add the maintenance rule under `.agents/rules`: introducing a language
  requires updating MegaLinter and local lint coverage in the same change.
  Update `docs/code-quality.md` and `tools/quality/README.md` with developer-facing
  commands, scope, diagnostics, and the selected quality policy.
- [ ] Integrate jscpd installation/version checks and readiness diagnostics into
  plan 00003's setup/doctor tooling. Verify protocol startup and the configured
  repository scope as well as executable presence.
  If plan 00003 is not yet implemented, record that prerequisite and coordinate
  implementation order rather than silently implementing the entire onboarding
  plan as part of this task.
- [ ] Verify improvements, regressions, and execution failures with disposable
  fixtures and supported-platform checks; update plan status and index only after
  the selected requirements are implemented and verified.

## Verification

- Introduce a copied block, check its snippet through MCP, and confirm the report
  identifies the matching file and location. Refresh after saving and confirm
  statistics change; refactor and verify the new duplication is removed.
- Demonstrate a worse, unchanged, and improved before/after comparison using the
  same tool and settings. Verify absolute clone/line counts are reported alongside
  percentages and explain changes attributable to scope or project size.
- Test stale scans, changed configuration/version, missing executable, failed
  protocol initialization, invalid tool results, and unsupported/empty input.
  None may be reported as a verified improvement or a successful quality check.
- Verify snapshots and comparisons preserve partially staged work and unrelated
  edits. Distinguish working-tree MCP results from staged hook receipts.
- Verify working-tree lint catches an invalid saved, unstaged fixture and passes
  after correction, using the same rule settings as the corresponding hook/CI check.
- Verify exclusions and source coverage with actual included/excluded fixtures.
  Test a clone between an edited file and unchanged code so changed-file-only
  scanning cannot silently miss cross-file duplication.
- Verify a newly introduced language's applicable linter runs locally and in CI,
  rejects an invalid fixture, and accepts a correction using shared configuration.
- Verify check-only execution, existing branch guard and receipt behavior, and
  full checks for documentation-only PR updates. Run repository quality checks.
- Verify jscpd setup and doctor checks on Windows, macOS, and supported Linux,
  including Codex MCP initialization and tool calls. Verify generic stdio launch
  instructions separately. Record actual client/platform evidence.
- Demonstrate health-score and complexity/dead-code before/after reporting with
  representative fixtures, including unsupported languages and uncertain dead-code
  findings. Missing dimensions or changed scoring inputs must remain visible.
- Verify a jscpd regression is reported without blocking a commit or PR on score
  grounds, while an existing lint violation still blocks as before. Verify agent
  instructions require analyzing and explaining the regression.
- Verify generated PR descriptions preserve section order: `Description`,
  `Code health`, then `Local QA`. Check before/after numbers, signed deltas, units,
  color indicators, text labels, advisory wording, and regression explanations.
- Verify the PR analysis includes unchanged authored code and new/deleted files,
  comparing the target branch with the actual candidate merge result. Test a PR
  whose target has advanced, a new PR head, conflicts, stale reports, and missing
  dimensions. Incorrect comparison identity must never display a valid improvement.
- Use improved, unchanged, regressed, and mixed-metric fixtures to verify colors
  and labels. Confirm that an overall health improvement does not hide worsening
  complexity, and a clearly lower health score remains prominent in the PR body.
- Verify PR generation retains valid local hook evidence when code health is
  unavailable, and reports a health decline without introducing a merge gate.
  Check that intentional complexity increases can be explained in the PR section.

[megalinter-jscpd]: https://megalinter.io/10.1.0/descriptors/copypaste_jscpd/
[jscpd-agents]: https://jscpd.dev/guides/agents
[jscpd-health]: https://jscpd.dev/guides/health
[jscpd-changelog]: https://jscpd.dev/project/changelog
[jscpd-install]: https://jscpd.dev/start/installation
[setup-plan-pr]: https://github.com/Pipehill/advent-calendar/pull/11
[codex-mcp]: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
[codex-config]: https://learn.chatgpt.com/docs/config-file/config-basic
