import assert from 'node:assert/strict';
import test from 'node:test';
import { encoded, publicationPolicy, publishedRelease, releaseSha, releaseWrites,
  tagFixture, tagWrites } from './release-tag-fixture.mjs';

test('Given an existing Release with owner edits, When retrying, Then publication and notes remain untouched', async () => {
  // Given a published version whose owner has edited the description.
  const fixture = tagFixture();
  fixture.rememberRelease(publishedRelease());

  // When finalization retries for the same exact source.
  await fixture.run();

  // Then no Release mutation or note generation occurs.
  assert.equal(releaseWrites(fixture).length, 0);
  assert.equal(fixture.calls.some(call => call.path === 'releases/generate-notes'), false);
  assert.equal(fixture.values['releases/tags/v1.0.0'].body, 'Owner-written release notes');
});

for (const annotated of [false, true]) {
  test(`Given a historical ${annotated ? 'annotated' : 'lightweight'} tag, When retrying, Then no historical Release is created`, async () => {
    // Given a finalized pre-policy tag pointing to the correct event source.
    const fixture = tagFixture({ existing: { object: { type: annotated ? 'tag' : 'commit', sha: annotated ? '6'.repeat(40) : releaseSha } } });
    if (annotated) fixture.values[`git/tags/${'6'.repeat(40)}`] = { message: 'Release 1.0.0', object: { type: 'commit', sha: releaseSha } };

    // When the historical version is finalized again.
    await fixture.run();

    // Then neither tags nor Releases change.
    assert.equal(fixture.calls.some(call => call.method === 'POST'), false);
    assert.match(fixture.summary.join('\n'), /Historical tag/);
  });
}

test('Given a delayed event whose source lacks the policy, When tagging after rollout, Then it remains outside future publication scope', async () => {
  // Given an old release merge without the new workflow marker.
  const fixture = tagFixture();
  fixture.values[`contents/.github/workflows/tag-release.yml?ref=${releaseSha}`] = encoded('name: Tag release\n');

  // When the delayed finalization creates its tag.
  await fixture.run();

  // Then immutable tag provenance excludes Release publication on this and later retries.
  assert.doesNotMatch(tagWrites(fixture)[0].body.message, /Release publication policy/);
  assert.equal(releaseWrites(fixture).length, 0);

  // When the newly created historical tag is retried.
  await fixture.run();

  // Then the immutable exclusion remains in force.
  assert.equal(releaseWrites(fixture).length, 0);
});

test('Given missing immutable workflow provenance, When creating a future tag, Then no release identity is written', async () => {
  // Given eligible source content but no pinned workflow commit in the Actions environment.
  const fixture = tagFixture();
  delete fixture.env.GITHUB_WORKFLOW_SHA;

  // When finalization attempts to establish future publication eligibility.
  const action = () => fixture.run();

  // Then incomplete immutable provenance prevents every write.
  await assert.rejects(action, /Missing immutable workflow provenance/);
  assert.equal(fixture.calls.some(call => call.method === 'POST'), false);
});

test('Given successful tagging followed by publication failure, When retrying independently, Then one Release is published without moving the tag', async () => {
  // Given the publication endpoint fails after an eligible immutable tag succeeds.
  const fixture = tagFixture();
  fixture.respond('POST', 'releases', { status: 503 });

  // When the first attempt reaches that failure.
  const firstAttempt = () => fixture.run();

  // Then the failure reports an independently retryable publication operation.
  await assert.rejects(firstAttempt, /HTTP 503/);
  assert.match(fixture.summary.join('\n'), /no redeployment or tag movement is needed/);
  assert.ok(fixture.values[`git/tags/${'c'.repeat(40)}`].message.includes(publicationPolicy));

  // When the same event is retried after endpoint recovery.
  await fixture.run();

  // Then only the original tag writes exist and exactly one Release was saved.
  assert.equal(tagWrites(fixture).length, 2);
  assert.equal(fixture.values['releases?per_page=100&page=1'].length, 1);
});

for (const status of [409, 422]) {
  test(`Given a concurrent publication returning HTTP ${status}, When finalizing, Then the existing Release wins without edits`, async () => {
    // Given another publisher creates the same stable Release during our POST.
    const fixture = tagFixture();
    fixture.respond('POST', 'releases', () => {
      fixture.rememberRelease(publishedRelease());
      return { status };
    });

    // When our creation receives the conflict response.
    await fixture.run();

    // Then recovery preserves the concurrent publisher's notes without another POST.
    assert.equal(releaseWrites(fixture).length, 1);
    assert.equal(fixture.values['releases/tags/v1.0.0'].body, 'Owner-written release notes');
  });
}

for (const status of [403, 422, 429]) {
  test(`Given publication HTTP ${status} without an existing Release, When finalizing, Then the API failure remains visible`, async () => {
    // Given a forbidden, validation, or rate-limited response without a competing object.
    const fixture = tagFixture();
    fixture.respond('POST', 'releases', { status });

    // When the publication request fails.
    const action = () => fixture.run();

    // Then no successful publication or extra notification request is fabricated.
    await assert.rejects(action, new RegExp(`HTTP ${status}`));
    assert.equal(releaseWrites(fixture).length, 1);
    assert.equal(fixture.values['releases/tags/v1.0.0'], null);
  });
}

for (const status of [403, 429]) {
  test(`Given Release lookup HTTP ${status}, When checking publication recovery, Then lookup failure is never treated as absence`, async () => {
    // Given a lookup blocked by authorization or rate limiting.
    const fixture = tagFixture();
    fixture.respond('GET', 'releases/tags/v1.0.0', { status });

    // When publication checks whether the version already exists.
    const action = () => fixture.run();

    // Then a failed lookup cannot authorize creating a duplicate Release.
    await assert.rejects(action, new RegExp(`HTTP ${status}`));
    assert.equal(releaseWrites(fixture).length, 0);
  });
}

test('Given a newer published version on a later listing page, When recovering an older Release, Then it cannot replace Latest', async () => {
  // Given a newer stable Release hidden beyond the first API page.
  const fixture = tagFixture();
  fixture.values['releases?per_page=100&page=1'] = Array.from({ length: 100 }, () => publishedRelease('v0.1.0'));
  fixture.values['releases?per_page=100&page=2'] = [publishedRelease('v2.0.0')];

  // When the old version receives its first successful publication.
  await fixture.run();

  // Then its explicit creation policy preserves Latest.
  assert.equal(releaseWrites(fixture)[0].body.make_latest, 'false');
});

test('Given a tag changed during note generation, When checking the publication target, Then no Release is written', async () => {
  // Given a valid new tag whose ref is changed by an external writer before publication.
  const fixture = tagFixture();
  fixture.respond('GET', 'git/ref/tags/v1.0.0', { status: 404 },
    { status: 200, value: { object: { type: 'commit', sha: releaseSha } } },
    { status: 200, value: { object: { type: 'commit', sha: '9'.repeat(40) } } });

  // When the final exact-source check observes the changed ref.
  const action = () => fixture.run();

  // Then source identity cannot be silently redirected by Release creation.
  await assert.rejects(action, /Final tag changed before Release publication/);
  assert.equal(releaseWrites(fixture).length, 0);
});

test('Given a newer version published while notes are generated, When creating the older Release, Then the refreshed policy preserves Latest', async () => {
  // Given a new stable version appears after the initial duplicate lookup.
  const fixture = tagFixture();
  fixture.respond('GET', 'releases?per_page=100&page=1',
    { status: 200, value: [] }, { status: 200, value: [publishedRelease('v2.0.0')] });

  // When the workflow rechecks publication state immediately before creation.
  await fixture.run();

  // Then the newer publication controls the explicit Latest policy.
  assert.equal(releaseWrites(fixture)[0].body.make_latest, 'false');
});

for (const [version, newer] of [['1.9.0', '1.10.0'], ['9007199254740992.0.0', 'v9007199254740993.0.0']]) {
  test(`Given published ${newer}, When recovering v${version}, Then numeric version ordering protects Latest`, async () => {
    // Given a newer version that lexical or floating-point comparison could misorder, including a manual tag without v.
    const fixture = tagFixture({ version });
    fixture.values['releases?per_page=100&page=1'] = [publishedRelease(newer)];

    // When the older exact source receives its first publication.
    await fixture.run();

    // Then explicit Latest policy follows exact numeric SemVer ordering.
    assert.equal(releaseWrites(fixture)[0].body.make_latest, 'false');
  });
}

for (const metadata of [{ draft: true, published_at: null }, { prerelease: true }]) {
  const kind = metadata.draft ? 'draft' : 'prerelease';
  test(`Given an existing same-tag ${kind}, When finalizing a stable release, Then metadata conflicts require review`, async () => {
    // Given an incompatible Release visible only through the authenticated listing.
    const fixture = tagFixture();
    fixture.values['releases?per_page=100&page=1'] = [publishedRelease('v1.0.0', metadata)];

    // When stable publication inspects the existing object.
    const action = () => fixture.run();

    // Then no republishing or replacement occurs.
    await assert.rejects(action, /incompatible publication metadata/);
    assert.equal(releaseWrites(fixture).length, 0);
  });
}
