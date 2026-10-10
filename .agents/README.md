# Agent resources

This directory contains the project's agent instructions and working resources.
Shared content uses Markdown and remains independent of any model or agent tool.

| Directory | Contents |
| --- | --- |
| [rules/](rules/) | Shared rules. The [documentation rules](rules/documentation.md) apply to all tasks. |
| [skills/](skills/README.md) | Reusable workflows. Use [plan-task](skills/plan-task/SKILL.md) when the user wants to start a new task. |
| [plans/](plans/README.md) | Task plans with status and progress. |

The root `AGENTS.md` is the entry point. Read relevant skills and plans as needed.
Tools that do not automatically read `AGENTS.md` must be directed to it at startup.
Any tool-specific entry files should link to shared content rather than duplicate rules.
