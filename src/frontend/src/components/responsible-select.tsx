import { useQuery } from '@tanstack/react-query';
import * as m from '../generated/paraglide/messages.js';
import type { RouterContext } from '../router';
import { RequestFailure } from './auth-feedback';

export function ResponsibleSelect({
  context,
  excludeId,
  value,
  onChange,
  errors,
}: {
  context: RouterContext;
  excludeId?: string;
  value: string;
  onChange: (value: string) => void;
  errors: unknown[];
}) {
  const query = useQuery({
    ...context.trpc.accounts.administrators.queryOptions(),
    staleTime: 0,
    gcTime: 0,
  });
  const administrators = query.data?.filter((user) => user.id !== excludeId);
  return (
    <div className="space-y-2">
      <label className="block font-medium" htmlFor="account-responsible">
        {m.admin_responsible()}
      </label>
      <select
        id="account-responsible"
        required
        disabled={query.isFetching || !!query.error || !administrators?.length}
        className="min-h-11 w-full rounded-xl border border-stone-300 bg-white p-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errors.length > 0}
        aria-describedby={errors.length ? 'account-responsible-error' : undefined}
      >
        <option value="">{m.admin_select_responsible()}</option>
        {administrators?.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.username})
          </option>
        ))}
      </select>
      {query.isFetching ? (
        <p role="status">{m.accounts_loading()}</p>
      ) : query.error ? (
        <RequestFailure error={query.error} retry={() => void query.refetch()} />
      ) : !administrators?.length ? (
        <p role="status">{m.admin_no_responsible()}</p>
      ) : null}
      {!!errors.length && (
        <p id="account-responsible-error" role="alert" className="text-sm text-red-800">
          {m.admin_responsible_required()}
        </p>
      )}
    </div>
  );
}
