const ENTRY_KEY = 'pholio:auth-entry';
const REVEAL_ARRIVAL_KEY = 'pholio:arrived-from-reveal';
const MIN_DISPLAY_MS = 1800;
const EXIT_MS = 850;
// Any legitimate post-login transition finishes well within this. A flag
// still around after this long is leftover from an INTERRUPTED mount (e.g. a
// transient 401 hard-redirected the page to /login and back mid-splash,
// before the transition ever reached its exit phase and cleared the flag) —
// showing the splash again that late reads as a broken, truncated second
// "Welcome back" rather than a real transition, so treat it as expired.
const STALE_ENTRY_MS = 20000;

export function markAuthEntryTransition() {
  try {
    sessionStorage.setItem(ENTRY_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — skip branded transition
  }
}

// Both "take" functions below are called from a useState lazy initializer in
// useAuthEntryTransition — i.e. render-phase code. React (in development,
// under StrictMode) deliberately invokes render-phase functions TWICE per
// mount specifically to catch impure side effects like "reads that also
// mutate/consume storage" — exactly what a naive read-and-clear does. A
// per-call sessionStorage.removeItem is idempotent on its own, but the
// SECOND invocation would see nothing left and could win out over the first
// depending on which of the two calls' results React keeps, making the
// splash flicker or vanish immediately in development. Module-level flags
// (reset only by a fresh page load / fresh module evaluation, never by
// React re-invoking a function) make each "take" resilient to being called
// any number of times: only the first call in this page's lifetime can ever
// return a real value, no matter what's calling it or how many times.
let hasTakenEntryStartedAt = false;
let hasTakenRevealArrival = false;

/**
 * Read and clear the entry-transition flag in one step. Consuming it on the
 * FIRST read — rather than only at the end of a successful transition —
 * means an interrupted mount can never cause a second mount to show the
 * splash again with a truncated remaining duration: the second mount simply
 * finds no flag and skips it outright. Returns null when missing, stale, or
 * already taken this page load.
 */
export function takeAuthEntryStartedAt() {
  if (hasTakenEntryStartedAt) return null;
  hasTakenEntryStartedAt = true;
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    sessionStorage.removeItem(ENTRY_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return null;
    if (Date.now() - ts > STALE_ENTRY_MS) return null;
    return ts;
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
 * One-shot check for the RevealPage → dashboard handoff. The reveal flow
 * already closes with its own welcome letter, so the entry splash must not
 * play a second time. Reading this also consumes (removes) the flag; see the
 * module-level guard note above for why that consumption is guarded against
 * being invoked more than once per page load.
 */
export function consumeArrivedFromReveal() {
  if (hasTakenRevealArrival) return false;
  hasTakenRevealArrival = true;
  try {
    const flagged = sessionStorage.getItem(REVEAL_ARRIVAL_KEY) === '1';
    if (flagged) sessionStorage.removeItem(REVEAL_ARRIVAL_KEY);
    return flagged;
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
