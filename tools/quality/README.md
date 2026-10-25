# Quality tooling

Operational commands, checked-file semantics, pinned linter configuration, hook
evidence and CI reports are documented in [code quality](../../docs/code-quality.md).
For prerequisite installation/runtime recovery use [developer setup](../development/README.md).
For baseline/comparison commands, scope and MCP use [advisory health](health.md).

| Responsibility | Owner |
| --- | --- |
| Runtime, image identity, direct Docker/Podman invocation and receipts | `run.mjs`, `local-settings.mjs` |
| Saved/indexed source, selected files and immutable input identity | `snapshot.mjs` |
| Offline selected checks, rendering and failure reports | `container.mjs`, `checks.mjs` |
| Disposable-clone regressions and local QA evidence | `verify.mjs`, `pr-report.mjs` |
| Combined CI comment and API lifecycle | `ci-comment.mjs` |
| Pinned platform analyzer, MCP and health reports | `jscpd.mjs`, `install-analysis.mjs`, `mcp-client.mjs`, `health.mjs`, `health-report.mjs` |
| Offline image dependencies and browser settings | `Dockerfile`, package/requirements manifests, `puppeteer.json` |

## Image lifecycle

The image key hashes only the Dockerfile and container dependency manifests.
Check scripts/browser settings are mounted read-only from the checked snapshot.
Runs use `--rm --network=none`, read-only inputs, writable reports, no host socket
and no credentials. Full mode invokes MegaLinter directly; repository checks still
run after a MegaLinter failure. Both statuses remain in reports.

Setup retains working-tree/index dependency images and any image used by running
or stopped containers. Only unused `localhost/advent-quality:<hash>` tags are removed.
`node tools/quality/run.mjs clean` removes even the current unused image; run setup
before checking again. Temporary snapshots/render files are removed; reports remain.

See [health verification](health-verification.md) for historical measurements and
[the current review](../development/tooling-review.md) for simplification decisions.
