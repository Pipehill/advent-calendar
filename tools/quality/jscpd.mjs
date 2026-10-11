// The npm wrapper resolves a pinned native binary on every supported platform.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const version = '5.4.1';
const wrapper = path.join(root, 'tools/quality/analysis/node_modules/jscpd/run-jscpd.js');
export const configuration = path.join(root, '.jscpd.json');

export function executable() {
  const require = createRequire(wrapper);
  const { getPlatformKey, PLATFORM_MAP } = require('./platform-map.js');
  const platform = PLATFORM_MAP[getPlatformKey()];
  if (!platform) throw new Error('No pinned jscpd binary for this platform');
  const packagePath = require.resolve(`${platform.packageName}/package.json`);
  return path.join(path.dirname(packagePath), 'bin', process.platform === 'win32' ? 'jscpd.exe' : 'jscpd');
}

export function requireAnalyzer() {
  if (!fs.existsSync(wrapper)) {
    throw new Error('jscpd missing: run developer setup or npm ci in tools/quality/analysis.');
  }
  const actual = execFileSync(executable(), ['--version'], { encoding: 'utf8' }).trim();
  if (actual !== `jscpd ${version}`) {
    throw new Error(`jscpd version mismatch: expected ${version}, received ${actual}`);
  }
}

export function launchMcp(directory = root, config = configuration) {
  requireAnalyzer();
  return spawn(executable(), [directory, '--config', config, '--mcp'], {
    cwd: directory, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// This command forwards stdio without printing readiness text on protocol stdout.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireAnalyzer();
    const child = spawn(executable(), [root, '--config', configuration, '--mcp'], {
      cwd: root, stdio: 'inherit',
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    process.on('SIGTERM', () => child.kill());
    process.on('SIGINT', () => child.kill());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
