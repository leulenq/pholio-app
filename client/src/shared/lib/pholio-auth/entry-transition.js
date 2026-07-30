const ENTRY_KEY = 'pholio:auth-entry';
const ONBOARDING_ARRIVAL_KEY = 'pholio:arrived-from-onboarding';
const MIN_DISPLAY_MS = 1800;
const EXIT_MS = 850;
// How long the splash keeps accepting identity refinements after it starts.
// The headline is a word-by-word animation, so a name arriving after the words
// have landed inserts a NEW word mid-flight ("Welcome back." becoming "Welcome
// back, Leul." two seconds in) and swaps the avatar under the sweep ring. Past
// this beat the identity is frozen: whatever is known is what plays, unchanged,
// for the rest of the transition.
const IDENTITY_LOCK_MS = 260;
// Any legitimate post-login transition finishes well within this. A flag
// still around after this long is leftover from an INTERRUPTED page load —
// showing the splash that late reads as a broken, truncated "Welcome back"
// rather than a real transition, so treat it as expired.
const STALE_ENTRY_MS = 20000;

/**
 * Hand the branded transition across a full document load (the OAuth callback
 * and dev-login paths still navigate hard). `identity` is optional but worth
 * passing: it is what lets the splash open on the user's actual name and
 * avatar instead of placeholder initials.
 */
export function markAuthEntryTransition(identity = {}) {
  try {
    sessionStorage.setItem(
      ENTRY_KEY,
      JSON.stringify({
        at: Date.now(),
        variant: identity.variant || 'talent',
        name: identity.name || null,
        avatarUrl: identity.avatarUrl || null,
      })
    );
  } catch {
    // sessionStorage unavailable — skip branded transition
  }
}

// Both "take" functions below are called from a useState lazy initializer in
// AuthEntryTransitionProvider — i.e. render-phase code. React (in development,
// under StrictMode) deliberately invokes render-phase functions TWICE per
// mount specifically to catch impure side effects like "reads that also
// mutate/consume storage" — exactly what a naive read-and-clear does. A
// per-call sessionStorage.removeItem is idempotent on its own, but the
// SECOND invocation would see nothing left and could win out over the first
// depending on which of the two calls' results React keeps, making the
// splash flicker or vanish immediately in development. Module-level caches
// (reset only by a fresh page load / fresh module evaluation, never by
// React re-invoking a function) make each "take" resilient to being called
// any number of times: every call in this page's lifetime returns the same
// value, no matter what's calling it or how often.
let entryTaken = false;
let takenEntry = null;
let onboardingArrivalTaken = false;
let takenOnboardingArrival = false;

/**
 * Read and clear the entry-transition flag in one step. Consuming it on the
 * FIRST read — rather than only at the end of a successful transition — means
 * an interrupted load can never cause a later mount to show the splash again
 * with a truncated remaining duration. Returns null when missing or stale.
 */
export function takeAuthEntry() {
  if (entryTaken) return takenEntry;
  entryTaken = true;
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    sessionStorage.removeItem(ENTRY_KEY);
    if (!raw) return null;

    // Tolerate the pre-payload format (a bare timestamp string) so a tab that
    // navigated mid-deploy still gets its transition rather than an error.
    const parsed = raw.startsWith('{') ? JSON.parse(raw) : { at: Number(raw) };
    const startedAt = Number(parsed?.at);
    if (!Number.isFinite(startedAt)) return null;
    if (Date.now() - startedAt > STALE_ENTRY_MS) return null;

    takenEntry = {
      startedAt,
      variant: parsed.variant === 'agency' ? 'agency' : 'talent',
      name: parsed.name || null,
      avatarUrl: parsed.avatarUrl || null,
    };
    return takenEntry;
  } catch {
    return null;
  }
}

export function clearAuthEntryTransition() {
  try {
    sessionStorage.removeItem(ENTRY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Mark the onboarding → dashboard handoff. Finishing onboarding is not a
 * sign-in: the flow has just spent minutes with the user and closes on its own
 * finishing beat, so a "Welcome back" splash on arrival would be wrong.
 */
export function markArrivedFromOnboarding() {
  try {
    sessionStorage.setItem(ONBOARDING_ARRIVAL_KEY, '1');
  } catch {
    // sessionStorage unavailable — worst case the splash plays once
  }
}

/**
 * One-shot counterpart to markArrivedFromOnboarding. Reading this also consumes
 * (removes) the flag; see the module-level cache note above for why that
 * consumption is guarded against being invoked more than once per page load.
 */
export function consumeArrivedFromOnboarding() {
  if (onboardingArrivalTaken) return takenOnboardingArrival;
  onboardingArrivalTaken = true;
  try {
    takenOnboardingArrival =
      sessionStorage.getItem(ONBOARDING_ARRIVAL_KEY) === '1';
    if (takenOnboardingArrival) {
      sessionStorage.removeItem(ONBOARDING_ARRIVAL_KEY);
    }
    return takenOnboardingArrival;
  } catch {
    return false;
  }
}

export function getAuthEntryRemainingMs(startedAt) {
  if (!startedAt) return 0;
  return Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt));
}

export const AUTH_ENTRY_MIN_DISPLAY_MS = MIN_DISPLAY_MS;
export const AUTH_ENTRY_EXIT_MS = EXIT_MS;
export const AUTH_ENTRY_IDENTITY_LOCK_MS = IDENTITY_LOCK_MS;
