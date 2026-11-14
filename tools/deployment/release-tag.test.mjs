import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { metadata } from './release-api.mjs';

// Execute the exact workflow-owned program; the contents-write job never checks
// out a repository or loads its JavaScript files under that privileged token.
const workflow = fs.readFileSync(new URL('../../.github/workflows/tag-release.yml', import.meta.url), 'utf8');
const inline = workflow.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0];
const program = inline.replace(/^ {10}/gm, '').replace("import fs from 'node:fs';\n", '');

function tagFixture({ existing, merged = true, mergeSha = 'b'.repeat(40), bodyVersion = '1.0.0' } = {}) {
  const calls = [];
  const summary = [];
  const event = { pull_request: {
    number: 7, merged, merge_commit_sha: mergeSha, body: metadata(bodyVersion, 'a'.repeat(40)),
    head: { ref: 'main', sha: 'a'.repeat(40), repo: { full_name: 'owner/repo' } },
    base: { ref: 'deploy', repo: { full_name: 'owner/repo' } },
  } };
  const values = {
    'pulls/7': structuredClone(event.pull_request),
    [`git/commits/${mergeSha}`]: { parents: [{ sha: 'd'.repeat(40) }, { sha: 'a'.repeat(40) }], tree: { sha: 'release-tree' } },
    [`git/commits/${'a'.repeat(40)}`]: { tree: { sha: 'release-tree' } },
    'git/ref/tags/v1.0.0': existing ?? null,
  };
  const inputs = { VERSION: '1.0.0\n', 'src/frontend/package.json': '{"version":"1.0.0"}',
    'src/contract/openapi.json': '{"info":{"version":"1.0.0"}}' };
  for (const [path, value] of Object.entries(inputs)) {
    values[`contents/${path}?ref=${mergeSha}`] = { encoding: 'base64', content: Buffer.from(value).toString('base64') };
  }
  const context = {
    Buffer,
    console: { log() {} },
    process: { env: { GITHUB_EVENT_PATH: 'event', GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'test',
      GITHUB_STEP_SUMMARY: 'summary' } },
    fs: { readFileSync: () => JSON.stringify(event), appendFileSync: (_path, text) => summary.push(text) },
    fetch: async (url, options) => {
      const path = url.replace('https://api.github.com/repos/owner/repo/', '');
      const body = options.body && JSON.parse(options.body);
      calls.push({ path, method: options.method, body });
      let value;
      if (options.method === 'POST' && path === 'git/tags') {
        value = { sha: 'c'.repeat(40) };
        values[`git/tags/${value.sha}`] = { object: { type: 'commit', sha: body.object } };
      } else if (options.method === 'POST' && path === 'git/refs') {
        value = { object: { type: 'tag', sha: body.sha } };
        values['git/ref/tags/v1.0.0'] = value;
      } else {
        assert.ok(Object.hasOwn(values, path), `Unexpected API path: ${path}`);
        value = values[path];
      }
      return { status: value === null ? 404 : 200, ok: value !== null, json: async () => value };
    },
  };
  return { calls, summary, values, event, run: () => vm.runInNewContext(`(async () => {\n${program}\n})()`, context) };
}

test('Given an exact merged release, When finalizing after branches advance, Then its annotated tag targets only the event merge commit', async () => {
  // Given an older merged release whose event contains its immutable merge SHA.
  const fixture = tagFixture();

  // When finalization runs without consulting moving branches.
  await fixture.run();

  // Then an annotated tag and new ref identify the exact merge commit.
  const writes = fixture.calls.filter(call => call.method === 'POST');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].path, 'git/tags');
  assert.equal(writes[0].body.object, 'b'.repeat(40));
  assert.equal(writes[0].body.type, 'commit');
  assert.equal(writes[1].body.ref, 'refs/tags/v1.0.0');
  assert.match(fixture.summary[0], /verify Sliplane deployment health separately/);
});

test('Given a previously finalized release, When retrying finalization, Then it succeeds without writing or moving a tag', async () => {
  // Given the first successful finalization.
  const fixture = tagFixture();
  await fixture.run();
  const firstWriteCount = fixture.calls.filter(call => call.method === 'POST').length;

  // When the same closed event is retried.
  await fixture.run();

  // Then the existing annotated tag is verified and no additional writes occur.
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, firstWriteCount);
  assert.equal(fixture.summary.length, 2);
});

test('Given a conflicting existing tag, When finalizing, Then it fails without moving or deleting the tag', async () => {
  // Given the desired version already points to another commit.
  const fixture = tagFixture({ existing: { object: { type: 'commit', sha: 'e'.repeat(40) } } });

  // When finalization attempts to publish the merged release.
  const action = () => fixture.run();

  // Then no mutation is sent.
  await assert.rejects(action, /never move it/);
  assert.equal(fixture.calls.filter(call => call.method !== 'GET').length, 0);
});

test('Given an unmerged closed PR, When invoking finalization, Then it rejects before creating a tag', async () => {
  // Given the owner closed rather than merged the PR.
  const fixture = tagFixture({ merged: false });

  // When the finalization program is invoked.
  const action = () => fixture.run();

  // Then the workflow's defense in depth rejects without API access.
  await assert.rejects(action, /Invalid merged release provenance/);
  assert.equal(fixture.calls.length, 0);
});

test('Given stale prepared version metadata, When finalizing, Then it rejects the inconsistent release', async () => {
  // Given the recorded candidate version differs from the merged source.
  const fixture = tagFixture({ bodyVersion: '1.0.1' });

  // When finalization reads the exact merged version inputs.
  const action = () => fixture.run();

  // Then it refuses to publish a tag.
  await assert.rejects(action, /Stale Prepare release metadata/);
  assert.equal(fixture.calls.filter(call => call.method !== 'GET').length, 0);
});

test('Given a failed tag run with stale event metadata, When current PR metadata is repaired and the run is retried, Then it tags the original merge without redeployment', async () => {
  // Given a failure whose stored event body cannot change between run attempts.
  const fixture = tagFixture({ bodyVersion: '1.0.1' });

  // When the first finalization reads the stale candidate metadata.
  const firstAttempt = fixture.run();

  // Then it refuses to create a tag.
  await assert.rejects(firstAttempt, /Stale Prepare release metadata/);

  // Given the owner repairs the PR record without modifying the stored event.
  fixture.values['pulls/7'].body = metadata('1.0.0', 'a'.repeat(40));

  // When the owner retries after correcting only the PR's release metadata.
  await fixture.run();

  // Then the stale payload stays untouched and the tag still identifies the event merge.
  assert.equal(fixture.event.pull_request.body, metadata('1.0.1', 'a'.repeat(40)));
  const tag = fixture.calls.find(call => call.method === 'POST' && call.path === 'git/tags');
  assert.equal(tag.body.object, 'b'.repeat(40));
  assert.equal(tag.body.tag, 'v1.0.0');
});

for (const [scenario, change] of [
  ['merge-commit', current => { current.merge_commit_sha = 'e'.repeat(40); }],
  ['source-commit', current => { current.head.sha = 'e'.repeat(40); }],
]) {
  test(`Given repaired metadata with changed ${scenario} provenance, When retrying finalization, Then it refuses all tag writes`, async () => {
    // Given repaired metadata whose current provenance differs from the immutable event.
    const fixture = tagFixture({ bodyVersion: '1.0.1' });
    const current = fixture.values['pulls/7'];
    current.body = metadata('1.0.0', 'a'.repeat(40));
    change(current);

    // When the original event is retried against that changed PR record.
    const action = () => fixture.run();

    // Then metadata repair cannot redirect release identity to another commit.
    await assert.rejects(action, /no longer matches the event release provenance/);
    assert.equal(fixture.calls.filter(call => call.method !== 'GET').length, 0);
  });
}
