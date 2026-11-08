import { createFileRoute } from '@tanstack/react-router';
import { CalendarPage, CalendarRouteError } from '../components/calendar-workspace';
import * as m from '../generated/paraglide/messages.js';
import { loadCalendarPage } from '../lib/calendar-navigation';

export const Route = createFileRoute('/calendar-preview/$id')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: CalendarRouteError,
  loader: ({ context, params }) => loadCalendarPage(context, params.id, true),
  pendingComponent: () => <p role="status">{m.loading()}</p>,
  component: PreviewPage,
});

function PreviewPage() {
  return (
    <CalendarPage
      context={Route.useRouteContext()}
      id={Route.useParams().id}
      state={Route.useLoaderData()}
    />
  );
}
