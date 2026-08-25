import { useMemo } from 'react';
import { ArrowUpRight, Check, X } from 'lucide-react';

import PholioButton from '../../../../shared/components/ui/PholioButton';
import { isEventCallDTO } from './event';
import { buildConsentCopy } from '../../../opencall/components/consentCopy';

export const SUBMISSION_TERMS_LABEL = 'Submission Terms';

/**
 * The terms rail on Review & send — the last words an applicant reads before
 * the package leaves, and the ones the consent receipt claims they read.
 *
 * TWO PURPOSES, TWO SETS OF WORDS. The server derives `call_purpose` from the
 * call behind the claim and records the consent under that purpose's
 * disclosure version (`submission-disclosure-content.js`). Representation and
 * event casting are not variations of one another: an event package is
 * republished to designers through an unauthenticated pick link, is kept on a
 * 90-day event clock rather than 24 months, and carries a compensation
 * restatement the organizer typed. Rendering the representation rail on an
 * event submission recorded consent to a version whose sentences were never on
 * screen — this component is the display side of that fork.
 *
 * The event sentences are NOT authored here. They come from `buildConsentCopy`,
 * the browser mirror of the server's `EVENT_CASTING_DISCLOSURE_CONTENT`, pinned
 * to it by `tests/unit/open-call-consent-copy-parity.test.js`. Reworded here,
 * the recorded snapshot and the read sentence would drift apart again — so
 * every event string below is rendered exactly as the builder returns it.
 *
 * The representation branch is byte-for-byte what it has always been. Its
 * consent snapshot is asserted stable by `tests/talent/event-consent-fork.test.js`.
 */
export default function SubmissionTerms({
  agencyName,
  call = null,
  marketingSiteUrl,
  minor,
  minorAgencyAuthorized,
  accountGuardianConsent,
  openCallClaim,
  checks = [],
  packageAudit,
  consent,
  accuracyConfirmed,
  onAccuracyChange,
  adultAuthorityConfirmed,
  onAdultAuthorityChange,
  consentBindingPending,
  onConsentChange,
  guardianAgencyConsent,
  requestingGuardianConsent,
  onRequestGuardianConsent,
  onOpenIdentity,
}) {
  const name = agencyName || 'this agency';

  // Event calls are 18-and-over by platform policy (ruling R8), and the browser
  // mirror carries only the adult branch of the event disclosure for that
  // reason. A minor profile therefore keeps the representation rail rather than
  // being shown adult data-category copy the server would not record for them.
  const eventCopy = useMemo(() => {
    if (minor || !isEventCallDTO(call)) return null;
    // The raw name, not the local `this agency` fallback: `buildConsentCopy`
    // carries the server's own fallback (`this organizer`), and using ours
    // would put a different noun on screen from the one in the receipt.
    return buildConsentCopy({
      organizerName: agencyName,
      event: { name: call?.event?.name, endsOn: call?.event?.endsOn },
      compensation: call?.compensation || {},
    });
  }, [agencyName, call, minor]);

  const legalLinks = (
    <>
      Read the{' '}
      <a href={`${marketingSiteUrl}/terms`} target="_blank" rel="noopener noreferrer">
        Terms
      </a>{' '}
      and{' '}
      <a href={`${marketingSiteUrl}/privacy`} target="_blank" rel="noopener noreferrer">
        Privacy Notice
      </a>
      .
    </>
  );

  return (
    <aside
      className={eventCopy ? 'apply-seal apply-seal--event' : 'apply-seal'}
      aria-label="Submission terms"
    >
      <span className="apply-seal__flow">
        {eventCopy ? eventCopy.termsLabel : SUBMISSION_TERMS_LABEL}
      </span>

      {eventCopy ? (
        <>
          <p className="apply-seal__handling">{eventCopy.handling}</p>
          <p className="apply-seal__handling">{eventCopy.dataCategories}</p>
          <p className="apply-seal__handling">{eventCopy.thirdPartyAccess}</p>
          <p className="apply-seal__handling apply-seal__handling--restated">
            {eventCopy.compensation}
          </p>
          <p className="apply-seal__handling">{eventCopy.retentionAndWithdrawal}</p>
          <p className="apply-seal__handling">{legalLinks}</p>
        </>
      ) : (
        <>
          <p className="apply-seal__handling">
            Your package is delivered to <strong>{name}</strong> as a separate recipient for
            representation review.
          </p>
          <p className="apply-seal__handling">
            {minor
              ? 'Shared data includes your name, under-18 age band, city, nationality, languages, guardian-authorized measurements, selected images and book, and comp card. Direct contact, social links, portfolio URL, optional note, and raw date of birth are omitted; the agency can communicate through Pholio.'
              : 'Shared data includes your name, age, city, contact details, measurements, selected images and book, comp card, note, and linked social profiles included in the package.'}
          </p>
          <p className="apply-seal__handling">
            Pholio retains the package for up to 24 months. Withdrawal revokes access in Pholio,
            redacts the platform snapshot, and deletes the platform message thread, but cannot recall
            copies already downloaded or recorded by the agency. {legalLinks}
          </p>
        </>
      )}

      <ul className="apply-seal__acks" aria-label="Submission facts">
        {openCallClaim && (
          <li>
            This is an invited open call submission to {name}. It does not
            count toward your monthly discovery limit and is recorded with
            your consent receipt.
          </li>
        )}
        {minor && (
          <li>Digitals marked as retouched are blocked from submission.</li>
        )}
        {minor && (
          <li>
            {
            !accountGuardianConsent ? (
              <>
                Guardian consent not yet recorded —{' '}
                <PholioButton
                  type="button"
                  variant="meta"
                  className="apply-seal__acks-link"
                  onClick={onOpenIdentity}
                >
                  Record it here
                </PholioButton>{' '}
                before submitting.
              </>
            ) : minorAgencyAuthorized ? (
              `A parent or guardian authorized this submission to ${name}.`
            ) : (
              `Guardian authorization for ${name} has not been verified.`
            )
            }
          </li>
        )}
        <li>
          {eventCopy
            ? eventCopy.noGuaranteeStatement
            : 'A submission is a request for review and does not guarantee representation.'}
        </li>
      </ul>

      <ul className="apply-readyline" aria-label="Profile readiness">
        {checks.map((check) => (
          <li key={check.label} className={check.complete ? 'is-ok' : 'is-need'}>
            {check.complete ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
            {check.label}
          </li>
        ))}
      </ul>

      {packageAudit?.advisories?.length > 0 && (
        <ul className="apply-package-audit" aria-label="Package notes">
          {packageAudit.advisories.map((item) => (
            <li key={`${item.id}-${item.imageIds?.[0] || 'global'}`}>{item.message}</li>
          ))}
        </ul>
      )}

      {minor ? (
        <div className="apply-seal__guardian" role="status">
          {minorAgencyAuthorized ? (
            <p>Guardian authorization verified specifically for {name}.</p>
          ) : guardianAgencyConsent?.status === 'pending' ? (
            <p>
              Authorization sent to {guardianAgencyConsent.guardian_email || 'your guardian'}.
              Submission stays locked until they confirm.
            </p>
          ) : guardianAgencyConsent?.account_consent_verified === false ? (
            <>
              <p>Complete account-level guardian consent before requesting agency authorization.</p>
              <PholioButton type="button" variant="meta" onClick={onOpenIdentity}>
                Open identity settings <ArrowUpRight size={13} aria-hidden />
              </PholioButton>
            </>
          ) : (
            <>
              <p>Your guardian must authorize disclosure to {name}. This permission will not apply to another agency.</p>
              <PholioButton
                type="button"
                variant="meta"
                onClick={onRequestGuardianConsent}
                disabled={requestingGuardianConsent}
              >
                {requestingGuardianConsent ? 'Sending…' : 'Request guardian authorization'}
                {!requestingGuardianConsent && <ArrowUpRight size={13} aria-hidden />}
              </PholioButton>
            </>
          )}
        </div>
      ) : (
        <div className="apply-seal__attestations" aria-label="Required attestations">
          <label className="apply-seal__consent">
            <input
              type="checkbox"
              checked={accuracyConfirmed}
              onChange={(event) => onAccuracyChange(event.target.checked)}
            />
            <span>
              {eventCopy ? (
                eventCopy.accuracyStatement
              ) : (
                <>
                  I confirm my statistics are accurate and current, and my agency digitals are
                  unretouched.
                </>
              )}
            </span>
          </label>
          <label className="apply-seal__consent">
            <input
              type="checkbox"
              checked={adultAuthorityConfirmed}
              onChange={(event) => onAdultAuthorityChange(event.target.checked)}
            />
            <span>
              {eventCopy
                ? eventCopy.adultStatement
                : 'I confirm I am 18 or older and authorised to submit my own work.'}
            </span>
          </label>
          <label className="apply-seal__consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={consentBindingPending}
              onChange={(event) => onConsentChange(event.target.checked)}
            />
            <span>
              {eventCopy ? (
                eventCopy.consentStatement
              ) : (
                <>
                  I have reviewed this package and consent to submitting it to {name} through Pholio.
                </>
              )}
            </span>
          </label>
        </div>
      )}
    </aside>
  );
}
