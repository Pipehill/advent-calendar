// Maintained shadcn/ui Dropdown Menu source, adapted to the application's palette
// and limited to action menus. Radix owns keyboard navigation and focus handling.
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={twMerge(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-stone-300 bg-white p-1 text-emerald-950 shadow-lg',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={twMerge(
        'relative flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm break-anywhere outline-none select-none focus:bg-emerald-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-70 pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}
