# Quality checks

This tool checks repository formatting, filenames, local Markdown links and Mermaid
diagrams. It runs pinned linters in an isolated Linux container and preserves source
files and the original Git index. Reports are saved in `quality-reports/<mode>/`.

Start with [developer setup and doctor](../development/README.md). Run quality
commands from the repository root with Node, Git and a reachable Linux container
runtime. Setup saves the runtime path in ignored local settings; an explicit
`QUALITY_CONTAINER_RUNTIME` takes precedence. CI uses Docker without local settings.
See [code quality](../../docs/code-quality.md) for rules and troubleshooting.

| Command | Purpose |
| --- | --- |
| `node tools/quality/run.mjs setup` | Prepare the dependency image and remove obsolete unused quality images. |
| `node tools/quality/run.mjs staged` | Check staged contents before committing. |
| `node tools/quality/run.mjs full` | Check the complete working tree with MegaLinter and custom checks. |
| `node tools/quality/run.mjs test` | Run custom checks and focused checker regressions. |
| `node tools/quality/verify.mjs` | Verify hooks and staging behavior in a disposable clone. |
| `node tools/quality/pr-report.mjs` | Generate a PR body with local hook evidence matching HEAD. |
| `node --test tools/quality/ci-comment.test.mjs` | Verify CI comment rendering and API behavior without publishing. |
| `node tools/quality/run.mjs clean` | Remove all quality images that no container references. |

| File | Responsibility |
| --- | --- |
| `run.mjs` | Prepare snapshots, manage images, start containers and remove temporary inputs. |
| `container.mjs` | Run checks inside the container and collect reports. |
| `checks.mjs` | Inspect filenames, text, links and Mermaid fences. |
| `verify.mjs` | Verify successful and failing cases without changing the original repository. |
| `pr-report.mjs` | Verify local hook evidence and populate the PR template's Local QA section. |
| `ci-comment.mjs` | Create or update the CI report comment after isolated quality checks. |
| `ci-comment.test.mjs` | Verify report outcomes, size limits, comment updates and API failures. |
| `Dockerfile` | Install the pinned tools, Python packages and Chromium. |
| `package*.json`, `requirements.txt` | Pin container dependencies. |
| `pre-commit-requirements.txt` | Pin the host hook dependencies. |
| `puppeteer.json` | Configure Chromium for diagram rendering. |

The dependency image changes only when the Dockerfile or container dependency files
change. Check scripts and browser settings are mounted read-only from the snapshot,
so editing them does not create another image. Existing dependency layers are reused.

After a successful `setup`, cleanup retains the working-tree and staged dependency
versions and any image referenced by a running or stopped container. Cleanup only
removes tags belonging to this tool (`localhost/advent-quality:<hash>`); other images,
the MegaLinter base and build caches are preserved. Shared layers remain while another
image needs them. `clean` removes even the current unused dependency image; run `setup`
before checking again. Temporary snapshots, render files and completed containers are
removed automatically; reports remain available for diagnosis.
