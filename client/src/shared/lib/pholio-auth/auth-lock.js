/**
 * "An explicit login is in flight" latch.
 *
 * Closing the Google sign-in popup fires several things at once: the window
 * `focus` event, Firebase's `onAuthStateChanged`, and the login handler's own
 * `POST /api/login`. PholioAuthBridge reacts to the first two by re-establishing
 * the Express session — which regenerates the session id (session-fixation
 * hardening) — so it could race the login handler's own POST and leave one of
 * the two holding a cookie for a session that no longer exists. The symptom is
 * a transient 401 a moment later, which the api-client turns into a hard bounce
 * to /login: redirect churn on what should be a single, settled sign-in.
 *
 * The login flow owns the session while this latch is held. Background
 * reconcilers stand down rather than issuing a competing write.
 *
 * A counter rather than a boolean so nested/overlapping holders can't have one
 * release clear another's claim.
 */

let holders = 0;

export function beginExplicitAuth() {
  holders += 1;
}

export function endExplicitAuth() {
  holders = Math.max(0, holders - 1);
}

export function isExplicitAuthInFlight() {
  return holders > 0;
}
