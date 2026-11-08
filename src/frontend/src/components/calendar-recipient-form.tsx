import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CalendarDto } from '../generated/backend';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import { recipientInput } from '../lib/calendar-input';
import type { RouterContext } from '../router';
import { authError, backendFieldErrors, RequestFailure } from './auth-feedback';
import { CalendarRecipientSelect } from './calendar-recipient-select';
import { errorCode } from './error-state';
import { Button } from './ui/button';

export function CalendarRecipientForm({
  context,
  calendar,
  saved,
}: {
  context: RouterContext;
  calendar: CalendarDto;
  saved: (calendar: CalendarDto) => void;
}) {
  const [editing, setEditing] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const recipientSelect = useRef<HTMLSelectElement>(null);
  const restoreFocus = useRef(false);
  const recipients = useQuery({
    ...context.trpc.calendar.recipients.queryOptions(),
    staleTime: 0,
    gcTime: 0,
    enabled: editing,
  });
  useEffect(() => {
    if (editing && !recipients.isPending) recipientSelect.current?.focus();
    if (!editing && restoreFocus.current) {
      changeButton.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing, recipients.isPending]);
  const submitting = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState('');
  const form = useForm({
    defaultValues: { recipientId: calendar.recipientId },
    validators: {
      onSubmit: ({ value }) =>
        recipientInput.safeParse(value).success
          ? undefined
          : { fields: { recipientId: m.calendar_invalid_field() } },
    },
    onSubmit: async ({ value, formApi }) => {
      setFeedback('');
      setFailure('');
      try {
        const updated = await context.auth.saveRecipient({ id: calendar.id, ...value });
        context.queryClient.removeQueries({ queryKey: context.trpc.calendar.list.queryKey() });
        saved(updated);
        formApi.reset(value);
        setFeedback(m.calendar_saved());
        restoreFocus.current = true;
        setEditing(false);
      } catch (error) {
        if (errorCode(error) === 'UNAUTHORIZED') return leaveSession(context, '/login');
        if (backendFieldErrors(error).recipientId)
          formApi.setErrorMap({
            onSubmit: { fields: { recipientId: m.calendar_invalid_field() } },
          });
        setFailure(authError(error));
      }
    },
  });
  const closeEditor = () => {
    form.reset({ recipientId: calendar.recipientId });
    setFailure('');
    setFeedback('');
    restoreFocus.current = true;
    setEditing(false);
  };
  if (!editing)
    return (
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-anywhere text-sm text-stone-600">
            {m.calendar_recipient()}: {calendar.recipientName} ({calendar.recipientUsername})
          </p>
          <Button
            ref={changeButton}
            size="compact"
            variant="secondary"
            onClick={() => {
              form.reset({ recipientId: calendar.recipientId });
              setFeedback('');
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" />
            {m.calendar_change_recipient()}
          </Button>
        </div>
        {feedback && <p role="status">{feedback}</p>}
      </div>
    );
  const choices = recipients.data ?? [];
  // Keep the stored association readable even if the account no longer holds the user role.
  const options = choices.some((user) => user.id === calendar.recipientId)
    ? choices
    : [
        {
          id: calendar.recipientId,
          name: calendar.recipientName,
          username: calendar.recipientUsername,
        },
        ...choices,
      ];
  return (
    <form
      className="space-y-3 text-sm"
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
      <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
        {([pending, dirty]) => (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="min-w-0 flex-1 basis-64 sm:max-w-md">
              <form.Field name="recipientId">
                {(field) => (
                  <CalendarRecipientSelect
                    compact
                    inputRef={recipientSelect}
                    value={field.state.value}
                    recipients={options}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    invalid={field.state.meta.errors.length > 0}
                    disabled={pending || recipients.isPending || !!recipients.error}
                  />
                )}
              </form.Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="compact"
                type="submit"
                disabled={pending || !dirty || recipients.isPending || !!recipients.error}
                aria-busy={pending}
              >
                <Save aria-hidden="true" />
                {pending ? m.auth_pending() : m.calendar_save_recipient()}
              </Button>
              <Button size="compact" variant="secondary" disabled={pending} onClick={closeEditor}>
                {m.admin_cancel()}
              </Button>
            </div>
          </div>
        )}
      </form.Subscribe>
      {recipients.isPending && <p role="status">{m.loading()}</p>}
      {recipients.error && (
        <RequestFailure error={recipients.error} retry={() => void recipients.refetch()} />
      )}
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}
