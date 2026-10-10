---
name: plan-task
description: Create or refine a numbered project task plan. Use plan branches and PLAN pull request titles, clarify requirements, and record outstanding questions and confirmed decisions. Does not implement the task or apply merely because the user is creating or editing this skill.
---

# Plan a task

For a new task, follow these steps in order. Use the repository's existing Git
tooling; the workflow must not depend on a particular model, harness, or editor.
When refining an existing plan, update it in its current task branch and follow
the clarification and plan-writing instructions without restarting branch setup.
Follow the [branch and pull request naming rules](../../rules/pull-requests.md).
Planning uses the `plan` work type; implementation type selection belongs to
[implement-plan](../implement-plan/SKILL.md).

## 1. Check the working tree and branch

Run `git status --porcelain` and `git branch --show-current`.
A clean working tree has no staged, unstaged, or untracked changes reported by
Git. Ignored files do not make it dirty.

If the working tree is dirty, the branch is not `main`, or HEAD is detached:

- Report the branch and any pending changes.
- Ask the user how to proceed and wait for their answer.
- Do not automatically stash, commit, discard changes, switch branches, or pull.
- Carry out only the resolution the user authorizes, then check Git state again.
  Continue once on clean `main`, or if the user explicitly authorizes an exception.

## 2. Synchronize main

On clean `main`, run `git fetch origin`, then compare `main` with `origin/main`,
for example using `git rev-list --left-right --count main...origin/main`.
The first count is local-only commits; the second is remote-only commits.

- If only the remote has new commits, run `git pull --ff-only origin main`.
- If neither side has new commits, continue without pulling.
- If only local commits exist, report that main is ahead and continue without
  pushing or rewriting it.
- If the histories diverge or synchronization fails, explain the result and ask
  the user how to proceed. Wait for their answer; do not merge, rebase, reset, or
  continue as though synchronization succeeded.

If `origin/main` is unavailable, ask which remote and base branch to use.
Check the working tree and branch again after synchronization.

## 3. Use the planning work type

Use `plan` for the planning branch and any separately requested planning PR.
Do not ask the user to select an implementation type before writing a plan.
If the user has already explicitly supplied an implementation type, record it
as `Implementation type: <type>` in the plan, after `Last updated`. Otherwise
leave it undecided for the implement-plan workflow. A plan's work type remains
`plan` even when its eventual implementation is documentation, a feature, or CI.

## 4. Clarify the task

Use the user's description, or ask them to describe the task if they have not
done so. Inspect relevant repository files to understand existing behavior.

Ask focused follow-up questions about any unclear requirements, scope, expected
behavior, acceptance criteria, or implementation choices needed for the plan.
Record unanswered questions in the plan's `Outstanding questions` section,
including proposed options without presenting them as agreed choices. A draft
plan may be written while clarification is ongoing; clearly report that it still
has outstanding questions. Continue clarification until the questions needed
for the task are answered or explicitly deferred by the user.

If the user requests questions one at a time, ask one question and wait for its
answer before asking the next. After each answer, update the plan before
continuing: remove the resolved question from `Outstanding questions`, record
the decision under the relevant implementation details, and adjust requirements
and verification steps if needed. If the answer is incomplete, keep the question
open and ask a focused follow-up. Record explicit deferrals and their destination
under implementation details. Wait for actual answers; silence or elapsed time
is not an answer.

Do not invent requirements, choose unspecified solutions, or fill gaps with
assumptions. If the repository does not establish a technical choice the plan
needs, ask the user. Present possible options as questions, not as decisions.
Avoid asking again about information the user or repository already provides.

## 5. Create the task branch

Recheck Git state before creating the branch. If it changed unexpectedly,
return to step 1 instead of carrying changes into a new branch automatically.

Use `plan/<short-english-description>` with a concise lowercase,
hyphen-separated description based on the clarified task. Respect an explicitly
requested branch name. Check whether the name already exists locally or remotely;
if it does, ask whether to use it or choose another name.

Run `git switch -c <branch-name>` and verify the active branch. If branch creation
fails, report the failure and resolve it before writing the plan.

## 6. Write the implementation plan

Create `.agents/plans/<number>-<short-english-description>.md` on the planning
branch, such as `00001-technology-architecture.md`. Use a five-digit, zero-padded
sequence starting at `00001`. Inspect existing plan filenames and the
[plan index](../../plans/README.md), then assign the highest existing number plus
one, or `00001` when there are no plans. Recheck that the number and destination
are unused before writing; do not reuse gaps or overwrite another plan.

Use `# <number>: <Short task title>` as the plan's first heading, with the same
number as the filename. Include the number in its plan-index entry and update
the index when creating a plan. Keep assigned numbers stable when refining a
plan and preserve its filename and links unless a rename is requested.
Do not add a work-type prefix such as `plan-` or `documentation-` to plan
filenames; work types remain part of branch/PR naming and the implementation
type field. A plan's number or filename does not determine its implementation type.
If a plan already exists at that path, ask before replacing it. Write in English
for both human and agent readers. Use this order:

1. The numbered short task title described above.
2. `Status: Not implemented`.
3. `Last updated: YYYY-MM-DD`, using the current date in the user's timezone.
4. A brief overview of the task.
5. A list of concrete, verifiable requirements.
6. An `Outstanding questions` section listing unresolved choices, or stating
   `None` when all questions have been answered or explicitly deferred.
7. A detailed implementation description: affected files or components,
   required changes, agreed implementation choices, dependencies, and work order.
8. Verification steps tied to the requirements.

Update `Last updated` whenever the plan is edited, including changes to its
requirements, implementation steps, progress, or status.

Include enough detail for someone to implement the task without reconstructing
the conversation. Keep requirements separate from implementation steps. Record
only clarified decisions and repository facts as requirements and implementation
choices. If writing or reviewing the plan reveals a new uncertainty, add it to
`Outstanding questions` and return to clarification before presenting the plan
as fully clarified.

Keep the status `Not implemented` until the task has been implemented and verified;
writing or merging a plan does not implement it. The implement-plan workflow
changes the status after implementation and verification. Track intermediate
progress in the work steps.

Report the branch and link to the completed plan. This skill ends after planning;
do not implement, commit, push, or create a pull request unless separately requested.
When a planning PR is requested, use `[PLAN]: Short English description` and
describe the planning deliverables without presenting the application as implemented.
