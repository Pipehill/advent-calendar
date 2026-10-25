import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server/trpc';

export function browserAuthClient() {
  const tokens = createTRPCClient<AppRouter>({ links: [httpLink({ url: '/api/trpc' })] });
  const client = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: '/api/trpc',
        async headers({ op }) {
          if (op.type !== 'mutation') return {};
          const csrf = await tokens.auth.csrf.query();
          return { 'X-CSRF-TOKEN': csrf.requestToken };
        },
      }),
    ],
  });
  return {
    session: () => client.auth.session.query(),
    login: (input: { username: string; password: string }) => client.auth.login.mutate(input),
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      client.auth.changePassword.mutate(input),
    logout: () => client.auth.logout.mutate(),
  };
}
