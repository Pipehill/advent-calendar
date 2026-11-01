import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

// Maintained shadcn/ui textarea with the same focus/validation behavior as Input.
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={twMerge(
        'min-h-40 w-full rounded-xl border border-stone-300 bg-white p-3 text-base shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 aria-invalid:border-red-700 disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}
