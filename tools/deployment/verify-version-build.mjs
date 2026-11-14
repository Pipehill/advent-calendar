import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../src/frontend/node_modules/playwright/index.mjs';
import { copyRepositorySnapshot } from '../quality/snapshot.mjs';
import { command, runtime } from './smoke-runtime.mjs';
import { readVersion, repositoryRoot, updateVersion } from './version.mjs';

// Rebuild a disposable source copy: the reviewed release inputs stay untouched.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-version-build-'));
const name = `advent-version-${randomUUID().slice(0, 8)}`;
const image = 'localhost/advent-deploy-frontend:next-version';
let started = false;
let browser;
try {
  copyRepositorySnapshot(repositoryRoot, directory, 'full');
  const original = readVersion();
  const [major, minor, patch] = original.split('.');
  const next = `${major}.${minor}.${BigInt(patch) + 1n}`;
  updateVersion(next, directory);
  command(runtime, ['build', '--label', 'advent.verification=00021', '-t', image, '-f', 'src/frontend/Dockerfile', '.'], { cwd: directory, stdio: 'inherit' });
  command(runtime, ['run', '--rm', '-d', '--name', name, '--env', 'BACKEND_API_URL=http://unused.private:8080',
    '--env', 'PUBLIC_ORIGIN=https://version.example', '-p', '127.0.0.1::3000', image]);
  started = true;
  const port = command(runtime, ['port', name, '3000/tcp']).trim().split(':').at(-1);
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  const page = await browser.newPage();
  const response = await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  assert((await response.text()).includes(next), 'SSR uses the new build version');
  assert.equal(await page.locator('footer').textContent(), `Versjon ${next}`);
  assert.equal(readVersion(), original, 'Canonical release inputs remain unchanged');
  console.log(`Version rebuild passed: ${original} source -> isolated ${next} image, without Git history or backend access.`);
} finally {
  await browser?.close();
  if (started) command(runtime, ['rm', '-f', name]);
  fs.rmSync(directory, { recursive: true });
}
