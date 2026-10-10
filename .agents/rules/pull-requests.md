# Pull request rules

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

Implementation branches and PRs use the implementation type established for the
task. If it has not been established, ask the user rather than choosing one
silently. `plan` is not an implementation type. For other explicitly agreed task
types, use the same branch format and uppercase title format.

Existing branches can retain their names when updating an already open PR;
updating a planning PR's title does not require recreating the PR to change its
source branch.

Example: `[CHORE]: Set up agent resources and task planning workflow`.
