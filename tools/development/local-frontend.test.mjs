import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { runDevFrontend } from './local-frontend.mjs';

const config = { root: '/repo with spaces', frontendPort: 0, frontendUrl: 'http://localhost:3000', timeout: 1 };

function fakeServer() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.finish = code => {
    child.exitCode = code;
    child.emit('exit', code, null);
  };
  child.kill = () => {
    child.signalCode = 'SIGTERM';
    child.emit('exit', null, 'SIGTERM');
  };
  return child;
}

test('Given a ready frontend, When Vite finishes successfully, Then the launcher waits for exit and removes signal listeners', async () => {
  // Given a Vite process and a ready frontend endpoint.
  const child = fakeServer();
  const listeners = process.listenerCount('SIGINT');
  let invocation;
  const start = (executable, args, options) => {
    invocation = { executable, args, options };
    setTimeout(() => child.finish(0), 25);
    return child;
  };
  const env = { BACKEND_API_URL: 'http://localhost:9090' };

  // When the dev lifecycle runs to normal completion.
  await runDevFrontend(config, env, async () => ({ ok: true }), start);

  // Then Vite receives the host binding and API environment, and lifecycle handlers are cleaned up.
  assert(invocation.args.includes('--strictPort'));
  assert(invocation.args.includes('127.0.0.1'));
  assert.equal(invocation.options.env, env);
  assert.equal(child.exitCode, 0);
  assert.equal(process.listenerCount('SIGINT'), listeners);
});

test('Given Vite exits before readiness, When startup is attempted, Then the launcher fails promptly', async () => {
  // Given a server that fails to start and an endpoint that remains unready.
  const child = fakeServer();
  const start = () => {
    setImmediate(() => child.finish(1));
    return child;
  };

  // When the frontend startup is attempted.
  const launch = () => runDevFrontend(config, {}, async () => ({ ok: false }), start);

  // Then early exit is reported rather than waiting for the full readiness timeout.
  await assert.rejects(launch, /Vite exited before readiness/);
});

test('Given Vite cannot be spawned, When startup is attempted, Then the process error propagates', async () => {
  // Given a failed process spawn.
  const child = fakeServer();
  const start = () => {
    setImmediate(() => child.emit('error', new Error('spawn denied')));
    return child;
  };

  // When startup is attempted.
  const launch = () => runDevFrontend(config, {}, async () => ({ ok: false }), start);

  // Then the spawn error is preserved.
  await assert.rejects(launch, /spawn denied/);
});

test('Given Vite never becomes ready, When readiness times out, Then its child process is stopped', async () => {
  // Given a running process that never serves a ready endpoint.
  const child = fakeServer();
  const start = () => child;
  const shortConfig = { ...config, timeout: 0.01 };

  // When its readiness deadline expires.
  const launch = () => runDevFrontend(shortConfig, {}, async () => ({ ok: false }), start);

  // Then failure terminates the owned server process.
  await assert.rejects(launch, /Readiness timeout/);
  assert.equal(child.signalCode, 'SIGTERM');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`Given ready Vite receives ${signal}, When the launcher is interrupted, Then the owned server stops without reporting failure`, async () => {
    // Given a running server and a terminal signal scheduled after readiness.
    const child = fakeServer();
    const start = () => {
      setTimeout(() => process.emit(signal), 25);
      return child;
    };

    // When the lifecycle receives the interruption.
    await runDevFrontend(config, {}, async () => ({ ok: true }), start);

    // Then the child is stopped and interruption returns successfully.
    assert.equal(child.signalCode, 'SIGTERM');
  });
}

test('Given an occupied frontend port, When dev startup is attempted, Then it fails without launching another server', async () => {
  // Given another server already owns the desired port.
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const occupiedConfig = { ...config, frontendPort: server.address().port };
  const start = () => { throw new Error('Unexpected process spawn'); };

  // When a competing dev launch is attempted.
  const launch = () => runDevFrontend(occupiedConfig, {}, undefined, start);

  // Then the port conflict is clear and the existing server is preserved.
  try {
    await assert.rejects(launch, /occupied/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
