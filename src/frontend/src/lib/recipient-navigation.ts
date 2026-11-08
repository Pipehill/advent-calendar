import { redirect } from '@tanstack/react-router';
import { errorCode } from '../components/error-state';
import type { RouterContext } from '../router';
import { requireSession } from './auth-navigation';

export async function loadRecipientCalendarPage(context: RouterContext, id: string) {
  const session = await requireSession(context);
  if (session.user.role !== 'calendarUser') throw redirect({ to: '/my-page' });
  try {
    await context.queryClient.fetchQuery({
      ...context.trpc.recipient.get.queryOptions({ id, scope: session.cacheScope }),
      staleTime: 0,
      gcTime: 0,
    });
    return { session, failure: null };
  } catch (error) {
    context.queryClient.clear();
    const failure = errorCode(error);
    if (failure === 'UNAUTHORIZED') throw redirect({ to: '/login' });
    return { session, failure };
  }
}
