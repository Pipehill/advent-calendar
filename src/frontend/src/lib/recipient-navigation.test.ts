import { QueryClient } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import type { RouterContext } from '../router';
import { loadRecipientCalendarPage } from './recipient-navigation';

test.each(['calendarAdmin', 'superadmin'])(
  'Given a validated %s, When a recipient route is requested, Then its guard returns to the personal page before reading a board',
  async (role) => {
    // Given an authenticated administrator and no recipient reader.
    const context = {
      queryClient: new QueryClient(),
      administration: {},
      auth: { session: async () => ({ user: { role }, cacheScope: 'session' }) },
    } as unknown as RouterContext;

    // When direct recipient navigation runs its independent session guard.
    const navigation = loadRecipientCalendarPage(context, 'calendar');

    // Then administrator preview cannot become recipient authority.
    await expect(navigation).rejects.toMatchObject({ options: { to: '/my-page' } });
  },
);

test('Given an assigned recipient with another session cached, When SSR loads the board, Then only scoped safe metadata is prefetched', async () => {
  // Given old protected query data and a freshly validated recipient session.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['administrator-content'], 'future-secret');
  const read = vi.fn(() => ({
    queryKey: ['recipient', 'new-session', 'calendar'],
    queryFn: async () => ({ title: 'Safe board', doors: [] }),
  }));
  const context = {
    queryClient,
    administration: { sessionScope: 'old-session' },
    auth: { session: async () => ({ user: { role: 'calendarUser' }, cacheScope: 'new-session' }) },
    trpc: { recipient: { get: { queryOptions: read } } },
  } as unknown as RouterContext;

  // When the route authorizes and prefetches safe board metadata.
  const state = await loadRecipientCalendarPage(context, 'calendar');

  // Then previous data is gone and the input binds the board to the validated scope.
  expect(state.failure).toBeNull();
  expect(read).toHaveBeenCalledWith({ id: 'calendar', scope: 'new-session' });
  expect(queryClient.getQueryData(['administrator-content'])).toBeUndefined();
});
