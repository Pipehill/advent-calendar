import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { changePasswordInput, loginInput } from '../lib/auth-input';
import { leaveSession } from '../lib/auth-navigation';
import type { RouterContext } from '../router';
import { authError, backendFieldErrors } from './auth-feedback';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function CredentialForm({
  context,
  changePassword = false,
  administrator = false,
}: {
  context: RouterContext;
  changePassword?: boolean;
  administrator?: boolean;
}) {
  const [failure, setFailure] = useState('');
  const fields = changePassword
    ? [
        {
          name: 'currentPassword' as const,
          label: m.current_password(),
          type: 'password',
          autocomplete: 'current-password',
        },
        {
          name: 'newPassword' as const,
          label: m.new_password(),
          type: 'password',
          autocomplete: 'new-password',
        },
      ]
    : [
        {
          name: 'username' as const,
          label: m.username_label(),
          type: 'text',
          autocomplete: 'username',
        },
        {
          name: 'password' as const,
          label: m.password_label(),
          type: 'password',
          autocomplete: 'current-password',
        },
      ];
  const form = useForm({
    defaultValues: { username: '', password: '', currentPassword: '', newPassword: '' },
    validators: {
      onSubmit: ({ value }) => {
        const input = changePassword
          ? { currentPassword: value.currentPassword, newPassword: value.newPassword }
          : { username: value.username, password: value.password };
        const result = (changePassword ? changePasswordInput : loginInput).safeParse(input);
        if (!result.success) {
          return {
            fields: Object.fromEntries(
              result.error.issues.map((issue) => [issue.path[0], m.auth_field_invalid()]),
            ),
          };
        }
        if (changePassword && administrator && [...value.newPassword].length < 15) {
          return { fields: { newPassword: m.password_policy_admin() } };
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setFailure('');
      try {
        if (changePassword) {
          await context.auth.changePassword({
            currentPassword: value.currentPassword,
            newPassword: value.newPassword,
          });
          formApi.reset();
          leaveSession(context, '/login?changed=1');
        } else {
          const session = await context.auth.login({
            username: value.username,
            password: value.password,
          });
          formApi.reset();
          leaveSession(context, session.mustChangePassword ? '/change-password' : '/my-page');
        }
      } catch (error) {
        const errors = backendFieldErrors(error);
        formApi.setErrorMap({
          onSubmit: {
            fields: Object.fromEntries(
              Object.keys(errors).map((field) => [
                changePassword && field === 'password' ? 'newPassword' : field,
                m.auth_field_invalid(),
              ]),
            ),
          },
        });
        setFailure(authError(error, !changePassword));
      }
    },
  });
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {fields.map(({ name, label, type, autocomplete }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <div className="space-y-2">
              <label htmlFor={name} className="block font-medium">
                {label}
              </label>
              <Input
                id={name}
                name={name}
                type={type}
                autoComplete={autocomplete}
                autoCapitalize="none"
                spellCheck={false}
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={field.state.meta.errors.length ? `${name}-error` : undefined}
              />
              {field.state.meta.errors.length > 0 && (
                <p id={`${name}-error`} role="alert" className="text-sm text-red-800">
                  {m.auth_field_invalid()}
                </p>
              )}
            </div>
          )}
        </form.Field>
      ))}
      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
            {pending
              ? m.auth_pending()
              : changePassword
                ? m.password_change_title()
                : m.login_label()}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
