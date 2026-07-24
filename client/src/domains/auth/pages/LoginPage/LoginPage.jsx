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

const EASE = [0.16, 1, 0.3, 1];

// Dev-only: when Firebase is not configured locally, sign in through the
// backend /api/dev/login endpoint using the seeded bcrypt password.
const DEV_PASSTHROUGH =
  import.meta.env.DEV &&
  import.meta.env.VITE_AUTH_PASSTHROUGH_ENABLED === '1';

const GoogleIcon = () => (
  <img
    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
    alt=""
    width={18}
    height={18}
    style={{ flexShrink: 0 }}
  />
);

const InstagramIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="2" />
    <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
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
        headers: { Accept: 'application/json' },
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
          className={styles.socialBtn}
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
          className={styles.socialBtn}
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
