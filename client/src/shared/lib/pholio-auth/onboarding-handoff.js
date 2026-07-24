/**
 * Short-lived handoff when /login Google (or Instagram) auth succeeds in Firebase
 * but Pholio has no user yet. Casting picks this up and continues without a
 * second OAuth click.
 */

import { onAuthStateChanged } from 'firebase/auth';

const STORAGE_KEY = 'pholio.onboardingAuthHandoff';
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * @param {{ method: 'google' | 'instagram', name?: string | null, email?: string | null, picture?: string | null }} payload
 */
export function stashOnboardingAuthHandoff(payload) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        method: payload.method,
        name: payload.name || null,
        email: payload.email || null,
        picture: payload.picture || null,
        at: Date.now(),
      }),
    );
  } catch {
    // Private mode / quota — continue query param alone still works with Firebase.
  }
}

/**
 * Read and clear a pending handoff. Returns null when missing or expired.
 * @returns {{ method: string, name: string | null, email: string | null, picture: string | null } | null}
 */
export function takeOnboardingAuthHandoff() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.method || !data?.at) return null;
    if (Date.now() - data.at > MAX_AGE_MS) return null;
    return {
      method: data.method,
      name: data.name || null,
      email: data.email || null,
      picture: data.picture || null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve Firebase currentUser, waiting briefly for persistence restore after
 * a full-page navigation from /login.
 * @param {import('firebase/auth').Auth} auth
 * @param {number} [timeoutMs]
 * @returns {Promise<import('firebase/auth').User | null>}
 */
export function waitForFirebaseUser(auth, timeoutMs = 8000) {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(user || null);
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) finish(user);
    });

    const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
  });
}
