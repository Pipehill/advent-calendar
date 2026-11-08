import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { RequestFailure } from './auth-feedback';
import { Button } from './ui/button';

export function CalendarListFrame({
  headingId,
  title,
  query,
  actions,
  children,
}: {
  headingId: string;
  title: string;
  query: {
    isPending: boolean;
    isFetching: boolean;
    error: unknown;
    data?: { totalCount: number };
    refetch: () => Promise<unknown>;
  };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8" aria-labelledby={headingId}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id={headingId} className="mr-auto font-serif text-2xl">
          {title}
          {!query.error && query.data && ` (${query.data.totalCount})`}
        </h2>
        {actions}
        <Button
          size="icon"
          variant="secondary"
          aria-label={m.calendar_refresh()}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </header>
      {query.isPending ? (
        <p role="status">{m.loading()}</p>
      ) : query.error ? (
        <RequestFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        children
      )}
    </section>
  );
}
