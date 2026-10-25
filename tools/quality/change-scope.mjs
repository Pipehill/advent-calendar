// Share the Markdown-only exception between staged checks, PR evidence and CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitOutput, splitGitPaths } from './snapshot.mjs';

export function onlyMarkdownChanges(root, revisions) {
  // Disable rename detection so both the removed and added paths are considered.
  const output = gitOutput(root, ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', ...revisions, '--']);
  const entries = splitGitPaths(output);
  if (!entries.length) return false;
  for (let index = 0; index < entries.length; index += 2) {
    const header = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])$/.exec(entries[index]);
    if (!header || !entries[index + 1]) throw new Error('Unexpected Git change metadata');
    const regular = mode => ['000000', '100644', '100755'].includes(mode);
    if (!['A', 'D', 'M'].includes(header[3]) || !regular(header[1]) || !regular(header[2])
      || !/\.md$/i.test(entries[index + 1])) return false;
  }
  return true;
}

export function markdownOnlyCommit(root) {
  const parents = gitOutput(root, ['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ');
  // Initial and merge commits do not qualify for the single-commit exception.
  return parents.length === 2 && onlyMarkdownChanges(root, [parents[1], parents[0]]);
}

export function markdownOnlyPullRequest(root, eventName, event) {
  if (eventName !== 'pull_request') return false;
  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (![base, head].every(value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value))) {
    throw new Error('Pull request scope requires exact base and head commits');
  }
  // Compare the entire PR, not merely its latest commit or the moving base branch.
  return onlyMarkdownChanges(root, [`${base}...${head}`]);
}

function main() {
  if (process.argv[2] !== 'ci') throw new Error('Usage: node tools/quality/change-scope.mjs ci');
  const root = gitOutput(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const event = process.env.GITHUB_EVENT_NAME === 'pull_request'
    ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    : {};
  const markdownOnly = markdownOnlyPullRequest(root, process.env.GITHUB_EVENT_NAME, event);
  const message = markdownOnly
    ? 'Quality checks skipped: the complete pull request changes only Markdown files.'
    : 'Quality checks required: non-Markdown changes, an empty diff or a manual run.';
  console.log(message);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `markdown_only=${markdownOnly}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
