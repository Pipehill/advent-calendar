import { createHash } from 'node:crypto';
import type { SessionDto } from '../generated/backend';
import { callBackend } from './backend';
import type { RequestContext } from './context';

// Keep administration/audit fields out of personal-page SSR and hydration.
export function publicSession(session: SessionDto, context: RequestContext) {
  return {
    user: { name: session.user.name, username: session.user.username, role: session.user.role },
    expiresAt: session.expiresAt,
    mustChangePassword: session.mustChangePassword,
    // A non-credential cache discriminator distinguishes even simultaneous sessions
    // for one account with identical expiry. Never expose the HttpOnly ticket itself.
    cacheScope: createHash('sha256')
      .update(context.cookies.get('advent.auth') ?? '')
      .digest('hex'),
  };
}

export async function inspectSession(context: RequestContext) {
  return publicSession(
    await callBackend(context, (client, signal) => client.session(signal)),
    context,
  );
}
