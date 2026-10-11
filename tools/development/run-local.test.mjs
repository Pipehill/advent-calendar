import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localConfiguration, runLocal, waitForReady } from './run-local.mjs';

test('launcher validates ports/timeouts and resolves stable absolute Compose paths', () => {
  const config = localConfiguration({ API_PORT: '9090', QUALITY_CONTAINER_RUNTIME: 'custom runtime' }, '/repo with spaces');
  assert.equal(config.runtime, 'custom runtime');
  assert.equal(config.url, 'http://localhost:9090');
  assert(config.args[2].includes('repo with spaces'));
  assert.equal(config.args.at(-1), 'advent-calendar');
  for (const API_PORT of ['0', '65536', 'invalid']) {
    assert.throws(() => localConfiguration({ API_PORT }), /API_PORT/);
  }
  assert.throws(() => localConfiguration({ LOCAL_START_TIMEOUT_SECONDS: '0' }), /TIMEOUT/);
});

test('launcher requires engine/provider and refuses failed builds without announcing readiness', async () => {
  const unavailable = () => ({ status: 1, output: 'unreachable' });
  await assert.rejects(runLocal({}, unavailable), /engine\/Compose/);
  const failedBuild = (_runtime, args) => ({ status: args.includes('up') ? 1 : 0, output: 'failed build' });
  await assert.rejects(runLocal({}, failedBuild), /build\/start/);
});

test('launcher reuses stack, builds source, probes readiness and prints configured URL', async () => {
  const calls = [];
  const run = (_runtime, args) => {
    calls.push(args);
    return { status: 0 };
  };
  const env = { API_PORT: '9090', QUALITY_CONTAINER_RUNTIME: 'podman' };
  const request = async url => {
    assert.equal(url, 'http://localhost:9090/health/ready');
    return { ok: true };
  };
  assert.equal(await runLocal(env, run, request), 'http://localhost:9090');
  assert.deepEqual(calls.at(-1).slice(-3), ['up', '--build', '--detach']);
});

test('readiness retries unavailable responses and times out with useful diagnostics', async () => {
  let attempts = 0;
  await waitForReady('http://localhost', 2, async () => ({ ok: ++attempts === 2 }));
  assert.equal(attempts, 2);
  await assert.rejects(waitForReady('http://localhost', 0.01, async () => { throw new Error('offline'); }), /Readiness timeout/);
});
