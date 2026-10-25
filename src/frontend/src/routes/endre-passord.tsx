import { createFileRoute } from '@tanstack/react-router';
import { AuthRouteError } from '../components/auth-feedback';
import { CredentialForm } from '../components/credential-form';
import { SessionControls } from '../components/session-controls';
import * as m from '../generated/paraglide/messages.js';
import { requireSession } from '../lib/auth-navigation';

export const Route = createFileRoute('/endre-passord')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: AuthRouteError,
  loader: ({ context }) => requireSession(context, true),
  pendingComponent: () => <p role="status">{m.auth_pending()}</p>,
  component: PasswordPage,
});

function PasswordPage() {
  const session = Route.useLoaderData();
  const context = Route.useRouteContext();
  const administrator = session.user.role !== 'calendarUser';
  return (
    <section className="auth-card protected-content">
      <h1 className="auth-title">{m.password_change_title()}</h1>
      <p className="mb-4 text-stone-600">
        {session.mustChangePassword ? m.password_required() : m.password_change_help()}
      </p>
      <p className="mb-6 text-sm text-stone-600">
        {administrator ? m.password_policy_admin() : m.password_policy_user()}
      </p>
      <CredentialForm context={context} changePassword administrator={administrator} />
      <SessionControls context={context} expiresAt={session.expiresAt} />
    </section>
  );
}
