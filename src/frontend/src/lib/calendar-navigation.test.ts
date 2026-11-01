import { QueryClient } from '@tanstack/react-query';
import { TRPCError } from '@trpc/server';
import { expect, test } from 'vitest';
import type { RouterContext } from '../router';
import { requireSession } from './auth-navigation';
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
  expect(JSON.parse(JSON.stringify(result))).toEqual({ session, failure: 'NOT_FOUND' });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
