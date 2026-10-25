import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { AccountForm } from '../components/account-form';
import { AuthRouteError } from '../components/auth-feedback';
import { SessionControls } from '../components/session-controls';
import * as m from '../generated/paraglide/messages.js';
import { requireSession } from '../lib/auth-navigation';

export const Route = createFileRoute('/opprett-konto')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: AuthRouteError,
  loader: async ({ context }) => {
    const session = await requireSession(context);
    if (!['superadmin', 'calendarAdmin'].includes(session.user.role))
      throw redirect({ to: '/min-side' });
    return session;
  },
  pendingComponent: () => <p role="status">{m.auth_pending()}</p>,
  component: CreateAccountPage,
});

function CreateAccountPage() {
  const session = Route.useLoaderData();
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <section className="auth-card protected-content">
      <h1 className="auth-title">{m.admin_create_account()}</h1>
      <p className="mb-6 text-stone-600">{m.admin_creation_help()}</p>
      <AccountForm
        context={context}
        actorRole={session.user.role}
        action="create"
        onCancel={() => void navigate({ to: '/min-side' })}
        onSuccess={async (id) => {
          context.queryClient.clear();
          context.administration.createdId = id;
          await navigate({ to: '/min-side' });
        }}
      />
      <SessionControls context={context} expiresAt={session.expiresAt} />
    </section>
  );
}
