import { useEffect, useState } from 'react';
import {
  AUTH_ENTRY_EXIT_MS,
  consumeArrivedFromReveal,
  getAuthEntryRemainingMs,
  takeAuthEntryStartedAt,
} from '../../../shared/lib/pholio-auth/entry-transition';

/**
 * Drives the post-login branded transition:
 * 1. active — splash covers the screen while data loads and the minimum
 *    display duration elapses.
 * 2. exiting — data is ready; the splash crossfades out over the mounted
 *    dashboard shell, then unmounts.
 *
 * Exception: arriving from the RevealPage welcome letter is a one-shot
 * handoff — that flow already closed with its own farewell beat, so the
 * splash is skipped entirely and the flag is consumed on read.
 *
 * The entry-transition flag itself is consumed (read + cleared) exactly
 * once, on first mount — see takeAuthEntryStartedAt. If this mount gets torn
 * down before the transition finishes (e.g. a transient false-positive 401
 * hard-redirects to /login and back mid-splash), there is nothing left for a
 * second mount to find: it skips the splash rather than replaying it with a
 * truncated remaining duration.
 */
export function useAuthEntryTransition(isDataReady) {
  const [startedAt] = useState(() => {
    if (consumeArrivedFromReveal()) {
      // Defensive: make sure a coincidentally-set auth-entry flag can't
      // surface on some later mount within the same tab session either.
      takeAuthEntryStartedAt();
      return null;
    }
    return takeAuthEntryStartedAt();
  });
  const [active, setActive] = useState(() => startedAt !== null);
  const [minElapsed, setMinElapsed] = useState(
    () => getAuthEntryRemainingMs(startedAt) === 0
  );

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

    const timer = window.setTimeout(() => setActive(false), AUTH_ENTRY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  return {
    showEntrySplash: active,
    isEntrySplashExiting: exiting,
    entryStartedAt: startedAt,
  };
}
