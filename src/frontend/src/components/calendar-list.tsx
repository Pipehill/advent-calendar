import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { calendarBackgroundPath } from '../lib/calendar-input';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { CalendarListFrame } from './calendar-list-frame';
import { CalendarPagination } from './calendar-pagination';
import { buttonStyles } from './ui/button';

export function CalendarList({ context }: { context: RouterContext }) {
  const [offset, setOffset] = useState(0);
  const limit = 12;
  const query = useQuery({
    ...context.trpc.calendar.list.queryOptions({ offset, limit }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  useProtectedQuery(context, query.error);
  return (
    <CalendarListFrame
      headingId="calendars-heading"
      title={m.calendar_own_list()}
      query={query}
      actions={
        <Link to="/create-calendar" preload={false} className={buttonStyles({ size: 'compact' })}>
          <CalendarPlus aria-hidden="true" />
          {m.create_calendar()}
        </Link>
      }
    >
      {query.data && (
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
            <CalendarPagination
              offset={offset}
              limit={limit}
              total={query.data.totalCount}
              busy={query.isFetching}
              label={m.calendar_own_list()}
              onOffset={setOffset}
            />
          )}
        </>
      )}
    </CalendarListFrame>
  );
}
