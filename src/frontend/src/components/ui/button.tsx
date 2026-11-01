// Maintained shadcn/ui Button source, limited to the application's current needs.
import { clsx } from 'clsx';
import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

type ButtonStyle = {
  size?: 'default' | 'compact' | 'icon';
  variant?: 'primary' | 'secondary' | 'quiet';
  className?: string;
};

export function buttonStyles({
  size = 'default',
  variant = 'primary',
  className,
}: ButtonStyle = {}) {
  return twMerge(
    clsx(
      'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      size === 'default' && 'min-h-11 px-5 py-2',
      size === 'compact' && 'min-h-9 px-3 py-1.5 pointer-coarse:min-h-11',
      size === 'icon' && 'size-9 pointer-coarse:size-11',
      variant === 'primary' && 'bg-emerald-950 text-white enabled:hover:bg-emerald-900',
      variant === 'secondary' &&
        'border border-stone-300 bg-white text-emerald-950 enabled:hover:bg-stone-100',
      variant === 'quiet' &&
        'text-emerald-950 enabled:hover:bg-stone-100 data-[state=open]:bg-stone-100',
      className,
    ),
  );
}

export function Button({
  className,
  size,
  variant,
  type = 'button',
  ...props
}: ComponentProps<'button'> & ButtonStyle) {
  return (
    <button
      data-slot="button"
      type={type}
      className={buttonStyles({ size, variant, className })}
      {...props}
    />
  );
}
