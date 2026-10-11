// Advisory measurements never create a staged hook receipt or a score gate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, version, executable, configuration, requireAnalyzer } from './jscpd.mjs';
import { connect } from './mcp-client.mjs';
import { renderComparison, comparable } from './health-report.mjs';

export function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

const digest = value => createHash('sha256').update(value).digest('hex');

function authored(name) {
  const config = JSON.parse(fs.readFileSync(configuration, 'utf8'));
  const extensions = config.pattern.match(/\{([^}]+)\}/)[1].split(',');
  const ignored = config.ignore.some(glob => name.split('/').includes(glob.split('/')[1]));
  return !ignored && extensions.includes(path.extname(name).slice(1));
}

function inputFiles(directory, tree) {
  const output = tree
    ? git(directory, 'ls-tree', '-r', '--name-only', '-z', tree)
    : git(directory, 'ls-files', '--cached', '--others', '--exclude-standard', '-z');
  return [...new Set(output.split('\0').filter(Boolean))].filter(authored).sort();
}

export function snapshot(directory, destination, tree) {
  const files = [];
  for (const name of inputFiles(directory, tree)) {
    let contents;
    if (tree) {
      const mode = git(directory, 'ls-tree', tree, '--', name).split(' ')[0];
      if (mode !== '100644' && mode !== '100755') throw new Error(`Unsupported source mode: ${name}`);
      contents = execFileSync('git', ['show', `${tree}:${name}`], { cwd: directory });
    } else {
      const source = path.join(directory, name);
      if (!fs.existsSync(source)) continue; // A saved deletion is part of the working tree.
      if (!fs.lstatSync(source).isFile()) throw new Error(`Source must be a regular file: ${name}`);
      contents = fs.readFileSync(source);
    }
    fs.mkdirSync(path.dirname(path.join(destination, name)), { recursive: true });
    fs.writeFileSync(path.join(destination, name), contents);
    files.push({ path: name, hash: digest(contents) });
  }
  return files;
}

function readJson(directory, name) {
  return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
}

export function validateStatistics(result) {
  const total = result?.statistics?.total;
  for (const key of ['sources', 'lines', 'clones', 'duplicatedLines', 'percentage']) {
    if (!Number.isFinite(total?.[key]) || total[key] < 0) throw new Error(`Invalid MCP statistic: ${key}`);
  }
  if (!total.sources || !total.lines) throw new Error('Empty analysis: no measurable authored code');
  return total;
}

export async function measure(directory, output, identity = {}, tree) {
  requireAnalyzer();
  fs.mkdirSync(output, { recursive: true });
  fs.rmSync(path.join(output, 'measurement.json'), { force: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-health-'));
  let client;
  try {
    const files = snapshot(directory, scratch, tree);
    if (!files.length) throw new Error('Empty authored source scope');
    const configBytes = fs.readFileSync(configuration);
    const config = path.join(scratch, '.jscpd.json');
    fs.writeFileSync(config, configBytes);
    client = await connect(scratch, config);
    const refresh = await client.call('check_current_directory', { limit: 100000 });
    if (!Array.isArray(refresh?.duplications)) throw new Error('Invalid refreshed MCP clone list');
    const statistics = await client.call('get_statistics');
    const total = validateStatistics(statistics);
    if (refresh.clones !== total.clones || refresh.duplicatedLines !== total.duplicatedLines) {
      throw new Error('Conflicting refreshed MCP statistics');
    }
    for (const flag of ['health', 'complexity', 'dead-code']) {
      const result = execFileSync(executable(), [
        scratch, '--config', config, `--${flag}`, '--reporters', 'json',
        '--output', output, '--no-colors', '--no-tips',
      ], { cwd: scratch, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      fs.writeFileSync(path.join(output, `${flag}.log`), result);
    }
    const health = readJson(output, 'jscpd-health.json').health;
    const complexity = readJson(output, 'jscpd-complexity.json').summary;
    const deadCode = readJson(output, 'basta-report.json');
    if (!Number.isFinite(health?.score) || !Array.isArray(health.dimensions)
      || !Array.isArray(complexity?.files) || !Array.isArray(deadCode?.findings)) {
      throw new Error('Invalid CLI analysis result');
    }
    if (!tree) {
      const current = inputFiles(directory).filter(name => fs.existsSync(path.join(directory, name)))
        .map(name => ({ path: name, hash: digest(fs.readFileSync(path.join(directory, name))) }));
      if (JSON.stringify(current) !== JSON.stringify(files)) {
        throw new Error('Saved source changed during measurement; rescan before comparison');
      }
    }
    const report = {
      schema: 1, available: true, createdAt: new Date().toISOString(), identity,
      tool: { name: 'jscpd', version, configHash: digest(configBytes), config: JSON.parse(configBytes) },
      input: { files, hash: digest(JSON.stringify(files)), scope: JSON.parse(configBytes).pattern },
      mcp: { server: client.server, tools: client.tools, statistics, refresh },
      health, complexity, deadCode,
      limitations: [
        'Files below minTokens/minLines and unsupported formats do not contribute to measured totals.',
        'Dead-code findings are heuristic. Script entry points and .mjs imports can be misclassified; inspect findings and confidence.',
        'Complexity output lists hotspots, not necessarily every file. Health shares cover the scanned codebase.',
        'Scores are rounded by jscpd to one decimal; smaller changes may be below its resolution.',
      ],
    };
    fs.writeFileSync(path.join(output, 'measurement.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    await client?.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export async function prComparison(baseRef = 'origin/main', headRef = 'HEAD', directory = root) {
  const output = path.join(directory, 'quality-reports', 'health', 'pr');
  fs.mkdirSync(output, { recursive: true });
  const reportFile = path.join(output, 'comparison.json');
  fs.rmSync(reportFile, { force: true });
  let identity;
  let comparison;
  try {
    const base = git(directory, 'rev-parse', `${baseRef}^{commit}`);
    const head = git(directory, 'rev-parse', `${headRef}^{commit}`);
    const candidate = git(directory, 'merge-tree', '--write-tree', base, head).split('\n')[0];
    identity = { kind: 'pr-merge', base, head, candidate, baseRef };
    const before = await measure(directory, path.join(output, 'before'), { kind: 'target', commit: base }, base);
    const after = await measure(directory, path.join(output, 'after'), identity, candidate);
    comparison = { available: true, identity, before, after };
  } catch (error) {
    comparison = { available: false, identity, reason: error.message };
  }
  fs.writeFileSync(reportFile, JSON.stringify(comparison, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'comparison.md'), renderComparison(comparison, { compact: true }));
  return comparison;
}

function workingIdentity(directory) {
  return { kind: 'working-tree', commit: git(directory, 'rev-parse', 'HEAD') };
}

async function main() {
  const mode = process.argv[2];
  const reports = path.join(root, 'quality-reports', 'health');
  if (mode === 'pr') {
    const report = await prComparison(process.argv[3], process.argv[4]);
    console.log(renderComparison(report, { compact: true }));
    return; // Availability and scores are advisory for PRs.
  }
  if (mode === 'doctor') {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-health-doctor-'));
    try {
      const report = await measure(root, output, workingIdentity(root));
      console.log(`PASS jscpd ${version}: MCP refresh and CLI ready, ${report.health.size.files} measured files`);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
    return;
  }
  if (mode !== 'baseline' && mode !== 'compare') {
    throw new Error('Usage: node tools/quality/health.mjs baseline|compare|doctor|pr [base-ref] [head-ref]');
  }
  const baselineFile = path.join(reports, 'baseline', 'measurement.json');
  if (mode === 'compare') fs.rmSync(path.join(reports, 'development.md'), { force: true });
  if (mode === 'baseline' && fs.existsSync(baselineFile)) {
    throw new Error('Baseline already exists. Archive/remove it explicitly before starting another task.');
  }
  const before = mode === 'compare' ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : undefined;
  const output = path.join(reports, mode === 'baseline' ? 'baseline' : 'current');
  fs.rmSync(path.join(output, 'measurement.json'), { force: true });
  const after = await measure(root, output, workingIdentity(root));
  if (mode === 'compare') {
    const comparison = { available: true, before, after };
    const text = renderComparison(comparison);
    fs.writeFileSync(path.join(reports, 'development.md'), text);
    console.log(text);
    if (comparable(before, after)) process.exitCode = 1;
  } else {
    console.log(`Baseline saved: ${baselineFile}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Measurement unavailable: ${error.message}`);
    if (process.argv[2] === 'compare') {
      const output = path.join(root, 'quality-reports/health/development.md');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, renderComparison({ available: false, reason: error.message }));
    }
    process.exitCode = 1;
  });
}
