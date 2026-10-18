import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ErrorState } from '../components/error-state';
import { LanguageSelector } from '../components/language-selector';
import { Button } from '../components/ui/button';
import * as m from '../generated/paraglide/messages.js';
import { getLocale } from '../generated/paraglide/runtime.js';
import type { RouterContext } from '../router';
import styles from '../styles.css?url';

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: m.app_name() },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  shellComponent: Document,
  component: () => <Outlet />,
  notFoundComponent: () => <ErrorState code="NOT_FOUND" />,
  errorComponent: () => <ErrorState code="INTERNAL_SERVER_ERROR" />,
});

function Document({ children }: { children: ReactNode }) {
  const isLandingPage = useRouterState({ select: (state) => state.location.pathname === '/' });

  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <div
          className={
            isLandingPage
              ? 'landing-shell'
              : 'mx-auto min-h-screen max-w-6xl px-5 py-7 sm:px-10 sm:py-10'
          }
        >
          <header
            className={
              isLandingPage
                ? 'landing-header'
                : 'mb-12 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-6'
            }
          >
            <span className="font-serif text-xl font-semibold text-emerald-950">
              ✦ {m.app_name()}
            </span>
            <div className={isLandingPage ? 'landing-controls' : undefined}>
              <LanguageSelector />
              {isLandingPage && <Button disabled>{m.login_label()}</Button>}
            </div>
          </header>
          <main className={isLandingPage ? 'landing-main' : undefined}>{children}</main>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
