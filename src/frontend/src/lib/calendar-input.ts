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
export const maximumSourceImageBytes = 10_000_000;
const imageChange = {
  imageAction: z.enum(['keep', 'replace', 'remove']).optional(),
  imageData: z.string().min(1).max(13_333_336).optional(),
};
export const saveDoorInput = z
  .strictObject({
    id: z.uuid(),
    number: z.number().int().min(1).max(24),
    ...doorContentInput.shape,
    ...imageChange,
  })
  .superRefine((value, context) => {
    const replace = value.imageAction === 'replace';
    if (replace ? !value.imageData : value.imageData !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['imageData'],
        message: 'Invalid image action/data',
      });
    if (
      value.imageData &&
      (value.imageData.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(value.imageData) ||
        (value.imageData.length / 4) * 3 -
          (value.imageData.endsWith('==') ? 2 : value.imageData.endsWith('=') ? 1 : 0) >
          maximumSourceImageBytes)
    )
      context.addIssue({ code: 'custom', path: ['imageData'], message: 'Invalid image data' });
  });
export const doorImageInput = z.strictObject({
  id: z.uuid(),
  number: z.number().int().min(1).max(24),
  version: z.uuid(),
  mode: z.enum(['owner-edit', 'owner-preview', 'system-preview']),
  scope: z.string().regex(/^[a-f0-9]{64}$/),
});
export const saveLayoutInput = z.strictObject({
  id: z.uuid(),
  layout: z.enum(['chronological', 'random']),
});
export const recipientInput = z.strictObject({ recipientId: z.uuid() });
export const saveRecipientInput = calendarIdInput.extend(recipientInput.shape);
export type CreateCalendarInput = z.infer<typeof createCalendarInput>;

export function calendarBackgroundPath(background: string, thumbnail = false) {
  const id = backgrounds.find((value) => value === background) ?? 'woodland';
  return `/images/calendars/${id}${thumbnail ? '-thumb' : ''}.jpg`;
}
