import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// File descriptors preserve custom-format archives across PowerShell and Bash.
// SSH uses the owner's existing agent/key and host-key verification settings.
export function transferArchive(mode, filename, sshArguments, run = spawnSync) {
  if (!['dump', 'keys', 'restore-isolated'].includes(mode) || !filename || !sshArguments.length) {
    throw new Error('Usage: node tools/deployment/ssh-backup.mjs dump|keys|restore-isolated FILE -- SSH_ARGUMENTS');
  }
  const downloading = mode !== 'restore-isolated';
  const partial = `${filename}.partial`;
  if (downloading && fs.existsSync(filename)) throw new Error('Backup destination already exists.');
  const descriptor = fs.openSync(downloading ? partial : filename, downloading ? 'wx' : 'r', 0o600);
  const commands = {
    dump: 'exec pg_dump --format=custom --no-password --username=advent_operator --dbname=advent',
    keys: 'exec tar -C /var/lib/advent-keys -cf - .',
    'restore-isolated': 'exec pg_restore --exit-on-error --single-transaction --no-password --username=advent_operator --dbname=advent',
  };
  try {
    const result = run('ssh', ['-T', ...sshArguments, commands[mode]], {
      stdio: downloading ? ['ignore', descriptor, 'inherit'] : [descriptor, 'inherit', 'inherit'],
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`SSH archive transfer failed (${result.status ?? result.signal}).`);
  } finally {
    fs.closeSync(descriptor);
  }
  if (downloading) {
    // Publish without overwriting a backup another process created meanwhile.
    fs.linkSync(partial, filename);
    fs.unlinkSync(partial);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, filename, separator, ...sshArguments] = process.argv.slice(2);
  if (separator !== '--') throw new Error('Separate the archive filename and SSH arguments with --.');
  transferArchive(mode, filename, sshArguments);
}
