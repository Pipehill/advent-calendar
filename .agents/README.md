# Agent resources

This directory contains the project's agent instructions and working resources.
Shared content uses Markdown and remains independent of any model or agent tool.

| Directory | Contents |
| --- | --- |
| [rules/](rules/) | Shared rules. The [documentation rules](rules/documentation.md) apply to all tasks. Read the [pull request rules](rules/pull-requests.md) when creating or updating a PR. |
| [skills/](skills/README.md) | Use [plan-task](skills/plan-task/SKILL.md) to create or refine plans and [implement-plan](skills/implement-plan/SKILL.md) to implement a selected plan. |
| [plans/](plans/README.md) | Task plans with status and progress. |
| [quality/](quality/README.md) | Specialist instructions and handoff for failed quality reports. |

The root `AGENTS.md` is the entry point. Read relevant skills and plans as needed.
Tools that do not automatically read `AGENTS.md` must be directed to it at startup.
Any tool-specific entry files should link to shared content rather than duplicate rules.

## Implementation rules

Read the rules relevant to the component or boundary being changed. The
[architecture document](../docs/architecture.md) explains the agreed design;
these files own the actionable implementation instructions.

| Rules | When to read |
| --- | --- |
| [Architecture](rules/architecture.md) | Application structure, frontend/BFF, SSR, UI/forms, developer tooling and readability, builds/tests, environments, dependency policy, and logs |
| [Development quality](rules/development-quality.md) | Baseline, saved working-tree lint, MCP duplication feedback, advisory health comparisons, PR merge evidence, and language coverage maintenance |
| [API contracts](rules/api-contracts.md) | Authored OpenAPI, tRPC inputs, generated DTOs/controllers/clients, wire formats, validation, errors, deadlines, and retries |
| [Data and migrations](rules/data-and-migrations.md) | PostgreSQL/Npgsql/Dapper, DbUp SQL, startup, transactions, and published migration integrity |
| [Authentication and calendar access](rules/authentication-and-calendar-access.md) | Identity, owner provisioning, cookies, session lifecycle, ownership/membership, opening times, editing, and protected caches |

The [documentation rules](rules/documentation.md) still apply to every task;
read [pull request rules](rules/pull-requests.md) when creating or updating a PR.
