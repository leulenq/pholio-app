import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isExplicitAuthInFlight } from '../../../shared/lib/pholio-auth/auth-lock';
import {
  fetchAppSession,
  fetchPublicSession,
} from '../../../shared/lib/pholio-auth/session-api';

/**
 * Redirects authenticated users away from login / registration entry routes.
 */
export function useAuthenticatedEntryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const forceLogin = new URLSearchParams(location.search).get('force') === '1';
      if (forceLogin) return;

      const session =
        location.pathname === '/onboarding'
          ? await fetchPublicSession()
          : await fetchAppSession();

      if (cancelled || !session?.authenticated) return;

      // A sign-in in progress is already steering to its own destination (and
      // running the entry transition over it). Redirecting from here as well
      // would race it, which is redirect churn on a single sign-in.
      if (isExplicitAuthInFlight()) return;

      if (location.pathname === '/login') {
        const target =
          session.redirect ||
          session.dashboardPath ||
          '/dashboard/talent';
        navigate(target, { replace: true });
        return;
      }

      if (location.pathname === '/onboarding' && session.onboardingComplete) {
        const target =
          session.dashboardPath ||
          (session.role === 'AGENCY' ? '/dashboard/agency' : '/dashboard/talent');
        navigate(target, { replace: true });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);
}
