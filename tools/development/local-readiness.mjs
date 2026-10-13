import { setTimeout as delay } from 'node:timers/promises';

export async function waitForReady(url, timeout, request = fetch, signal) {
  const deadline = Date.now() + timeout * 1000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const probeTimeout = AbortSignal.timeout(2000);
      const probeSignal = signal ? AbortSignal.any([signal, probeTimeout]) : probeTimeout;
      const response = await request(`${url}/health/ready`, { signal: probeSignal });
      if (response.ok) {
        return;
      }
    } catch {
      // A connection failure is expected while the application is starting.
    }
    await delay(500, undefined, { signal });
  }
  throw new Error(`Readiness timeout after ${timeout}s: ${url}/health/ready`);
}
