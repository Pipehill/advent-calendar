import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

export const requestContexts = new AsyncLocalStorage<RequestContext>();

export function currentContext(request: Request) {
  return requestContexts.getStore() || createContext(request);
}

export function createContext(request: Request) {
  const incoming = request.headers.get('traceparent');
  const valid =
    incoming && /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/.test(incoming);
  const traceId = valid ? incoming.split('-')[1] : randomBytes(16).toString('hex');
  const traceparent = `00-${traceId}-${randomBytes(8).toString('hex')}-01`;
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (authenticationCookies.has(name)) cookies.set(name, value.join('='));
  }
  return {
    signal: request.signal,
    traceId,
    traceparent,
    cookies,
    csrfToken: request.headers.get('X-CSRF-TOKEN'),
    responseHeaders: new Headers(),
  };
}

export const authenticationCookies = new Set(['advent.auth', 'advent.csrf']);

export function relayCookies(context: RequestContext, headers: Headers) {
  for (const cookie of headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    if (!authenticationCookies.has(name)) continue;
    context.responseHeaders.append('Set-Cookie', cookie);
    // Subsequent calls in this exchange must see the backend-issued principal.
    const value = pair.slice(separator + 1);
    if (value) context.cookies.set(name, value);
    else context.cookies.delete(name);
  }
}

export type RequestContext = ReturnType<typeof createContext>;

export function logRequest(context: RequestContext, status: string, operation: string) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: status === 'OK' ? 'Information' : 'Error',
      service: 'calendar-bff',
      traceId: context.traceId,
      operation,
      status,
    }),
  );
}
