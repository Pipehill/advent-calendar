import { expect, test } from 'vitest';
import {
  accountName,
  createAccountInput,
  roleAccountInput,
  statusAccountInput,
  validPassword,
} from './account-input';

test('Given Unicode display names, When the schema normalizes input, Then .NET whitespace and code-point limits are preserved', () => {
  // Given supplementary letters, Norwegian names and whitespace that differs from JS trim.
  const input = '\u0085\u2003Ærlig Ørn 🎄\u0085';

  // When shared form/BFF validation normalizes the name.
  const name = accountName.parse(input);

  // Then internal content is unchanged and malformed/blank/overlong values fail.
  expect(name).toBe('Ærlig Ørn 🎄');
  expect(accountName.parse('🎄'.repeat(100))).toHaveLength(200);
  for (const invalid of ['', ' \u0085 ', '\ud800', 'a\0b', '🎄'.repeat(101)])
    expect(accountName.safeParse(invalid).success).toBe(false);
  expect(accountName.parse('\ufeffA\ufeff')).toBe('\ufeffA\ufeff');
});

test.each([
  ['Short!Aa', false, true],
  ['Short!Aa', true, false],
  ['LongTemporary!Ærlig', true, true],
  ['longtemporary!ærlig', true, false],
  ['LONGTEMPORARY!ÆRLIG', true, false],
  ['LongTemporary Ærlig', true, false],
  ['A!a'.repeat(43), false, false],
])(
  'Given password %s for administrator=%s, When policy validation runs, Then accepted=%s',
  (password, administrator, accepted) => {
    // Given the role-specific password input.
    const input = String(password);

    // When code points and character categories are checked without trimming.
    const result = validPassword(input, Boolean(administrator));

    // Then the role-aware policy is enforced.
    expect(result).toBe(accepted);
  },
);

test('Given forged roles and conditional fields, When administration schemas validate, Then obsolete responsibility and promotion secrets are rejected', () => {
  // Given valid account details and a target ID.
  const id = '00000000-0000-4000-8000-000000000001';
  const details = { name: 'Ærlig Ørn', username: 'ærlig.ørn_1', password: 'LongTemporary!Ærlig' };

  // When prohibited wire shapes are submitted directly to the shared schemas.
  const results = [
    createAccountInput.safeParse({ ...details, role: 'superadmin' }),
    createAccountInput.safeParse({
      ...details,
      role: 'calendarAdmin',
      responsibleAdministratorId: id,
    }),
    createAccountInput.safeParse({ ...details, role: 'calendarUser', createdById: id }),
    createAccountInput.safeParse({ ...details, role: 'calendarUser', username: 'a b' }),
    roleAccountInput.safeParse({ id, role: 'calendarUser', temporaryPassword: details.password }),
    roleAccountInput.safeParse({ id, role: 'calendarAdmin' }),
    statusAccountInput.safeParse({ id }),
    statusAccountInput.safeParse({ id, enabled: null }),
    statusAccountInput.safeParse({ id: 'not-a-uuid', enabled: true }),
  ];

  // Then no invalid operation reaches a backend call.
  expect(results.every((result) => !result.success)).toBe(true);
});
