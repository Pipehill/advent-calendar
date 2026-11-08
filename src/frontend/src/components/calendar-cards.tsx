import { Link } from '@tanstack/react-router';
import * as m from '../generated/paraglide/messages.js';
import { calendarBackgroundPath } from '../lib/calendar-input';

type Card = {
  id: string;
  title: string;
  year: number;
  background: string;
  recipientName?: string;
  recipientUsername?: string;
};

export function CalendarCards({
  calendars,
  recipient = false,
}: {
  calendars: Card[];
  recipient?: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {calendars.map((calendar) => (
        <li key={calendar.id}>
          <Link
            to={recipient ? '/my-calendars/$id' : '/calendars/$id'}
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
                {calendar.title} <span className="text-base text-stone-600">{calendar.year}</span>
              </span>
              {!recipient && (
                <span className="mt-2 block text-sm text-stone-600">
                  {m.calendar_recipient()}: {calendar.recipientName} ({calendar.recipientUsername})
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
