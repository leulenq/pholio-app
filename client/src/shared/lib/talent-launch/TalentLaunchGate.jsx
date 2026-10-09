import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PageLoadingScreen from '../../components/shared/PageLoadingScreen';
import { loadTalentLaunchStatus } from './status';

/**
 * Client half of the talent launch gate (server: src/shared/lib/talent-launch.js).
 *
 * In production Netlify serves these routes as static SPA files, so the
 * server never sees the navigation; this sends a browser without access to
 * pholio-site's notify page before a talent screen renders. The server stays
 * authoritative: every talent API refuses without access regardless of this.
 *
 * If the status cannot be read, the page renders and the server decides.
 */

function isGatedPath(pathname) {
  return (
    pathname === '/' ||
    pathname === '/apply' ||
    pathname === '/reveal' ||
    pathname === '/dashboard' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname === '/dashboard/talent' ||
    pathname.startsWith('/dashboard/talent/')
  );
}

export default function TalentLaunchGate({ children }) {
  const { pathname } = useLocation();
  const gated = isGatedPath(pathname);
  const [verdict, setVerdict] = useState('pending');

  useEffect(() => {
    if (!gated) return undefined;
    let cancelled = false;
    loadTalentLaunchStatus().then((status) => {
      if (cancelled) return;
      if (status && status.access === false && status.notifyUrl) {
        setVerdict('held');
        window.location.replace(status.notifyUrl);
        return;
      }
      setVerdict('allowed');
    });
    return () => {
      cancelled = true;
    };
  }, [gated, pathname]);

  if (gated && verdict !== 'allowed') return <PageLoadingScreen />;
  return children;
}
