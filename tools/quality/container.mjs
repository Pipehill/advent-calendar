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
  const sql = selectedFilesMatching(/\.sql$/i);
  if (sql.length) runTool('sqlfluff', '/venvs/sqlfluff/bin/sqlfluff', ['lint', '--config', '.sqlfluff', ...sql]);
  const csharp = selectedFilesMatching(/\.(cs|csproj|props|targets)$/i);
  if (csharp.length) runTool('csharpier', 'csharpier', ['check', ...csharp]);
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
  runRegression('Given invalid Markdown text, When text rules run, Then line endings and trailing whitespace are reported', verifyInvalidMarkdownText);
  runRegression('Given allowed command and binary bytes, When text rules run, Then their contents are accepted', verifyAllowedTextInputs);
  runRegression('Given a Mermaid fence, When diagrams are extracted, Then its source line is preserved', verifyMermaidSourceLocation);
  runRegression('Given existing and missing link targets, When Markdown links are checked, Then only missing targets are reported', verifyReadmeLinkTargets);
  runRegression('Given encoded filenames with query and fragment parts, When links are checked, Then target and anchor validity are respected', () => verifyEncodedLinkTargets(scratch));
  runRegression('Given invalid filenames, When checks run before and after correction, Then invalid names fail and corrected names pass', () => verifyFilenameChecks(scratch));
  runRegression('Given unformatted C# source, When the formatter checks and corrects it, Then invalid source fails and corrected source passes', () => verifyCsharpLinter(scratch));
  runRegression('Given unformatted SQL source, When the linter checks both variants, Then invalid source fails and corrected source passes', () => verifySqlLinter(scratch));
  fs.writeFileSync(path.join(reportsDirectory, 'backend-linter-fixtures.log'),
    'CSharpier and SQLFluff rejected invalid fixtures and accepted corrected fixtures.\n');
  console.log('Focused checker regressions passed.');
}

function runRegression(description, verify) {
  console.log(description);
  verify();
}

function verifyCsharpLinter(scratch) {
  // Given a C# fixture that violates the pinned formatter's rules.
  const csharp = path.join(scratch, 'Fixture.cs');
  fs.writeFileSync(csharp, 'public class Fixture{public int Value{get;set;}}\n');
  const checkCsharp = () => spawnSync('csharpier', ['check', csharp], { encoding: 'utf8' });

  // When invalid source is checked, formatted and checked again.
  const invalidCsharp = checkCsharp();
  const format = spawnSync('csharpier', ['format', '--no-cache', csharp], { encoding: 'utf8' });
  const correctedCsharp = checkCsharp();

  // Then the invalid fixture fails, formatting succeeds and corrected source passes.
  assert.equal(invalidCsharp.status, 1, invalidCsharp.stdout + invalidCsharp.stderr);
  assert.equal(format.status, 0, format.stderr);
  assert.equal(correctedCsharp.status, 0, correctedCsharp.stdout + correctedCsharp.stderr);
}

function verifySqlLinter(scratch) {
  // Given a SQL fixture that violates the PostgreSQL lint configuration.
  const sql = path.join(scratch, 'fixture.sql');
  const checkSql = () => spawnSync('sqlfluff', [
    'lint', '--config', path.join(workspace, '.sqlfluff'), sql,
  ], { encoding: 'utf8' });
  fs.writeFileSync(sql, 'select 1;\n');

  // When the linter checks the invalid source and its corrected variant.
  const invalidSql = checkSql();
  fs.writeFileSync(sql, 'SELECT 1;\n');
  const correctedSql = checkSql();

  // Then the invalid fixture fails and corrected SQL passes.
  assert.equal(invalidSql.status, 1, invalidSql.stdout + invalidSql.stderr);
  assert.equal(correctedSql.status, 0);
}

function verifyEncodedLinkTargets(scratch) {
  const names = ['target#part.md', 'target?query.md'];
  for (const name of names) {
    // Given an existing filename whose punctuation must be URL encoded.
    fs.writeFileSync(path.join(scratch, name), '# Heading\n');
    const href = `${encodeURIComponent(name)}?view=source#heading`;

    // When the valid target/anchor and a missing-anchor variant are checked.
    const valid = linkFindings(scratch, 'source.md', `[Target](${href})\n`, names);
    const missing = linkFindings(scratch, 'source.md', `[Target](${href}-missing)\n`, names);

    // Then encoded punctuation and query parts are accepted while the missing anchor fails.
    assert.equal(valid.length, 0);
    assert.equal(missing.length, 1);
  }
}

function verifyInvalidMarkdownText() {
  // Given Markdown bytes with trailing whitespace and CRLF endings.
  const bytes = Buffer.from('bad \r\n');

  // When repository text rules inspect those bytes.
  const bad = textFindings('bad.md', bytes);

  // Then both independent text violations are reported for the same input.
  assert(bad.some(item => item.rule === 'line-ending'));
  assert(bad.some(item => item.rule === 'trailing-whitespace'));
}

function verifyAllowedTextInputs() {
  for (const [name, bytes] of [
    ['ok.cmd', Buffer.from('echo ok\r\n')], ['binary.png', Buffer.from([0, 13, 10])],
  ]) {
    // Given file bytes that are exempt from the authored-text LF requirement.
    const contents = bytes;

    // When repository text rules inspect this file.
    const found = textFindings(name, contents);

    // Then supported command endings and binary content do not produce text findings.
    assert.equal(found.length, 0);
  }
}

function verifyMermaidSourceLocation() {
  // Given a Mermaid diagram fence at the first source line.
  const source = '```mermaid\ngraph TD; A-->B\n```\n';

  // When the diagram is extracted.
  const extracted = diagrams('test.md', source);

  // Then its source location remains available for diagnostics.
  assert.equal(extracted[0].line, 1);
}

function verifyReadmeLinkTargets() {
  for (const [source, expected] of [
    ['[missing](absent.md)\n', 1], ['[ok](docs/architecture.md)\n', 0],
  ]) {
    // Given a Markdown link to an existing or missing repository target.
    const markdown = source;

    // When the link is checked against snapshot files.
    const found = linkFindings(workspace, 'README.md', markdown, input.files);

    // Then only the missing target is reported.
    assert.equal(found.length, expected);
  }
}

function verifyFilenameChecks(scratch) {
  // Given tracked case collisions and Windows-illegal filenames in a Linux fixture.
  const fixture = path.join(scratch, 'filenames');
  fs.mkdirSync(fixture);
  for (const name of ['Case.md', 'case.md', 'CON.txt', 'trailing.']) {
    fs.writeFileSync(path.join(fixture, name), '# Fixture\n');
  }
  spawnSync('git', ['init', '-q'], { cwd: fixture });
  spawnSync('git', ['add', '.'], { cwd: fixture });

  // When official and repository filename rules inspect those paths.
  const collision = runCaseConflictFixture(fixture);
  const illegalNames = filenameFindings(['CON.txt', 'trailing.']);
  const directoryCollision = filenameFindings(['Upper/a.md', 'upper/b.md']);

  // Then both file and directory portability violations are detected.
  assert.equal(collision.status, 1, collision.stderr);
  assert(collision.stdout.includes('case.md'));
  assert.equal(illegalNames.length, 2);
  assert(directoryCollision.length);

  // When the conflicting and illegal files are removed and the index updated.
  for (const name of ['case.md', 'CON.txt', 'trailing.']) fs.unlinkSync(path.join(fixture, name));
  spawnSync('git', ['add', '--all'], { cwd: fixture });
  const corrected = runCaseConflictFixture(fixture);
  const correctedNames = filenameFindings(['Case.md']);

  // Then the remaining valid filename passes both checks.
  assert.equal(corrected.status, 0, corrected.stderr);
  assert.equal(correctedNames.length, 0);
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
