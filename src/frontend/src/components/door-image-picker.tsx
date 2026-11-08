import { type ReactNode, useRef } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { maximumSourceImageBytes } from '../lib/calendar-input';
import { DoorImageView, useImageUrl } from './door-image';
import { Button } from './ui/button';

export function DoorImagePicker({
  file,
  hasImage,
  pending,
  title,
  savedImage,
  changed,
  failed,
}: {
  file: File | null;
  hasImage: boolean;
  pending: boolean;
  title: string;
  savedImage: ReactNode;
  changed: (file: File | null) => void;
  failed: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useImageUrl(file);
  return (
    <div className="space-y-3">
      <input
        ref={input}
        id="door-image"
        type="file"
        hidden
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        disabled={pending}
        aria-describedby="door-image-help"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          if (!selected) return;
          if (selected.size > maximumSourceImageBytes) return failed(m.calendar_image_too_large());
          if (
            !/\.(jpe?g|png)$/i.test(selected.name) &&
            !['image/jpeg', 'image/png'].includes(selected.type)
          )
            return failed(m.calendar_image_invalid());
          changed(selected);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="door-image">{m.calendar_image_label()}</label>
        <Button
          type="button"
          size="compact"
          variant="secondary"
          disabled={pending}
          aria-describedby="door-image-help door-image-selected"
          onClick={() => input.current?.click()}
        >
          {hasImage ? m.calendar_image_replace() : m.calendar_image_choose()}
        </Button>
        {hasImage && (
          <Button
            type="button"
            size="compact"
            variant="secondary"
            disabled={pending}
            onClick={() => changed(null)}
          >
            {m.calendar_image_remove()}
          </Button>
        )}
      </div>
      <div hidden={!hasImage} className="w-40 max-w-full space-y-1">
        {hasImage &&
          (preview ? <DoorImageView src={preview} title={title} thumbnail /> : savedImage)}
        <p
          id="door-image-selected"
          aria-live="polite"
          title={file?.name}
          className="truncate text-sm text-stone-600"
        >
          {file?.name}
        </p>
      </div>
      <p id="door-image-help" className="text-sm text-stone-600">
        {m.calendar_image_help()}
      </p>
    </div>
  );
}

export async function imageFileData(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Chunk conversion avoids argument and stack limits for supported source files.
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(''));
}
