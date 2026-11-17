import assert from 'node:assert/strict';
import test from 'node:test';
import { addPreviousRelease, encoded, previousSha, releaseSha, releaseWrites,
  setInitialHistory, sourceCommit, tagFixture, tagWrites } from './release-tag-fixture.mjs';

test('Given a future initial release, When finalizing, Then published notes identify exact source without claiming deployment success', async () => {
  // Given an eligible release without an earlier finalized stable version.
  const fixture = tagFixture();
  setInitialHistory(fixture, [sourceCommit('3'.repeat(40))]);

  // When the exact workflow program finalizes it.
  await fixture.run();

  // Then its first publication records immutable provenance and source history.
  const write = releaseWrites(fixture)[0].body;
  assert.equal(write.draft, false);
  assert.equal(write.prerelease, false);
  assert.equal(write.make_latest, 'true');
  assert.match(write.body, /Initial release/);
  assert.match(write.body, /Improve calendar by @contributor/);
  assert.ok(write.body.includes(`Deploy merge: ${releaseSha}`));
  assert.ok(write.body.includes(`https://github.com/owner/repo/commits/${releaseSha}`));
  assert.match(write.body, /Sliplane deployment and live checks must be verified separately/);
  assert.match(tagWrites(fixture)[0].body.message, /Release publication policy: 00022-v1/);
  assert.ok(fixture.summary.join('\n').includes('/releases/tag/v1.0.0'));
});

test('Given a historical predecessor without a Release, When publishing the next version, Then generated notes use its exact comparison', async () => {
  // Given a validated prior release tag but no corresponding GitHub Release.
  const fixture = tagFixture();
  addPreviousRelease(fixture);

  // When finalization generates the consecutive release notes.
  await fixture.run();

  // Then historical source bounds the generated notes and immutable comparison.
  const generated = fixture.calls.find(call => call.path === 'releases/generate-notes');
  assert.equal(generated.body.previous_tag_name, 'v0.9.0');
  assert.equal(generated.body.target_commitish, releaseSha);
  assert.ok(releaseWrites(fixture)[0].body.body.includes(`/compare/${previousSha}...${releaseSha}`));
  assert.equal(releaseWrites(fixture).length, 1);
});

test('Given newer and unrelated tags, When selecting a predecessor, Then only the nearest deploy ancestor bounds notes', async () => {
  // Given a real deploy predecessor alongside unrelated and later-version tags.
  const fixture = tagFixture();
  addPreviousRelease(fixture);
  fixture.values['tags?per_page=100&page=1'].push(
    { name: 'v9.0.0', commit: { sha: '9'.repeat(40) } },
    { name: 'v0.9.9', commit: { sha: '8'.repeat(40) } });

  // When finalization selects the previous version.
  await fixture.run();

  // Then neither unrelated nor newer tags supplies a comparison boundary.
  assert.equal(fixture.calls.find(call => call.path === 'releases/generate-notes').body.previous_tag_name, 'v0.9.0');
  assert.equal(fixture.calls.some(call => call.path.includes('9'.repeat(40))), false);
});

test('Given another finalized tag off the deploy first-parent chain, When publishing, Then only the actual deploy predecessor is selected', async () => {
  // Given a higher candidate version on another ancestry and a lower real deploy predecessor.
  const fixture = tagFixture();
  addPreviousRelease(fixture, { version: '0.9.9', sha: '9'.repeat(40) });
  addPreviousRelease(fixture, { version: '0.8.0', sha: '8'.repeat(40) });
  fixture.values[`git/commits/${previousSha}`].parents = [{ sha: '8'.repeat(40) }, { sha: '9'.repeat(40) }];

  // When the event's deploy ancestry is followed.
  await fixture.run();

  // Then the other finalized tag cannot replace the first-parent predecessor.
  assert.equal(fixture.calls.find(call => call.path === 'releases/generate-notes').body.previous_tag_name, 'v0.8.0');
  assert.equal(fixture.calls.some(call => call.path === `git/ref/tags/v0.9.9`), false);
});

for (const [label, change] of [
  ['version mismatch', fixture => { fixture.values[`contents/VERSION?ref=${previousSha}`] = encoded('0.8.0\n'); }],
  ['source tree mismatch', fixture => { fixture.values[`git/commits/${previousSha}`].tree.sha = 'other-tree'; }],
  ['wrong merge parent', fixture => { fixture.values[`git/commits/${previousSha}`].parents[1].sha = '4'.repeat(40); }],
]) {
  test(`Given a predecessor with ${label}, When publishing, Then invalid historical provenance blocks Release creation`, async () => {
    // Given an apparent prior release with an inconsistent immutable input.
    const fixture = tagFixture();
    addPreviousRelease(fixture);
    change(fixture);

    // When finalization attempts to use it as a comparison boundary.
    const action = () => fixture.run();

    // Then no Release is published from an invalid comparison.
    await assert.rejects(action, /Invalid previous finalized release provenance/);
    assert.equal(releaseWrites(fixture).length, 0);
  });
}

test('Given paginated source history through a release wrapper, When publishing, Then notes include source PRs and exclude later associations', async () => {
  // Given two pages of exact source commits with wrapper and future PR associations.
  const fixture = tagFixture();
  addPreviousRelease(fixture);
  const first = Array.from({ length: 100 }, (_, index) => sourceCommit(index.toString(16).padStart(40, '0')));
  const last = sourceCommit('5'.repeat(40), 'Direct improvement');
  fixture.values[`compare/${previousSha}...${releaseSha}?per_page=100&page=1`] = { commits: first };
  fixture.values[`compare/${previousSha}...${releaseSha}?per_page=100&page=2`] = { commits: [last] };
  const sourcePr = { number: 12, merged_at: '2026-11-17T08:00:00Z', title: 'Improve recipient access',
    merge_commit_sha: first[0].sha, base: { ref: 'main', repo: { full_name: 'owner/repo' } }, user: { login: 'alice' } };
  for (const commit of [...first, last]) fixture.values[`commits/${commit.sha}/pulls?per_page=100&page=1`] = [];
  fixture.values[`commits/${first[0].sha}/pulls?per_page=100&page=1`] = [sourcePr,
    { ...sourcePr, number: 7, title: 'Release wrapper' },
    { ...sourcePr, number: 13, title: 'Later branch changes', merge_commit_sha: '9'.repeat(40) }];

  // When notes are assembled from the exact paginated comparison.
  await fixture.run();

  // Then meaningful source changes appear independently of generated wrapper notes.
  const body = releaseWrites(fixture)[0].body.body;
  assert.match(body, /Improve recipient access by @alice/);
  assert.match(body, /Direct improvement by @contributor/);
  assert.doesNotMatch(body, /Later branch changes/);
  assert.equal((body.match(/Improve recipient access/g) ?? []).length, 1);
});

test('Given paginated tag and PR listings, When publishing, Then the predecessor found on later pages bounds the notes', async () => {
  // Given unrelated first pages and the valid predecessor on the second pages.
  const fixture = tagFixture();
  addPreviousRelease(fixture);
  fixture.values['tags?per_page=100&page=2'] = fixture.values['tags?per_page=100&page=1'];
  fixture.values['tags?per_page=100&page=1'] = Array.from({ length: 100 }, (_, index) => ({ name: `scratch-${index}` }));
  fixture.values['pulls?state=closed&base=deploy&per_page=100&page=2'] = fixture.values['pulls?state=closed&base=deploy&per_page=100&page=1'];
  fixture.values['pulls?state=closed&base=deploy&per_page=100&page=1'] = Array.from({ length: 100 }, () => ({ merged_at: null }));

  // When the workflow traverses all listing pages.
  await fixture.run();

  // Then it finds the predecessor rather than treating this as an initial release.
  assert.equal(fixture.calls.find(call => call.path === 'releases/generate-notes').body.previous_tag_name, 'v0.9.0');
});

test('Given source PR associations on later pages, When composing initial notes, Then all source contributors are included once', async () => {
  // Given a commit with a hundred irrelevant associations before its actual source PR.
  const fixture = tagFixture();
  const commit = sourceCommit('3'.repeat(40));
  setInitialHistory(fixture, [commit]);
  fixture.values[`commits/${commit.sha}/pulls?per_page=100&page=1`] = Array.from({ length: 100 }, () => ({ number: 20, merged_at: null }));
  fixture.values[`commits/${commit.sha}/pulls?per_page=100&page=2`] = [{ number: 12,
    merged_at: '2026-11-17T08:00:00Z', merge_commit_sha: commit.sha, title: 'Source contribution',
    base: { ref: 'main', repo: { full_name: 'owner/repo' } }, user: { login: 'alice' } }];

  // When the workflow discovers all associated PR pages.
  await fixture.run();

  // Then the source PR and its contributor survive pagination.
  assert.match(releaseWrites(fixture)[0].body.body, /Source contribution by @alice/);
});
