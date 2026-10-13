// Shared prerequisite versions and package identifiers for setup and doctor.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { version as jscpdVersion } from '../quality/jscpd.mjs';

export const baseline = {
  node: 24,
  python: '3.14',
  uv: '0.13.0',
  jscpd: jscpdVersion,
  dotnet: '10.0.401',
  pnpm: '12.11.2',
};

// Python package names treat hyphens, underscores and dots as equivalent.
export function normalizePin(pin) {
  const [name, version] = pin.trim().split('==');
  const normalizedName = name.toLowerCase().replace(/[-_.]+/g, '-');
  return `${normalizedName}==${version}`;
}

export const packages = {
  win32: {
    git: 'Git.Git',
    python: 'Python.Python.3.14',
    podman: 'RedHat.Podman',
    docker: 'Docker.DockerDesktop',
    compose: 'Docker.DockerCompose',
  },
  darwin: {
    git: 'git',
    python: 'python@3.14',
    podman: 'podman',
    docker: 'docker',
    compose: 'docker-compose',
  },
  linux: {
    git: 'git',
    python: 'python3.14',
    podman: 'podman',
    docker: 'docker.io',
    compose: 'docker-compose-v2',
  },
};

export function compatible(tool, versionOutput) {
  const version = versionOutput.trim();

  if (tool === 'node') {
    return /^v24\./.test(version);
  }
  if (tool === 'python') {
    return /^Python 3\.14\./.test(version);
  }
  if (tool === 'dotnet') {
    return version === baseline.dotnet;
  }

  return Boolean(version);
}

export function imageName(root) {
  // Match the quality runner: only dependency inputs affect the image name.
  const dependencyFiles = ['Dockerfile', 'package.json', 'package-lock.json', 'requirements.txt'];
  const hash = createHash('sha256');

  for (const filename of dependencyFiles) {
    const dependencyPath = path.join(root, 'tools/quality', filename);
    hash.update(fs.readFileSync(dependencyPath));
  }

  const imageKey = hash.digest('hex').slice(0, 20);
  return `localhost/advent-quality:${imageKey}`;
}

export function pinnedDependencies(root) {
  const requirementsPath = path.join(root, 'tools/quality/pre-commit-requirements.txt');
  const contents = fs.readFileSync(requirementsPath, 'utf8');
  const lines = contents.trim().split(/\r?\n/);

  return lines.filter(line => line && !line.startsWith('#'));
}
