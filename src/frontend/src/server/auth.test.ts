import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { afterEach, expect, test, vi } from 'vitest';
import { callBackend } from './backend';
import { createContext } from './context';
import { appRouter } from './trpc';

const configuration = { baseUrl: 'http://api.test', deadlineMs: 1000 };
const session = (role = 'superadmin', restricted = false) => ({
  user: {
    id: 'private-id',
    name: 'Ærlig Ørn 🎄',
    username: 'julebruker',
    role,
    enabled: true,
    createdById: 'audit-id',
  },
  expiresAt: '2026-11-01T12:00:00Z',
  mustChangePassword: restricted,
});
const context = (headers?: HeadersInit) =>
  createContext(new Request('http://front.test', { headers }));
afterEach(() => vi.restoreAllMocks());

test('Given browser cookies and identity headers, When authentication reaches the API, Then only the agreed credentials and CSRF header are forwarded', async () => {
  // Given untrusted browser metadata mixed with designated cookie credentials.
  const ctx = context({
    cookie:
      'unrelated=private; advent.auth=ticket; advent.csrf=antiforgery; advent.auth.evil=injected',
    'X-CSRF-TOKEN': 'principal-token',
    'X-User-Role': 'superadmin',
    Authorization: 'Bearer injected',
  });
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

  // When a generated-client write uses the request-local transport.
  await callBackend(ctx, (client, signal) => client.logout(signal), configuration, request);

  // Then no arbitrary cookies or browser identity grants cross the boundary.
  const headers = new Headers(request.mock.calls[0][1]?.headers);
  expect(headers.get('cookie')).toBe('advent.auth=ticket; advent.csrf=antiforgery');
  expect(headers.get('X-CSRF-TOKEN')).toBe('principal-token');
  expect(headers.has('Authorization')).toBe(false);
  expect(headers.has('X-User-Role')).toBe(false);
  expect(request.mock.calls[0][1]?.cache).toBe('no-store');
});

test('Given backend cookies on login, When CSRF refresh follows in the same exchange, Then separate cookie headers and the new principal survive', async () => {
  // Given login issuing an auth cookie and an unrelated cookie.
  const ctx = context({ cookie: 'advent.csrf=old', 'X-CSRF-TOKEN': 'anonymous-token' });
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    'advent.auth=issued; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Sun, 01 Nov 2026 12:00:00 GMT',
  );
  headers.append('Set-Cookie', 'unrelated=secret; Path=/');
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session(), { headers }))
    .mockResolvedValueOnce(
      Response.json(
        { requestToken: 'new-principal-token', headerName: 'X-CSRF-TOKEN' },
        { headers: { 'Set-Cookie': 'advent.csrf=refreshed; Path=/; HttpOnly; SameSite=Lax' } },
      ),
    );

  // When login refreshes CSRF after the backend changed identity.
  const result = await appRouter
    .createCaller(ctx)
    .auth.login({ username: 'julebruker', password: 'A-valid-password!' });

  // Then the fresh cookie is used without decrypting it, headers remain separate and tokens stay out of page data.
  expect(new Headers(request.mock.calls[1][1]?.headers).get('cookie')).toBe(
    'advent.csrf=old; advent.auth=issued',
  );
  expect(ctx.responseHeaders.getSetCookie()).toHaveLength(2);
  expect(ctx.responseHeaders.getSetCookie()[0]).toBe(headers.getSetCookie()[0]);
  expect(result).toEqual({
    user: { name: 'Ærlig Ørn 🎄', username: 'julebruker', role: 'superadmin' },
    expiresAt: session().expiresAt,
    mustChangePassword: false,
  });
  expect(JSON.stringify(result)).not.toContain('token');
});

test.each([400, 401, 403, 429, 503, 'network'])(
  'Given write failure %s, When login is submitted, Then it is never automatically retried',
  async (status) => {
    // Given a failed login transport, including overload and transient unavailability.
    const request = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (status === 'network') throw new TypeError('Offline');
      return Response.json({ errors: { username: ['Invalid'] } }, { status: Number(status) });
    });

    // When the generated login client is called.
    const result = callBackend(
      context(),
      (client, signal) => client.login({ username: 'julebruker', password: 'wrong' }, signal),
      configuration,
      request,
    );

    // Then every failed write has exactly one attempt.
    await expect(result).rejects.toBeDefined();
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test.each([
  ['calendarUser', false],
  ['calendarAdmin', false],
  ['superadmin', true],
])(
  'Given %s with restricted=%s, When the superadmin list is requested, Then the BFF denies before listing',
  async (role, restricted) => {
    // Given an independently backend-validated session without unrestricted superadmin authority.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(session(role, restricted)));

    // When the direct BFF procedure is invoked regardless of UI controls.
    const result = appRouter.createCaller(context()).accounts.list({ offset: 0, limit: 50 });

    // Then no account list call is made.
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test('Given a superadmin, When later account pages are requested, Then bounded pagination and minimal public fields are preserved', async () => {
  // Given an unrestricted backend session and account metadata with extra audit fields.
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(Response.json({ users: [session().user] }));

  // When an authorized caller requests the next page.
  const result = await appRouter.createCaller(context()).accounts.list({ offset: 50, limit: 50 });

  // Then only names, usernames and roles leave the BFF and the requested offset reaches the backend.
  expect(String(request.mock.calls[1][0])).toContain('/users?offset=50&limit=50');
  expect(result).toEqual({
    users: [{ name: 'Ærlig Ørn 🎄', username: 'julebruker', role: 'superadmin' }],
    hasMore: false,
  });
});

test.each([
  { offset: -1, limit: 50 },
  { offset: 0, limit: 101 },
])(
  'Given invalid pagination %j, When a list is requested, Then validation prevents backend access',
  async (input) => {
    // Given pagination outside the authored backend bounds.
    const request = vi.spyOn(globalThis, 'fetch');

    // When tRPC validates its own boundary.
    const result = appRouter.createCaller(context()).accounts.list(input);

    // Then invalid paging cannot trigger even a session lookup.
    await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  },
);

test('Given concurrent users, When their session requests interleave, Then request credentials and output remain isolated', async () => {
  // Given independent incoming cookies and a backend reflecting its validated principal.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const cookie = new Headers(init?.headers).get('cookie');
    await Promise.resolve();
    return Response.json({ ...session(), user: { ...session().user, name: cookie } });
  });

  // When both request-local callers run concurrently.
  const results = await Promise.all(
    ['one', 'two'].map((user) =>
      appRouter.createCaller(context({ cookie: `advent.auth=${user}` })).auth.session(),
    ),
  );

  // Then no mutable credential state crosses the request boundary.
  expect(results.map((result) => result.user.name)).toEqual(['advent.auth=one', 'advent.auth=two']);
});

test('Given anonymous access and backend cookie deletion, When a protected call fails, Then unauthorized and deletion remain available to the response adapter', async () => {
  // Given backend denial including deletion of a revoked authentication cookie.
  const ctx = context({ cookie: 'advent.auth=revoked' });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(
      {},
      {
        status: 401,
        headers: {
          'Set-Cookie': 'advent.auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
        },
      },
    ),
  );

  // When the tRPC fetch adapter processes a protected request.
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request('http://front.test/api/trpc/auth.session'),
    router: appRouter,
    createContext: () => ctx,
  });

  // Then authorization fails and cookie deletion is preserved even on errors.
  expect(response.status).toBe(401);
  expect(ctx.responseHeaders.getSetCookie()).toHaveLength(1);
  expect(ctx.cookies.has('advent.auth')).toBe(false);
});
