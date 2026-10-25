import { z } from 'zod';

export const assignableRole = z.enum(['calendarAdmin', 'calendarUser']);
export const verificationInput = z.strictObject({
  password: z
    .string()
    .min(1)
    .refine((v) => [...v].length <= 128),
});

export function validPassword(value: string, administrator: boolean) {
  const length = [...value].length;
  return (
    !/[\uD800-\uDFFF]/u.test(value) &&
    !value.includes('\0') &&
    length >= (administrator ? 15 : 8) &&
    length <= 128 &&
    /\p{Lu}/u.test(value) &&
    /\p{Ll}/u.test(value) &&
    /[\p{P}\p{S}]/u.test(value)
  );
}

// Match .NET's Unicode whitespace rather than JavaScript's differing trim set.
function trimName(value: string) {
  const whitespace = (character: string) =>
    /\p{Z}/u.test(character) ||
    (character.charCodeAt(0) >= 9 && character.charCodeAt(0) <= 13) ||
    character.charCodeAt(0) === 133;
  let start = 0;
  let end = value.length;
  while (start < end && whitespace(value[start])) start++;
  while (end > start && whitespace(value[end - 1])) end--;
  return value.slice(start, end);
}
export const accountName = z
  .string()
  .transform(trimName)
  .refine(
    (v) =>
      !/[\uD800-\uDFFF]/u.test(v) &&
      !v.includes('\0') &&
      [...v].length >= 1 &&
      [...v].length <= 100,
  );
const username = z
  .string()
  .refine((v) => /^[\p{L}\p{Nd}._-]+$/u.test(v) && [...v].length >= 3 && [...v].length <= 64);

export const createAccountInput = z
  .strictObject({
    name: accountName,
    username,
    password: z.string(),
    role: assignableRole,
    responsibleAdministratorId: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!validPassword(value.password, value.role === 'calendarAdmin'))
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Invalid password' });
    if (value.role === 'calendarAdmin' && value.responsibleAdministratorId !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['responsibleAdministratorId'],
        message: 'Responsibility is not accepted',
      });
  });

export const accountPageInput = z.strictObject({
  offset: z.number().int().min(0).max(1_000_000),
  limit: z.number().int().min(1).max(100),
  focusId: z.uuid().optional(),
});
export const resetAccountInput = z.strictObject({
  id: z.uuid(),
  password: z.string().refine((v) => validPassword(v, false)),
});
export const statusAccountInput = z.strictObject({ id: z.uuid(), enabled: z.boolean() });
export const roleAccountInput = z
  .strictObject({
    id: z.uuid(),
    role: assignableRole,
    temporaryPassword: z.string().optional(),
    responsibleAdministratorId: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'calendarAdmin') {
      if (!validPassword(value.temporaryPassword ?? '', true))
        ctx.addIssue({
          code: 'custom',
          path: ['temporaryPassword'],
          message: 'Administrator password required',
        });
      if (value.responsibleAdministratorId !== undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['responsibleAdministratorId'],
          message: 'Responsibility is fixed',
        });
    } else if (value.temporaryPassword !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['temporaryPassword'],
        message: 'Only accepted for promotion',
      });
  });

export type CreateAccountInput = z.input<typeof createAccountInput>;
export type RoleAccountInput = z.infer<typeof roleAccountInput>;
