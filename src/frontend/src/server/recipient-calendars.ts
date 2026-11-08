import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import type { CalendarClient } from '../generated/backend';
import type {
  recipientCalendarInput,
  recipientDoorInput,
  recipientImageInput,
  recipientPageInput,
} from '../lib/recipient-input';
import { publicSession } from './auth';
import { callBackend } from './backend';
import type { RequestContext } from './context';

function recipientCall<T>(
  context: RequestContext,
  scope: string,
  operation: (client: CalendarClient, signal: AbortSignal) => Promise<T>,
) {
  return callBackend(context, async (client, signal) => {
    const session = await client.session(signal);
    if (
      session.mustChangePassword ||
      session.user.role !== 'calendarUser' ||
      publicSession(session, context).cacheScope !== scope
    )
      throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
    return operation(client, signal);
  });
}

export function listRecipientCalendars(
  context: RequestContext,
  input: z.infer<typeof recipientPageInput>,
) {
  return recipientCall(context, input.scope, (client, signal) =>
    client.listRecipientCalendars(input.offset, input.limit, signal),
  );
}

export function readRecipientCalendar(
  context: RequestContext,
  input: z.infer<typeof recipientCalendarInput>,
) {
  return recipientCall(context, input.scope, (client, signal) =>
    client.getRecipientCalendar(input.id, signal),
  );
}

export function openRecipientDoor(
  context: RequestContext,
  input: z.infer<typeof recipientDoorInput>,
) {
  return recipientCall(context, input.scope, (client, signal) =>
    client.openRecipientDoor(input.id, input.number, signal),
  );
}

export function readRecipientImage(
  context: RequestContext,
  input: z.infer<typeof recipientImageInput>,
) {
  return recipientCall(context, input.scope, async (client, signal) => {
    const image = await client.getRecipientDoorImage(input.id, input.number, input.version, signal);
    if (image.metadata.version !== input.version)
      throw new TRPCError({ code: 'CONFLICT', message: 'CONFLICT' });
    return image;
  });
}
