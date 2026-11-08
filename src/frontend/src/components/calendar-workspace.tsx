import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, ListOrdered, Shuffle } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CalendarDto } from '../generated/backend';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import { type CalendarMode, calendarQueryOptions } from '../lib/calendar-navigation';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { authError } from './auth-feedback';
import { CalendarBoard } from './calendar-board';
import { CalendarDoorForm } from './calendar-door-form';
import { CalendarRecipientForm } from './calendar-recipient-form';
import { SavedDoorImage } from './door-image';
import { ErrorState, errorCode } from './error-state';
import { SessionControls } from './session-controls';
import { Button, buttonStyles } from './ui/button';

export function CalendarRouteError({ error }: { error: unknown }) {
  return (
    <div className="space-y-4">
      <ErrorState code={errorCode(error)} />
      <Link
        to="/my-page"
        preload={false}
        className={buttonStyles({ size: 'compact', variant: 'secondary' })}
      >
        {m.calendar_my_page()}
      </Link>
    </div>
  );
}

export function CalendarWorkspace({
  context,
  id,
  expiresAt,
  scope,
  mode = 'owner-edit',
}: {
  context: RouterContext;
  id: string;
  expiresAt: string;
  scope: string;
  mode?: CalendarMode;
}) {
  const preview = mode !== 'owner-edit';
  const options = calendarQueryOptions(context, id, mode);
  const query = useQuery({ ...options, staleTime: 0, gcTime: 0 });
  useProtectedQuery(context, query.error);
  const [selected, setSelected] = useState(1);
  const [layoutPending, setLayoutPending] = useState(false);
  const [layoutFailure, setLayoutFailure] = useState('');
  const layoutBusy = useRef(false);
  const update = (calendar: CalendarDto) => {
    context.queryClient.setQueryData(context.trpc.calendar.get.queryKey({ id }), calendar);
    context.queryClient.removeQueries({ queryKey: context.trpc.calendar.preview.queryKey({ id }) });
    context.queryClient.removeQueries({
      queryKey: context.trpc.calendar.image.queryKey(),
      type: 'inactive',
    });
  };
  const changeLayout = async (layout: 'chronological' | 'random') => {
    if (layoutBusy.current) return;
    layoutBusy.current = true;
    setLayoutPending(true);
    setLayoutFailure('');
    try {
      update(await context.auth.saveLayout({ id, layout }));
    } catch (error) {
      if (errorCode(error) === 'UNAUTHORIZED') return leaveSession(context, '/login');
      setLayoutFailure(authError(error));
    } finally {
      layoutBusy.current = false;
      setLayoutPending(false);
    }
  };
  if (query.error) return <ErrorState code={errorCode(query.error)} />;
  if (!query.data) return <p role="status">{m.loading()}</p>;
  const calendar = query.data;
  const door = calendar.doors.find((item) => item.number === selected);
  return (
    <section className="protected-content space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto min-w-0 basis-full break-anywhere font-serif text-3xl text-emerald-950 sm:basis-auto">
          {calendar.title} <span className="text-xl">{calendar.year}</span>
        </h1>
        {mode === 'system-preview' ? (
          <Link
            to="/my-page"
            search={{ tab: 'calendars' }}
            preload={false}
            className={buttonStyles({ size: 'compact', variant: 'secondary' })}
          >
            <ArrowLeft aria-hidden="true" />
            {m.calendar_back_overview()}
          </Link>
        ) : preview ? (
          <Link
            to="/calendars/$id"
            params={{ id }}
            preload={false}
            className={buttonStyles({ size: 'compact', variant: 'secondary' })}
          >
            <ArrowLeft aria-hidden="true" />
            {m.calendar_back_admin()}
          </Link>
        ) : (
          <>
            <Link
              to="/my-page"
              preload={false}
              className={buttonStyles({ size: 'compact', variant: 'secondary' })}
            >
              <ArrowLeft aria-hidden="true" />
              {m.calendar_my_page()}
            </Link>
            <Link
              to="/calendar-preview/$id"
              params={{ id }}
              preload={false}
              className={buttonStyles({ size: 'compact', variant: 'secondary' })}
            >
              <Eye aria-hidden="true" />
              {m.calendar_preview()}
            </Link>
          </>
        )}
        <SessionControls context={context} expiresAt={expiresAt} />
      </header>
      {preview ? (
        <p className="break-anywhere text-stone-600">
          {m.calendar_recipient()}: {calendar.recipientName} ({calendar.recipientUsername})
        </p>
      ) : (
        <CalendarRecipientForm context={context} calendar={calendar} saved={update} />
      )}
      {preview ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-emerald-950">
          {mode === 'system-preview'
            ? m.calendar_system_preview_notice()
            : m.calendar_preview_notice()}
        </p>
      ) : (
        <fieldset className="rounded-xl border border-stone-200 bg-white p-4">
          <legend className="px-2">{m.calendar_layout()}</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              size="compact"
              variant="secondary"
              disabled={layoutPending}
              aria-pressed={calendar.layout === 'chronological'}
              onClick={() => void changeLayout('chronological')}
            >
              <ListOrdered aria-hidden="true" />
              {m.calendar_chronological()}
            </Button>
            <Button
              size="compact"
              variant="secondary"
              disabled={layoutPending}
              aria-pressed={calendar.layout === 'random'}
              onClick={() => void changeLayout('random')}
            >
              <Shuffle aria-hidden="true" />
              {m.calendar_random()}
            </Button>
          </div>
          <p className="mt-2 text-sm text-stone-600">{m.calendar_layout_help()}</p>
          {layoutPending && <p role="status">{m.auth_pending()}</p>}
          {layoutFailure && (
            <p role="alert" className="text-red-800">
              {layoutFailure}
            </p>
          )}
        </fieldset>
      )}
      <CalendarBoard
        background={calendar.background}
        layout={calendar.layout}
        order={calendar.doorOrder}
        selected={selected}
        onSelect={setSelected}
      />
      {door && (
        <section
          className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6"
          aria-labelledby="selected-door-heading"
        >
          <h2 id="selected-door-heading" className="mb-2 font-serif text-2xl">
            {preview
              ? m.door_label({ number: String(selected) })
              : m.calendar_edit_door({ number: String(selected) })}
          </h2>
          <p className="mb-4 text-sm text-stone-600">
            {m.calendar_date({ day: String(selected), year: String(calendar.year) })}
          </p>
          {preview ? (
            <div className="break-anywhere whitespace-pre-wrap">
              <h3 className="mb-3 font-serif text-xl">{door.title}</h3>
              <SavedDoorImage
                key={`${scope}:${selected}:${door.image?.version}`}
                context={context}
                id={id}
                door={door}
                mode={mode}
                scope={scope}
              />
              {door.text && <p className="mt-3">{door.text}</p>}
              {!door.title && !door.text && !door.image && <p>{m.calendar_empty_door()}</p>}
            </div>
          ) : (
            <CalendarDoorForm
              key={`${scope}:${id}:${selected}`}
              context={context}
              id={id}
              door={door}
              scope={scope}
              saved={update}
            />
          )}
        </section>
      )}
    </section>
  );
}
