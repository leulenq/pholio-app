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

  const refreshFromFirebase = useCallback(async (firebaseUser) => {
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
      notifyAuthChange({ authenticated: !!firebaseUser });
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
      refreshFromFirebase(auth.currentUser);
    });

    const onFocus = () => {
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
