import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Loader2, AlertCircle, Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';
import { auth } from '../../../../shared/lib/firebase';
import { notifyAuthChange } from '../../../../shared/lib/pholio-auth/broadcast';
import { goToDestination } from '../../lib/spa-navigation';
// Reuses LoginPage's stylesheet, same as ForgotPasswordPage — one visual
// language across the whole auth flow, not a third design.
import styles from '../LoginPage/LoginPage.module.css';

const EASE = [0.16, 1, 0.3, 1];

/**
 * Where the emailed reset link actually lands.
 *
 * Before this existed, Firebase's own generic hosted page (the project's
 * authDomain, unbranded) handled "type a new password" — this app never saw
 * the visit, never learned it happened, and had no way to tell the user it
 * worked beyond dropping them back at /login with no acknowledgment.
 * `sendPasswordResetViaSmtp` now generates the link with `handleCodeInApp:
 * true` and `url: ${appUrl}/reset-password`, so the oobCode arrives here as a
 * query param instead.
 *
 * On success this signs the visitor straight in — they just proved control of
 * the account by setting its password — and asks the backend to send the
 * "your password was changed" confirmation (`password_just_reset: true` on
 * POST /api/login; see the comment there for why that's the right place to
 * fire it, not here). If that sign-in step itself fails for some reason, the
 * password change already succeeded regardless — `fallback-success` says so
 * plainly and points at a normal sign-in instead of reporting an error for a
 * step that actually worked.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');
  // Derived from the URL alone — stable for the life of this mount, so the
  // initial render already reflects it via the lazy useState initializers
  // below instead of an effect setting state synchronously on mount.
  const malformedLink = mode !== 'resetPassword' || !oobCode;

  const [phase, setPhase] = useState(() => (malformedLink ? 'invalid' : 'verifying'));
  const [email, setEmail] = useState(null);
  const [invalidReason, setInvalidReason] = useState(() =>
    malformedLink
      ? 'This link is incomplete. Copy it directly from the email, or request a new one.'
      : null,
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (malformedLink) return undefined;

    let cancelled = false;

    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        if (cancelled) return;
        setEmail(verifiedEmail);
        setPhase('form');
      })
      .catch((err) => {
        if (cancelled) return;
        setInvalidReason(humanizeCodeError(err));
        setPhase('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [oobCode, malformedLink]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Use at least six characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords don’t match.');
      return;
    }

    setError(null);
    setPhase('submitting');

    try {
      await confirmPasswordReset(auth, oobCode, password);
    } catch (err) {
      setError(humanizeCodeError(err));
      setPhase('form');
      return;
    }

    // The password change is now permanent regardless of anything below —
    // every failure past this point degrades to fallback-success, never back
    // to an error state.
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ firebase_token: idToken, password_just_reset: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Sign-in after reset failed');
      }
      notifyAuthChange({ authenticated: true });
      goToDestination(data.redirect || '/dashboard/talent', navigate);
    } catch (signInErr) {
      console.warn('[ResetPassword] Auto sign-in after reset failed:', signInErr.message);
      setPhase('fallback-success');
    }
  };

  return (
    <motion.div
      className={styles.root}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {phase === 'verifying' && (
        <div className={styles.forgotIcon} aria-hidden="true">
          <Loader2 className="animate-spin" size={24} />
        </div>
      )}

      {phase === 'invalid' && (
        <>
          <div className={styles.forgotIcon} aria-hidden="true">
            <AlertCircle size={24} />
          </div>
          <header className={styles.heading}>
            <h1 className={styles.title}>
              Link <em className={styles.titleAccent}>expired.</em>
            </h1>
            <p className={styles.subtitle}>{invalidReason}</p>
          </header>

          <Link to="/login/forgot-password" className={styles.submitButton} style={{ textDecoration: 'none' }}>
            Request a new link
          </Link>
        </>
      )}

      {(phase === 'form' || phase === 'submitting') && (
        <>
          <div className={styles.forgotIcon} aria-hidden="true">
            <KeyRound size={24} />
          </div>
          <header className={styles.heading}>
            <h1 className={styles.title}>
              Set a new <em className={styles.titleAccent}>password.</em>
            </h1>
            <p className={styles.subtitle}>
              For <strong>{email}</strong>. Make it something you haven&rsquo;t used here before.
            </p>
          </header>

          {error && (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert" aria-live="assertive" id="reset-password-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={styles.form}
            noValidate
            aria-describedby={error ? 'reset-password-error' : undefined}
          >
            <div className={styles.formGroup}>
              <label htmlFor="reset-password" className={styles.label}>
                New password
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  id="reset-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  autoFocus
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={phase === 'submitting'}
                  placeholder="At least six characters"
                  required
                  className={styles.inputPassword}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={phase === 'submitting'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="reset-password-confirm" className={styles.label}>
                Confirm password
              </label>
              <input
                id="reset-password-confirm"
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                autoComplete="new-password"
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={phase === 'submitting'}
                placeholder="Type it again"
                required
                className={styles.input}
              />
            </div>

            <button type="submit" disabled={phase === 'submitting'} className={styles.submitButton}>
              {phase === 'submitting' ? <Loader2 className="animate-spin" size={20} /> : 'Set password'}
            </button>
          </form>
        </>
      )}

      {phase === 'fallback-success' && (
        <>
          <div className={styles.forgotIcon} aria-hidden="true">
            <CheckCircle2 size={24} />
          </div>
          <header className={styles.heading}>
            <h1 className={styles.title}>
              Password <em className={styles.titleAccent}>updated.</em>
            </h1>
            <p className={styles.subtitle}>
              Your new password is set. Sign in with it to continue.
            </p>
          </header>

          <Link to="/login" className={styles.submitButton} style={{ textDecoration: 'none' }}>
            Continue to sign in
          </Link>
        </>
      )}
    </motion.div>
  );
}

/** Firebase error codes from verifyPasswordResetCode / confirmPasswordReset. */
function humanizeCodeError(err) {
  switch (err?.code) {
    case 'auth/expired-action-code':
      return 'This link has expired. Request a new one below.';
    case 'auth/invalid-action-code':
      return 'This link has already been used or is no longer valid. Request a new one below.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support if that seems wrong.';
    case 'auth/user-not-found':
      return 'We couldn’t find the account for this link. Request a new one below.';
    case 'auth/weak-password':
      return 'Use at least six characters.';
    default:
      return err?.message || 'That link didn’t work. Request a new one below.';
  }
}
