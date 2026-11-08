import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { CalendarPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import {
  backgrounds,
  type CreateCalendarInput,
  calendarBackgroundPath,
  createCalendarInput,
} from '../lib/calendar-input';
import type { RouterContext } from '../router';
import { authError, backendFieldErrors, RequestFailure } from './auth-feedback';
import { backgroundLabel } from './calendar-board';
import { CalendarRecipientSelect } from './calendar-recipient-select';
import { errorCode } from './error-state';
import { Button, buttonStyles } from './ui/button';
import { Input } from './ui/input';

export function CalendarCreateForm({ context }: { context: RouterContext }) {
  const navigate = useNavigate();
  const recipients = useQuery({
    ...context.trpc.calendar.recipients.queryOptions(),
    staleTime: 0,
    gcTime: 0,
  });
  const submitting = useRef(false);
  const [failure, setFailure] = useState('');
  const form = useForm({
    defaultValues: { title: '', recipientId: '', background: 'woodland' } as CreateCalendarInput,
    validators: {
      onSubmit: ({ value }) => {
        const result = createCalendarInput.safeParse(value);
        if (!result.success)
          return {
            fields: Object.fromEntries(
              result.error.issues.map((issue) => [
                String(issue.path[0]),
                m.calendar_invalid_field(),
              ]),
            ),
          };
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setFailure('');
      try {
        const calendar = await context.auth.createCalendar(createCalendarInput.parse(value));
        context.queryClient.removeQueries({ queryKey: context.trpc.calendar.list.queryKey() });
        await navigate({ to: '/calendars/$id', params: { id: calendar.id } });
      } catch (error) {
        if (errorCode(error) === 'UNAUTHORIZED') return leaveSession(context, '/login');
        formApi.setErrorMap({
          onSubmit: {
            fields: Object.fromEntries(
              Object.keys(backendFieldErrors(error)).map((field) => [
                field,
                m.calendar_invalid_field(),
              ]),
            ),
          },
        });
        setFailure(authError(error));
      }
    },
  });
  if (recipients.isPending) return <p role="status">{m.loading()}</p>;
  if (recipients.error)
    return <RequestFailure error={recipients.error} retry={() => void recipients.refetch()} />;
  if (!recipients.data?.length)
    return (
      <div>
        <p>{m.calendar_no_recipients()}</p>
        <Link to="/create-account" preload={false} className={buttonStyles({ size: 'compact' })}>
          {m.create_user()}
        </Link>
      </div>
    );
  return (
    <form
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        try {
          await form.handleSubmit();
        } finally {
          submitting.current = false;
        }
      }}
    >
      <form.Field name="title">
        {(field) => (
          <div className="space-y-2">
            <label htmlFor="calendar-title">{m.calendar_name()}</label>
            <Input
              id="calendar-title"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="calendar-title-error"
            />
            <p id="calendar-title-error" className="text-sm text-red-800">
              {field.state.meta.errors.length > 0 && m.calendar_title_limit()}
            </p>
          </div>
        )}
      </form.Field>
      <form.Field name="recipientId">
        {(field) => (
          <CalendarRecipientSelect
            value={field.state.value}
            recipients={recipients.data}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            invalid={field.state.meta.errors.length > 0}
          />
        )}
      </form.Field>
      <form.Field name="background">
        {(field) => (
          <fieldset>
            <legend className="mb-3">{m.calendar_background()}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {backgrounds.map((background) => (
                <label
                  key={background}
                  className="relative cursor-pointer rounded-xl border border-stone-300 bg-white p-2 has-checked:border-emerald-800 has-checked:ring-2 has-checked:ring-emerald-800 has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-emerald-800"
                >
                  <img
                    src={calendarBackgroundPath(background, true)}
                    alt=""
                    width="384"
                    height="256"
                    className="aspect-[3/2] w-full rounded-lg object-cover"
                  />
                  <span className="mt-2 flex items-center gap-2">
                    <input
                      type="radio"
                      name="background"
                      value={background}
                      checked={field.state.value === background}
                      onChange={() => field.handleChange(background)}
                    />
                    {backgroundLabel(background)}
                  </span>
                </label>
              ))}
            </div>
            {field.state.meta.errors.length > 0 && <p role="alert">{m.calendar_invalid_field()}</p>}
          </fieldset>
        )}
      </form.Field>
      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button type="submit" disabled={pending} aria-busy={pending}>
            <CalendarPlus aria-hidden="true" />
            {pending ? m.auth_pending() : m.create_calendar()}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
