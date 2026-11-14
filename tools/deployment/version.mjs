import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateVersion(value) {
  if (!stableVersion.test(value)) throw new Error('Version must be stable MAJOR.MINOR.PATCH.');
  return value;
}

export function readVersion(root = repositoryRoot) {
  const version = validateVersion(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
  const frontend = readJson(root, 'src/frontend/package.json');
  const contract = readJson(root, 'src/contract/openapi.json');
  if (frontend.version !== version || contract.info.version !== version) {
    throw new Error('Release version drift: update VERSION, frontend and OpenAPI together.');
  }
  return version;
}

function readJson(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
}

export function updateVersion(version, root = repositoryRoot) {
  validateVersion(version);
  const frontend = readJson(root, 'src/frontend/package.json');
  const contract = readJson(root, 'src/contract/openapi.json');
  frontend.version = version;
  contract.info.version = version;
  fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`);
  for (const [name, value] of [['src/frontend/package.json', frontend], ['src/contract/openapi.json', contract]]) {
    fs.writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, version] = process.argv.slice(2);
  if (command === 'set' && version) updateVersion(version);
  else if (command !== 'check' || version) throw new Error('Usage: node tools/deployment/version.mjs check | set X.Y.Z');
  console.log(`Application version: ${readVersion()}`);
}
