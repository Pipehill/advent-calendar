# Lint and configuration specialist

Follow the [shared contract](README.md). Analyze markdownlint, yamllint, jsonlint,
actionlint, whitespace, line endings, conflict markers and filename checks.
Read the detailed diagnostic, exact source and configuration; distinguish invalid
source from invalid linter settings. Report the precise rule and source location.
For case collisions identify both paths, including unchanged candidate files.
For line endings distinguish normalized index contents from editor contents.

Propose the smallest correction preserving product meaning. Reproduce with
`node tools/quality/run.mjs staged` for the matching staged snapshot or
`node tools/quality/run.mjs full` for a repository report. Never enable implicit fixes.
