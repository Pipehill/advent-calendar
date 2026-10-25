import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { changePasswordInput, loginInput } from '../lib/auth-input';
import { inspectSession, listAccounts, publicSession } from './auth';
import { BackendProblem, callBackend, retrieveCalendar } from './backend';
import { logRequest, type RequestContext } from './context';

const t = initTRPC.context<RequestContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        fieldErrors:
          error.cause instanceof BackendProblem
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
    list: procedure
      .input(
        z.strictObject({
          offset: z.number().int().min(0).max(1_000_000),
          limit: z.number().int().min(1).max(100),
        }),
      )
      .query(({ ctx, input }) => listAccounts(ctx, input.offset, input.limit)),
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
