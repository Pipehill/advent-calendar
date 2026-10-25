// Keep the stack identity stable so repeated runs reuse services and stored data.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRuntime } from '../quality/local-settings.mjs';
import { command, repositoryRoot } from './commands.mjs';
import { runDevFrontend } from './local-frontend.mjs';
import { localTestEnvironment } from './local-test-environment.mjs';
import { waitForReady } from './local-readiness.mjs';
import { baseline, compatible } from './requirements.mjs';

export { waitForReady } from './local-readiness.mjs';

export const localUsage = `Usage: run-local [--frontend=dev|container] [--skip-build] [--skip-test]

  --frontend=dev        Run Vite with hot reload in this terminal (default).
  --frontend=container  Run the built frontend in a detached container.
  --skip-build          Reuse existing application images; fail if missing.
  --skip-test           Skip backend integration and frontend unit tests.
  --help, -h            Show this help without starting services.

Tests and dev contract generation can still compile source with --skip-build.
Ctrl+C stops Vite; backend/database stay running and retain development data.`;

export function parseLocalOptions(args = []) {
  const options = { frontend: 'dev', skipBuild: false, skipTest: false, help: false };
  for (const argument of args) {
    if (argument === '--skip-build') {
      options.skipBuild = true;
    } else if (argument === '--skip-test') {
      options.skipTest = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument.startsWith('--frontend=')) {
      options.frontend = argument.slice('--frontend='.length);
    } else {
      throw new Error(`Unknown option: ${argument}. Use --help.`);
    }
  }
  if (!['dev', 'container'].includes(options.frontend)) {
    throw new Error('--frontend must be dev or container. Use --help.');
  }
  return options;
}

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
    frontendPort,
    root,
  };
}

function checkedCommand(run, executable, args, env, failure) {
  let result;
  try {
    result = run(executable, args, true, env);
  } catch (error) {
    throw new Error(`${failure} ${error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(failure);
  }
}

export async function runLocal(
  env = process.env,
  run = command,
  request = fetch,
  options = parseLocalOptions(),
  develop = runDevFrontend,
  testEnvironment = localTestEnvironment,
) {
  if (options.help) {
    console.log(localUsage);
    return;
  }
  if (!compatible('node', process.version)) {
    throw new Error(`Node ${baseline.node} is required; detected ${process.version}. Select Node ${baseline.node} on PATH, restart the terminal and run setup/doctor.`);
  }
  const config = localConfiguration(env);
  for (const args of [['info'], ['compose', 'version']]) {
    const result = run(config.runtime, args, false, env);
    if (result.status !== 0) throw new Error(`Missing engine/Compose provider: ${result.output}. Run setup/doctor.`);
  }
  const services = ['backend'];
  if (options.frontend === 'container') {
    services.push('frontend');
  }
  if (!options.skipBuild) {
    console.log(`Building application images: ${services.join(', ')}.`);
    checkedCommand(run, config.runtime, [...config.args, 'build', ...services], env, 'Compose build failed.');
  }
  if (!options.skipTest) {
    console.log('Running backend integration and frontend unit tests.');
    const testsEnv = testEnvironment(config.runtime, env, run);
    checkedCommand(run, process.execPath, [
      path.join(config.root, 'tools/development/dotnet.mjs'),
      'test', 'src/backend/Calendar.slnx', '-c', 'Release', '-p:RestoreLockedMode=true',
    ], testsEnv, 'backend tests failed; startup stopped.');
    checkedCommand(run, process.execPath, [
      path.join(config.root, 'tools/frontend/pnpm.mjs'), 'run', 'test',
    ], testsEnv, 'frontend tests failed; startup stopped.');
  }
  if (options.frontend === 'dev') {
    // Stop the container frontend before Vite claims the same published port.
    checkedCommand(run, config.runtime, [...config.args, 'stop', 'frontend'], env, 'Could not stop the container frontend.');
  }
  const startArgs = [...config.args, 'up', '--no-build', '--detach', 'database', ...services];
  checkedCommand(run, config.runtime, startArgs, env, 'Compose start failed. Check ports, images and container logs.');
  try {
    await waitForReady(config.url, config.timeout, request);
    console.log(`Local API ready: ${config.url}`);
    if (options.frontend === 'dev') {
      const frontendEnv = { ...env, BACKEND_API_URL: config.url };
      const pnpm = path.join(config.root, 'tools/frontend/pnpm.mjs');
      checkedCommand(run, process.execPath, [pnpm, 'run', 'generate:contract'], frontendEnv, 'Frontend generation failed. Run setup/doctor.');
      await develop(config, frontendEnv, request);
    } else {
      await waitForReady(config.frontendUrl, config.timeout, request);
      console.log(`Local calendar ready: ${config.frontendUrl} (container)`);
    }
  } catch (error) {
    run(config.runtime, [...config.args, 'ps'], true, env);
    run(config.runtime, [...config.args, 'logs', '--tail', '50'], true, env);
    throw error;
  }
  return config.frontendUrl;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runLocal(process.env, command, fetch, parseLocalOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
