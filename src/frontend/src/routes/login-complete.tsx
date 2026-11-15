import { createFileRoute } from '@tanstack/react-router';
import { AuthRouteError } from '../components/auth-feedback';
import { buttonStyles } from '../components/ui/button';
import * as m from '../generated/paraglide/messages.js';
import { completeLoginNavigation } from '../lib/login-navigation';

export const Route = createFileRoute('/login-complete')({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  errorComponent: ({ error }) => (
    <div>
      <AuthRouteError error={error} />
      <a className={buttonStyles({ className: 'mt-4' })} href="/login-complete">
        {m.retry_label()}
      </a>
    </div>
  ),
  loader: ({ context }) => completeLoginNavigation(context),
});
