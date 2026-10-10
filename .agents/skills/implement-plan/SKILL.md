---
name: implement-plan
description: Implement an existing project task plan identified by title, path, or plan number on a separate branch using its agreed implementation type. Resolve outstanding requirements, perform verification, and update progress/status. Does not apply merely because the user is creating or editing this skill.
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
verification steps, and linked repository rules. Resolve questions needed for
the requested implementation or obtain explicit deferral before dependent work.
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

Use the implementation type explicitly supplied by the user or recorded in the
plan's `Implementation type` field. Supported types are listed in the naming
rules, including `chore`, `feature`, `bugfix`, `documentation`, and `ci`; exclude
`plan`. If no type has been agreed, ask the user to select one and wait. Do not
infer it from a planning branch, a PR's `[PLAN]` prefix, or a plan number/filename.

Create `<type>/<short-english-description>` from the chosen base after rechecking
Git state and checking for local/remote name collisions. Respect an explicitly
requested branch name. If the name exists, ask whether to continue that branch
or choose another; do not overwrite it.
Verify the active branch before making implementation changes. Resume an
explicitly authorized implementation branch without restarting branch setup.
On that branch, record the agreed `Implementation type` and any clarification
answers in the plan, and update `Last updated`.

## 3. Implement and track progress

Carry out the plan's work steps and required verification within the authorized
scope. Read relevant repository rules before changing their components. Keep
completed steps checked in the plan and update `Last updated` after each edit.
If new evidence requires a change to an agreed requirement or technical choice,
record the question and obtain clarification before dependent work.

Keep `Status: Not implemented` until the complete planned deliverables exist
and required verification has passed. Record material limitations or failed
checks accurately. Then set the dated implemented status defined in the
[plan index](../../plans/README.md), update `Last updated`, and keep the plan
index's status consistent with the plan. Preserve the implementation date on
subsequent edits.

## 4. Report and publish when authorized

Report the implemented behavior or documents, verification results, remaining
limitations, branch, and plan link. Honor existing session authorization for
commits, pushing, and PR creation; implementing a plan alone does not grant
permission to publish, merge, or deploy.

When a PR is requested, use `[TYPE]: Short English description` with the agreed
implementation type and the repository PR template. Describe the actual
implementation and validation, and link the plan. Keep implementation work on
its implementation branch rather than adding it to the planning PR.
