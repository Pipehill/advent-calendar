// Integration verification creates commits only in a disposable local clone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const cloneDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-quality-verification-'));
const preCommitExecutable = process.env.QUALITY_PRE_COMMIT || path.join(repositoryRoot, '.quality-cache/venv/Scripts/pre-commit.exe');
const reportsDirectory = path.join(repositoryRoot, 'quality-reports/verification');
fs.mkdirSync(reportsDirectory, { recursive: true });
const commandRecords = [];

// Scenarios share one disposable clone and run in order: some prepare later fixtures.
function main() {
  try {
    prepareDisposableClone();
    runScenario('Dependency image reuse and scoped cleanup', verifyImageLifecycle);
    runScenario('Branch protection', verifyBranchProtection);
    runScenario('Partially staged files and preserved edits', verifyPartialStaging);
    runScenario('Local PR hook evidence and stale receipt rejection', verifyLocalPrEvidence);
    runScenario('Line endings and binary files', verifyLineEndingsAndBinaryFiles);
    runScenario('Invalid inputs and corrected checks', verifyInvalidInputsAndCorrections);
    runScenario('Renamed and deleted link targets', verifyRenamedAndDeletedLinkTargets);
    runScenario('Changed headings and HTML anchors with incoming links', verifyChangedLinkAnchors);
    runScenario('Shared configuration changes', verifyConfigurationChangesExpandScope);
    runScenario('Full checks in a detached checkout', verifyDetachedCheckout);
    runScenario('Missing container runtime', verifyMissingContainerRuntime);
    console.log('Windows clone/hook/staging/enforcement integration checks passed.');
  } finally {
    fs.writeFileSync(path.join(reportsDirectory, 'commands.json'), JSON.stringify(commandRecords, null, 2));
    // This path was created by mkdtemp for this verification only.
    fs.rmSync(cloneDirectory, { recursive: true, force: true });
  }
}

function runScenario(description, verify) {
  console.log(`Verifying: ${description}`);
  verify();
}

function verifyLocalPrEvidence() {
  runGit('commit', '--allow-empty', '-m', 'Verify local QA receipt');
  const receiptPath = path.join(cloneDirectory, 'quality-reports/local-hook.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath));
  assert.equal(receipt.tree, runGit('rev-parse', 'HEAD^{tree}').trim());
  runCommand(process.execPath, ['tools/quality/pr-report.mjs']);
  const bodyPath = path.join(cloneDirectory, 'quality-reports/pull-request.md');
  const body = fs.readFileSync(bodyPath, 'utf8');
  assert(body.includes(runGit('rev-parse', 'HEAD').trim()));
  assert(body.includes('pre-commit hook: ✅ **Passed**'));
  assert(!body.includes('**Not provided**'));

  fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, machine: `${receipt.machine}-other` }));
  runCommand(process.execPath, ['tools/quality/pr-report.mjs'], false);
  assert(!fs.existsSync(bodyPath));
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));

  runGit('-c', 'core.hooksPath=', 'commit', '--allow-empty', '-m', 'Bypass hooks for stale receipt fixture');
  runCommand(process.execPath, ['tools/quality/pr-report.mjs'], false);
  runCommand(process.execPath, ['tools/quality/run.mjs', 'staged']);
  assert(!fs.existsSync(receiptPath), 'Manual staged run must not attest to hook execution');
  runCommand(process.execPath, ['tools/quality/pr-report.mjs'], false);
}

function verifyImageLifecycle() {
  const runtime = process.env.QUALITY_CONTAINER_RUNTIME || 'docker';
  const identifier = randomUUID().replaceAll('-', '').slice(0, 20);
  const obsolete = `localhost/advent-quality:${identifier}`;
  const unrelated = `localhost/advent-quality-verification:${identifier}`;
  const container = `advent-quality-verification-${identifier}`;
  const dependencyFiles = ['Dockerfile', 'package.json', 'package-lock.json', 'requirements.txt'];
  const hash = createHash('sha256');
  for (const file of dependencyFiles) hash.update(fs.readFileSync(path.join(cloneDirectory, 'tools/quality', file)));
  const current = `localhost/advent-quality:${hash.digest('hex').slice(0, 20)}`;

  // Editing scripts must reuse the dependency image and avoid a build entirely.
  const script = path.join(cloneDirectory, 'tools/quality/checks.mjs');
  const original = fs.readFileSync(script);
  try {
    fs.appendFileSync(script, '\n// Image reuse verification.\n');
    const output = runCommand(process.execPath, ['tools/quality/run.mjs', 'setup']);
    assert(output.includes(`Reusing dependency image: ${current}`), output);
  } finally {
    fs.writeFileSync(script, original);
  }

  runCommand(runtime, ['tag', current, obsolete]);
  runCommand(runtime, ['tag', current, unrelated]);
  try {
    runCommand(runtime, ['create', '--name', container, '--entrypoint', 'node', obsolete, '--version']);
    try {
      runCommand(process.execPath, ['tools/quality/run.mjs', 'clean']);
      runCommand(runtime, ['image', 'inspect', obsolete]);
      runCommand(runtime, ['image', 'inspect', current]);
    } finally {
      runCommand(runtime, ['container', 'rm', container]);
    }
    runCommand(process.execPath, ['tools/quality/run.mjs', 'setup']);
    runCommand(runtime, ['image', 'inspect', obsolete], false);
    runCommand(runtime, ['image', 'inspect', unrelated]);
    runCommand(runtime, ['image', 'inspect', current]);
  } finally {
    // Remove only tags created by this scenario; never force or prune unrelated resources.
    spawnSync(runtime, ['image', 'rm', obsolete], { stdio: 'ignore' });
    runCommand(runtime, ['image', 'rm', unrelated]);
  }
}

// Commands are recorded so expected failures remain available for report analysis.
function runCommand(exe, args, expectedSuccess = true) {
  const start = Date.now();
  const result = spawnSync(exe, args, {
    cwd: cloneDirectory,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PRE_COMMIT_HOME: path.join(repositoryRoot, '.quality-cache/pre-commit') },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`;
  commandRecords.push({ exe, args, status: result.status, elapsedMs: Date.now() - start, output });
  assert.equal(result.status === 0, expectedSuccess, output);
  return output;
}

function runGit(...args) {
  return runCommand('git', args);
}

function writeFixture(name, content) {
  const destination = path.join(cloneDirectory, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function writeFixtureLines(name, lines) {
  writeFixture(name, `${lines.join('\n')}\n`);
}

function expectStagedChecksToPass(reportName) {
  checkStagedFiles({ expectedSuccess: true, reportName });
}

function expectStagedChecksToFail(reportName) {
  checkStagedFiles({ expectedSuccess: false, reportName });
}

function checkStagedFiles({ expectedSuccess, reportName }) {
  const before = captureRepositoryState();
  runCommand(process.execPath, ['tools/quality/run.mjs', 'staged'], expectedSuccess);
  assert.deepEqual(captureRepositoryState(), before, 'Checks changed file bytes or Git diffs');
  preserveStagedReports(reportName, expectedSuccess);
}

function captureRepositoryState() {
  return {
    unstagedDiff: runGit('diff', '--binary'),
    stagedDiff: runGit('diff', '--cached', '--binary'),
    fileContentsHash: hashCloneFiles(),
  };
}

function hashCloneFiles() {
  const hash = createHash('sha256');
  const names = runGit('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  for (const name of names) {
    const filename = path.join(cloneDirectory, name);
    if (fs.existsSync(filename)) hash.update(name).update(fs.readFileSync(filename));
  }
  return hash.digest('hex');
}

function preserveStagedReports(reportName, expectedSuccess) {
  const sourceDirectory = path.join(cloneDirectory, 'quality-reports/staged');
  const destinationDirectory = path.join(reportsDirectory, reportName);
  fs.cpSync(sourceDirectory, destinationDirectory, { recursive: true });
  if (expectedSuccess) return;

  // Preserve the staged source, not the potentially different working-tree version.
  const input = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'input.json')));
  const files = new Set([...input.selected, ...input.linkSelected, '.markdownlint.json', '.yamllint.yml', '.mega-linter.yml']);
  for (const name of files) {
    const destination = path.join(destinationDirectory, 'source', name);
    const contents = execFileSync('git', ['show', `:${name}`], { cwd: cloneDirectory });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
}

// Prepare a committed baseline containing the current repository changes.
function prepareDisposableClone() {
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', repositoryRoot, cloneDirectory]);
  runGit('switch', '-c', 'ci/quality-verification');
  runGit('config', 'user.name', 'Quality verification');
  runGit('config', 'user.email', 'quality-verification@example.invalid');
  runGit('config', 'core.autocrlf', 'false');
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of names) writeFixture(name, fs.readFileSync(path.join(repositoryRoot, name)));
  runGit('add', '--all');
  runGit('-c', 'core.hooksPath=', 'commit', '-m', 'Prepare disposable verification baseline');
  runCommand(preCommitExecutable, ['install']);
}

function verifyBranchProtection() {
  runGit('commit', '--allow-empty', '-m', 'Verify task branch empty commit');
  if (runCommand('git', ['branch', '--list', 'main']).trim()) runGit('branch', '-D', 'main');
  runGit('branch', '-m', 'main');
  const branchOutput = runCommand('git', ['commit', '--allow-empty', '-m', 'Must fail on main'], false);
  assert(branchOutput.includes("don't commit to branch"));
  writeFixture('branch guard.md', '# Branch guard\n');
  runGit('add', 'branch guard.md');
  runCommand('git', ['commit', '-m', 'Normal commit must fail on main'], false);
  runGit('branch', '-m', 'ci/quality-verification');
  runGit('commit', '-m', 'Verify normal task branch commit');
}

function verifyPartialStaging() {
  writeFixture('partial staging.md', 'Missing heading\n');
  runGit('add', 'partial staging.md');
  writeFixture('partial staging.md', '# Correct working copy\n');
  expectStagedChecksToFail('invalid-index-valid-worktree');
  runCommand('git', ['commit', '-m', 'Invalid staged content must fail'], false);
  assert.equal(fs.readFileSync(path.join(cloneDirectory, 'partial staging.md'), 'utf8'), '# Correct working copy\n');
  runGit('add', 'partial staging.md');
  writeFixture('partial staging.md', 'Unstaged invalid Markdown\n');
  expectStagedChecksToPass('valid-index-invalid-worktree');
  runGit('commit', '-m', 'Verify corrected staged content and preserved unstaged edits');
  assert.equal(fs.readFileSync(path.join(cloneDirectory, 'partial staging.md'), 'utf8'), 'Unstaged invalid Markdown\n');
  writeFixture('partial staging.md', '# Correct working copy\n');
}

function verifyLineEndingsAndBinaryFiles() {
  writeFixture('lf.md', '# LF\r\n');
  runGit('add', 'lf.md');
  expectStagedChecksToFail('pure-crlf');
  assert.equal(fs.readFileSync(path.join(cloneDirectory, 'lf.md'), 'utf8'), '# LF\r\n');
  writeFixture('lf.md', '# LF\r\n\nText\n');
  runGit('add', 'lf.md');
  expectStagedChecksToFail('mixed-endings');
  writeFixture('lf.md', '# LF\n');
  writeFixture('valid.cmd', 'echo ok\r\n');
  writeFixture('binary.png', Buffer.from([0, 13, 10, 0, 10, 255]));
  runGit('add', 'lf.md', 'valid.cmd', 'binary.png');
  expectStagedChecksToPass('line-endings-corrected');
}

function verifyInvalidInputsAndCorrections() {
  writeFixtureLines('bad.md', [
    'Missing heading ',
    '',
    '[Missing](absent.md)',
    '',
    '```mermaid',
    'sequenceDiagram',
    'A->>B: hello; invalid text',
    '```',
  ]);
  writeFixture('bad.yaml', 'value: [\n');
  writeFixture('bad.json', '{"a":1,"a":2}\n');
  writeFixtureLines('conflict.txt', ['<<<<<<< ours', 'value', '=======', 'other', '>>>>>>> theirs']);
  writeFixtureLines('.github/workflows/bad.yml', [
    'name: Bad',
    'on: [invalid_event]',
    'jobs:',
    '  bad:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    '      - run: echo bad',
  ]);
  runGit('add', '--all');
  expectStagedChecksToFail('all-agreed-violations');
  const failed = JSON.parse(fs.readFileSync(path.join(cloneDirectory, 'quality-reports/staged/findings.json')));
  for (const family of ['markdownlint', 'yamllint', 'jsonlint', 'actionlint', 'merge-conflict', 'mermaid', 'local-links']) {
    assert(failed.findings.some(item => item.check === family), `Missing failure for ${family}`);
  }
  runCommand(process.execPath, ['tools/quality/run.mjs', 'full'], false);
  fs.cpSync(path.join(cloneDirectory, 'quality-reports/full'), path.join(reportsDirectory, 'full-failure'), { recursive: true });
  for (const name of ['bad.yaml', 'bad.json', 'conflict.txt', '.github/workflows/bad.yml']) {
    fs.unlinkSync(path.join(cloneDirectory, name));
  }
  writeFixtureLines('bad.md', [
    '# Fixed',
    '',
    '[Architecture](docs/architecture.md)',
    '',
    '```mermaid',
    'sequenceDiagram',
    'A->>B: hello#59; valid text',
    '```',
  ]);
  runGit('add', '--all');
  expectStagedChecksToPass('violations-corrected');
}

function verifyRenamedAndDeletedLinkTargets() {
  writeFixture('target.md', '# Target\n');
  writeFixture('source.md', '# Source\n\n[Target](target.md#target)\n');
  runGit('add', '--all');
  runGit('commit', '-m', 'Prepare rename and deletion tests');
  runGit('mv', 'target.md', 'renamed target.md');
  expectStagedChecksToFail('rename-inbound-link');
  writeFixture('source.md', '# Source\n\n[Target](renamed%20target.md#target)\n');
  runGit('add', 'source.md');
  expectStagedChecksToPass('rename-corrected');
  runGit('commit', '-m', 'Verify renamed target with spaces');
  runGit('rm', 'renamed target.md');
  expectStagedChecksToFail('deletion-inbound-link');
  writeFixture('source.md', '# Source\n');
  runGit('add', 'source.md');
  expectStagedChecksToPass('deletion-corrected');
}

function verifyChangedLinkAnchors() {
  // The fixture intentionally exercises supported HTML anchors, scoped to this line.
  const anchorTarget = (heading, anchor) => `# ${heading}\n\n<!-- markdownlint-disable-next-line MD033 -->\n`
    + `<a id="${anchor}"></a>\n`;
  writeFixture('anchor target.md', anchorTarget('Original heading', 'original-anchor'));
  const originalSource = '# Incoming links\n\n[Heading](anchor%20target.md#original-heading)\n\n'
    + '[Anchor](anchor%20target.md#original-anchor)\n';
  writeFixture('anchor source.md', originalSource);
  runGit('add', '--all');
  runGit('commit', '-m', 'Prepare incoming heading and HTML anchor tests');

  writeFixture('anchor target.md', anchorTarget('Changed heading', 'original-anchor'));
  runGit('add', 'anchor target.md');
  // A valid unstaged target cannot hide the invalid staged heading.
  writeFixture('anchor target.md', anchorTarget('Original heading', 'original-anchor'));
  expectStagedChecksToFail('changed-heading-inbound-link');
  const report = JSON.parse(fs.readFileSync(path.join(cloneDirectory, 'quality-reports/staged/findings.json')));
  assert(!report.input.selected.includes('anchor source.md'));
  assert(report.input.linkSelected.includes('anchor source.md'));
  assert(report.findings.some(item => item.file === 'anchor source.md'
    && item.rule === 'local-link' && item.message.includes('#original-heading')));

  writeFixture('anchor target.md', anchorTarget('Original heading', 'changed-anchor'));
  runGit('add', 'anchor target.md');
  // An unstaged link correction must not mask the broken staged anchor.
  writeFixture('anchor source.md', originalSource.replace('#original-anchor', '#changed-anchor'));
  expectStagedChecksToFail('changed-html-anchor-inbound-link');
  const anchorReport = JSON.parse(fs.readFileSync(path.join(cloneDirectory, 'quality-reports/staged/findings.json')));
  assert(anchorReport.findings.some(item => item.file === 'anchor source.md'
    && item.rule === 'local-link' && item.message.includes('#original-anchor')));
  runGit('add', 'anchor source.md');
  expectStagedChecksToPass('changed-anchors-corrected');
  runGit('commit', '-m', 'Verify corrected incoming anchor links');
}

function verifyConfigurationChangesExpandScope() {
  // Shared settings changes must bring unchanged invalid content into scope.
  writeFixture('partial staging.md', 'Missing heading\n');
  runGit('add', 'partial staging.md');
  runGit('-c', 'core.hooksPath=', 'commit', '-m', 'Prepare configuration invalidation fixture');
  writeFixture('.yamllint.yml', `${fs.readFileSync(path.join(cloneDirectory, '.yamllint.yml'), 'utf8')}# Scope test\n`);
  runGit('add', '.yamllint.yml');
  expectStagedChecksToFail('configuration-expands-scope');
  writeFixture('partial staging.md', '# Correct working copy\n');
  runGit('add', 'partial staging.md');
  runGit('commit', '-m', 'Verify corrected configuration-dependent content');
}

function verifyDetachedCheckout() {
  runGit('checkout', '--detach');
  runCommand(process.execPath, ['tools/quality/run.mjs', 'full']);
  fs.cpSync(path.join(cloneDirectory, 'quality-reports/full'), path.join(reportsDirectory, 'full-corrected-detached'), { recursive: true });
}

function verifyMissingContainerRuntime() {
  const originalRuntime = process.env.QUALITY_CONTAINER_RUNTIME;
  process.env.QUALITY_CONTAINER_RUNTIME = 'missing-quality-runtime-for-verification';
  const runnerFailure = runCommand(process.execPath, ['tools/quality/run.mjs', 'full'], false);
  assert(runnerFailure.includes('Container runtime unavailable'));
  fs.writeFileSync(path.join(reportsDirectory, 'runner-failure.log'), runnerFailure);
  if (originalRuntime) process.env.QUALITY_CONTAINER_RUNTIME = originalRuntime;
  else delete process.env.QUALITY_CONTAINER_RUNTIME;
}

main();
