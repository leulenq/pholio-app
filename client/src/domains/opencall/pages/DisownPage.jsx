import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

import ActionDock from '../components/ActionDock';
import Question from '../components/Question';
import StageShell from '../components/StageShell';
import { disownIdentity } from '../api/opencall';

/*
 * "That wasn't me" (`docs/open-call-applicant-flow-design-2026-08.md` §5.5).
 *
 * Because the flow accepts an unverified email by design, someone can apply
 * using another person's address — and that person receives a receipt for
 * something they did not do. This page is their answer.
 *
 * Sober and minimal on purpose. Someone reaching it is annoyed at best; there
 * is nothing to sell them, no profile to offer, and no explanation of what the
 * application contained beyond the fact that one exists. One question, one
 * action, one confirmation.
 */

const PHASES = {
  ASK: 'ask',
  DONE: 'done',
  INVALID: 'invalid',
};

export default function DisownPage() {
  const { token } = useParams();
  const [phase, setPhase] = useState(PHASES.ASK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await disownIdentity(token);
      setPhase(data?.valid ? PHASES.DONE : PHASES.INVALID);
    } catch (failure) {
      setError(failure?.message || 'That did not go through. Try the link again.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === PHASES.DONE) {
    return (
      <StageShell label="Application disowned">
        <Question text="*Noted*. Thank you." />
        <p className="oc__note">
          You won&apos;t hear from us about this application again. We&apos;ve told
          the organizer the address was disputed; what they do with the
          application is theirs to decide.
        </p>
      </StageShell>
    );
  }

  if (phase === PHASES.INVALID) {
    return (
      <StageShell label="Link unavailable">
        <Question text="This link isn't *available*." />
        <p className="oc__note">
          It may have already been used, or it may have expired. If you keep
          getting mail about an application you didn&apos;t make, write to
          support@pholio.studio.
        </p>
      </StageShell>
    );
  }

  return (
    <StageShell label="Report an application you did not make">
      <Question text="Someone used this address to *apply*." />
      <p className="oc__note">
        If that wasn&apos;t you, say so and we&apos;ll cut this address loose from
        the application and stop writing to you about it.
      </p>
      {error ? <p className="oc__error">{error}</p> : null}
      <ActionDock
        label={busy ? 'Recording…' : "That wasn't me"}
        enabled={!busy}
        onAdvance={confirm}
      />
    </StageShell>
  );
}
