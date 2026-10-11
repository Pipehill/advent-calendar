import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { connect } from './mcp-client.mjs';
import { configuration, root } from './jscpd.mjs';
import { measure, prComparison, git, validateStatistics, snapshot } from './health.mjs';
import { renderComparison, comparable, assessment } from './health-report.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'health test '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
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

test('MCP snippet/file locations, stale statistics and refresh reflect copies and removal', async t => {
  const directory = fixture(t);
  save(directory, 'original.mjs', block);
  const client = await connect(directory, configuration);
  try {
    const snippet = await client.call('check_duplication', { code: block, format: 'javascript' });
    assert(snippet.count > 0);
    assert(snippet.duplications.some(item => item.file.endsWith('original.mjs') && item.fileStartLine >= 1));
    save(directory, 'copy.mjs', block);
    const stale = validateStatistics(await client.call('get_statistics'));
    assert.equal(stale.clones, 0);
    const refreshed = await client.call('check_current_directory');
    assert(refreshed.clones > 0);
    const clones = await client.call('get_file_clones', { path: 'copy.mjs' });
    assert(clones.duplications.some(item => item.fileA.includes('original') || item.fileB.includes('original')));
    fs.unlinkSync(path.join(directory, 'copy.mjs'));
    assert.equal((await client.call('check_current_directory')).clones, 0);
  } finally { await client.close(); }
});

test('documented stdio launcher resolves the repository from an unrelated cwd', async () => {
  const launch = () => spawn(process.execPath, [path.join(root, 'tools/quality/jscpd.mjs')], {
    cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = await connect(root, configuration, launch);
  try {
    const refresh = await client.call('check_current_directory');
    assert(refresh.files > 0);
    assert(validateStatistics(await client.call('get_statistics')).sources > 0);
  } finally { await client.close(); }
});

test('whole saved scope, exclusions, improvements, regression and partial staging are preserved', async t => {
  const directory = fixture(t);
  save(directory, 'original.mjs', block);
  commit(directory, 'base');
  const reportDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'health reports '));
  t.after(() => fs.rmSync(reportDirectory, { recursive: true, force: true }));
  const before = await measure(directory, path.join(reportDirectory, 'before'), { kind: 'fixture' });
  save(directory, 'copy.mjs', block);
  git(directory, 'add', 'copy.mjs');
  save(directory, 'copy.mjs', block + '\n// saved unstaged change\n');
  save(directory, 'node_modules/ignored.mjs', block);
  save(directory, 'generated/ignored.mjs', block);
  save(directory, 'unrelated.md', 'saved unrelated edit\n');
  const index = git(directory, 'ls-files', '--stage');
  const status = git(directory, 'status', '--porcelain');
  const after = await measure(directory, path.join(reportDirectory, 'after'), { kind: 'fixture' });
  assert.equal(git(directory, 'ls-files', '--stage'), index);
  assert.equal(git(directory, 'status', '--porcelain'), status);
  assert(after.input.files.some(file => file.path === 'original.mjs'));
  assert(after.input.files.some(file => file.path === 'copy.mjs'));
  assert(!after.input.files.some(file => file.path.includes('ignored')));
  assert(after.mcp.statistics.statistics.total.duplicatedLines > before.mcp.statistics.statistics.total.duplicatedLines);
  const text = renderComparison({ available: true, before, after });
  assert.match(text, /Regressed/);
  assert.match(text, /Duplicated lines/);
  assert.match(text, / pp/);
  assert.match(text, /original.mjs/);
  assert.match(renderComparison({ available: true, before: after, after: before }), /Improved/);
  assert.match(renderComparison({ available: true, before, after: before }), /Unchanged/);
  const mixed = structuredClone(after);
  mixed.health.score = before.health.score + 1;
  assert.match(renderComparison({ available: true, before, after: mixed }), /Mixed results.*Regressions/);
  const declined = structuredClone(after);
  declined.health.score = before.health.score - 1;
  assert.match(renderComparison({ available: true, before, after: declined }), /Overall health declined/);
  const changed = structuredClone(after);
  changed.tool.version = '0.0.0';
  assert(comparable(before, changed));
  changed.tool = { ...before.tool, configHash: 'different-settings' };
  assert(comparable(before, changed));
  changed.tool = before.tool;
  changed.health.dimensions = [];
  assert(comparable(before, changed));
  assert.match(renderComparison({ available: false, reason: 'protocol failed' }), /Unavailable.*protocol failed/);
});

test('supported dead-code findings retain confidence and unsupported inputs retain n/a', async t => {
  const directory = fixture(t);
  const shellLines = Array.from({ length: 20 }, (_, index) => `value${index}=${index}`);
  shellLines.push('printf "%s\\n" "$value0" "$value1" "$value2" "$value3"');
  save(directory, 'script.sh', '#!/bin/sh\n' + shellLines.join('\n') + '\n');
  const unsupported = await measure(directory, path.join(directory, 'quality-reports/unsupported'));
  const dead = unsupported.health.dimensions.find(item => item.id === 'dead-code');
  assert(!dead || dead.score == null);
  assert.match(renderComparison({ available: true, before: unsupported, after: unsupported }), /n\/a/);
  save(directory, 'source.mjs', block);
  const supported = await measure(directory, path.join(directory, 'quality-reports/supported'));
  assert(supported.deadCode.findings.length > 0);
  assert(supported.deadCode.findings.every(finding => Number.isFinite(finding.confidence)));
  assert(comparable(unsupported, supported));
});

test('candidate merge includes advanced target, new/deleted files; conflicts are unavailable', async t => {
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
  const status = git(directory, 'status', '--porcelain');
  const comparison = await prComparison(base, head, directory);
  assert(comparison.available, comparison.reason);
  const compact = renderComparison(comparison);
  assert(compact.indexOf('Target commit:') < compact.indexOf('| Metric |'));
  assert.match(compact, /### Complexity hotspots\n\n\| File \| Complexity \|/);
  assert.match(compact, /### Dead-code findings \(heuristic\)\n\n\| File \| Finding \| Line \| Confidence \|/);
  const hotspots = compact.split('### Complexity hotspots')[1].split('### Dead-code findings')[0];
  assert.doesNotMatch(hotspots, /unused-file|confidence/i);
  assert.match(compact, /### Duplication locations/);
  assert.equal(comparison.identity.base, base);
  assert.equal(comparison.identity.head, head);
  const stale = structuredClone(comparison);
  stale.identity = { ...stale.identity, head: ancestor };
  assert.match(renderComparison(stale), /Unavailable.*Conflicting PR measurement identity/);
  const files = comparison.after.input.files.map(file => file.path);
  assert(files.includes('target.mjs') && files.includes('head.mjs') && files.includes('original.mjs'));
  assert(!files.includes('deleted.mjs'));
  assert.equal(git(directory, 'status', '--porcelain'), status);
  assert.equal(git(directory, 'rev-parse', 'HEAD'), base);
  const fresh = await prComparison(base, base, directory);
  assert.equal(fresh.identity.head, base);
  assert(!fresh.after.input.files.some(file => file.path === 'head.mjs'));
  save(directory, 'original.mjs', block.replace('value * 3', 'value * 9'));
  const conflictingBase = commit(directory, 'target conflict');
  git(directory, 'checkout', '-q', head);
  save(directory, 'original.mjs', block.replace('value * 3', 'value * 7'));
  const conflictingHead = commit(directory, 'head conflict');
  const conflict = await prComparison(conflictingBase, conflictingHead, directory);
  assert.equal(conflict.available, false);
  assert.match(renderComparison(conflict), /Unavailable/);
});

test('invalid results and empty/unsupported scopes never become passing evidence', async t => {
  assert.throws(() => validateStatistics({}), /Invalid/);
  assert.throws(() => validateStatistics({ statistics: { total: {
    sources: 0, lines: 0, clones: 0, duplicatedLines: 0, percentage: 0,
  } } }), /Empty/);
  const directory = fixture(t);
  save(directory, 'only.md', '# No authored code\n');
  await assert.rejects(measure(directory, path.join(directory, 'quality-reports')), /Empty/);
  save(directory, 'tiny.mjs', '// too small\n');
  await assert.rejects(measure(directory, path.join(directory, 'quality-reports')), /Empty/);
  const report = await prComparison('missing-base', 'HEAD', directory);
  assert.equal(report.available, false);
});

test('per-metric directions, unavailable dimensions and mixed results remain explicit', () => {
  assert.match(renderComparison({ available: false }), /Unavailable.*Missing or failed measurement/);
  assert.equal(assessment(1, 2, true), '🟢 Improved');
  assert.equal(assessment(1, 2), '🔴 Regressed');
  assert.equal(assessment(1, 1), '🟡 Unchanged');
  assert.equal(assessment(undefined, 1), '⚪ Unavailable');
});

test('protocol failures, missing tool schemas, failed tools and malformed JSON are unavailable', async () => {
  const names = ['check_duplication', 'get_file_clones', 'get_statistics', 'check_current_directory'];
  function launch(mode) {
    const code = `
      const readline = require('node:readline');
      readline.createInterface({ input: process.stdin }).on('line', line => {
        const request = JSON.parse(line);
        if (!request.id) return;
        const mode = ${JSON.stringify(mode)};
        if (mode === 'malformed') { console.log('invalid json'); return; }
        let result;
        if (request.method === 'initialize') {
          result = mode === 'bad-init' ? {} : { serverInfo: { name: 'fixture' }, capabilities: { tools: {} } };
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
    return () => spawn(process.execPath, ['-e', code], { stdio: ['pipe', 'pipe', 'pipe'] });
  }
  for (const mode of ['bad-init', 'bad-schema', 'malformed']) {
    await assert.rejects(connect(root, configuration, launch(mode)), /Invalid|missing/);
  }
  for (const mode of ['tool-error', 'bad-tool-json']) {
    const client = await connect(root, configuration, launch(mode));
    try { await assert.rejects(client.call('get_statistics'), /Invalid|did not return JSON/); }
    finally { await client.close(); }
  }
  await assert.rejects(connect(root, configuration, () => {
    return spawn(path.join(os.tmpdir(), 'nonexistent-jscpd-fixture'), []);
  }), /ENOENT/);
});

test('PR body contains description and verified local QA without requiring health', t => {
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
  for (const base of ['missing-base', parent]) {
    const result = run(base);
    assert.equal(result.status, 0, result.stderr);
    const body = fs.readFileSync(path.join(directory, 'quality-reports/pull-request.md'), 'utf8');
    assert(body.indexOf('## Description') < body.indexOf('## Local QA'));
    assert.doesNotMatch(body, /## Code health/);
    assert.match(body, /pre-commit hook: ✅ \*\*Passed\*\*/);
    assert(body.includes(head));
  }
  receipt.tree = 'mismatch';
  save(directory, 'quality-reports/local-hook.json', JSON.stringify(receipt));
  assert.equal(run(parent).status, 1);
  assert(!fs.existsSync(path.join(directory, 'quality-reports/pull-request.md')));
});

test('snapshot command preserves source bytes and the index', t => {
  const directory = fixture(t);
  save(directory, 'source.mjs', block);
  const output = path.join(directory, '.quality-cache/snapshot');
  fs.mkdirSync(output, { recursive: true });
  snapshot(directory, output);
  assert.equal(fs.readFileSync(path.join(output, 'source.mjs'), 'utf8'), block);
  assert.equal(execFileSync('git', ['diff', '--cached'], { cwd: directory, encoding: 'utf8' }), '');
});
