import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { CalendarCards } from './calendar-cards';
import { CalendarListFrame } from './calendar-list-frame';
import { CalendarPagination } from './calendar-pagination';

export function RecipientCalendarList({
  context,
  scope,
}: {
  context: RouterContext;
  scope: string;
}) {
  const [offset, setOffset] = useState(0);
  const limit = 12;
  const query = useQuery({
    ...context.trpc.recipient.list.queryOptions({ offset, limit, scope }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: 30_000,
  });
  useProtectedQuery(context, query.error);
  return (
    <CalendarListFrame
      headingId="recipient-calendars-heading"
      title={m.recipient_calendars()}
      query={query}
    >
      {query.data && (
        <>
          {query.data.calendars.length === 0 ? (
            <p className="text-stone-600">{m.no_calendars()}</p>
          ) : (
            <CalendarCards calendars={query.data.calendars} recipient />
          )}
          {query.data.totalCount > limit && (
            <CalendarPagination
              offset={offset}
              limit={limit}
              total={query.data.totalCount}
              busy={query.isFetching}
              label={m.recipient_calendars()}
              onOffset={setOffset}
            />
          )}
        </>
      )}
    </CalendarListFrame>
  );
}
