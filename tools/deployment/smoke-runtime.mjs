import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readLocalSettings } from '../quality/local-settings.mjs';
import { repositoryRoot as root } from './version.mjs';

const settings = readLocalSettings(root);
export const runtime = process.env.QUALITY_CONTAINER_RUNTIME || settings.runtime || 'docker';
export const dotnet = process.env.DOTNET_EXE || settings.dotnet || 'dotnet';
export const backendImage = process.env.BACKEND_IMAGE || 'localhost/advent-deploy-backend:verify';
export const frontendImage = process.env.FRONTEND_IMAGE || 'localhost/advent-deploy-frontend:verify';
const fixture = path.join(root, 'tools/frontend/browser-fixture/bin/Release/net10.0/BrowserFixture.dll');
const postgres = 'docker.io/library/postgres:18.7@sha256:c7fedce47eff6a78cb35dad6b627f0d684107f75ab15c0870e40c093766ba452';

export function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  // Arguments/environment may contain isolated credentials: never print them.
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed (${result.status}): ${result.stderr || ''}`);
  return result.stdout;
}

export async function waitReady(check) {
  const deadline = Date.now() + 90000;
  let last;
  while (Date.now() < deadline) {
    try { return await check(); }
    catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  throw last;
}

export function buildImages() {
  if (process.env.SKIP_IMAGE_BUILD === 'true') return;
  const sha = process.env.GITHUB_SHA || command('git', ['rev-parse', 'HEAD']).trim();
  for (const [image, dockerfile] of [[backendImage, 'src/backend/Dockerfile'], [frontendImage, 'src/frontend/Dockerfile']]) {
    console.log(`Building ${dockerfile}`);
    command(runtime, ['build', '--label', 'advent.verification=00021', '--build-arg', `SLIPLANE_COMMIT_HASH=${sha}`, '-t', image, '-f', dockerfile, '.'], { stdio: 'inherit' });
  }
}

export async function startStack(directory) {
  const id = randomUUID().slice(0, 8);
  const prefix = `advent-deploy-${id}`;
  const network = `${prefix}-network`;
  const database = `${prefix}-db`;
  const backend = `${prefix}-api`;
  const frontend = `${prefix}-web`;
  const keys = `${prefix}-keys`;
  const containers = [];
  const certificatePassword = randomUUID();
  const password = randomUUID();
  const operatorPassword = randomUUID();
  let edge;
  let networkCreated = false;
  let volumeCreated = false;
  const run = args => command(runtime, args);
  const cleanup = async () => {
    if (edge) await new Promise(resolve => edge.close(resolve));
    for (const name of containers.reverse()) {
      try { run(['rm', '-f', name]); } catch { /* A --rm container may already have exited. */ }
    }
    if (volumeCreated) run(['volume', 'rm', keys]);
    if (networkCreated) run(['network', 'rm', network]);
  };
  try {
    run(['network', 'create', network]);
    networkCreated = true;
    run(['volume', 'create', keys]);
    volumeCreated = true;
    const env = { ...process.env, POSTGRES_PASSWORD: operatorPassword };
    runContainer(database, ['--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=postgres', '-p', '127.0.0.1::5432', postgres], env);
    await waitReady(() => run(['exec', database, 'pg_isready', '-U', 'postgres']));
    // Disposable test identities are intentionally created by the harness, never startup.
    command(runtime, ['exec', '-i', database, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: fs.readFileSync(path.join(root, 'tools/deployment/database-role.sql'), 'utf8').replace(/\badvent\b/g, `browser_${id}`)
        + `\nALTER ROLE advent_app PASSWORD '${password}';\n`,
    });
    command(runtime, ['exec', '-i', database, 'psql', '-U', 'postgres', '-d', `browser_${id}`, '-v', 'ON_ERROR_STOP=1'], {
      input: fs.readFileSync(path.join(root, 'tools/deployment/database-schema.sql'), 'utf8'),
    });
    const port = run(['port', database, '5432/tcp']).trim().split(':').at(-1);
    const connection = `Host=127.0.0.1;Port=${port};Database=browser_${id};Username=advent_app;Password=${password};SSL Mode=Disable;Maximum Pool Size=10;Timeout=3;Command Timeout=5`;
    command(dotnet, [fixture, 'certificate', directory], { env: { ...process.env, TEST_CERTIFICATE_PASSWORD: certificatePassword } });
    const pfx = fs.readFileSync(path.join(directory, 'test.pfx')).toString('base64');
    const backendVariables = {
      ASPNETCORE_ENVIRONMENT: 'Production',
      ConnectionStrings__Calendar: connection.replace(`Host=127.0.0.1;Port=${port}`, `Host=${database};Port=5432`),
      Authentication__KeyDirectory: '/var/lib/advent-keys',
      Authentication__KeyCertificateBase64: pfx,
      Authentication__KeyCertificatePassword: certificatePassword,
      CalendarOpening__DisableTimeCheck: 'false',
    };
    const backendEnvironment = { ...process.env, ...backendVariables };
    const backendEnvironmentArguments = Object.keys(backendVariables).flatMap(key => ['--env', key]);
    // Volumes are initialized for the image's existing nonroot identity, as on Sliplane.
    run(['run', '--rm', '--user', '0', '-v', `${keys}:/var/lib/advent-keys`, '--entrypoint', 'chown', backendImage, '1654:1654', '/var/lib/advent-keys']);
    runContainer(backend, ['-v', `${keys}:/var/lib/advent-keys`, '-p', '127.0.0.1::8080',
      ...backendEnvironmentArguments,
      '--env', 'Hosting__KnownProxies__0=127.0.0.1', backendImage], backendEnvironment);
    // Determine the actual frontend peer IP before backend receives protected requests.
    const apiPort = run(['port', backend, '8080/tcp']).trim().split(':').at(-1);
    await waitReady(async () => {
      const response = await fetch(`http://127.0.0.1:${apiPort}/health/ready`);
      if (!response.ok) throw new Error('Backend not ready');
    });
    const count = run(['exec', database, 'psql', '-U', 'postgres', '-d', `browser_${id}`, '-Atc', 'SELECT count(*) FROM accounts']).trim();
    if (count !== '0') throw new Error('Production startup unexpectedly created accounts');
    const accounts = JSON.parse(command(dotnet, [fixture], { env: { ...process.env, BROWSER_TEST_CONNECTION: connection } }));
    // TLS terminates on this isolated edge; BFF and backend still use private HTTP.
    let frontendPort;
    edge = https.createServer({ key: fs.readFileSync(path.join(directory, 'test.key')), cert: fs.readFileSync(path.join(directory, 'test.crt')) }, (request, response) => {
      const upstream = http.request({ hostname: '127.0.0.1', port: frontendPort, path: request.url, method: request.method, headers: request.headers }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      });
      upstream.on('error', () => { response.writeHead(502); response.end(); });
      request.pipe(upstream);
    });
    await new Promise(resolve => edge.listen(0, '127.0.0.1', resolve));
    const origin = `https://localhost:${edge.address().port}`;
    runContainer(frontend, ['--env', `BACKEND_API_URL=http://${backend}:8080`, '--env', `PUBLIC_ORIGIN=${origin}`, '-p', '127.0.0.1::3000', frontendImage]);
    frontendPort = run(['port', frontend, '3000/tcp']).trim().split(':').at(-1);
    const frontendIp = run(['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', frontend]).trim();
    // Replace only the backend container; its database and key volume are retained.
    run(['rm', '-f', backend]);
    containers.splice(containers.indexOf(backend), 1);
    const replacementArguments = ['-v', `${keys}:/var/lib/advent-keys`, '--env', `Hosting__KnownProxies__0=${frontendIp}`,
      ...backendEnvironmentArguments, backendImage];
    runContainer(backend, replacementArguments, backendEnvironment);
    await waitReady(async () => {
      const response = await fetch(`http://127.0.0.1:${frontendPort}/health/ready`);
      if (!response.ok) throw new Error('Frontend not ready');
    });
    const restart = async newPassword => {
      if (newPassword) {
        backendEnvironment.ConnectionStrings__Calendar = backendVariables.ConnectionStrings__Calendar.replace(
          /Password=[^;]+/, `Password=${newPassword}`,
        );
      }
      run(['rm', '-f', backend]);
      containers.splice(containers.indexOf(backend), 1);
      runContainer(backend, replacementArguments, backendEnvironment);
      await waitReady(async () => {
        const response = await fetch(`http://127.0.0.1:${frontendPort}/health/ready`);
        if (!response.ok) throw new Error('Replacement not ready');
      });
    };
    return { origin, accounts, connection, database, databaseName: `browser_${id}`, backend, frontend, run, cleanup, restart, keys };
  } catch (error) {
    await cleanup();
    throw error;
  }

  function runContainer(name, args, env = process.env) {
    command(runtime, ['run', '--rm', '-d', '--name', name, '--network', network, ...args], { env });
    containers.push(name);
  }
}
