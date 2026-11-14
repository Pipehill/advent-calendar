import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  allPages, assertFinalized, assertNewVersion, githubApi, recordedVersion, summary,
} from './release-api.mjs';
import { readVersion } from './version.mjs';

const migrationDirectory = 'src/backend/Calendar.Api/Migrations/';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function assertMigrationIntegrity(base, candidate) {
  for (const [name, hash] of Object.entries(base)) {
    if (candidate[name] !== hash) throw new Error(`Published migration changed, deleted or renamed: ${name}`);
  }
  const sequences = new Set();
  for (const name of Object.keys(candidate)) {
    const sequence = name.match(/\/(\d{4})_[^/]+\.sql$/)?.[1];
    if (!sequence || sequences.has(sequence)) throw new Error(`Migration sequence is invalid or duplicated: ${name}`);
    sequences.add(sequence);
  }
}

function migrationEntries(ref) {
  return Object.fromEntries(git('ls-tree', '-r', ref, '--', migrationDirectory).split('\n').filter(Boolean).map(line => {
    const match = line.match(/^100644 blob ([a-f0-9]{40})\t(.+\.sql)$/);
    if (!match) throw new Error('Migration directory contains an unexpected entry');
    return [match[2], match[1]];
  }));
}

export function assertCandidate(candidate, source, base, parents) {
  if (candidate !== source) throw new Error('Candidate merge tree differs from main; deploy-only changes must be reconciled');
  if (parents.length !== 2 || parents[0] !== base || parents[1] === base) {
    throw new Error('Expected the candidate merge commit to have the exact deploy base and main source parents');
  }
}

function assertReleaseProvenance(pr, repository) {
  if (pr.base.ref !== 'deploy' || pr.head.ref !== 'main' || pr.head.repo?.full_name !== repository ||
    pr.base.repo?.full_name !== repository) throw new Error('Release PR must be same-repository main to deploy');
}

export async function currentReleaseVersion(api, eventPr, repository) {
  // Reruns retain the original event body, even after Prepare release repairs it.
  // Read current metadata only when it still belongs to this exact tested candidate.
  const current = await api(`pulls/${eventPr.number}`);
  assertReleaseProvenance(current, repository);
  if (current.state !== 'open' || current.head.sha !== eventPr.head.sha || current.base.sha !== eventPr.base.sha) {
    throw new Error('Release candidate changed; validate its current open head and base instead');
  }
  return recordedVersion(current.body);
}

export async function validateRelease(event, environment = process.env) {
  const repository = environment.GITHUB_REPOSITORY;
  const api = githubApi(repository, environment.GITHUB_TOKEN);
  const pr = event.pull_request;
  let base;
  if (pr) {
    assertReleaseProvenance(pr, repository);
    base = pr.base.sha;
    const currentBase = await api('commits/deploy');
    if (currentBase.sha !== base) throw new Error('deploy advanced; rerun validation against the current base');
    const head = git('rev-parse', 'HEAD');
    if (head !== environment.GITHUB_SHA) throw new Error('Checkout is not the event candidate merge commit');
    const parents = git('show', '-s', '--format=%P', head).split(' ');
    if (parents[1] !== pr.head.sha) throw new Error('Candidate source parent differs from the event main source');
    assertCandidate(git('rev-parse', 'HEAD^{tree}'), git('rev-parse', `${pr.head.sha}^{tree}`), base, parents);
  } else {
    if (environment.GITHUB_REF !== 'refs/heads/main') throw new Error('Manual deploy validation requires main');
    const [main, deploy] = await Promise.all([api('commits/main'), api('commits/deploy')]);
    if (git('rev-parse', 'HEAD') !== main.sha) throw new Error('main changed; rerun manual validation');
    base = deploy.sha;
    const candidateTree = git('merge-tree', '--write-tree', base, main.sha);
    if (candidateTree !== git('rev-parse', 'HEAD^{tree}')) throw new Error('Manual candidate tree differs from main');
  }
  const version = readVersion(process.cwd());
  if (pr && await currentReleaseVersion(api, pr, repository) !== version) {
    throw new Error('Stale release metadata; rerun Prepare release then rerun validation');
  }
  const tags = await allPages(api, 'tags');
  await assertFinalized(api, repository, tags);
  assertNewVersion(version, tags);
  assertMigrationIntegrity(migrationEntries(base), migrationEntries('HEAD'));
  summary(`Validated release ${version}; candidate ${git('rev-parse', 'HEAD')}; deploy base ${base}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await validateRelease(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
}
