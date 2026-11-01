import { createFileRoute } from '@tanstack/react-router';
import { CalendarRouteError, CalendarWorkspace } from '../components/calendar-workspace';
import * as m from '../generated/paraglide/messages.js';
import { requireCalendarSession } from '../lib/auth-navigation';

export const Route = createFileRoute('/calendar-preview/$id')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: CalendarRouteError,
  loader: async ({ context, params }) => {
    const session = await requireCalendarSession(context);
    await context.queryClient.fetchQuery({
      ...context.trpc.calendar.preview.queryOptions({ id: params.id }),
      staleTime: 0,
      gcTime: 0,
    });
    return session;
  },
  pendingComponent: () => <p role="status">{m.loading()}</p>,
  component: PreviewPage,
});

function PreviewPage() {
  const context = Route.useRouteContext();
  const session = Route.useLoaderData();
  const { id } = Route.useParams();
  return <CalendarWorkspace context={context} id={id} expiresAt={session.expiresAt} preview />;
}
