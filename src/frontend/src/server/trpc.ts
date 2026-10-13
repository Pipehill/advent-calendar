import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { BackendProblem, retrieveCalendar } from './backend';
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

export const appRouter = t.router({
  calendar: t.router({
    get: t.procedure.input(z.object({ id: z.uuid() })).query(async ({ input, ctx }) => {
      try {
        const calendar = await retrieveCalendar(input.id, ctx);
        logRequest(ctx, 'OK');
        // The first page needs only metadata; door contents stay out of hydration.
        return {
          id: calendar.id,
          title: calendar.title,
          doors: calendar.doors.map((door) => ({ number: door.number })),
        };
      } catch (error) {
        logRequest(ctx, 'FAILED');
        throw error;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
