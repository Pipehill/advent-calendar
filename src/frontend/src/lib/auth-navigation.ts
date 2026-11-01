import { redirect } from '@tanstack/react-router';
import { errorCode } from '../components/error-state';
import type { RouterContext } from '../router';

export async function requireSession(context: RouterContext, restricted = false) {
  let session: Awaited<ReturnType<RouterContext['auth']['session']>>;
  try {
    // Deliberately bypass the query cache on every navigation and SSR request.
    session = await context.auth.session();
  } catch (error) {
    context.queryClient.clear();
    if (errorCode(error) === 'UNAUTHORIZED') throw redirect({ to: '/login' });
    throw error;
  }
  if (session.mustChangePassword && !restricted) throw redirect({ to: '/change-password' });
  const scope = session.cacheScope;
  if (context.administration.sessionScope !== scope) {
    context.queryClient.clear();
    context.administration.sessionScope = scope;
  }
  return session;
}

export async function requireCalendarSession(context: RouterContext) {
  const session = await requireSession(context);
  if (session.user.role !== 'calendarAdmin') throw redirect({ to: '/my-page' });
  return session;
}

export function leaveSession(context: RouterContext, destination: string) {
  context.queryClient.clear();
  // A document navigation discards protected route data, mutation inputs and CSRF tokens.
  window.location.replace(destination);
}
