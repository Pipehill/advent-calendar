import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitOutput, copyRepositorySnapshot, selectFilesToCheck, createSnapshotMetadata } from './snapshot.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality snapshot test '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  gitOutput(root, ['init', '-q']);
  gitOutput(root, ['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.quality-cache/\n');
  const output = path.join(root, '.quality-cache/snapshot');
  fs.mkdirSync(output, { recursive: true });
  return { root, output };
}

function commit(root) {
  gitOutput(root, ['add', '--all']);
  gitOutput(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=disabled-fixture-hooks', 'commit', '-qm', 'Snapshot fixture']);
}

test('saved deletions, unstaged edits and untracked paths are copied without changing the index', t => {
  const { root, output } = fixture(t);
  fs.writeFileSync(path.join(root, 'deleted.md'), '# Deleted\n');
  fs.writeFileSync(path.join(root, 'partial staging.md'), '# Original\n');
  commit(root);
  fs.unlinkSync(path.join(root, 'deleted.md'));
  fs.writeFileSync(path.join(root, 'partial staging.md'), '# Saved edit\n');
  fs.writeFileSync(path.join(root, 'new file.md'), '# New\n');
  const index = gitOutput(root, ['ls-files', '--stage', '-z']);
  const status = gitOutput(root, ['status', '--porcelain']);
  const { files } = copyRepositorySnapshot(root, output, 'full');
  assert(!files.includes('deleted.md'));
  assert(files.includes('new file.md'));
  assert.equal(fs.readFileSync(path.join(output, 'partial staging.md'), 'utf8'), '# Saved edit\n');
  assert.equal(gitOutput(root, ['ls-files', '--stage', '-z']), index);
  assert.equal(gitOutput(root, ['status', '--porcelain']), status);
});

test('staged snapshots include indexed files even when their working copies are deleted', t => {
  const { root, output } = fixture(t);
  fs.writeFileSync(path.join(root, 'deleted.md'), '# Indexed\n');
  commit(root);
  fs.unlinkSync(path.join(root, 'deleted.md'));
  const { files } = copyRepositorySnapshot(root, output, 'staged');
  assert(files.includes('deleted.md'));
  assert.equal(fs.readFileSync(path.join(output, 'deleted.md'), 'utf8'), '# Indexed\n');
});

test('removed targets and changed Markdown expand incoming-link checks without expanding content lint', t => {
  const { root, output } = fixture(t);
  fs.writeFileSync(path.join(root, 'target.md'), '# Target\n');
  fs.writeFileSync(path.join(root, 'incoming.md'), '# Incoming\n\n[Target](target.md)\n');
  fs.writeFileSync(path.join(root, 'unrelated.json'), '{}\n');
  commit(root);
  fs.unlinkSync(path.join(root, 'target.md'));
  gitOutput(root, ['add', '--all']);
  const { files, indexEntries } = copyRepositorySnapshot(root, output, 'staged');
  const selectedFiles = selectFilesToCheck(root, files, 'staged');
  assert(selectedFiles.includes('incoming.md'));
  assert(!selectedFiles.includes('unrelated.json'));
  const metadata = createSnapshotMetadata({
    root, mode: 'staged', image: 'fixture', snapshotDirectory: output, files, indexEntries, selectedFiles,
  });
  assert(metadata.linkSelected.includes('incoming.md'));
  assert(!metadata.files.includes('target.md'));
});

test('tracked directories and symlinks are rejected instead of copied', t => {
  const { root, output } = fixture(t);
  const source = path.join(root, 'source.md');
  fs.writeFileSync(source, '# Source\n');
  commit(root);
  fs.unlinkSync(source);
  fs.mkdirSync(source);
  assert.throws(() => copyRepositorySnapshot(root, output, 'full'), /Unsupported source/);
  fs.rmdirSync(source);
  // Directory junctions work without Windows symlink elevation and must also be rejected.
  fs.symlinkSync(output, source, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => copyRepositorySnapshot(root, output, 'full'), /Unsupported source/);
});
