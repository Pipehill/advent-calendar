import handler from '@tanstack/react-start/server-entry';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { paraglideMiddleware } from './generated/paraglide/server.js';
import { createContext } from './server/context';
import { appRouter } from './server/trpc';

export default {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/trpc/')) {
      return fetchRequestHandler({
        endpoint: '/api/trpc',
        req: request,
        router: appRouter,
        createContext: () => createContext(request),
      });
    }
    if (path === '/health/ready') {
      try {
        const baseUrl = process.env.BACKEND_API_URL || 'http://localhost:8080';
        const response = await fetch(`${baseUrl}/health/ready`, {
          signal: AbortSignal.timeout(2000),
        });
        return new Response(response.ok ? 'Healthy' : 'Unhealthy', {
          status: response.ok ? 200 : 503,
        });
      } catch {
        return new Response('Unhealthy', { status: 503 });
      }
    }
    return paraglideMiddleware(request, async () => {
      const response = await handler.fetch(request);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    });
  },
};
