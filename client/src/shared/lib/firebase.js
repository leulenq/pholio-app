/**
 * Firebase Client Initialization
 * Handles client-side Firebase authentication
 *
 * IMPORTANT: Add your Firebase config to .env.local:
 * VITE_FIREBASE_API_KEY=
 * VITE_FIREBASE_AUTH_DOMAIN=
 * VITE_FIREBASE_PROJECT_ID=
 * VITE_FIREBASE_STORAGE_BUCKET=
 * VITE_FIREBASE_MESSAGING_SENDER_ID=
 * VITE_FIREBASE_APP_ID=
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || import.meta.env.FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || import.meta.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || import.meta.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || import.meta.env.FIREBASE_APP_ID
};

// Without a config (e.g. local dev using the seeded /api/dev/login flow),
// getAuth() throws auth/invalid-api-key at module scope and unmounts the
// entire SPA. Initialize lazily-safe instead: export auth = null and let
// Firebase-dependent actions surface their own errors at the point of use.
let app = null;
let auth = null;

if (firebaseConfig.apiKey) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} else {
  console.warn(
    '[Firebase] No VITE_FIREBASE_* configuration found — Firebase auth is disabled. ' +
      'Session-based flows (including the dev seeded login) still work.'
  );
}

export { auth };
export default app;
