import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, Mail, Lock } from 'lucide-react';
import { sameOriginMutationHeaders } from '../../../../shared/lib/same-origin-request';
// Reuses LoginPage's stylesheet rather than forking one: same inputs, alerts,
// and submit button, so this reads as the same form continued on its own
// screen, not a redesign. CSS Modules scope by file path, so importing it
// here is exactly as safe as importing it from LoginPage.jsx itself.
import styles from '../LoginPage/LoginPage.module.css';

const EASE = [0.16, 1, 0.3, 1];

/**
 * A screen of its own, not a toggle on the login form.
 *
 * The login page used to ask for an email into the password field's own
 * input, then only accept "Forgot?" once something was typed there — so
 * resetting a password meant typing the email once for login, clicking
 * Forgot, and getting an error if that field happened to be empty. This is
 * the same request (`POST /api/auth/password-reset`), just with its own
 * input, its own submit, and its own confirmation state, so arriving here
 * needs nothing typed anywhere else first.
 *
 * If the visitor arrived via the login page's "Forgot?" link with an email
 * already typed there, `location.state.email` prefills this field — a
 * convenience, not a requirement; the field stays freely editable.
 *
 * "Back to sign in" lives in AuthLayout's own header, beside the wordmark —
 * the actual top-left of the page — not inline at the top of this panel.
 * AuthLayout renders it for this route by pathname; see HEADER_BACK_LINKS
 * there.
 */
export default function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Enter your email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...sameOriginMutationHeaders('POST'),
        },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send reset email.');
      }
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      className={styles.root}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {sent ? (
        <>
          <div className={styles.forgotIcon} aria-hidden="true">
            <Mail size={26} />
          </div>
          <header className={styles.heading}>
            <h1 className={styles.title}>
              Check <em className={styles.titleAccent}>your inbox.</em>
            </h1>
            <p className={styles.subtitle}>
              If an account exists for <strong>{email}</strong>, a reset link
              is on its way. It expires in an hour.
            </p>
          </header>

          <button
            type="button"
            className={styles.forgotResend}
            onClick={() => setSent(false)}
          >
            Didn&rsquo;t get it? Try again
          </button>
        </>
      ) : (
        <>
          <div className={styles.forgotIcon} aria-hidden="true">
            <Lock size={24} />
          </div>
          <header className={styles.heading}>
            <h1 className={styles.title}>
              Reset your <em className={styles.titleAccent}>password.</em>
            </h1>
            <p className={styles.subtitle}>
              Enter the email on your account and we&rsquo;ll send a secure
              link to set a new password.
            </p>
          </header>

          {error && (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert" aria-live="assertive" id="forgot-password-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={styles.form}
            noValidate
            aria-describedby={error ? 'forgot-password-error' : undefined}
          >
            <div className={styles.formGroup}>
              <label htmlFor="forgot-email" className={styles.label}>
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                placeholder="you@studio.com"
                required
                className={styles.input}
              />
            </div>

            <button type="submit" disabled={isLoading} className={styles.submitButton}>
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send reset link'}
            </button>
          </form>

          <div className={styles.footerRow}>
            <span>Remembered it?</span>
            <Link to="/login" className={styles.footerLink}>
              Back to sign in
            </Link>
          </div>
        </>
      )}
    </motion.div>
  );
}
