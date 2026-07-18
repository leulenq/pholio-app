import { useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { notifyAuthChange, subscribeAuthChanges } from './broadcast';
import { syncFirebaseSession } from './session-api';

/**
 * Keeps Express session aligned with Firebase auth and broadcasts changes
 * so the marketing site header updates without a full reload.
 */
export default function PholioAuthBridge() {
  const refreshFromFirebase = useCallback(async (firebaseUser) => {
    try {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        await syncFirebaseSession(idToken);
      }
      notifyAuthChange({ authenticated: !!firebaseUser });
    } catch {
      // Non-fatal — Express session may still be valid without Firebase client state
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
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      unsubscribeFirebase();
      unsubscribeBroadcast();
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshFromFirebase]);

  return null;
}
