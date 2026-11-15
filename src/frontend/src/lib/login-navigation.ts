import { redirect } from '@tanstack/react-router';
import { errorCode } from '../components/error-state';
import type { RecipientCalendarListDto } from '../generated/backend';
import type { RouterContext } from '../router';
import { requireSession } from './auth-navigation';

export async function completeLoginNavigation(context: RouterContext) {
  const session = await requireSession(context);
  if (session.user.role !== 'calendarUser') throw redirect({ to: '/my-page' });

  let assignments: RecipientCalendarListDto;
  try {
    assignments = await context.queryClient.fetchQuery({
      ...context.trpc.recipient.list.queryOptions({
        offset: 0,
        limit: 2,
        scope: session.cacheScope,
      }),
      staleTime: 0,
      gcTime: 0,
    });
  } catch (error) {
    context.queryClient.clear();
    if (errorCode(error) === 'UNAUTHORIZED') throw redirect({ to: '/login' });
    // My page revalidates the session and exposes the existing recoverable list UI.
    throw redirect({ to: '/my-page' });
  }

  if (assignments.totalCount === 1 && assignments.calendars.length === 1)
    throw redirect({
      to: '/my-calendars/$id',
      params: { id: assignments.calendars[0].id },
    });
  throw redirect({ to: '/my-page' });
}
