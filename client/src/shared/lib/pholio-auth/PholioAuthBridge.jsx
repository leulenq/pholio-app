import { useCallback, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { isExplicitAuthInFlight } from './auth-lock';
import { notifyAuthChange, subscribeAuthChanges } from './broadcast';
import { fetchAppSession, syncFirebaseSession } from './session-api';

/**
 * Keeps Express session aligned with Firebase auth and broadcasts changes
 * so the marketing site header updates without a full reload.
 */
export default function PholioAuthBridge() {
  // Guards against overlapping runs — onAuthStateChanged, the broadcast
  // channel, and a focus/visibility event can all fire within the same
  // moment (e.g. on mount, or two rapid tab switches), and each used to
  // kick off its own independent re-login.
  const syncInFlightRef = useRef(false);

  // `broadcast: false` for refreshes that were themselves triggered by an
  // incoming broadcast. Re-notifying there is what closed the loop:
  // notify -> subscriber -> refresh -> notify, each pass issuing another
  // GET /api/session. broadcast.js now also shares one channel so a tab no
  // longer hears itself; this is the belt to that pair of braces.
  const refreshFromFirebase = useCallback(async (firebaseUser, { broadcast = true } = {}) => {
    // A sign-in is running and owns the session. Closing the OAuth popup fires
    // `focus` and `onAuthStateChanged` at almost the same instant the login
    // handler POSTs /api/login; reconciling here would issue a second POST,
    // and each one regenerates the session id, so whichever lost the race left
    // the other holding a cookie for a session that no longer exists — a
    // transient 401 moments later, which the api-client turns into a bounce
    // back to /login. Stand down; the login flow will broadcast when it lands.
    if (isExplicitAuthInFlight()) return;
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      if (firebaseUser) {
        // Only re-establish the Express session if it actually looks gone.
        // POST /api/login regenerates the session id (session-fixation
        // hardening) even when the caller was already validly signed in —
        // calling it unconditionally on every focus/visibility event was
        // destroying a perfectly good session (and its cookie) for no
        // reason on every tab switch. Check first with a plain read; only
        // fall through to re-auth when the Express side is truly missing.
        const currentSession = await fetchAppSession();
        if (!currentSession?.authenticated) {
          const idToken = await firebaseUser.getIdToken();
          await syncFirebaseSession(idToken);
        }
      }
      if (broadcast) notifyAuthChange({ authenticated: !!firebaseUser });
    } catch (error) {
      // Non-fatal — Express session may still be valid without Firebase
      // client state — but log it so a silent failure here is diagnosable.
      console.warn('[PholioAuthBridge] Session sync failed (non-fatal):', error?.message);
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Without a Firebase client config (e.g. dev seeded-login environments)
    // `auth` is null; the Express session is the sole source of truth then.
    if (!auth) return undefined;

    const unsubscribeFirebase = onAuthStateChanged(auth, (user) => {
      refreshFromFirebase(user);
    });

    const unsubscribeBroadcast = subscribeAuthChanges(() => {
      refreshFromFirebase(auth.currentUser, { broadcast: false });
    });

    const onFocus = () => {
      if (isExplicitAuthInFlight()) return;
      refreshFromFirebase(auth.currentUser);
      notifyAuthChange({ source: 'focus' });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsubscribeFirebase();
      unsubscribeBroadcast();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshFromFirebase]);

  return null;
}
