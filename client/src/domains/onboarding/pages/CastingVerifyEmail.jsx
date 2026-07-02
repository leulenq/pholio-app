/**
 * Casting Verify Email — the inbox beat.
 * Shown only after an email/password signup (OAuth users arrive verified).
 * The screen notices on its own: it polls the Firebase user until the link in
 * the inbox is clicked, then acknowledges and moves on. The dock's primary
 * action re-checks on demand; the skip slot resends the email (with cooldown).
 * Verification truth is synced server-side via POST /onboarding/email-verified.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../../shared/lib/firebase';
import { fadeVariants } from './animations';
import StepBeat from '../components/StepBeat';
import { InlineErrorText } from '../../../shared/components/states';
import { useActionDock } from '../components/ActionDockContext';
import { useCastingEmailVerified } from '../hooks/useCasting';
import '../styles/CastingSteps.css';

const RESEND_COOLDOWN_MS = 45000;
const POLL_INTERVAL_MS = 5000;

function CastingVerifyEmail({ email, onComplete, previewActive = false }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [cooling, setCooling] = useState(false);
  const verifiedRef = useRef(false);
  const emailVerifiedMutation = useCastingEmailVerified();

  const finishVerified = useCallback(async () => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;
    // Record the verified claim server-side. Best effort — /login re-syncs it,
    // so a hiccup here must never strand the user on this screen.
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (token) {
        await emailVerifiedMutation.mutateAsync({ firebase_token: token });
      }
    } catch {
      /* non-blocking */
    }
    onComplete();
  }, [emailVerifiedMutation, onComplete]);

  // Auto-notice: the moment the link is clicked (any tab, any device), this
  // screen sees it on the next poll and advances without a tap.
  useEffect(() => {
    if (previewActive) return undefined;
    const id = setInterval(async () => {
      const user = auth.currentUser;
      if (!user || verifiedRef.current) return;
      try {
        await user.reload();
        if (user.emailVerified) finishVerified();
      } catch {
        /* transient — next poll retries */
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [previewActive, finishVerified]);

  const checkNow = useCallback(async () => {
    setError('');
    setNote('');
    const user = auth.currentUser;
    if (!user) {
      setNote('Open the link in your inbox, then come back.');
      return;
    }
    try {
      await user.reload();
      if (user.emailVerified) finishVerified();
      else setNote('Not yet — the link in your inbox does it.');
    } catch {
      setError('Could not check just now. Try again in a moment.');
    }
  }, [finishVerified]);

  const resend = useCallback(async () => {
    if (cooling) return;
    setError('');
    setNote('');
    const user = auth.currentUser;
    if (!user) return;
    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/onboarding`,
      });
      setNote('Sent again. Give it a minute.');
      setCooling(true);
      setTimeout(() => setCooling(false), RESEND_COOLDOWN_MS);
    } catch {
      setError('Could not resend just now. Try again shortly.');
    }
  }, [cooling]);

  useActionDock({
    label: "I've verified",
    enabled: true,
    onAdvance: checkNow,
    skip: { label: cooling ? 'Sent' : 'Resend email', onClick: resend },
  });

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="cs-step-stage"
    >
      <StepBeat text="Verify your *email*." dividerDelay={0.3} />

      <div className="cs-address-card">
        <div className="cs-address-label">Destination Address</div>
        <div className="cs-address-email">{email || 'your email'}</div>
      </div>

      {note && <p className="cs-stage-helper cs-verify-note">{note}</p>}
      <InlineErrorText message={error} className="cinematic-field-error" />
    </motion.div>
  );
}

export default CastingVerifyEmail;
