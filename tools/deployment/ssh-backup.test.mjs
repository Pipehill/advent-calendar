import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { transferArchive } from './ssh-backup.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    assert(directory.startsWith(path.join(os.tmpdir(), 'advent-archive-')));
    fs.rmSync(directory, { recursive: true });
  }
});

function archivePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-archive-'));
  directories.push(directory);
  return path.join(directory, 'backup.dump');
}

test('Given binary PostgreSQL output, When an SSH dump succeeds, Then the archive bytes are published without a local shell', () => {
  // Given a custom archive containing bytes that text/native shell pipelines can corrupt.
  const filename = archivePath();
  const bytes = Buffer.from([80, 71, 68, 77, 80, 0, 255, 13, 10, 128]);
  const invocation = [];
  const run = (executable, args, options) => {
    invocation.push({ executable, args, options });
    fs.writeSync(options.stdio[1], bytes);
    return { status: 0 };
  };

  // When the fixed pg_dump command streams through a file descriptor.
  transferArchive('dump', filename, ['-p', '22222', 'database@example.test'], run);

  // Then publication preserves all bytes, disables PTY and keeps password values out of arguments.
  assert.deepEqual(fs.readFileSync(filename), bytes);
  assert.equal(fs.existsSync(`${filename}.partial`), false);
  assert.equal(invocation[0].executable, 'ssh');
  assert.deepEqual(invocation[0].args.slice(0, 4), ['-T', '-p', '22222', 'database@example.test']);
  assert.match(invocation[0].args.at(-1), /pg_dump --format=custom --no-password/);
  assert.equal(invocation[0].options.shell, undefined);
});

test('Given a failed SSH dump, When output has already arrived, Then only a clearly partial archive remains', () => {
  // Given a remote failure after some bytes were transferred.
  const filename = archivePath();
  const run = (_executable, _args, options) => {
    fs.writeSync(options.stdio[1], Buffer.from('partial'));
    return { status: 1 };
  };

  // When dump execution reports the remote error.
  const dump = () => transferArchive('dump', filename, ['database@example.test'], run);

  // Then an incomplete transfer cannot be mistaken for a completed backup.
  assert.throws(dump, /failed/);
  assert.equal(fs.existsSync(filename), false);
  assert.equal(fs.readFileSync(`${filename}.partial`, 'utf8'), 'partial');
});

test('Given an existing backup destination, When a dump is requested, Then the existing archive is preserved without starting SSH', () => {
  // Given an earlier complete archive at the requested destination.
  const filename = archivePath();
  fs.writeFileSync(filename, 'existing archive');
  let invoked = false;

  // When an operator accidentally reuses its filename.
  const dump = () => transferArchive('dump', filename, ['database@example.test'], () => { invoked = true; });

  // Then the original is preserved and no SSH transfer starts.
  assert.throws(dump, /already exists/);
  assert.equal(invoked, false);
  assert.equal(fs.readFileSync(filename, 'utf8'), 'existing archive');
});

test('Given a destination created during transfer, When a successful dump publishes, Then the concurrent archive is never overwritten', () => {
  // Given another process publishing the same destination while SSH runs.
  const filename = archivePath();
  const run = (_executable, _args, options) => {
    fs.writeSync(options.stdio[1], Buffer.from('new dump'));
    fs.writeFileSync(filename, 'concurrent archive');
    return { status: 0 };
  };

  // When the completed partial file is atomically linked into place.
  const dump = () => transferArchive('dump', filename, ['database@example.test'], run);

  // Then publication fails safely and retains the other archive.
  assert.throws(dump, { code: 'EEXIST' });
  assert.equal(fs.readFileSync(filename, 'utf8'), 'concurrent archive');
  assert.equal(fs.readFileSync(`${filename}.partial`, 'utf8'), 'new dump');
});

test('Given an archive and isolated SSH endpoint, When a restore runs, Then original bytes stream into a transactional PostgreSQL restore', () => {
  // Given a stored binary archive and the intentionally selected isolated endpoint.
  const filename = archivePath();
  const bytes = Buffer.from([80, 71, 68, 77, 80, 0, 255]);
  fs.writeFileSync(filename, bytes);
  let received;
  let command;
  const run = (_executable, args, options) => {
    received = fs.readFileSync(options.stdio[0]);
    command = args.at(-1);
    return { status: 0 };
  };

  // When the helper restores to the owner's isolated container.
  transferArchive('restore-isolated', filename, ['isolated@example.test'], run);

  // Then pg_restore receives unchanged bytes and aborts on errors within one transaction.
  assert.deepEqual(received, bytes);
  assert.match(command, /pg_restore --exit-on-error --single-transaction --no-password/);
  assert.deepEqual(fs.readFileSync(filename), bytes);
});
