import { createFileRoute } from '@tanstack/react-router';
import { AccountList } from '../components/account-list';
import { AuthRouteError } from '../components/auth-feedback';
import { CalendarList } from '../components/calendar-list';
import { SessionControls } from '../components/session-controls';
import { type OverviewTab, SuperadminOverview } from '../components/superadmin-overview';
import * as m from '../generated/paraglide/messages.js';
import { requireSession } from '../lib/auth-navigation';

export const Route = createFileRoute('/my-page')({
  validateSearch: (search: Record<string, unknown>): { tab?: OverviewTab } =>
    search.tab === 'users' || search.tab === 'calendars' ? { tab: search.tab } : {},
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
  const { tab = 'users' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="protected-content">
      <header className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
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
        <SessionControls
          context={context}
          expiresAt={session.expiresAt}
          passwordLink
          className="ml-auto"
        />
      </header>
      {user.role === 'calendarUser' ? (
        <p className="mt-10 text-stone-600">{m.no_calendars()}</p>
      ) : user.role === 'calendarAdmin' ? (
        <CalendarList context={context} />
      ) : null}
      {user.role === 'superadmin' && (
        <SuperadminOverview
          context={context}
          selected={tab}
          onSelect={(tab) => void navigate({ search: { tab }, replace: true })}
        />
      )}
      {user.role === 'calendarAdmin' && <AccountList context={context} actorRole={user.role} />}
    </div>
  );
}
