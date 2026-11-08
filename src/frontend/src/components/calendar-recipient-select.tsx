import { clsx } from 'clsx';
import type { Ref } from 'react';
import * as m from '../generated/paraglide/messages.js';

export function CalendarRecipientSelect({
  value,
  recipients,
  onChange,
  onBlur,
  invalid,
  disabled = false,
  inputRef,
  compact = false,
}: {
  value: string;
  recipients: { id: string; name: string; username: string }[];
  onChange: (value: string) => void;
  onBlur: () => void;
  invalid: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLSelectElement>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'flex min-w-0 flex-wrap items-center gap-2 text-sm' : 'space-y-2'}>
      <label
        htmlFor="calendar-recipient"
        className={compact ? 'shrink-0 text-stone-600' : undefined}
      >
        {m.calendar_recipient()}
      </label>
      <select
        ref={inputRef}
        id="calendar-recipient"
        className={clsx(
          'rounded-xl border border-stone-300 bg-white focus-visible:outline-2 focus-visible:outline-emerald-800',
          compact
            ? 'min-h-9 min-w-0 flex-1 px-3 py-1.5 text-sm leading-5 pointer-coarse:min-h-11'
            : 'min-h-11 w-full p-3',
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={!compact || invalid ? 'calendar-recipient-error' : undefined}
      >
        <option value="">{m.calendar_choose_recipient()}</option>
        {recipients.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.username})
          </option>
        ))}
      </select>
      {(!compact || invalid) && (
        <p id="calendar-recipient-error" className="basis-full text-sm text-red-800">
          {invalid && m.calendar_invalid_field()}
        </p>
      )}
    </div>
  );
}
