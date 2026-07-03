/**
 * Casting Entry - Step 1: Authentication Choice
 * Brand-compliant auth selection: Google, Instagram, or Manual
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../../../shared/lib/firebase';
import { useCastingEntry } from '../hooks/useCasting';
import { fadeVariants, containerVariants, childVariants } from './animations';
import { Loader2 } from 'lucide-react';

import StepBeat from '../components/StepBeat';
import SpotlightField from '../components/SpotlightField';
import { useActionDock } from '../components/ActionDockContext';
import { InlineErrorText } from '../../../shared/components/states';
import LegalNoticeLine from '../../../shared/components/LegalNoticeLine';
import {
  isInstagramAuthConfigured,
  startInstagramAuth,
} from '../../auth/lib/instagram-auth';
import './CastingEntry.screen.css';
import '../styles/CastingSteps.css';

// Acceptance travels silently with every entry payload — the colophon under the
// buttons is the disclosure; nothing blocks and nothing toasts.
const LEGAL_ACCEPTANCE = { terms_accepted: true, privacy_accepted: true };

/** Map raw Firebase error codes to quiet, house-voice inline copy. */
function humanizeAuthError(error) {
  switch (error?.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "That password doesn't match.";
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/invalid-email':
      return "That email doesn't look right.";
    case 'auth/weak-password':
      return 'Use at least six characters.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in closed before it finished.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a moment.';
    default:
      return 'Something interrupted sign-in. Try again.';
  }
}

function CastingEntry({ onComplete, onProgress, registerBack, initialStep, onAuthenticating }) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authenticatingMethod, setAuthenticatingMethod] = useState(null); // 'google' | 'instagram' | 'email'
  const getInitialManualStep = () => {
    if (initialStep === 'name') return 1;
    if (initialStep === 'email') return 2;
    if (initialStep === 'password') return 3;
    return 0;
  };
  const [manualStep, setManualStep] = useState(getInitialManualStep);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const entryMutation = useCastingEntry();

  // Propagate authenticating state up to hide progress bars
  React.useEffect(() => {
    if (onAuthenticating) {
      onAuthenticating(isAuthenticating);
    }
  }, [isAuthenticating, onAuthenticating]);

  // Sync manualStep when initialStep changes from dev preview
  React.useEffect(() => {
    if (initialStep !== undefined) {
      if (initialStep === 'name') setManualStep(1);
      else if (initialStep === 'email') setManualStep(2);
      else if (initialStep === 'password') setManualStep(3);
      else setManualStep(0);
    }
  }, [initialStep]);

  // Auto-simulate OAuth signups in dev preview mode
  React.useEffect(() => {
    if (initialStep === 'google') {
      setAuthError(null);
      setAuthenticatingMethod('google');
      setIsAuthenticating(true);
    } else if (initialStep === 'instagram') {
      setAuthError(null);
      setAuthenticatingMethod('instagram');
      setIsAuthenticating(true);
    }
  }, [initialStep]);

  // Register manual step back transitions with parent shell
  React.useEffect(() => {
    if (!registerBack) return undefined;
    registerBack(() => {
      if (manualStep > 0) {
        setManualStep((prev) => prev - 1);
        setFieldErrors({});
        setAuthError(null);
        return true;
      }
      return false;
    });
    return () => registerBack(null);
  }, [registerBack, manualStep]);

  // Report progress whenever manualStep changes.
  // 4 sub-steps: Choice(0), Name(1), Email(2), Password(3) → 0% -> 75% of "Entry".
  React.useEffect(() => {
    if (onProgress) {
      onProgress(manualStep / 4);
    }
  }, [manualStep, onProgress]);

  useEffect(() => {
    isInstagramAuthConfigured().then(setInstagramEnabled);
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthenticatingMethod('google');
    setIsAuthenticating(true);

    if (import.meta.env.DEV) {
      await new Promise((r) => setTimeout(r, 1000));
      onComplete({
        hasOAuthData: true,
        method: 'google',
        name: 'Ava Martinez',
        email: 'ava.martinez@gmail.com',
        picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        manualData: { name: 'Ava Martinez' },
      });
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      const response = await entryMutation.mutateAsync({
        firebase_token: token,
        name: result.user.displayName,
        ...LEGAL_ACCEPTANCE,
      });
      onComplete({
        hasOAuthData: response.has_oauth_data,
        method: 'google',
        name: result.user.displayName,
        email: result.user.email,
        picture: result.user.photoURL,
        manualData: result.user.displayName ? { name: result.user.displayName } : undefined,
      });
    } catch (error) {
      console.error('[Casting Entry] Auth error:', error);
      setAuthError(humanizeAuthError(error));
      setIsAuthenticating(false);
    }
  };

  // Instagram stays in the flow even before it's fully wired (owner call
  // 2026-07-02). Unconfigured environments answer with a quiet inline note.
  const [authNote, setAuthNote] = useState(null);
  const handleInstagramSignIn = () => {
    setAuthError(null);
    setAuthenticatingMethod('instagram');

    if (import.meta.env.DEV) {
      setIsAuthenticating(true);
      setTimeout(() => {
        onComplete({
          hasOAuthData: true,
          method: 'instagram',
          name: 'ava.martinez',
          picture: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80',
          manualData: { name: 'Ava Martinez' },
        });
      }, 1000);
      return;
    }

    if (!instagramEnabled) {
      setAuthNote('Instagram sign-up is almost ready. Use Google or email for now.');
      return;
    }
    setAuthNote(null);
    setIsAuthenticating(true);
    startInstagramAuth({ flow: 'signup' });
  };

  const handleNextManual = () => {
    const nextErrors = {};
    if (manualStep === 1 && !formData.name?.trim()) nextErrors.name = 'Enter your name to continue.';
    if (manualStep === 2 && !formData.email?.trim()) nextErrors.email = 'Enter your email to continue.';
    if (manualStep === 3 && !formData.password?.trim()) nextErrors.password = 'Choose a password to continue.';

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setAuthError(null);
    if (manualStep < 3) {
      setManualStep(manualStep + 1);
    } else {
      handleManualSignup();
    }
  };

  const handleManualSignup = async () => {
    setAuthError(null);
    setAuthenticatingMethod('email');
    setIsAuthenticating(true);
    try {
      // 1. Create the Firebase user + set display name.
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: formData.name });

      // 2. Complete entry immediately; verification lives in the inbox, not the
      // flow. The entry endpoint sends the verification email through our own
      // SMTP provider (it generates the Firebase link server-side) — we no
      // longer use Firebase's built-in sender here.
      const token = await user.getIdToken();
      const response = await entryMutation.mutateAsync({
        firebase_token: token,
        name: formData.name,
        ...LEGAL_ACCEPTANCE,
      });

      onComplete({
        hasOAuthData: response.has_oauth_data,
        method: 'manual',
        manualData: { name: formData.name, email: formData.email },
      });
    } catch (error) {
      console.error('[Casting Entry] Signup error:', error);
      setAuthError(humanizeAuthError(error));
      setIsAuthenticating(false);
    }
  };

  // The value backing the current manual sub-step drives the dock's enabled state.
  const manualValue =
    manualStep === 1
      ? formData.name
      : manualStep === 2
        ? formData.email
        : manualStep === 3
          ? formData.password
          : '';

  // The single fixed action for the flow. Called once, unconditionally:
  //  · step 0 (the auth doors) → no dock (reserved height kept)
  //  · steps 1–3 → "Continue" (gold once the field has content), Enter also works
  useActionDock(
    manualStep === 0
      ? { label: null }
      : {
          label: isAuthenticating ? 'Creating Account…' : 'Continue',
          enabled: !isAuthenticating && manualValue.trim().length > 0,
          onAdvance: handleNextManual,
        }
  );

  return (
    <AnimatePresence mode="wait">
      {isAuthenticating ? (
        <motion.div
          key="authenticating"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="cs-step-stage select-none"
        >
          {authenticatingMethod === 'instagram' ? (
            <>
              <div className="ig-aperture-ring mb-8 flex items-center justify-center relative w-20 h-20 mx-auto">
                <svg viewBox="0 0 100 100" className="w-full h-full fill-none stroke-[#c9a55a] stroke-[1.5] stroke-linecap-round animate-[spin_15s_linear_infinite]">
                  <circle cx="50" cy="50" r="44"/>
                  <path d="M50 6 L50 94"/>
                  <path d="M6 50 L94 50"/>
                  <path d="M19 19 L81 81"/>
                  <path d="M19 81 L81 19"/>
                </svg>
                <div className="absolute w-6 h-6 rounded-full bg-[#c9a55a] shadow-[0_0_20px_#c9a55a] animate-[pulse-glow_2.5s_cubic-bezier(0.22,1,0.36,1)_infinite]" />
              </div>
              <h2 className="title-serif">Syncing <em>Grid</em></h2>
              <p className="label-sans">Connecting secure Instagram session</p>
            </>
          ) : (
            <span className="google-serene-word select-none">
              {authenticatingMethod === 'email' ? 'Creating account.' : 'Authenticating.'}
            </span>
          )}
        </motion.div>
      ) : manualStep === 0 ? (
        <motion.div
          key="choice"
          variants={containerVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="text-center entry-choice"
        >
          {/* Main Text: Editorial Style */}
          <StepBeat text="Let's get you *seen*" dividerDelay={0.6} questionDelay={0.3} />

          <motion.div
            className="cinematic-card"
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '440px', padding: '3rem 2.5rem', margin: '0 auto' }}
          >
            <div className="space-y-3">
              {/* Option 1: Google */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthenticating}
                className="entry-auth-btn entry-auth-btn--google"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span style={{ fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)", letterSpacing: '0.05em', fontWeight: 600, fontSize: '14px' }}>
                  Sign up with Google
                </span>
              </button>

              {/* Option 2: Instagram — always present in the flow */}
              <button
                type="button"
                onClick={handleInstagramSignIn}
                disabled={isAuthenticating}
                className="entry-auth-btn entry-auth-btn--instagram"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <span style={{ fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)", letterSpacing: '0.05em', fontWeight: 600, fontSize: '14px' }}>
                  Sign up with Instagram
                </span>
              </button>

              {/* Option 3: Email */}
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setManualStep(1);
                }}
                disabled={isAuthenticating}
                className="entry-auth-btn entry-auth-btn--email"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M3 7l9 6 9-6"/>
                </svg>
                <span style={{ fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)", letterSpacing: '0.05em', fontWeight: 600, fontSize: '14px' }}>
                  Sign up with Email
                </span>
              </button>

              <InlineErrorText message={authError} className="cinematic-field-error" />

              <AnimatePresence>
                {authNote && (
                  <motion.p
                    key="auth-note"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      margin: '0.75rem 0 0',
                      fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)",
                      fontSize: '11px',
                      letterSpacing: '0.04em',
                      lineHeight: 1.5,
                      color: 'rgba(255, 255, 255, 0.45)',
                    }}
                  >
                    {authNote}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div style={{ marginTop: '1.75rem' }}>
              <LegalNoticeLine />
            </div>
          </motion.div>
        </motion.div>
      ) : manualStep === 1 ? (
        <motion.div
          key="name"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="cs-step-stage"
        >
          <StepBeat text="What is your *name*?" dividerDelay={0.6} questionDelay={0.3} />

          <SpotlightField
            key="name-field"
            type="text"
            autoFocus
            value={formData.name}
            placeholder="Type your name"
            aria-label="Your name"
            aria-invalid={!!fieldErrors.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              if (fieldErrors.name) setFieldErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
            }}
            onEnter={handleNextManual}
          />

          <div className="entry-manual-below">
            <InlineErrorText message={fieldErrors.name} className="cinematic-field-error" />
            <span className="entry-hint">Press Enter ↵</span>
          </div>
        </motion.div>
      ) : manualStep === 2 ? (
        <motion.div
          key="email"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="cs-step-stage"
        >
          <StepBeat text="And your *email*?" dividerDelay={0.6} questionDelay={0.3} />

          <SpotlightField
            key="email-field"
            type="email"
            autoFocus
            value={formData.email}
            placeholder="you@example.com"
            aria-label="Your email"
            aria-invalid={!!fieldErrors.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (fieldErrors.email) setFieldErrors((prev) => { const n = { ...prev }; delete n.email; return n; });
            }}
            onEnter={handleNextManual}
          />

          <div className="entry-manual-below">
            <InlineErrorText message={fieldErrors.email} className="cinematic-field-error" />
            <span className="entry-hint">Press Enter ↵</span>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="password"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="cs-step-stage"
        >
          <StepBeat text="Create a *password*" dividerDelay={0.6} questionDelay={0.3} />

          <SpotlightField
            key="password-field"
            type="password"
            autoFocus
            value={formData.password}
            placeholder="Choose a password"
            aria-label="Choose a password"
            aria-invalid={!!fieldErrors.password}
            onChange={(e) => {
              setFormData({ ...formData, password: e.target.value });
              if (fieldErrors.password) setFieldErrors((prev) => { const n = { ...prev }; delete n.password; return n; });
              if (authError) setAuthError(null);
            }}
            onEnter={handleNextManual}
          />

          <div className="entry-manual-below">
            <InlineErrorText message={fieldErrors.password} className="cinematic-field-error" />
            <InlineErrorText message={authError} className="cinematic-field-error" />
            <span className="entry-hint">Press Enter ↵</span>
          </div>
        </motion.div>
      )}

    </AnimatePresence>
  );
}

export default CastingEntry;
