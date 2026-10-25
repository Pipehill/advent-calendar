import * as m from '../generated/paraglide/messages.js';
import type { AccountMetadata } from '../server/accounts';
import {
  createAccountInput,
  resetAccountInput,
  roleAccountInput,
  statusAccountInput,
  validPassword,
} from './account-input';

export type AccountAction = 'create' | 'reset' | 'status' | 'role';
export type AccountFormValues = {
  name: string;
  username: string;
  password: string;
  role: 'calendarAdmin' | 'calendarUser';
  responsibleAdministratorId: string;
  verificationPassword: string;
};

const schemas = {
  create: createAccountInput,
  reset: resetAccountInput,
  status: statusAccountInput,
  role: roleAccountInput,
};

// Derive conditional UI and the exact wire shape together, so hidden values
// cannot accidentally survive a role/action change in the submitted payload.
export function accountFormModel(
  action: AccountAction,
  actorRole: string,
  target?: AccountMetadata,
) {
  const hasPassword =
    action === 'create' ||
    action === 'reset' ||
    (action === 'role' && target?.role === 'calendarUser');
  function passwordForAdministrator(role: string) {
    return action === 'create'
      ? role === 'calendarAdmin'
      : action === 'role' || target?.role === 'calendarAdmin';
  }
  function responsibilityNeeded(role: string) {
    return (
      actorRole === 'superadmin' &&
      ((action === 'create' && role === 'calendarUser') ||
        (action === 'role' &&
          target?.role === 'calendarAdmin' &&
          !target.responsibleAdministratorId))
    );
  }
  function payload(value: AccountFormValues) {
    const responsible = responsibilityNeeded(value.role)
      ? { responsibleAdministratorId: value.responsibleAdministratorId }
      : {};
    if (action === 'create')
      return {
        name: value.name,
        username: value.username,
        password: value.password,
        role: value.role,
        ...responsible,
      };
    if (action === 'reset') return { id: target?.id, password: value.password };
    if (action === 'status') return { id: target?.id, enabled: !target?.enabled };
    return {
      id: target?.id,
      role: target?.role === 'calendarUser' ? 'calendarAdmin' : 'calendarUser',
      ...(target?.role === 'calendarUser' ? { temporaryPassword: value.password } : responsible),
    };
  }
  function validate(value: AccountFormValues, needsVerification: boolean) {
    const result = schemas[action].safeParse(payload(value));
    const fields: Record<string, string> = {};
    if (!result.success)
      for (const issue of result.error.issues)
        fields[issue.path[0] === 'temporaryPassword' ? 'password' : String(issue.path[0])] =
          m.auth_field_invalid();
    if (responsibilityNeeded(value.role) && !value.responsibleAdministratorId)
      fields.responsibleAdministratorId = m.admin_responsible_required();
    if (hasPassword && !validPassword(value.password, passwordForAdministrator(value.role)))
      fields.password = passwordForAdministrator(value.role)
        ? m.password_policy_admin()
        : m.password_policy_user();
    if (needsVerification && !value.verificationPassword)
      fields.verificationPassword = m.admin_verify_required();
    return Object.keys(fields).length ? { fields } : undefined;
  }
  return { hasPassword, passwordForAdministrator, responsibilityNeeded, payload, validate };
}
