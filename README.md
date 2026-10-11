# Advent calendar

[![pre-commit][pre-commit-badge]](https://pre-commit.com/)
[![MegaLinter][megalinter-badge]](https://megalinter.io/)

A planned online advent calendar for invited users, including children. This
repository currently contains the product and architecture documentation; a
runnable application and deployment have not yet been implemented.

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

[pre-commit-badge]: https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit
[megalinter-badge]: https://img.shields.io/badge/MegaLinter-enabled-brightgreen
