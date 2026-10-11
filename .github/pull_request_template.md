# Pull request

## Description

<!-- Briefly describe what changed and why. -->

## Code health

<!-- Generate with node tools/quality/health.mjs pr origin/main HEAD,
or use node tools/quality/pr-report.mjs after committing.
Fetch and regenerate whenever the target base or PR head changes.
Copy quality-reports/health/pr/comparison.md here, explain regressions/tradeoffs,
and preserve those explanations when regenerating. -->

⚪ **Unavailable**: no whole-codebase comparison matching the target and PR head.

These measurements support review and do not block merging. Required behavior
can legitimately increase complexity; review the changes and their rationale.

## Local QA

<!-- Generate after committing on the machine used to push:
node tools/quality/pr-report.mjs
Copy the Local QA section from quality-reports/pull-request.md into this section.
Regenerate after every PR head update. Missing evidence must remain unverified.
-->

Local pre-commit verification: ⚪ **Not provided**.
