import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecipientDoorDto } from '../generated/backend';
import * as m from '../generated/paraglide/messages.js';
import { calendarBackgroundPath } from '../lib/calendar-input';
import { scatteredLayout } from '../lib/calendar-layout';
import { recipientDoorLabel } from '../lib/recipient-presentation';

export function CalendarBoard({
  background,
  layout,
  order,
  selected,
  onSelect,
  recipientDoors,
  opening,
  pending = false,
}: {
  background: string;
  layout: string;
  order: number[];
  selected: number;
  onSelect: (number: number, element: HTMLButtonElement) => void;
  recipientDoors?: RecipientDoorDto[];
  opening?: number;
  pending?: boolean;
}) {
  const board = useRef<HTMLOListElement>(null);
  // SSR and the first client render agree; measurement only adapts geometry.
  const [width, setWidth] = useState(248);
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => scatteredLayout(order, width), [order, width]);
  const random = layout === 'random';
  return (
    <div
      className="rounded-2xl bg-emerald-950 bg-cover bg-center p-4 shadow-sm sm:p-8"
      style={{ backgroundImage: `url("${calendarBackgroundPath(background)}")` }}
    >
      <ol
        ref={board}
        aria-label={m.doors_label()}
        className={
          random
            ? 'calendar-doors calendar-doors-scattered'
            : 'calendar-doors calendar-doors-chronological grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6'
        }
        style={random ? { height: geometry.height } : undefined}
      >
        {geometry.doors.map(({ number, x, y, size }) => {
          const door = recipientDoors?.find((door) => door.number === number);
          const unavailable = pending || (!!door && door.state !== 'available');
          return (
            <li
              key={number}
              style={random ? { left: x, top: y, width: size, height: size } : undefined}
            >
              <button
                type="button"
                aria-label={
                  door ? recipientDoorLabel(door) : m.door_label({ number: String(number) })
                }
                title={door ? recipientDoorLabel(door) : undefined}
                aria-pressed={recipientDoors ? undefined : selected === number}
                aria-haspopup={recipientDoors ? 'dialog' : undefined}
                aria-disabled={unavailable || undefined}
                data-state={door?.state}
                data-opened={door?.openedAt ? true : undefined}
                data-opening={opening === number ? true : undefined}
                data-door-number={number}
                onClick={(event) => {
                  if (!unavailable) onSelect(number, event.currentTarget);
                }}
                className="door-tile flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 font-serif text-2xl text-emerald-950 sm:text-3xl"
              >
                <span className="door-number">{number}</span>
                {door?.openedAt && (
                  <span className="door-opened-mark" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function backgroundLabel(background: string) {
  const labels: Record<string, () => string> = {
    woodland: m.calendar_woodland,
    sleigh: m.calendar_sleigh,
    playtime: m.calendar_playtime,
    aurora: m.calendar_aurora,
  };
  return (labels[background] ?? m.calendar_woodland)();
}
