import { TRPCError } from '@trpc/server';
import type { SessionDto } from '../generated/backend';
import { callBackend } from './backend';
import type { RequestContext } from './context';

// Keep administration/audit fields out of personal-page SSR and hydration.
export function publicSession(session: SessionDto) {
  return {
    user: { name: session.user.name, username: session.user.username, role: session.user.role },
    expiresAt: session.expiresAt,
    mustChangePassword: session.mustChangePassword,
  };
}

export async function inspectSession(context: RequestContext) {
  return publicSession(await callBackend(context, (client, signal) => client.session(signal)));
}

export async function listAccounts(context: RequestContext, offset: number, limit: number) {
  return callBackend(context, async (client, signal) => {
    const session = await client.session(signal);
    if (session.mustChangePassword || session.user.role !== 'superadmin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
    }
    const result = await client.listUsers(offset, limit, signal);
    return {
      users: result.users.map(({ name, username, role }) => ({ name, username, role })),
      hasMore: result.users.length === limit,
    };
  });
}
