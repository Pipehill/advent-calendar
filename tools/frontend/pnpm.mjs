// Use private, lockfile-pinned pnpm without replacing a global installation.
import path from 'node:path';
import { command, repositoryRoot } from '../development/commands.mjs';

try {
  const pnpm = path.join(repositoryRoot, 'tools/frontend/node_modules/pnpm/bin/pnpm.mjs');
  const env = { ...process.env,
    PATH: path.join(repositoryRoot, 'tools/frontend/node_modules/.bin') + path.delimiter + process.env.PATH,
  };
  const result = command(process.execPath, [pnpm, ...process.argv.slice(2)], true,
    env, path.join(repositoryRoot, 'src/frontend'));
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
