import fs from 'node:fs';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const metadataPattern = /<!-- advent-release:start -->[\s\S]*?<!-- advent-release:end -->/;

export function compareVersions(left, right) {
  if (!stableVersion.test(left) || !stableVersion.test(right)) throw new Error('Expected stable SemVer');
  const a = left.split('.').map(BigInt);
  const b = right.split('.').map(BigInt);
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function validateMirrors(versionText, frontendText, contractText) {
  const version = versionText.trim();
  if (!stableVersion.test(version)) throw new Error('VERSION must contain stable MAJOR.MINOR.PATCH');
  if (JSON.parse(frontendText).version !== version || JSON.parse(contractText).info.version !== version) {
    throw new Error('VERSION, frontend package and API document versions differ');
  }
  return version;
}

export function metadata(version, source) {
  return `<!-- advent-release:start -->\nRelease version: ${version}\nPrepared source: ${source}\n<!-- advent-release:end -->`;
}

export function recordedVersion(body) {
  const block = body?.match(metadataPattern)?.[0];
  const version = block?.match(/^Release version: (.+)$/m)?.[1];
  const source = block?.match(/^Prepared source: ([a-f0-9]{40})$/m)?.[1];
  if (!version || !stableVersion.test(version) || !source) throw new Error('Missing or invalid Prepare release metadata');
  return version;
}

export function refreshMetadata(body, version, source) {
  const block = metadata(version, source);
  return metadataPattern.test(body ?? '') ? body.replace(metadataPattern, block) : `${body ?? ''}\n\n${block}`;
}

export function assertNewVersion(version, tags) {
  const versions = tags.filter(tag => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag.name));
  if (!versions.length && version !== '1.0.0') throw new Error('The first release must be 1.0.0');
  if (versions.some(tag => compareVersions(version, tag.name.slice(1)) <= 0)) {
    throw new Error(`Release ${version} must exceed every published stable version`);
  }
}

export function githubApi(repository, token, fetcher = fetch) {
  return async (path, options = {}) => {
    const response = await fetcher(`https://api.github.com/repos/${repository}/${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) throw new Error(`GitHub API ${options.method ?? 'GET'} ${path}: HTTP ${response.status}`);
    return response.json();
  };
}

export async function allPages(api, path) {
  const values = [];
  for (let page = 1; ; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    values.push(...result);
    if (result.length < 100) return values;
  }
}

export async function versionAt(api, sha) {
  const read = async path => {
    const result = await api(`contents/${path}?ref=${sha}`);
    if (result.encoding !== 'base64') throw new Error(`Unexpected content encoding for ${path}`);
    return Buffer.from(result.content, 'base64').toString('utf8');
  };
  const [version, frontend, contract] = await Promise.all([
    read('VERSION'), read('src/frontend/package.json'), read('src/contract/openapi.json'),
  ]);
  return validateMirrors(version, frontend, contract);
}

export async function assertFinalized(api, repository, tags) {
  const closed = await allPages(api, 'pulls?state=closed&base=deploy');
  const releases = closed.filter(pr => pr.merged_at && pr.head.ref === 'main' && pr.head.repo?.full_name === repository);
  for (const release of releases) {
    const version = recordedVersion(release.body);
    const tag = tags.find(item => item.name === `v${version}`);
    if (!tag || tag.commit.sha !== release.merge_commit_sha) {
      throw new Error(`Release PR #${release.number} has no matching final tag; retry Tag release before preparing another release`);
    }
  }
}

export function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  console.log(text);
}
