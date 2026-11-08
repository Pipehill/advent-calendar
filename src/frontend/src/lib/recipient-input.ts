import { z } from 'zod';
import { calendarIdInput, calendarPageInput } from './calendar-input';

const scope = z.string().regex(/^[a-f0-9]{64}$/);
export const recipientPageInput = calendarPageInput.extend({ scope });
export const recipientCalendarInput = calendarIdInput.extend({ scope });
export const recipientDoorInput = recipientCalendarInput.extend({
  number: z.number().int().min(1).max(24),
});
export const recipientImageInput = recipientDoorInput.extend({ version: z.uuid() });
