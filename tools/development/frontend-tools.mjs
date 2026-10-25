// Prepare pnpm privately without replacing the contributor's global installation.
import fs from 'node:fs';
import path from 'node:path';
import { baseline } from './requirements.mjs';

export function prepareFrontendTools({ root, run }, node) {
  if (!fs.existsSync(path.join(root, 'src/frontend/package.json'))) return;
  const npmCli = path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js');
  const args = ['ci', '--prefix', path.join(root, 'tools/frontend')];
  if (fs.existsSync(npmCli)) {
    run(node, [npmCli, ...args], true);
  } else {
    run('npm', args, true);
  }
  const pnpm = path.join(root, 'tools/frontend/pnpm.mjs');
  run(node, [pnpm, 'install', '--frozen-lockfile'], true);
  run(node, [pnpm, 'run', 'generate'], true);
}

export function checkFrontendTools({ root, run, checks }, node) {
  if (!fs.existsSync(path.join(root, 'src/frontend/package.json'))) return;
  const pnpm = path.join(root, 'tools/frontend/node_modules/pnpm/bin/pnpm.mjs');
  const result = node && fs.existsSync(pnpm)
    ? run(node, [pnpm, '--version'])
    : { status: 1, output: 'Repository-local pnpm is missing' };
  const dependencies = ['vite', 'typescript', 'vitest', '@inlang/paraglide-js'];
  const ready = dependencies.every(name => fs.existsSync(path.join(root, 'src/frontend/node_modules', name, 'package.json')));
  checks.push({
    name: 'Frontend toolchain', passed: result.status === 0 && result.stdout.trim() === baseline.pnpm && ready,
    detected: result.output, expected: `pnpm ${baseline.pnpm} and lockfile-installed frontend dependencies`,
    remedy: 'Run setup to install repository-local pnpm and the locked frontend packages.',
  });
}
