// Publish isolated QA output after checking; credentials never enter the container.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const commentMarker = '<!-- advent-code-quality-report -->';

function clip(text) {
  return text.length > 12000 ? `${text.slice(0, 12000)}\n\nReport truncated; see run artifacts.` : text;
}

function cleanMegaReport(report) {
  const banner = /^\[!\[MegaLinter is provided by OX Security\]\([^)]*\/ox-banner\.png\)\]\([^)]*\)$/;
  const support = /^Show us your support by \[\*\*starring ⭐ the repository\*\*\]\(https:\/\/github\.com\/oxsecurity\/megalinter\)$/;
  return report.split(/\r?\n/).filter(line => !banner.test(line.trim()) && !support.test(line.trim())).join('\n').trim();
}

function stepStatus(outcome) {
  const labels = { success: 'Passed', failure: 'Failed', skipped: 'Skipped', cancelled: 'Cancelled' };
  return `${outcome === 'success' ? '✅' : '❌'} ${labels[outcome] || 'Incomplete'}`;
}

export function buildComment({ revision, runUrl, setupOutcome, checkOutcome, megaReport, summary }) {
  const passed = setupOutcome === 'success' && checkOutcome === 'success';
  const commitUrl = `${runUrl.split('/actions/runs/')[0]}/commit/${revision}`;
  const report = cleanMegaReport(megaReport || '');
  const custom = clip(summary || 'No additional-check report was produced.');
  const fence = '`'.repeat(Math.max(3, ...Array.from(custom.matchAll(/`+/g), match => match[0].length + 1)));
  const additionalChecks = summary?.trim() === 'All applicable checks passed.' ? [] : [
    '### Additional repository checks', '', fence, custom, fence, '',
  ];
  const body = [
    commentMarker, `## Code Quality - HEAD [${revision.slice(0, 7)}](${commitUrl})`, '',
    `Overall code quality: ${passed ? '✅ **Passed**' : '❌ **Failed or incomplete**'}`, '',
    `[CI run and report artifacts](${runUrl})`, '',
    `- ${stepStatus(setupOutcome)} — **Quality tool setup**`,
    `- ${stepStatus(checkOutcome)} — **Lint and repository checks**`, '',
    clip(report || 'No MegaLinter report was produced. See the CI run for execution errors.'), '',
    ...additionalChecks,
  ].join('\n');
  // GitHub limits comment bodies; retain a link to the complete reports if truncated.
  const bytes = Buffer.from(body);
  return bytes.length > 60000
    ? `${bytes.subarray(0, 60000).toString()}\n\nReport truncated. [Complete reports](${runUrl}).`
    : body;
}

export async function publishComment({ repository, number, revision, body, token, fetchImpl = fetch }) {
  async function request(endpoint, method = 'GET', payload) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${endpoint}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10',
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub comment API failed (${response.status}, ${method} ${endpoint}).`);
    return response.json();
  }

  const pull = await request(`/pulls/${number}`);
  if (pull.head.sha !== revision) {
    console.log('Skipping report for an outdated PR head.');
    return;
  }
  let existing;
  for (let page = 1; !existing; page++) {
    const comments = await request(`/issues/${number}/comments?per_page=100&page=${page}`);
    existing = comments.find(comment => comment.user?.login === 'github-actions[bot]'
      && comment.body?.startsWith(commentMarker));
    if (comments.length < 100) break;
  }
  if (existing) {
    await request(`/issues/comments/${existing.id}`, 'PATCH', { body });
  } else {
    await request(`/issues/${number}/comments`, 'POST', { body });
  }
}

function readReport(filename) {
  return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
}

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = process.env.GITHUB_REPOSITORY;
  if (!event.pull_request || event.pull_request.head.repo.full_name !== repository) {
    console.log('PR comment publishing is only enabled for same-repository pull requests.');
    return;
  }
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required for PR comment publishing.');
  const revision = event.pull_request.head.sha;
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const body = buildComment({
    revision, runUrl,
    setupOutcome: process.env.QUALITY_SETUP_OUTCOME,
    checkOutcome: process.env.QUALITY_CHECK_OUTCOME,
    megaReport: readReport('quality-reports/full/megalinter/megalinter-report.md'),
    summary: readReport('quality-reports/full/summary.txt'),
  });
  await publishComment({ repository, number: event.pull_request.number, revision, body, token });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
