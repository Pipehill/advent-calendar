import http from 'node:http';
import { createEvent } from 'h3';
import { expect, test } from 'vitest';
import { createNodeRequest, sendUploadRejection } from './node-request';
import { protectTrpcBody } from './request-body';

test('Given an ongoing oversized HTTP upload, When the BFF rejects its declared length, Then the complete no-store 413 arrives without draining its input', async () => {
  // Given a real Node adapter and an upload exceeding the small authentication limit.
  let received = 0;
  const server = http.createServer(async (incoming, outgoing) => {
    incoming.on('data', (chunk) => {
      received += chunk.byteLength;
    });
    const request = createNodeRequest(
      createEvent(incoming, outgoing),
      new AbortController().signal,
    );
    const response = await protectTrpcBody(request);
    await sendUploadRejection(incoming, outgoing, response as Response);
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

    // Then framing delivers the error and the adapter reads only a bounded prefix.
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('connection')).toBe('close');
    expect(result.error.data.code).toBe('PAYLOAD_TOO_LARGE');
    expect(received).toBeLessThan(262_144);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
