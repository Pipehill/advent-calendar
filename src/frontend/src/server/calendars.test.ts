import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { afterEach, expect, test, vi } from 'vitest';
import { createContext } from './context';
import { appRouter } from './trpc';

const id = '00000000-0000-4000-8000-000000000001';
const recipient = '00000000-0000-4000-8000-000000000002';
const session = (role = 'calendarAdmin', restricted = false) => ({
  user: { role },
  mustChangePassword: restricted,
});
const context = () =>
  createContext(
    new Request('http://frontend.test', {
      headers: { cookie: 'advent.auth=owner', 'X-CSRF-TOKEN': 'owner-token' },
    }),
  );
afterEach(() => vi.restoreAllMocks());

test('Given an owner selecting another recipient, When the change is saved, Then only the recipient ID is written and refreshed display metadata is returned', async () => {
  // Given a validated owner and the updated calendar returned by the backend.
  const calendar = {
    id,
    recipientId: recipient,
    recipientName: 'Ærlig Ørn',
    recipientUsername: 'orn',
  };
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(Response.json(calendar));

  // When the BFF forwards an explicit recipient mutation.
  const result = await appRouter.createCaller(context()).calendar.saveRecipient({
    id,
    recipientId: recipient,
  });

  // Then the generated contract preserves the field and uses the dedicated write endpoint.
  expect(result).toEqual(calendar);
  expect(String(request.mock.calls[1][0])).toContain(`/calendars/${id}/recipient`);
  expect(request.mock.calls[1][1]?.method).toBe('PUT');
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ recipientId: recipient });
});

function operation(caller: ReturnType<typeof appRouter.createCaller>, name: string) {
  if (name === 'create')
    return caller.calendar.create({
      title: 'Calendar',
      recipientId: recipient,
      background: 'aurora',
    });
  if (name === 'door')
    return caller.calendar.saveDoor({ id, number: 24, title: 'Gift', text: 'Plain\ntext' });
  if (name === 'layout') return caller.calendar.saveLayout({ id, layout: 'random' });
  if (name === 'recipient') return caller.calendar.saveRecipient({ id, recipientId: recipient });
  if (name === 'preview') return caller.calendar.preview({ id });
  if (name === 'recipients') return caller.calendar.recipients();
  if (name === 'list') return caller.calendar.list({ offset: 0, limit: 12 });
  return caller.calendar.get({ id });
}

test.each(['create', 'door', 'layout', 'recipient', 'preview', 'get', 'recipients', 'list'])(
  'Given an anonymous caller, When calendar %s is invoked, Then no privileged backend operation follows session rejection',
  async (name) => {
    // Given a backend rejecting the absent or revoked session.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({}, { status: 401 }));

    // When a caller bypasses frontend route guards.
    const result = operation(appRouter.createCaller(context()), name);

    // Then the BFF fails closed before any calendar operation.
    await expect(result).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test.each(['superadmin', 'calendarUser', 'restricted'])(
  'Given %s authority, When every calendar operation is called, Then the BFF denies reads and writes',
  async (role) => {
    // Given an authenticated role without owner administration authority.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => Response.json(session(role, role === 'restricted')));
    const caller = appRouter.createCaller(context());

    // When all direct BFF operations are attempted.
    const results = await Promise.allSettled(
      ['create', 'door', 'layout', 'recipient', 'preview', 'get', 'recipients', 'list'].map(
        (name) => operation(caller, name),
      ),
    );

    // Then only session inspection occurs and every operation fails forbidden.
    expect(
      results.every((result) => result.status === 'rejected' && result.reason.code === 'FORBIDDEN'),
    ).toBe(true);
    expect(request.mock.calls.every(([url]) => String(url).endsWith('/auth/session'))).toBe(true);
  },
);

test('Given more than one page of assigned users, When recipients are loaded, Then later eligible users appear without credential metadata', async () => {
  // Given a full first backend page and a distinctive recipient on the second.
  const first = Array.from({ length: 100 }, (_, index) => ({
    id: String(index),
    name: 'Assigned',
    username: `user${index}`,
    role: 'calendarUser',
  }));
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(Response.json({ users: first, totalCount: 101 }))
    .mockResolvedValueOnce(
      Response.json({
        users: [
          {
            id: recipient,
            name: 'Later recipient',
            username: 'later',
            role: 'calendarUser',
            passwordHash: 'secret',
            responsibleAdministratorId: id,
          },
        ],
        totalCount: 101,
      }),
    );

  // When recipient selection scans backend-scoped pages within one deadline.
  const recipients = await appRouter.createCaller(context()).calendar.recipients();

  // Then a recipient beyond page one is selectable and only display metadata crosses the BFF.
  expect(recipients).toHaveLength(101);
  expect(recipients[100]).toEqual({ id: recipient, name: 'Later recipient', username: 'later' });
  expect(String(request.mock.calls[2][0])).toContain('offset=100');
});

test.each(['create', 'door', 'layout', 'recipient'])(
  'Given a backend failure, When calendar %s writes, Then the BFF sends one write and preserves its structured error',
  async (name) => {
    // Given a validated owner followed by an unavailable backend mutation.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(session()))
      .mockResolvedValueOnce(Response.json({ errors: { title: ['Invalid'] } }, { status: 503 }));

    // When an authorized mutation is attempted.
    const result = operation(appRouter.createCaller(context()), name);

    // Then mutations are never retried and credentials/CSRF use the shared transport.
    await expect(result).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      cause: { errors: { title: ['Invalid'] } },
    });
    expect(request).toHaveBeenCalledTimes(2);
    const headers = new Headers(request.mock.calls[1][1]?.headers);
    expect(headers.get('X-CSRF-TOKEN')).toBe('owner-token');
    expect(headers.get('Cookie')).toBe('advent.auth=owner');
    expect(request.mock.calls[1][1]?.cache).toBe('no-store');
  },
);

test('Given a field validation failure, When the calendar mutation crosses HTTP tRPC, Then localized forms receive structured field errors', async () => {
  // Given an authorized session and a backend recipient field error.
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(
      Response.json({ errors: { recipientId: ['Invalid selection'] } }, { status: 400 }),
    );
  const request = new Request('http://frontend.test/api/trpc/calendar.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'token' },
    body: JSON.stringify({ title: 'Name', recipientId: recipient, background: 'woodland' }),
  });

  // When the real tRPC HTTP adapter formats the failed request.
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => createContext(request),
  });
  const body = await response.json();

  // Then field names survive without exposing backend prose as interface labels.
  expect(response.status).toBe(400);
  expect(body.error.data.fieldErrors).toEqual({ recipientId: ['Invalid selection'] });
});
