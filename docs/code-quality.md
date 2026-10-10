# Code quality

Every pull request targeting `main`, including documentation changes and PR updates,
runs the full repository through the **MegaLinter** job in **Code quality**.
Failures block that job; no check changes files or creates commits.

## Install after cloning

Install Git, Node.js 24 LTS, Python 3.14, and Docker with Linux containers, or Podman
with a running Linux machine. The host Node process only creates snapshots; Mermaid
runs under the Node version supplied by the pinned container. Allow several GB of
disk space for the documentation image and Chromium. No application is installed.

Run from the repository root in PowerShell:

```powershell
python -m venv .quality-cache/venv
.quality-cache/venv/Scripts/python.exe -m pip install -r tools/quality/pre-commit-requirements.txt
node tools/quality/run.mjs setup
.quality-cache/venv/Scripts/pre-commit.exe install
```

For Podman, set the runtime before setup and before committing:

```powershell
$env:QUALITY_CONTAINER_RUNTIME = 'podman'
```

An absolute executable path also works. Keep the variable in the environment used
by your IDE if commits originate there. On Linux/macOS use the virtual environment's
`bin/python` and `bin/pre-commit` executables instead of `Scripts/*.exe`.

Hooks must be installed after every clone. The branch guard runs even for empty
commits and rejects `main`; create a task branch before committing.

## Commands and scope

```powershell
node tools/quality/run.mjs staged
node tools/quality/run.mjs full
node tools/quality/run.mjs test
node tools/quality/verify.mjs
```

`staged` checks Git index contents, including partially staged files. It copies the
complete candidate tree to a temporary directory for link targets and filename
comparisons, but runs content linters and rendering only on staged applicable files.
Changes to shared settings or tooling expand content checks to the complete candidate
tree. Any staged Markdown edit checks links in all candidate Markdown documents,
so changed headings and HTML anchors cannot silently break incoming links.
Deleting or renaming targets also checks links in all Markdown documents.
Deleted files are not passed to content linters; renamed files use their new paths.
Paths with spaces are passed as separate arguments. The original index and unstaged
edits are preserved. A separate editor line-ending diagnostic checks working-tree
endings of selected text files because Git can normalize CRLF in the index.

The host entry point `run.mjs` executes from the working tree; unstaged edits to it
can affect the manual staged command. Checked file contents, shared configurations,
container scripts and browser settings come from the Git index in staged mode.

`full` runs MegaLinter and all custom content checks on tracked and nonignored
untracked files. It is the same command used in CI and does not run the local branch
guard, so it works on `main` and detached checkouts. `test` runs custom checks plus
focused checker regressions. Binary files containing NUL bytes skip text checks;
binary extensions are also excluded from Git text conversion in `.gitattributes`.
Symlinks, submodules and unmerged index entries fail explicitly in this initial scope.

`verify.mjs` runs commit/staging enforcement tests in a disposable clone, never in
the working repository. It expects pre-commit at the documented Windows venv path;
on Linux/macOS set `QUALITY_PRE_COMMIT` to its absolute executable path. Evidence is
retained under `quality-reports/verification/`; test commits disappear with the clone.

The hooks never run the complete MegaLinter orchestrator for an ordinary commit.
They invoke its underlying markdownlint, yamllint, jsonlint and actionlint binaries
from the same image with the same arguments and configuration. Chromium is started
only when an applicable Markdown file contains a Mermaid fence. Build/setup and the
first image download are separate from commit checks; rerun setup after dependency changes.

## Shared rules and pinned tools

`tools/quality/run.mjs` is the command used by hooks and CI. Its `main()` function
shows the sequence: select the tool image, copy repository inputs, select files,
record the snapshot, run checks and remove the temporary copy. Setup mode builds or
reuses the dependency image and removes obsolete unused quality images. Source files
and the original Git index are preserved.

`tools/quality/verify.mjs` tests that this process enforces the rules. Its `main()`
lists image cleanup, branch protection, partial staging, broken links and runner
failures in execution order. Named scenario functions create test inputs
inside a disposable clone, assert the expected result and preserve evidence.
Scenario progress is printed while the suite runs.

| Check | Configuration or version owner |
| --- | --- |
| MegaLinter documentation 10.1.0 | `tools/quality/Dockerfile`, release and image digest |
| markdownlint CLI 0.49.1 | `.markdownlint.json`, same CLI in both modes |
| yamllint 1.38.0 | `.yamllint.yml`, strict warnings in both modes |
| jsonlint 17.0.1 | Strict JSON, duplicate keys rejected |
| actionlint 1.7.12 | Workflow validation; optional shellcheck/pyflakes disabled in both modes |
| pre-commit 4.6.2 and pre-commit-hooks 6.0.0 | `.pre-commit-config.yaml`, `tools/quality/requirements.txt` |
| Mermaid CLI 12.0.0 | `tools/quality/package.json` and npm lockfile |
| Chromium 152.0.7977.82-r0 | `tools/quality/Dockerfile` |
| Whitespace and LF/CRLF policy | `.editorconfig`, `.gitattributes`, `tools/quality/checks.mjs` |
| Mermaid and repository links | `tools/quality/checks.mjs`, MarkdownIt parser |

The official pre-commit-hooks implementations check conflict markers outside merges,
case collisions and mixed endings with `--fix=no` in both
execution modes. Custom checks require LF, permit CRLF only for `.bat`/`.cmd`, and
reject trailing whitespace, BOMs, missing final newlines and extra EOF blank lines.
The Windows-name check shares the official hook's exact `language: fail` filename
pattern, with additional directory-case collision coverage. CRLF exceptions still
use Git's normalized LF index; their editor and full-check contents require CRLF.
Markdown line length permits long table cells because wrapping them would break tables.

Local links include inline/reference links, images and quoted HTML `href`/`src`
attributes. Root-relative targets resolve at the repository root; URL schemes and
protocol-relative external links are outside scope. Markdown fragments must identify
a heading or explicit HTML anchor. Mermaid fences are extracted through MarkdownIt
and rendered into temporary SVGs; render output is never committed.

The tooling package is separate from future application packages. Its KaTeX override
pins the patched 0.18.2 release. Review direct and transitive updates with `npm audit`
inside `tools/quality`; update the lockfile explicitly and verify diagram rendering.
The image key hashes the Dockerfile and container dependency manifests/lockfile. Check
scripts and browser settings are mounted from the exact input snapshot without rebuilding.
Setup removes obsolete unused quality images; `node tools/quality/run.mjs clean` removes
all unused quality images. See the [tool README](../tools/quality/README.md) for lifecycle details.
Alpine package dependencies follow the base distribution; Chromium's direct version is
pinned and unavailable packages fail setup.
Update the image, lockfile, action versions and these instructions together.

The host pre-commit environment is pinned in `pre-commit-requirements.txt` and the
hook's ruamel.yaml dependency is pinned explicitly. The MegaLinter base image supplies
its own Node/Python runtime as part of its digest. This is an explicit exception to
the LTS preference for bundled runtimes: the pinned image currently uses Node 26.5.1
(Current). Contributor host runtimes still use LTS Node and stable Python. The
exception applies only to the quality image and does not change application runtimes.

## Reports and troubleshooting

### Include local hook evidence in a pull request

After committing with the installed pre-commit hooks, run this on the machine used
to push the changes:

```powershell
node tools/quality/pr-report.mjs
```

The command generates `quality-reports/pull-request.md` from the committed PR
template. Copy its Local QA section into the PR description, or use the file as
the body when creating a PR. Fill in the description before submitting it. For an
existing PR, replace only its Local QA section and preserve the description.
Regenerate and update this section whenever the PR head changes.

The successful `staged-quality` hook saves `quality-reports/local-hook.json` with
the checked Git tree, parent revision, machine, UTC completion time, image and
executed check results. Manual staged checks do not issue hook receipts. Failed
or manual staged runs invalidate previous receipts. PR generation rejects missing,
failed, different-machine or stale evidence and removes stale generated PR text.
The tree and parent must match the latest commit; rebasing, amending or bypassing
hooks can therefore require another commit with hooks enabled.

The generated section documents the staged QA hook for the latest commit, including
its content and link scope. It does not attest to every commit in the branch or
prove which machine performed the push. Local receipts are author-supplied evidence,
not signed attestations or proof that hooks could not be bypassed. The PR template
cannot read local files or populate itself on GitHub. The full CI check remains
independent and must pass separately. Keep the template's unverified placeholder
when matching local evidence is unavailable. Reports remain ignored by Git.

### Read quality reports

Reports are saved under `quality-reports/<mode>/`. `input.json` records the revision,
index snapshot hash where applicable, content snapshot hash, input paths and image key.
Its `selected` paths identify content lint/render scope; `linkSelected` identifies
the separate Markdown link-check scope, including unchanged incoming-link sources.
`result.json` records orchestrator/custom exit codes. `findings.json`, `summary.txt`
and per-check `.log` files identify custom/native failures; full runs also preserve
MegaLinter's summary and detailed logs under `megalinter/`.

Failed CI runs upload `quality-reports-<run-id>-<attempt>` artifacts for 14 days.
Open the Actions run, read the failing step and download its artifact. Setup failures
occur before source checking and may have only the step log. Missing reports mean the
check did not complete; they are not evidence that the source passed.

If an executable/image is missing, verify Node/Git and the container runtime, start
Docker or the Podman machine, set `QUALITY_CONTAINER_RUNTIME`, and rerun setup.
If the hook cannot find Node or the runtime, fix the committing process's PATH.
The snapshot mount must be readable by the Linux container. Tool failures are fatal.

Corrections are explicit. Edit the reported line, target or diagram and rerun the
affected scope. Optional Markdown corrections can be requested explicitly:

```powershell
$env:QUALITY_CONTAINER_RUNTIME = 'podman'
podman run --rm --entrypoint /node-deps/node_modules/.bin/markdownlint `
  -v "${PWD}:/workspace" -w /workspace `
  ghcr.io/oxsecurity/megalinter-documentation:v10.1.0 `
  --config .markdownlint.json --fix README.md
```

To normalize an edited LF text file explicitly without a BOM:

```powershell
$file = Join-Path $PWD 'README.md'
$content = [IO.File]::ReadAllText($file).Replace("`r`n", "`n").Replace("`r", "`n")
[IO.File]::WriteAllText($file, $content, [Text.UTF8Encoding]::new($false))
```

Review the diff before staging corrections. `git add --renormalize .` explicitly
normalizes tracked index contents after attribute changes; it does not correct editor
endings. Do not use fixing whitespace hooks or automatic fix commits in CI.

## Require the merge check in GitHub Settings

The stable required status is **MegaLinter** (workflow display: **Code quality / MegaLinter**).
There is one job, with no path filters or optional child jobs. A setup failure,
MegaLinter failure or custom-check failure makes that status fail.

After a real PR has emitted the status, the repository owner should use Settings →
Rules → Rulesets (or branch protection) to target `refs/heads/main`, require pull
requests and add **MegaLinter** from GitHub Actions as a required status check.
Keep the owner's emergency bypass available for very important exceptions. Avoid
changing existing review requirements as part of this setup. Verify a failed/missing
status blocks an ordinary merge and that the intended owner can still bypass it.

Repository tooling does not configure these settings. Inspection on 2026-10-10 found
`main` unprotected and a ruleset named `main` with no target ref includes and no
required status checks. Owner configuration and merge-blocking verification remain
pending; the ruleset name alone does not demonstrate enforcement.

## Deferred application checks

TypeScript checking, builds, Vitest, .NET compilation/xUnit, OpenAPI/Redocly generation,
SQL and application Dockerfile checks will be added when their inputs exist.
The existing architecture and API contract choices remain in force. No placeholder
application jobs, secret detection or large-file checks are included here.
