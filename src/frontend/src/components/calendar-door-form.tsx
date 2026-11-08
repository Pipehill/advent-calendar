import { useForm } from '@tanstack/react-form';
import { Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CalendarDto, DoorDto } from '../generated/backend';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import { doorContentInput } from '../lib/calendar-input';
import type { RouterContext } from '../router';
import { authError, backendFieldErrors } from './auth-feedback';
import { calendarFieldErrors, validateCalendarForm } from './calendar-form-validation';
import { SavedDoorImage } from './door-image';
import { DoorImagePicker, imageFileData } from './door-image-picker';
import { errorCode } from './error-state';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useFormSubmit } from './use-form-submit';

export function CalendarDoorForm({
  context,
  id,
  door,
  scope,
  saved,
}: {
  context: RouterContext;
  id: string;
  door: DoorDto;
  scope: string;
  saved: (calendar: CalendarDto) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [imageAction, setImageAction] = useState<'keep' | 'replace' | 'remove'>('keep');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const form = useForm({
    defaultValues: { title: door.title, text: door.text },
    validators: {
      onSubmit: ({ value }) => validateCalendarForm(doorContentInput, value),
    },
    onSubmit: async ({ value, formApi }) => {
      setFeedback('');
      setFailure('');
      try {
        const imageData = file ? await imageFileData(file) : undefined;
        if (!active.current) return;
        const calendar = await context.auth.saveDoor({
          id,
          number: door.number,
          ...value,
          imageAction,
          imageData,
        });
        if (!active.current) return;
        saved(calendar);
        formApi.reset(value);
        setFile(null);
        setImageAction('keep');
        setFeedback(m.calendar_saved());
      } catch (error) {
        if (!active.current) return;
        if (errorCode(error) === 'UNAUTHORIZED') return leaveSession(context, '/login');
        formApi.setErrorMap({
          onSubmit: calendarFieldErrors(Object.keys(backendFieldErrors(error))),
        });
        const imageError = Object.keys(backendFieldErrors(error)).some((field) =>
          field.startsWith('image'),
        );
        const message =
          imageError && errorCode(error) !== 'PAYLOAD_TOO_LARGE'
            ? m.calendar_image_invalid()
            : authError(error);
        setFailure(`${m.calendar_save_failed()} ${message}`);
      }
    },
  });
  const submit = useFormSubmit(form.handleSubmit);
  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-stone-600">{m.calendar_content_help()}</p>
      <form.Field name="title">
        {(field) => (
          <div className="space-y-2">
            <label htmlFor="door-title">
              {m.calendar_door_title()}{' '}
              <span className="text-sm text-stone-500">({[...field.state.value].length}/50)</span>
            </label>
            <Input
              id="door-title"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="door-title-error"
            />
            <p id="door-title-error" className="text-sm text-red-800">
              {field.state.meta.errors.join(' ')}
            </p>
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => [state.isSubmitting, state.values.title] as const}>
        {([pending, title]) => (
          <>
            {imageAction === 'keep' && (
              <SavedDoorImage
                context={context}
                id={id}
                door={door}
                mode="owner-edit"
                scope={scope}
              />
            )}
            <DoorImagePicker
              file={file}
              hasImage={!!file || (imageAction === 'keep' && !!door.image)}
              pending={pending}
              title={title}
              failed={setFailure}
              changed={(selected) => {
                setFile(selected);
                setImageAction(selected ? 'replace' : 'remove');
                setFeedback('');
                setFailure('');
              }}
            />
            {pending && file && <p role="status">{m.calendar_image_processing()}</p>}
          </>
        )}
      </form.Subscribe>
      <form.Field name="text">
        {(field) => (
          <div className="space-y-2">
            <label htmlFor="door-text">
              {m.calendar_door_text()}{' '}
              <span className="text-sm text-stone-500">({[...field.state.value].length}/5000)</span>
            </label>
            <Textarea
              id="door-text"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="door-text-error"
            />
            <p id="door-text-error" className="text-sm text-red-800">
              {field.state.meta.errors.join(' ')}
            </p>
          </div>
        )}
      </form.Field>
      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}
      {feedback && <p role="status">{feedback}</p>}
      <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
        {([pending, dirty]) => (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="compact" type="submit" disabled={pending} aria-busy={pending}>
              <Save aria-hidden="true" />
              {pending ? m.auth_pending() : m.calendar_save()}
            </Button>
            {(dirty || imageAction !== 'keep') && (
              <p className="text-sm text-stone-600">{m.calendar_unsaved()}</p>
            )}
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
