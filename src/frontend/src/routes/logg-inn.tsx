import { createFileRoute } from '@tanstack/react-router';
import { CredentialForm } from '../components/credential-form';
import * as m from '../generated/paraglide/messages.js';

export const Route = createFileRoute('/logg-inn')({
  validateSearch: (search: Record<string, unknown>): { changed?: number } => ({
    changed: search.changed === '1' || search.changed === 1 ? 1 : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const context = Route.useRouteContext();
  const { changed } = Route.useSearch();
  return (
    <section className="auth-card">
      <h1 className="auth-title">{m.login_label()}</h1>
      <p className="mb-6 text-stone-600">{m.login_introduction()}</p>
      {changed && (
        <p role="status" className="mb-6 text-emerald-900">
          {m.password_changed()}
        </p>
      )}
      <CredentialForm context={context} />
    </section>
  );
}
