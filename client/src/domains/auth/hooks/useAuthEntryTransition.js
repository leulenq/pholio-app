import { useEffect, useState } from 'react';
import {
  AUTH_ENTRY_EXIT_MS,
  clearAuthEntryTransition,
  getAuthEntryRemainingMs,
  getAuthEntryStartedAt,
  shouldShowAuthEntrySplash,
} from '../../../shared/lib/pholio-auth/entry-transition';

/**
 * Drives the post-login branded transition:
 * 1. active — splash covers the screen while data loads and the minimum
 *    display duration elapses.
 * 2. exiting — data is ready; the splash crossfades out over the mounted
 *    dashboard shell, then unmounts.
 */
export function useAuthEntryTransition(isDataReady) {
  const [active, setActive] = useState(() => shouldShowAuthEntrySplash());
  const [minElapsed, setMinElapsed] = useState(() => getAuthEntryRemainingMs() === 0);
  // Captured once — the exit phase clears sessionStorage.
  const [startedAt] = useState(() => getAuthEntryStartedAt());

  const exiting = active && minElapsed && Boolean(isDataReady);

  useEffect(() => {
    if (!active || minElapsed) return undefined;

    const timer = window.setTimeout(
      () => setMinElapsed(true),
      getAuthEntryRemainingMs(startedAt)
    );
    return () => window.clearTimeout(timer);
  }, [active, minElapsed, startedAt]);

  useEffect(() => {
    if (!exiting) return undefined;

    clearAuthEntryTransition();
    const timer = window.setTimeout(() => setActive(false), AUTH_ENTRY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  return {
    showEntrySplash: active,
    isEntrySplashExiting: exiting,
    entryStartedAt: startedAt,
  };
}
