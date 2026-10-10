---
name: plan-task
description: Plan a new project task when the user says they want to start a new task. Check Git state, synchronize main, clarify task type and requirements, create a task branch, and write an implementation plan. Does not implement the task or apply merely because the user is creating or editing this skill.
---

# Plan a task

Follow these steps in order. Use the repository's existing Git tooling; the
workflow must not depend on a particular model, harness, or editor.

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

## 3. Establish the task type

Use the task type explicitly supplied by the user: `chore`, `feature`, `bugfix`,
or `documentation`. If none was supplied, ask the user to choose one and wait
for the answer. Do not infer the type from the description. If the supplied type
is ambiguous or outside this list, ask for clarification.

## 4. Clarify the task

Use the user's description, or ask them to describe the task if they have not
done so. Inspect relevant repository files to understand existing behavior.

Ask focused follow-up questions about any unclear requirements, scope, expected
behavior, acceptance criteria, or implementation choices needed for the plan.
Continue asking until all outstanding questions are resolved. Wait for actual
answers; silence or elapsed time is not an answer.

Do not invent requirements, choose unspecified solutions, or fill gaps with
assumptions. If the repository does not establish a technical choice the plan
needs, ask the user. Present possible options as questions, not as decisions.
Avoid asking again about information the user or repository already provides.

## 5. Create the task branch

Recheck Git state before creating the branch. If it changed unexpectedly,
return to step 1 instead of carrying changes into a new branch automatically.

Use `<type>/<short-english-description>` with a concise lowercase,
hyphen-separated description based on the clarified task. Respect an explicitly
requested branch name. Check whether the name already exists locally or remotely;
if it does, ask whether to use it or choose another name.

Run `git switch -c <branch-name>` and verify the active branch. If branch creation
fails, report the failure and resolve it before writing the plan.

## 6. Write the implementation plan

Create `.agents/plans/<type>-<short-english-description>.md` on the task branch.
If a plan already exists at that path, ask before replacing it. Write in English
for both human and agent readers. Use this order:

1. A short task title.
2. `Status: Not implemented`.
3. A brief overview of the task.
4. A list of concrete, verifiable requirements.
5. A detailed implementation description: affected files or components,
   required changes, agreed implementation choices, dependencies, and work order.
6. Verification steps tied to the requirements.

Include enough detail for someone to implement the task without reconstructing
the conversation. Keep requirements separate from implementation steps. Record
only clarified decisions and repository facts. If writing the plan reveals a
new uncertainty, return to clarification before presenting it as complete.

Keep the status `Not implemented` until the task has been implemented and verified;
then change it to `Implemented`. Track intermediate progress in the work steps.

Report the branch and link to the completed plan. This skill ends after planning;
do not implement, commit, push, or create a pull request unless separately requested.
