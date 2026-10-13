// Maintained shadcn/ui Card source, adapted for the calendar's static tiles.

import { clsx } from 'clsx';
import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={twMerge(clsx('rounded-2xl border border-stone-200 bg-white shadow-sm', className))}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={twMerge(clsx('p-6', className))} {...props} />;
}
