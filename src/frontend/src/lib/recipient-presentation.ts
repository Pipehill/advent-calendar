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
  let state = m.recipient_available();
  if (door.state === 'empty') state = m.recipient_empty();
  if (door.state === 'locked') {
    const date = new Intl.DateTimeFormat(getLocale(), {
      timeZone: 'Europe/Oslo',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(door.opensAt));
    state = m.recipient_locked({ date });
  }
  return `${m.door_label({ number: String(door.number) })}, ${state}${door.openedAt ? `, ${m.recipient_opened()}` : ''}`;
}
