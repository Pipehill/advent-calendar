import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localTestEnvironment } from './local-test-environment.mjs';

function podmanResponses(platform, overrides = {}) {
  const info = { host: {
    security: { rootless: true },
    serviceIsRemote: platform !== 'linux',
    remoteSocket: { path: '/run/user/1000/podman/podman.sock' },
  } };
  const connection = { Name: 'work-machine', Default: true, IsMachine: true };
  const machine = { ConnectionInfo: {
    PodmanPipe: { Path: '\\\\.\\pipe\\work-machine' },
    PodmanSocket: { Path: '/tmp/work-machine.sock' },
  } };
  return (_executable, args) => {
    let response;
    if (args[0] === 'info') response = overrides.info || info;
    if (args[0] === 'system') response = overrides.connections || [connection];
    if (args[0] === 'machine') response = [machine];
    return { status: 0, stdout: JSON.stringify(response) };
  };
}

test('Given Docker selected, When test configuration is resolved, Then Docker discovery and explicit environment settings are preserved', () => {
  // Given Docker and a user-supplied endpoint.
  const env = { DOCKER_HOST: 'tcp://localhost:2375' };
  const run = () => { throw new Error('Unexpected Podman command'); };

  // When test configuration is resolved.
  const result = localTestEnvironment('docker', env, run);

  // Then Docker retains its native discovery and settings.
  assert.equal(result, env);
});

for (const [platform, endpoint] of [
  ['win32', 'npipe://localhost/pipe/work-machine'],
  ['darwin', 'unix:///tmp/work-machine.sock'],
  ['linux', 'unix:///run/user/1000/podman/podman.sock'],
]) {
  test(`Given rootless Podman on ${platform}, When test configuration is resolved, Then it selects the local API endpoint`, () => {
    // Given a local rootless engine with platform-specific connection details.
    const env = {};
    const run = podmanResponses(platform);

    // When tests are configured for the selected runtime.
    const result = localTestEnvironment('podman', env, run, platform);

    // Then tests reach the selected engine and ordinary fixture cleanup remains enabled.
    assert.equal(result.DOCKER_HOST, endpoint);
    assert.equal(result.TESTCONTAINERS_RYUK_DISABLED, 'true');
    assert.deepEqual(env, {});
  });
}

test('Given explicit Podman test overrides, When test configuration is resolved, Then neither setting is replaced', () => {
  // Given explicit endpoint and resource-reaper configuration.
  const env = { DOCKER_HOST: 'unix:///custom.sock', TESTCONTAINERS_RYUK_DISABLED: 'false' };
  const run = podmanResponses('win32');

  // When the launcher derives its test environment.
  const result = localTestEnvironment('podman', env, run, 'win32');

  // Then user settings take precedence over inferred defaults.
  assert.deepEqual(result, env);
});

test('Given a selected rootful Podman machine, When test configuration is resolved, Then it inspects the matching machine without disabling the reaper', () => {
  // Given a root connection rather than the default connection.
  const env = { CONTAINER_CONNECTION: 'work-machine-root' };
  const responses = podmanResponses('win32', {
    info: { host: { security: { rootless: false } } },
    connections: [
      { Name: 'other', Default: true, IsMachine: true },
      { Name: 'work-machine-root', Default: false, IsMachine: true },
    ],
  });
  const calls = [];
  const run = (executable, args) => {
    calls.push(args);
    return responses(executable, args);
  };

  // When test configuration is derived for the selected connection.
  const result = localTestEnvironment('podman', env, run, 'win32');

  // Then the selected machine is inspected and rootful cleanup keeps its default.
  assert.deepEqual(calls.at(-1), ['machine', 'inspect', 'work-machine']);
  assert.equal(result.TESTCONTAINERS_RYUK_DISABLED, undefined);
});

test('Given a remote Podman connection without a test endpoint, When test configuration is resolved, Then it requests an explicit endpoint', () => {
  // Given a remote connection that is not a local managed machine.
  const run = podmanResponses('darwin', { connections: [{ Name: 'remote', Default: true, IsMachine: false }] });

  // When endpoint resolution is attempted.
  const configure = () => localTestEnvironment('podman', {}, run, 'darwin');

  // Then the launcher fails with a targeted configuration remedy.
  assert.throws(configure, /explicit DOCKER_HOST/);
});
