import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { recipientRefreshDelay } from '../lib/recipient-presentation';
import { useProtectedQuery } from '../lib/use-protected-query';
import { useRecipientOpening } from '../lib/use-recipient-opening';
import type { RouterContext } from '../router';
import { authError } from './auth-feedback';
import { CalendarBoard } from './calendar-board';
import { ErrorState, errorCode } from './error-state';
import { RecipientDoorDialog } from './recipient-door-dialog';
import { SessionControls } from './session-controls';
import { buttonStyles } from './ui/button';

export function RecipientCalendar({
  context,
  id,
  scope,
  expiresAt,
}: {
  context: RouterContext;
  id: string;
  scope: string;
  expiresAt: string;
}) {
  const query = useQuery({
    ...context.trpc.recipient.get.queryOptions({ id, scope }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: 30_000,
  });
  const opening = useRecipientOpening(context, id, scope, query.data, query.error, query.refetch);
  useProtectedQuery(context, query.error);
  useProtectedQuery(context, opening.failure);
  useEffect(() => {
    if (!query.data || query.error) return;
    const delay = recipientRefreshDelay(query.data.serverTime, query.data.nextOpeningAt);
    const timer = window.setTimeout(() => void query.refetch(), delay);
    return () => window.clearTimeout(timer);
  }, [query.data, query.error, query.refetch]);
  if (query.error) return <ErrorState code={errorCode(query.error)} />;
  if (!query.data) return <p role="status">{m.loading()}</p>;
  const calendar = query.data;
  return (
    <section className="protected-content space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto min-w-0 break-anywhere font-serif text-3xl text-emerald-950">
          {calendar.title} <span className="text-xl">{calendar.year}</span>
        </h1>
        <Link
          to="/my-page"
          preload={false}
          className={buttonStyles({ size: 'compact', variant: 'secondary' })}
        >
          {m.calendar_my_page()}
        </Link>
        <SessionControls context={context} expiresAt={expiresAt} />
      </header>
      <CalendarBoard
        background={calendar.background}
        layout={calendar.layout}
        order={calendar.doorOrder}
        selected={opening.presentation?.result.door.number ?? 0}
        onSelect={opening.open}
        recipientDoors={calendar.doors}
        pending={opening.pending}
        opening={opening.presentation?.result.door.number}
      />
      <p role="status" aria-live="polite">
        {opening.pending
          ? m.recipient_opening()
          : opening.presentation
            ? m.recipient_opened()
            : m.recipient_hint()}
      </p>
      {!!opening.failure && (
        <p role="alert">
          {m.recipient_open_failed()} {authError(opening.failure)}
        </p>
      )}
      {opening.presentation && (
        <RecipientDoorDialog
          context={context}
          id={id}
          scope={scope}
          presentation={opening.presentation}
          close={opening.close}
          unavailable={() => {
            opening.close();
            void query.refetch();
          }}
        />
      )}
    </section>
  );
}
