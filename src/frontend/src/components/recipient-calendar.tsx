import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { CalendarBoard } from './calendar-board';
import { ErrorState, errorCode } from './error-state';
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
  });
  const [selected, setSelected] = useState(0);
  useProtectedQuery(context, query.error);
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
        selected={selected}
        onSelect={setSelected}
      />
    </section>
  );
}
