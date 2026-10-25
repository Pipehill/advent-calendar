import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import type { RouterContext } from '../router';
import { authError } from './auth-feedback';
import { errorCode } from './error-state';
import { Button } from './ui/button';

export function roleLabel(role: string) {
  if (role === 'superadmin') return m.role_superadmin();
  if (role === 'calendarAdmin') return m.role_admin();
  return m.role_user();
}

export function AccountList({ context }: { context: RouterContext }) {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const query = useQuery({
    ...context.trpc.accounts.list.queryOptions({ offset, limit }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    if (query.error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(errorCode(query.error)))
      leaveSession(context, '/logg-inn');
  }, [query.error, context]);
  return (
    <section className="mt-10" aria-labelledby="accounts-heading">
      <h2 id="accounts-heading" className="mb-4 font-serif text-2xl">
        {m.accounts_title()}
      </h2>
      {query.isFetching ? (
        <p role="status">{m.accounts_loading()}</p>
      ) : query.error ? (
        <div role="alert">
          <p>{authError(query.error)}</p>
          <Button onClick={() => void query.refetch()}>{m.retry_label()}</Button>
        </div>
      ) : query.data?.users.length ? (
        <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
          {query.data.users.map((user) => (
            <li key={user.username} className="grid gap-1 p-4 sm:grid-cols-3 sm:gap-4">
              <span className="break-anywhere font-semibold">{user.name}</span>
              <span className="break-anywhere text-stone-600">{user.username}</span>
              <span>{roleLabel(user.role)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{m.accounts_empty()}</p>
      )}
      <nav className="mt-4 flex flex-wrap items-center gap-4" aria-label={m.pagination_label()}>
        <Button
          disabled={offset === 0 || query.isFetching}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          {m.previous_page()}
        </Button>
        <span aria-live="polite">{m.page_number({ number: String(offset / limit + 1) })}</span>
        <Button
          disabled={
            !query.data?.hasMore || query.isFetching || !!query.error || offset + limit > 1_000_000
          }
          onClick={() => setOffset(offset + limit)}
        >
          {m.next_page()}
        </Button>
      </nav>
    </section>
  );
}
