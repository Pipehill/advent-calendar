import { createFileRoute } from '@tanstack/react-router';
import { CalendarRouteError } from '../components/calendar-workspace';
import { ErrorState } from '../components/error-state';
import { RecipientCalendar } from '../components/recipient-calendar';
import * as m from '../generated/paraglide/messages.js';
import { loadRecipientCalendarPage } from '../lib/recipient-navigation';

export const Route = createFileRoute('/my-calendars/$id')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: CalendarRouteError,
  loader: ({ context, params }) => loadRecipientCalendarPage(context, params.id),
  pendingComponent: () => <p role="status">{m.loading()}</p>,
  component: RecipientPage,
});

function RecipientPage() {
  const state = Route.useLoaderData();
  const { id } = Route.useParams();
  const context = Route.useRouteContext();
  return state.failure ? (
    <ErrorState code={state.failure} />
  ) : (
    <RecipientCalendar
      key={`${state.session.cacheScope}:${id}`}
      context={context}
      id={id}
      scope={state.session.cacheScope}
      expiresAt={state.session.expiresAt}
    />
  );
}
