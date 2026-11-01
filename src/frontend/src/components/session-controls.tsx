import { Link } from '@tanstack/react-router';
import { KeyRound, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import * as m from '../generated/paraglide/messages.js';
import { leaveSession } from '../lib/auth-navigation';
import type { RouterContext } from '../router';
import { authError } from './auth-feedback';
import { Button, buttonStyles } from './ui/button';

export function SessionControls({
  context,
  expiresAt,
  passwordLink = false,
  className,
}: {
  context: RouterContext;
  expiresAt: string;
  passwordLink?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const recheck = () => {
      // Hide personal output while a returning tab revalidates its backend session.
      document.documentElement.classList.add('session-checking');
      window.location.reload();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) recheck();
    };
    const timeout = window.setTimeout(
      () => {
        if (Date.parse(expiresAt) <= Date.now()) leaveSession(context, '/login');
        else recheck();
      },
      Math.min(2_147_483_647, Math.max(0, Date.parse(expiresAt) - Date.now())),
    );
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', restored);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', restored);
    };
  }, [context, expiresAt]);
  return (
    <div className={twMerge('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {passwordLink && (
        <Link
          to="/change-password"
          className={buttonStyles({ size: 'compact', variant: 'secondary' })}
        >
          <KeyRound aria-hidden="true" />
          {m.password_change_title()}
        </Link>
      )}
      <Button
        size="compact"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setError('');
          try {
            await context.auth.logout();
            leaveSession(context, '/');
          } catch (failure) {
            setError(authError(failure));
            setPending(false);
          }
        }}
      >
        <LogOut aria-hidden="true" />
        {pending ? m.auth_pending() : m.logout_label()}
      </Button>
      {error && (
        <p role="alert" className="w-full break-anywhere text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
