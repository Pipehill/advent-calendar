# Plans

Store task plans in numbered Markdown files with descriptive names, such as
`00001-technology-architecture.md`. Each plan's title includes the same number.
The [plan-task skill](../skills/plan-task/SKILL.md) owns the numbering workflow.
A plan describes the goal, status, work steps, and how to verify the result.
Update status and progress in the same file as the work proceeds.

| Plan | Status | Scope |
| --- | --- | --- |
| [00001: Technology stack and architecture](00001-technology-architecture.md) | Implemented | Complete architecture with diagrams, implementation rules under .agents/rules, and nontechnical product requirements in the root README. |
| [00002: Code quality before commits and PR merges](00002-code-quality-checks.md) | Not implemented | Tooling added; PR success verified, failure/artifact and CI comment verification pending. Staged local checks, full PR validation, generated local QA evidence, CI report comments, check-only fixes, main guard, repository checks, specialist report analysis, and owner-managed merge settings. |
| [00004: Code quality verification during agent development](00004-agent-code-quality.md) | Not implemented | Extend MegaLinter as languages are adopted; add advisory jscpd MCP/CLI comparisons, whole-codebase PR code health with old/new values and colored deltas, Codex setup, and onboarding integration. Implementation type: QA. |
