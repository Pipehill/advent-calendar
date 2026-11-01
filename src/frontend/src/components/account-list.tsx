import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, RefreshCw, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as m from '../generated/paraglide/messages.js';
import type { AccountAction } from '../lib/account-form-values';
import { leaveSession } from '../lib/auth-navigation';
import type { RouterContext } from '../router';
import type { AccountMetadata } from '../server/accounts';
import { AccountActions, accountActionLabel } from './account-actions';
import { AccountForm } from './account-form';
import { RequestFailure } from './auth-feedback';
import { errorCode } from './error-state';
import { Button, buttonStyles } from './ui/button';

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
  const listHeading = useRef<HTMLHeadingElement>(null);
  const rowControls = useRef(new Map<string, HTMLButtonElement>());
  const [focusAfterLoad, setFocusAfterLoad] = useState(context.administration.createdId);
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
    if (focusAfterLoad && !selected && !query.isFetching) {
      // Mutations may remove the target from this authorized page.
      (rowControls.current.get(focusAfterLoad) ?? listHeading.current)?.focus();
      setFocusAfterLoad(undefined);
    }
  }, [focusAfterLoad, selected, query.isFetching]);
  useEffect(() => {
    if (query.error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(errorCode(query.error)))
      leaveSession(context, '/login');
  }, [query.error, context]);
  return (
    <section className="mt-10" aria-labelledby="accounts-heading">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h2
          id="accounts-heading"
          ref={listHeading}
          tabIndex={-1}
          className="mr-auto min-w-0 break-anywhere font-serif text-2xl"
        >
          {actorRole === 'superadmin' ? m.accounts_title() : m.admin_assigned_accounts()}
          {query.data && ` (${query.data.totalCount})`}
        </h2>
        {(actorRole === 'superadmin' || actorRole === 'calendarAdmin') && (
          <Link to="/create-account" className={buttonStyles({ size: 'compact' })}>
            <UserPlus aria-hidden="true" />
            {actorRole === 'superadmin' ? m.admin_create_account() : m.create_user()}
          </Link>
        )}
        <Button
          size="icon"
          variant="secondary"
          aria-label={m.admin_refresh()}
          disabled={query.isFetching || !!selected}
          onClick={() => void query.refetch()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </header>
      {success && (
        <p role="status" className="mb-4">
          {success}
        </p>
      )}
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
            {accountActionLabel(selected.action, selected.target)}: {selected.target.name} (
            {selected.target.username})
          </h3>
          <AccountForm
            key={`${selected.target.id}-${selected.action}`}
            context={context}
            actorRole={actorRole}
            action={selected.action}
            target={selected.target}
            onCancel={() => {
              setFocusAfterLoad(selected.target.id);
              setSelected(undefined);
            }}
            onSuccess={async () => {
              setSuccess(m.admin_saved());
              await context.queryClient.invalidateQueries({
                queryKey: context.trpc.accounts.administrators.queryKey(),
              });
              await query.refetch();
              setFocusAfterLoad(selected.target.id);
              setSelected(undefined);
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
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-3 p-4 pointer-coarse:grid-cols-[minmax(0,1fr)_2.75rem]"
              data-account-id={user.id}
            >
              <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-1 text-left sm:grid-cols-4">
                <span className="break-anywhere font-semibold">{user.name}</span>
                <span className="break-anywhere text-stone-600">{user.username}</span>
                <span className="break-anywhere">{roleLabel(user.role)}</span>
                <span className="break-anywhere">
                  {user.enabled ? m.admin_enabled() : m.admin_disabled()}
                </span>
              </div>
              <AccountActions
                target={user}
                actorRole={actorRole}
                disabled={!!selected}
                triggerRef={(element) => {
                  if (element) rowControls.current.set(user.id, element);
                  else rowControls.current.delete(user.id);
                }}
                onFormFocus={() => heading.current?.focus()}
                onSelect={(action) => {
                  setSuccess('');
                  setSelected({ action, target: user });
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>{m.accounts_empty()}</p>
      )}
      <nav className="mt-4 flex flex-wrap items-center gap-4" aria-label={m.pagination_label()}>
        <Button
          size="icon"
          variant="secondary"
          aria-label={m.previous_page()}
          disabled={
            (query.data?.offset ?? offset) === 0 || query.isFetching || !!query.error || !!selected
          }
          onClick={() => {
            setOffset(Math.max(0, (query.data?.offset ?? offset) - limit));
            setFocusId(undefined);
          }}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <span aria-live="polite">
          {query.data &&
            m.page_number({
              number: String(Math.floor(query.data.offset / limit) + 1),
              total: String(Math.max(1, Math.ceil(query.data.totalCount / limit))),
            })}
        </span>
        <Button
          size="icon"
          variant="secondary"
          aria-label={m.next_page()}
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
          <ArrowRight aria-hidden="true" />
        </Button>
      </nav>
    </section>
  );
}
