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
