// Generate a PR body from local hook evidence matching the committed candidate tree.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { prComparison } from './health.mjs';
import { renderComparison } from './health-report.mjs';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function formatNorwegianTime(timestamp) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
    .map(part => [part.type, part.value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

const root = git('rev-parse', '--show-toplevel');
const destination = path.join(root, 'quality-reports', 'pull-request.md');

try {
  // Remove stale generated text even when the replacement cannot be verified.
  fs.rmSync(destination, { force: true });
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'quality-reports', 'local-hook.json')));
  const commit = git('rev-parse', 'HEAD');
  if (receipt.hook !== 'staged-quality' || receipt.passed !== true
    || receipt.input?.mode !== 'staged' || receipt.parent !== git('rev-parse', 'HEAD^1')
    || receipt.tree !== git('rev-parse', 'HEAD^{tree}')) {
    throw new Error('Local hook evidence does not match HEAD. Commit with the pre-commit hooks enabled.');
  }
  if (receipt.machine !== os.hostname()) {
    throw new Error('Local hook evidence belongs to another machine. Generate on the committing/pushing machine.');
  }
  if (!receipt.results?.length || receipt.results.some(result => result.passed !== true)) {
    throw new Error('Local hook evidence contains missing or failed check results.');
  }
  const template = git('show', 'HEAD:.github/pull_request_template.md');
  const section = '\n## Local QA\n';
  const offset = template.indexOf(section);
  if (offset < 0) throw new Error('Committed PR template is missing its Local QA section.');
  const nextSection = template.indexOf('\n## ', offset + section.length);
  const value = text => String(text).replace(/[\r\n]/g, ' ').replaceAll('|', '&#124;').replaceAll('`', '&#96;');
  const qa = [
    section.trimStart(),
    'Local `staged-quality` pre-commit hook: ✅ **Passed**.',
    '',
    '| Evidence | Value |',
    '| --- | --- |',
    `| PR head commit | ${commit} |`,
    `| Checked Git tree | ${receipt.tree} |`,
    `| Completed (Europe/Oslo) | ${formatNorwegianTime(receipt.completedAt)} |`,
    `| Platform | ${value(receipt.platform)} |`,
    `| Quality image | ${value(receipt.input.image)} |`,
    `| Content files checked | ${receipt.input.selected.length} |`,
    `| Markdown link sources checked | ${receipt.input.linkSelected.length} |`,
    '',
  ].join('\n');
  const healthSection = '\n## Code health\n';
  const healthOffset = template.indexOf(healthSection);
  if (healthOffset < 0 || healthOffset > offset) throw new Error('PR template must place Code health before Local QA.');
  // Always regenerate from resolved commits: an old saved comparison is never trusted.
  const comparison = await prComparison(process.argv[2] || 'origin/main', 'HEAD', root);
  const body = template.slice(0, healthOffset) + '\n' + renderComparison(comparison, { compact: true })
    + '\n' + qa + (nextSection < 0 ? '' : template.slice(nextSection));
  fs.writeFileSync(destination, body);
  console.log(`Generated ${destination}\nVerified local hook evidence for ${commit}.`);
} catch (error) {
  console.error(`❌ PR QA report unavailable: ${error.message}`);
  process.exitCode = 1;
}
