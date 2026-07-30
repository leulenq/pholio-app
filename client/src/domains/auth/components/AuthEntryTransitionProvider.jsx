import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthEntrySplash from './AuthEntrySplash';
import { AuthEntryContext } from '../lib/auth-entry-context';
import {
  AUTH_ENTRY_EXIT_MS,
  AUTH_ENTRY_IDENTITY_LOCK_MS,
  consumeArrivedFromOnboarding,
  getAuthEntryRemainingMs,
  takeAuthEntry,
} from '../../../shared/lib/pholio-auth/entry-transition';

/**
 * Owns the post-login branded transition for the whole app.
 *
 * It lives ABOVE the router's Suspense boundary on purpose. The splash used to
 * be rendered by DashboardLayoutShell / AgencySessionGate — i.e. inside
 * `<Suspense fallback={<PageLoadingScreen/>}>`. The first render of a lazy
 * route (`<Outlet/>` → OverviewPage) suspends, and React answers that by
 * replacing the whole suspended subtree — splash included — with the cream
 * fallback, then revealing it again once the chunk lands. On screen that is:
 * ink splash, white flash, ink splash replaying its entrance from zero. Three
 * apparent page loads for one sign-in.
 *
 * Mounted here there is exactly one splash instance, mounted once, and route
 * suspension happens harmlessly underneath an opaque overlay.
 *
 * Two ways in:
 *   - imperatively, via `startEntryTransition` — the same-document path, used
 *     by the login page the instant credentials are accepted, so the backend
 *     round-trip plays out under the splash instead of under a button spinner;
 *   - via the sessionStorage flag, for entries that still cross a full document
 *     load (OAuth callback).
 *
 * The splash holds until BOTH the minimum display time has elapsed and the
 * destination reports itself ready, then crossfades out over the live shell.
 */

const IDLE = {
  startedAt: null,
  variant: 'talent',
  name: null,
  avatarUrl: null,
  initials: null,
  agencyName: null,
};

export function AuthEntryTransitionProvider({ children }) {
  // Arriving straight from onboarding is a one-shot handoff: that flow already
  // closed with its own finishing beat, so the splash is skipped and any
  // coincidental flag is consumed rather than left to surface later.
  const [entry, setEntry] = useState(() => {
    const fromOnboarding = consumeArrivedFromOnboarding();
    const stored = takeAuthEntry();
    if (fromOnboarding || !stored) return IDLE;
    return { ...IDLE, ...stored };
  });

  const [ready, setReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(
    () => getAuthEntryRemainingMs(entry.startedAt) === 0
  );
  // Frozen once the opening beat has played — see IDENTITY_LOCK_MS. A primed
  // identity (we already know who signed in) locks immediately: there is
  // nothing a later profile fetch could add, and everything it could disturb.
  const [identityLocked, setIdentityLocked] = useState(() => Boolean(entry.name));

  const active = entry.startedAt !== null;
  const exiting = active && minElapsed && ready;

  // Hold the min-display timer against a start time rather than a duration so
  // that time already spent (e.g. a document load between mark and mount) counts
  // toward it — the transition is a fixed beat, not a fixed extra delay.
  useEffect(() => {
    if (!active || minElapsed) return undefined;
    const timer = window.setTimeout(
      () => setMinElapsed(true),
      getAuthEntryRemainingMs(entry.startedAt)
    );
    return () => window.clearTimeout(timer);
  }, [active, minElapsed, entry.startedAt]);

  useEffect(() => {
    if (!active || identityLocked) return undefined;
    const timer = window.setTimeout(
      () => setIdentityLocked(true),
      AUTH_ENTRY_IDENTITY_LOCK_MS
    );
    return () => window.clearTimeout(timer);
  }, [active, identityLocked]);

  useEffect(() => {
    if (!exiting) return undefined;
    const timer = window.setTimeout(() => {
      setEntry(IDLE);
      setReady(false);
      setMinElapsed(true);
      setIdentityLocked(false);
    }, AUTH_ENTRY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  const startEntryTransition = useCallback((identity = {}) => {
    setEntry({
      ...IDLE,
      ...identity,
      variant: identity.variant === 'agency' ? 'agency' : 'talent',
      startedAt: Date.now(),
    });
    setReady(false);
    setMinElapsed(false);
    setIdentityLocked(Boolean(identity.name));
  }, []);

  const cancelEntryTransition = useCallback(() => {
    setEntry(IDLE);
    setReady(false);
    setMinElapsed(true);
    setIdentityLocked(false);
  }, []);

  const reportEntryReady = useCallback(() => setReady(true), []);

  /**
   * The destination refining what it knows about the signed-in user. The
   * variant is always accepted (it is the canvas colour, and only the server
   * response can settle talent vs agency); name and avatar are accepted only
   * until the identity locks, so the headline can never change shape mid-beat.
   */
  const reportEntryIdentity = useCallback(
    (identity) => {
      if (!identity) return;
      setEntry((current) => {
        if (current.startedAt === null) return current;
        const next = { ...current };
        if (identity.variant) {
          next.variant = identity.variant === 'agency' ? 'agency' : 'talent';
        }
        if (!identityLocked) {
          if (identity.name) next.name = identity.name;
          if (identity.avatarUrl) next.avatarUrl = identity.avatarUrl;
          if (identity.initials) next.initials = identity.initials;
          if (identity.agencyName) next.agencyName = identity.agencyName;
        }
        return next;
      });
    },
    [identityLocked]
  );

  const value = useMemo(
    () => ({
      isEntryActive: active,
      startEntryTransition,
      cancelEntryTransition,
      reportEntryReady,
      reportEntryIdentity,
    }),
    [
      active,
      startEntryTransition,
      cancelEntryTransition,
      reportEntryReady,
      reportEntryIdentity,
    ]
  );

  return (
    <AuthEntryContext.Provider value={value}>
      {children}
      {active ? (
        <AuthEntrySplash
          variant={entry.variant}
          exiting={exiting}
          talentName={entry.variant === 'agency' ? null : entry.name}
          agencyName={entry.agencyName}
          avatarUrl={entry.avatarUrl}
          avatarInitials={entry.initials || deriveInitials(entry.name)}
        />
      ) : null}
    </AuthEntryContext.Provider>
  );
}

function deriveInitials(name) {
  if (!name) return null;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const letters =
    parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}
