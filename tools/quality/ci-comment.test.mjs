import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComment, publishComment, commentMarker } from './ci-comment.mjs';

const context = {
  revision: 'abc123', runUrl: 'https://github.com/owner/repo/actions/runs/1',
  setupOutcome: 'success', checkOutcome: 'success',
  megaReport: '## MegaLinter report\n\n| Linter | Errors |\n| --- | --- |\n| markdownlint | 0 |',
  summary: 'All applicable checks passed.',
};

test('reports include MegaLinter output and additional checks with an aggregate outcome', () => {
  const passed = buildComment(context);
  assert(passed.includes('✅ **Passed**'));
  assert(passed.includes(context.megaReport));
  assert(!passed.includes('Additional repository checks'));
  assert(!passed.includes(context.summary));
  const failed = buildComment({ ...context, checkOutcome: 'failure', summary: 'README.md:3 [links/target] Missing target.' });
  assert(failed.includes('Additional repository checks'));
  assert(failed.includes('README.md:3 [links/target] Missing target.'));
  assert(buildComment({ ...context, checkOutcome: 'failure' }).includes('❌ **Failed or incomplete**'));
  const missing = buildComment({ ...context, setupOutcome: 'failure', checkOutcome: 'skipped', megaReport: '', summary: '' });
  assert(missing.includes('No MegaLinter report was produced'));
  assert(missing.includes('No additional-check report was produced'));
  assert(!missing.includes('✅ **Passed**'));
  assert(missing.includes('Additional repository checks'));
  assert(!buildComment({ ...context, summary: `${context.summary}\n` }).includes('Additional repository checks'));
});

test('large Unicode reports remain within the comment byte limit', () => {
  const body = buildComment({ ...context, megaReport: '❌'.repeat(50000), summary: '❌'.repeat(50000) });
  assert(Buffer.byteLength(body) < 65536);
  assert(body.includes('Report truncated'));
  assert(body.includes(context.runUrl));
});

function fakeApi(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      assert(responses.length, 'Unexpected API request');
      const response = responses.shift();
      return { ok: response.status === undefined, status: response.status, json: async () => response.data };
    },
  };
}

const request = { repository: 'owner/repo', number: 9, revision: 'abc123', body: 'report', token: 'test-token' };

test('creates a comment when no bot report exists', async () => {
  const api = fakeApi([{ data: { head: { sha: 'abc123' } } }, { data: [] }, { data: {} }]);
  await publishComment({ ...request, fetchImpl: api.fetchImpl });
  assert.equal(api.calls[2].method, 'POST');
  assert(api.calls[2].url.endsWith('/issues/9/comments'));
  assert.deepEqual(JSON.parse(api.calls[2].body), { body: 'report' });
});

test('paginates and updates only the matching Actions bot comment', async () => {
  const firstPage = Array.from({ length: 100 }, () => ({ user: { login: 'someone' }, body: commentMarker }));
  const api = fakeApi([
    { data: { head: { sha: 'abc123' } } }, { data: firstPage },
    { data: [{ id: 42, user: { login: 'github-actions[bot]' }, body: `${commentMarker}\nold report` }] },
    { data: {} },
  ]);
  await publishComment({ ...request, fetchImpl: api.fetchImpl });
  assert(api.calls[2].url.endsWith('page=2'));
  assert.equal(api.calls[3].method, 'PATCH');
  assert(api.calls[3].url.endsWith('/issues/comments/42'));
});

test('an outdated PR run does not overwrite the current report', async () => {
  const api = fakeApi([{ data: { head: { sha: 'new-head' } } }]);
  await publishComment({ ...request, fetchImpl: api.fetchImpl });
  assert.equal(api.calls.length, 1);
});

test('API publication failures fail explicitly', async () => {
  const api = fakeApi([{ status: 403 }]);
  await assert.rejects(publishComment({ ...request, fetchImpl: api.fetchImpl }), /GitHub comment API failed \(403/);
});
