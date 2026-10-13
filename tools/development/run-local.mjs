// Keep the stack identity stable so repeated runs reuse services and stored data.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRuntime } from '../quality/local-settings.mjs';
import { command, repositoryRoot } from './commands.mjs';

export function localConfiguration(env = process.env, root = repositoryRoot) {
  const port = Number(env.API_PORT || 8080);
  const frontendPort = Number(env.FRONTEND_PORT || 3000);
  const timeout = Number(env.LOCAL_START_TIMEOUT_SECONDS || 120);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer from 1 through 65535.');
  }
  if (!Number.isInteger(frontendPort) || frontendPort < 1 || frontendPort > 65535 || frontendPort === port) {
    throw new Error('FRONTEND_PORT must be a distinct integer from 1 through 65535.');
  }
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 600) {
    throw new Error('LOCAL_START_TIMEOUT_SECONDS must be between 1 and 600.');
  }
  return {
    runtime: selectRuntime(root, env),
    args: ['compose', '-f', path.join(root, 'compose.yaml'), '-p', 'advent-calendar'],
    url: `http://localhost:${port}`,
    frontendUrl: `http://localhost:${frontendPort}`,
    timeout,
  };
}

export async function waitForReady(url, timeout, request = fetch) {
  const deadline = Date.now() + timeout * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await request(`${url}/health/ready`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // A connection failure is expected while the API is starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Readiness timeout after ${timeout}s: ${url}/health/ready`);
}

export async function runLocal(env = process.env, run = command, request = fetch) {
  const config = localConfiguration(env);
  for (const args of [['info'], ['compose', 'version']]) {
    const result = run(config.runtime, args, false, env);
    if (result.status !== 0) throw new Error(`Missing engine/Compose provider: ${result.output}. Run setup/doctor.`);
  }
  const result = run(config.runtime, [...config.args, 'up', '--build', '--detach'], true, env);
  if (result.status !== 0) throw new Error('Compose build/start failed. Check ports and container logs.');
  try {
    await waitForReady(config.url, config.timeout, request);
    await waitForReady(config.frontendUrl, config.timeout, request);
  } catch (error) {
    run(config.runtime, [...config.args, 'ps'], true, env);
    run(config.runtime, [...config.args, 'logs', '--tail', '50'], true, env);
    throw error;
  }
  console.log(`Local API ready: ${config.url}`);
  console.log(`Local calendar ready: ${config.frontendUrl}`);
  return config.frontendUrl;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runLocal();
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
