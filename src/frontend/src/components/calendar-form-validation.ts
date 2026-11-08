import type { z } from 'zod';
import * as m from '../generated/paraglide/messages.js';

export function calendarFieldErrors(fields: Iterable<string>) {
  return {
    fields: Object.fromEntries([...fields].map((field) => [field, m.calendar_invalid_field()])),
  };
}

export function validateCalendarForm(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) {
    return calendarFieldErrors(result.error.issues.map((issue) => String(issue.path[0])));
  }
  return undefined;
}
