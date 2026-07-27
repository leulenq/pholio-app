import { useCallback, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
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

  const refreshFromFirebase = useCallback(async (firebaseUser, { announce = false } = {}) => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    let authenticated = false;
    try {
      const currentSession = await fetchAppSession();
      authenticated = currentSession?.authenticated === true;

      if (firebaseUser && !authenticated) {
        // Only re-establish the Express session if it actually looks gone.
        // POST /api/login regenerates the session id (session-fixation
        // hardening) even when the caller was already validly signed in —
        // calling it unconditionally on every focus/visibility event was
        // destroying a perfectly good session (and its cookie) for no
        // reason on every tab switch. Check first with a plain read; only
        // fall through to re-auth when the Express side is truly missing.
        const idToken = await firebaseUser.getIdToken();
        const syncResult = await syncFirebaseSession(idToken);
        authenticated = syncResult.success === true;
        if (!authenticated) {
          console.warn('[PholioAuthBridge] Session sync failed:', syncResult.reason || 'unsuccessful_response');
        }
      }
    } catch (error) {
      // Non-fatal — Express session may still be valid without Firebase
      // client state — but log it so a silent failure here is diagnosable.
      console.warn('[PholioAuthBridge] Session sync failed (non-fatal):', error?.message);
    } finally {
      syncInFlightRef.current = false;
    }

    // Firebase changes are local state changes worth announcing. Focus and
    // incoming broadcasts are synchronization signals only; echoing either
    // would create a cross-tab broadcast loop.
    if (announce) {
      notifyAuthChange({ authenticated });
    }
  }, []);

  useEffect(() => {
    // Without a Firebase client config (e.g. dev seeded-login environments)
    // `auth` is null; the Express session is the sole source of truth then.
    if (!auth) return undefined;

    const unsubscribeFirebase = onAuthStateChanged(auth, (user) => {
      refreshFromFirebase(user, { announce: true });
    });

    const unsubscribeBroadcast = subscribeAuthChanges(() => {
      refreshFromFirebase(auth.currentUser);
    });

    const onFocus = () => {
      refreshFromFirebase(auth.currentUser);
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
