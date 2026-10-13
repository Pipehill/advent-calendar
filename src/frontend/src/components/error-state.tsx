import * as m from '../generated/paraglide/messages.js';

export function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string') return error.code;
    if ('data' in error && error.data && typeof error.data === 'object' && 'code' in error.data)
      return String(error.data.code);
  }
  return 'INTERNAL_SERVER_ERROR';
}

export function errorMessage(code: string) {
  switch (code) {
    case 'BAD_REQUEST':
      return m.error_invalid();
    case 'NOT_FOUND':
      return m.error_missing();
    case 'SERVICE_UNAVAILABLE':
      return m.error_unavailable();
    case 'TIMEOUT':
      return m.error_timeout();
    case 'UNAUTHORIZED':
      return m.error_unauthorized();
    case 'FORBIDDEN':
      return m.error_forbidden();
    case 'CONFLICT':
      return m.error_conflict();
    default:
      return m.error_unknown();
  }
}

export function ErrorState({ code }: { code: string }) {
  return (
    <section role="alert" className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
      <h1 className="mb-3 font-serif text-3xl text-emerald-950">{m.error_heading()}</h1>
      <p className="text-stone-600">{errorMessage(code)}</p>
    </section>
  );
}
