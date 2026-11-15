# 00022: Release descriptions and GitHub Releases

Status: Not implemented

Last updated: 2026-11-15

Improve the release automation delivered by [plan 00021](00021-sliplane-deployment.md).
Remove checkboxes from release PR descriptions and extend **Tag release** to
create a GitHub Release with notes about changes since the previous release.
These are two related open TODO items; deployment readiness remains owned by
00021 rather than being planned again here.

## Requirements

1. Newly prepared and refreshed release PR descriptions contain no Markdown task
   checkboxes. Preserve release metadata, readable operator instructions, links
   and owner-written text when refreshing an existing open release PR.
2. After validating and finalizing a version tag, Tag release creates the
   corresponding GitHub Release with notes describing the changes since the
   previous release. Record the version, exact deploy merge commit, release PR
   and comparison range so the owner can identify the represented source.
3. Release creation follows the verified same-repository `main`-to-`deploy` merge
   and its immutable `vX.Y.Z` tag. Reject conflicting tags and invalid provenance
   before writing a Release. Later branch movement must not change its source.
4. Repeated finalization must recover a missing Release after successful tagging
   without moving tags, creating duplicate Releases or overwriting owner edits.
   Failures are visible and retryable independently of a Sliplane redeployment.
5. Retain manual release merging, existing validation and version rules, minimal
   workflow permissions and the API-only write-token job. A GitHub Release records
   source identity; it must not claim that hosting or live checks succeeded.

## Outstanding questions

The owner explicitly deferred clarification on 2026-11-15. The options below are
proposals, not confirmed requirements; resolve the relevant choices before
implementing dependent publication behavior.

1. Should notes be GitHub-generated PR/contributor notes, an editorial summary of
   user-visible changes, or both? Repository development content is English;
   should public release notes also have a Norwegian version? Proposed starting
   point: English generated notes plus an exact comparison link, reviewed for
   whether they adequately describe the changes through the release-merge history.
2. Should finalization publish the Release immediately or create a draft for owner
   review? Proposed: publish stable Releases automatically after validated tagging.
   Confirm how older reruns should affect GitHub's Latest designation and any
   notifications; an old retry must not accidentally become the newest release.
3. Does “each finalized version tag” include backfilling tags created before this
   change? If so, which versions and how should existing manually written Releases
   be handled? Proposed: preserve existing Releases and offer an explicit,
   provenance-checked backfill rather than silently publishing old versions.

## Implementation details

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

- Convert task-list markers to ordinary list markers in generated descriptions,
  preserving instruction text and the `advent-release` metadata block. Refresh
  existing open release PRs as well as newly created ones. Keep owner prose;
  conversion may remove a checkbox marker but must not delete its associated text.
  Keep workflow-summary wording consistent without changing release validation.
- Use GitHub's release API after successful tag verification, within the existing
  token boundary. Look up a Release by tag before creating one and re-read after
  a concurrent creation conflict. Distinguish absence from authorization/rate-limit
  failures; never treat every API error as permission to create a new object.
- Select the previous finalized stable version on the event release's deploy
  ancestry, excluding the current tag and future/unrelated tags. Do not use the
  moving `main` tip or GitHub's latest Release as the sole comparison boundary:
  older tags may have no Release yet. Validate the chosen tag/commit and explicitly
  handle an initial release with no predecessor. Note format/publication/backfill
  still depend on the questions above.
- If generated notes are selected, pass an explicit previous tag when there is
  one and use the verified current tag/merge as the upper bound. Inspect actual
  output for the long-lived `main`/`deploy` merge history; supplement it if it
  lists only release-wrapper PRs and omits meaningful changes. Do not add an LLM
  service, token or new runtime dependency to generate summaries.
- Return the Release URL in the workflow summary. Preserve existing notes on a
  same-tag retry, and report incompatible draft/publication metadata for review
  rather than silently replacing it.
- Do not make GitHub Release existence a new `assertFinalized` preparation gate
  without an explicit owner decision. The tag gate continues to protect source
  provenance; the finalization run reports publication failure separately.

### Work order

1. [ ] Resolve publication, note-format and historical-tag scope questions.
2. [ ] Replace release-PR checkboxes and cover new/existing PR refresh behavior.
3. [ ] Add API-only Release creation, exact-range notes and retry recovery to Tag
   release; update the inline workflow test fixture for the new API calls.
4. [ ] Update [deployment operations](../../docs/deployment.md) with the resulting
   note policy, partial-failure recovery and the distinction between tag, Release
   and live deployment. Preserve implemented plans unchanged.
5. [ ] Complete code/configuration verification under the shared quality rules;
   record final evidence in [deployment verification](../../docs/deployment-verification.md).

## Verification

| Requirement | Evidence to collect during implementation |
| --- | --- |
| 1 | Fresh and refreshed PR bodies have zero task-list markers, valid identical release metadata and all original instruction/owner text. Cover checked and unchecked markers, repeated refresh and version/source changes. Existing metadata parser tests still pass. |
| 2 | Notes for consecutive finalized versions identify the correct previous tag and exact event merge, include representative source changes and exclude later main/deploy changes. Cover first release, tag without a Release, pagination and unrelated/newer tags. Verify the chosen note/publication policy from the resolved questions. |
| 3, 5 | Existing provenance, mirror mismatch, wrong merge, conflicting tag and unmerged-close tests still reject without Release writes. Inspect workflow permissions and confirm no checkout or repository code execution in the write-token job. |
| 4 | Tag succeeds/Release creation fails, then retry creates exactly one Release without tag mutation. Cover existing Release with edited notes, concurrent creation, forbidden/rate-limited API response and old-version rerun. Verify the agreed Latest/draft policy. |
| 5 | Existing release validation tests and relevant tooling tests pass; run required full quality/health review for the eventual code/configuration change. Rehearse publication in a disposable repository or API fixture; production publishing needs the normal release operation. |

## Sources checked on 2026-11-15

[GitHub's Releases API](https://docs.github.com/en/rest/releases/releases) documents
Release creation, lookup by tag and generated notes with a previous-tag input.
These are API capabilities, not evidence that repository permissions or actual
release-note contents have been verified. Recheck endpoint compatibility with the
workflow's pinned API version during implementation.
