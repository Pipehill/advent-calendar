// Copy saved or staged inputs and identify their exact QA scope.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sharedSettingsPrefixes = [
  '.markdownlint', '.yamllint', '.mega-linter', '.pre-commit',
  '.gitattributes', '.editorconfig', 'tools/quality/', 'tools/development/',
  '.sqlfluff', '.csharpier',
  'biome.json',
];
const binaryExtensionPattern = /\.(png|jpe?g|gif|ico|pdf|woff2?|zip)$/i;

export function gitOutput(root, args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: root, encoding, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
}

export function splitGitPaths(output) {
  // Git's NUL separator preserves spaces and other characters in filenames.
  return output.split('\0').filter(Boolean);
}

// Copy inputs without modifying the source files or the original Git index.
export function copyRepositorySnapshot(root, snapshotDirectory, mode) {
  const indexEntries = splitGitPaths(gitOutput(root, ['ls-files', '--stage', '-z']));
  const files = [];
  for (const entry of indexEntries) {
    const { name, permissions, objectId, stage } = parseIndexEntry(entry);
    if (stage !== '0') throw new Error(`Unmerged index entry: ${name}`);
    if (!['100644', '100755'].includes(permissions)) {
      throw new Error(`Unsupported symlink/submodule: ${name}`);
    }
    // Saved deletions belong to the working tree; staged mode still reads the index.
    const source = path.join(root, name);
    if (mode !== 'staged') {
      const saved = fs.lstatSync(source, { throwIfNoEntry: false });
      if (!saved) continue;
      if (!saved.isFile()) throw new Error(`Unsupported source: ${name}`);
    }
    const contents = mode === 'staged'
      ? gitOutput(root, ['cat-file', 'blob', objectId], null)
      : fs.readFileSync(path.join(root, name));
    writeSnapshotFile(snapshotDirectory, name, contents);
    files.push(name);
  }

  if (mode !== 'staged') {
    const untrackedFiles = splitGitPaths(gitOutput(root, ['ls-files', '--others', '--exclude-standard', '-z']));
    for (const name of untrackedFiles) {
      const source = path.join(root, name);
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

// Ordinary commits check changed files; shared settings affect the whole repository.
export function selectFilesToCheck(root, files, mode) {
  if (mode !== 'staged') return [...files];

  const changes = splitGitPaths(gitOutput(root, ['diff', '--cached', '--name-only', '-z']));
  const settingsChanged = changes.some(name => sharedSettingsPrefixes.some(prefix => name.startsWith(prefix)));
  if (settingsChanged) return [...files];

  const selected = splitGitPaths(gitOutput(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
  const removedOrRenamed = splitGitPaths(gitOutput(root, ['diff', '--cached', '--name-only', '--diff-filter=DR', '-z']));
  if (removedOrRenamed.length) {
    // A removed target can break links in documents that were not edited.
    return [...new Set([...selected, ...files.filter(name => /\.md$/i.test(name))])];
  }
  return selected;
}

function findEditorLineEndingViolations(root, selectedFiles) {
  const violations = [];
  for (const name of selectedFiles) {
    const source = path.join(root, name);
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

export function createSnapshotMetadata({ root, mode, image, snapshotDirectory, files, indexEntries, selectedFiles }) {
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
    editorEndings: mode === 'staged' ? findEditorLineEndingViolations(root, selectedFiles) : [],
    revision: gitOutput(root, ['rev-parse', 'HEAD']).trim(),
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
