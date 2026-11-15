import { useForm } from '@tanstack/react-form';
import { LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { changePasswordInput, completePasswordSetupInput, loginInput } from '../lib/auth-input';
import { leaveSession } from '../lib/auth-navigation';
import { createLoginTransition } from '../lib/login-transition';
import type { RouterContext } from '../router';
import { authError, backendFieldErrors } from './auth-feedback';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function CredentialForm({
  context,
  changePassword = false,
  requiredSetup = false,
  administrator = false,
}: {
  context: RouterContext;
  changePassword?: boolean;
  requiredSetup?: boolean;
  administrator?: boolean;
}) {
  const [failure, setFailure] = useState('');
  const submitting = useRef(false);
  const [navigating, setNavigating] = useState(false);
  const [loginTransition] = useState(() =>
    createLoginTransition(context.auth.login, () => leaveSession(context, '/login-complete')),
  );
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
      ].filter((field) => !requiredSetup || field.name !== 'currentPassword')
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
        const input = requiredSetup
          ? { newPassword: value.newPassword }
          : changePassword
            ? { currentPassword: value.currentPassword, newPassword: value.newPassword }
            : { username: value.username, password: value.password };
        const schema = requiredSetup
          ? completePasswordSetupInput
          : changePassword
            ? changePasswordInput
            : loginInput;
        const result = schema.safeParse(input);
        if (!result.success) {
          if (!changePassword && loginTransition.authenticated) return undefined;
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
          if (requiredSetup) {
            await context.auth.completePasswordSetup({ newPassword: value.newPassword });
          } else {
            await context.auth.changePassword({
              currentPassword: value.currentPassword,
              newPassword: value.newPassword,
            });
          }
          formApi.reset();
          leaveSession(context, '/login?changed=1');
        } else {
          await loginTransition.submit({ username: value.username, password: value.password }, () =>
            setNavigating(true),
          );
        }
      } catch (error) {
        if (!changePassword && loginTransition.authenticated) {
          setNavigating(false);
          setFailure(m.login_navigation_failed());
          return;
        }
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
      method="post"
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (submitting.current || navigating) return;
        submitting.current = true;
        void form.handleSubmit().finally(() => {
          submitting.current = false;
        });
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
        {(submitting) => {
          const pending = submitting || navigating;
          return (
            <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
              {pending && (
                <LoaderCircle
                  data-login-spinner
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              <span role={pending ? 'status' : undefined}>
                {pending
                  ? m.auth_pending()
                  : changePassword
                    ? m.password_change_title()
                    : loginTransition.authenticated
                      ? m.retry_label()
                      : m.login_label()}
              </span>
            </Button>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
