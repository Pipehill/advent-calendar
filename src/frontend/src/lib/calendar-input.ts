import { z } from 'zod';
import { accountName } from './account-input';

export const backgrounds = ['woodland', 'sleigh', 'playtime', 'aurora'] as const;
export const calendarPageInput = z.strictObject({
  offset: z.number().int().min(0).max(1_000_000),
  limit: z.number().int().min(1).max(100),
});
export const calendarIdInput = z.strictObject({ id: z.uuid() });
const plainText = (maximum: number) =>
  z
    .string()
    .refine(
      (value) =>
        !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\0') && [...value].length <= maximum,
    );
export const createCalendarInput = z.strictObject({
  title: accountName,
  recipientId: z.uuid(),
  background: z.enum(backgrounds),
});
export const doorContentInput = z.strictObject({ title: plainText(50), text: plainText(5000) });
export const saveDoorInput = z.strictObject({
  id: z.uuid(),
  number: z.number().int().min(1).max(24),
  ...doorContentInput.shape,
});
export const saveLayoutInput = z.strictObject({
  id: z.uuid(),
  layout: z.enum(['chronological', 'random']),
});
export type CreateCalendarInput = z.infer<typeof createCalendarInput>;

export function calendarBackgroundPath(background: string, thumbnail = false) {
  const id = backgrounds.find((value) => value === background) ?? 'woodland';
  return `/images/calendars/${id}${thumbnail ? '-thumb' : ''}.jpg`;
}
