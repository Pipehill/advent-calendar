# Advent calendar

[![pre-commit][pre-commit-badge]](https://pre-commit.com/)
[![MegaLinter][megalinter-badge]](https://megalinter.io/)

A planned online advent calendar for invited users, including children. This
repository includes a runnable backend and a frontend showing stored calendar
titles and 24 numbered doors, with PostgreSQL persistence. The interface supports
Norwegian by default and English selection; user-authored content stays as written.
Backend accounts, website login, personal pages and account administration are
implemented. Calendar access control, opening doors and deployment are planned.

Accounts use a username and password, with no public registration. Through the
website or backend API, superadmins create calendar administrators and ordinary users;
calendar administrators create ordinary users. Superadmins are provisioned
manually in the database, and the application never seeds user accounts.
Administrator-issued initial, reset and promotion passwords are temporary and require
the recipient to choose a different password before normal access.
Administrators can reset permitted accounts' passwords. Superadmins can also
enable/disable nonsuperadmin accounts and change their assignable roles, preserving
fixed responsibility. These actions require recent administrator password verification.

Calendar use will require login. Each calendar will have one recipient account,
and a recipient may access multiple assigned calendars. Calendar administrators
will manage their own calendars, preview and edit every door before and during
the calendar period, and move content between doors that have not yet reached
their scheduled opening time. Calendar assignment and any invitation flow remain
future work.

Doors will open at 07:00 Norwegian time (Europe/Oslo) on their assigned dates,
so children can open them in the morning. Earlier doors will remain available
to assigned recipients; future content stays hidden until opening. Ordinary users
will stay signed in for up to 30 days and administrators for up to eight hours from login,
unless they log out or their session is invalidated. Activity will not extend
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
visitors with a Norwegian Christmas illustration and a disabled login button.
Use `/calendars/<id>` to display a calendar directly.
The current calendar API is anonymous. Calendar authorization,
frontend/BFF security integration and production database hardening must be
completed and verified before production use.
See [backend authentication](src/backend/authentication.md) for the direct API
exchange and intentional manual superadmin provisioning.
Create with
`POST /calendars` and JSON `{"title":"My calendar"}`; retrieve the returned ID
with `GET /calendars/{id}`. Creation returns 24 numbered doors with empty text.
Startup does not create calendars or other sample data.

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
