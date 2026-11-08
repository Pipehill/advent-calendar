import { useEffect } from 'react';
import { errorCode } from '../components/error-state';
import type { RouterContext } from '../router';
import { leaveSession } from './auth-navigation';

export function useProtectedQuery(context: RouterContext, error: unknown) {
  useEffect(() => {
    if (error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(errorCode(error)))
      leaveSession(context, '/login');
  }, [error, context]);
}
