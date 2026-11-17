import type {
  RecipientCalendarDto,
  RecipientDoorDto,
  RecipientOpeningDto,
} from '../generated/backend';
import * as m from '../generated/paraglide/messages.js';
import { getLocale } from '../generated/paraglide/runtime.js';

export function recipientRefreshDelay(serverTime: string, nextOpeningAt: string | null) {
  if (!nextOpeningAt) return 30_000;
  const remaining = Date.parse(nextOpeningAt) - Date.parse(serverTime);
  return Math.max(250, Math.min(30_000, remaining + 100));
}

export function recipientContentCurrent(
  calendar: RecipientCalendarDto | undefined,
  opening: RecipientOpeningDto,
) {
  return (
    calendar?.lastModifiedAt === opening.lastModifiedAt &&
    calendar.doors.some((door) => door.number === opening.door.number && door.state === 'available')
  );
}

export function recipientDoorLabel(door: RecipientDoorDto) {
  let state: string = m.recipient_available();
  if (door.state === 'empty') state = m.recipient_empty();
  if (door.state === 'locked') {
    const date = new Intl.DateTimeFormat(getLocale(), {
      timeZone: 'Europe/Oslo',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(door.opensAt));
    state = `${m.recipient_locked({ date })}. ${m.recipient_timing_help()}`;
  }
  return `${m.door_label({ number: String(door.number) })}, ${state}${door.openedAt ? `, ${m.recipient_opened()}` : ''}`;
}

export function recipientWaitMessage(opensAt: string, serverTime: string) {
  const opening = new Date(opensAt);
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', year: 'numeric' });
  const date = new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : 'nb-NO', {
    timeZone: 'Europe/Oslo',
    day: 'numeric',
    month: 'long',
    ...(year.format(opening) !== year.format(new Date(serverTime)) ? { year: 'numeric' } : {}),
  }).format(opening);
  return m.recipient_wait({ date });
}
