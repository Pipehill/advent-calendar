import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localConfiguration, parseLocalOptions, runLocal, waitForReady } from './run-local.mjs';

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
  const failedBuild = (_runtime, args) => ({ status: args.includes('build') ? 1 : 0, output: 'failed build' });
  const requests = [];
  const request = async url => {
    requests.push(url);
    return { ok: true };
  };

  // When launch is attempted.
  const launch = () => runLocal({}, failedBuild, request);

  // Then the build failure propagates before readiness can be announced.
  await assert.rejects(launch, /Compose build/);
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
  const options = parseLocalOptions(['--frontend=container', '--skip-test']);
  const url = await runLocal(env, run, request, options);

  // Then the current source is built and the configured readiness endpoint is probed.
  assert.equal(url, 'http://localhost:3000');
  assert.deepEqual(requests, ['http://localhost:9090/health/ready', 'http://localhost:3000/health/ready']);
  assert(calls.some(args => args.includes('build') && args.includes('frontend')));
  assert.deepEqual(calls.at(-1).slice(-6), ['up', '--no-build', '--detach', 'database', 'backend', 'frontend']);
});

test('Given no flags, When options are parsed, Then hot reload and build and tests are enabled', () => {
  // Given an invocation without options.
  const args = [];

  // When the default options are resolved.
  const options = parseLocalOptions(args);

  // Then dev is the default and neither verification nor image builds are skipped.
  assert.deepEqual(options, { frontend: 'dev', skipBuild: false, skipTest: false, help: false });
});

for (const argument of ['--frontend=preview', '--skip-tests', '--frontend']) {
  test(`Given unsupported flag ${argument}, When options are parsed, Then the invocation is rejected`, () => {
    // Given an unsupported flag or frontend mode.
    const args = [argument];

    // When parsing is attempted.
    const parse = () => parseLocalOptions(args);

    // Then an actionable usage error is returned.
    assert.throws(parse, /Use --help/);
  });
}

test('Given default dev mode and custom ports, When launch succeeds, Then Vite uses the ready host backend without starting a frontend container', async () => {
  // Given a ready container engine and injected Vite lifecycle.
  const calls = [];
  const run = (executable, args) => {
    calls.push({ executable, args });
    return { status: 0 };
  };
  const env = { API_PORT: '9090', FRONTEND_PORT: '4000', BACKEND_API_URL: 'http://backend:8080' };
  const requests = [];
  const request = async url => {
    requests.push(url);
    return { ok: true };
  };
  let development;
  const develop = async (config, environment) => { development = { config, environment }; };

  // When the default dev workflow runs with tests skipped.
  const url = await runLocal(env, run, request, parseLocalOptions(['--skip-test']), develop);

  // Then backend readiness precedes dev launch and the container frontend is stopped.
  assert.equal(url, 'http://localhost:4000');
  assert.deepEqual(requests, ['http://localhost:9090/health/ready']);
  assert.equal(development.environment.BACKEND_API_URL, 'http://localhost:9090');
  assert.equal(development.config.frontendPort, 4000);
  assert.equal(env.BACKEND_API_URL, 'http://backend:8080');
  const stopIndex = calls.findIndex(call => call.args.includes('stop'));
  const startIndex = calls.findIndex(call => call.args.includes('up'));
  assert(stopIndex < startIndex);
  assert.deepEqual(calls[startIndex].args.slice(-2), ['database', 'backend']);
});

test('Given both skip flags, When container mode starts, Then it reuses images without running source tests or Vite', async () => {
  // Given a container engine and a ready stack.
  const calls = [];
  const run = (_executable, args) => {
    calls.push(args);
    return { status: 0 };
  };
  const options = parseLocalOptions(['--frontend=container', '--skip-build', '--skip-test']);
  const develop = () => { throw new Error('Unexpected Vite startup'); };

  // When container mode is launched with both skips.
  await runLocal({}, run, async () => ({ ok: true }), options, develop);

  // Then startup forbids implicit builds and never executes host source workflows.
  assert(calls.at(-1).includes('--no-build'));
  assert(!calls.some(args => args.includes('build') || args.includes('test') || args.includes('generate')));
});

test('Given tests enabled with skipped image builds, When launch succeeds, Then both source test suites finish before services start', async () => {
  // Given ready services and a test endpoint environment from the runtime resolver.
  const calls = [];
  const testsEnv = { DOCKER_HOST: 'npipe://test-endpoint' };
  const run = (_executable, args, _inherit, env) => {
    calls.push({ args, env });
    return { status: 0 };
  };
  const options = parseLocalOptions(['--skip-build', '--frontend=container']);

  // When launch runs the required tests.
  await runLocal({}, run, async () => ({ ok: true }), options, undefined, () => testsEnv);

  // Then tests use the resolved endpoint and all complete before Compose starts services.
  const testCalls = calls.filter(call => call.args.includes('test'));
  assert.equal(testCalls.length, 2);
  assert(testCalls.every(call => call.env === testsEnv));
  assert(testCalls.every(call => calls.indexOf(call) < calls.findIndex(item => item.args.includes('up'))));
});

for (const component of ['backend', 'frontend']) {
  test(`Given failed ${component} tests, When launch is attempted, Then services are not started`, async () => {
    // Given one failing test suite and otherwise successful commands.
    const calls = [];
    const run = (_executable, args) => {
      calls.push(args);
      const failed = args.includes('test') && args[0].includes(component);
      return { status: failed ? 1 : 0 };
    };
    const options = parseLocalOptions(['--skip-build']);

    // When startup is attempted with the failing suite.
    const launch = () => runLocal({}, run, undefined, options, undefined, (_runtime, env) => env);

    // Then test failure prevents launching or stopping services.
    await assert.rejects(launch, /tests failed/);
    assert(!calls.some(args => args.includes('up') || args.includes('stop')));
  });
}

test('Given missing images with skip-build, When Compose refuses startup, Then readiness is never announced', async () => {
  // Given a Compose provider that cannot find an existing image.
  const run = (_executable, args) => ({ status: args.includes('up') ? 1 : 0 });
  const request = () => { throw new Error('Unexpected readiness probe'); };
  const options = parseLocalOptions(['--frontend=container', '--skip-build', '--skip-test']);

  // When startup is attempted without image builds.
  const launch = () => runLocal({}, run, request, options);

  // Then missing images cause an actionable startup failure.
  await assert.rejects(launch, /Compose start failed/);
});

test('Given an unready backend, When startup times out, Then service diagnostics are printed before Vite is started', async () => {
  // Given a backend that never becomes ready.
  const calls = [];
  const run = (_executable, args) => {
    calls.push(args);
    return { status: 0 };
  };
  const options = parseLocalOptions(['--skip-build', '--skip-test']);
  const develop = () => { throw new Error('Unexpected Vite startup'); };

  // When launch reaches its short readiness deadline.
  const launch = () => runLocal({ LOCAL_START_TIMEOUT_SECONDS: '1' }, run, async () => ({ ok: false }), options, develop);

  // Then failure prints status and logs for the persistent services.
  await assert.rejects(launch, /Readiness timeout/);
  assert(calls.some(args => args.includes('ps')));
  assert(calls.some(args => args.includes('logs')));
});

test('Given help requested, When the launcher runs, Then it does not contact an engine or start services', async () => {
  // Given a command runner that must never be used for help.
  const run = () => { throw new Error('Unexpected command'); };
  const options = parseLocalOptions(['--help']);

  // When help is requested even with invalid service configuration.
  const result = await runLocal({ API_PORT: 'invalid' }, run, undefined, options);

  // Then help succeeds without resolving prerequisites.
  assert.equal(result, undefined);
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
