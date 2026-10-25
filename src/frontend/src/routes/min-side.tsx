import { createFileRoute } from '@tanstack/react-router';
import { AccountList } from '../components/account-list';
import { AuthRouteError } from '../components/auth-feedback';
import { SessionControls } from '../components/session-controls';
import { Button } from '../components/ui/button';
import * as m from '../generated/paraglide/messages.js';
import { requireSession } from '../lib/auth-navigation';

export const Route = createFileRoute('/min-side')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: AuthRouteError,
  loader: ({ context }) => requireSession(context),
  pendingComponent: () => <p role="status">{m.auth_pending()}</p>,
  component: PersonalPage,
});

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join('')
    .toLocaleUpperCase();
}

function PersonalPage() {
  const session = Route.useLoaderData();
  const context = Route.useRouteContext();
  const { user } = session;
  return (
    <div className="protected-content">
      <div className="flex min-w-0 items-center gap-5">
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-emerald-950 font-serif text-xl text-white"
        >
          {initials(user.name)}
        </span>
        <h1 className="break-anywhere font-serif text-3xl text-emerald-950 sm:text-4xl">
          {m.personal_greeting({ name: user.name })}
        </h1>
      </div>
      {user.role === 'calendarUser' ? (
        <p className="mt-10 text-stone-600">{m.no_calendars()}</p>
      ) : (
        <section className="mt-10" aria-label={m.future_actions()}>
          <div className="flex flex-wrap gap-4">
            {user.role === 'superadmin' ? (
              <Button disabled>{m.create_admin()}</Button>
            ) : (
              <>
                <Button disabled>{m.create_calendar()}</Button>
                <Button disabled>{m.create_user()}</Button>
              </>
            )}
          </div>
          <p className="mt-3 text-sm text-stone-600">{m.coming_later()}</p>
        </section>
      )}
      {user.role === 'superadmin' && <AccountList context={context} />}
      <SessionControls context={context} expiresAt={session.expiresAt} passwordLink />
    </div>
  );
}
