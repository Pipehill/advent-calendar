import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { CalendarListFrame } from './calendar-list-frame';
import { CalendarPagination } from './calendar-pagination';
import { buttonStyles } from './ui/button';

export function SuperadminCalendarList({ context }: { context: RouterContext }) {
  const [offset, setOffset] = useState(0);
  const limit = 12;
  const query = useQuery({
    ...context.trpc.calendar.systemList.queryOptions({ offset, limit }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  useProtectedQuery(context, query.error);
  return (
    <CalendarListFrame
      headingId="system-calendars-heading"
      title={m.calendar_system_list()}
      query={query}
    >
      {query.data && (
        <>
          {query.data.calendars.length === 0 ? (
            <p className="text-stone-600">{m.calendar_system_empty()}</p>
          ) : (
            <section
              className="overflow-x-auto rounded-xl border border-stone-200 focus-visible:outline-2 focus-visible:outline-emerald-800"
              aria-label={m.calendar_system_list()}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll all table columns on narrow screens.
              tabIndex={0}
            >
              <table className="w-full min-w-[42rem] table-fixed border-collapse bg-white text-left">
                <caption className="sr-only">{m.calendar_system_list()}</caption>
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th scope="col" className="w-1/4 p-3">
                      {m.calendar_table_title()}
                    </th>
                    <th scope="col" className="w-20 p-3">
                      {m.calendar_table_year()}
                    </th>
                    <th scope="col" className="p-3">
                      {m.role_admin()}
                    </th>
                    <th scope="col" className="p-3">
                      {m.role_user()}
                    </th>
                    <th scope="col" className="w-36 p-3">
                      {m.calendar_preview()}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {query.data.calendars.map((calendar) => (
                    <tr key={calendar.id}>
                      <th scope="row" className="break-anywhere p-3 align-top font-semibold">
                        {calendar.title}
                      </th>
                      <td className="p-3 align-top">{calendar.year}</td>
                      <td className="break-anywhere p-3 align-top">
                        {calendar.ownerName}
                        <span className="block text-sm text-stone-600">
                          ({calendar.ownerUsername})
                        </span>
                      </td>
                      <td className="break-anywhere p-3 align-top">
                        {calendar.recipientName}
                        <span className="block text-sm text-stone-600">
                          ({calendar.recipientUsername})
                        </span>
                      </td>
                      <td className="p-3 align-top">
                        <Link
                          to="/calendar-preview/$id"
                          params={{ id: calendar.id }}
                          preload={false}
                          aria-label={m.calendar_preview_named({ title: calendar.title })}
                          className={buttonStyles({ size: 'compact', variant: 'secondary' })}
                        >
                          <Eye aria-hidden="true" />
                          {m.calendar_preview()}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <CalendarPagination
            offset={offset}
            limit={limit}
            total={query.data.totalCount}
            busy={query.isFetching}
            label={m.calendar_system_list()}
            onOffset={setOffset}
          />
        </>
      )}
    </CalendarListFrame>
  );
}
