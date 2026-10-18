// Maintained shadcn/ui Button source, limited to the application's current needs.
import { clsx } from 'clsx';
import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

export function Button({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  return (
    <button
      data-slot="button"
      type={type}
      className={twMerge(
        clsx(
          'inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-950 px-5 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-70',
          className,
        ),
      )}
      {...props}
    />
  );
}
