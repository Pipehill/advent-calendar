// Run quality checks in an isolated repository snapshot.
// Staged mode reads the Git index; other check modes read working-tree files.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRuntime } from './local-settings.mjs';

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const containerRuntime = selectRuntime(repositoryRoot);
const supportedModes = ['setup', 'clean', 'staged', 'full', 'custom', 'test'];
const imageInputs = ['Dockerfile', 'package.json', 'package-lock.json', 'requirements.txt'];
const mountedToolFiles = ['checks.mjs', 'container.mjs', 'puppeteer.json'];
const qualityImagePattern = /^localhost\/advent-quality:[a-f0-9]{20}$/;
const sharedSettingsPrefixes = [
  '.markdownlint', '.yamllint', '.mega-linter', '.pre-commit',
  '.gitattributes', '.editorconfig', 'tools/quality/', 'tools/development/',
];
const binaryExtensionPattern = /\.(png|jpe?g|gif|ico|pdf|woff2?|zip)$/i;

function main() {
  const mode = readMode();
  const receiptPath = path.join(repositoryRoot, 'quality-reports', 'local-hook.json');
  // A failed or manual staged run must never leave an earlier success usable.
  if (mode === 'staged') fs.rmSync(receiptPath, { force: true });
  if (mode === 'clean') return removeUnusedQualityImages(new Set());
  const image = getQualityImage(mode);
  if (mode === 'setup') return setupQualityImage(image);

  requireQualityImage(image);
  const snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-quality-'));
  try {
    const reportsDirectory = prepareReportsDirectory(mode);
    const { files, indexEntries } = copyRepositorySnapshot(snapshotDirectory, mode);
    const selectedFiles = selectFilesToCheck(files, mode);
    const metadata = createSnapshotMetadata({ mode, image, snapshotDirectory, files, indexEntries, selectedFiles });

    writeJson(path.join(snapshotDirectory, '.quality-input.json'), metadata);
    writeJson(path.join(reportsDirectory, 'input.json'), metadata);
    initializeSnapshotIndex(snapshotDirectory);
    const status = runChecks({ mode, image, snapshotDirectory, reportsDirectory });
    if (mode === 'staged' && status === 0 && process.env.PRE_COMMIT === '1') {
      const tree = runGit(['write-tree']).trim();
      const currentEntries = splitGitPaths(runGit(['ls-files', '--stage', '-z']));
      if (sha256(currentEntries.join('\0')) !== metadata.indexSnapshot) {
        throw new Error('Git index changed during QA; no local hook receipt was saved.');
      }
      writeJson(receiptPath, {
        hook: 'staged-quality', passed: true, parent: metadata.revision, tree,
        machine: os.hostname(), platform: `${os.platform()} ${os.arch()}`,
        completedAt: new Date().toISOString(), input: metadata,
        results: JSON.parse(fs.readFileSync(path.join(reportsDirectory, 'findings.json'))).results,
      });
    }
    return status;
  } finally {
    // Only the temporary directory created for this run is removed.
    fs.rmSync(snapshotDirectory, { recursive: true, force: true });
  }
}

// Command execution and image setup.
function readMode() {
  const mode = process.argv[2];
  if (!supportedModes.includes(mode)) {
    throw new Error('Usage: node tools/quality/run.mjs setup|clean|staged|full|custom|test');
  }
  return mode;
}

function runGit(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repositoryRoot, encoding, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
}

function splitGitPaths(output) {
  // Git's NUL separator preserves spaces and other characters in filenames.
  return output.split('\0').filter(Boolean);
}

function runContainer(args) {
  const result = spawnSync(containerRuntime, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function getQualityImage(mode) {
  const hash = createHash('sha256');
  for (const file of imageInputs) {
    const contents = mode === 'staged'
      ? runGit(['show', `:tools/quality/${file}`], null)
      : fs.readFileSync(path.join(toolingDirectory, file));
    hash.update(contents);
  }
  // Only dependency changes require a new image; scripts are mounted from the snapshot.
  return `localhost/advent-quality:${hash.digest('hex').slice(0, 20)}`;
}

function inspectContainerRuntime(args) {
  return execFileSync(containerRuntime, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function setupQualityImage(image) {
  const existing = spawnSync(containerRuntime, ['image', 'inspect', image], { stdio: 'ignore' });
  if (existing.error) throw existing.error;
  if (existing.status !== 0) {
    const status = runContainer(['build', '-t', image, toolingDirectory]);
    if (status !== 0) return status; // Keep previous images if the replacement cannot be built.
  } else {
    console.log(`Reusing dependency image: ${image}`);
  }
  const retained = new Set([image]);
  try {
    // Partial staging may still need the dependency version currently in the index.
    retained.add(getQualityImage('staged'));
  } catch {
    // The tooling might not have been added to the index yet.
  }
  return removeUnusedQualityImages(retained);
}

function removeUnusedQualityImages(retained) {
  const tags = inspectContainerRuntime(['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'])
    .split(/\r?\n/).filter(tag => qualityImagePattern.test(tag) && !retained.has(tag));
  if (!tags.length) return 0;

  // Protect images referenced by running AND stopped containers, regardless of tag.
  const containerIds = inspectContainerRuntime(['container', 'ls', '--all', '--quiet']).trim().split(/\s+/).filter(Boolean);
  const usedImages = new Set(containerIds.length
    ? JSON.parse(inspectContainerRuntime(['container', 'inspect', ...containerIds]))
      .map(container => normalizeImageId(container.Image))
    : []);
  let status = 0;
  for (const tag of new Set(tags)) {
    const [details] = JSON.parse(inspectContainerRuntime(['image', 'inspect', tag]));
    if (usedImages.has(normalizeImageId(details.Id || details.ID))) {
      console.log(`Keeping image referenced by a container: ${tag}`);
      continue;
    }
    console.log(`Removing unused quality image: ${tag}`);
    // Never force removal: a container created since inspection must still be protected.
    status = runContainer(['image', 'rm', tag]) || status;
  }
  return status;
}

function normalizeImageId(id) {
  return id.replace(/^sha256:/, '');
}

function requireQualityImage(image) {
  const result = spawnSync(containerRuntime, ['image', 'inspect', image], { stdio: 'ignore' });
  if (result.error) {
    throw new Error(`Container runtime unavailable (${containerRuntime}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error('Quality image missing or stale. Run: node tools/quality/run.mjs setup');
  }
}

// Copy inputs without modifying the source files or the original Git index.
function copyRepositorySnapshot(snapshotDirectory, mode) {
  const indexEntries = splitGitPaths(runGit(['ls-files', '--stage', '-z']));
  const files = [];
  for (const entry of indexEntries) {
    const { name, permissions, objectId, stage } = parseIndexEntry(entry);
    if (stage !== '0') throw new Error(`Unmerged index entry: ${name}`);
    if (!['100644', '100755'].includes(permissions)) {
      throw new Error(`Unsupported symlink/submodule: ${name}`);
    }
    const contents = mode === 'staged'
      ? runGit(['cat-file', 'blob', objectId], null)
      : fs.readFileSync(path.join(repositoryRoot, name));
    writeSnapshotFile(snapshotDirectory, name, contents);
    files.push(name);
  }

  if (mode !== 'staged') {
    const untrackedFiles = splitGitPaths(runGit(['ls-files', '--others', '--exclude-standard', '-z']));
    for (const name of untrackedFiles) {
      const source = path.join(repositoryRoot, name);
      if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`Unsupported symlink: ${name}`);
      writeSnapshotFile(snapshotDirectory, name, fs.readFileSync(source));
      files.push(name);
    }
  }
  return { files, indexEntries };
}

function parseIndexEntry(entry) {
  const separator = entry.indexOf('\t');
  const [permissions, objectId, stage] = entry.slice(0, separator).split(' ');
  return { permissions, objectId, stage, name: entry.slice(separator + 1) };
}

function writeSnapshotFile(snapshotDirectory, name, contents) {
  const destination = path.join(snapshotDirectory, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

function initializeSnapshotIndex(snapshotDirectory) {
  // Official filename hooks need the complete candidate tree in a disposable index.
  execFileSync('git', ['init', '-q', snapshotDirectory]);
  execFileSync('git', ['-C', snapshotDirectory, '-c', 'core.autocrlf=false', 'add', '-f', '--', '.']);
}

// Ordinary commits check changed files; shared settings affect the whole repository.
function selectFilesToCheck(files, mode) {
  if (mode !== 'staged') return [...files];

  const changes = splitGitPaths(runGit(['diff', '--cached', '--name-only', '-z']));
  const settingsChanged = changes.some(name => sharedSettingsPrefixes.some(prefix => name.startsWith(prefix)));
  if (settingsChanged) return [...files];

  const selected = splitGitPaths(runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
  const removedOrRenamed = splitGitPaths(runGit(['diff', '--cached', '--name-only', '--diff-filter=DR', '-z']));
  if (removedOrRenamed.length) {
    // A removed target can break links in documents that were not edited.
    return [...new Set([...selected, ...files.filter(name => /\.md$/i.test(name))])];
  }
  return selected;
}

function findEditorLineEndingViolations(selectedFiles) {
  const violations = [];
  for (const name of selectedFiles) {
    const source = path.join(repositoryRoot, name);
    if (!fs.existsSync(source)) continue;
    const contents = fs.readFileSync(source);
    if (contents.includes(0) || binaryExtensionPattern.test(name)) continue;

    // Git normalizes the index to LF, so editor compliance needs a separate check.
    const requiresCrLf = /\.(bat|cmd)$/i.test(name);
    const invalid = requiresCrLf
      ? /(?<!\r)\n|\r(?!\n)/.test(contents.toString('utf8'))
      : contents.includes(13);
    if (invalid) violations.push({ name, expected: requiresCrLf ? 'CRLF' : 'LF' });
  }
  return violations;
}

// Reports identify the exact revision, index and copied contents that were checked.
function prepareReportsDirectory(mode) {
  const directory = path.join(repositoryRoot, 'quality-reports', mode);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function createSnapshotMetadata({ mode, image, snapshotDirectory, files, indexEntries, selectedFiles }) {
  const markdownFiles = files.filter(name => /\.md$/i.test(name));
  // Any staged Markdown edit may change heading IDs or explicit HTML anchors.
  // Check incoming links across the candidate tree without expanding lint/render scope.
  const linkSelected = mode !== 'staged' || selectedFiles.some(name => /\.md$/i.test(name))
    ? markdownFiles : [];
  return {
    mode,
    files,
    selected: selectedFiles,
    linkSelected,
    editorEndings: mode === 'staged' ? findEditorLineEndingViolations(selectedFiles) : [],
    revision: runGit(['rev-parse', 'HEAD']).trim(),
    indexSnapshot: mode === 'staged' ? sha256(indexEntries.join('\0')) : null,
    snapshotSha256: hashSnapshotContents(snapshotDirectory, files),
    image,
    capturedAt: new Date().toISOString(),
  };
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function hashSnapshotContents(snapshotDirectory, files) {
  const entries = files.sort().map(name => {
    const contents = fs.readFileSync(path.join(snapshotDirectory, name));
    return `${name}\0${sha256(contents)}`;
  });
  return sha256(entries.join('\n'));
}

function writeJson(destination, value) {
  fs.writeFileSync(destination, JSON.stringify(value, null, 2));
}

// Full mode runs MegaLinter plus custom checks; staged mode invokes selected tools directly.
function runChecks({ mode, image, snapshotDirectory, reportsDirectory }) {
  const containerArguments = [
    'run', '--rm', '--network=none',
    '-v', `${snapshotDirectory}:/workspace:ro`,
    '-v', `${reportsDirectory}:/reports`,
  ];
  let megaStatus = 0;
  if (mode === 'full') {
    megaStatus = runContainer([
      ...containerArguments,
      '-e', 'DEFAULT_WORKSPACE=/workspace',
      '-e', 'REPORT_OUTPUT_FOLDER=/reports/megalinter',
      '-e', 'MEGALINTER_CONFIG=/workspace/.mega-linter.yml',
      image,
    ]);
  }
  // Run custom checks even after a MegaLinter failure to preserve both reports.
  const customMode = mode === 'full' ? 'custom' : mode;
  const toolMounts = mountedToolFiles.flatMap(file => [
    '-v', `${path.join(snapshotDirectory, 'tools', 'quality', file)}:/quality/${file}:ro`,
  ]);
  const customStatus = runContainer([
    ...containerArguments, ...toolMounts, '--entrypoint', 'node', image, '/quality/container.mjs', customMode,
  ]);
  writeJson(path.join(reportsDirectory, 'result.json'), { megaStatus, customStatus });
  return megaStatus || customStatus;
}

process.exitCode = main();
