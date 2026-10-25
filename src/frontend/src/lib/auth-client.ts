import { createTRPCClient, httpLink } from '@trpc/client';
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../server/trpc';

type Inputs = inferRouterInputs<AppRouter>;

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
    reauthenticate: (input: Inputs['auth']['reauthenticate']) =>
      client.auth.reauthenticate.mutate(input),
    createAccount: (input: Inputs['accounts']['create']) => client.accounts.create.mutate(input),
    resetAccount: (input: Inputs['accounts']['resetPassword']) =>
      client.accounts.resetPassword.mutate(input),
    changeAccountStatus: (input: Inputs['accounts']['changeStatus']) =>
      client.accounts.changeStatus.mutate(input),
    changeAccountRole: (input: Inputs['accounts']['changeRole']) =>
      client.accounts.changeRole.mutate(input),
  };
}
