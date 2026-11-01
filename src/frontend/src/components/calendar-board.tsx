import * as m from '../generated/paraglide/messages.js';
import { calendarBackgroundPath } from '../lib/calendar-input';

export function CalendarBoard({
  background,
  order,
  selected,
  onSelect,
}: {
  background: string;
  order: number[];
  selected: number;
  onSelect: (number: number) => void;
}) {
  return (
    <div
      className="rounded-2xl bg-emerald-950 bg-cover bg-center p-4 shadow-sm sm:p-8"
      style={{ backgroundImage: `url("${calendarBackgroundPath(background)}")` }}
    >
      <ol
        aria-label={m.doors_label()}
        className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
      >
        {order.map((number) => (
          <li key={number}>
            <button
              type="button"
              aria-label={m.door_label({ number: String(number) })}
              aria-pressed={selected === number}
              onClick={() => onSelect(number)}
              className="door-tile flex aspect-square w-full cursor-pointer items-center justify-center rounded-xl border-2 font-serif text-3xl text-emerald-950 shadow-sm hover:bg-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white aria-pressed:border-emerald-900 aria-pressed:ring-2 aria-pressed:ring-white sm:text-4xl"
            >
              {number}
            </button>
          </li>
        ))}
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
