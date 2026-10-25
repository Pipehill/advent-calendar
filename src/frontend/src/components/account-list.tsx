import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import type { AccountAction } from '../lib/account-form-values';
import { leaveSession } from '../lib/auth-navigation';
import type { RouterContext } from '../router';
import type { AccountMetadata } from '../server/accounts';
import { AccountForm } from './account-form';
import { RequestFailure } from './auth-feedback';
import { errorCode } from './error-state';
import { Button } from './ui/button';

export function roleLabel(role: string) {
  if (role === 'superadmin') return m.role_superadmin();
  if (role === 'calendarAdmin') return m.role_admin();
  return m.role_user();
}

export function AccountList({ context, actorRole }: { context: RouterContext; actorRole: string }) {
  const [offset, setOffset] = useState(0);
  const [focusId, setFocusId] = useState(context.administration.createdId);
  const [success, setSuccess] = useState(context.administration.createdId ? m.admin_created() : '');
  const [selected, setSelected] = useState<{ action: AccountAction; target: AccountMetadata }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const limit = 50;
  const query = useQuery({
    ...context.trpc.accounts.list.queryOptions({ offset, limit, ...(focusId ? { focusId } : {}) }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    context.administration.createdId = undefined;
  }, [context]);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (query.error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(errorCode(query.error)))
      leaveSession(context, '/logg-inn');
  }, [query.error, context]);
  return (
    <section className="mt-10" aria-labelledby="accounts-heading">
      <h2 id="accounts-heading" className="mb-4 font-serif text-2xl">
        {actorRole === 'superadmin' ? m.accounts_title() : m.admin_assigned_accounts()}
      </h2>
      {success && (
        <p role="status" className="mb-4">
          {success}
        </p>
      )}
      <Button
        className="mb-4"
        disabled={query.isFetching || !!selected}
        onClick={() => void query.refetch()}
      >
        {m.admin_refresh()}
      </Button>
      {selected && (
        <section
          className="mb-6 rounded-2xl border border-stone-300 bg-white p-5"
          aria-labelledby="account-action-heading"
        >
          <h3
            id="account-action-heading"
            ref={heading}
            tabIndex={-1}
            className="mb-4 break-anywhere text-xl font-semibold"
          >
            {actionLabel(selected.action, selected.target)}: {selected.target.name} (
            {selected.target.username})
          </h3>
          <AccountForm
            key={`${selected.target.id}-${selected.action}`}
            context={context}
            actorRole={actorRole}
            action={selected.action}
            target={selected.target}
            onCancel={() => setSelected(undefined)}
            onSuccess={async () => {
              setSelected(undefined);
              setSuccess(m.admin_saved());
              await context.queryClient.invalidateQueries({
                queryKey: context.trpc.accounts.administrators.queryKey(),
              });
              await query.refetch();
            }}
          />
        </section>
      )}
      {query.isFetching ? (
        <p role="status">{m.accounts_loading()}</p>
      ) : query.error ? (
        <RequestFailure error={query.error} retry={() => void query.refetch()} />
      ) : query.data?.users.length ? (
        <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
          {query.data.users.map((user) => (
            <li
              key={user.id}
              className="grid min-w-0 gap-2 p-4 sm:grid-cols-3 sm:gap-4"
              data-account-id={user.id}
            >
              <span className="break-anywhere font-semibold">{user.name}</span>
              <span className="break-anywhere text-stone-600">{user.username}</span>
              <span>
                {roleLabel(user.role)} · {user.enabled ? m.admin_enabled() : m.admin_disabled()}
              </span>
              {user.role !== 'superadmin' && (
                <div className="flex flex-wrap gap-2 sm:col-span-3">
                  {(actorRole === 'superadmin'
                    ? (['reset', 'status', 'role'] as const)
                    : (['reset'] as const)
                  ).map((action) => (
                    <Button
                      key={action}
                      disabled={!!selected}
                      aria-label={`${actionLabel(action, user)}: ${user.username}`}
                      onClick={() => {
                        setSuccess('');
                        setSelected({ action, target: user });
                      }}
                    >
                      {actionLabel(action, user)}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>{m.accounts_empty()}</p>
      )}
      <nav className="mt-4 flex flex-wrap items-center gap-4" aria-label={m.pagination_label()}>
        <Button
          disabled={(query.data?.offset ?? offset) === 0 || query.isFetching || !!selected}
          onClick={() => {
            setOffset(Math.max(0, (query.data?.offset ?? offset) - limit));
            setFocusId(undefined);
          }}
        >
          {m.previous_page()}
        </Button>
        <span aria-live="polite">
          {m.page_number({ number: String((query.data?.offset ?? offset) / limit + 1) })}
        </span>
        <Button
          disabled={
            !query.data?.hasMore ||
            query.isFetching ||
            !!query.error ||
            !!selected ||
            (query.data?.offset ?? offset) + limit > 1_000_000
          }
          onClick={() => {
            setOffset((query.data?.offset ?? offset) + limit);
            setFocusId(undefined);
          }}
        >
          {m.next_page()}
        </Button>
      </nav>
    </section>
  );
}

function actionLabel(action: AccountAction, target: AccountMetadata) {
  if (action === 'reset') return m.admin_reset();
  if (action === 'status') return target.enabled ? m.admin_disable() : m.admin_enable();
  return target.role === 'calendarUser' ? m.admin_promote() : m.admin_demote();
}
