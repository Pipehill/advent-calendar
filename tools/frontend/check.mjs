// Share generated contracts and translations across development, builds and CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { command } from '../development/commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'src/frontend');
const pnpm = path.join(root, 'tools/frontend/node_modules/pnpm/bin/pnpm.mjs');
const mode = process.argv[2] || 'check';

function run(executable, args, cwd = root) {
  command(executable, args, true, process.env, cwd);
}

try {
  if (mode === 'generate') {
    run(process.execPath, [path.join(root, 'tools/backend/check.mjs'), 'generate']);
    const cli = path.join(frontend, 'node_modules/@inlang/paraglide-js/bin/run.js');
    run(process.execPath, [cli, 'compile', '--project', './project.inlang', '--outdir', './src/generated/paraglide', '--emit-ts-declarations'], frontend);
  } else if (['install', 'dev', 'build', 'test', 'lint', 'typecheck', 'check'].includes(mode)) {
    if (!fs.existsSync(pnpm)) throw new Error('Run npm ci --prefix tools/frontend first.');
    const tasks = mode === 'check' ? ['test', 'build', 'lint'] : [mode];
    for (const task of tasks) {
      const args = task === 'install' ? ['install', '--frozen-lockfile'] : ['run', task];
      run(process.execPath, [pnpm, ...args], frontend);
    }
  } else {
    throw new Error('Usage: node tools/frontend/check.mjs install|generate|dev|typecheck|test|build|lint|check');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
