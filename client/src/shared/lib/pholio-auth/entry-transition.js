const ENTRY_KEY = 'pholio:auth-entry';
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

export function getAuthEntryRemainingMs(startedAt = getAuthEntryStartedAt()) {
  if (!startedAt) return 0;
  return Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt));
}

export const AUTH_ENTRY_MIN_DISPLAY_MS = MIN_DISPLAY_MS;
export const AUTH_ENTRY_EXIT_MS = EXIT_MS;
