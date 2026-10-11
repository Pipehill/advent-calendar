import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComment, publishComment, commentMarker } from './ci-comment.mjs';

const context = {
  revision: 'abc123', runUrl: 'https://github.com/owner/repo/actions/runs/1',
  setupOutcome: 'success', checkOutcome: 'success',
  megaReport: '## MegaLinter report\n\n| Linter | Errors |\n| --- | --- |\n| markdownlint | 0 |',
  summary: 'All applicable checks passed.',
};

test('Given passing checks, When the quality report is rendered, Then lint output is included without redundant success details', () => {
  // Given a completed run with successful lint and additional checks.
  const input = { ...context };

  // When the quality report is rendered.
  const passed = buildComment(input);

  // Then it includes the lint report and omits the redundant success summary.
  assert(passed.includes('✅ **Passed**'));
  assert(passed.includes(context.megaReport));
  assert(!passed.includes('Additional repository checks'));
  assert(!passed.includes(context.summary));
});

test('Given failed repository checks, When the quality report is rendered, Then diagnostics and aggregate failure are shown', () => {
  // Given a failed check with a concrete missing-link diagnostic.
  const input = { ...context, checkOutcome: 'failure', summary: 'README.md:3 [links/target] Missing target.' };

  // When the quality report is rendered.
  const failed = buildComment(input);

  // Then the failed check and its diagnostic are retained.
  assert(failed.includes('Additional repository checks'));
  assert(failed.includes('README.md:3 [links/target] Missing target.'));
  assert(failed.includes('❌ **Failed or incomplete**'));
});

test('Given failed setup and missing reports, When the quality report is rendered, Then missing evidence never appears successful', () => {
  // Given a run that failed before either report could be produced.
  const input = { ...context, setupOutcome: 'failure', checkOutcome: 'skipped', megaReport: '', summary: '' };

  // When the report is rendered.
  const missing = buildComment(input);

  // Then absent evidence is explicit and no successful result is claimed.
  assert(missing.includes('No MegaLinter report was produced'));
  assert(missing.includes('No additional-check report was produced'));
  assert(!missing.includes('✅ **Passed**'));
  assert(missing.includes('Additional repository checks'));
});

test('Given a successful summary with a trailing newline, When the report is rendered, Then redundant success details are still omitted', () => {
  // Given a successful summary containing a trailing line ending.
  const input = { ...context, summary: `${context.summary}\n` };

  // When the report is rendered.
  const body = buildComment(input);

  // Then the summary does not introduce an unnecessary section.
  assert(!body.includes('Additional repository checks'));
});

test('Given oversized Unicode reports, When the comment is rendered, Then it fits the byte limit and links to full artifacts', () => {
  // Given Unicode report text whose encoded byte length exceeds the comment limit.
  const input = { ...context, megaReport: '❌'.repeat(50000), summary: '❌'.repeat(50000) };

  // When the comment is rendered.
  const body = buildComment(input);

  // Then it stays within the limit and explains where full details remain available.
  assert(Buffer.byteLength(body) < 65536);
  assert(body.includes('Report truncated'));
  assert(body.includes(context.runUrl));
});

test('Given a successful run, When the report is rendered, Then the Code Quality header and successful steps identify what ran', () => {
  // Given a successful run with a full commit identity.
  const revision = 'd165ac6ab11f70d73be3244a39633c57175f9acc';

  // When the quality report is rendered.
  const body = buildComment({ ...context, revision });

  // Then the header and separate setup/lint steps are readable.
  assert(body.startsWith(`${commentMarker}\n## Code Quality\n\n`));
  assert(!body.includes('Commit:'));
  assert(body.includes('Overall code quality: ✅ **Passed**'));
  assert(body.includes('- ✅ Passed — **Quality tool setup**\n- ✅ Passed — **Lint and repository checks**'));
});

test('Given successful setup and failed lint, When the report is rendered, Then the two step outcomes remain distinct', () => {
  // Given a run that completed setup but failed lint.
  const input = { ...context, checkOutcome: 'failure' };

  // When the report is rendered.
  const failed = buildComment(input);

  // Then success of setup does not hide failure of lint.
  assert(failed.includes('- ✅ Passed — **Quality tool setup**\n- ❌ Failed — **Lint and repository checks**'));
});

for (const outcome of ['failure', 'skipped', 'cancelled', undefined]) {
  test(`Given failed setup and ${outcome ?? 'missing'} lint, When the report is rendered, Then incomplete execution never appears successful`, () => {
    // Given setup failure and a lint step that did not complete successfully.
    const input = { ...context, setupOutcome: 'failure', checkOutcome: outcome };

    // When the quality report is rendered.
    const incomplete = buildComment(input);

    // Then no successful aggregate or step markers appear.
    assert(incomplete.includes('- ❌ Failed — **Quality tool setup**'));
    assert(incomplete.includes('- ❌ '));
    assert(!incomplete.includes('Overall code quality: ✅ **Passed**'));
    assert(!incomplete.includes('- ✅'));
  });
}

for (const [label, ending] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`Given a MegaLinter report with ${label} endings and promotion, When rendered, Then only promotion is removed`, () => {
    // Given promotional content beside real diagnostics and an unrelated image.
    const banner = '[![MegaLinter is provided by OX Security]'
      + '(https://raw.githubusercontent.com/oxsecurity/megalinter/main/docs/assets/images/ox-banner.png)]'
      + '(https://www.ox.security/?ref=megalinter)';
    const support = 'Show us your support by [**starring ⭐ the repository**](https://github.com/oxsecurity/megalinter)';
    const diagnostic = 'README.md:3 MD013 Line length exceeded.';
    const unrelatedImage = '![Diagnostic image](https://example.com/diagnostic.png)';
    const megaReport = [context.megaReport, diagnostic, unrelatedImage,
      'See detailed reports in MegaLinter artifacts', '', banner, support, ''].join(ending);

    // When the failed report is rendered.
    const body = buildComment({ ...context, checkOutcome: 'failure', megaReport });

    // Then results, diagnostics, unrelated images and artifact links remain.
    assert(!body.includes(banner));
    assert(!body.includes(support));
    assert(body.includes(context.megaReport));
    assert(body.includes(diagnostic));
    assert(body.includes(unrelatedImage));
    assert(body.includes('See detailed reports in MegaLinter artifacts'));
    assert(body.includes('❌ **Failed or incomplete**'));
  });
}

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

function healthInput() {
  const identity = { kind: 'pr-merge', base: 'base123', head: context.revision, candidate: 'tree123' };
  const measurement = {
    available: true, schema: 1, tool: { version: '5.4.1', configHash: 'config123' },
    input: { scope: '*.mjs' }, health: { score: 50, dimensions: [] },
    complexity: { files: [{ path: 'example.mjs', complexity: 12 }] },
    deadCode: { findings: [{ path: 'example.mjs', category: 'unused-file', start: { line: 1 }, confidence: 70 }] },
    mcp: { statistics: { statistics: { total: {
      sources: 1, lines: 20, percentage: 0, clones: 0, duplicatedLines: 0,
    } } }, refresh: { duplications: [] } },
  };
  const healthComparison = {
    available: true, identity,
    before: { ...measurement, identity: { commit: identity.base } },
    after: { ...measurement, identity },
  };
  return { ...context, baseRevision: identity.base, healthOutcome: 'success', healthComparison };
}

test('Given matching health evidence, When the quality comment is rendered, Then separate health tables follow the lint report', () => {
  // Given health measurements matching the current PR head, target and candidate tree.
  const input = healthInput();

  // When the combined quality report is rendered.
  const body = buildComment(input);

  // Then lint and separate complexity/dead-code tables share the same comment.
  assert(body.indexOf(context.megaReport) < body.indexOf('## Code health'));
  assert(body.includes('| example.mjs | 12 |'));
  assert(body.includes('| example.mjs | unused-file | 1 | 70% |'));
});

for (const healthOutcome of ['failure', 'skipped', 'cancelled', undefined]) {
  test(`Given ${healthOutcome ?? 'missing'} health execution, When the report is rendered, Then health is unavailable while passing lint remains passed`, () => {
    // Given matching evidence from a health step that did not succeed.
    const input = healthInput();

    // When that health outcome is rendered.
    const failed = buildComment({ ...input, healthOutcome });

    // Then no health metrics are shown and the verified lint result remains successful.
    assert.match(failed, /Unavailable/);
    assert(!failed.includes('| example.mjs |'));
    assert(failed.includes('Overall code quality: ✅ **Passed**'));
  });
}

for (const [label, changed] of [
  ['an advanced head', { revision: 'new-head' }],
  ['an advanced target', { baseRevision: 'new-base' }],
  ['missing evidence', { healthComparison: undefined }],
]) {
  test(`Given ${label}, When the health report is rendered, Then stale or missing metrics remain unavailable`, () => {
    // Given evidence whose identity no longer matches, or which is absent entirely.
    const input = healthInput();

    // When the changed PR identity is rendered.
    const stale = buildComment({ ...input, ...changed });

    // Then stale file metrics cannot appear as current evidence.
    assert.match(stale, /Unavailable/);
    assert(!stale.includes('| example.mjs |'));
  });
}

test('Given conflicting candidate-tree evidence, When health is rendered, Then the identity conflict is explicitly unavailable', () => {
  // Given a measurement that identifies a different candidate tree than the comparison.
  const input = healthInput();
  input.healthComparison.after.identity = { ...input.healthComparison.identity, candidate: 'wrong-tree' };

  // When the conflicting evidence is rendered.
  const body = buildComment(input);

  // Then the conflict is disclosed instead of presenting misleading measurements.
  assert.match(body, /Unavailable.*Conflicting/);
});

const request = { repository: 'owner/repo', number: 9, revision: 'abc123', body: 'report', token: 'test-token' };

test('Given no existing bot report, When the current report is published, Then a new PR comment is created', async () => {
  // Given a matching PR head and an empty existing-comment list.
  const api = fakeApi([{ data: { head: { sha: 'abc123' } } }, { data: [] }, { data: {} }]);

  // When the report is published through the simulated API.
  await publishComment({ ...request, fetchImpl: api.fetchImpl });

  // Then the report body is posted to the PR comment endpoint.
  assert.equal(api.calls[2].method, 'POST');
  assert(api.calls[2].url.endsWith('/issues/9/comments'));
  assert.deepEqual(JSON.parse(api.calls[2].body), { body: 'report' });
});

test('Given a matching bot report on the second page, When the report is published, Then only that comment is updated', async () => {
  // Given a full page of human comments followed by the matching Actions bot comment.
  const firstPage = Array.from({ length: 100 }, () => ({ user: { login: 'someone' }, body: commentMarker }));
  const api = fakeApi([
    { data: { head: { sha: 'abc123' } } }, { data: firstPage },
    { data: [{ id: 42, user: { login: 'github-actions[bot]' }, body: `${commentMarker}\nold report` }] },
    { data: {} },
  ]);

  // When publication searches for an existing report.
  await publishComment({ ...request, fetchImpl: api.fetchImpl });

  // Then pagination finds and updates the bot comment instead of a human comment.
  assert(api.calls[2].url.endsWith('page=2'));
  assert.equal(api.calls[3].method, 'PATCH');
  assert(api.calls[3].url.endsWith('/issues/comments/42'));
});

test('Given an advanced PR head, When an older report is published, Then the current report is left untouched', async () => {
  // Given a live PR head that differs from the report revision.
  const api = fakeApi([{ data: { head: { sha: 'new-head' } } }]);

  // When the stale report attempts publication.
  await publishComment({ ...request, fetchImpl: api.fetchImpl });

  // Then only the identity lookup occurs and no comment mutation follows.
  assert.equal(api.calls.length, 1);
});

test('Given an advanced PR target, When an older health report is published, Then the current report is left untouched', async () => {
  // Given a matching head whose live target differs from the measured target.
  const api = fakeApi([{ data: { head: { sha: request.revision }, base: { sha: 'new-base' } } }]);

  // When stale target evidence attempts publication.
  await publishComment({ ...request, baseRevision: 'old-base', fetchImpl: api.fetchImpl });

  // Then publication ends after the identity lookup without modifying comments.
  assert.equal(api.calls.length, 1);
});

test('Given a forbidden GitHub API response, When report publication is attempted, Then the failure identifies the API status', async () => {
  // Given a simulated API that rejects its first request.
  const api = fakeApi([{ status: 403 }]);

  // When report publication is attempted.
  const publish = () => publishComment({ ...request, fetchImpl: api.fetchImpl });

  // Then the rejected promise names the GitHub API error and status.
  await assert.rejects(publish, /GitHub comment API failed \(403/);
});
