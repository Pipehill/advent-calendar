import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { CalendarCards } from './calendar-cards';
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
            <CalendarCards calendars={query.data.calendars} />
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
