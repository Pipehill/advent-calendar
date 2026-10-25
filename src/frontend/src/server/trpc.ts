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
import { BackendProblem, callBackend, retrieveCalendar } from './backend';
import { logRequest, type RequestContext } from './context';

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
        return publicSession(session);
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
    get: procedure.input(z.object({ id: z.uuid() })).query(async ({ input, ctx }) => {
      const calendar = await retrieveCalendar(input.id, ctx);
      // The first page needs only metadata; door contents stay out of hydration.
      return {
        id: calendar.id,
        title: calendar.title,
        doors: calendar.doors.map((door) => ({ number: door.number })),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
