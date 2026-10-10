# Report-analysis verification

The main agent applied the specialist contracts directly to disposable verification
reports on 2026-10-10. This environment's execution policy does not authorize spawning
specialists for this task; direct use follows the shared fallback instructions.
Reproduce the fixture suite with `node tools/quality/verify.mjs`; reports include
snapshot identity, pinned tool versions and failing staged source under each case's
`source/` directory. Read matching source and configurations before diagnosing.

| Check and evidence | Location and supported cause | Correction and verification |
| --- | --- | --- |
| markdownlint, `all-agreed-violations/markdownlint.log`, MD009 and MD041 | `bad.md:1`: one trailing space and no top-level heading | Remove the space and add a heading; rerun the staged command. The corrected fixture passes. |
| yamllint, `all-agreed-violations/yamllint.log`, syntax error | `bad.yaml:2:1`: unclosed flow sequence on line 1 | Close the sequence or remove the invalid fixture; rerun the staged command. |
| jsonlint, `all-agreed-violations/jsonlint.log`, Duplicate key: a | `bad.json:1:11`: two members use the same key | Retain one member or use distinct keys; rerun the staged command with duplicate-key validation enabled. |
| actionlint, `all-agreed-violations/actionlint.log`, events | `.github/workflows/bad.yml:2:6`: unknown webhook event invalid_event | Use a supported event such as pull_request; rerun the staged command. |
| Mermaid, `all-agreed-violations/mermaid.log`, Parse error on line 2 | `bad.md` fence starts at line 5; its sequence text uses an unescaped semicolon | Replace the literal semicolon with `#59;`. Corrected rendering and the full command pass. |
| Local links, `all-agreed-violations/findings.json`, local-link | `bad.md:3`: absent.md is not in the candidate tree | Point to an existing repository document. Corrected fixtures pass; rename/deletion cases also detect inbound failures. |
| Runner, `runner-failure.log`, Container runtime unavailable | No source location: deliberately missing executable, no source checking completed | Select the installed runtime, run setup if needed, then rerun the original full command. Do not attribute this to Markdown. |

The reproduction command for every row is `node tools/quality/verify.mjs`, which
reconstructs the same fixtures in a disposable clone. Individual findings use
`node tools/quality/run.mjs staged` with their matching staged inputs, followed by
`node tools/quality/run.mjs full` after correction. The main agent applied fixture
corrections; no specialist edited or committed source. Missing source, mismatched
snapshot hashes or absent detailed logs would leave the diagnosis uncertain.
