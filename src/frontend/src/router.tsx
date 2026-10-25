import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { browserAuthClient } from './lib/auth-client';
import { routeTree } from './routeTree.gen';
import { currentContext } from './server/context';
import { type AppRouter, appRouter } from './server/trpc';

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const trpc = createIsomorphicFn()
    .server(() =>
      createTRPCOptionsProxy<AppRouter>({
        router: appRouter,
        ctx: () => currentContext(getRequest()),
        queryClient,
      }),
    )
    .client(() =>
      createTRPCOptionsProxy<AppRouter>({
        client: createTRPCClient<AppRouter>({ links: [httpLink({ url: '/api/trpc' })] }),
        queryClient,
      }),
    )();
  const auth = createIsomorphicFn()
    .server(() => {
      const caller = appRouter.createCaller(() => currentContext(getRequest()));
      return {
        session: () => caller.auth.session(),
        login: caller.auth.login,
        changePassword: caller.auth.changePassword,
        logout: () => caller.auth.logout(),
        reauthenticate: caller.auth.reauthenticate,
        createAccount: caller.accounts.create,
        resetAccount: caller.accounts.resetPassword,
        changeAccountStatus: caller.accounts.changeStatus,
        changeAccountRole: caller.accounts.changeRole,
      };
    })
    .client(browserAuthClient)();
  const router = createRouter({
    routeTree,
    context: { queryClient, trpc, auth, administration: {} },
    defaultPreloadStaleTime: 0,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

export type RouterContext = {
  administration: { createdId?: string };
  auth: ReturnType<typeof browserAuthClient>;
  queryClient: QueryClient;
  trpc: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>;
};

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
