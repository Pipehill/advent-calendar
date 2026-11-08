import { createFileRoute } from '@tanstack/react-router';
import { CalendarPage, CalendarRouteError } from '../components/calendar-workspace';
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
  return (
    <CalendarPage
      context={Route.useRouteContext()}
      id={Route.useParams().id}
      state={Route.useLoaderData()}
    />
  );
}
