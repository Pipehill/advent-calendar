import { afterEach, expect, test, vi } from 'vitest';
import { createContext } from './context';
import { appRouter } from './trpc';

const id = '00000000-0000-4000-8000-000000000017';
function caller(ticket = 'superadmin') {
  const request = new Request('http://frontend.test', {
    headers: { Cookie: `advent.auth=${ticket}` },
  });
  return appRouter.createCaller(createContext(request));
}
const session = (role = 'superadmin', mustChangePassword = false) => ({
  user: { role },
  mustChangePassword,
});
afterEach(() => vi.restoreAllMocks());

test.each(['calendarAdmin', 'calendarUser', 'restricted'])(
  'Given %s without system read authority, When direct BFF reads are crafted, Then only session inspection occurs',
  async (role) => {
    // Given a backend-validated session without unrestricted superadmin authority.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json(session(role === 'restricted' ? 'superadmin' : role, role === 'restricted')),
      );

    // When both privileged readers bypass frontend guards.
    const results = await Promise.allSettled([
      caller().calendar.systemList({ offset: 0, limit: 12 }),
      caller().calendar.systemPreview({ id }),
    ]);

    // Then no backend calendar read follows either denial.
    for (const result of results)
      expect(result).toMatchObject({ status: 'rejected', reason: { code: 'FORBIDDEN' } });
    expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/auth/session',
      '/auth/session',
    ]);
  },
);

test.each([401, 403, 404])(
  'Given a backend %s after superadmin session inspection, When preview is requested, Then its error remains authoritative',
  async (status) => {
    // Given a session accepted at inspection but a later denial at the actual read.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(session()))
      .mockResolvedValueOnce(Response.json({}, { status }));

    // When a current-role change or resource failure occurs between calls.
    const result = caller().calendar.systemPreview({ id });

    // Then the backend error is preserved without owner fallback or retry.
    await expect(result).rejects.toMatchObject({
      code: { 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' }[status],
    });
    expect(request).toHaveBeenCalledTimes(2);
  },
);

test.each(['systemList', 'systemPreview'] as const)(
  'Given an anonymous or revoked session, When %s is requested, Then no calendar request is sent',
  async (operation) => {
    // Given the backend rejecting the session before any calendar lookup.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({}, { status: 401 }));

    // When calling the dedicated system operation directly.
    const result =
      operation === 'systemList'
        ? caller().calendar.systemList({ offset: 0, limit: 12 })
        : caller().calendar.systemPreview({ id });

    // Then authorization fails closed without sending another request.
    await expect(result).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test('Given simultaneous superadmin and owner requests, When system listing and owner preview run, Then credentials endpoints and response data remain isolated', async () => {
  // Given a transport serving distinct data and roles from each opaque cookie.
  const calls: { path: string; cookie: string | null; cache: RequestCache | undefined }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const cookie = new Headers(init?.headers).get('Cookie');
    calls.push({ path, cookie, cache: init?.cache });
    if (path === '/auth/session')
      return Response.json(
        session(cookie === 'advent.auth=owner' ? 'calendarAdmin' : 'superadmin'),
      );
    if (path === '/administration/calendars')
      return Response.json({
        calendars: [
          {
            id,
            ownerName: 'Ørn',
            ownerUsername: 'owner',
            recipientName: 'Ørn',
            recipientUsername: 'recipient',
          },
        ],
        totalCount: 1,
      });
    return Response.json({ id, title: 'Owner content' });
  });

  // When two request contexts are processed concurrently.
  const [system, owner] = await Promise.all([
    caller().calendar.systemList({ offset: 12, limit: 12 }),
    caller('owner').calendar.preview({ id }),
  ]);

  // Then each operation uses only its own backend route and credential with no-store.
  expect(system.calendars[0]).toMatchObject({ ownerName: 'Ørn', recipientUsername: 'recipient' });
  expect(owner.title).toBe('Owner content');
  expect(calls.find((call) => call.path === '/administration/calendars')?.cookie).toBe(
    'advent.auth=superadmin',
  );
  expect(calls.find((call) => call.path === `/calendars/${id}`)?.cookie).toBe('advent.auth=owner');
  expect(calls.every((call) => call.cache === 'no-store')).toBe(true);
});

test('Given a superadmin full preview, When the BFF reader succeeds, Then it forwards only GET to the dedicated endpoint', async () => {
  // Given an independently validated superadmin and full future-door data.
  const calendar = {
    id,
    doors: [{ number: 24, title: 'Jul 🎄', text: 'Future content' }],
    doorOrder: [24, 1],
  };
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(Response.json(calendar));

  // When reading without invoking an owner or recipient action.
  const result = await caller().calendar.systemPreview({ id });

  // Then the result preserves content and the transport performs no mutations.
  expect(result).toEqual(calendar);
  expect(String(request.mock.calls[1][0])).toContain(`/administration/calendars/${id}/preview`);
  expect(request.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
});

test('Given forged role mode and malformed paging inputs, When system queries are invoked, Then strict Zod rejects them before session lookup', async () => {
  // Given a request spy and payloads that attempt to choose authority or exceed bounds.
  const request = vi.spyOn(globalThis, 'fetch');
  const invalidPages = [
    { offset: -1, limit: 12 },
    { offset: 0, limit: 101 },
    { offset: 0, limit: 1.5 },
    { offset: 0, limit: 12, role: 'superadmin' },
  ];

  // When bypassing generated TypeScript types with hostile JSON.
  const results = await Promise.allSettled([
    ...invalidPages.map((input) => caller().calendar.systemList(input)),
    caller().calendar.systemPreview({ id: 'bad' }),
    caller().calendar.systemPreview({ id, mode: 'system-preview' } as { id: string }),
  ]);

  // Then the BFF rejects every payload without any backend access.
  for (const result of results)
    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'BAD_REQUEST' } });
  expect(request).not.toHaveBeenCalled();
});
