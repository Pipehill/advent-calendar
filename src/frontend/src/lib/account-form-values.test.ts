import { afterEach, expect, test } from 'vitest';
import { UserDtoRole } from '../generated/backend';
import { getLocale, overwriteGetLocale } from '../generated/paraglide/runtime';
import type { AccountMetadata } from '../server/accounts';
import { type AccountAction, accountFormModel } from './account-form-values';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

for (const locale of ['nb', 'en'] as const) {
  test.each([
    ['create', 'calendarUser', 'calendarUser', false],
    ['create', 'calendarAdmin', 'calendarUser', true],
    ['reset', 'calendarAdmin', 'calendarUser', false],
    ['reset', 'calendarUser', 'calendarAdmin', true],
    ['role', 'calendarUser', 'calendarUser', true],
  ] as const)(
    `Given ${locale} guidance for %s selected=%s target=%s, When the effective role is derived, Then temporary=%s matches the operation`,
    (action, selected, role, temporary) => {
      // Given the selected creation role or backend-validated maintenance target role.
      overwriteGetLocale(() => locale);
      const target: AccountMetadata = {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Recipient',
        username: 'recipient',
        role: role === 'calendarAdmin' ? UserDtoRole.CalendarAdmin : UserDtoRole.CalendarUser,
        enabled: true,
        responsibleAdministratorId: null,
      };
      const model = accountFormModel(action as AccountAction, 'superadmin', target);

      // When the same model supplies the label, policy and private handover instructions.
      const guidance = model.passwordGuidance(selected);

      // Then ordinary passwords can be kept and only administrator credentials claim expiry.
      expect(guidance.label).toBe(
        locale === 'en'
          ? temporary
            ? "Recipient's temporary password"
            : "Recipient's password"
          : temporary
            ? 'Mottakerens midlertidige passord'
            : 'Mottakerens passord',
      );
      expect(guidance.handover.includes('30')).toBe(temporary);
      expect(guidance.handover).toMatch(
        locale === 'en' ? /Privately.*identity-verified/ : /privat.*bekreftet identiteten/,
      );
      expect(guidance.handover).toMatch(
        locale === 'en' ? /will not be displayed again/ : /vises ikke igjen/,
      );
      if (!temporary) {
        expect(guidance.handover).toMatch(
          locale === 'en'
            ? /keep this password, or change it later/
            : /beholde passordet, eller bytte det senere/,
        );
        expect(guidance.handover).not.toMatch(
          /temporary|expire|must be changed|midlertidig|utløper|må byttes/i,
        );
      }
    },
  );
}

test('Given a superadmin creation draft, When the selected role changes, Then guidance follows the selected role without adding lifecycle flags to the payload', () => {
  // Given one form model and otherwise valid values.
  const model = accountFormModel('create', 'superadmin');
  const values = {
    name: 'Recipient',
    username: 'recipient',
    password: 'Compliant!Password',
    role: 'calendarUser' as const,
    responsibleAdministratorId: '00000000-0000-4000-8000-000000000001',
    verificationPassword: '',
  };

  // When the administrator switches roles and returns to ordinary-user creation.
  const ordinary = model.passwordGuidance(values.role);
  const administrator = model.passwordGuidance('calendarAdmin');
  const payload = model.payload(values);

  // Then labels update while credential lifecycle stays a backend decision.
  expect(ordinary.label).not.toBe(administrator.label);
  expect(model.passwordGuidance('calendarUser')).toEqual(ordinary);
  expect(payload).toEqual({
    name: values.name,
    username: values.username,
    password: values.password,
    role: values.role,
    responsibleAdministratorId: values.responsibleAdministratorId,
  });
});
