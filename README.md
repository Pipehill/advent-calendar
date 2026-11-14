# Advent calendar

[![pre-commit][pre-commit-badge]](https://pre-commit.com/)
[![MegaLinter][megalinter-badge]](https://megalinter.io/)

An online advent calendar for administrator-created accounts, including children. This
repository includes a runnable backend and a frontend showing stored calendar
titles and 24 numbered doors, with PostgreSQL persistence. The interface supports
Norwegian by default and English selection; user-authored content stays as written.
Backend accounts, website login, personal pages, account administration and
owner-protected calendar preparation and superadmin calendar oversight are
implemented, together with recipient viewing and timed opening. Deployment remains planned.

Accounts use a username and password, with no public registration. Through the
website or backend API, superadmins create calendar administrators and ordinary users;
calendar administrators create ordinary users. Superadmins are provisioned
manually in the database, and the application never seeds user accounts.
Calendar users can sign in directly with the password their administrator supplies
at creation or reset, keep it, and change it voluntarily later. Administrator
creation, reset and promotion passwords remain temporary and require a different
password before normal access.
Administrators can reset permitted accounts' passwords. Superadmins can also
enable/disable nonsuperadmin accounts and change their assignable roles, preserving
fixed responsibility. These actions require recent administrator password verification.

Calendar administration requires login. Each calendar has one recipient account,
and a recipient may access multiple assigned calendars. Calendar administrators
manage their own calendars and preview/edit every door before and during
the calendar period. They create calendars for assigned users with the current
Europe/Oslo year, choose one of four original backgrounds, and save door titles,
messages and chronological/random arrangements. Random arrangements remain stable
across visits. Content moves and invitation behavior remain future work.
The administrator sees the recipient's name and username on calendar cards and
the administration page, and can explicitly save another assigned calendar user
as recipient while editing, preserving the calendar's content and arrangement.

Superadmins switch between Users and Calendars on their personal page. The
calendar table lists all calendars with owner and recipient names/usernames,
pagination and refresh. Superadmins can preview every saved door and arrangement
without editing the calendar or opening doors for its recipient.

Recipients find assigned calendars on their personal page. Populated doors become
available at 07:00 Norwegian time (Europe/Oslo) on December 1–24 in the saved
calendar year. Earlier doors remain available after December; empty doors cannot
be opened. A numbered flap swings open and its content zooms into a readable
dialog, with reduced motion supported. Green frames and check marks record doors
opened by that recipient across sessions and devices. Future content stays hidden.
Ordinary users stay signed in for up to 30 days and administrators for up to eight hours from login,
unless they log out or their session is invalidated. Activity does not extend
these periods.

See the [technology stack and architecture](docs/architecture.md) for the agreed
technical design and the decisions reserved for later implementation.

## Contribution checks

Prepare your clone and diagnose local prerequisites:

```powershell
# Windows (PowerShell)
./tools/development/setup.ps1
./tools/development/doctor.ps1
```

```bash
# macOS or Linux (Bash)
bash tools/development/setup.sh
bash tools/development/doctor.sh
```

See [developer setup](tools/development/README.md) for supported platforms,
installation permissions, restart requirements and manual recovery.

See [code quality](docs/code-quality.md) for local prerequisites, installing commit
hooks, full checks, reports, troubleshooting and the owner's merge-check setup.

## Run the application locally

For local recipient testing, `./run-local.ps1 --no-time-check` or
`bash run-local.sh --frontend=container --no-time-check` allows any populated
door to open regardless of date. Empty doors and all authentication/assignment
checks remain enforced. Restart without the flag to restore the normal December
07:00 Europe/Oslo schedule. The backend is recreated when the option changes,
including with `--skip-build`; stored calendars and opening history are retained.
The option is rejected outside the backend's Development environment.

After developer setup, build and test the backend, start the API and persistent
PostgreSQL database in containers, and run the frontend with Vite hot reload:

```powershell
./run-local.ps1
```

```bash
bash run-local.sh
```

Use `--frontend=container` to build and run the frontend in a container instead.
`--skip-build` reuses existing application images; `--skip-test` skips backend
integration and frontend unit tests. Combine both for quick repeat runs.
Tests and dev contract generation can still compile source with `--skip-build`.
Run `./run-local.ps1 --help` or `bash run-local.sh --help` for usage.

The launcher prints `http://localhost:3000` for the landing page and
`http://localhost:8080` for the API after readiness succeeds. Ctrl+C stops Vite;
backend/database stay running and preserve calendars. Stop all containers with
`podman compose stop` or `docker compose stop`. The frontend root welcomes
visitors with a Norwegian Christmas illustration and a login link.
Calendar administrators use `/my-page` to list their own calendars and open
`/create-calendar`. `/calendars/<id>` administers an owned calendar and
`/calendar-preview/<id>` previews all 24 doors. Editing requires the current owner's
unrestricted session; preview also permits an unrestricted superadmin through a
separate read-only flow. Recipients use `/my-calendars/<id>` for their currently
assigned calendars. See the [production deployment runbook](docs/deployment.md)
for Sliplane service setup, tested releases, secrets, backups and owner verification.
See [backend authentication](src/backend/authentication.md) for the direct API
exchange and intentional manual superadmin provisioning.
The protected API accepts `POST /calendars` with title, recipient UUID and a
background identifier, using the authenticated owner and CSRF token. Creation
persists exactly 24 empty doors before navigation. See the backend HTTP examples.
Startup does not create calendars or other sample data.

Migration 0004 removes the ownerless legacy test calendars and their doors once,
then enforces the protected calendar model. It preserves accounts, credentials,
sessions and unrelated data; subsequent startup preserves newly created calendars.

See [frontend workflows](src/frontend/README.md) for host development, language
selection, frontend builds and browser verification. See
[backend commands and API examples](src/backend/README.md) for host development,
tests, configuration, stopping containers and log inspection.

Backend builds use native dotnet commands; MSBuild validates the authored OpenAPI
contract and generates both clients before compilation. Frontend package scripts
own tests, TypeScript checking and Vite/Nitro builds. The
[command table](tools/development/README.md#maintenance-and-verification) explains
each command and how to use the repository's private SDK and pnpm installations.

[pre-commit-badge]: https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit
[megalinter-badge]: https://img.shields.io/badge/MegaLinter-enabled-brightgreen
