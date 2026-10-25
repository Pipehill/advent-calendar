# Plans

See [TODO](TODO.md) for follow-up items not yet expanded into numbered plans.

Store task plans in numbered Markdown files with descriptive names, such as
`00001-technology-architecture.md`. Each plan's title includes the same number.
The [plan-task skill](../skills/plan-task/SKILL.md) owns the numbering workflow.
A plan describes the goal, status, work steps, and how to verify the result.
Update status and progress in the same file as the work proceeds.
Use `Status: Not implemented` until implementation and verification are complete.
Then use `Status: Implemented (YYYY-MM-DD)`, with the date the status changed to
implemented in the user's timezone. Implemented plans are historical records;
follow the [preservation rule](../rules/documentation.md#4-preserve-implemented-plans-as-historical-records)
before changing one. For an explicitly approved later edit, keep the implementation
date; `Last updated` records the date of that approved edit independently.
Use the same dated status in the index below.

On 2026-10-18 the owner confirmed that plan 00008 replaces conflicting earlier
account/access decisions. The owning documentation now reflects that design;
backend authentication is implemented in plan 00008; the deferred calendar/BFF
security work remains unimplemented.
Plan 00001 itself remains unchanged as the historical record of its original decisions.

| Plan | Status | Scope |
| --- | --- | --- |
| [00001: Technology stack and architecture](00001-technology-architecture.md) | Implemented (2026-10-10) | Architecture with diagrams, implementation rules under .agents/rules, and nontechnical product requirements in the root README. Conflicting account/access decisions are historical and superseded by plan 00008; current documentation was aligned on 2026-10-18. |
| [00002: Code quality before commits and PR merges](00002-code-quality-checks.md) | Implemented (2026-10-11) | Staged local checks, full PR validation, generated local QA evidence, CI report comments, check-only fixes, main guard, repository checks, and specialist report analysis. Merge settings remain an owner-managed follow-up. |
| [00003: Developer setup and doctor scripts](00003-developer-setup-doctor.md) | Implemented (2026-10-11) | Setup/doctor, installation adapters, persistent runtime selection and readable scripts. Available checks passed; remaining platform tests deferred by the owner, with a temporary Linux/macOS installation follow-up rule. Implementation type: QA. |
| [00004: Code quality verification during agent development](00004-agent-code-quality.md) | Implemented (2026-10-11) | Pinned jscpd MCP/CLI development comparisons, whole-codebase candidate-merge PR health, Codex stdio setup, onboarding readiness, and language maintenance rules. Native macOS/Linux tests deferred by the owner with documented follow-up. Implementation type: QA. |
| [00005: Create and retrieve calendars through the backend API](00005-calendar-api.md) | Implemented (2026-10-11) | Backend POST/GET under src/backend, sibling src/contract, PostgreSQL migrations, local seed, launcher, Unicode limits, controllable time, health checks and .http examples. 30 backend tests and local quality checks passed; actual Podman verified, Docker execution explicitly deferred by the owner. Implementation type: feature. |
| [00006: Display a persisted calendar in the frontend](00006-calendar-frontend.md) | Implemented (2026-10-13) | Calendar page by UUID, 24 static doors, database-backed tRPC BFF/API read flow, SSR/hydration, Norwegian-default/English Paraglide interface, unchanged user content, generated contracts, local startup and CI. 21 frontend tests, 42 backend tests, clean builds, Windows host and Podman browser verification passed. Build-only dependency advisories and inherited platform deferrals are documented. Implementation type: feature. |
| [00007: Norwegian Christmas landing page](00007-norwegian-christmas-landing-page.md) | Implemented (2026-10-18) | Landing page at `/`, exact Norwegian welcome text, generated Norwegian Christmas illustration, disabled top-right login, Norwegian/English localization, responsive layout, and preserved direct calendar pages. 21 frontend tests, production build/type checking/lint, full quality and eight isolated Windows/Edge browser tests passed. PR review fixes fresh quality-image builds and improves advisory health from main 53.8 to 56.4 with unchanged heuristic findings and zero duplication; see frontend verification. Implementation type: feature. |
| [00008: Backend user management and authentication](00008-backend-user-management.md) | Implemented (2026-10-18) | Backend accounts, three-role authorization, Argon2id, fixed responsibility/scoped resets, temporary credentials and restricted sessions, recent administrator verification, persisted lockout/session invalidation, CSRF, no-store and concurrency checks. Offline hash tool and manual-only superadmin provisioning; zero account seeding. All 146 backend tests, 21 frontend compatibility tests, builds, lint and isolated Linux runtime/container-replacement verification passed. Advisory health 56.4 to 64.7; test duplication increased to 0.21928%, with coverage limitations recorded. Calendar authorization, frontend/BFF integration and plan 00009 remain production gates. Implementation type: feature. |
| [00009: Database hardening before production](00009-database-hardening.md) | Not implemented | Required before production: private database networking, explicit localhost-only developer access, separate runtime/migration/operator identities, external secrets, verified TLS and data-preserving credential rotation. Deployment-specific choices are explicitly deferred for clarification before implementation. |
| [00010: Simplify developer tooling](00010-simplify-developer-tooling.md) | Implemented (2026-10-25) | Native builds, consolidated documentation, official MCP client and separate application/tooling health with the retained reference are verified on available Windows/Podman. The owner accepted inherited Vite language failures and unavailable native-platform/Docker evidence as follow-ups. Implementation type: chore; owner authorized the existing planning branch. |
