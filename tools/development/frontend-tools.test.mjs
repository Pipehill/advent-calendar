import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkFrontendTools, prepareFrontendTools } from './frontend-tools.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend tools '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/frontend'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/frontend/package.json'), '{}');
  return root;
}

test('Given a new frontend checkout, When setup prepares tooling, Then private pnpm, frozen packages and generation run in order', t => {
  // Given a frontend manifest and a command recorder.
  const root = fixture(t);
  const calls = [];
  const run = (executable, args) => { calls.push({ executable, args }); return { status: 0 }; };

  // When frontend setup runs.
  prepareFrontendTools({ root, run }, 'node');

  // Then the existing global package manager is not replaced and consumers are generated last.
  assert.deepEqual(calls[0].args, ['ci', '--prefix', path.join(root, 'tools/frontend')]);
  assert.equal(calls[1].args.at(-1), 'install');
  assert.equal(calls[2].args.at(-1), 'generate');
});

test('Given missing frontend tools, When doctor checks readiness, Then it reports failure without installing anything', t => {
  // Given a checkout without installed frontend dependencies.
  const root = fixture(t);
  const checks = [];
  const calls = [];
  const run = (...args) => { calls.push(args); return { status: 0, stdout: '12.11.2', output: '12.11.2' }; };

  // When doctor inspects the local tools.
  checkFrontendTools({ root, run, checks }, 'node');

  // Then missing readiness is visible and no command changes the machine.
  assert.equal(checks[0].passed, false);
  assert.deepEqual(calls, []);
});
