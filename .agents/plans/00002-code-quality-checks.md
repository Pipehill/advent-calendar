# 00002: Enforce code quality before commits and PR merges

Status: Not implemented

Last updated: 2026-10-10

Implementation type: ci

## Overview

Establish local pre-commit checks and mandatory GitHub Actions checks for pull
requests into main. Keep MegaLinter with an explicitly limited set of linters,
run fast checks on staged files locally, and check the full repository in every
PR. Initially cover documentation and configuration; application type checking,
builds, and tests will be integrated when application code is introduced.
Define specialist agents that analyze failed MegaLinter reports and return
precise, actionable findings to the main agent responsible for fixes and commits.

This is a planning task. No hooks, linter configuration, workflows, repository
settings, or application scaffolding have been implemented by this plan.

## Requirements

1. Use MegaLinter with an explicit, limited linter selection and pre-commit for
   local commit hooks. Use GitHub Actions for PR execution.
2. Check staged contents before each commit for fast local feedback. Use shared
   underlying rules/configuration between the local checks and full PR checks;
   document any deliberate difference in execution scope.
3. Run full applicable repository checks for every PR targeting main, including
   documentation-only PRs and updates to an existing PR. Publish a stable MegaLinter
   quality status covering all agreed checks. Document that the owner will require
   this status to be green before normal merges to main in repository Settings,
   while retaining an emergency override. Do not modify merge rules in this task.
4. Establish linting and documentation/configuration checks for files that exist
   now. Include agent documentation and configuration in coverage. Do not exclude
   all hidden directories or create an application solely to enable future linters.
5. Defer frontend/BFF type checks, builds, Vitest, backend build/xUnit integration,
   OpenAPI generation/Redocly, SQL, and Dockerfile checks to application/setup and
   build work when their inputs exist. Preserve the already agreed toolchain in
   [architecture rules](../rules/architecture.md) and
   [API contract rules](../rules/api-contracts.md).
6. Pin compatible tool/action/container versions according to the existing
   version policy. Document local prerequisites, hook installation after clone,
   a reproducible manual full-check command, and troubleshooting.
7. Make the checks enforce failures and report useful file/line diagnostics.
   Verify enforcement with deliberately invalid input, a corrected run, and a
   real PR check. Keep the required check name stable and unambiguous.
8. Limit implementation to quality tooling, necessary baseline corrections, and
   documentation, including instructions for the owner's merge-gate setup. Preserve
   unrelated repository rules and product behavior.
9. Enable markdownlint, yamllint, jsonlint, actionlint, and whitespace checks, plus
   Mermaid rendering and repository-relative documentation link validation. Cover
   staged applicable inputs locally and all applicable repository inputs in CI.
10. Run local and CI checks without automatic fixes. Report failures and document
    explicit correction commands; do not change files or commit fixes implicitly.
11. Define specialist agents for MegaLinter report analysis under `.agents`.
    They must identify the failing check, exact file/location when available,
    violated rule, cause, and a concrete correction with a verification command.
    The main agent uses their findings to make fixes, verify them, and commit.
    Cover lint/configuration failures and Mermaid/local-link failures, as well as
    tool-execution failures that cannot be attributed to source violations.
12. Block direct local commits to main with a pre-commit branch check, including
    empty commits. Keep this branch-context check separate from CI content checks;
    do not infer the contributor's commit branch from a CI checkout.
13. Require LF for text files through `.gitattributes` and `.editorconfig`, with
    explicit CRLF exceptions where needed. Validate line endings without automatic
    fixes. Check merge-conflict markers, case-conflicting filenames, and names
    invalid on Windows, locally and in the full PR quality result. Private-key
    detection and large-file checks are outside the agreed initial scope.

## Outstanding questions

None. Tools, execution scope, fix policy, specialist report-analysis roles,
local branch protection, repository checks, line-ending policy, and ownership
of merge settings have been clarified. Application-specific checks are explicitly
deferred to application/setup and build tasks when code is introduced.

## Implementation

### Repository baseline

Planning starts from clean main synchronized with origin/main at `1fddb90`, on
`plan/code-quality-checks`, after the user authorized switching from the completed
rendering-fix branch. The repository contains Markdown, agent resources, and
GitHub contribution files. It has no application sources, package manifest,
OpenAPI document, migrations, hooks, or GitHub Actions workflows.

The planning branch was subsequently fast-forwarded to main at `6aa751d` to
incorporate the numbered-plan workflow. This plan is `00002`; the agreed CI scope
and decisions remain the same.

Read-only GitHub inspection on 2026-10-10 found a public repository with main as
the default branch and administrator access for the authenticated account. The
main branch API reports `protected: false`. Ruleset `main` (ID 24836164) is active
but has empty include/exclude ref lists. It contains deletion, non-fast-forward,
linear-history, and PR rules, including one required approval, with an always-on
administrator bypass. It has no required-status-check rule. Reinspect at
implementation time; do not infer enforced merge checks from the ruleset name.

### Confirmed decisions

- **Q01, tool choice:** Keep MegaLinter with a limited set of linters, rather than
  replacing it with individual standalone tools as the CI orchestrator.
- **Q02, execution scope:** Run fast staged-file checks locally and full checks in
  every PR. Whole-repository MegaLinter execution before every commit is not the
  selected approach. Local hook commands may invoke the underlying linters directly
  using the same configuration and compatible pinned versions.
- **Q03, initial scope:** Implement linting and documentation checks now. Resolve
  application type checking/build/test integration at code introduction in the
  application/setup and build tasks. No dummy projects or silently successful
  placeholder application jobs are required by this task.
- **Q04, initial checks:** Use the complete proposed baseline: markdownlint,
  yamllint, jsonlint, actionlint, whitespace checks, Mermaid rendering, and local
  documentation link validation. The custom checks address errors that ordinary
  Markdown linting does not catch, including the recent sequence-diagram failure.
- **Q05, fixes:** Both local hooks and PR checks are check-only. Corrections are
  invoked explicitly, not applied by hooks or committed automatically by CI.
- **Q06, merge settings:** The owner configures repository Settings personally.
  The intended policy requires the action/job running MegaLinter to be green for
  normal merges to main and permits owner override when very important. This
  implementation delivers the stable status and setup guidance; it does not
  create, activate, or modify rulesets or branch protection. Changes to review
  requirements and the existing ruleset are outside this task.
  Owner configuration/verification is a separate follow-up in repository Settings;
  completion of repository tooling must record that state accurately and must not
  claim enforced merge blocking before it has been verified.
- **Q07, specialist report analysis:** Define agents specialized in analyzing
  MegaLinter reports so the main agent can quickly understand and correct failures.
  Diagnosis is delegated; the main agent remains responsible for fixes and commits.
- **Q08, local branch protection:** Add a pre-commit check that blocks direct
  commits to main. No additional protected branch names have been requested.
- **Q09, additional repository checks:** Include merge-conflict markers,
  case-conflicting filenames, and filenames invalid on Windows. Skip private-key
  detection and large-file checks in this task.
- **Q10, line-ending policy:** Use LF for text files via `.gitattributes` and
  `.editorconfig`, with explicit CRLF exceptions where needed. Hooks remain
  check-only; corrections are invoked explicitly.

### Alternatives reviewed

| Approach | Assessment |
| --- | --- |
| MegaLinter with pre-commit and selected linters | Selected. Fits a repository intended to contain several languages and configuration formats; limit enabled tools and share their rules between local and CI execution. |
| Individual linters via pre-commit and Actions | Viable lighter alternative. Offers direct control of runtimes and project dependencies, but orchestration/reporting must be maintained per tool. Not selected. |
| Biome for frontend linting/formatting | Candidate for later frontend setup, not a replacement for C#, SQL, documentation, or workflow checks. Evaluate required React/TanStack rule coverage before selecting it. |
| ESLint/typescript-eslint plus a formatter for frontend | Recommended for later evaluation because TanStack supplies ESLint plugins. This is a recommendation, not a newly confirmed frontend tooling decision. |

MegaLinter Runner requires Node.js and a container runtime for its local
container workflow. pre-commit supports staged-file checks and manual all-file
runs; local hooks can call pinned native tools to avoid a full container run on
every commit. Compare actual performance and parity during implementation rather
than promising a particular runtime now. Align local tool versions with the
versions shipped by the selected MegaLinter image and verify the same inputs
produce the same diagnostics in both modes. See
[MegaLinter Runner](https://megalinter.io/latest/mega-linter-runner/) and
[pre-commit](https://pre-commit.com/).

The [supported linter list](https://megalinter.io/latest/supported-linters/)
provides Markdown, YAML/JSON, workflow, JavaScript/TypeScript, and C# options.
Select the smallest compatible image/flavor containing the agreed initial tools;
exact releases and image size must be checked at implementation. Do not enable
every bundled linter or add overlapping formatters without an explicit purpose.

For future frontend decisions, compare
[typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/),
[TanStack Query ESLint rules](https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query),
[TanStack Router ESLint rules](https://tanstack.com/router/latest/docs/eslint/eslint-plugin-router),
and [Biome](https://biomejs.dev/). Framework rule coverage is a project-specific
reason to evaluate ESLint first, not a claim that every alternative is unsuitable.

### Implementation layout

Use the following responsibilities; choose concrete wrapper/configuration paths
to suit the pinned versions without changing the agreed tools or scope:

- Root `.mega-linter.yml`: explicit enabled linters, full CI scope, file coverage,
  failure behavior, version/image selection, and the agreed fix policy.
- Root `.pre-commit-config.yaml`: installed commit hooks invoking selected tools
  on staged files, with the same underlying configurations as CI.
- Root `.gitattributes` and `.editorconfig`: consistent LF text-file policy,
  binary exclusions from normalization, and any required explicit CRLF exceptions.
- Shared linter configuration files as needed by the approved baseline, such as
  markdownlint and yamllint settings; avoid contradictory rules or multiple owners
  of the same formatting concern.
- `.github/workflows/code-quality.yml`: every PR to main, stable quality check,
  full validation, readable diagnostics and reports. Avoid workflow-level path
  filters that omit checks on documentation-only changes.
- A small shared checker/command layer for the agreed custom checks,
  such as extracting Mermaid blocks or checking local documentation links. Keep
  tooling dependencies separate from application scaffolding and commit lockfiles
  for whichever package ecosystem is actually used.
- A focused contributor document under `docs/` for local installation and commands,
  linked from the root README; agent-specific instructions belong under `.agents`.
  Update existing rule owners/cross-references rather than duplicating them.
- Contributor instructions naming the exact MegaLinter quality status the owner
  should require for main in Settings, with the user's chosen emergency override.
  Explain branch targeting and required-check selection without prescribing
  unrelated review settings or making external configuration changes.
- Specialist report-analysis definitions and delegation instructions under
  `.agents`, discoverable from its overview. Keep shared instructions independent
  of a model or agent tool, consistent with the existing agent-resource structure.

### Local branch protection and repository checks

Use the official `pre-commit-hooks` hook `no-commit-to-branch` with explicit
`--branch main` and retain `always_run: true` so file filtering and empty commits
do not bypass the check. Run it for local commits; exclude it from the manual
content-only full-check command and CI analysis, whose checkout may be detached
or point to main. Keep server-side merge enforcement under the existing owner
Settings decision. See [official hooks](https://github.com/pre-commit/pre-commit-hooks).

Add the agreed checks from `pre-commit-hooks` and share content-check behavior
between local hooks and full CI validation:

| Hook or check | Purpose and implementation considerations |
| --- | --- |
| `check-merge-conflict --assume-in-merge` | Detect leftover conflict markers even outside an active merge. |
| `check-case-conflict` | Detect filename collisions on case-insensitive filesystems. |
| `check-illegal-windows-names` | Keep repository paths usable on Windows. |
| `mixed-line-ending --fix=no` | Reject mixed endings without modifying files. It accepts files containing only CRLF and does not by itself enforce LF. |

Make Git/editor behavior agree through repository-owned `.gitattributes` and
`.editorconfig`. Supplement mixed-ending detection with check-only validation
of LF for text files and any declared CRLF exceptions. Account for Git's index
normalization and working-tree conversion on Windows; do not mistake a normalized
index for editor compliance. Binary files must be excluded from text normalization.
Keep content checks inside the same required MegaLinter quality result as the
other agreed checks; only the branch guard is local-only. Do not add
`detect-private-key` or `check-added-large-files` in this task. See
[Git attributes](https://git-scm.com/docs/gitattributes).

The standard `trailing-whitespace`, `end-of-file-fixer`, and `fix-byte-order-marker`
hooks modify files. Do not enable them as automatic commit/CI checks under the
agreed fix policy. Existing whitespace validation must use a check-only command;
explicit correction commands remain separate. YAML/JSON syntax checks are already
covered by the selected linters, so avoid adding duplicate hook ownership.

### Specialist agents for report analysis

Define specialist roles for the initial check families: lint/configuration
diagnostics (markdownlint, yamllint, jsonlint, actionlint, and whitespace) and
documentation diagnostics (Mermaid rendering and local links). Include handling
of configuration, dependency, and runner failures; these may explain missing
diagnostics rather than indicate a defect in the checked document or source.
Document the roles, their input/output contract, and how the main agent delegates
a failing report to the relevant specialist. Use the same instructions directly
when the active agent tool cannot delegate.

Make the summary and detailed per-check reports/logs available after failed CI
runs and document their local equivalents. Provide the specialist with the exact
run/commit or staged snapshot, report paths, affected files, applicable linter
configuration, and tool versions. Check that the evidence belongs to the failing
revision; inspect the detailed report and relevant source before diagnosing a
failure, rather than relying only on the summary or guessing missing information.
Include custom Mermaid/link diagnostics in the analysis inputs.

Return a concise list of actionable findings, grouped by cause when several
messages arise from the same defect. Each finding must identify:

- The failing check and rule/error identifier, with evidence from a specific
  report or log. If no rule identifier exists, use the reported error text.
- The repository file and line/column or diagram/link location when available;
  state explicitly when the failure has no source location.
- The cause supported by the evidence, any remaining uncertainty, and the
  smallest proposed correction consistent with the agreed repository rules.
- The command and input scope needed to reproduce the failure and verify the
  correction using the pinned tooling.

Specialists analyze and propose corrections without editing files or committing.
The main agent applies the fixes, reruns the affected checks, and completes the
required full validation. Do not suppress rules or weaken the quality gate solely
to obtain a passing result. Keep diagnostic instructions and delegation guidance
under `.agents`; contributor documentation owns report access and check commands.

Use staged file content locally, including partially staged files. Do not lint
unstaged edits and claim they represent the commit. Preserve unstaged changes,
support paths with spaces, and define handling of renamed/deleted files. Run
configuration-dependent checks on their applicable inputs when shared settings
change; verify this does not silently miss invalid staged files.

In CI, check the full applicable repository and ensure failures result in a
failed quality status. Do not rely on local hooks as merge enforcement because
they can be absent or bypassed. Use a stable, unique job name such as `MegaLinter`
and include the Mermaid, link, and whitespace checks in the same quality result.
If implementation separates jobs, make sure skipped/missing/failed child checks
cannot yield a successful MegaLinter aggregate result. Document the exact emitted
status name for the owner's Settings configuration. Use the normal PR workflow
with read-only analysis permissions and no automatic fix commits.

MegaLinter's default/template choices are not automatically this project's
policy: explicitly verify full-repository mode, enabled linters, failure settings,
and action permissions against the pinned release. Its sample workflow permits
fixing and uses changed-file behavior on PRs, so do not copy it without adapting
it to the agreed requirements. See
[GitHub installation](https://megalinter.io/latest/install-github/) and
[configuration](https://megalinter.io/latest/configuration/).

For Mermaid validation, Markdown lint alone is insufficient: extract each
Mermaid block and render it with a pinned Mermaid toolchain.
Rendering verifies more than balanced Markdown fences. Retain validation of the
unescaped-semicolon failure as a verification case; generated SVGs and temporary
browser output are tooling artifacts, not committed product assets. See
[Mermaid CLI](https://mermaid.js.org/config/mermaidCLI.html).

### Application integration deferred to code introduction

Preserve explicit TypeScript checking and .NET compilation as separate checks
from linting. Later setup must coordinate generation, dependency restore, SDK
versions, and tests with the already authored architecture. MegaLinter's
[dotnet-format integration](https://megalinter.io/latest/descriptors/csharp_dotnet_format/)
uses project scope: changed-file mode does not make it staged-file-only, and its
documented error setting must be checked explicitly before treating it as blocking.
Verify SDK compatibility and native exclusions rather than assuming a container
image supplies the project's required runtime and packages.

Future TypeScript/React linting, C# analyzers/formatting, PostgreSQL SQL linting,
Redocly, and Dockerfile checks need actual source inputs and agreed rule sets.
Keep generated API code excluded from authored-source style checks while retaining
the existing requirement to generate and compile it. Published SQL migrations
remain immutable; later formatting must not rewrite already released scripts.

### Work order

- [ ] Inspect current repository files, main ruleset, and compatible pinned tools.
- [ ] Add shared linter configuration and a limited MegaLinter baseline for existing files.
- [ ] Add staged-file pre-commit hooks and a documented manual full-check command.
- [ ] Add the main commit guard, LF policy and shared configurations, merge-conflict
  checks, and filename checks for Windows; retain check-only execution.
- [ ] Add the agreed custom documentation checks and focused regression cases.
- [ ] Correct existing in-scope lint failures without changing agreed product meaning.
- [ ] Add the full-repository PR workflow and verify visible failure/success reporting.
- [ ] Preserve failed-run reports/logs and document local/CI access to them.
- [ ] Define specialist report-analysis agents and the main-agent handoff under
  `.agents`; verify diagnoses against deliberately failing reports.
- [ ] Document the exact successful quality-check status and instructions for the
  owner to require it on main with the chosen emergency override; leave Settings
  configuration and review-policy changes to the owner.
- [ ] Document local setup, troubleshooting, rule ownership, and deferred app integration.
- [ ] Run the verification below; only then mark this plan and its index Implemented.

## Verification

- Reconfirm choices, implementation type ci, branch state, and existing repository
  settings before implementation. Verify no unapproved proposals become requirements.
- From a clean clone on Windows/PowerShell, install hooks with documented prerequisites
  and run manual full checks. Verify the supported CI environment uses equivalent
  rule settings/tool versions and includes `.agents` and `.github` content.
- Introduce an agreed linter violation in a staged file: commit must fail; correcting
  it must allow commit. Test partial staging, unstaged changes, names with spaces,
  rename/deletion, and changes to shared linter configuration without losing data.
- In a disposable checkout, verify normal and empty commits fail on main and
  valid commits succeed on a task branch. Verify the branch guard does not block
  detached CI checkouts or the manual content-only full-check command.
- Verify mixed endings and pure CRLF in LF-governed files fail without file
  modifications; LF and declared CRLF exceptions pass on Windows and CI. Confirm
  binary files are not normalized and staged/unstaged content remains intact.
- Introduce representative conflict markers and filename collisions/invalid paths
  in a suitable disposable checkout or fixture on a filesystem that permits them;
  confirm local and PR content checks fail, then pass when corrected. Remove
  failing fixtures after verification and do not add the excluded private-key or
  large-file checks.
- Verify check-only behavior and absence of unexpected modifications or automatic
  commits. Validate exclusions against real file coverage rather than broad globs.
- Introduce each agreed violation on a disposable verification branch/PR: the
  quality check must fail with useful diagnostics, then pass when corrected.
- Verify reports remain accessible after failures and identify the relevant
  revision/snapshot. Give the specialist roles representative lint/configuration,
  Mermaid, broken-link, and runner failures. Confirm findings identify the exact
  rule/location when available, evidence, cause, proposed correction, and runnable
  verification command; missing evidence must be reported as uncertainty.
- Use the specialist findings to correct representative failures as the main
  agent and verify the checks pass. Confirm specialists do not edit or commit,
  delegation instructions are discoverable, and direct use of the same instructions
  works when delegation is unavailable.
- Reproduce the unescaped-semicolon diagram error and a broken local link, then
  verify valid diagrams/links pass, including all four architecture diagrams.
- Confirm every PR update to main receives full checks, including docs-only changes;
  required statuses must not remain indefinitely pending due to path filtering.
- Verify setup guidance identifies the exact emitted quality-check status and
  explains how the owner can require it on main while keeping emergency override.
  Confirm no external ruleset/protection changes were made. After the owner applies
  Settings, validate failed/missing-check merge blocking and override with the
  owner; record whether owner configuration was verified or remains pending.
- Confirm application jobs are explicitly deferred and no fake successful app
  checks, duplicate generators, mutable published migrations, or deployment changes
  were introduced. Runtime app tests are not part of this initial task.
- Check documentation links, English wording, root README separation, and
  `git diff --check`; update Last updated and both plan/index status after implementation.
