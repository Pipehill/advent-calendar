// Developer settings are ignored, optional, and never required in CI.
import fs from 'node:fs';
import path from 'node:path';

export function readLocalSettings(root, env = process.env) {
  if (env.CI) return {};
  const filename = path.join(root, '.quality-cache', 'development.json');
  if (!fs.existsSync(filename)) return {};
  const settings = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (settings.runtime !== undefined && (typeof settings.runtime !== 'string' || !settings.runtime)) {
    throw new Error(`Invalid runtime in ${filename}; rerun developer setup.`);
  }
  return settings;
}

export function selectRuntime(root, env = process.env) {
  return env.QUALITY_CONTAINER_RUNTIME || readLocalSettings(root, env).runtime || 'docker';
}

export function preCommitPath(root, platform = process.platform) {
  return path.join(root, '.quality-cache', 'venv', platform === 'win32' ? 'Scripts/pre-commit.exe' : 'bin/pre-commit');
}
