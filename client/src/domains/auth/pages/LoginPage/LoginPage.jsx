import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { auth } from '../../../../shared/lib/firebase';
import { notifyAuthChange } from '../../../../shared/lib/pholio-auth/broadcast';
import { markAuthEntryTransition } from '../../../../shared/lib/pholio-auth/entry-transition';
import { purgeApplyDraftStorage } from '../../../talent/pages/ApplyPage/applicationDraftStorage';
import { useAuthenticatedEntryRedirect } from '../../hooks/useAuthenticatedEntryRedirect';
import {
  isInstagramAuthConfigured,
  startInstagramAuth,
} from '../../lib/instagram-auth';
import LegalNoticeLine from '../../../../shared/components/LegalNoticeLine';
import {
  stashOnboardingAuthHandoff,
} from '../../../../shared/lib/pholio-auth/onboarding-handoff';
import styles from './LoginPage.module.css';
import { sameOriginMutationHeaders } from '../../../../shared/lib/same-origin-request';

const EASE = [0.16, 1, 0.3, 1];

// Dev-only: when Firebase is not configured locally, sign in through the
// backend /api/dev/login endpoint using the seeded bcrypt password.
const DEV_PASSTHROUGH =
  import.meta.env.DEV &&
  import.meta.env.VITE_AUTH_PASSTHROUGH_ENABLED === '1';

const GoogleIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const InstagramIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

export default function LoginPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const forceLogin = searchParams.get('force') === '1';
  const inviteToken = searchParams.get('invite') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // A bounce from api-client.js's 401 handler (session looked valid, then the
  // very next request came back unauthenticated) carries reason=session_expired
  // so this isn't a silent, unexplained return to a blank login form.
  const [error, setError] = useState(() =>
    searchParams.get('reason') === 'session_expired'
      ? 'Your session couldn’t be verified. Please sign in again.'
      : null,
  );
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isInstagramLoading, setIsInstagramLoading] = useState(false);
  const [instagramEnabled, setInstagramEnabled] = useState(false);

  useAuthenticatedEntryRedirect();

  useEffect(() => {
    isInstagramAuthConfigured().then(setInstagramEnabled);
  }, []);

  useEffect(() => {
    if (!forceLogin) return undefined;

    async function clearSession() {
      await signOut(auth).catch(() => {});
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...sameOriginMutationHeaders('POST'),
        },
      }).catch(() => {});
      purgeApplyDraftStorage();
    }

    clearSession();
    return undefined;
  }, [forceLogin]);

  const from = location.state?.from?.pathname
    || searchParams.get('redirect')
    || searchParams.get('next')
    || '/dashboard/talent';

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await authenticateWithBackend(idToken, {
        method: 'google',
        name: result.user.displayName,
        email: result.user.email,
        picture: result.user.photoURL,
      });
    } catch (err) {
      setError(
        err.code === 'auth/popup-closed-by-user'
          ? 'Sign in cancelled.'
          : 'Failed to sign in with Google. Please try again.'
      );
      setIsGoogleLoading(false);
    }
  };

  const handleInstagramSignIn = async () => {
    setError(null);

    if (!instagramEnabled) {
      setError('Instagram sign-in is not configured yet. Use email or Google for now.');
      return;
    }

    setIsInstagramLoading(true);
    startInstagramAuth({ flow: 'login', next: from });
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    if (DEV_PASSTHROUGH) {
      await devEmailSignIn();
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();
      await authenticateWithBackend(idToken, { method: 'email' });
    } catch (err) {
      let msg = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please try again later.';
      }
      setError(msg);
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first to reset your password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResetSent(false);

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send reset email.');
      }
      setResetSent(true);
      setIsLoading(false);
    } catch (err) {
      let msg = 'Failed to send reset email. Please try again.';
      if (err.message) {
        msg = err.message;
      }
      setError(msg);
      setIsLoading(false);
    }
  };

  const devEmailSignIn = async () => {
    try {
      // Only forward an explicit redirect target; otherwise let the backend
      // pick the role-based destination (from defaults to the talent dashboard).
      const explicitNext = location.state?.from?.pathname
        || searchParams.get('redirect')
        || searchParams.get('next')
        || null;
      const response = await fetch('/api/dev/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password, next: explicitNext || undefined }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      notifyAuthChange({ authenticated: true });
      markAuthEntryTransition();
      window.location.href = data.redirect || from;
    } catch (err) {
      setError(err.message || 'Failed to sign in.');
      setIsLoading(false);
    }
  };

  const authenticateWithBackend = async (idToken, identity = {}) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...sameOriginMutationHeaders('POST'),
        },
        body: JSON.stringify({
          firebase_token: idToken,
          invite_token: inviteToken || undefined,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response from backend:', text.substring(0, 500));
        throw new Error(`Server returned unexpected response (${response.status})`);
      }

      const data = await response.json();

      // First-time Google/Instagram identities have no Pholio user yet — hand
      // the Firebase session into casting so they don't click OAuth again.
      if (data?.error === 'NEEDS_ONBOARDING') {
        const method = identity.method === 'instagram' ? 'instagram' : 'google';
        if (identity.method === 'google' || identity.method === 'instagram') {
          stashOnboardingAuthHandoff({
            method,
            name: identity.name,
            email: identity.email,
            picture: identity.picture,
          });
          window.location.href = `/onboarding?continue=${method}`;
          return;
        }
        window.location.href = data.redirect || '/onboarding';
        return;
      }

      if (!response.ok) {
        let errorMessage = 'Backend authentication failed';

        if (typeof data.error === 'string') {
          errorMessage = data.error;
        } else if (data.error?.message) {
          errorMessage = data.error.message;
        } else if (data.errors) {
          const firstError = Object.values(data.errors)[0];
          if (Array.isArray(firstError)) {
            errorMessage = firstError[0];
          } else if (typeof firstError === 'string') {
            errorMessage = firstError;
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      notifyAuthChange({ authenticated: true });
      markAuthEntryTransition();
      window.location.href = data.redirect || from;
    } catch (err) {
      setError(err.message || 'Server connection failed. Please try again.');
      setIsLoading(false);
      setIsGoogleLoading(false);
    }
  };

  const busy = isLoading || isGoogleLoading || isInstagramLoading;

  return (
    <motion.div
      className={styles.root}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <header className={styles.heading}>
        <h1 className={styles.title}>
          Welcome back to <em className={styles.titleAccent}>your book.</em>
        </h1>
        <p className={styles.subtitle}>
          Sign in to keep building your portfolio and track every submission.
        </p>
      </header>

      {resetSent && (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status" aria-live="polite">
          <CheckCircle2 size={18} />
          <span>Password reset email sent. Please check your inbox.</span>
        </div>
      )}

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert" aria-live="assertive" id="login-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={handleEmailSignIn}
        className={styles.form}
        noValidate
        aria-describedby={error ? 'login-error' : undefined}
      >
        <div className={styles.formGroup}>
          <label htmlFor="login-email" className={styles.label}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="you@studio.com"
            required
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <div className={styles.labelRow}>
            <label htmlFor="login-password" className={styles.label}>
              Password
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className={styles.forgotLink}
            >
              Forgot?
            </button>
          </div>
          <div className={styles.passwordWrapper}>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="Your password"
              required
              className={styles.inputPassword}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={busy}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={busy} className={styles.submitButton}>
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Sign in'}
        </button>
      </form>

      <div className={styles.divider} aria-hidden="true">
        <span className={styles.dividerText}>Or continue with</span>
      </div>

      <div className={styles.socialRow}>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className={`${styles.socialBtn} ${styles.socialBtnGoogle}`}
          aria-label="Sign in with Google"
        >
          {isGoogleLoading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              <GoogleIcon />
              <span>Google</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleInstagramSignIn}
          disabled={busy}
          className={`${styles.socialBtn} ${styles.socialBtnInstagram}`}
          aria-label="Sign in with Instagram"
        >
          {isInstagramLoading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              <InstagramIcon />
              <span>Instagram</span>
            </>
          )}
        </button>
      </div>

      <LegalNoticeLine className={styles.legalNotice} />

      <div className={styles.footerRow}>
        <span>New here?</span>
        <Link to="/onboarding" className={styles.footerLink}>
          Join as talent
        </Link>
        <span className={styles.footerDot}>·</span>
        <Link to="/onboarding?type=agency" className={styles.footerLink}>
          Bring your agency
        </Link>
      </div>
    </motion.div>
  );
}
