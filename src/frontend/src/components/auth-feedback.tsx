import * as m from '../generated/paraglide/messages.js';
import { errorCode } from './error-state';
import { Button } from './ui/button';

export function RequestFailure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert">
      <p>{authError(error)}</p>
      <Button onClick={retry}>{m.retry_label()}</Button>
    </div>
  );
}

export function authError(error: unknown, login = false): string {
  const code = errorCode(error);
  if (code === 'UNAUTHORIZED') return login ? m.login_failed() : m.session_expired();
  if (code === 'TOO_MANY_REQUESTS') return m.auth_rate_limit();
  if (code === 'SERVICE_UNAVAILABLE' || code === 'TIMEOUT') return m.auth_unavailable();
  if (code === 'BAD_REQUEST' || code === 'CONFLICT') return m.auth_invalid();
  if (code === 'FORBIDDEN') return m.auth_forbidden();
  return m.error_unknown();
}

export function backendFieldErrors(error: unknown): Record<string, string[]> {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { fieldErrors?: Record<string, string[]> } | undefined;
    return data?.fieldErrors || {};
  }
  return {};
}

export function AuthRouteError({ error }: { error: unknown }) {
  return (
    <section role="alert" className="auth-card">
      <h1 className="auth-title">{m.auth_error_heading()}</h1>
      <p>{authError(error)}</p>
    </section>
  );
}
