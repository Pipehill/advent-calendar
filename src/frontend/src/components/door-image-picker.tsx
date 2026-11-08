import * as m from '../generated/paraglide/messages.js';
import { maximumSourceImageBytes } from '../lib/calendar-input';
import { DoorImageView, useImageUrl } from './door-image';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function DoorImagePicker({
  file,
  hasImage,
  pending,
  title,
  changed,
  failed,
}: {
  file: File | null;
  hasImage: boolean;
  pending: boolean;
  title: string;
  changed: (file: File | null) => void;
  failed: (message: string) => void;
}) {
  const preview = useImageUrl(file);
  return (
    <div className="space-y-3">
      <label htmlFor="door-image">{m.calendar_image_label()}</label>
      <Input
        id="door-image"
        type="file"
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
      <p id="door-image-help" className="text-sm text-stone-600">
        {m.calendar_image_help()}
      </p>
      {preview && <DoorImageView src={preview} title={title} />}
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
