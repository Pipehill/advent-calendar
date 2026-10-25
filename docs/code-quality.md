# Code quality

Every pull request targeting `main`, including documentation changes and PR updates,
runs the full repository through the **Code Quality Checks** job in **Code Quality**.
Failures block that job; no check changes files or creates commits.

## Install after cloning

Run [developer setup and doctor](../tools/development/README.md) after each clone.
That document owns prerequisites, private tools, runtime selection, installation
and recovery. Hooks reject `main`, including empty commits; use a task branch.
Setup/image preparation is separate from ordinary commit checks.

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
the working repository. It discovers pre-commit in the platform-specific local venv;
use `QUALITY_PRE_COMMIT` only to override its absolute executable path. Evidence is
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
| Chromium 155.0.8059.84-r0 | `tools/quality/Dockerfile` |
| CSharpier 1.3.0 / .NET 10 | Quality Dockerfile; shared authored C#/project checks |
| SQLFluff 4.3.0 | Quality Dockerfile, PostgreSQL dialect in `.sqlfluff` |
| Biome 2.5.15 | Quality manifest, shared `biome.json` for TypeScript/TSX/CSS |
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

Container versions and image identity belong to the Dockerfile and locked manifests;
see [image lifecycle](../tools/quality/README.md#image-lifecycle) for reuse and safe cleanup.
Checks run offline with read-only snapshots, writable reports, no socket and no
credentials. Direct/transitive changes require explicit lockfile updates, audit and
rendering/fixture verification. Pinned packages unavailable upstream fail setup.
The host hook environment is pinned separately in `pre-commit-requirements.txt`.
Bundled quality runtimes follow the documented
[version exception](../.agents/rules/architecture.md#versions-and-diagnostics).

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
Completion times in the PR use `dd.mm.yyyy HH:mm` in `Europe/Oslo`, including
Norwegian daylight saving time; the receipt retains its UTC timestamp.

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
For same-repository PRs, CI also creates or updates one Code quality comment with
the MegaLinter Markdown report, additional-check diagnostics, aggregate outcome,
commit and a link to the run/artifacts. The publisher runs after successful or
failed checks; missing reports are shown as incomplete rather than successful.
Outdated PR heads do not overwrite the current comment. Oversized reports are
truncated in the comment; complete reports remain in artifacts.
The comment header links the checked commit. Overall code quality summarizes the
setup and check outcomes; separate status lines identify quality-tool preparation
and lint/repository checks. Only successful steps receive green indicators;
failed, skipped, cancelled or missing outcomes receive red indicators.
MegaLinter's OX Security banner and repository-star appeal are omitted from the
comment; the complete report in artifacts is preserved.
Flavor suggestions are disabled with `FLAVOR_SUGGESTIONS: false`. The Additional
repository checks section is hidden when the custom report confirms all checks
passed; diagnostics and missing reports remain visible.

The job has `contents: read` and `pull-requests: write`. Only the host publishing
step receives the GitHub token; quality containers remain offline and receive no
credentials. MegaLinter's built-in comment reporter stays disabled because the
host publisher includes custom checks in the same report. PRs from forks and
manual workflow runs retain logs/artifacts without attempting a PR comment.
Comment API errors fail the job explicitly and never hide an earlier QA failure.

Open the Actions run, read the failing step and download its artifact. Setup failures
occur before source checking and may have only the step log. Missing reports mean the
check did not complete; they are not evidence that the source passed.

If an executable/image is missing, verify Node/Git and the container runtime, start
Docker or the Podman machine, set `QUALITY_CONTAINER_RUNTIME`, and rerun setup.
If the hook cannot find Node or the runtime, fix the committing process's PATH.
The snapshot mount must be readable by the Linux container. Tool failures are fatal.

Correct the reported source explicitly, review the diff and rerun the affected scope.
Checks never fix or stage source. `git add --renormalize .` normalizes index bytes
after attribute changes; editor line endings must still be corrected separately.

## Require the merge check in GitHub Settings

The stable required status is **Code Quality Checks**
(workflow display: **Code Quality / Code Quality Checks**).
There is one job, with no path filters or optional child jobs. A setup failure,
MegaLinter failure or custom-check failure makes that status fail.

After a real PR has emitted the status, the repository owner should use Settings →
Rules → Rulesets (or branch protection) to target `refs/heads/main`, require pull
requests and add **Code Quality Checks** from GitHub Actions as a required status check.
Keep the owner's emergency bypass available for very important exceptions. Avoid
changing existing review requirements as part of this setup. Verify a failed/missing
status blocks an ordinary merge and that the intended owner can still bypass it.

Repository tooling does not configure these settings. Inspection on 2026-10-10 found
`main` unprotected and a ruleset named `main` with no target ref includes and no
required status checks. Owner configuration and merge-blocking verification remain
pending; the ruleset name alone does not demonstrate enforcement.

## Application checks

[Backend commands](../src/backend/README.md#contract-build-and-tests) own native
locked restore, MSBuild contract validation/generation, analyzers, isolated database
tests and publish. [Frontend commands](../src/frontend/README.md#contracts-builds-and-tests)
own frozen install, standalone tests, explicit TypeScript and Vite/Nitro packaging.
CSharpier, SQLFluff and Biome share the local/CI rules below; generated output is
excluded. Browser smoke runs separately against a started environment.

## Advisory measurements during development

[Advisory health](../tools/quality/health.md) owns scope, baseline/comparison and MCP
commands. Reports show application and tooling results; the whole-repository
reference is retained in raw artifacts. Scores remain advisory; required lint and
verified hook evidence are independent. Refresh committed PR evidence whenever
the head or base changes.
