import { useCallback, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { notifyAuthChange, subscribeAuthChanges } from './broadcast';
import { fetchPublicSession, syncFirebaseSession } from './session-api';

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

export async function logoutPholioSession() {
  await signOut(auth).catch(() => {});
  await fetch('/api/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).catch(() => {});
  notifyAuthChange({ authenticated: false });
}
