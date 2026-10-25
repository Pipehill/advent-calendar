import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gitOutput } from './snapshot.mjs';
import { onlyMarkdownChanges, markdownOnlyCommit, markdownOnlyPullRequest } from './change-scope.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));

function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown scope '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  gitOutput(root, ['init', '-q']);
  gitOutput(root, ['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(root, '.github'));
  fs.writeFileSync(path.join(root, '.github/pull_request_template.md'), '# PR\n\n## Description\n\nPlan.\n\n## Local QA\n\nNot provided.\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.quality-cache/\nquality-reports/\n');
  fs.writeFileSync(path.join(root, 'read me.md'), '# Original\n');
  fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 1;\n');
  commit(root);
  return root;
}

function commit(root) {
  gitOutput(root, ['add', '--all']);
  gitOutput(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=disabled-fixture-hooks', 'commit', '-qm', 'Scope fixture']);
  return gitOutput(root, ['rev-parse', 'HEAD']).trim();
}

function run(root, script, env = {}) {
  let args = [];
  if (script === 'run.mjs') args = ['staged'];
  if (script === 'change-scope.mjs') args = ['ci'];
  return spawnSync(process.execPath, [path.join(tools, script), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
  });
}

test('Given only staged Markdown and unstaged code, When the hook runs without a runtime, Then checks skip and stale passing evidence is removed', t => {
  // Given a Markdown-only index, unstaged code and an obsolete receipt.
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'read me.md'), 'Unlinted Markdown\n');
  gitOutput(root, ['add', 'read me.md']);
  fs.writeFileSync(path.join(root, 'source.js'), 'unstaged code\n');
  fs.mkdirSync(path.join(root, 'quality-reports'));
  const receipt = path.join(root, 'quality-reports/local-hook.json');
  fs.writeFileSync(receipt, '{"passed":true}');
  const index = gitOutput(root, ['ls-files', '--stage', '-z']);

  // When the real staged entry point runs with an unavailable container runtime.
  const result = run(root, 'run.mjs', { QUALITY_CONTAINER_RUNTIME: 'missing-runtime', PRE_COMMIT: '1' });

  // Then the hook skips without changing Git state or claiming a passing check.
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quality checks skipped/);
  assert(!fs.existsSync(receipt));
  assert(!fs.existsSync(path.join(root, 'quality-reports/staged')));
  assert.equal(gitOutput(root, ['ls-files', '--stage', '-z']), index);
  assert.equal(fs.readFileSync(path.join(root, 'source.js'), 'utf8'), 'unstaged code\n');
});

for (const change of ['mixed', 'code deletion', 'code renamed to Markdown', 'Markdown renamed to code']) {
  test(`Given ${change}, When staged scope is evaluated, Then quality checks remain required`, t => {
    // Given one of the ways non-Markdown changes can accompany a plan.
    const root = repository(t);
    fs.writeFileSync(path.join(root, 'read me.md'), '# Changed\n');
    if (change === 'mixed') fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 2;\n');
    if (change === 'code deletion') fs.unlinkSync(path.join(root, 'source.js'));
    if (change === 'code renamed to Markdown') gitOutput(root, ['mv', 'source.js', 'former source.md']);
    if (change === 'Markdown renamed to code') gitOutput(root, ['mv', 'read me.md', 'former readme.js']);
    gitOutput(root, ['add', '--all']);

    // When the actual staged changes are classified.
    const skip = onlyMarkdownChanges(root, ['--cached']);

    // Then neither deletion nor rename detection can hide a code change.
    assert.equal(skip, false);
  });
}

for (const change of ['add', 'delete', 'rename']) {
  test(`Given a Markdown-only ${change}, When staged scope is evaluated, Then the documentation exception applies`, t => {
    // Given regular Markdown files, including spaces and uppercase extensions.
    const root = repository(t);
    if (change === 'add') fs.writeFileSync(path.join(root, 'new plan.MD'), '# New\n');
    if (change === 'delete') fs.unlinkSync(path.join(root, 'read me.md'));
    if (change === 'rename') gitOutput(root, ['mv', 'read me.md', 'renamed plan.MD']);
    gitOutput(root, ['add', '--all']);

    // When the index is classified without rename detection.
    const skip = onlyMarkdownChanges(root, ['--cached']);

    // Then all changed paths remain regular Markdown files.
    assert.equal(skip, true);
  });
}

test('Given a Markdown path changed to a symlink, When staged scope is evaluated, Then it does not qualify as documentation', t => {
  // Given an indexed symlink without requiring host symlink permissions.
  const root = repository(t);
  const object = gitOutput(root, ['rev-parse', 'HEAD:source.js']).trim();
  gitOutput(root, ['update-index', '--cacheinfo', `120000,${object},read me.md`]);

  // When the path and its type change are classified.
  const skip = onlyMarkdownChanges(root, ['--cached']);

  // Then unsupported file types cannot use the Markdown exception.
  assert.equal(skip, false);
});

test('Given a code commit followed by documentation, When PR scope is evaluated, Then the complete PR still requires checks', t => {
  // Given a PR whose latest commit is Markdown-only but whose earlier commit changes code.
  const root = repository(t);
  const base = gitOutput(root, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 2;\n');
  commit(root);
  fs.writeFileSync(path.join(root, 'read me.md'), '# Updated\n');
  const head = commit(root);
  const event = { pull_request: { base: { sha: base }, head: { sha: head } } };

  // When local commit evidence and the whole PR are classified separately.
  const localSkip = markdownOnlyCommit(root);
  const prSkip = markdownOnlyPullRequest(root, 'pull_request', event);

  // Then a local skip cannot bypass earlier code changes in the PR.
  assert.equal(localSkip, true);
  assert.equal(prSkip, false);
});

test('Given a Markdown PR and an advancing base, When CI determines scope, Then only PR changes are considered and manual runs still check', t => {
  // Given a documentation branch and an independent later code change on the target.
  const root = repository(t);
  const start = gitOutput(root, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(root, 'read me.md'), '# Updated\n');
  const head = commit(root);
  gitOutput(root, ['checkout', '--detach', start]);
  fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 3;\n');
  const base = commit(root);
  const event = { pull_request: { base: { sha: base }, head: { sha: head } } };

  // When PR and manually dispatched execution are classified.
  const prSkip = markdownOnlyPullRequest(root, 'pull_request', event);
  const manualSkip = markdownOnlyPullRequest(root, 'workflow_dispatch', event);

  // Then unrelated target changes do not invalidate the exception and manual execution is explicit.
  assert.equal(prSkip, true);
  assert.equal(manualSkip, false);
});

test('Given an empty index or malformed PR event, When scope is determined, Then missing change evidence never grants an exception', t => {
  // Given a clean repository and an incomplete GitHub event.
  const root = repository(t);

  // When an empty change set and a malformed PR are inspected.
  const emptySkip = onlyMarkdownChanges(root, ['--cached']);
  const malformedEvent = () => markdownOnlyPullRequest(root, 'pull_request', {});

  // Then checks remain required or scope detection fails explicitly.
  assert.equal(emptySkip, false);
  assert.throws(malformedEvent, /exact base and head/);
});

for (const eventName of ['pull_request', 'workflow_dispatch']) {
  test(`Given a Markdown diff and a ${eventName} event, When the CI entry point runs, Then the output and summary reflect the dispatch policy`, t => {
    // Given a real Git diff and the environment used by a GitHub Actions step.
    const root = repository(t);
    const base = gitOutput(root, ['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(path.join(root, 'read me.md'), '# Updated\n');
    const head = commit(root);
    const scratch = path.join(root, '.quality-cache');
    fs.mkdirSync(scratch);
    const eventPath = path.join(scratch, 'event.json');
    const output = path.join(scratch, 'output');
    const summary = path.join(scratch, 'summary');
    fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));

    // When the same entry point used by all three workflows writes its outputs.
    const result = run(root, 'change-scope.mjs', {
      GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
    });

    // Then only PR events qualify and the job summary tells the user why.
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(output, 'utf8'), `markdown_only=${eventName === 'pull_request'}\n`);
    assert.match(fs.readFileSync(summary, 'utf8'), eventName === 'pull_request' ? /checks skipped/ : /checks required/);
  });
}

test('Given a Markdown-only commit without a receipt, When the PR body is generated, Then QA is honestly marked skipped', t => {
  // Given a committed plan and no hook receipt.
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'read me.md'), '# Updated\n');
  const head = commit(root);

  // When the actual PR report generator runs.
  const result = run(root, 'pr-report.mjs');
  const body = fs.readFileSync(path.join(root, 'quality-reports/pull-request.md'), 'utf8');

  // Then it records the exception and commit without inventing passing evidence.
  assert.equal(result.status, 0, result.stderr);
  assert.match(body, /Skipped — Markdown-only commit/);
  assert(body.includes(head));
  assert(!body.includes('**Passed**'));
});

test('Given a code commit without matching evidence, When the PR body is generated, Then stale successful text is removed', t => {
  // Given a code commit and a body left over from another run.
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 2;\n');
  commit(root);
  fs.mkdirSync(path.join(root, 'quality-reports'));
  const body = path.join(root, 'quality-reports/pull-request.md');
  fs.writeFileSync(body, 'Passed');

  // When the PR report generator cannot find required hook evidence.
  const result = run(root, 'pr-report.mjs');

  // Then a failed check cannot be presented as a Markdown-only skip or past success.
  assert.notEqual(result.status, 0);
  assert(!fs.existsSync(body));
});
