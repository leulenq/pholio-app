import { useContext, useEffect } from 'react';
import { AuthEntryContext, INERT_ENTRY } from '../lib/auth-entry-context';

/**
 * For entry points (the login page, OAuth callbacks): start, refine, or cancel
 * the post-login transition. Requires the provider — an entry point that isn't
 * under it would silently stop showing a transition at all.
 */
export function useAuthEntry() {
  const context = useContext(AuthEntryContext);
  if (!context) {
    throw new Error('useAuthEntry must be used inside AuthEntryTransitionProvider');
  }
  return context;
}

/**
 * For the destination shell: report who arrived, and report when the shell is
 * genuinely usable.
 *
 * `isReady` is deliberately signalled from an effect. Effects do not run for a
 * subtree that is still suspended on its lazy chunk, so "ready" cannot fire
 * until the route content has actually committed — which is what stops the
 * splash from fading out onto a Suspense fallback.
 */
export function useAuthEntryHandoff(isReady, identity) {
  const { isEntryActive, reportEntryReady, reportEntryIdentity } =
    useContext(AuthEntryContext) || INERT_ENTRY;

  const name = identity?.name || null;
  const avatarUrl = identity?.avatarUrl || null;
  const initials = identity?.initials || null;
  const agencyName = identity?.agencyName || null;
  const variant = identity?.variant || null;

  useEffect(() => {
    if (!isEntryActive) return;
    if (!name && !avatarUrl && !initials && !agencyName && !variant) return;
    reportEntryIdentity({ name, avatarUrl, initials, agencyName, variant });
  }, [
    isEntryActive,
    name,
    avatarUrl,
    initials,
    agencyName,
    variant,
    reportEntryIdentity,
  ]);

  useEffect(() => {
    if (!isEntryActive || !isReady) return;
    reportEntryReady();
  }, [isEntryActive, isReady, reportEntryReady]);
}
