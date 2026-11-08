import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  type CalendarClient,
  CreateCalendarRequestBackground,
  UpdateDoorRequestImageAction,
  UpdateLayoutRequestLayout,
} from '../generated/backend';
import type {
  CreateCalendarInput,
  calendarPageInput,
  doorImageInput,
  saveDoorInput,
  saveLayoutInput,
  saveRecipientInput,
} from '../lib/calendar-input';
import { publicSession } from './auth';
import { callBackend } from './backend';
import type { RequestContext } from './context';

export function readDoorImage(context: RequestContext, input: z.infer<typeof doorImageInput>) {
  return callBackend(context, async (client, signal) => {
    const session = await client.session(signal);
    const system = session.user.role === 'superadmin';
    if (
      session.mustChangePassword ||
      (!system && session.user.role !== 'calendarAdmin') ||
      system !== (input.mode === 'system-preview') ||
      publicSession(session, context).cacheScope !== input.scope
    )
      throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
    const image = await (system
      ? client.previewSystemDoorImage(input.id, input.number, signal)
      : client.getDoorImage(input.id, input.number, signal));
    if (image.metadata.version !== input.version)
      throw new TRPCError({ code: 'CONFLICT', message: 'CONFLICT' });
    return image;
  });
}

async function requireCalendarRole(
  client: CalendarClient,
  signal: AbortSignal,
  role = 'calendarAdmin',
) {
  const session = await client.session(signal);
  if (session.mustChangePassword || session.user.role !== role)
    throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
}

export function listSystemCalendars(
  context: RequestContext,
  input: z.infer<typeof calendarPageInput>,
) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarRole(client, signal, 'superadmin');
    return client.listSystemCalendars(input.offset, input.limit, signal);
  });
}

export function readSystemPreview(context: RequestContext, id: string) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarRole(client, signal, 'superadmin');
    return client.previewSystemCalendar(id, signal);
  });
}

export function readOwnedCalendar(context: RequestContext, id: string) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarRole(client, signal);
    return client.get(id, signal);
  });
}

export function listOwnedCalendars(
  context: RequestContext,
  input: z.infer<typeof calendarPageInput>,
) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarRole(client, signal);
    return client.listCalendars(input.offset, input.limit, signal);
  });
}

export function calendarRecipients(context: RequestContext) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarRole(client, signal);
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
    await requireCalendarRole(client, signal);
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
    await requireCalendarRole(client, signal);
    return client.updateDoor(
      input.id,
      input.number,
      {
        title: input.title,
        text: input.text,
        imageAction:
          input.imageAction === undefined
            ? undefined
            : {
                keep: UpdateDoorRequestImageAction.Keep,
                replace: UpdateDoorRequestImageAction.Replace,
                remove: UpdateDoorRequestImageAction.Remove,
              }[input.imageAction],
        imageData: input.imageData,
      },
      signal,
    );
  });
}

export function saveOwnedLayout(context: RequestContext, input: z.infer<typeof saveLayoutInput>) {
  return callBackend(context, async (client, signal) => {
    await requireCalendarRole(client, signal);
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
    await requireCalendarRole(client, signal);
    return client.updateRecipient(input.id, { recipientId: input.recipientId }, signal);
  });
}
