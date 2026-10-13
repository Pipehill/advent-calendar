# Advent calendar

[![pre-commit][pre-commit-badge]](https://pre-commit.com/)
[![MegaLinter][megalinter-badge]](https://megalinter.io/)

A planned online advent calendar for invited users, including children. This
repository includes a runnable backend and a frontend showing stored calendar
titles and 24 numbered doors, with PostgreSQL persistence. The interface supports
Norwegian by default and English selection; user-authored content stays as written.
User access, opening doors and deployment are planned.

Visitors will enter an invitation code on the public landing page, then register
with an email and password or sign in. Calendar use requires login. Each code
invites a user to a particular calendar.

The project owner will create separate administrator accounts. Administrators
will manage their own calendars and invitation codes, preview and edit every
door before and during the calendar period, and move content between doors that
have not yet reached their scheduled opening time.

Doors will open at 07:00 Norwegian time (Europe/Oslo) on their assigned dates,
so children can open them in the morning. Earlier doors will remain available
to members; future content stays hidden until opening. Ordinary users will stay
signed in for up to 30 days and administrators for up to eight hours from login,
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

The launcher prints `http://localhost:3000` for the calendar page and
`http://localhost:8080` for the API after readiness succeeds. Ctrl+C stops Vite;
backend/database stay running and preserve calendars. Stop all containers with
`podman compose stop` or `docker compose stop`. The frontend root
redirects to the local example; use `/calendars/<id>` to display another calendar.
Create with
`POST /calendars` and JSON `{"title":"My calendar"}`; retrieve the returned ID
with `GET /calendars/{id}`. Creation returns 24 numbered doors with empty text.
The local sample ID is `5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026`.

See [frontend workflows](src/frontend/README.md) for host development, language
selection, frontend builds and browser verification. See
[backend commands and API examples](src/backend/README.md) for host development,
tests, configuration, seed activation, stopping containers and log inspection.

[pre-commit-badge]: https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit
[megalinter-badge]: https://img.shields.io/badge/MegaLinter-enabled-brightgreen
