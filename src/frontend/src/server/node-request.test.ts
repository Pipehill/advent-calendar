import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createEvent } from 'h3';
import { expect, test, vi } from 'vitest';
import { createNodeRequest, sendUploadRejection } from './node-request';
import { protectTrpcBody } from './request-body';

test('Given an unread HTTP upload, When the adapter queues bytes before rejection, Then backpressure bounds the retained prefix and the no-store 413 arrives', async () => {
  // Given a real Node adapter and an upload exceeding the small authentication limit.
  let received = 0;
  let queuedPrefix = 0;
  const server = http.createServer(async (incoming, outgoing) => {
    incoming.on('data', (chunk) => {
      received += chunk.byteLength;
    });
    const request = createNodeRequest(
      createEvent(incoming, outgoing),
      new AbortController().signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    queuedPrefix = received;
    const response = await protectTrpcBody(request);
    await sendUploadRejection(incoming, outgoing, response as Response, request.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('A TCP listener is required');

  try {
    // When the client sends substantially more bytes than the accepted request size.
    const response = await fetch(`http://127.0.0.1:${address.port}/api/trpc/auth.login`, {
      method: 'POST',
      body: new Uint8Array(14_000_000),
    });
    const result = await response.json();

    // Then unread bytes stay bounded before discard, independently of upload length.
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('connection')).toBe('close');
    expect(result.error.data.code).toBe('PAYLOAD_TOO_LARGE');
    expect(queuedPrefix).toBeLessThan(262_144);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('Given an endless rejected upload, When the finite discard budget is reached, Then input pauses and the response ends without consuming the rest', async () => {
  // Given a sender that never ends its input and transport lifecycle observers.
  let produced = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      produced += 65_536;
      controller.enqueue(new Uint8Array(65_536));
    },
  });
  const incoming = { pause: vi.fn() };
  const outgoing = { setHeader: vi.fn(), writeHead: vi.fn(), write: vi.fn(), end: vi.fn() };
  const response = new Response('Too large', { status: 413 });

  // When rejecting without retaining or draining unlimited request bytes.
  await sendUploadRejection(
    incoming as unknown as IncomingMessage,
    outgoing as unknown as ServerResponse,
    response,
    stream,
  );

  // Then only the fixed byte budget plus one queued chunk is produced.
  expect(produced).toBeGreaterThanOrEqual(32 * 1024 * 1024);
  expect(produced).toBeLessThanOrEqual(32 * 1024 * 1024 + 65_536);
  expect(incoming.pause).toHaveBeenCalledOnce();
  expect(outgoing.end).toHaveBeenCalledOnce();
  await stream.cancel();
});

test('Given a stalled rejected upload, When the discard deadline expires, Then cleanup ends the response without waiting for more body bytes', async () => {
  // Given a sender that never supplies the next chunk.
  vi.useFakeTimers();
  const stream = new ReadableStream<Uint8Array>();
  const incoming = { pause: vi.fn() };
  const outgoing = { setHeader: vi.fn(), writeHead: vi.fn(), write: vi.fn(), end: vi.fn() };

  try {
    // When the bounded cleanup deadline is reached with a read still pending.
    const rejection = sendUploadRejection(
      incoming as unknown as IncomingMessage,
      outgoing as unknown as ServerResponse,
      new Response('Too large', { status: 413 }),
      stream,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;

    // Then a stalled sender cannot retain the response indefinitely.
    expect(incoming.pause).toHaveBeenCalledOnce();
    expect(outgoing.end).toHaveBeenCalledOnce();
  } finally {
    await stream.cancel();
    vi.useRealTimers();
  }
});
