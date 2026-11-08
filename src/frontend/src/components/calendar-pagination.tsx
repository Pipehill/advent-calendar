import { ArrowLeft, ArrowRight } from 'lucide-react';
import * as m from '../generated/paraglide/messages.js';
import { Button } from './ui/button';

export function CalendarPagination({
  offset,
  limit,
  total,
  busy,
  label,
  onOffset,
}: {
  offset: number;
  limit: number;
  total: number;
  busy: boolean;
  label: string;
  onOffset: (offset: number) => void;
}) {
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center gap-3">
      <Button
        size="compact"
        variant="secondary"
        disabled={offset === 0 || busy}
        onClick={() => onOffset(Math.max(0, offset - limit))}
      >
        <ArrowLeft aria-hidden="true" />
        {m.calendar_previous()}
      </Button>
      <span role="status">
        {m.calendar_page({
          page: String(Math.floor(offset / limit) + 1),
          pages: String(Math.max(1, Math.ceil(total / limit))),
        })}
      </span>
      <Button
        size="compact"
        variant="secondary"
        disabled={offset + limit >= total || offset + limit > 1_000_000 || busy}
        onClick={() => onOffset(offset + limit)}
      >
        {m.calendar_next()}
        <ArrowRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
