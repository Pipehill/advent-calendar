import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { metadata } from './release-api.mjs';

// Run the exact API-only program, without replacing its publication decisions.
const workflow = fs.readFileSync(new URL('../../.github/workflows/tag-release.yml', import.meta.url), 'utf8');
const inline = workflow.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0];
const program = inline.replace(/^ {10}/gm, '').replace("import fs from 'node:fs';\n", '');
export const releaseSha = 'b'.repeat(40);
export const sourceSha = 'a'.repeat(40);
export const previousSha = 'd'.repeat(40);
export const publicationPolicy = 'Release publication policy: 00022-v1';
export const encoded = text => ({ encoding: 'base64', content: Buffer.from(text).toString('base64') });
export const publishedRelease = (tag = 'v1.0.0', changes = {}) => ({
  tag_name: tag, draft: false, prerelease: false, published_at: '2026-11-17T10:00:00Z',
  html_url: `https://github.com/owner/repo/releases/tag/${tag}`, body: 'Owner-written release notes', ...changes,
});
export const sourceCommit = (sha, message = 'Improve calendar', changes = {}) => ({
  sha, parents: [{ sha: 'e'.repeat(40) }], commit: { message }, author: { login: 'contributor' }, ...changes,
});

export function tagFixture({ existing, merged = true, mergeSha = releaseSha,
  version = '1.0.0', bodyVersion = version } = {}) {
  const calls = [];
  const summary = [];
  const responses = new Map();
  const event = { pull_request: {
    number: 7, merged, merge_commit_sha: mergeSha, body: metadata(bodyVersion, sourceSha),
    head: { ref: 'main', sha: sourceSha, repo: { full_name: 'owner/repo' } },
    base: { ref: 'deploy', repo: { full_name: 'owner/repo' } },
  } };
  const values = {
    'pulls/7': structuredClone(event.pull_request),
    [`git/commits/${mergeSha}`]: { parents: [{ sha: previousSha }, { sha: sourceSha }], tree: { sha: 'release-tree' } },
    [`git/commits/${sourceSha}`]: { tree: { sha: 'release-tree' } },
    [`git/commits/${previousSha}`]: { parents: [] },
    [`git/ref/tags/v${version}`]: existing ?? null,
    [`contents/.github/workflows/tag-release.yml?ref=${mergeSha}`]: encoded(workflow),
    'releases?per_page=100&page=1': [],
    [`releases/tags/v${version}`]: null,
    'tags?per_page=100&page=1': [],
    'pulls?state=closed&base=deploy&per_page=100&page=1': [],
    [`commits?sha=${mergeSha}&per_page=100&page=1`]: [],
  };
  for (const [path, value] of Object.entries({ VERSION: `${version}\n`,
    'src/frontend/package.json': JSON.stringify({ version }),
    'src/contract/openapi.json': JSON.stringify({ info: { version } }) })) {
    values[`contents/${path}?ref=${mergeSha}`] = encoded(value);
  }
  const env = { GITHUB_EVENT_PATH: 'event', GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'test',
    GITHUB_STEP_SUMMARY: 'summary', GITHUB_WORKFLOW_SHA: 'f'.repeat(40) };
  const rememberRelease = release => {
    values[`releases/tags/${release.tag_name}`] = release;
    values['releases?per_page=100&page=1'].push(release);
    return release;
  };
  const context = {
    Buffer, console: { log() {} }, process: { env },
    fs: { readFileSync: () => JSON.stringify(event), appendFileSync: (_path, text) => summary.push(text) },
    fetch: async (url, options) => {
      const path = url.replace('https://api.github.com/repos/owner/repo/', '');
      const body = options.body && JSON.parse(options.body);
      const call = { path, method: options.method, body };
      calls.push(call);
      const key = `${options.method} ${path}`;
      const queue = responses.get(key);
      if (queue?.length) {
        const configured = queue.shift();
        const result = typeof configured === 'function' ? await configured(call) : configured;
        return { status: result.status, ok: result.status >= 200 && result.status < 300,
          json: async () => result.value };
      }
      let value;
      if (options.method === 'POST' && path === 'git/tags') {
        value = { sha: 'c'.repeat(40) };
        values[`git/tags/${value.sha}`] = { ...body, object: { type: 'commit', sha: body.object } };
      } else if (options.method === 'POST' && path === 'git/refs') {
        value = { object: { type: 'tag', sha: body.sha } };
        values[`git/ref/tags/v${version}`] = value;
      } else if (options.method === 'POST' && path === 'releases') {
        value = rememberRelease(publishedRelease(body.tag_name, body));
      } else if (options.method === 'POST' && path === 'releases/generate-notes') {
        value = { body: '## What changed\n- Release wrapper by @owner in #7' };
      } else {
        assert.equal(options.method, 'GET', `Unexpected API mutation: ${key}`);
        assert.ok(Object.hasOwn(values, path), `Unexpected API path: ${path}`);
        value = values[path];
      }
      return { status: value === null ? 404 : 200, ok: value !== null, json: async () => value };
    },
  };
  return { calls, summary, values, event, env, responses, rememberRelease,
    respond: (method, path, ...results) => responses.set(`${method} ${path}`, results),
    run: () => vm.runInNewContext(`(async () => {\n${program}\n})()`, context) };
}

export function addPreviousRelease(fixture, { version = '0.9.0', sha = previousSha } = {}) {
  const source = '1'.repeat(40);
  fixture.values['tags?per_page=100&page=1'].push({ name: `v${version}`, commit: { sha } });
  fixture.values['pulls?state=closed&base=deploy&per_page=100&page=1'].push({
    number: 6, merged_at: '2026-11-16T10:00:00Z', merge_commit_sha: sha,
    head: { ref: 'main', sha: source, repo: { full_name: 'owner/repo' } },
    base: { ref: 'deploy', repo: { full_name: 'owner/repo' } }, body: metadata(version, source),
  });
  fixture.values[`git/ref/tags/v${version}`] = { object: { type: 'commit', sha } };
  fixture.values[`git/commits/${sha}`] = { parents: [{ sha: '2'.repeat(40) }, { sha: source }], tree: { sha: 'previous-tree' } };
  fixture.values[`git/commits/${source}`] = { tree: { sha: 'previous-tree' } };
  fixture.values[`contents/VERSION?ref=${sha}`] = encoded(`${version}\n`);
  fixture.values[`compare/${sha}...${fixture.event.pull_request.merge_commit_sha}?per_page=100&page=1`] = { commits: [] };
  return sha;
}

export function setInitialHistory(fixture, commits) {
  fixture.values[`commits?sha=${fixture.event.pull_request.merge_commit_sha}&per_page=100&page=1`] = commits;
  for (const commit of commits) fixture.values[`commits/${commit.sha}/pulls?per_page=100&page=1`] = [];
}

export const tagWrites = fixture => fixture.calls.filter(call => call.method === 'POST' && call.path.startsWith('git/'));
export const releaseWrites = fixture => fixture.calls.filter(call => call.method === 'POST' && call.path === 'releases');
