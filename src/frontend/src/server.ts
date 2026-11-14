import handler from '@tanstack/react-start/server-entry';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { paraglideMiddleware } from './generated/paraglide/server.js';
import { getRuntimeConfiguration } from './server/configuration';
import { createContext, requestContexts } from './server/context';
import { protectTrpcBody } from './server/request-body';
import { appRouter } from './server/trpc';

// Nitro imports this handler before listening, including for static asset requests.
const configuration = getRuntimeConfiguration();

export default {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/trpc/')) {
      const bounded = await protectTrpcBody(request);
      if (bounded instanceof Response) return bounded;
      request = bounded;
      const context = createContext(request);
      const response = await fetchRequestHandler({
        endpoint: '/api/trpc',
        req: request,
        router: appRouter,
        createContext: () => context,
      });
      response.headers.set('Cache-Control', 'no-store');
      for (const cookie of context.responseHeaders.getSetCookie()) {
        response.headers.append('Set-Cookie', cookie);
      }
      return response;
    }
    if (path === '/health/ready') {
      try {
        const response = await fetch(`${configuration.baseUrl}/health/ready`, {
          signal: AbortSignal.timeout(2000),
          redirect: 'error',
          cache: 'no-store',
        });
        return new Response(response.ok ? 'Healthy' : 'Unhealthy', {
          status: response.ok ? 200 : 503,
        });
      } catch {
        return new Response('Unhealthy', { status: 503 });
      }
    }
    const context = createContext(request);
    return requestContexts.run(context, () =>
      paraglideMiddleware(request, async () => {
        const response = await handler.fetch(request);
        response.headers.set('Cache-Control', 'private, no-store');
        for (const cookie of context.responseHeaders.getSetCookie())
          response.headers.append('Set-Cookie', cookie);
        return response;
      }),
    );
  },
};
