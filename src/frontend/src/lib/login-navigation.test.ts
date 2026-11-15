import { QueryClient } from '@tanstack/react-query';
import { TRPCError } from '@trpc/server';
import { expect, test, vi } from 'vitest';
import type { RouterContext } from '../router';
import { completeLoginNavigation } from './login-navigation';

const id = '00000000-0000-4000-8000-000000000024';
const session = {
  user: { role: 'calendarUser' },
  mustChangePassword: false,
  cacheScope: 'current-session',
};
const calendar = { id, title: 'Empty calendar from another year', year: 2025 };

function fixture(currentSession = session) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const inspect = vi.fn(async () => currentSession);
  const read = vi.fn(async () => ({ calendars: [calendar], totalCount: 1 }));
  const options = vi.fn((input: { offset: number; limit: number; scope: string }) => ({
    queryKey: ['recipient', 'list', input],
    queryFn: read,
  }));
  const context = {
    queryClient,
    administration: { sessionScope: currentSession.cacheScope },
    auth: { session: inspect },
    trpc: { recipient: { list: { queryOptions: options } } },
  } as unknown as RouterContext;
  return { context, queryClient, inspect, read, options };
}

test.each(['calendarUser', 'calendarAdmin', 'superadmin'])(
  'Given a restricted %s, When login navigation validates the session, Then password setup precedes any assignment lookup',
  async (role) => {
    // Given a freshly restricted session with protected data from its previous state.
    const { context, queryClient, options } = fixture({
      ...session,
      user: { role },
      mustChangePassword: true,
    });
    queryClient.setQueryData(['protected-content'], 'private content');

    // When the post-login entry validates the live session.
    const navigation = completeLoginNavigation(context);

    // Then role privileges cannot bypass mandatory setup or retain protected data.
    await expect(navigation).rejects.toMatchObject({ options: { to: '/change-password' } });
    expect(options).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  },
);

test.each(['calendarAdmin', 'superadmin'])(
  'Given an unrestricted %s, When login navigation completes, Then My page opens without a recipient lookup',
  async (role) => {
    // Given a backend-validated administrator session.
    const { context, inspect, options } = fixture({ ...session, user: { role } });

    // When the post-login entry resolves its destination.
    const navigation = completeLoginNavigation(context);

    // Then the administrator keeps the existing personal-page destination.
    await expect(navigation).rejects.toMatchObject({ options: { to: '/my-page' } });
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(options).not.toHaveBeenCalled();
  },
);

test('Given one current assignment, When login navigation resolves, Then its existing recipient route opens without year or content filtering', async () => {
  // Given a single assigned calendar whose metadata does not include door content.
  const { context, inspect, options } = fixture();

  // When the post-login entry requests a bounded page under the validated scope.
  const navigation = completeLoginNavigation(context);

  // Then the backend total selects the existing detail route with no invented filters.
  await expect(navigation).rejects.toMatchObject({
    options: { to: '/my-calendars/$id', params: { id } },
  });
  expect(inspect).toHaveBeenCalledTimes(1);
  expect(options).toHaveBeenCalledExactlyOnceWith({
    offset: 0,
    limit: 2,
    scope: session.cacheScope,
  });
});

test.each([
  { count: 0, rows: 0 },
  { count: 2, rows: 1 },
  { count: 13, rows: 2 },
  { count: 1, rows: 0 },
  { count: 1, rows: 2 },
])(
  'Given an assignment total of $count and $rows returned rows, When login navigation resolves, Then My page remains the safe chooser',
  async ({ count, rows }) => {
    // Given zero, multiple or inconsistent assignments, including more than one chooser page.
    const { context, read } = fixture();
    read.mockResolvedValue({ calendars: Array(rows).fill(calendar), totalCount: count });

    // When routing inspects the authorized total rather than just first-page length.
    const navigation = completeLoginNavigation(context);

    // Then only a consistent exact-one result can bypass the chooser or empty state.
    await expect(navigation).rejects.toMatchObject({ options: { to: '/my-page' } });
    expect(read).toHaveBeenCalledTimes(1);
  },
);

test('Given an old session scope, When the login entry resolves a new session, Then old protected data is cleared and lookup uses the fresh scope', async () => {
  // Given cached content and routing state from another authenticated session.
  const { context, queryClient, options } = fixture();
  context.administration.sessionScope = 'previous-session';
  queryClient.setQueryData(['previous-protected-content'], 'private content');

  // When the entry independently validates the current cookie.
  const navigation = completeLoginNavigation(context);

  // Then the destination uses only the fresh session's authorized assignments.
  await expect(navigation).rejects.toMatchObject({ options: { to: '/my-calendars/$id' } });
  expect(queryClient.getQueryData(['previous-protected-content'])).toBeUndefined();
  expect(context.administration.sessionScope).toBe(session.cacheScope);
  expect(options).toHaveBeenCalledWith({ offset: 0, limit: 2, scope: session.cacheScope });
});

test('Given cached assignments for the same session, When login navigation runs again, Then a fresh list determines the current destination', async () => {
  // Given a previously cached sole assignment that has since gained another calendar.
  const { context, queryClient, options, read } = fixture();
  const input = { offset: 0, limit: 2, scope: session.cacheScope };
  queryClient.setQueryData(options(input).queryKey, { calendars: [calendar], totalCount: 1 });
  read.mockResolvedValue({ calendars: [calendar, calendar], totalCount: 2 });

  // When another post-login transition resolves against current assignments.
  const navigation = completeLoginNavigation(context);

  // Then stale metadata cannot select an outdated direct destination.
  await expect(navigation).rejects.toMatchObject({ options: { to: '/my-page' } });
  expect(read).toHaveBeenCalledTimes(1);
});

test('Given a revoked session, When login navigation validates it, Then login opens before any assignment read and protected data is cleared', async () => {
  // Given an invalid cookie and cached data from its former authority.
  const { context, queryClient, inspect, options } = fixture();
  queryClient.setQueryData(['protected-content'], 'private content');
  inspect.mockRejectedValue(new TRPCError({ code: 'UNAUTHORIZED' }));

  // When the entry checks the backend session independently of the login response.
  const navigation = completeLoginNavigation(context);

  // Then an invalid session cannot route using cached authority.
  await expect(navigation).rejects.toMatchObject({ options: { to: '/login' } });
  expect(options).not.toHaveBeenCalled();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});

test('Given unavailable session persistence, When login navigation validates it, Then the route receives the protected error without an assignment read', async () => {
  // Given a backend that cannot establish current session authority.
  const { context, inspect, options } = fixture();
  const failure = new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
  inspect.mockRejectedValue(failure);

  // When the entry tries to validate the live session.
  const navigation = completeLoginNavigation(context);

  // Then the route error UI can report the outage without choosing an authenticated destination.
  await expect(navigation).rejects.toBe(failure);
  expect(options).not.toHaveBeenCalled();
});

test.each([
  { code: 'UNAUTHORIZED' as const, destination: '/login' },
  { code: 'FORBIDDEN' as const, destination: '/my-page' },
  { code: 'SERVICE_UNAVAILABLE' as const, destination: '/my-page' },
  { code: 'TIMEOUT' as const, destination: '/my-page' },
])(
  'Given assignment lookup fails with $code, When login navigation resolves, Then $destination handles the current state without cached content',
  async ({ code, destination }) => {
    // Given a session valid at inspection and a later denied or unavailable list request.
    const { context, queryClient, read } = fixture();
    queryClient.setQueryData(['protected-content'], 'private content');
    read.mockRejectedValue(new TRPCError({ code }));

    // When independent recipient authorization rejects or cannot resolve assignments.
    const navigation = completeLoginNavigation(context);

    // Then the next protected route revalidates authority and offers its existing recovery UI.
    await expect(navigation).rejects.toMatchObject({ options: { to: destination } });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(read).toHaveBeenCalledTimes(1);
  },
);
