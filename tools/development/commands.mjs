// Execute argument-array commands and resolve the first executable on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, '../..');

export function command(
  executable,
  argumentsList,
  inheritOutput = false,
  environment = process.env,
  root = repositoryRoot,
) {
  const result = spawnSync(executable, argumentsList, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: inheritOutput ? 'inherit' : 'pipe',
    maxBuffer: 16 * 1024 * 1024,
    timeout: inheritOutput ? undefined : 60000,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const executionError = result.error?.message || '';
  const output = (stdout + stderr + executionError).trim();

  if (inheritOutput && result.status !== 0) {
    const failure = result.status ?? result.error?.message;
    throw new Error(
      executable + ' failed (' + failure + '). '
      + 'Resolve privileges, connectivity or pending reboot and rerun setup.',
    );
  }

  return { status: result.status, stdout, output };
}

export function discover(executable, platform = process.platform, run = command) {
  if (path.isAbsolute(executable)) {
    return fs.existsSync(executable) ? executable : undefined;
  }

  const discoveryCommand = platform === 'win32' ? 'where.exe' : 'which';
  const result = run(discoveryCommand, [executable]);
  if (result.status !== 0) {
    return undefined;
  }

  // The first PATH match is also the executable a terminal or IDE would invoke.
  return result.stdout.trim().split(/\r?\n/)[0];
}
