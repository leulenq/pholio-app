import React from 'react';
import { ArrowRight } from 'lucide-react';
import SetupHeader from './SetupHeader';

/**
 * The arrival.
 *
 * An agency reaching this screen has been reviewed, approved, and issued
 * access — it is not a sign-up. The screen states that plainly, names who
 * granted it, and orients them to what setup will establish. The motion is a
 * single staged reveal: the rule draws, then each line rises in sequence.
 */
export default function WelcomeScreen({ agencyName, contactFirstName, approvedAt, onBegin, onSignOut }) {
  const approvedOn = formatApprovalDate(approvedAt);

  return (
    <div className="stg stg--welcome">
      <SetupHeader agencyName={agencyName} onSignOut={onSignOut} />

      <main className="stg-welcome">
        <div className="stg-welcome__inner">
          <span className="stg-welcome__rule" aria-hidden="true" />

          <h1>
            {contactFirstName ? `${contactFirstName}, your` : 'Your'} access
            to Pholio is granted.
          </h1>

          <p className="stg-welcome__lede">
            {agencyName || 'Your agency'} has been reviewed and accepted.
            {approvedOn ? ` Approved ${approvedOn}.` : ''} What follows
            establishes the workspace itself — the boards your bookers work,
            how your roster arrives, who holds a key, and how talent reach you.
          </p>

          <dl className="stg-welcome__terms">
            <div>
              <dt>Six steps</dt>
              <dd>Most of it is confirming what we already hold on file.</dd>
            </div>
            <div>
              <dt>Nothing is final</dt>
              <dd>Boards, team, and routing all stay editable once you are inside.</dd>
            </div>
            <div>
              <dt>You can stop</dt>
              <dd>Progress is saved as you go; sign back in and resume where you left.</dd>
            </div>
          </dl>

          <button type="button" className="stg-button stg-button--primary stg-welcome__begin" onClick={onBegin}>
            Establish the workspace
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </main>
    </div>
  );
}

function formatApprovalDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}
