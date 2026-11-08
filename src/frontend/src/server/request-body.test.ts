import { expect, test } from 'vitest';
import { protectTrpcBody } from './request-body';

test('Given a Request-compatible development adapter, When its body is bounded, Then URL method security headers and bytes are preserved', async () => {
  // Given a lazy adapter with the Request prototype but no native private state.
  const native = new Request('http://frontend.test/api/trpc/auth.login?batch=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'advent.auth=session; advent.csrf=csrf-cookie',
      'X-CSRF-TOKEN': 'principal-token',
      traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
    },
    body: '{"username":"owner","password":"test-only"}',
  });
  const adapter: Request = Object.create(
    Request.prototype,
    Object.fromEntries(
      ['url', 'method', 'headers', 'signal', 'body'].map((key) => [
        key,
        {
          value: native[key as keyof Request],
        },
      ]),
    ),
  );

  // When the boundary adapts public request values rather than cloning native state.
  const result = await protectTrpcBody(adapter);

  // Then authenticated mutations reach the same route with their exact input and metadata.
  expect(result).toBeInstanceOf(Request);
  expect((result as Request).url).toBe(native.url);
  expect((result as Request).method).toBe('POST');
  expect([...result.headers]).toEqual([...native.headers]);
  expect(await result.text()).toBe('{"username":"owner","password":"test-only"}');
});

test('Given a bounded mutation request, When its caller disconnects, Then cancellation remains connected to the rebuilt request', async () => {
  // Given an active mutation and its caller-owned cancellation signal.
  const controller = new AbortController();
  const request = new Request('http://frontend.test/api/trpc/calendar.saveDoor', {
    method: 'POST',
    body: '{}',
    signal: controller.signal,
  });

  // When the bounded request is rebuilt and the caller later aborts.
  const result = await protectTrpcBody(request);
  controller.abort();

  // Then adapting the buffered body cannot disconnect backend deadline propagation.
  expect((result as Request).signal.aborted).toBe(true);
});

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

test('Given an oversized aggregate batch with no content length, When streamed chunks exceed the upload limit, Then a protected 413 closes the connection before JSON parsing', async () => {
  // Given two individually small enough chunks whose aggregate is too large.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(8_000_000));
      controller.enqueue(new Uint8Array(6_000_001));
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
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(413);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('connection')).toBe('close');
  expect(await (response as Response).json()).toMatchObject({
    error: { data: { code: 'PAYLOAD_TOO_LARGE' } },
  });
  await request.body?.cancel();
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
