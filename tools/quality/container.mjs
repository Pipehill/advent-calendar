// Container entry point: run checks, collect diagnostics, and always save reports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { diagrams, filenameFindings, isText, linkFindings, textFindings } from './checks.mjs';

const workspace = '/workspace';
const reportsDirectory = '/reports';
const python = '/quality/venv/bin/python';
const input = JSON.parse(fs.readFileSync(`${workspace}/.quality-input.json`));
const mode = process.argv[2];
const findings = [];
const results = [];

function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-render-'));
  try {
    writeJson('input.json', input);
    recordToolVersions();
    if (mode !== 'custom' && mode !== 'test') runContentLinters();
    runOfficialHooks();
    checkRepositoryFiles(scratch);
    checkRepositoryLinks();
    checkEditorLineEndings();
    if (mode === 'test') runCheckerRegressions(scratch);
  } catch (error) {
    findings.push({ check: 'runner', rule: 'tool-execution', message: error.stack });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    saveReports();
  }
  return findings.length ? 1 : 0;
}

// Every invocation produces a log and a result, including execution failures.
function runTool(check, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: workspace, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: workspace,
    },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`;
  fs.appendFileSync(path.join(reportsDirectory, `${check}.log`), `$ ${executable} ${args.join(' ')}\n${output}\n`);
  const passed = result.status === 0;
  results.push({ check, passed, exitCode: result.status, error: result.error?.message });
  if (!passed) {
    console.error(`[${check}] ${output}`);
    findings.push({ check, rule: result.error ? 'tool-execution' : 'tool-diagnostic', message: output });
  }
  return passed;
}

function recordToolVersions() {
  const commands = [
    'node --version', 'markdownlint --version', '/venvs/yamllint/bin/yamllint --version',
    'jsonlint --version', 'actionlint --version', '/quality/venv/bin/pip freeze',
    '/quality/node_modules/.bin/mmdc --version', 'chromium-browser --version',
  ];
  runTool('versions', 'sh', ['-c', ['set -e', ...commands].join('; ')]);
}

function selectedFilesMatching(pattern) {
  return input.selected.filter(name => pattern.test(name));
}

// Full mode already ran these linters through MegaLinter; staged mode runs them directly.
function runContentLinters() {
  const markdown = selectedFilesMatching(/\.md$/i);
  if (markdown.length) runTool('markdownlint', 'markdownlint', ['--config', '.markdownlint.json', ...markdown]);
  const yaml = selectedFilesMatching(/\.ya?ml$/i);
  if (yaml.length) {
    runTool('yamllint', '/venvs/yamllint/bin/yamllint', ['--strict', '--config-file', '.yamllint.yml', ...yaml]);
  }
  for (const name of selectedFilesMatching(/\.json$/i)) {
    runTool('jsonlint', 'jsonlint', ['--mode=json', '--no-config', '--no-duplicate-keys', '--quiet', name]);
  }
  const workflows = yaml.filter(name => name.startsWith('.github/workflows/'));
  if (workflows.length) runTool('actionlint', 'actionlint', ['-shellcheck=', '-pyflakes=', ...workflows]);
}

function runOfficialHooks() {
  if (!input.selected.length) return;
  const textFiles = input.selected.filter(name => isText(name, fs.readFileSync(path.join(workspace, name))));
  const hooks = [
    { check: 'merge-conflict', module: 'check_merge_conflict', args: ['--assume-in-merge'], files: textFiles },
    { check: 'case-conflict', module: 'check_case_conflict', args: [], files: input.files },
    { check: 'mixed-endings', module: 'mixed_line_ending', args: ['--fix=no'], files: textFiles },
  ];
  for (const hook of hooks) {
    runTool(hook.check, python, ['-m', `pre_commit_hooks.${hook.module}`, ...hook.args, ...hook.files]);
  }
}

function checkRepositoryFiles(scratch) {
  findings.push(...filenameFindings(input.files));
  for (const name of input.selected) {
    const bytes = fs.readFileSync(path.join(workspace, name));
    findings.push(...textFindings(name, bytes, input.mode === 'staged'));
    if (!/\.md$/i.test(name)) continue;
    const text = bytes.toString('utf8');
    renderDiagrams(name, text, scratch);
  }
}

function checkRepositoryLinks() {
  for (const name of input.linkSelected) {
    const text = fs.readFileSync(path.join(workspace, name), 'utf8');
    findings.push(...linkFindings(workspace, name, text, input.files));
  }
}

function renderDiagrams(name, text, scratch) {
  for (const [index, diagram] of diagrams(name, text).entries()) {
    const source = path.join(scratch, `${index}.mmd`);
    fs.writeFileSync(source, diagram.source);
    const passed = runTool('mermaid', '/quality/node_modules/.bin/mmdc', [
      '--puppeteerConfigFile', '/quality/puppeteer.json', '--input', source, '--output', `${source}.svg`,
    ]);
    if (!passed) {
      findings.push({
        check: 'mermaid', file: name, line: diagram.line, rule: 'render',
        message: `Mermaid block ${index + 1} failed to render; see mermaid.log.`,
      });
    }
  }
}

function checkEditorLineEndings() {
  for (const { name, expected } of input.editorEndings) {
    findings.push({
      check: 'editor-line-endings', file: name, line: 1, rule: 'line-ending',
      message: `Working-tree file must use ${expected}; convert explicitly before committing.`,
    });
  }
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(reportsDirectory, name), JSON.stringify(value, null, 2));
}

function saveReports() {
  writeJson('findings.json', { input, results, findings });
  const summary = findings.map(item => {
    const location = `${item.file || '(no source location)'}:${item.line || '-'}`;
    return `${location} [${item.check}/${item.rule}] ${item.message}`;
  }).join('\n') || 'All applicable checks passed.\n';
  fs.writeFileSync(path.join(reportsDirectory, 'summary.txt'), summary);
  console.log(summary);
}

// Focused regressions run inside Linux, which can represent Windows-illegal filenames.
function runCheckerRegressions(scratch) {
  verifyTextAndMarkdownChecks();
  verifyFilenameChecks(scratch);
  console.log('Focused checker regressions passed.');
}

function verifyTextAndMarkdownChecks() {
  const bad = textFindings('bad.md', Buffer.from('bad \r\n'));
  assert(bad.some(item => item.rule === 'line-ending'));
  assert(bad.some(item => item.rule === 'trailing-whitespace'));
  assert.equal(textFindings('ok.cmd', Buffer.from('echo ok\r\n')).length, 0);
  assert.equal(textFindings('binary.png', Buffer.from([0, 13, 10])).length, 0);
  assert.equal(diagrams('test.md', '```mermaid\ngraph TD; A-->B\n```\n')[0].line, 1);
  assert(linkFindings(workspace, 'README.md', '[missing](absent.md)\n', input.files).length);
  assert.equal(linkFindings(workspace, 'README.md', '[ok](docs/architecture.md)\n', input.files).length, 0);
}

function verifyFilenameChecks(scratch) {
  const fixture = path.join(scratch, 'filenames');
  fs.mkdirSync(fixture);
  for (const name of ['Case.md', 'case.md', 'CON.txt', 'trailing.']) {
    fs.writeFileSync(path.join(fixture, name), '# Fixture\n');
  }
  spawnSync('git', ['init', '-q'], { cwd: fixture });
  spawnSync('git', ['add', '.'], { cwd: fixture });
  const collision = runCaseConflictFixture(fixture);
  assert.equal(collision.status, 1, collision.stderr);
  assert(collision.stdout.includes('case.md'));
  assert.equal(filenameFindings(['CON.txt', 'trailing.']).length, 2);
  assert(filenameFindings(['Upper/a.md', 'upper/b.md']).length);
  for (const name of ['case.md', 'CON.txt', 'trailing.']) fs.unlinkSync(path.join(fixture, name));
  spawnSync('git', ['add', '--all'], { cwd: fixture });
  const corrected = runCaseConflictFixture(fixture);
  assert.equal(corrected.status, 0, corrected.stderr);
  assert.equal(filenameFindings(['Case.md']).length, 0);
  fs.writeFileSync(path.join(reportsDirectory, 'regressions.log'), [
    collision.stdout,
    'Windows names and directory case checks failed as expected; corrected inputs passed.',
    '',
  ].join('\n'));
}

function runCaseConflictFixture(fixture) {
  return spawnSync(python, ['-m', 'pre_commit_hooks.check_case_conflict', 'Case.md'], {
    cwd: fixture, encoding: 'utf8',
  });
}

process.exitCode = main();
