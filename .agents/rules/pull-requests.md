# Pull request rules

Before creating or updating a PR, complete the automatic
[pre-publication regression review](development-quality.md#pre-publication-regression-review).
Resolve avoidable findings before pushing; do not wait for the user to discover
them in CI or ask for another review. The shared Markdown-only exception applies
to the complete PR diff.

When creating or updating a pull request, prefix its title with the work type
in uppercase square brackets, followed by a colon and a space:

`[TYPE]: Short English description`

| Work type | Branch prefix | Title prefix |
| --- | --- | --- |
| plan | `plan/` | `[PLAN]:` |
| chore | `chore/` | `[CHORE]:` |
| feature | `feature/` | `[FEATURE]:` |
| bugfix | `bugfix/` | `[BUGFIX]:` |
| documentation | `documentation/` | `[DOCUMENTATION]:` |
| ci | `ci/` | `[CI]:` |
| qa | `qa/` | `[QA]:` |

Use `plan` for creating or refining task plans, regardless of the eventual
implementation type. New planning branches use `plan/<short-english-description>`
and planning PR titles use `[PLAN]: Short English description`.

Implementation branches and PRs use the type supplied by the user or recorded in
the plan. If neither establishes a type, choose a supported implementation type
from the actual task scope, report the choice, and record it in the plan when
implementing one; no separate confirmation is needed. `plan` is not an
implementation type. For other explicitly agreed task types, use the same branch
format and uppercase title format.

Existing branches can retain their names when updating an already open PR;
updating a planning PR's title does not require recreating the PR to change its
source branch.

Example: `[CHORE]: Set up agent resources and task planning workflow`.
