import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const selector = fileURLToPath(new URL('./dotnet.mjs', import.meta.url));

for (const key of ['PATH', 'Path', 'pAtH']) {
  test(`Given an inherited ${key} variable, When the SDK selector launches a child, Then it preserves the executable search path`, {
    skip: key !== 'PATH' && process.platform !== 'win32' ? 'Windows environment keys are case-insensitive.' : false,
  }, () => {
    // Given a parent search path and Node standing in for the selected SDK executable.
    const inheritedPath = path.join(os.tmpdir(), 'inherited tools with spaces')
      + path.delimiter + process.env.PATH;
    const environment = { ...process.env, DOTNET_EXE: process.execPath };
    for (const name of Object.keys(environment)) {
      if (name.toLowerCase() === 'path') delete environment[name];
    }
    environment[key] = inheritedPath;

    // When the real selector forwards an invocation from outside the repository.
    const result = spawnSync(process.execPath, [selector, '-p', 'process.env.PATH'], {
      cwd: os.tmpdir(),
      env: environment,
      encoding: 'utf8',
    });

    // Then the SDK directory is added while every inherited search entry survives.
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), path.dirname(process.execPath) + path.delimiter + inheritedPath);
  });
}
