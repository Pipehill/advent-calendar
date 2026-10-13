// Spawn Vite directly so terminal signals reach the server without shell wrappers.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { waitForReady } from './local-readiness.mjs';

async function requireFreePort(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () => {
      reject(new Error(`Frontend port ${port} is occupied. Stop the existing server or change FRONTEND_PORT.`));
    });
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

export async function runDevFrontend(config, env, request = fetch, start = spawn) {
  await requireFreePort(config.frontendPort);
  const directory = path.join(config.root, 'src/frontend');
  const vite = path.join(directory, 'node_modules/vite/bin/vite.js');
  const child = start(process.execPath, [
    vite, '--host', '127.0.0.1', '--port', String(config.frontendPort), '--strictPort',
  ], { cwd: directory, env, stdio: 'inherit' });
  const controller = new AbortController();
  let interrupted = false;
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  function stop() {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
  }
  function interrupt() {
    interrupted = true;
    controller.abort();
    stop();
  }
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const prematureExit = completion.then(() => {
      throw new Error('Vite exited before readiness. Check the frontend port and startup output.');
    });
    await Promise.race([
      waitForReady(config.frontendUrl, config.timeout, request, controller.signal),
      prematureExit,
    ]);
    console.log(`Local calendar ready: ${config.frontendUrl} (Vite hot reload)`);
    console.log('Press Ctrl+C to stop Vite. Backend/database remain running.');
    const result = await completion;
    if (!interrupted && result.code !== 0) {
      throw new Error(`Vite exited (${result.code ?? result.signal}).`);
    }
  } catch (error) {
    if (!interrupted) {
      throw error;
    }
  } finally {
    controller.abort();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    stop();
    // Wait for server termination before returning control to the terminal.
    await completion;
  }
}
