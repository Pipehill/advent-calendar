// Maintained shadcn/ui Input source using the application's existing palette.
import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={twMerge(
        'min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 aria-invalid:border-red-700 disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}
