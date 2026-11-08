import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import type { DoorDto } from '../generated/backend';
import * as m from '../generated/paraglide/messages.js';
import type { CalendarMode } from '../lib/calendar-navigation';
import { useProtectedQuery } from '../lib/use-protected-query';
import type { RouterContext } from '../router';
import { authError } from './auth-feedback';
import { errorCode } from './error-state';
import { Button } from './ui/button';

export function useImageUrl(blob: Blob | null) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setImage({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return image?.blob === blob ? image.url : undefined;
}

export function DoorImageView({
  src,
  title,
  thumbnail = false,
}: {
  src: string;
  title: string;
  thumbnail?: boolean;
}) {
  return (
    <img
      src={src}
      alt={title.trim() ? title : m.calendar_image_alt()}
      className={clsx(
        'h-auto max-w-full rounded-lg object-contain',
        thumbnail ? 'max-h-40' : 'mx-auto max-h-[70vh]',
      )}
    />
  );
}

export function SavedDoorImage({
  context,
  id,
  door,
  mode,
  scope,
  onUnavailable,
}: {
  context: RouterContext;
  id: string;
  door: DoorDto;
  mode: CalendarMode;
  scope: string;
  onUnavailable?: () => void;
}) {
  const options =
    mode === 'recipient'
      ? context.trpc.recipient.image.queryOptions({
          id,
          number: door.number,
          version: door.image?.version ?? id,
          scope,
        })
      : context.trpc.calendar.image.queryOptions({
          id,
          number: door.number,
          version: door.image?.version ?? id,
          mode,
          scope,
        });
  const query = useQuery({
    ...options,
    enabled: !!door.image && !!scope,
    staleTime: 0,
    gcTime: 0,
  });
  useProtectedQuery(context, query.error);
  useEffect(() => {
    if (
      query.error &&
      ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(errorCode(query.error))
    )
      onUnavailable?.();
  }, [query.error, onUnavailable]);
  const data = query.data?.metadata.version === door.image?.version ? query.data : undefined;
  const blob = useMemo(() => {
    if (!data) return null;
    const bytes = Uint8Array.from(atob(data.data), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: data.metadata.mediaType });
  }, [data]);
  const url = useImageUrl(blob);
  if (!door.image) return null;
  if (query.error)
    return (
      <div role="alert">
        {m.calendar_image_load_failed()} {authError(query.error)}
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {m.retry_label()}
        </Button>
      </div>
    );
  if (!url) return <p role="status">{m.loading()}</p>;
  return <DoorImageView src={url} title={door.title} thumbnail={mode === 'owner-edit'} />;
}
