---
name: implement-plan
description: Implement an existing project task plan identified by title, path, or plan number in verified iterations with one commit per step, then verify the complete result and publish a draft PR. Use a separate branch with the selected implementation type and track plan progress. Does not apply merely because the user is creating or editing this skill.
---

# Implement a plan

Use this workflow when the user asks to implement an existing plan. Read the
[documentation rules](../../rules/documentation.md) and use the
[branch and pull request naming rules](../../rules/pull-requests.md) for supported
implementation types. Planning uses `plan`; implementation uses its own type.

## 1. Select and read the plan

Use the plan explicitly identified by the user. A user may identify it with only
its number, such as `00001` (or `1`): normalize the number to five digits and
resolve the matching `.agents/plans/<number>-*.md` file through the
[plan index](../../plans/README.md). Confirm its filename, title, and index entry
refer to the same number. If no plan or multiple plans match, report the mismatch
and ask for clarification; do not select another plan implicitly. Report the
resolved number and title before proceeding with the usual workflow.

Otherwise inspect the
[plan index](../../plans/README.md); if the intended plan is unclear, ask which
plan to implement and wait for the answer.

Read its requirements, confirmed decisions, outstanding questions, work order,
verification steps, and linked repository rules. Apply the
[decision boundaries](../plan-task/SKILL.md#decision-boundaries) when resolving
questions: make routine choices autonomously, and obtain answers or explicit
deferral for consequential unresolved questions before dependent work.
After preparing the implementation branch, record answers in the plan using the
clarification workflow in [plan-task](../plan-task/SKILL.md). Respect its scope
and deferred work; a documentation plan does not authorize creating the
application it describes.
If the plan is already implemented, clarify the requested additional work rather
than executing its completed steps again.

## 2. Prepare the implementation branch

Check `git status --porcelain` and `git branch --show-current`. Start a new
implementation on clean `main` unless the user has authorized another base or
continuing an existing implementation branch. Report unexpected pending changes
and ask how to proceed; do not stash, discard, commit, or switch away from them
without authorization.

On clean `main`, fetch `origin` and compare `main` with `origin/main`. Fast-forward
when only the remote is ahead. If only local commits exist, report that state
without pushing or rewriting them. Resolve divergence, unavailable base refs,
or synchronization failure with the user before branching. Confirm the selected
plan exists on the chosen base. If it is only available on a planning branch,
clarify the base or integration of that plan instead of merging its PR implicitly.

Select the implementation type using the naming rules: preserve a type supplied
by the user or recorded in the plan's `Implementation type` field; otherwise
choose a supported type from the actual task scope and report the choice without
waiting for confirmation. Do not infer it from a planning branch, a PR's `[PLAN]`
prefix, or a plan number/filename. `plan` is not an implementation type.

Create `<type>/<short-english-description>` from the chosen base after rechecking
Git state and checking for local/remote name collisions. Respect an explicitly
requested branch name. If the name exists, ask whether to continue that branch
or choose another; do not overwrite it.
Verify the active branch before making implementation changes. Resume an
explicitly authorized implementation branch without restarting branch setup.
On that branch, record the selected `Implementation type` and any clarification
answers in the plan, and update `Last updated`.

## 3. Divide the plan into implementation iterations

Before implementation edits, divide the plan into ordered, cohesive steps based
on its requirements and dependencies. Record the steps and their intended
verification in the plan's work checklist; include this breakdown in the first
iteration's commit. Adapt existing work steps rather than duplicating them.

Each iteration implements one related step and ends with its own commit. For
example, a feature may proceed through API specification, repository, service,
controller, and React component iterations. Choose boundaries that fit the actual
plan; intermediate commits do not have to compile or deliver a complete feature.
Identify checks that depend on later steps so temporary integration gaps can be
distinguished from unintended regressions.

## 4. Implement, verify, and commit each iteration

For coding work, follow the [development quality rules](../../rules/development-quality.md):
capture a baseline before edits, use targeted checks on saved source during
iterations, and perform full final verification with the advisory comparison.
The shared rules own check scope and when to broaden it. Readiness
failures and unsupported metrics must remain visible. Keep working-tree feedback
separate from staged receipts and PR merge comparisons.

For each iteration:

1. Implement the related changes within the plan's scope. Read relevant repository
   rules before changing their components.
2. Verify the saved changes with targeted lint, relevant tests, and necessary
   type/build checks, following the quality rules and their Markdown-only
   exception. Broaden checks when integration boundaries or shared configuration
   change; full lint is not required for every iteration. Keep required hooks
   enabled. When later iterations are needed for a build or test,
   record the dependency and actual failed or unavailable check; do not describe
   it as passing. Resolve unexpected failures before proceeding.
3. Review the diff and available quality feedback against the baseline and previous
   iteration. Assess internally whether code health improved or declined. Investigate
   regressions and decide whether to revise the code before committing; retain a
   justified tradeoff only when supported by concrete evidence. Scores remain advisory.
4. Check completed work in the plan and update `Last updated`. Include material
   verification limitations, regressions, and their disposition in the plan; no
   separate per-iteration report or routine user-facing step summary is required.
5. Review and stage only this iteration's changes, then create a descriptive English
   commit before starting the next step. Preserve the iteration commits through
   publication; do not squash them into a single final commit.

If new evidence requires changing a user-confirmed requirement or technical choice,
or raises another consequential question under the decision boundaries, record
the question and obtain clarification before dependent work. Adjust routine
agent-selected choices within those boundaries without another approval, and
record material changes in the plan. Adjust the remaining iteration breakdown
when dependencies or findings require it.

## 5. Verify the complete implementation against the plan

After all iterations, compare the final implementation with every requirement,
confirmed decision, deliverable, and verification criterion in the plan. Check
that the parts work together and resolve temporary integration gaps from earlier
iterations. Run the complete required verification on the final saved inputs,
following the shared quality rules and their Markdown-only exception. For coding
work, this includes full lint, all required tests/builds and security/migration
checks, and the final advisory comparison. Targeted iteration checks do not
replace this final verification or the existing full PR checks. Assess the overall
code-health change as well as individual iteration findings. Correct omissions
or regressions in further verified iteration commits.

Keep `Status: Not implemented` until the complete planned deliverables exist
and required verification has passed. Record material limitations or failed
checks accurately. Then set the dated implemented status defined in the
[plan index](../../plans/README.md), update `Last updated`, and keep the plan
index's status consistent with the plan. Preserve the implementation date on
subsequent edits. Commit these final plan and index updates before publication.

## 6. Push the commits and open a draft pull request

Invoking this skill authorizes committing each verified iteration, pushing all
implementation commits to the implementation branch, and creating a draft PR
targeting the agreed base after final verification. Complete these actions
without waiting for separate user approval or asking for confirmation. Honor
explicit session limits on commits, pushing, or PR creation. Leave merging to
the user.

Use `[TYPE]: Short English description` with the selected implementation type and
the repository PR template. Describe the problem and resulting behavior, the
cohesive implementation steps, final verification against the plan, and material
limitations or code-health tradeoffs. Link the plan and include the required
Local QA evidence using the existing repository tooling. Ensure the PR contains
all iteration commits. Keep implementation work on its implementation branch
rather than adding it to the planning PR. Leave the PR in draft for review.

Report the completed behavior or documents, final verification, remaining
limitations, branch, plan link, and draft PR link to the user.
