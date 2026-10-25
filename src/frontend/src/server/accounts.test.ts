import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { afterEach, expect, test, vi } from 'vitest';
import { createContext } from './context';
import { appRouter } from './trpc';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const ownerId = '00000000-0000-4000-8000-000000000003';
const password = 'Temporary!Ærlig-unique';
const user = (
  id = targetId,
  role = 'calendarUser',
  responsibleAdministratorId: string | null = actorId,
) => ({
  id,
  role,
  name: `Name ${id}`,
  username: `user-${id}`,
  enabled: true,
  responsibleAdministratorId,
  createdById: 'audit-secret',
  passwordHash: 'credential-secret',
});
const session = (role = 'superadmin', restricted = false) => ({
  user: user(actorId, role),
  mustChangePassword: restricted,
  expiresAt: '2026-11-01T12:00:00Z',
});
const context = () =>
  createContext(
    new Request('http://front.test', {
      headers: { cookie: 'advent.auth=actor', 'X-CSRF-TOKEN': 'actor-token' },
    }),
  );
afterEach(() => vi.restoreAllMocks());

function maintenance(caller: ReturnType<typeof appRouter.createCaller>, operation: string) {
  if (operation === 'reset') return caller.accounts.resetPassword({ id: targetId, password });
  if (operation === 'status') return caller.accounts.changeStatus({ id: targetId, enabled: false });
  return caller.accounts.changeRole({
    id: targetId,
    role: 'calendarAdmin',
    temporaryPassword: password,
  });
}

test.each(['create', 'reset', 'status', 'role'])(
  'Given an anonymous caller, When %s administration is invoked directly, Then session validation prevents every write',
  async (operation) => {
    // Given a backend rejecting the missing authentication cookie.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({}, { status: 401 }));
    const caller = appRouter.createCaller(context());

    // When the browser bypasses protected navigation.
    const result =
      operation === 'create'
        ? caller.accounts.create({
            name: 'Name',
            username: 'new-user',
            password,
            role: 'calendarAdmin',
          })
        : maintenance(caller, operation);

    // Then even a well-formed mutation cannot cross the BFF session boundary.
    await expect(result).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toContain('/auth/session');
  },
);

test.each(['reset', 'status', 'role'])(
  'Given a superadmin target, When %s maintenance is requested by a superadmin, Then the BFF denies manual-only maintenance',
  async (operation) => {
    // Given a target that must remain view-only even for another superadmin.
    const request = backend('superadmin', [user(targetId, 'superadmin')]);

    // When a direct BFF call bypasses the omitted row controls.
    const result = maintenance(appRouter.createCaller(context()), operation);

    // Then no unsafe request reaches the backend.
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(request.mock.calls.filter((call) => call[1]?.method !== 'GET')).toHaveLength(0);
  },
);

test('Given an administrator target, When a user-length reset password is submitted, Then the BFF enforces the target role policy', async () => {
  // Given a currently administrative target and a password valid only for ordinary users.
  const request = backend('superadmin', [user(targetId, 'calendarAdmin')]);

  // When reset bypasses the role-aware form.
  const result = appRouter
    .createCaller(context())
    .accounts.resetPassword({ id: targetId, password: 'Short!Aa' });

  // Then validation rejects it before credential replacement.
  await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(request.mock.calls.filter((call) => call[1]?.method !== 'GET')).toHaveLength(0);
});

test.each(['missing', 'replacement', 'stale-owner'])(
  'Given demotion with %s responsibility, When a superadmin submits directly, Then the BFF preserves the fixed association',
  async (kind) => {
    // Given first demotion or a promoted target whose original owner no longer holds the role.
    const target = user(targetId, 'calendarAdmin', kind === 'missing' ? null : ownerId);
    const request = backend('superadmin', [
      target,
      user(ownerId, kind === 'stale-owner' ? 'calendarUser' : 'calendarAdmin'),
    ]);

    // When a missing assignment, replacement or stale original owner reaches the boundary.
    const result = appRouter.createCaller(context()).accounts.changeRole({
      id: targetId,
      role: 'calendarUser',
      ...(kind === 'replacement' ? { responsibleAdministratorId: actorId } : {}),
    });

    // Then the BFF rejects the operation and never suggests or commits reassignment.
    await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(request.mock.calls.filter((call) => call[1]?.method !== 'GET')).toHaveLength(0);
  },
);

function backend(role = 'superadmin', users = [user()], restricted = false) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth/session') return Response.json(session(role, restricted));
    if (init?.method === 'GET') return Response.json({ users });
    return path === '/users'
      ? Response.json(user(), { status: 201 })
      : new Response(null, { status: 204 });
  });
}

test('Given an unrestricted calendaradmin, When its list is requested, Then backend SQL scope is used and audit data stays private', async () => {
  // Given the backend's authorized ordinary-user result.
  const request = backend('calendarAdmin');

  // When a direct BFF caller requests that list.
  const result = await appRouter.createCaller(context()).accounts.list({ offset: 0, limit: 50 });

  // Then the scoped endpoint supplies metadata without audit or credential fields.
  expect(request).toHaveBeenCalledTimes(2);
  expect(String(request.mock.calls[1][0])).toContain('/users?offset=0&limit=50');
  expect(result.users[0]).toEqual({
    id: targetId,
    role: 'calendarUser',
    name: user().name,
    username: user().username,
    enabled: true,
    responsibleAdministratorId: actorId,
  });
  expect(JSON.stringify(result)).not.toMatch(/audit-secret|credential-secret/);
});

test.each(['calendarUser', 'restricted'])(
  'Given %s, When all administration mutations are called, Then the BFF denies before writes',
  async (kind) => {
    // Given a backend-validated session without unrestricted administrator authority.
    const request = backend(kind === 'restricted' ? 'superadmin' : kind, [], kind === 'restricted');
    const caller = appRouter.createCaller(context());

    // When callers bypass UI navigation and invoke every operation.
    const results = await Promise.allSettled([
      caller.accounts.create({
        name: 'Name',
        username: 'new-user',
        password,
        role: 'calendarAdmin',
      }),
      caller.accounts.resetPassword({ id: targetId, password }),
      caller.accounts.changeStatus({ id: targetId, enabled: false }),
      caller.accounts.changeRole({
        id: targetId,
        role: 'calendarAdmin',
        temporaryPassword: password,
      }),
      caller.auth.reauthenticate({ password }),
    ]);

    // Then every operation is forbidden with no unsafe backend request.
    expect(
      results.every((result) => result.status === 'rejected' && result.reason.code === 'FORBIDDEN'),
    ).toBe(true);
    expect(request.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  },
);

test('Given a calendaradmin creator, When an ordinary account is created, Then responsibility is omitted and the acting session is retained', async () => {
  // Given an authorized creator and no browser-supplied identity fields.
  const request = backend('calendarAdmin');

  // When creation passes the authenticated session guard.
  const result = await appRouter.createCaller(context()).accounts.create({
    name: '  Ærlig Ørn  ',
    username: 'new-user',
    password,
    role: 'calendarUser',
  });

  // Then only the required body reaches POST /users and login is never called.
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
    name: 'Ærlig Ørn',
    username: 'new-user',
    password,
    role: 'calendarUser',
  });
  expect(result.id).toBe(targetId);
  expect(request.mock.calls.map((call) => new URL(String(call[0])).pathname)).toEqual([
    '/auth/session',
    '/users',
  ]);
  expect(JSON.stringify(result)).not.toContain(password);
});

test.each(['role', 'responsibility', 'status', 'changeRole'])(
  'Given a calendaradmin and forged %s authority, When a direct mutation is submitted, Then the BFF rejects it',
  async (kind) => {
    // Given an independently validated calendaradmin session.
    const request = backend('calendarAdmin');
    const caller = appRouter.createCaller(context());

    // When higher authority or caller-selected responsibility is forged.
    const result =
      kind === 'status'
        ? caller.accounts.changeStatus({ id: targetId, enabled: false })
        : kind === 'changeRole'
          ? caller.accounts.changeRole({
              id: targetId,
              role: 'calendarAdmin',
              temporaryPassword: password,
            })
          : caller.accounts.create({
              name: 'Name',
              username: 'new-user',
              password,
              role: kind === 'role' ? 'calendarAdmin' : 'calendarUser',
              ...(kind === 'responsibility' ? { responsibleAdministratorId: ownerId } : {}),
            });

    // Then no mutation reaches the backend.
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(request.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  },
);

test.each([
  user(targetId, 'superadmin'),
  user(targetId, 'calendarAdmin'),
  user(targetId, 'calendarUser', ownerId),
])(
  'Given a calendaradmin and unauthorized target %j, When reset is attempted, Then the BFF denies the target',
  async (target) => {
    // Given a stale/forged target visible to the simulated transport.
    const request = backend('calendarAdmin', [target]);

    // When a direct reset request supplies that target ID.
    const result = appRouter
      .createCaller(context())
      .accounts.resetPassword({ id: targetId, password });

    // Then role and ownership are independently checked before password replacement.
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(request.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  },
);

test('Given a superadmin and a responsible administrator beyond page one, When selection is loaded and submitted, Then all pages are searched and revalidated', async () => {
  // Given one full page without administrators and an eligible administrator later.
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/auth/session') return Response.json(session());
    if (init?.method === 'POST') return Response.json(user(), { status: 201 });
    return Response.json({
      users:
        parsed.searchParams.get('offset') === '0'
          ? Array.from({ length: 100 }, () => user())
          : [user(ownerId, 'calendarAdmin')],
    });
  });
  const caller = appRouter.createCaller(context());

  // When responsible options are loaded and an ordinary account is created.
  const options = await caller.accounts.administrators();
  await caller.accounts.create({
    name: 'Name',
    username: 'new-user',
    password,
    role: 'calendarUser',
    responsibleAdministratorId: ownerId,
  });

  // Then the later administrator is selectable and checked again at submission.
  expect(options.map((option) => option.id)).toEqual([ownerId]);
  expect(request.mock.calls.filter((call) => String(call[0]).includes('offset=100'))).toHaveLength(
    2,
  );
  expect(JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body)).responsibleAdministratorId).toBe(
    ownerId,
  );
});

test('Given no eligible responsible administrator, When ordinary-account creation is submitted, Then the BFF rejects missing or stale selection', async () => {
  // Given a list containing only ordinary accounts.
  const request = backend();
  const caller = appRouter.createCaller(context());

  // When missing and no-longer-eligible IDs are supplied.
  const results = await Promise.allSettled(
    [undefined, targetId].map((id) =>
      caller.accounts.create({
        name: 'Name',
        username: 'new-user',
        password,
        role: 'calendarUser',
        responsibleAdministratorId: id,
      }),
    ),
  );

  // Then both inputs fail without persisting an unassigned account.
  expect(
    results.every((result) => result.status === 'rejected' && result.reason.code === 'BAD_REQUEST'),
  ).toBe(true);
  expect(request.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
});

test('Given a newly created account outside the displayed page, When the authorized list focuses its ID, Then the returned page contains the account', async () => {
  // Given deterministic backend ordering with the new account at position 105.
  const users = Array.from({ length: 106 }, (_, index) =>
    user(
      index === 105 ? targetId : `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
    ),
  );
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/auth/session') return Response.json(session());
    const offset = Number(parsed.searchParams.get('offset'));
    const limit = Number(parsed.searchParams.get('limit'));
    return Response.json({ users: users.slice(offset, offset + limit) });
  });

  // When a current first-page request focuses the successfully returned ID.
  const result = await appRouter
    .createCaller(context())
    .accounts.list({ offset: 0, limit: 50, focusId: targetId });

  // Then the BFF finds its real position and retrieves that authorized page.
  expect(result.offset).toBe(100);
  expect(result.users.some((account) => account.id === targetId)).toBe(true);
});

test.each(['reset', 'status', 'promotion', 'demotion'])(
  'Given authorized %s maintenance, When a mutation succeeds, Then only the contract body is forwarded',
  async (action) => {
    // Given an authorized target and a valid responsible administrator.
    const request = backend('superadmin', [
      user(targetId, action === 'demotion' ? 'calendarAdmin' : 'calendarUser'),
      user(actorId, 'calendarAdmin'),
    ]);
    const caller = appRouter.createCaller(context());

    // When the requested maintenance operation runs once.
    if (action === 'reset') await caller.accounts.resetPassword({ id: targetId, password });
    else if (action === 'status')
      await caller.accounts.changeStatus({ id: targetId, enabled: false });
    else
      await caller.accounts.changeRole({
        id: targetId,
        role: action === 'promotion' ? 'calendarAdmin' : 'calendarUser',
        ...(action === 'promotion' ? { temporaryPassword: password } : {}),
      });

    // Then no target ID or unnecessary secret/responsibility enters the JSON body.
    const writes = request.mock.calls.filter((call) => call[1]?.method !== 'GET');
    expect(writes).toHaveLength(1);
    const expected =
      action === 'reset'
        ? { password }
        : action === 'status'
          ? { enabled: false }
          : action === 'promotion'
            ? { role: 'calendarAdmin', temporaryPassword: password }
            : { role: 'calendarUser' };
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual(expected);
  },
);

test.each([true, false])(
  'Given forbidden response verificationRequired=%s, When the BFF translates it, Then recovery is signalled only for explicit verification expiry',
  async (verificationRequired) => {
    // Given a valid administrator followed by a sensitive-operation denial.
    const request = backend();
    request.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return Response.json(session());
      if (init?.method === 'GET') return Response.json({ users: [user()] });
      return Response.json({ verificationRequired }, { status: 403 });
    });

    // When a real tRPC response is serialized, including its error formatter.
    const response = await fetchRequestHandler({
      endpoint: '/api/trpc',
      router: appRouter,
      createContext: context,
      req: new Request('http://front.test/api/trpc/accounts.resetPassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId, password }),
      }),
    });
    const result = await response.json();

    // Then forbidden authorization is not confused with missing recent verification.
    expect(response.status).toBe(403);
    expect(result.error.data.verificationRequired).toBe(verificationRequired);
    expect(request.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  },
);
