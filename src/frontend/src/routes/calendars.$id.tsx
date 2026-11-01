import { createFileRoute } from '@tanstack/react-router';
import { CalendarRouteError, CalendarWorkspace } from '../components/calendar-workspace';
import { ErrorState } from '../components/error-state';
import * as m from '../generated/paraglide/messages.js';
import { loadCalendarPage } from '../lib/calendar-navigation';

export const Route = createFileRoute('/calendars/$id')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: CalendarRouteError,
  loader: ({ context, params }) => loadCalendarPage(context, params.id),
  pendingComponent: () => <p role="status">{m.loading()}</p>,
  component: AdministrationPage,
});

function AdministrationPage() {
  const context = Route.useRouteContext();
  const { session, failure } = Route.useLoaderData();
  const { id } = Route.useParams();
  return failure ? (
    <ErrorState code={failure} />
  ) : (
    <CalendarWorkspace context={context} id={id} expiresAt={session.expiresAt} />
  );
}
