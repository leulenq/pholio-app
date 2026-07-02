const ENTRY_KEY = 'pholio:auth-entry';
const REVEAL_ARRIVAL_KEY = 'pholio:arrived-from-reveal';
const MIN_DISPLAY_MS = 1800;
const EXIT_MS = 850;

export function markAuthEntryTransition() {
  try {
    sessionStorage.setItem(ENTRY_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — skip branded transition
  }
}

export function getAuthEntryStartedAt() {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
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

export function shouldShowAuthEntrySplash() {
  return getAuthEntryStartedAt() !== null;
}

/**
 * One-shot check for the RevealPage → dashboard handoff. The reveal flow
 * already closes with its own welcome letter, so the entry splash must not
 * play a second time. Reading this also consumes (removes) the flag.
 */
export function consumeArrivedFromReveal() {
  try {
    const flagged = sessionStorage.getItem(REVEAL_ARRIVAL_KEY) === '1';
    if (flagged) sessionStorage.removeItem(REVEAL_ARRIVAL_KEY);
    return flagged;
  } catch {
    return false;
  }
}

export function getAuthEntryRemainingMs(startedAt = getAuthEntryStartedAt()) {
  if (!startedAt) return 0;
  return Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt));
}

export const AUTH_ENTRY_MIN_DISPLAY_MS = MIN_DISPLAY_MS;
export const AUTH_ENTRY_EXIT_MS = EXIT_MS;
