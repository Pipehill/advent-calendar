import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNewVersion, compareVersions, metadata, recordedVersion, refreshMetadata, validateMirrors,
} from './release-api.mjs';
import { prepareRelease } from './release-prepare.mjs';
import { assertCandidate, assertMigrationIntegrity, currentReleaseVersion } from './release-validation.mjs';

const mainSha = 'a'.repeat(40);
const deploySha = 'b'.repeat(40);

function fixture({ sameTree = false, version = '1.0.0', open = [], closed = [], tags = [] } = {}) {
  const calls = [];
  const values = {
    'commits/main': { sha: mainSha, commit: { tree: { sha: 'main-tree' } } },
    'commits/deploy': { sha: deploySha, commit: { tree: { sha: sameTree ? 'main-tree' : 'deploy-tree' } } },
    'tags?per_page=100&page=1': tags,
    'pulls?state=closed&base=deploy&per_page=100&page=1': closed,
    'pulls?state=open&base=deploy&per_page=100&page=1': open,
  };
  const contents = {
    VERSION: `${version}\n`,
    'src/frontend/package.json': JSON.stringify({ version }),
    'src/contract/openapi.json': JSON.stringify({ info: { version } }),
  };
  for (const [path, text] of Object.entries(contents)) {
    values[`contents/${path}?ref=${mainSha}`] = { encoding: 'base64', content: Buffer.from(text).toString('base64') };
  }
  const api = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (options.method === 'POST' && path === 'pulls') {
      const pr = { number: 1, html_url: 'https://example.test/pull/1', body: options.body.body,
        head: { ref: 'main', repo: { full_name: 'owner/repo' } } };
      values['pulls?state=open&base=deploy&per_page=100&page=1'] = [pr];
      return pr;
    }
    if (options.method === 'PATCH') return {};
    assert.ok(Object.hasOwn(values, path), `Unexpected API call: ${path}`);
    return values[path];
  };
  return { api, calls, values };
}

function onlyWrite(calls, path) {
  const writes = calls.filter(call => call.method);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, path);
  return writes[0].body;
}

test('Given identical trees and an already used version, When preparing, Then it succeeds without version or PR operations', async () => {
  // Given an unchanged deployment with a previously published version.
  const { api, calls } = fixture({ sameTree: true });

  // When the owner prepares another release.
  const result = await prepareRelease(api, 'owner/repo', 'refs/heads/main');

  // Then no version reads or PR changes occur.
  assert.match(result, /No changes/);
  assert.deepEqual(calls.map(call => call.path).sort(), ['commits/deploy', 'commits/main']);
});

test('Given a non-main selected ref, When preparing, Then it rejects before any API call', async () => {
  // Given an incorrectly selected branch.
  const { api, calls } = fixture();

  // When preparation is requested.
  const action = () => prepareRelease(api, 'owner/repo', 'refs/heads/other');

  // Then it cannot create a PR or change refs.
  await assert.rejects(action, /main branch selected/);
  assert.equal(calls.length, 0);
});

test('Given a missing deploy branch, When preparing, Then it reports a manual bootstrap error', async () => {
  // Given an API where deploy does not exist.
  const { api } = fixture();
  const missingDeploy = (path, options) => path === 'commits/deploy' ? Promise.reject(new Error('HTTP 404')) : api(path, options);

  // When preparing the first release.
  const action = () => prepareRelease(missingDeploy, 'owner/repo', 'refs/heads/main');

  // Then no branch is created automatically.
  await assert.rejects(action, /bootstrap deploy manually/);
});

test('Given the first changed release, When preparing, Then it creates one main-to-deploy PR with captured version and source', async () => {
  // Given changed trees and no prior releases.
  const { api, calls } = fixture();

  // When preparation runs.
  const result = await prepareRelease(api, 'owner/repo', 'refs/heads/main');

  // Then only a PR is written and the owner receives its URL and next steps.
  const created = onlyWrite(calls, 'pulls');
  assert.equal(created.head, 'main');
  assert.equal(created.base, 'deploy');
  assert.match(created.body, new RegExp(mainSha));
  assert.equal(recordedVersion(created.body), '1.0.0');
  assert.match(result, /https:\/\/example.test\/pull\/1/);
  assert.match(result, /Deploy readiness/);
});

test('Given an owner-edited open release PR, When preparing again, Then it preserves owner prose and checklist', async () => {
  // Given owner prose outside the workflow-owned metadata block.
  const ownerText = '\n\nOwner notes\n- [x] Backup downloaded.\n';
  const open = [{ number: 3, head: { ref: 'main', repo: { full_name: 'owner/repo' } },
    body: `${metadata('1.0.0', deploySha)}${ownerText}`, html_url: 'https://example.test/pull/3' }];
  const { api, calls } = fixture({ version: '1.1.0', open, tags: [{ name: 'v1.0.0' }] });

  // When preparation refreshes the intended release version.
  const result = await prepareRelease(api, 'owner/repo', 'refs/heads/main');

  // Then the same PR is reused without rewriting the owner's content.
  const updated = onlyWrite(calls, 'pulls/3');
  assert.equal(updated.body, `${metadata('1.1.0', mainSha)}${ownerText}`);
  assert.match(result, /pull\/3/);
});

test('Given a release PR already created by preparation, When preparing again, Then it returns the same PR without another write', async () => {
  // Given an existing candidate created by an earlier successful run.
  const { api, calls } = fixture();
  await prepareRelease(api, 'owner/repo', 'refs/heads/main');
  const earlierWrites = calls.filter(call => call.method).length;

  // When serialized preparation runs again with unchanged source and version.
  const result = await prepareRelease(api, 'owner/repo', 'refs/heads/main');

  // Then its URL is reused without duplicate creation or metadata changes.
  assert.match(result, /https:\/\/example.test\/pull\/1/);
  assert.equal(calls.filter(call => call.method).length, earlierWrites);
});

test('Given an unfinished merged release, When preparing the next version, Then it requires finalization first', async () => {
  // Given a merged release whose final tag is missing.
  const closed = [{ number: 2, merged_at: '2026-11-14', head: { ref: 'main', repo: { full_name: 'owner/repo' } },
    body: metadata('1.0.0', mainSha), merge_commit_sha: deploySha }];
  const { api, calls } = fixture({ version: '1.1.0', closed });

  // When another release is prepared.
  const action = () => prepareRelease(api, 'owner/repo', 'refs/heads/main');

  // Then the missing final tag blocks creation of another release.
  await assert.rejects(action, /retry Tag release/);
  assert.equal(calls.filter(call => call.method).length, 0);
});

test('Given numeric SemVer components, When comparing versions, Then ordering uses numbers and rejects reused versions', () => {
  // Given stable release versions including a multi-digit minor.
  const tags = [{ name: 'v1.9.0' }, { name: 'v1.10.0' }];

  // When comparing a later patch and a reused version.
  const ordering = compareVersions('1.10.1', '1.9.99');
  const reused = () => assertNewVersion('1.10.0', tags);

  // Then numeric ordering succeeds and a reused version is rejected.
  assert.equal(ordering, 1);
  assert.throws(reused, /must exceed/);
  assert.doesNotThrow(() => assertNewVersion('1.10.1', tags));
});

test('Given a version mirror drift, When validating release files, Then the release fails without rewriting source', () => {
  // Given a package version different from VERSION.
  const packageText = '{"version":"1.0.1"}';

  // When release files are validated.
  const action = () => validateMirrors('1.0.0\n', packageText, '{"info":{"version":"1.0.0"}}');

  // Then the mismatch is reported.
  assert.throws(action, /versions differ/);
});

test('Given source commits with an unchanged version, When refreshing preparation, Then owner metadata remains valid', () => {
  // Given an existing candidate with a recorded version.
  const body = metadata('1.0.0', deploySha);

  // When main advances without a version bump.
  const updated = refreshMetadata(body, '1.0.0', mainSha);

  // Then the version remains valid and the prepared source is refreshed.
  assert.equal(recordedVersion(updated), '1.0.0');
  assert.match(updated, new RegExp(mainSha));
});

function candidatePullRequest() {
  return {
    number: 3, state: 'open', body: metadata('1.0.0', mainSha),
    head: { ref: 'main', sha: mainSha, repo: { full_name: 'owner/repo' } },
    base: { ref: 'deploy', sha: deploySha, repo: { full_name: 'owner/repo' } },
  };
}

test('Given repaired release metadata and an old workflow event body, When validation is rerun, Then it reads the repaired version for the same candidate', async () => {
  // Given the original event remains stale after Prepare release updates the PR body.
  const eventPr = candidatePullRequest();
  const current = { ...eventPr, body: metadata('1.1.0', mainSha) };
  const paths = [];
  const api = async path => { paths.push(path); return current; };

  // When the owner reruns the existing failed PR validation from Actions.
  const version = await currentReleaseVersion(api, eventPr, 'owner/repo');

  // Then current metadata repairs validation without requiring a source commit or new event.
  assert.equal(version, '1.1.0');
  assert.equal(recordedVersion(eventPr.body), '1.0.0');
  assert.deepEqual(paths, ['pulls/3']);
});

for (const change of ['source-commit', 'base-commit', 'source-branch', 'source-repository', 'base-branch', 'base-repository', 'closed']) {
  test(`Given changed release provenance (${change}), When a prior workflow is rerun, Then current metadata cannot validate another candidate`, async () => {
    // Given the API now describes a different head, base, repository, branch or closed PR.
    const eventPr = candidatePullRequest();
    const current = structuredClone(eventPr);
    if (change === 'source-commit') current.head.sha = 'c'.repeat(40);
    if (change === 'base-commit') current.base.sha = 'd'.repeat(40);
    if (change === 'source-branch') current.head.ref = 'other';
    if (change === 'source-repository') current.head.repo.full_name = 'fork/repo';
    if (change === 'base-branch') current.base.ref = 'main';
    if (change === 'base-repository') current.base.repo.full_name = 'other/repo';
    if (change === 'closed') current.state = 'closed';

    // When an old run attempts to consume the current PR metadata.
    const action = () => currentReleaseVersion(async () => current, eventPr, 'owner/repo');

    // Then validation fails instead of attaching repaired metadata to an untested candidate.
    await assert.rejects(action, /same-repository main to deploy|Release candidate changed/);
  });
}

test('Given a changed published migration, When checking release integrity, Then it rejects even without release tags', () => {
  // Given the initial deploy baseline migration.
  const name = 'src/backend/Calendar.Api/Migrations/0001_initial.sql';
  const base = { [name]: 'original' };

  // When a candidate edits that published resource.
  const action = () => assertMigrationIntegrity(base, { [name]: 'changed' });

  // Then integrity fails against the base commit.
  assert.throws(action, /Published migration changed/);
});

test('Given a renamed published migration, When checking release integrity, Then it rejects removal of the journaled resource identity', () => {
  // Given a released migration and a candidate with the same contents under a different name.
  const base = { 'src/backend/Calendar.Api/Migrations/0001_initial.sql': 'original' };
  const candidate = { 'src/backend/Calendar.Api/Migrations/0001_renamed.sql': 'original' };

  // When published identities are checked against the exact deploy baseline.
  const action = () => assertMigrationIntegrity(base, candidate);

  // Then unchanged contents do not authorize renaming the journaled script.
  assert.throws(action, /Published migration changed, deleted or renamed/);
});

test('Given a new uniquely numbered migration, When checking release integrity, Then it retains old scripts and allows the addition', () => {
  // Given an unchanged published resource and a new migration.
  const base = { 'src/backend/Calendar.Api/Migrations/0001_initial.sql': 'original' };
  const candidate = { ...base, 'src/backend/Calendar.Api/Migrations/0002_next.sql': 'new' };

  // When release integrity is verified.
  const action = () => assertMigrationIntegrity(base, candidate);

  // Then the additive migration is accepted.
  assert.doesNotThrow(action);
});

test('Given duplicate migration numbers, When checking release integrity, Then it rejects ambiguous ordering', () => {
  // Given two candidate resources sharing a sequence.
  const candidate = {
    'src/backend/Calendar.Api/Migrations/0001_initial.sql': 'one',
    'src/backend/Calendar.Api/Migrations/0001_other.sql': 'two',
  };

  // When release integrity is verified.
  const action = () => assertMigrationIntegrity({}, candidate);

  // Then the conflicting sequence fails.
  assert.throws(action, /duplicated/);
});

test('Given a deploy-only change in the candidate, When checking provenance, Then it rejects a different source tree', () => {
  // Given the synthetic candidate differs from main.
  const parents = [deploySha, mainSha];

  // When the candidate tree is checked.
  const action = () => assertCandidate('different-tree', 'main-tree', deploySha, parents);

  // Then deployment-only modifications cannot silently enter a release.
  assert.throws(action, /differs from main/);
});
