# Advisory code health

The pinned jscpd 5.4.1 native analyzer measures duplication through its built-in
stdio MCP server and health, complexity and supported dead-code findings through
separate CLI JSON reports. All four runs use the same `.jscpd.json`, binary and
immutable source snapshot. No score, clone count or finding creates a hook or CI
gate. Existing lint checks and verified Local QA receipts retain their meaning.

## Development commands

Run developer setup first, or run `node tools/quality/install-analysis.mjs`.
Installation uses the committed npm lockfile and reuses matching platform packages;
server startup never downloads a release.

| Command | Purpose |
| --- | --- |
| `node tools/quality/health.mjs baseline` | Capture saved whole-codebase source before a task. |
| `node tools/quality/run.mjs full` | Lint saved working-tree changes using the hook/CI configuration. |
| `node tools/quality/health.mjs compare` | Rescan and compare with the preserved development baseline. |
| `node tools/quality/health.mjs doctor` | Verify pinned binary, MCP schema/refresh, scope and CLI readiness. |
| `node tools/quality/health.mjs pr origin/main HEAD` | Compare target commit with the candidate merge tree. |
| `node --test tools/quality/health.test.mjs` | Verify analyzer and reporting behavior with disposable fixtures. |

Baseline refuses to overwrite an existing baseline. Archive the ignored
`quality-reports/health/baseline/` directory before starting another task. Reports
include timestamps, source manifests and hashes, tool version, configuration hash,
scope, raw MCP results, tool schemas and individual CLI JSON reports. Missing or
failed execution never creates a successful measurement. Snapshots include saved
unstaged and untracked source without modifying the original index or files.

The comparison labels actual metric directions and reports percentages alongside
absolute lines and clones. Green means improved, red regressed, yellow unchanged
or mixed, and neutral unavailable. File/line totals describe size changes rather
than grading them. Scoring inputs or version changes make comparisons unavailable.
An improvement in one dimension never hides regressions in other dimensions.

## Whole-codebase scope and limitations

The authored source extensions in `.jscpd.json` cover current JavaScript modules,
Bash and PowerShell, plus the planned application's code extensions as they appear.
The source inventory comes from Git's tracked and nonignored untracked files;
snapshots never follow symlinks. All included files are scanned, including unchanged
files, tests, new files and saved deletions. Files below the pinned minimum size
may not contribute to jscpd's measured totals; the source manifest still lists them.
Unsupported extensions require a configuration review when that language is adopted.

Dependencies, `.git`, caches, reports, generated directories, `bin`, `obj`, `dist`,
`.output` and coverage output are excluded. Prose, configuration and lockfiles are
outside authored-code scoring. Generated API artifacts remain governed by the
[API contract rules](../../.agents/rules/api-contracts.md). Put adopted generated
output in excluded directories and review exclusions when generation paths change.
Do not change exclusions, thresholds or scoring weights to manufacture improvement.

Health JSON contains available dimensions and their measured shares. Dead-code
coverage can be partial; unsupported languages are unavailable rather than clean.
Dead-code findings are heuristic and carry confidence. This release can incorrectly
identify `.mjs` imports and script/container entry points as unused. Inspect findings
against actual callers before refactoring; reports explicitly disclose this limitation.
Complexity can legitimately increase for required behavior. The CLI hotspot list is
ranked and can be truncated; it is not a total sum over all files. jscpd rounds health
values to one decimal, so changes below that resolution cannot be established.

## MCP client setup and lifecycle

Launch `node /absolute/repository/tools/quality/jscpd.mjs` with a stdio transport.
The script resolves the repository from its own path, loads its shared configuration
and keeps stdout exclusively for MCP protocol traffic. Diagnostics go to stderr.
Use the Node 24 installation selected for development, particularly when the IDE
inherits a different PATH. Give the client read access to source, configuration and
the installed platform package and permission to launch its native subprocess.

For Codex, add a local entry to `~/.codex/config.toml` or a trusted project's
`.codex/config.toml`, substituting your own absolute paths:

```toml
[mcp_servers.advent_jscpd]
command = "C:/path/to/node24/node.exe"
args = ["C:/path/to/advent-calendar/tools/quality/jscpd.mjs"]
cwd = "C:/path/to/advent-calendar"
```

On macOS/Linux, use the absolute Node path (for example `/usr/local/bin/node`) and
repository path. Do not commit machine-specific paths or overwrite existing client
configuration. Project-level Codex configuration requires project trust; check with
`codex mcp list` and restart/reconnect the client after changes. The example follows
[official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
and [project trust rules](https://learn.chatgpt.com/docs/config-file/config-basic).
The launcher/protocol are verified by the repository test client; interactive Codex
IDE connection and native macOS/Linux startup require their own recorded evidence.

After initialization, negotiate `tools/list` and verify the schemas. Version 5.4.1
provides these tools:

| Tool | Arguments | Use |
| --- | --- | --- |
| `check_current_directory` | `{}` | Refresh the last scan after saves; returns clones and file locations. |
| `get_statistics` | `{}` | Read the last scan's totals and per-language statistics. |
| `check_duplication` | `{"code":"...","format":"javascript"}` | Find existing matches for a proposed snippet. |
| `get_file_clones` | `{"path":"tools/quality/run.mjs"}` | Inspect file clone locations before refactoring. |

Always refresh before treating statistics as current: saving files does not refresh
this MCP server automatically. Keep proposed snippets at least 50 tokens and five
lines; shorter snippets may be unmeasurable. These commands use default exact clones
and the shared mild mode; semantic downloads and alternate scoring are not enabled.
The comparison runner refreshes every new immutable snapshot explicitly. Stop the
server through the client when finished; the launcher forwards termination signals.
For other clients use the same executable, arguments and stdio transport; client-specific
configuration formats are outside this task's scope.

## PR generation and refresh

Fetch the target branch, then run `node tools/quality/health.mjs pr origin/main HEAD`.
Use explicit base/head refs for other PR targets. The command resolves both commits
and uses `git merge-tree --write-tree` to create a candidate Git tree without moving
HEAD, switching branches, modifying the index or merging into the working tree.
It may add temporary Git objects. Conflicts and missing refs are unavailable.

Both complete trees are analyzed with the currently pinned tool/settings. Evidence
identifies the base commit, PR head, candidate tree, input hashes and measurement
settings. It measures merging the committed PR head, not saved uncommitted edits.
If analysis settings change, the PR uses one common set for both trees; explain that
policy change separately. Development baseline comparisons reject differing settings.

After committing with the existing hooks, run `node tools/quality/pr-report.mjs`
(or provide the target ref as its argument). It regenerates health rather than
trusting a saved comparison and retains separately verified Local QA. Copy the
generated sections into the PR description; preserve the description. The compact
Code health section places target/head/merge-tree identity above the metric table
and groups file findings in a second table. Detailed identities, limitations and
development regression explanations stay in local reports. Regenerate whenever either the target or PR head
changes, including after a rebase. A previously pasted section becomes stale when
these identities change; label it unavailable until refreshed. No PR is published
or edited by these commands. CI produces fresh advisory evidence for PR updates;
target-only advancement also requires regeneration or a new workflow run.

Reports and generated bodies remain in ignored `quality-reports/`. Health failure
does not invalidate an otherwise matching Local QA receipt; receipt failure still
prevents claiming local verification. The PR template starts explicitly unavailable.

## Diagnostics

Run developer doctor to diagnose missing binaries, wrong version, unsupported
platforms, failed handshake/tool schemas, empty scope and CLI failures. For a missing
platform package rerun setup without omitting optional dependencies. Fix Node/PATH
in the client process and restart it. Malformed protocol output or changed schemas
must be investigated, not interpreted as zero clones. Keep stderr and raw reports.
An execution error or empty scope exits nonzero for local development/readiness;
PR availability and scores remain advisory. See the dated
[verification evidence](health-verification.md) for platform coverage.

Tool references: [installation](https://jscpd.dev/start/installation),
[MCP tools](https://jscpd.dev/guides/agents), and
[health scoring](https://jscpd.dev/guides/health).
