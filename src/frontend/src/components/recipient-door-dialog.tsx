import { type KeyboardEvent, useEffect, useRef } from 'react';
import * as m from '../generated/paraglide/messages.js';
import type { DoorPresentation } from '../lib/use-recipient-opening';
import type { RouterContext } from '../router';
import { SavedDoorImage } from './door-image';
import { Button } from './ui/button';

function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  const edge = event.shiftKey ? first : last;
  if (document.activeElement === edge) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}

export function RecipientDoorDialog({
  presentation,
  context,
  id,
  scope,
  close,
  unavailable,
}: {
  presentation: DoorPresentation;
  context: RouterContext;
  id: string;
  scope: string;
  close: () => void;
  unavailable: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { result, origin } = presentation;
  const { door } = result;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    const source = origin.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    element.style.setProperty(
      '--door-origin-x',
      `${source.left + source.width / 2 - target.left - target.width / 2}px`,
    );
    element.style.setProperty(
      '--door-origin-y',
      `${source.top + source.height / 2 - target.top - target.height / 2}px`,
    );
    element.style.setProperty(
      '--door-origin-scale',
      String(Math.min(0.3, source.width / element.offsetWidth)),
    );
    return () => {
      element.close();
      if (origin.isConnected) origin.focus({ preventScroll: true });
    };
  }, [origin]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="recipient-door-heading"
      aria-modal="true"
      className="recipient-door-dialog rounded-2xl bg-white text-emerald-950 shadow-2xl"
      onClose={(event) => {
        // StrictMode rehearses cleanup/reopen; its queued close event must not
        // dismiss the dialog after the next effect has already opened it again.
        if (!event.currentTarget.open) close();
      }}
      onKeyDown={containFocus}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="sticky top-0 z-10 flex items-start gap-4 border-b border-stone-200 bg-white p-5">
        <h2
          id="recipient-door-heading"
          className="mr-auto whitespace-pre-wrap break-anywhere font-serif text-2xl"
        >
          {door.title.trim() ? door.title : m.door_label({ number: String(door.number) })}
        </h2>
        <Button variant="secondary" className="min-h-11" onClick={close}>
          {m.recipient_close()}
        </Button>
      </header>
      <div className="space-y-5 p-5 sm:p-8">
        {door.text && (
          <p className="whitespace-pre-wrap break-anywhere leading-relaxed text-stone-800">
            {door.text}
          </p>
        )}
        <SavedDoorImage
          key={`${scope}:${id}:${door.number}:${door.image?.version ?? ''}`}
          context={context}
          id={id}
          scope={scope}
          door={door}
          mode="recipient"
          onUnavailable={unavailable}
        />
      </div>
    </dialog>
  );
}
