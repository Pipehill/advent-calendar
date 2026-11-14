import { pathToFileURL } from 'node:url';
import {
  allPages, assertFinalized, assertNewVersion, githubApi, metadata, refreshMetadata, summary, versionAt,
} from './release-api.mjs';

const checklist = `- [ ] Backup downloaded and migration effects reviewed.
- [ ] Approve pending PR workflow runs if requested by GitHub.
- [ ] Deploy readiness passed on the current source and base; rerun failed validation after metadata refresh.
- [ ] Merge manually with Create a merge commit; retain main.
- [ ] Verify both Sliplane services, readiness, login, served version and running commits.
- [ ] Verify the final tag (independent from hosting health).`;

export async function prepareRelease(api, repository, ref) {
  if (ref !== 'refs/heads/main') throw new Error('Run Prepare release with the main branch selected');
  let main;
  let deploy;
  try {
    [main, deploy] = await Promise.all([api('commits/main'), api('commits/deploy')]);
  } catch (error) {
    throw new Error(`Both main and deploy must exist; bootstrap deploy manually before preparation. ${error.message}`);
  }
  if (main.commit.tree.sha === deploy.commit.tree.sha) return 'No changes: main and deploy have identical trees.';

  const version = await versionAt(api, main.sha);
  const tags = await allPages(api, 'tags');
  await assertFinalized(api, repository, tags);
  assertNewVersion(version, tags);
  const open = await allPages(api, 'pulls?state=open&base=deploy');
  const matching = open.filter(pr => pr.head.ref === 'main' && pr.head.repo?.full_name === repository);
  if (matching.length > 1) throw new Error('Multiple main-to-deploy PRs exist; close duplicates before continuing');

  let pr = matching[0];
  if (pr) {
    const body = refreshMetadata(pr.body, version, main.sha);
    if (body !== pr.body) await api(`pulls/${pr.number}`, { method: 'PATCH', body: { body } });
  } else {
    pr = await api('pulls', {
      method: 'POST',
      body: {
        title: `[CHORE]: Release ${version}`,
        head: 'main',
        base: 'deploy',
        body: `${metadata(version, main.sha)}\n\n${checklist}`,
      },
    });
  }
  return `Release **${version}**, prepared source \`${main.sha}\`: ${pr.html_url}\n\n${checklist}\n\n` +
    'Metadata edits do not restart PR tests. Rerun failed Deploy validation from Actions after a version refresh, ' +
    'approve pending runs when requested, and wait for the actual Deploy readiness result. ' +
    'Preparation never merges, tags or deploys.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.env.GITHUB_REPOSITORY;
  const api = githubApi(repository, process.env.GITHUB_TOKEN);
  summary(await prepareRelease(api, repository, process.env.GITHUB_REF));
}
