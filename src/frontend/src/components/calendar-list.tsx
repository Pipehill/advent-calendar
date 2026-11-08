import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, CalendarPlus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import { calendarBackgroundPath } from '../lib/calendar-input';
import type { RouterContext } from '../router';
import { RequestFailure } from './auth-feedback';
import { errorCode } from './error-state';
import { Button, buttonStyles } from './ui/button';

export function CalendarList({ context }: { context: RouterContext }) {
  const [offset, setOffset] = useState(0);
  const limit = 12;
  const query = useQuery({
    ...context.trpc.calendar.list.queryOptions({ offset, limit }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    if (query.error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(errorCode(query.error)))
      leaveSession(context, '/login');
  }, [query.error, context]);
  return (
    <section className="mt-10" aria-labelledby="calendars-heading">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="calendars-heading" className="mr-auto font-serif text-2xl">
          {m.calendar_own_list()}
          {query.data && ` (${query.data.totalCount})`}
        </h2>
        <Link to="/create-calendar" preload={false} className={buttonStyles({ size: 'compact' })}>
          <CalendarPlus aria-hidden="true" />
          {m.create_calendar()}
        </Link>
        <Button
          size="icon"
          variant="secondary"
          aria-label={m.calendar_refresh()}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </header>
      {query.isPending ? (
        <p role="status">{m.loading()}</p>
      ) : query.error ? (
        <RequestFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data && (
          <>
            {query.data.calendars.length === 0 ? (
              <p className="text-stone-600">{m.calendar_no_owned()}</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {query.data.calendars.map((calendar) => (
                  <li key={calendar.id}>
                    <Link
                      to="/calendars/$id"
                      params={{ id: calendar.id }}
                      preload={false}
                      className="block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                    >
                      <img
                        src={calendarBackgroundPath(calendar.background, true)}
                        alt=""
                        width="384"
                        height="256"
                        className="aspect-[3/2] w-full object-cover"
                        loading="lazy"
                      />
                      <span className="block break-anywhere p-4">
                        <span className="block font-serif text-xl">
                          {calendar.title}{' '}
                          <span className="text-base text-stone-600">{calendar.year}</span>
                        </span>
                        <span className="mt-2 block text-sm text-stone-600">
                          {m.calendar_recipient()}: {calendar.recipientName} (
                          {calendar.recipientUsername})
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {query.data.totalCount > limit && (
              <nav
                aria-label={m.calendar_own_list()}
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <Button
                  size="compact"
                  variant="secondary"
                  disabled={offset === 0 || query.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  <ArrowLeft aria-hidden="true" />
                  {m.calendar_previous()}
                </Button>
                <span role="status">
                  {m.calendar_page({
                    page: String(Math.floor(offset / limit) + 1),
                    pages: String(Math.ceil(query.data.totalCount / limit)),
                  })}
                </span>
                <Button
                  size="compact"
                  variant="secondary"
                  disabled={offset + limit >= query.data.totalCount || query.isFetching}
                  onClick={() => setOffset(offset + limit)}
                >
                  {m.calendar_next()}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </nav>
            )}
          </>
        )
      )}
    </section>
  );
}
