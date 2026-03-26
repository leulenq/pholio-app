import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { Loader2, AlertCircle, Instagram, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { auth } from '../../../../shared/lib/firebase';
import GradientText from '../../../../shared/components/ui/GradientText';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const forceLogin = searchParams.get('force') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        if (forceLogin) {
          await signOut(auth).catch(() => {});
          await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }).catch(() => {});
          return;
        }

        const response = await fetch('/api/session', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const data = await response.json();
        if (!cancelled && data?.authenticated && data?.redirect) {
          navigate(data.redirect);
        }
      } catch {
        // Ignore session bootstrap failures on login page
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [forceLogin, navigate]);

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
      await authenticateWithBackend(idToken);
    } catch (err) {
      setError(
        err.code === 'auth/popup-closed-by-user'
          ? 'Sign in cancelled.'
          : 'Failed to sign in with Google. Please try again.'
      );
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();
      await authenticateWithBackend(idToken);
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
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setIsLoading(false);
    } catch (err) {
      let msg = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setError(msg);
      setIsLoading(false);
    }
  };

  const authenticateWithBackend = async (idToken) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ firebase_token: idToken })
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response from backend:', text.substring(0, 500));
        throw new Error(`Server returned unexpected response (${response.status})`);
      }

      const data = await response.json();

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

      window.location.href = data.redirect || from;
    } catch (err) {
      setError(err.message || 'Server connection failed. Please try again.');
      setIsLoading(false);
      setIsGoogleLoading(false);
    }
  };

  const busy = isLoading || isGoogleLoading;

  return (
    <div className="w-full max-w-md mx-auto relative">
      <div className={styles.grain} aria-hidden="true" />

      {/* Heading */}
      <div style={{ marginBottom: '32px' }}>
        <h1 className={styles.heading}>
          <GradientText
            colors={['#c9a559', '#c9a559', '#D4BC8A', '#c9a559']}
            animationSpeed={14}
            showBorder={false}
          >
            Welcome back.
          </GradientText>
        </h1>
        <p className={styles.subtitle}>
          Sign in to your Pholio account.
        </p>
      </div>

      {/* Success banner */}
      {resetSent && (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status" aria-live="polite">
          <CheckCircle2 size={18} />
          <span>Password reset email sent. Please check your inbox.</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert" aria-live="assertive" id="login-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Social Login */}
      <div className={styles.socialRow}>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className={styles.socialButton}
          aria-label="Sign in with Google"
        >
          {isGoogleLoading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt=""
                width={18}
                height={18}
              />
              <span>Google</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); }}
          disabled={busy}
          className={styles.socialButton}
          aria-label="Sign in with Instagram"
        >
          <Instagram size={18} />
          <span>Instagram</span>
        </button>
      </div>

      {/* Divider */}
      <div className={styles.divider}>
        <div className={styles.dividerLine} />
        <span className={styles.dividerText}>or</span>
        <div className={styles.dividerLine} />
      </div>

      {/* Email Form */}
      <form
        onSubmit={handleEmailSignIn}
        className={styles.form}
        noValidate
        aria-describedby={error ? 'login-error' : undefined}
      >
        {/* Email */}
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
            placeholder="you@example.com"
            required
            className={styles.input}
          />
        </div>

        {/* Password */}
        <div className={styles.formGroup} style={{ marginBottom: '8px' }}>
          <label htmlFor="login-password" className={styles.label}>
            Password
          </label>
          <div className={styles.passwordWrapper}>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="••••••••"
              required
              className={styles.inputPassword}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className={styles.forgotRow}>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className={styles.forgotLink}
            >
              Forgot Password?
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          className={styles.submitButton}
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'LOGIN'}
        </button>
      </form>

      {/* Sign Up Link */}
      <div className={styles.signupRow}>
        <p className={styles.signupText}>
          Don&apos;t have an account?{' '}
          <Link to="/onboarding" className={styles.signupLink}>
            Sign up for free
          </Link>
        </p>
      </div>
    </div>
  );
}
