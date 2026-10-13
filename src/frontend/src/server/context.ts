import { randomBytes } from 'node:crypto';

export function createContext(request: Request) {
  const incoming = request.headers.get('traceparent');
  const valid =
    incoming && /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/.test(incoming);
  const traceId = valid ? incoming.split('-')[1] : randomBytes(16).toString('hex');
  const traceparent = `00-${traceId}-${randomBytes(8).toString('hex')}-01`;
  return { signal: request.signal, traceId, traceparent };
}

export type RequestContext = ReturnType<typeof createContext>;

export function logRequest(context: RequestContext, status: string) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: status === 'OK' ? 'Information' : 'Error',
      service: 'calendar-bff',
      traceId: context.traceId,
      operation: 'calendar.get',
      status,
    }),
  );
}
