import { QueryClient } from '@tanstack/react-query';
import { TRPCError } from '@trpc/server';
import { expect, test, vi } from 'vitest';
import type { RouterContext } from '../router';
import { requireCalendarSession, requireSession } from './auth-navigation';
import { loadCalendarPage } from './calendar-navigation';

const session = {
  user: { name: 'Owner', username: 'owner', role: 'calendarAdmin' },
  expiresAt: '2026-11-01T20:00:00Z',
  mustChangePassword: false,
  cacheScope: 'current-validated-session-scope',
};
const scope = session.cacheScope;

test.each(['different-user', 'different-session'])(
  'Given protected data from a %s, When navigation validates the current session, Then the previous query cache is cleared',
  async (previous) => {
    // Given a query cache populated under another principal or session expiry.
    const queryClient = new QueryClient();
    queryClient.setQueryData(['calendar', 'private'], 'previous-owner-secret');
    queryClient.setQueryData(['calendar', 'systemList'], 'previous-system-rows');
    queryClient.setQueryData(['calendar', 'systemPreview'], 'previous-future-content');
    const context = {
      queryClient,
      administration: { sessionScope: previous },
      auth: { session: async () => session },
    } as unknown as RouterContext;

    // When a protected navigation inspects the current backend session.
    const result = await requireSession(context);

    // Then no stale protected value remains and the new scope is recorded.
    expect(result).toEqual(session);
    expect(queryClient.getQueryData(['calendar', 'private'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(context.administration.sessionScope).toBe(scope);
  },
);

test('Given an unchanged validated session, When another protected navigation runs, Then its authorized query scope remains available', async () => {
  // Given a cache already bound to the current backend session.
  const queryClient = new QueryClient();
  queryClient.setQueryData(['calendar', 'owned'], 'authorized');
  const context = {
    queryClient,
    administration: { sessionScope: scope },
    auth: { session: async () => session },
  } as unknown as RouterContext;

  // When the session is independently revalidated for navigation.
  await requireSession(context);

  // Then only a genuine scope change would clear this authorized cache.
  expect(queryClient.getQueryData(['calendar', 'owned'])).toBe('authorized');
});

test.each([
  ['calendarAdmin', false, 'get', 'owner-edit'],
  ['calendarAdmin', true, 'preview', 'owner-preview'],
  ['superadmin', true, 'systemPreview', 'system-preview'],
] as const)(
  'Given validated %s with preview %s, When the route loads, Then only %s supplies its mode %s',
  async (role, preview, operation, mode) => {
    // Given independently validated authority and distinct query endpoints.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const validated = { ...session, user: { ...session.user, role } };
    const readers = Object.fromEntries(
      ['get', 'preview', 'systemPreview'].map((name) => [
        name,
        {
          queryOptions: vi.fn(() => ({
            queryKey: ['calendar', name],
            queryFn: async () => ({ id: 'calendar' }),
          })),
        },
      ]),
    );
    const inspect = vi.fn(async () => validated);
    const context = {
      queryClient,
      administration: {},
      auth: { session: inspect },
      trpc: { calendar: readers },
    } as unknown as RouterContext;

    // When direct navigation and refresh each revalidate and fetch the selected reader.
    const result = await loadCalendarPage(context, 'calendar', preview);
    await loadCalendarPage(context, 'calendar', preview);

    // Then the mode follows server authority and other reader keys are unused.
    expect(result.mode).toBe(mode);
    expect(inspect).toHaveBeenCalledTimes(2);
    for (const [name, reader] of Object.entries(readers))
      expect(reader.queryOptions).toHaveBeenCalledTimes(name === operation ? 2 : 0);
  },
);

test('Given a superadmin, When owner editing is requested directly, Then navigation redirects before any calendar read', async () => {
  // Given a server-validated superadmin session without owner administration authority.
  const context = {
    queryClient: new QueryClient(),
    administration: {},
    auth: { session: async () => ({ ...session, user: { ...session.user, role: 'superadmin' } }) },
  } as unknown as RouterContext;

  // When a crafted direct owner-editor navigation invokes its unchanged guard.
  const action = requireCalendarSession(context);

  // Then the caller returns to the personal page rather than an editor.
  await expect(action).rejects.toMatchObject({ options: { to: '/my-page' } });
});

test('Given a revoked session with cached system data, When preview navigation revalidates, Then all protected data is cleared before login', async () => {
  // Given rows and future content cached under a session the backend has revoked.
  const queryClient = new QueryClient();
  queryClient.setQueryData(['calendar', 'systemList'], 'private rows');
  queryClient.setQueryData(['calendar', 'systemPreview'], 'future content');
  const context = {
    queryClient,
    administration: {},
    auth: {
      session: async () => {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      },
    },
  } as unknown as RouterContext;

  // When a direct preview request rechecks the opaque cookie.
  const action = loadCalendarPage(context, 'calendar', true);

  // Then no stale authorized data survives the redirect.
  await expect(action).rejects.toMatchObject({ options: { to: '/login' } });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});

test('Given cached system data and a newly restricted session, When preview navigation validates it, Then protected data is cleared before required password change', async () => {
  // Given future content cached under a previous unrestricted session.
  const queryClient = new QueryClient();
  queryClient.setQueryData(['calendar', 'systemPreview'], 'future content');
  const restrictedSession = {
    ...session,
    mustChangePassword: true,
    cacheScope: 'restricted-session',
  };
  const context = {
    queryClient,
    administration: { sessionScope: scope },
    auth: { session: async () => restrictedSession },
  } as unknown as RouterContext;

  // When a cookie replacement introduces restricted authority during navigation.
  const action = loadCalendarPage(context, 'calendar', true);

  // Then neither route output nor previous query values retain unrestricted authority.
  await expect(action).rejects.toMatchObject({ options: { to: '/change-password' } });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(context.administration.sessionScope).toBe('restricted-session');
});

test('Given an owner-denied preview read, When SSR loads the route, Then a plain error code survives transport and protected query data is removed', async () => {
  // Given a current administrator session and an owner denial from the BFF query.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['calendar', 'old'], 'old-private-content');
  const context = {
    queryClient,
    administration: { sessionScope: scope },
    auth: { session: async () => session },
    trpc: {
      calendar: {
        preview: {
          queryOptions: () => ({
            queryKey: ['calendar', 'preview'],
            queryFn: async () => {
              throw new TRPCError({ code: 'NOT_FOUND' });
            },
          }),
        },
      },
    },
  } as unknown as RouterContext;

  // When SSR obtains a denial rather than privileged content.
  const result = await loadCalendarPage(context, '00000000-0000-4000-8000-000000000001', true);

  // Then serialized route output retains the correct localized-error selector only.
  expect(JSON.parse(JSON.stringify(result))).toEqual({
    session,
    mode: 'owner-preview',
    failure: 'NOT_FOUND',
  });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
