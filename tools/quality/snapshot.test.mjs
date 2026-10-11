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

test('Given saved edits and deleted or new files, When a full snapshot is copied, Then saved contents and Git state are preserved', t => {
  // Given tracked source with a saved edit, a deletion and an untracked path.
  const { root, output } = fixture(t);
  fs.writeFileSync(path.join(root, 'deleted.md'), '# Deleted\n');
  fs.writeFileSync(path.join(root, 'partial staging.md'), '# Original\n');
  commit(root);
  fs.unlinkSync(path.join(root, 'deleted.md'));
  fs.writeFileSync(path.join(root, 'partial staging.md'), '# Saved edit\n');
  fs.writeFileSync(path.join(root, 'new file.md'), '# New\n');
  const index = gitOutput(root, ['ls-files', '--stage', '-z']);
  const status = gitOutput(root, ['status', '--porcelain']);

  // When the complete saved working tree is copied.
  const { files } = copyRepositorySnapshot(root, output, 'full');

  // Then the snapshot reflects saved files without modifying the source index or status.
  assert(!files.includes('deleted.md'));
  assert(files.includes('new file.md'));
  assert.equal(fs.readFileSync(path.join(output, 'partial staging.md'), 'utf8'), '# Saved edit\n');
  assert.equal(gitOutput(root, ['ls-files', '--stage', '-z']), index);
  assert.equal(gitOutput(root, ['status', '--porcelain']), status);
});

test('Given an indexed file with a deleted working copy, When a staged snapshot is copied, Then the indexed contents are included', t => {
  // Given a committed file whose working copy was subsequently deleted.
  const { root, output } = fixture(t);
  fs.writeFileSync(path.join(root, 'deleted.md'), '# Indexed\n');
  commit(root);
  fs.unlinkSync(path.join(root, 'deleted.md'));

  // When the staged snapshot is copied from the index.
  const { files } = copyRepositorySnapshot(root, output, 'staged');

  // Then the indexed file and bytes remain in the snapshot.
  assert(files.includes('deleted.md'));
  assert.equal(fs.readFileSync(path.join(output, 'deleted.md'), 'utf8'), '# Indexed\n');
});

test('Given a deleted Markdown target, When staged checks are selected, Then incoming links are checked without unrelated content lint', t => {
  // Given a staged target deletion, an incoming link and unrelated JSON content.
  const { root, output } = fixture(t);
  fs.writeFileSync(path.join(root, 'target.md'), '# Target\n');
  fs.writeFileSync(path.join(root, 'incoming.md'), '# Incoming\n\n[Target](target.md)\n');
  fs.writeFileSync(path.join(root, 'unrelated.json'), '{}\n');
  commit(root);
  fs.unlinkSync(path.join(root, 'target.md'));
  gitOutput(root, ['add', '--all']);

  // When snapshot metadata and check selections are created.
  const { files, indexEntries } = copyRepositorySnapshot(root, output, 'staged');
  const selectedFiles = selectFilesToCheck(root, files, 'staged');
  const metadata = createSnapshotMetadata({
    root, mode: 'staged', image: 'fixture', snapshotDirectory: output, files, indexEntries, selectedFiles,
  });

  // Then incoming links are checked while unrelated content and the deleted target stay excluded.
  assert(selectedFiles.includes('incoming.md'));
  assert(!selectedFiles.includes('unrelated.json'));
  assert(metadata.linkSelected.includes('incoming.md'));
  assert(!metadata.files.includes('target.md'));
});

for (const sourceType of ['directory', 'symlink']) {
  test(`Given a tracked path replaced by a ${sourceType}, When a full snapshot is attempted, Then the unsupported source is rejected`, t => {
    // Given a tracked file replaced by a directory or a directory link.
    const { root, output } = fixture(t);
    const source = path.join(root, 'source.md');
    fs.writeFileSync(source, '# Source\n');
    commit(root);
    fs.unlinkSync(source);
    if (sourceType === 'directory') {
      fs.mkdirSync(source);
    } else {
      // Junctions exercise the same rejection without requiring Windows symlink elevation.
      fs.symlinkSync(output, source, process.platform === 'win32' ? 'junction' : 'dir');
    }

    // When the unsupported source is copied.
    const copy = () => copyRepositorySnapshot(root, output, 'full');

    // Then the snapshot refuses to follow or copy that source.
    assert.throws(copy, /Unsupported source/);
  });
}
