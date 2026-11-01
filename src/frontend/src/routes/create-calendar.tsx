import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { AuthRouteError } from '../components/auth-feedback';
import { CalendarCreateForm } from '../components/calendar-create-form';
import { SessionControls } from '../components/session-controls';
import { buttonStyles } from '../components/ui/button';
import * as m from '../generated/paraglide/messages.js';
import { requireCalendarSession } from '../lib/auth-navigation';

export const Route = createFileRoute('/create-calendar')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: AuthRouteError,
  loader: ({ context }) => requireCalendarSession(context),
  pendingComponent: () => <p role="status">{m.auth_pending()}</p>,
  component: CreateCalendarPage,
});

function CreateCalendarPage() {
  const session = Route.useLoaderData();
  const context = Route.useRouteContext();
  return (
    <section className="protected-content mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to="/my-page"
          preload={false}
          className={buttonStyles({ size: 'compact', variant: 'secondary' })}
        >
          <ArrowLeft aria-hidden="true" />
          {m.calendar_my_page()}
        </Link>
        <SessionControls context={context} expiresAt={session.expiresAt} className="ml-auto" />
      </header>
      <h1 className="auth-title">{m.create_calendar()}</h1>
      <p className="text-stone-600">{m.calendar_creation_help()}</p>
      <CalendarCreateForm context={context} />
    </section>
  );
}
