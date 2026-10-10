# Plans

Store task plans in numbered Markdown files with descriptive names, such as
`00001-technology-architecture.md`. Each plan's title includes the same number.
The [plan-task skill](../skills/plan-task/SKILL.md) owns the numbering workflow.
A plan describes the goal, status, work steps, and how to verify the result.
Update status and progress in the same file as the work proceeds.
Use `Status: Not implemented` until implementation and verification are complete.
Then use `Status: Implemented (YYYY-MM-DD)`, with the date the status changed to
implemented in the user's timezone. Keep that implementation date when making
later edits; `Last updated` records the date of the latest edit independently.
Use the same dated status in the index below.

| Plan | Status | Scope |
| --- | --- | --- |
| [00001: Technology stack and architecture](00001-technology-architecture.md) | Implemented (2026-10-10) | Complete architecture with diagrams, implementation rules under .agents/rules, and nontechnical product requirements in the root README. |
| [00002: Code quality before commits and PR merges](00002-code-quality-checks.md) | Implemented (2026-10-11) | Staged local checks, full PR validation, generated local QA evidence, CI report comments, check-only fixes, main guard, repository checks, and specialist report analysis. Merge settings remain an owner-managed follow-up. |
| [00003: Developer setup and doctor scripts](00003-developer-setup-doctor.md) | Not implemented | Cross-platform onboarding, automatic installation of missing tools, environment diagnostics, and maintenance when local prerequisites change. Implementation type: QA. |
| [00004: Code quality verification during agent development](00004-agent-code-quality.md) | Not implemented | Extend MegaLinter as languages are adopted; add advisory jscpd MCP/CLI comparisons, whole-codebase PR code health with old/new values and colored deltas, Codex setup, and onboarding integration. Implementation type: QA. |
