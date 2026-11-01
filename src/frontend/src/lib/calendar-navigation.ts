import { redirect } from '@tanstack/react-router';
import { errorCode } from '../components/error-state';
import type { RouterContext } from '../router';
import { requireCalendarSession } from './auth-navigation';

export async function loadCalendarPage(context: RouterContext, id: string, preview = false) {
  const session = await requireCalendarSession(context);
  try {
    const options = preview
      ? context.trpc.calendar.preview.queryOptions({ id })
      : context.trpc.calendar.get.queryOptions({ id });
    await context.queryClient.fetchQuery({ ...options, staleTime: 0, gcTime: 0 });
    return { session, failure: null };
  } catch (error) {
    context.queryClient.clear();
    const failure = errorCode(error);
    if (failure === 'UNAUTHORIZED') throw redirect({ to: '/login' });
    // Transport a plain failure code: custom Error properties do not survive SSR.
    return { session, failure };
  }
}
