import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { connect } from './mcp-client.mjs';
import { configuration, root } from './jscpd.mjs';
import { measure, measureGroups, prComparison, git, validateStatistics, snapshot } from './health.mjs';
import { renderComparison, comparable, assessment } from './health-report.mjs';
import { buildComment } from './ci-comment.mjs';

function fixture(t, beforeCleanup = async () => {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'health test '));
  t.after(async () => {
    await beforeCleanup();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  git(directory, 'init', '-q');
  git(directory, 'config', 'core.autocrlf', 'false');
  save(directory, '.gitignore', 'quality-reports/\n.quality-cache/\nnode_modules/\n');
  return directory;
}

const block = `export function calculateTotal(values) {
  const selected = values.filter(value => value > 10);
  const multiplied = selected.map(value => value * 3);
  const total = multiplied.reduce((sum, value) => sum + value, 0);
  const rounded = Math.round(total * 100) / 100;
  console.log('calculated total', rounded);
  return { selected, multiplied, total, rounded };
}
`;

function save(directory, name, contents) {
  fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
  fs.writeFileSync(path.join(directory, name), contents);
}

function commit(directory, message) {
  git(directory, 'add', '.');
  git(directory, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=disabled-fixture-hooks', 'commit', '-qm', message);
  return git(directory, 'rev-parse', 'HEAD');
}

async function analyzerFixture(t) {
  let client;
  const directory = fixture(t, () => client?.close());
  save(directory, 'original.mjs', block);
  client = await connect(directory, configuration);
  await client.call('check_current_directory');
  return { directory, client };
}

test('Given an existing source block, When a proposed snippet is checked, Then MCP reports the matching file and source location', async t => {
  // Given an analyzer with a measurable source block in its initial scan.
  const { client } = await analyzerFixture(t);

  // When the same block is checked as a proposed snippet.
  const snippet = await client.call('check_duplication', { code: block, format: 'javascript' });

  // Then matching source locations identify the existing file.
  assert(snippet.count > 0);
  assert(snippet.duplications.some(item => item.file.endsWith('original.mjs') && item.fileStartLine >= 1));
});

test('Given a copy saved after scanning, When statistics are read without refresh, Then they still describe the previous scan', async t => {
  // Given a previously scanned file and a newly saved duplicate.
  const { directory, client } = await analyzerFixture(t);
  save(directory, 'copy.mjs', block);

  // When statistics are read without rescanning.
  const stale = validateStatistics(await client.call('get_statistics'));

  // Then the newly saved clone is absent from the old statistics.
  assert.equal(stale.clones, 0);
});

test('Given a newly saved copy, When MCP refreshes and reads file clones, Then the duplicate and both locations are reported', async t => {
  // Given an existing scan followed by a saved duplicate file.
  const { directory, client } = await analyzerFixture(t);
  save(directory, 'copy.mjs', block);

  // When the directory is rescanned and the new file is inspected.
  const refreshed = await client.call('check_current_directory');
  const clones = await client.call('get_file_clones', { path: 'copy.mjs' });

  // Then the fresh results contain the clone and identify its original source.
  assert(refreshed.clones > 0);
  assert(clones.duplications.some(item => item.fileA.includes('original') || item.fileB.includes('original')));
});

test('Given a previously scanned clone that is deleted, When MCP refreshes, Then that clone disappears', async t => {
  // Given a clone included in the last scan but subsequently removed from disk.
  const { directory, client } = await analyzerFixture(t);
  save(directory, 'copy.mjs', block);
  await client.call('check_current_directory');
  fs.unlinkSync(path.join(directory, 'copy.mjs'));

  // When the analyzer refreshes after deletion.
  const refreshed = await client.call('check_current_directory');

  // Then no duplicate remains.
  assert.equal(refreshed.clones, 0);
});

test('Given an unrelated working directory, When the documented stdio launcher runs, Then it resolves and scans the repository', async t => {
  // Given the documented launcher started outside the repository directory.
  const launch = () => ({ command: process.execPath,
    args: [path.join(root, 'tools/quality/jscpd.mjs')], cwd: os.tmpdir() });

  // When the client connects, refreshes and reads statistics.
  const client = await connect(root, configuration, launch);
  t.after(() => client.close());
  const refresh = await client.call('check_current_directory');
  const statistics = validateStatistics(await client.call('get_statistics'));

  // Then repository source is found despite the launcher's unrelated working directory.
  assert(refresh.files > 0);
  assert(statistics.sources > 0);
});

async function duplicationMeasurements(t) {
  const directory = fixture(t);
  save(directory, 'original.mjs', block);
  commit(directory, 'base');
  const reportDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'health reports '));
  t.after(() => fs.rmSync(reportDirectory, { recursive: true, force: true }));
  const before = await measure(directory, path.join(reportDirectory, 'before'), { kind: 'fixture' });
  save(directory, 'copy.mjs', block);
  return { directory, reportDirectory, before };
}

test('Given partial staging and excluded files, When saved source is measured, Then the full authored scope is used without changing Git state', async t => {
  // Given a baseline plus a partly staged duplicate and excluded/generated source.
  const { directory, reportDirectory, before } = await duplicationMeasurements(t);
  git(directory, 'add', 'copy.mjs');
  save(directory, 'copy.mjs', block + '\n// saved unstaged change\n');
  save(directory, 'node_modules/ignored.mjs', block);
  save(directory, 'generated/ignored.mjs', block);
  save(directory, 'unrelated.md', 'saved unrelated edit\n');
  const index = git(directory, 'ls-files', '--stage');
  const status = git(directory, 'status', '--porcelain');

  // When the saved working tree is measured.
  const after = await measure(directory, path.join(reportDirectory, 'after'), { kind: 'fixture' });

  // Then saved authored files contribute and exclusions/index/status remain respected.
  assert.equal(git(directory, 'ls-files', '--stage'), index);
  assert.equal(git(directory, 'status', '--porcelain'), status);
  assert(after.input.files.some(file => file.path === 'original.mjs'));
  assert(after.input.files.some(file => file.path === 'copy.mjs'));
  assert(!after.input.files.some(file => file.path.includes('ignored')));
  assert(after.mcp.statistics.statistics.total.duplicatedLines > before.mcp.statistics.statistics.total.duplicatedLines);
});

async function measuredComparison(t) {
  const { directory, reportDirectory, before } = await duplicationMeasurements(t);
  const after = await measure(directory, path.join(reportDirectory, 'after'), { kind: 'fixture' });
  return { available: true, before, after };
}

test('Given application, tooling and root source, When grouped health runs, Then scopes partition the unchanged reference settings', async t => {
  // Given measurable files in both scopes, including a root launcher and ignored output.
  const directory = fixture(t);
  save(directory, 'src/feature.mjs', block);
  save(directory, 'tools/helper.mjs', block);
  save(directory, 'launcher.mjs', block);
  save(directory, 'node_modules/ignored.mjs', block);
  const index = git(directory, 'ls-files', '--stage');

  // When all three views are measured from saved source.
  const report = await measureGroups(directory, path.join(directory, 'quality-reports/groups'));
  const { application, tooling } = report.groups;

  // Then the views cover every authored input with the same settings and preserve the index.
  assert.deepEqual(application.input.files.map(file => file.path), ['src/feature.mjs']);
  assert.deepEqual(tooling.input.files.map(file => file.path), ['launcher.mjs', 'tools/helper.mjs']);
  assert.deepEqual([...application.input.files, ...tooling.input.files].sort((a, b) => a.path.localeCompare(b.path)), report.input.files);
  assert.equal(application.tool.configHash, report.tool.configHash);
  assert.equal(tooling.tool.configHash, report.tool.configHash);
  assert.equal(comparable(application, tooling), 'Tool version, configuration, schema or source scope differs');
  assert.equal(git(directory, 'ls-files', '--stage'), index);
});

test('Given no application source, When grouped health runs, Then the missing scope stays unavailable beside valid reference and tooling results', async t => {
  // Given measurable tooling and no application files.
  const directory = fixture(t);
  save(directory, 'tools/helper.mjs', block);

  // When grouped measurement and reporting run.
  const report = await measureGroups(directory, path.join(directory, 'quality-reports/groups'));
  const rendered = renderComparison({ available: true, before: report, after: report });

  // Then missing input is explicit and does not become a zero score or hide other views.
  assert.equal(report.groups.application.available, false);
  assert.match(report.groups.application.reason, /Empty/);
  assert.equal(report.groups.tooling.available, true);
  assert.match(rendered, /Application code health\n\n.*Unavailable.*Empty/);
  assert.match(rendered, /Tooling code health\n\nOverall health/);
  assert.doesNotMatch(rendered, /Whole-repository code health/);
  assert.equal(rendered.match(/^## /gm).length, 2);
});

test('Given grouped PR evidence, When an application result has a stale head, Then its CI section is unavailable and other scopes retain evidence', async t => {
  // Given a PR changing application source while tooling remains present.
  const directory = fixture(t);
  save(directory, 'src/feature.mjs', block);
  save(directory, 'tools/helper.mjs', block);
  const base = commit(directory, 'base');
  save(directory, 'src/copy.mjs', block);
  const head = commit(directory, 'head');
  const report = await prComparison(base, head, directory);
  report.after.groups.application.identity = { ...report.identity, head: 'stale' };

  // When the existing CI publisher renders this evidence without any network publication.
  const body = buildComment({ revision: head, baseRevision: base, runUrl: 'https://example.invalid/run',
    setupOutcome: 'success', checkOutcome: 'success', healthOutcome: 'success', healthComparison: report });

  // Then a stale subgroup cannot inherit a successful current-head result.
  assert.match(body, /Application code health\n\n.*Unavailable.*Conflicting PR measurement identity/);
  assert.match(body, /Tooling code health\n\nTarget commit:/);
  assert.doesNotMatch(body, /Whole-repository code health/);
  assert.equal(body.match(/^## .*code health/gm).length, 2);
});

for (const direction of ['regression', 'improvement', 'unchanged']) {
  test(`Given a ${direction} in duplication, When the comparison is rendered, Then the direction and measured units are explicit`, async t => {
    // Given measured source before and after adding a real duplicate.
    const comparison = await measuredComparison(t);
    if (direction === 'improvement') {
      [comparison.before, comparison.after] = [comparison.after, comparison.before];
    } else if (direction === 'unchanged') {
      comparison.after = comparison.before;
    }

    // When that comparison is rendered.
    const text = renderComparison(comparison);

    // Then the direction and absolute/percentage measurements remain readable.
    const expected = { regression: /Regressed/, improvement: /Improved/, unchanged: /Unchanged/ };
    assert.match(text, expected[direction]);
    assert.match(text, /Duplicated lines/);
    assert.match(text, / pp/);
    if (direction !== 'unchanged') {
      assert.match(text, /original.mjs/);
    }
  });
}

for (const [label, delta, expected] of [
  ['an improved aggregate with duplication regression', 1, /Mixed results.*Regressions/],
  ['a declined aggregate', -1, /Overall health declined/],
]) {
  test(`Given ${label}, When the comparison is rendered, Then contributing regressions stay prominent`, async t => {
    // Given a real duplication regression with the selected aggregate-score direction.
    const comparison = await measuredComparison(t);
    comparison.after.health.score = comparison.before.health.score + delta;

    // When the comparison is rendered.
    const text = renderComparison(comparison);

    // Then aggregate improvement cannot hide a contributing regression or overall decline.
    assert.match(text, expected);
  });
}

for (const changedInput of ['tool version', 'configuration hash', 'dimension set']) {
  test(`Given a changed ${changedInput}, When measurements are compared, Then incompatible evidence is rejected`, async t => {
    // Given otherwise valid measurements with one incompatible analysis input.
    const comparison = await measuredComparison(t);
    if (changedInput === 'tool version') {
      comparison.after.tool.version = '0.0.0';
    } else if (changedInput === 'configuration hash') {
      comparison.after.tool.configHash = 'different-settings';
    } else {
      comparison.after.health.dimensions = [];
    }

    // When comparability is checked.
    const reason = comparable(comparison.before, comparison.after);

    // Then the incompatibility is reported instead of treating the measurements as comparable.
    assert(reason);
  });
}

for (const [label, report, expected] of [
  ['a protocol failure', { available: false, reason: 'protocol failed' }, /Unavailable.*protocol failed/],
  ['missing measurement evidence', { available: false }, /Unavailable.*Missing or failed measurement/],
]) {
  test(`Given ${label}, When the comparison is rendered, Then unavailable evidence is explicit`, () => {
    // Given a failed or missing comparison rather than measured results.
    const input = report;

    // When the report is rendered.
    const text = renderComparison(input);

    // Then the unavailable state and its reason are visible.
    assert.match(text, expected);
  });
}

test('Given unsupported shell dead-code analysis, When source is measured, Then that dimension remains unavailable', async t => {
  // Given measurable shell source outside the supported dead-code analyzer languages.
  const directory = fixture(t);
  const shellLines = Array.from({ length: 20 }, (_, index) => `value${index}=${index}`);
  shellLines.push('printf "%s\\n" "$value0" "$value1" "$value2" "$value3"');
  save(directory, 'script.sh', '#!/bin/sh\n' + shellLines.join('\n') + '\n');

  // When source is measured and its self-comparison rendered.
  const report = await measure(directory, path.join(directory, 'quality-reports/unsupported'));
  const dead = report.health.dimensions.find(item => item.id === 'dead-code');
  const text = renderComparison({ available: true, before: report, after: report });

  // Then an unsupported dimension is n/a rather than falsely clean.
  assert(!dead || dead.score == null);
  assert.match(text, /n\/a/);
});

test('Given supported JavaScript source, When dead-code analysis runs, Then heuristic findings retain numeric confidence', async t => {
  // Given a measurable JavaScript function with a heuristic unused-file finding.
  const directory = fixture(t);
  save(directory, 'source.mjs', block);

  // When the analyzer measures the source.
  const report = await measure(directory, path.join(directory, 'quality-reports/supported'));

  // Then findings are retained with their confidence values for human review.
  assert(report.deadCode.findings.length > 0);
  assert(report.deadCode.findings.every(finding => Number.isFinite(finding.confidence)));
});

function advancedTargetFixture(t) {
  const directory = fixture(t);
  save(directory, 'original.mjs', block);
  save(directory, 'deleted.mjs', 'console.log("old file with enough tokens", 1, 2, 3, 4, 5);\n');
  const ancestor = commit(directory, 'ancestor');
  save(directory, 'head.mjs', block);
  fs.unlinkSync(path.join(directory, 'deleted.mjs'));
  const head = commit(directory, 'head');
  git(directory, 'checkout', '-q', ancestor);
  save(directory, 'target.mjs', block);
  const base = commit(directory, 'advanced target');
  return { directory, ancestor, head, base };
}

test('Given an advanced target and PR additions/deletions, When the candidate merge is measured, Then combined source is included without changing the checkout', async t => {
  // Given diverged target/head commits with an added target file and a deleted head file.
  const { directory, base, head } = advancedTargetFixture(t);
  const status = git(directory, 'status', '--porcelain');

  // When whole-codebase candidate merge evidence is generated.
  const comparison = await prComparison(base, head, directory);
  const files = comparison.after.input.files.map(file => file.path);

  // Then both branches' source is represented and the checkout is untouched.
  assert(comparison.available, comparison.reason);
  assert.equal(comparison.identity.base, base);
  assert.equal(comparison.identity.head, head);
  assert(files.includes('target.mjs') && files.includes('head.mjs') && files.includes('original.mjs'));
  assert(!files.includes('deleted.mjs'));
  assert.equal(git(directory, 'status', '--porcelain'), status);
  assert.equal(git(directory, 'rev-parse', 'HEAD'), base);
});

test('Given valid PR merge evidence, When the compact comparison is rendered, Then identity precedes separate finding tables', async t => {
  // Given measured candidate merge evidence with real duplication locations.
  const { directory, base, head } = advancedTargetFixture(t);
  const comparison = await prComparison(base, head, directory);

  // When the compact report is rendered.
  const compact = renderComparison(comparison);
  const hotspots = compact.split('### Complexity hotspots')[1].split('### Dead-code findings')[0];

  // Then identity and each finding category have distinct readable sections.
  assert(compact.indexOf('Target commit:') < compact.indexOf('| Metric |'));
  assert.match(compact, /### Complexity hotspots\n\n\| File \| Complexity \|/);
  assert.match(compact, /### Dead-code findings \(heuristic\)\n\n\| File \| Finding \| Line \| Confidence \|/);
  assert.doesNotMatch(hotspots, /unused-file|confidence/i);
  assert.match(compact, /### Duplication locations/);
});

test('Given an updated PR head, When merge evidence is regenerated, Then the previous head files disappear from evidence', async t => {
  // Given a prior PR head with source not present in the advanced target.
  const { directory, base, head } = advancedTargetFixture(t);
  await prComparison(base, head, directory);

  // When evidence is regenerated for a head matching the target.
  const fresh = await prComparison(base, base, directory);

  // Then the new identity and source manifest replace the older evidence.
  assert.equal(fresh.identity.head, base);
  assert(!fresh.after.input.files.some(file => file.path === 'head.mjs'));
});

test('Given conflicting PR measurement identities, When the comparison is rendered, Then conflicting evidence is unavailable', async t => {
  // Given valid measurements attached to a different comparison head.
  const { directory, ancestor, base, head } = advancedTargetFixture(t);
  const comparison = await prComparison(base, head, directory);
  comparison.identity = { ...comparison.identity, head: ancestor };

  // When the conflicting comparison is rendered.
  const text = renderComparison(comparison);

  // Then stale identity cannot masquerade as current evidence.
  assert.match(text, /Unavailable.*Conflicting PR measurement identity/);
});

test('Given conflicting changes on target and head, When a candidate merge is measured, Then the conflict is unavailable', async t => {
  // Given both branches changing the same source expression differently.
  const { directory, head } = advancedTargetFixture(t);
  save(directory, 'original.mjs', block.replace('value * 3', 'value * 9'));
  const conflictingBase = commit(directory, 'target conflict');
  git(directory, 'checkout', '-q', head);
  save(directory, 'original.mjs', block.replace('value * 3', 'value * 7'));
  const conflictingHead = commit(directory, 'head conflict');

  // When merge evidence is requested for the conflicting commits.
  const conflict = await prComparison(conflictingBase, conflictingHead, directory);

  // Then conflict prevents available evidence.
  assert.equal(conflict.available, false);
  assert.match(renderComparison(conflict), /Unavailable/);
});

for (const [label, input, expected] of [
  ['malformed statistics', {}, /Invalid/],
  ['empty statistics', { statistics: { total: { sources: 0, lines: 0, clones: 0, duplicatedLines: 0, percentage: 0 } } }, /Empty/],
]) {
  test(`Given ${label}, When statistics are validated, Then invalid evidence is rejected`, () => {
    // Given statistics that are missing required values or measurable source.
    const statistics = input;

    // When statistics validation is attempted.
    const validate = () => validateStatistics(statistics);

    // Then validation rejects the evidence with the expected diagnostic.
    assert.throws(validate, expected);
  });
}

for (const [label, filename, source] of [
  ['only prose', 'only.md', '# No authored code\n'],
  ['a source file below the minimum size', 'tiny.mjs', '// too small\n'],
]) {
  test(`Given ${label}, When source measurement is attempted, Then empty analysis never becomes passing evidence`, async t => {
    // Given a repository with no measurable authored source.
    const directory = fixture(t);
    save(directory, filename, source);

    // When source measurement is attempted.
    const analyze = () => measure(directory, path.join(directory, 'quality-reports'));

    // Then empty analysis is explicitly rejected.
    await assert.rejects(analyze, /Empty/);
  });
}

test('Given a missing target ref, When PR merge evidence is requested, Then evidence is unavailable', async t => {
  // Given a repository with no resolvable PR target ref.
  const directory = fixture(t);

  // When a merge comparison is requested for that missing ref.
  const report = await prComparison('missing-base', 'HEAD', directory);

  // Then it cannot produce passing measurement evidence.
  assert.equal(report.available, false);
});

for (const [label, before, after, higherBetter, expected] of [
  ['a rising score', 1, 2, true, '🟢 Improved'],
  ['a rising adverse count', 1, 2, false, '🔴 Regressed'],
  ['equal measurements', 1, 1, false, '🟡 Unchanged'],
  ['a missing baseline value', undefined, 1, false, '⚪ Unavailable'],
]) {
  test(`Given ${label}, When its direction is assessed, Then the result is ${expected}`, () => {
    // Given measured values and the metric's improvement direction.
    const original = before;
    const current = after;

    // When the metric direction is assessed.
    const result = assessment(original, current, higherBetter);

    // Then the assessment distinguishes improvement, regression, equality and missing values.
    assert.equal(result, expected);
  });
}

function protocolLauncher(mode) {
  const names = ['check_duplication', 'get_file_clones', 'get_statistics', 'check_current_directory'];
  const code = `
    const readline = require('node:readline');
    readline.createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      if (request.id === undefined) return;
      const mode = ${JSON.stringify(mode)};
      if (mode === 'malformed') { console.log('invalid json'); return; }
      let result;
      if (request.method === 'initialize') {
        result = mode === 'bad-init' ? {} : { protocolVersion: '2024-11-05',
          serverInfo: { name: 'fixture', version: '1.0.0' }, capabilities: { tools: {} } };
      } else if (request.method === 'tools/list') {
        result = { tools: ${JSON.stringify(names)}.map(name => ({ name, inputSchema: { type: 'object' } })) };
        if (mode === 'bad-schema') result.tools[0].inputSchema = {};
      } else {
        result = mode === 'tool-error' ? { isError: true, content: [] }
          : { content: [{ type: 'text', text: 'not json' }] };
      }
      console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    });
  `;
  return () => ({ command: process.execPath, args: ['-e', code] });
}

for (const mode of ['bad-init', 'bad-schema', 'malformed']) {
  test(`Given MCP ${mode}, When the client connects, Then invalid protocol evidence is rejected`, async () => {
    // Given a simulated server with the selected initialization/protocol failure.
    const launch = protocolLauncher(mode);

    // When the client attempts its handshake.
    const initialize = () => connect(root, configuration, launch);

    // Then invalid initialization or schema/JSON cannot produce a usable client.
    await assert.rejects(initialize, /Invalid|missing/);
  });
}

for (const mode of ['tool-error', 'bad-tool-json']) {
  test(`Given MCP ${mode}, When a connected client calls statistics, Then the failed tool result is rejected`, async t => {
    // Given a connected server whose tool response is failed or malformed.
    const client = await connect(root, configuration, protocolLauncher(mode));
    t.after(() => client.close());

    // When statistics are requested.
    const readStatistics = () => client.call('get_statistics');

    // Then invalid tool results cannot become trusted evidence.
    await assert.rejects(readStatistics, /Invalid|did not return JSON/);
  });
}

test('Given a missing MCP executable, When the client connects, Then the process launch failure is explicit', async () => {
  // Given a launcher pointing to an executable that does not exist.
  const launch = () => ({ command: path.join(os.tmpdir(), 'nonexistent-jscpd-fixture') });

  // When the client attempts connection.
  const initialize = () => connect(root, configuration, launch);

  // Then the missing executable is reported as a launch failure.
  await assert.rejects(initialize, /ENOENT/);
});

function receiptFixture(t) {
  const directory = fixture(t);
  save(directory, 'source.mjs', block);
  save(directory, '.github/pull_request_template.md', fs.readFileSync(path.join(root, '.github/pull_request_template.md')));
  const parent = commit(directory, 'parent');
  save(directory, 'added.mjs', block);
  const head = commit(directory, 'head');
  const receipt = {
    hook: 'staged-quality', passed: true, parent, tree: git(directory, 'rev-parse', 'HEAD^{tree}'),
    machine: os.hostname(), platform: process.platform, completedAt: new Date().toISOString(),
    input: { mode: 'staged', image: 'fixture', selected: ['added.mjs'], linkSelected: [] },
    results: [{ check: 'fixture-check', passed: true }],
  };
  save(directory, 'quality-reports/local-hook.json', JSON.stringify(receipt));
  const run = base => spawnSync(process.execPath, [path.join(root, 'tools/quality/pr-report.mjs'), base], {
    cwd: directory, encoding: 'utf8',
  });
  return { directory, parent, head, receipt, run };
}

for (const label of ['a missing health base', 'a valid health base']) {
  test(`Given verified hook evidence and ${label}, When the PR body is generated, Then description and Local QA are retained without requiring health`, t => {
    // Given a receipt matching HEAD and the repository PR template.
    const { directory, parent, head, run } = receiptFixture(t);
    const base = label === 'a missing health base' ? 'missing-base' : parent;

    // When the PR body is generated.
    const result = run(base);
    const body = fs.readFileSync(path.join(directory, 'quality-reports/pull-request.md'), 'utf8');

    // Then verified Local QA is independent of advisory health availability.
    assert.equal(result.status, 0, result.stderr);
    assert(body.indexOf('## Description') < body.indexOf('## Local QA'));
    assert.doesNotMatch(body, /## Code health/);
    assert.match(body, /pre-commit hook: ✅ \*\*Passed\*\*/);
    assert(body.includes(head));
  });
}

test('Given a mismatched hook receipt after a prior report, When PR body generation runs again, Then stale passing evidence is removed', t => {
  // Given an earlier generated report followed by a receipt for a different tree.
  const { directory, parent, receipt, run } = receiptFixture(t);
  run(parent);
  receipt.tree = 'mismatch';
  save(directory, 'quality-reports/local-hook.json', JSON.stringify(receipt));

  // When body generation is attempted with the mismatching receipt.
  const result = run(parent);

  // Then generation fails and does not leave the previous passing body behind.
  assert.equal(result.status, 1);
  assert(!fs.existsSync(path.join(directory, 'quality-reports/pull-request.md')));
});

test('Given saved source and an empty index, When the analysis snapshot is copied, Then bytes and index are preserved', t => {
  // Given authored source and an output directory outside the authored scope.
  const directory = fixture(t);
  save(directory, 'source.mjs', block);
  const output = path.join(directory, '.quality-cache/snapshot');
  fs.mkdirSync(output, { recursive: true });

  // When the analysis snapshot is copied.
  snapshot(directory, output);

  // Then the snapshot preserves source bytes without staging the source.
  assert.equal(fs.readFileSync(path.join(output, 'source.mjs'), 'utf8'), block);
  assert.equal(execFileSync('git', ['diff', '--cached'], { cwd: directory, encoding: 'utf8' }), '');
});
