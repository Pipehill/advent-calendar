import { expect, test } from 'vitest';
import { protectTrpcBody } from './request-body';

test.each([
  ['calendar.saveDoor', 14_000_000],
  ['calendar.saveDoor,calendar.saveDoor?batch=1', 14_000_000],
  ['accounts.create', 131_072],
] as const)(
  'Given %s, When its body exactly reaches %i bytes, Then the bounded request is preserved',
  async (procedure, maximum) => {
    // Given a body at the exact route-specific limit.
    const request = new Request(`http://frontend.test/api/trpc/${procedure}`, {
      method: 'POST',
      body: new Uint8Array(maximum),
    });

    // When enforcing limits before JSON parsing.
    const result = await protectTrpcBody(request);

    // Then exact boundaries are accepted without changing the bytes.
    expect(result).toBeInstanceOf(Request);
    expect((await result.arrayBuffer()).byteLength).toBe(maximum);
  },
);

test('Given an oversized aggregate batch with no content length, When streamed chunks exceed the upload limit, Then it is cancelled before JSON parsing', async () => {
  // Given two individually small enough chunks whose aggregate is too large.
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(8_000_000));
      controller.enqueue(new Uint8Array(6_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(
    'http://frontend.test/api/trpc/calendar.saveDoor,calendar.saveDoor?batch=1',
    {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit,
  );

  // When the body boundary checks the streamed total.
  const response = await protectTrpcBody(request);

  // Then oversized data never reaches tRPC or the backend.
  expect(cancelled).toBe(true);
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(413);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await (response as Response).json()).toMatchObject({
    error: { data: { code: 'PAYLOAD_TOO_LARGE' } },
  });
});

test('Given an oversized declared body, When the BFF checks headers, Then the request is rejected without buffering its bytes', async () => {
  // Given a request whose declared size already exceeds the upload limit.
  const request = new Request('http://frontend.test/api/trpc/calendar.saveDoor', {
    method: 'POST',
    headers: { 'content-length': '14000001' },
    body: 'unread',
  });

  // When inspecting headers before reading the body.
  const response = await protectTrpcBody(request);

  // Then rejection is a protected HTTP 413.
  expect((response as Response).status).toBe(413);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
