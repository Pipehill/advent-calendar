# 00022: Release descriptions and GitHub Releases

Status: Implemented (2026-11-17)

Last updated: 2026-11-17

Implementation type: ci

Improve the release automation delivered by [plan 00021](00021-sliplane-deployment.md).
Remove checkboxes from release PR descriptions and extend **Tag release** to
create a GitHub Release with notes about changes since the previous release.
These are two related open TODO items; deployment readiness remains owned by
00021 rather than being planned again here.

## Requirements

1. Newly prepared and refreshed release PR descriptions contain no Markdown task
   checkboxes. Preserve release metadata, readable operator instructions, links
   and owner-written text when refreshing an existing open release PR.
2. For future releases after this automation takes effect, Tag release creates
   the corresponding GitHub Release after validating and finalizing its version
   tag. Use automatically generated English notes with PRs/contributors and an
   exact comparison link describing the changes since the previous release.
   Include actual source changes even when the release is assembled through a
   release-wrapper PR. Record the version, exact deploy merge commit, release PR
   and comparison range so the owner can identify the represented source.
3. Release creation follows the verified same-repository `main`-to-`deploy` merge
   and its immutable `vX.Y.Z` tag. Reject conflicting tags and invalid provenance
   before writing a Release. Later branch movement must not change its source.
4. For releases within the future-only scope, repeated finalization must recover
   a missing Release after successful tagging without moving tags, creating
   duplicate Releases or overwriting owner edits. Failures are visible and
   retryable independently of a Sliplane redeployment.
5. Retain manual release merging, existing validation and version rules, minimal
   workflow permissions and the API-only write-token job. A GitHub Release records
   source identity; it must not claim that hosting or live checks succeeded.
6. Publish stable Releases automatically after validated tagging, rather than
   creating drafts for owner review. An older-version retry must never take over
   GitHub's Latest designation. Retain ordinary GitHub notifications on a
   version's first publication; add no separate notification on retries and do
   not republish an existing Release.
7. Preserve existing Releases. Do not create Releases for version tags finalized
   before this automation takes effect, including through an old workflow retry.
   Any historical backfill requires a separate task.

## Outstanding questions

None. The owner approved the note format, automatic publication policy and
future-only scope on 2026-11-17; the confirmed choices are recorded below.

## Implementation details

### Confirmed release policy

The owner approved all three proposals on 2026-11-17:

- Generate English release notes automatically, including PRs/contributors and
  an exact comparison link. Verify that the represented source changes appear
  even when they arrive through a combined release PR. A separate editorial
  summary and Norwegian release notes are not required.
- Publish stable Releases automatically after validated tagging. Preserve an
  existing Release and its owner edits on retry; an older version must never
  replace Latest. Use ordinary GitHub notifications on the first publication of
  a version, with no separate retry notification. Recovering a missing Release
  is that version's first publication, rather than republishing an existing one.
- Apply Release creation only to future releases after the new automation takes
  effect. Preserve existing Releases; historical backfill is deferred to a
  separate task and is outside this plan. Earlier validated tags can still bound
  the comparison for a future release without receiving a Release themselves.

### Repository facts and scope

- `tools/deployment/release-prepare.mjs` creates a checkbox-based PR body and
  appends the same checklist to its workflow summary. Existing open PRs currently
  receive only a metadata refresh through `refreshMetadata` in `release-api.mjs`.
- `.github/workflows/tag-release.yml` validates the event and current PR, reads
  version mirrors at the exact merge SHA, checks merge parents/tree and creates
  or verifies an annotated tag. It currently creates no GitHub Release.
- `assertFinalized` in `release-api.mjs` checks closed release PRs against final
  tags. Its current contract says nothing about the existence of a Release.
- `release.test.mjs` covers preparation/validation, and `release-tag.test.mjs`
  executes the inline finalization program against a fake GitHub API. Extend these
  existing seams rather than executing checked-out repository code in the
  write-token workflow.
- This plan adds future release behavior. It does not repeat the existing owner
  deployment gates, reopen completed plans or attest to their live verification.

### Agent-selected implementation approach

Iteration 2 decisions: a newly created annotated tag records the immutable
`Release publication policy: 00022-v1` and workflow commit only when that policy
marker exists in the workflow at the event merge. An existing unmarked tag is
always historical, including a lightweight tag or a delayed old-code retry.
Marked tags retain recovery eligibility independently of subsequent branch moves.
Select the nearest validated lower stable tag by walking deploy's first parents;
source-side and newer tags cannot bound notes. Paginated exact-range commits and
their merged main PRs supplement GitHub's generated notes. An initial release
uses its complete pinned commit history to avoid GitHub guessing a previous tag.
No Release lookup is added to the preparation gate.

- Convert task-list markers to ordinary list markers in generated descriptions,
  preserving instruction text and the `advent-release` metadata block. Refresh
  existing open release PRs as well as newly created ones. Keep owner prose;
  conversion may remove a checkbox marker but must not delete its associated text.
  Keep workflow-summary wording consistent without changing release validation.
- Use GitHub's release API after successful tag verification, within the existing
  token boundary. Record a reproducible rollout boundary using immutable
  release/workflow provenance so historical retries cannot backfill old tags;
  do not infer future-only eligibility from a missing Release or the retry time.
  Look up a Release by tag before creating one and re-read after a concurrent
  creation conflict. Distinguish absence from authorization/rate-limit failures;
  never treat every API error as permission to create a new object.
- Select the previous finalized stable version on the event release's deploy
  ancestry, excluding the current tag and future/unrelated tags. Do not use the
  moving `main` tip or GitHub's latest Release as the sole comparison boundary:
  older tags may have no Release yet. Validate the chosen tag/commit and explicitly
  handle an initial release with no predecessor. Historical tags remain valid
  comparison boundaries without enabling historical Release creation.
- For generated notes, pass an explicit previous tag when there is
  one and use the verified current tag/merge as the upper bound. Inspect actual
  output for the long-lived `main`/`deploy` merge history; supplement it if it
  lists only release-wrapper PRs and omits meaningful changes. Do not add an LLM
  service, token or new runtime dependency to generate summaries.
- Return the Release URL in the workflow summary. Preserve existing notes on a
  same-tag retry, and report incompatible draft/publication metadata for review
  rather than silently replacing it.
- Create new eligible stable Releases as published, with an explicit Latest
  policy that prevents an older retry from displacing a newer release. Do not
  update an existing Release merely because finalization ran again, or add a
  separate retry-notification mechanism. Verify the relevant API behavior during
  implementation rather than assuming GitHub defaults satisfy this policy.
- Do not make GitHub Release existence a new `assertFinalized` preparation gate
  without an explicit owner decision. The tag gate continues to protect source
  provenance; the finalization run reports publication failure separately.

### Work order

1. [x] Resolve publication, note-format and historical-tag scope questions
   (owner approved 2026-11-17).
2. [x] Replace release-PR checkboxes and cover new/existing PR refresh behavior;
   verify with the preparation/validation suite and saved-source lint, then commit.
3. [x] Add future-only API Release creation, exact-range English notes, automatic
   publication, Latest protection and retry recovery to Tag release; update the
   inline workflow test fixture for the new API calls. Verify provenance, ancestry,
   range, publication and recovery with the exact inline API fixture, then commit.
4. [x] Update [deployment operations](../../docs/deployment.md) with the resulting
   note policy, partial-failure recovery and the distinction between tag, Release
   and live deployment. Preserve implemented plans unchanged. Review links and
   operational recovery against the implemented API behavior, then commit.
5. [x] Complete code/configuration verification under the shared quality rules;
   record final evidence in [deployment verification](../../docs/deployment-verification.md).

## Verification

Iteration 1: all 32 preparation/validation/tag tests and full saved-source quality
checks passed. MCP refresh found no introduced clones. Application health remains
92.5 and tooling health 50.7; tooling complexity score changes 63.9 to 63.8 with
34.3% to 34.4% share. Inspection traces this to the marker-conversion expression
and its necessary refresh cases; existing entry-point heuristic findings remain
unchanged. Baseline and raw MCP/comparison reports are retained locally.

Iteration 2: all 80 release/version tests pass, including exact workflow execution,
initial/consecutive notes, first-parent ancestry, API pagination, older Latest
recovery, large numeric versions, changed tags, partial failure/retry and conflict
handling. Independent read-only workflow review found no remaining blockers.
GitHub's real generated output for `v1.0.1...v1.0.2`, requested with API version
`2022-11-28`, includes source PRs #59, #60, #61, #62, #63 and #65 plus release #64;
the exact immutable comparison contains those seven source commits. This preview
created no Release. API fixtures rehearse publication; actual first-publication
notification delivery remains outside local evidence.

Health review removed an introduced six-line clone and split notes/publication
tests by behavior. Application health stays 92.5; tooling changes 50.7 to 50.5.
Tooling duplication improves 0.1019108280% to 0.0978792822% (12 lines/two clones
unchanged), complexity score 63.9 to 64.7 and share 34.3% to 33.1%. The remaining
decline is the verified `release-tag-fixture.mjs` unused-file heuristic (70%
confidence): all three workflow suites import this strict shared API simulator.
It preserves test isolation without repeating the simulator; deleting/inlining it
would reduce maintainability. YAML/inline JavaScript is outside authored-code
health scope. MCP's proposed-snippet match is the numeric SemVer comparator also
used by preparation; that small duplication preserves the API-only write-token
boundary without executing checked-out code. Raw measurements remain local.

Iteration 3: deployment operations now explain checkbox-free descriptions,
immutable future-only scope, exact-range notes, stable publication/Latest policy
and independent publication recovery. Final full quality checks, all 80 relevant
release/version tests, saved-source checks and the advisory comparison passed.
Evidence and material measurement/live limitations are recorded in deployment
verification. No application/schema/dependency inputs changed, so application
builds, database tests and live deployment were outside this verification scope.

| Requirement | Evidence to collect during implementation |
| --- | --- |
| 1 | Fresh and refreshed PR bodies have zero task-list markers, valid identical release metadata and all original instruction/owner text. Cover checked and unchecked markers, repeated refresh and version/source changes. Existing metadata parser tests still pass. |
| 2 | Automatically generated English notes for consecutive finalized versions identify the correct previous tag and exact event merge, include actual source PRs/contributors through the release-wrapper history and exclude later main/deploy changes. Include an exact comparison link. Cover first release, historical comparison tag without a Release, pagination and unrelated/newer tags. |
| 3, 5 | Existing provenance, mirror mismatch, wrong merge, conflicting tag and unmerged-close tests still reject without Release writes. Inspect workflow permissions and confirm no checkout or repository code execution in the write-token job. |
| 4, 6 | For an eligible future release, tag succeeds/Release creation fails, then retry publishes exactly one Release without tag mutation. Cover existing Release with edited notes, concurrent creation, forbidden/rate-limited API response and older-version rerun after a newer release. Verify automatic stable publication, no older takeover of Latest, no mutation or republication of an existing Release, and no separate retry notification. Check ordinary first-publication notification behavior without claiming notification delivery from API fixtures. |
| 5 | Existing release validation tests and relevant tooling tests pass; run required full quality/health review for the eventual code/configuration change. Rehearse publication in a disposable repository or API fixture; production publishing needs the normal release operation. |
| 7 | Verify the immutable rollout boundary distinguishes historical finalized tags from eligible future releases, including delayed/concurrent runs and retries. Historical tags without Releases receive no Release; existing Releases remain unchanged. A historical tag can still serve as the comparison predecessor of a future release. No backfill command or automatic historical publication is introduced. |

## Sources checked on 2026-11-15

[GitHub's Releases API](https://docs.github.com/en/rest/releases/releases) documents
Release creation, lookup by tag and generated notes with a previous-tag input.
These are API capabilities, not evidence that repository permissions or actual
release-note contents have been verified. Recheck endpoint compatibility with the
workflow's pinned API version during implementation.

Rechecked on 2026-11-17: GitHub documents explicit `make_latest` control,
first-publication notifications, tag lookup, authenticated draft listings and
generated notes with `previous_tag_name`. The real note preview confirmed the
existing pinned `2022-11-28` API version. Existing-tag Release creation omits the
unused `target_commitish` to retain contents-only token compatibility when older
workflow content differs from current main; the tag is re-verified immediately
before publication. Workflow concurrency serializes automated finalization;
manual tag/Release changes should not race it.
