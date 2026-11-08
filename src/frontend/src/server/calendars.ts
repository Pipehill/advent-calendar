import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  type CalendarClient,
  CreateCalendarRequestBackground,
  UpdateLayoutRequestLayout,
} from '../generated/backend';
import type {
  CreateCalendarInput,
  calendarPageInput,
  saveDoorInput,
  saveLayoutInput,
  saveRecipientInput,
} from '../lib/calendar-input';
import { callBackend } from './backend';
import type { RequestContext } from './context';

async function requireCalendarAdministrator(client: CalendarClient, signal: AbortSignal) {
  const session = await client.session(signal);
  if (session.mustChangePassword || session.user.role !== 'calendarAdmin')
    throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
}

export function readOwnedCalendar(context: RequestContext, id: string) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    return client.get(id, signal);
  });
}

export function listOwnedCalendars(
  context: RequestContext,
  input: z.infer<typeof calendarPageInput>,
) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    return client.listCalendars(input.offset, input.limit, signal);
  });
}

export function calendarRecipients(context: RequestContext) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    const recipients: { id: string; name: string; username: string }[] = [];
    for (let offset = 0; offset <= 1_000_000; offset += 100) {
      const page = await client.listUsers(offset, 100, signal);
      for (const user of page.users)
        if (user.role === 'calendarUser')
          recipients.push({ id: user.id, name: user.name, username: user.username });
      if (offset + page.users.length >= page.totalCount) return recipients;
      if (page.users.length === 0) break;
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recipient pagination exceeds bounds' });
  });
}

export function createOwnedCalendar(context: RequestContext, input: CreateCalendarInput) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    const backgroundValues = {
      woodland: CreateCalendarRequestBackground.Woodland,
      sleigh: CreateCalendarRequestBackground.Sleigh,
      playtime: CreateCalendarRequestBackground.Playtime,
      aurora: CreateCalendarRequestBackground.Aurora,
    };
    return client.create({ ...input, background: backgroundValues[input.background] }, signal);
  });
}

export function saveOwnedDoor(context: RequestContext, input: z.infer<typeof saveDoorInput>) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    return client.updateDoor(
      input.id,
      input.number,
      { title: input.title, text: input.text },
      signal,
    );
  });
}

export function saveOwnedLayout(context: RequestContext, input: z.infer<typeof saveLayoutInput>) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    return client.updateLayout(
      input.id,
      {
        layout:
          input.layout === 'random'
            ? UpdateLayoutRequestLayout.Random
            : UpdateLayoutRequestLayout.Chronological,
      },
      signal,
    );
  });
}

export function saveOwnedRecipient(
  context: RequestContext,
  input: z.infer<typeof saveRecipientInput>,
) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarAdministrator(client, signal);
    return client.updateRecipient(input.id, { recipientId: input.recipientId }, signal);
  });
}
