import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import {
  accountPageInput,
  createAccountInput,
  resetAccountInput,
  roleAccountInput,
  statusAccountInput,
  verificationInput,
} from '../lib/account-input';
import { changePasswordInput, loginInput } from '../lib/auth-input';
import {
  calendarIdInput,
  calendarPageInput,
  createCalendarInput,
  doorImageInput,
  saveDoorInput,
  saveLayoutInput,
  saveRecipientInput,
} from '../lib/calendar-input';
import {
  recipientCalendarInput,
  recipientDoorInput,
  recipientImageInput,
  recipientPageInput,
} from '../lib/recipient-input';
import {
  AdministrationFieldError,
  changeAccountRole,
  changeAccountStatus,
  createAccount,
  listAccounts,
  requireAdministrator,
  resetAccount,
  responsibleAdministrators,
} from './accounts';
import { inspectSession, publicSession } from './auth';
import { BackendProblem, callBackend } from './backend';
import {
  calendarRecipients,
  createOwnedCalendar,
  listOwnedCalendars,
  listSystemCalendars,
  readDoorImage,
  readOwnedCalendar,
  readSystemPreview,
  saveOwnedDoor,
  saveOwnedLayout,
  saveOwnedRecipient,
} from './calendars';
import { logRequest, type RequestContext } from './context';
import {
  listRecipientCalendars,
  openRecipientDoor,
  readRecipientCalendar,
  readRecipientImage,
} from './recipient-calendars';

const t = initTRPC.context<RequestContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        verificationRequired:
          error.cause instanceof BackendProblem && error.cause.verificationRequired,
        fieldErrors:
          error.cause instanceof AdministrationFieldError
            ? { [error.cause.field]: ['Invalid'] }
            : error.cause instanceof BackendProblem
              ? error.cause.errors
              : error.cause instanceof z.ZodError
                ? z.flattenError(error.cause).fieldErrors
                : {},
      },
    };
  },
});

const procedure = t.procedure.use(async ({ ctx, path, next }) => {
  const result = await next();
  logRequest(ctx, result.ok ? 'OK' : 'FAILED', path);
  return result;
});

export const appRouter = t.router({
  recipient: t.router({
    list: procedure
      .input(recipientPageInput)
      .query(({ ctx, input }) => listRecipientCalendars(ctx, input)),
    get: procedure
      .input(recipientCalendarInput)
      .query(({ ctx, input }) => readRecipientCalendar(ctx, input)),
    image: procedure
      .input(recipientImageInput)
      .query(({ ctx, input }) => readRecipientImage(ctx, input)),
    open: procedure
      .input(recipientDoorInput)
      .mutation(({ ctx, input }) => openRecipientDoor(ctx, input)),
  }),
  auth: t.router({
    csrf: procedure.query(({ ctx }) => callBackend(ctx, (client, signal) => client.csrf(signal))),
    session: procedure.query(({ ctx }) => inspectSession(ctx)),
    reauthenticate: procedure.input(verificationInput).mutation(({ ctx, input }) =>
      callBackend(ctx, async (client, signal) => {
        await requireAdministrator(client, signal);
        await client.reauthenticate(input, signal);
        return { ok: true };
      }),
    ),
    login: procedure.input(loginInput).mutation(({ ctx, input }) =>
      callBackend(ctx, async (client, signal) => {
        const session = await client.login(input, signal);
        await client.csrf(signal);
        return publicSession(session, ctx);
      }),
    ),
    changePassword: procedure.input(changePasswordInput).mutation(async ({ ctx, input }) => {
      await callBackend(ctx, (client, signal) => client.changePassword(input, signal));
      return { ok: true };
    }),
    logout: procedure.mutation(async ({ ctx }) => {
      await callBackend(ctx, (client, signal) => client.logout(signal));
      return { ok: true };
    }),
  }),
  accounts: t.router({
    list: procedure.input(accountPageInput).query(({ ctx, input }) => listAccounts(ctx, input)),
    administrators: procedure.query(({ ctx }) => responsibleAdministrators(ctx)),
    create: procedure
      .input(createAccountInput)
      .mutation(({ ctx, input }) => createAccount(ctx, input)),
    resetPassword: procedure
      .input(resetAccountInput)
      .mutation(({ ctx, input }) => resetAccount(ctx, input)),
    changeStatus: procedure
      .input(statusAccountInput)
      .mutation(({ ctx, input }) => changeAccountStatus(ctx, input)),
    changeRole: procedure
      .input(roleAccountInput)
      .mutation(({ ctx, input }) => changeAccountRole(ctx, input)),
  }),
  calendar: t.router({
    image: procedure.input(doorImageInput).query(({ input, ctx }) => readDoorImage(ctx, input)),
    systemList: procedure
      .input(calendarPageInput)
      .query(({ input, ctx }) => listSystemCalendars(ctx, input)),
    systemPreview: procedure
      .input(calendarIdInput)
      .query(({ input, ctx }) => readSystemPreview(ctx, input.id)),
    get: procedure
      .input(calendarIdInput)
      .query(({ input, ctx }) => readOwnedCalendar(ctx, input.id)),
    preview: procedure
      .input(calendarIdInput)
      .query(({ input, ctx }) => readOwnedCalendar(ctx, input.id)),
    list: procedure
      .input(calendarPageInput)
      .query(({ input, ctx }) => listOwnedCalendars(ctx, input)),
    recipients: procedure.query(({ ctx }) => calendarRecipients(ctx)),
    create: procedure
      .input(createCalendarInput)
      .mutation(({ input, ctx }) => createOwnedCalendar(ctx, input)),
    saveDoor: procedure
      .input(saveDoorInput)
      .mutation(({ input, ctx }) => saveOwnedDoor(ctx, input)),
    saveLayout: procedure
      .input(saveLayoutInput)
      .mutation(({ input, ctx }) => saveOwnedLayout(ctx, input)),
    saveRecipient: procedure
      .input(saveRecipientInput)
      .mutation(({ input, ctx }) => saveOwnedRecipient(ctx, input)),
  }),
});

export type AppRouter = typeof appRouter;
