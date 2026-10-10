# Plans

Store task plans in numbered Markdown files with descriptive names, such as
`00001-technology-architecture.md`. Each plan's title includes the same number.
The [plan-task skill](../skills/plan-task/SKILL.md) owns the numbering workflow.
A plan describes the goal, status, work steps, and how to verify the result.
Update status and progress in the same file as the work proceeds.

| Plan | Status | Scope |
| --- | --- | --- |
| [00001: Technology stack and architecture](00001-technology-architecture.md) | Implemented | Complete architecture with diagrams, implementation rules under .agents/rules, and nontechnical product requirements in the root README. |
| [00002: Code quality before commits and PR merges](00002-code-quality-checks.md) | Not implemented | Tooling added; real PR verification pending. MegaLinter/pre-commit lint and documentation checks: staged locally, full PR validation, check-only fixes, main commit guard, LF/merge-conflict/Windows filename checks, specialist report-analysis agents, and owner-managed merge settings. |
