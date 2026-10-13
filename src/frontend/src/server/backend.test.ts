import { afterEach, expect, test, vi } from 'vitest';
import { backendConfiguration, retrieveCalendar } from './backend';
import { createContext } from './context';
import { appRouter } from './trpc';

const id = '5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026';
const calendar = {
  id,
  title: 'Min kalender 🎄',
  doors: [{ number: 1, text: 'Private contents' }],
  createdAt: '2026-10-13T00:00:00Z',
  lastModifiedAt: '2026-10-13T00:00:00Z',
};
const configuration = { baseUrl: 'http://api.test', deadlineMs: 1000 };
const context = () => createContext(new Request('http://frontend.test'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('Given stored wire data, When the generated client retrieves it, Then UUID and UTC dates stay strings', async () => {
  // Given a JSON response from the backend.
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(calendar));

  // When the generated HTTP client reads the response.
  const result = await retrieveCalendar(id, context(), configuration, request);

  // Then wire values and the retrieval URL are preserved.
  expect(result).toEqual(calendar);
  expect(request.mock.calls[0][0]).toBe(`http://api.test/calendars/${id}`);
  expect(new Headers(request.mock.calls[0][1]?.headers).get('traceparent')).toMatch(
    /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/,
  );
});

test.each([400, 401, 403, 404, 409, 500])(
  'Given HTTP %i, When retrieval fails, Then the corresponding error is returned without retry',
  async (status) => {
    // Given a structured backend error.
    const codes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      500: 'INTERNAL_SERVER_ERROR',
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ errors: { id: ['Invalid ID'] } }, { status }));

    // When retrieval is attempted.
    const result = retrieveCalendar(id, context(), configuration, request);

    // Then the error code/field errors survive and no retry is added.
    await expect(result).rejects.toMatchObject({
      code: codes[status as keyof typeof codes],
      cause: { errors: { id: ['Invalid ID'] } },
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test.each([502, 503, 504])(
  'Given transient HTTP %i, When the next attempt succeeds, Then there is one retry within the same call',
  async (status) => {
    // Given a recoverable error followed by stored data.
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(Response.json(calendar));

    // When the BFF owns the retry.
    const result = await retrieveCalendar(id, context(), configuration, request);

    // Then the second attempt returns data with the same total-deadline signal.
    expect(result.title).toBe(calendar.title);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]?.signal).toBe(request.mock.calls[1][1]?.signal);
  },
);

test.each(['network failure', 'HTTP 503 without ProblemDetails'])(
  'Given repeated %s, When retrieval is attempted, Then two attempts end with unavailable',
  async (failure) => {
    // Given repeated failures without a structured API body.
    const request = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (failure === 'network failure') throw new TypeError('Offline');
      return new Response(null, { status: 503 });
    });

    // When the BFF owns the bounded retry.
    const result = retrieveCalendar(id, context(), configuration, request);

    // Then either transport failure reports unavailable after exactly two attempts.
    await expect(result).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(request).toHaveBeenCalledTimes(2);
  },
);

test('Given a deadline shorter than the retry delay, When a transient error occurs, Then the call times out without a second attempt', async () => {
  // Given a 20 ms total deadline and an immediate transient error.
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
  const start = performance.now();

  // When a retry would exceed the total deadline.
  const result = retrieveCalendar(id, context(), { ...configuration, deadlineMs: 20 }, request);

  // Then work ends promptly and does not reset the deadline.
  await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(performance.now() - start).toBeLessThan(500);
});

test('Given a cancelled caller, When retrieval starts, Then cancellation prevents all HTTP work', async () => {
  // Given an already-aborted request.
  const controller = new AbortController();
  controller.abort();
  const ctx = createContext(new Request('http://frontend.test', { signal: controller.signal }));
  const request = vi.fn<typeof fetch>();

  // When retrieval is attempted.
  const result = retrieveCalendar(id, ctx, configuration, request);

  // Then no retry or backend request is started.
  await expect(result).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(request).not.toHaveBeenCalled();
});

test('Given an active HTTP read, When its caller cancels, Then the request aborts without a retry', async () => {
  // Given a read waiting for transport data and an independently cancellable caller.
  const controller = new AbortController();
  const ctx = createContext(new Request('http://frontend.test', { signal: controller.signal }));
  const request = vi.fn<typeof fetch>().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true,
        });
      }),
  );

  // When the active read is cancelled by its caller.
  const result = retrieveCalendar(id, ctx, configuration, request);
  controller.abort();

  // Then cancellation reaches the transport and prevents a second attempt.
  await expect(result).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});

test('Given malformed UUID input, When the tRPC query runs, Then validation rejects it before accessing the API', async () => {
  // Given an invalid calendar ID.
  const request = vi.spyOn(globalThis, 'fetch');
  const caller = appRouter.createCaller(context());

  // When the BFF boundary validates the input.
  const result = caller.calendar.get({ id: 'invalid' });

  // Then invalid input cannot reach persistence.
  await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(request).not.toHaveBeenCalled();
});

test('Given a stored calendar with door contents, When the page query runs, Then only display metadata is returned', async () => {
  // Given a successful backend response with content this page does not use.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(calendar));
  const caller = appRouter.createCaller(context());

  // When the BFF adapts the calendar for SSR and browser use.
  const result = await caller.calendar.get({ id });

  // Then user-authored titles remain untouched and door text stays out of hydration.
  expect(result).toEqual({ id, title: calendar.title, doors: [{ number: 1 }] });
});

test('Given invalid connection configuration, When BFF settings load, Then startup configuration is rejected', () => {
  // Given an unsupported protocol or deadline.
  const env = { BACKEND_API_URL: 'file:///tmp/database', BACKEND_DEADLINE_MS: 'invalid' };

  // When settings are evaluated.
  const configure = () => backendConfiguration(env);

  // Then the invalid settings are reported.
  expect(configure).toThrow(/configuration/);
});
