// npm is invoked through Node, avoiding shell-specific .cmd launch behavior.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { root, requireAnalyzer } from './jscpd.mjs';

try {
  const directory = path.join(root, 'tools/quality/analysis');
  const lockHash = createHash('sha256').update(fs.readFileSync(path.join(directory, 'package-lock.json'))).digest('hex');
  const receipt = path.join(directory, 'node_modules/.advent-install.json');
  const require = createRequire(path.join(directory, 'package.json'));
  let installed;
  try { installed = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch { /* A fresh install has no receipt. */ }
  if (installed?.lockHash === lockHash && installed.platform === process.platform && installed.arch === process.arch) {
    try {
      requireAnalyzer();
      require.resolve('@modelcontextprotocol/sdk/client/index.js');
      require.resolve('@modelcontextprotocol/sdk/client/stdio.js');
      console.log('Reusing pinned jscpd installation.');
      process.exit(0);
    } catch {
      console.error('Installed jscpd is unavailable; reinstalling the pinned platform package.');
    }
  }
  const nodeDirectory = path.dirname(fs.realpathSync(process.execPath));
  const candidates = [
    path.join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js',
  ];
  const npm = candidates.find(candidate => fs.existsSync(candidate));
  if (!npm) throw new Error('npm CLI missing beside Node: install Node 24 with npm, then rerun setup.');
  const result = spawnSync(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-fund'], {
    cwd: directory, stdio: 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error('Pinned jscpd installation failed; check network/npm diagnostics.');
  requireAnalyzer();
  require.resolve('@modelcontextprotocol/sdk/client/index.js');
  require.resolve('@modelcontextprotocol/sdk/client/stdio.js');
  fs.writeFileSync(receipt, JSON.stringify({ lockHash, platform: process.platform, arch: process.arch }) + '\n');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
