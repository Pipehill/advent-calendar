import { z } from 'zod';

const password = z.string().refine((value) => [...value].length >= 1 && [...value].length <= 128);
export const loginInput = z.strictObject({
  username: z.string().refine((value) => [...value].length >= 3 && [...value].length <= 64),
  password,
});

export const changePasswordInput = z.strictObject({
  currentPassword: password,
  newPassword: z.string().refine((value) => {
    const length = [...value].length;
    return (
      length >= 8 &&
      length <= 128 &&
      /\p{Lu}/u.test(value) &&
      /\p{Ll}/u.test(value) &&
      /[\p{P}\p{S}]/u.test(value)
    );
  }),
});
