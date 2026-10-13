import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localConfiguration, runLocal, waitForReady } from './run-local.mjs';

test('Given a custom runtime and port, When the launcher is configured, Then it resolves a stable Compose project', () => {
  // Given a repository path with spaces and explicit runtime/port overrides.
  const env = { API_PORT: '9090', QUALITY_CONTAINER_RUNTIME: 'custom runtime' };
  const directory = '/repo with spaces';

  // When the launcher configuration is resolved.
  const config = localConfiguration(env, directory);

  // Then it uses the selected engine, URL, absolute Compose path and stable project name.
  assert.equal(config.runtime, 'custom runtime');
  assert.equal(config.url, 'http://localhost:9090');
  assert(config.args[2].includes('repo with spaces'));
  assert.equal(config.args.at(-1), 'advent-calendar');
});

for (const port of ['0', '65536', 'invalid']) {
  test(`Given invalid API port ${port}, When the launcher is configured, Then it rejects the port`, () => {
    // Given a port outside the accepted numeric range.
    const env = { API_PORT: port };

    // When configuration of that port is attempted.
    const configure = () => localConfiguration(env);

    // Then the error identifies API_PORT.
    assert.throws(configure, /API_PORT/);
  });
}

for (const port of ['0', '65536', 'invalid', '8080']) {
  test(`Given invalid or conflicting frontend port ${port}, When the launcher is configured, Then it rejects the port`, () => {
    // Given an invalid frontend port or the same port as the API.
    const env = { FRONTEND_PORT: port };

    // When configuration is attempted.
    const configure = () => localConfiguration(env);

    // Then the error identifies FRONTEND_PORT.
    assert.throws(configure, /FRONTEND_PORT/);
  });
}

test('Given separate custom ports, When the launcher is configured, Then each service URL uses its own port', () => {
  // Given distinct API and frontend ports.
  const env = { API_PORT: '9090', FRONTEND_PORT: '4000' };

  // When configuration is resolved.
  const config = localConfiguration(env);

  // Then the API and frontend have independent host URLs.
  assert.equal(config.url, 'http://localhost:9090');
  assert.equal(config.frontendUrl, 'http://localhost:4000');
});

test('Given a zero timeout, When the launcher is configured, Then it rejects the timeout', () => {
  // Given a readiness timeout that cannot permit a probe.
  const env = { LOCAL_START_TIMEOUT_SECONDS: '0' };

  // When launcher configuration is attempted.
  const configure = () => localConfiguration(env);

  // Then the error identifies the timeout setting.
  assert.throws(configure, /TIMEOUT/);
});

test('Given an unavailable engine, When the launcher starts the stack, Then it reports the engine or Compose failure', async () => {
  // Given an engine/provider command that cannot connect.
  const unavailable = () => ({ status: 1, output: 'unreachable' });

  // When launch is attempted.
  const launch = () => runLocal({}, unavailable);

  // Then launch fails with an engine/Compose diagnostic.
  await assert.rejects(launch, /engine\/Compose/);
});

test('Given a failed Compose build, When the launcher starts the stack, Then it rejects without probing readiness', async () => {
  // Given an available engine whose Compose build fails.
  const failedBuild = (_runtime, args) => ({ status: args.includes('up') ? 1 : 0, output: 'failed build' });
  const requests = [];
  const request = async url => {
    requests.push(url);
    return { ok: true };
  };

  // When launch is attempted.
  const launch = () => runLocal({}, failedBuild, request);

  // Then the build failure propagates before readiness can be announced.
  await assert.rejects(launch, /build\/start/);
  assert.deepEqual(requests, []);
});

test('Given an available engine, When the launcher starts the stack, Then it builds the stable stack and returns the ready URL', async () => {
  // Given successful engine commands and a ready API on the configured port.
  const calls = [];
  const run = (_runtime, args) => {
    calls.push(args);
    return { status: 0 };
  };
  const env = { API_PORT: '9090', QUALITY_CONTAINER_RUNTIME: 'podman' };
  const requests = [];
  const request = async url => {
    requests.push(url);
    return { ok: true };
  };

  // When the local stack is launched.
  const url = await runLocal(env, run, request);

  // Then the current source is built and the configured readiness endpoint is probed.
  assert.equal(url, 'http://localhost:3000');
  assert.deepEqual(requests, ['http://localhost:9090/health/ready', 'http://localhost:3000/health/ready']);
  assert.deepEqual(calls.at(-1).slice(-3), ['up', '--build', '--detach']);
});

test('Given an initially unavailable API, When the launcher probes readiness, Then it retries until success', async () => {
  // Given an API that becomes ready on the second request.
  let attempts = 0;
  const request = async () => ({ ok: ++attempts === 2 });

  // When readiness is probed within the deadline.
  await waitForReady('http://localhost', 2, request);

  // Then the failed probe is retried and the successful second probe completes the wait.
  assert.equal(attempts, 2);
});

test('Given an offline API, When readiness exceeds its deadline, Then the launcher reports a timeout', async () => {
  // Given an API request that always fails to connect.
  const request = async () => {
    throw new Error('offline');
  };

  // When readiness is attempted with a short deadline.
  const probe = () => waitForReady('http://localhost', 0.01, request);

  // Then the bounded wait reports a useful timeout diagnostic.
  await assert.rejects(probe, /Readiness timeout/);
});
