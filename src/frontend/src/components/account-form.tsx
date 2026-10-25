import { useForm } from '@tanstack/react-form';
import { useEffect, useRef, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import {
  type AccountAction,
  type AccountFormValues,
  accountFormModel,
} from '../lib/account-form-values';
import {
  createAccountInput,
  resetAccountInput,
  roleAccountInput,
  statusAccountInput,
} from '../lib/account-input';
import { leaveSession } from '../lib/auth-navigation';
import type { RouterContext } from '../router';
import type { AccountMetadata } from '../server/accounts';
import { authError, backendFieldErrors } from './auth-feedback';
import { errorCode } from './error-state';
import { ResponsibleSelect } from './responsible-select';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function AccountForm({
  context,
  actorRole,
  action,
  target,
  onSuccess,
  onCancel,
}: {
  context: RouterContext;
  actorRole: string;
  action: AccountAction;
  target?: AccountMetadata;
  onSuccess: (id?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [failure, setFailure] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const submitting = useRef(false);
  const { hasPassword, passwordForAdministrator, responsibilityNeeded, payload, validate } =
    accountFormModel(action, actorRole, target);
  const form = useForm({
    defaultValues: {
      name: '',
      username: '',
      password: '',
      role: 'calendarUser',
      responsibleAdministratorId: '',
      verificationPassword: '',
    } as AccountFormValues,
    validators: { onSubmit: ({ value }) => validate(value, needsVerification) },
    onSubmit: async ({ value, formApi }) => {
      setFailure('');
      let verifying = needsVerification;
      try {
        if (verifying) {
          await context.auth.reauthenticate({ password: value.verificationPassword });
          formApi.setFieldValue('verificationPassword', '');
          setNeedsVerification(false);
          verifying = false;
        }
        let id: string | undefined;
        if (action === 'create')
          id = (await context.auth.createAccount(createAccountInput.parse(payload(value)))).id;
        else if (action === 'reset')
          await context.auth.resetAccount(resetAccountInput.parse(payload(value)));
        else if (action === 'status')
          await context.auth.changeAccountStatus(statusAccountInput.parse(payload(value)));
        else await context.auth.changeAccountRole(roleAccountInput.parse(payload(value)));
        formApi.reset();
        await onSuccess(id);
      } catch (error) {
        formApi.setFieldValue('verificationPassword', '');
        if (verifying && errorCode(error) === 'UNAUTHORIZED') {
          // Incorrect verification is also 401; inspect the session before discarding it.
          try {
            await context.auth.session();
          } catch (sessionError) {
            if (errorCode(sessionError) === 'UNAUTHORIZED') leaveSession(context, '/logg-inn');
          }
          setFailure(m.admin_verify_failed());
          return;
        }
        if (errorCode(error) === 'UNAUTHORIZED') {
          leaveSession(context, '/logg-inn');
          return;
        }
        if (verificationRequired(error)) {
          setNeedsVerification(true);
          setFailure(m.admin_verify_required());
          return;
        }
        const errors = backendFieldErrors(error);
        const fields = Object.fromEntries(
          Object.keys(errors).map((key) => [
            key === 'temporaryPassword' ? 'password' : key,
            key === 'username' && errorCode(error) === 'CONFLICT'
              ? m.admin_username_conflict()
              : m.auth_field_invalid(),
          ]),
        );
        formApi.setErrorMap({ onSubmit: { fields } });
        setFailure(
          errorCode(error) === 'CONFLICT'
            ? errors.username
              ? m.admin_username_conflict()
              : m.admin_conflict()
            : errorCode(error) === 'BAD_REQUEST'
              ? m.admin_invalid()
              : authError(error),
        );
      }
    },
  });
  useEffect(
    () => () => {
      form.reset();
    },
    [form],
  );

  function field(
    name: 'name' | 'username' | 'password' | 'verificationPassword',
    label: string,
    type = 'text',
  ) {
    return (
      <form.Field name={name}>
        {(input) => (
          <div className="space-y-2">
            <label className="block font-medium" htmlFor={`account-${name}`}>
              {label}
            </label>
            <Input
              id={`account-${name}`}
              name={name}
              type={type}
              autoComplete={
                type === 'password'
                  ? name === 'verificationPassword'
                    ? 'current-password'
                    : 'new-password'
                  : 'off'
              }
              autoCapitalize="none"
              spellCheck={false}
              required
              value={input.state.value}
              onBlur={input.handleBlur}
              onChange={(event) => input.handleChange(event.target.value)}
              aria-invalid={input.state.meta.errors.length > 0}
              aria-describedby={
                input.state.meta.errors.length ? `account-${name}-error` : undefined
              }
            />
            {input.state.meta.errors.length > 0 && (
              <p id={`account-${name}-error`} role="alert" className="text-sm text-red-800">
                {input.state.meta.errors.join(' ')}
              </p>
            )}
          </div>
        )}
      </form.Field>
    );
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Guard synchronously, including repeated Enter/programmatic submissions
        // before React has rendered the disabled pending fieldset.
        if (submitting.current) return;
        submitting.current = true;
        try {
          await form.handleSubmit();
        } finally {
          submitting.current = false;
        }
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <fieldset disabled={pending} className="min-w-0 space-y-5">
            {action === 'create' && (
              <>
                {field('name', m.admin_name())}
                {field('username', m.username_label())}
                {actorRole === 'superadmin' && (
                  <form.Field name="role">
                    {(input) => (
                      <div className="space-y-2">
                        <label className="block font-medium" htmlFor="account-role">
                          {m.admin_role()}
                        </label>
                        <select
                          id="account-role"
                          className="min-h-11 w-full rounded-xl border border-stone-300 bg-white p-3"
                          value={input.state.value}
                          onChange={(event) => {
                            input.handleChange(event.target.value as AccountFormValues['role']);
                            form.setFieldValue('responsibleAdministratorId', '');
                            form.setFieldValue('password', '');
                            form.setErrorMap({});
                            setFailure('');
                          }}
                        >
                          <option value="calendarUser">{m.role_user()}</option>
                          <option value="calendarAdmin">{m.role_admin()}</option>
                        </select>
                      </div>
                    )}
                  </form.Field>
                )}
              </>
            )}
            <form.Subscribe selector={(state) => state.values.role}>
              {(role) => (
                <>
                  {responsibilityNeeded(role) && (
                    <form.Field name="responsibleAdministratorId">
                      {(input) => (
                        <ResponsibleSelect
                          context={context}
                          excludeId={target?.id}
                          value={input.state.value}
                          onChange={input.handleChange}
                          errors={input.state.meta.errors}
                        />
                      )}
                    </form.Field>
                  )}
                  {action === 'role' &&
                    target?.role === 'calendarAdmin' &&
                    target.responsibleAdministratorId && <p>{m.admin_responsibility_fixed()}</p>}
                  {hasPassword && (
                    <>
                      <p className="text-sm text-stone-600">
                        {passwordForAdministrator(role)
                          ? m.password_policy_admin()
                          : m.password_policy_user()}
                      </p>
                      {field('password', m.admin_temporary_password(), 'password')}
                      <p className="text-sm text-stone-600">{m.admin_handover()}</p>
                    </>
                  )}
                </>
              )}
            </form.Subscribe>
            {action === 'reset' && <p>{m.admin_reset_effect()}</p>}
            {action === 'status' && (
              <p>{target?.enabled ? m.admin_disable_effect() : m.admin_enable_effect()}</p>
            )}
            {action === 'role' && (
              <p>
                {target?.role === 'calendarUser'
                  ? m.admin_promote_effect()
                  : m.admin_demote_effect()}
              </p>
            )}
            {needsVerification && (
              <>
                <p>{m.admin_verify_required()}</p>
                {field('verificationPassword', m.admin_verification_password(), 'password')}
              </>
            )}
            {failure && (
              <p role="alert" className="text-red-800">
                {failure}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? m.auth_pending() : m.admin_submit()}
              </Button>
              <Button
                onClick={() => {
                  form.reset();
                  onCancel();
                }}
              >
                {m.admin_cancel()}
              </Button>
            </div>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  );
}

function verificationRequired(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'data' in error &&
    !!error.data &&
    typeof error.data === 'object' &&
    'verificationRequired' in error.data &&
    error.data.verificationRequired === true
  );
}
