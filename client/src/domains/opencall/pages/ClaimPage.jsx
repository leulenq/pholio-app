import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ActionDock from '../components/ActionDock';
import Question from '../components/Question';
import StageShell from '../components/StageShell';
import { MARKETING_SITE_URL, listSentence } from '../components/callCopy';
import { claimProfile, getClaim } from '../api/opencall';

/*
 * The claim — one tap to keep what they already built
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.2).
 *
 * The credential is the token in the URL, delivered to their own mailbox, and
 * clicking it IS the email verification (ruling Q4). So there is exactly one
 * action on this page and no form: a name they recognize, the organizers they
 * applied to, and a button. The password comes later, or never — the credential
 * is the last thing asked for, not the first.
 *
 * A magic link gets clicked twice — by the human, by a mail client's previewer,
 * by a corporate scanner — so a spent link on a claimed identity says "already
 * yours, sign in", never "invalid link".
 */

const PHASES = {
  LOADING: 'loading',
  READY: 'ready',
  CLAIMED: 'claimed',
  INVALID: 'invalid',
};

export default function ClaimPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState(PHASES.LOADING);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getClaim(token);
        if (cancelled) return;
        if (data?.valid) {
          setPreview(data);
          setPhase(PHASES.READY);
          return;
        }
        setPhase(data?.alreadyClaimed ? PHASES.CLAIMED : PHASES.INVALID);
      } catch {
        if (!cancelled) setPhase(PHASES.INVALID);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const keep = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await claimProfile(token);
      if (data?.alreadyClaimed) {
        setPhase(PHASES.CLAIMED);
        return;
      }
      if (data?.redirect) {
        navigate(data.redirect, { replace: true });
        return;
      }
      setPhase(PHASES.INVALID);
    } catch (failure) {
      setError(failure?.message || 'That did not work. Try the link again.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === PHASES.LOADING) {
    return <StageShell label="Loading your link" busy />;
  }

  if (phase === PHASES.INVALID) {
    return (
      <StageShell label="Link unavailable">
        <Question text="This link isn't *available*." />
        <p className="oc__note">
          It may have already been used, or it may have expired. Your application
          is unaffected — the organizer still has it.
        </p>
        <a className="oc__link" href={MARKETING_SITE_URL}>
          About Pholio
        </a>
      </StageShell>
    );
  }

  if (phase === PHASES.CLAIMED) {
    return (
      <StageShell label="Profile already set up">
        <Question text="This one's *already yours*." />
        <p className="oc__note">Sign in and everything you sent is waiting.</p>
        <ActionDock label="Sign in" enabled onAdvance={() => navigate('/login')} />
      </StageShell>
    );
  }

  const firstName = String(preview?.firstName || '').trim();
  const organizers = listSentence(preview?.agencyNames || []);
  const count = Number(preview?.submissionsCount) || 0;

  return (
    <StageShell label="Keep your Pholio profile">
      <Question
        text={firstName ? `${firstName}, this is *yours* to keep.` : 'This is *yours* to keep.'}
      />
      <p className="oc__note">
        {organizers
          ? `You applied to ${organizers}${count > 1 ? ` — ${count} applications in all` : ''}. Everything you sent getting there is already a profile: your digitals, your stats, and a comp card built from both.`
          : 'Everything you sent getting here is already a profile: your digitals, your stats, and a comp card built from both.'}
      </p>
      <p className="oc__note">
        Keep it and you can send the next call in a minute instead of four.
      </p>

      {error ? <p className="oc__error">{error}</p> : null}

      <p className="oc__legal">
        By continuing you agree to the{' '}
        <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>
        .
      </p>

      <ActionDock
        label={busy ? 'Setting it up…' : 'Keep my profile'}
        enabled={!busy}
        onAdvance={keep}
      />
    </StageShell>
  );
}
