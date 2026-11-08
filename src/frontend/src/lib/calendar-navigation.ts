import { redirect } from '@tanstack/react-router';
import { errorCode } from '../components/error-state';
import type { RouterContext } from '../router';
import { requireCalendarSession } from './auth-navigation';

export type CalendarMode = 'owner-edit' | 'owner-preview' | 'system-preview';

export function calendarQueryOptions(context: RouterContext, id: string, mode: CalendarMode) {
  if (mode === 'system-preview') return context.trpc.calendar.systemPreview.queryOptions({ id });
  if (mode === 'owner-preview') return context.trpc.calendar.preview.queryOptions({ id });
  return context.trpc.calendar.get.queryOptions({ id });
}

export async function loadCalendarPage(context: RouterContext, id: string, preview = false) {
  const session = await requireCalendarSession(context, preview);
  let mode: CalendarMode = 'owner-edit';
  if (preview) mode = session.user.role === 'superadmin' ? 'system-preview' : 'owner-preview';
  try {
    const options = calendarQueryOptions(context, id, mode);
    await context.queryClient.fetchQuery({ ...options, staleTime: 0, gcTime: 0 });
    return { session, mode, failure: null };
  } catch (error) {
    context.queryClient.clear();
    const failure = errorCode(error);
    if (failure === 'UNAUTHORIZED') throw redirect({ to: '/login' });
    // Transport a plain failure code: custom Error properties do not survive SSR.
    return { session, mode, failure };
  }
}
