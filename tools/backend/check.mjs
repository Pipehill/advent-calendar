// Shared backend commands for host development, image builds and CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readLocalSettings } from '../quality/local-settings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contract = path.join(root, 'src/contract');
const dotnet = process.env.DOTNET_EXE || readLocalSettings(root).dotnet || 'dotnet';
process.env.PATH = path.dirname(dotnet) + path.delimiter + process.env.PATH;
const mode = process.argv[2] || 'check';

function run(executable, args, cwd = root) {
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${executable} failed: ${result.error?.message || result.status}`);
  }
}

try {
  if (!['restore', 'generate', 'build', 'test', 'publish', 'check', 'lint'].includes(mode)) {
    throw new Error('Usage: node tools/backend/check.mjs restore|generate|build|test|publish|check|lint');
  }
  if (mode === 'lint') {
    run(dotnet, ['format', 'src/backend/Calendar.slnx', '--verify-no-changes', '--no-restore']);
  } else {
    if (mode !== 'restore') {
      const redocly = path.join(contract, 'node_modules/@redocly/cli/bin/cli.js');
      if (!fs.existsSync(redocly)) throw new Error('Run npm ci --prefix src/contract first.');
      run(process.execPath, [redocly, 'lint', 'openapi.json'], contract);
    }
    run(dotnet, ['tool', 'restore']);
    if (mode !== 'restore') run(dotnet, ['tool', 'run', 'nswag', 'run', 'src/contract/nswag.json']);
    if (mode !== 'generate') run(dotnet, ['restore', 'src/backend/Calendar.slnx', '--locked-mode']);
    if (['build', 'test', 'check'].includes(mode)) {
      run(dotnet, ['build', 'src/backend/Calendar.slnx', '--no-restore', '-c', 'Release']);
    }
    if (['test', 'check'].includes(mode)) {
      run(dotnet, ['test', 'src/backend/Calendar.slnx', '--no-build', '-c', 'Release']);
    }
    if (['publish', 'check'].includes(mode)) {
      run(dotnet, ['publish', 'src/backend/Calendar.Api', '--no-restore', '-c', 'Release', '-o', 'src/backend/publish']);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
