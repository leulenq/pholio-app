import React, { useState } from 'react';
import PholioButton from './ui/PholioButton';
import { talentApi } from '../../domains/talent/api/talent';
import { MARKETING_SITE_URL } from '../lib/logout';
import './LegalAcceptanceGate.css';

// Keep in sync with the server: src/shared/lib/legal-acceptance.js CURRENT_TERMS_VERSION.
// When that bumps, mirror it here AND add a matching TERMS_CHANGELOG entry below.
const CURRENT_TERMS_VERSION = '2026-06-25';

// Plain-language "what changed", keyed by the terms version string.
const TERMS_CHANGELOG = {
  // Plain-language summary for the 2026-06-25 terms and privacy policy updates.
  '2026-06-25': [
    'Clarified our role as a software platform rather than a talent agency, and incorporated our Community Guidelines to prohibit scamming, fake scouting, and unauthorized data use.',
    'Updated our Privacy Policy to detail how we process portfolio data, verify locations, host images on Cloudflare R2, and use AI features like photo analysis and match scoring.',
  ],
};

/**
 * Blocks talent dashboard use until updated Terms + Privacy are accepted.
 * Full-screen scrim (the one legitimate backdrop-filter use) — an explicit
 * consent gate, so an affirmative tick is required here.
 */
export default function LegalAcceptanceGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await talentApi.getLegalStatus({ skipRedirect: true });
        if (!cancelled) {
          setNeedsAcceptance(Boolean(status?.needsAcceptance));
        }
      } catch {
        if (!cancelled) setNeedsAcceptance(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      await talentApi.acceptLegalTerms({ terms_accepted: true, privacy_accepted: true });
      setNeedsAcceptance(false);
    } catch (err) {
      setError(err?.message || 'Could not save your acceptance. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return children;
  }

  if (!needsAcceptance) {
    return children;
  }

  const changes = TERMS_CHANGELOG[CURRENT_TERMS_VERSION] || [];

  return (
    <>
      {children}
      <div className="legal-gate-scrim" role="presentation">
        <div
          className="legal-gate-panel"
          role="dialog"
          aria-labelledby="legal-gate-title"
          aria-modal="true"
        >
          <h2 id="legal-gate-title" className="legal-gate-title">
            Our terms have changed
          </h2>
          <p className="legal-gate-lead">
            A short summary of what&rsquo;s new. Review the full documents any time.
          </p>

          {changes.length > 0 && (
            <ul className="legal-gate-changes">
              {changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}

          <p className="legal-gate-links">
            Read the full{' '}
            <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
              Terms
            </a>
            ,{' '}
            <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            , and{' '}
            <a href={`${MARKETING_SITE_URL}/ai-notice`} target="_blank" rel="noopener noreferrer">
              AI Notice
            </a>
            .
          </p>

          <label className="legal-gate-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              aria-required="true"
            />
            <span>I agree to the updated Terms of Service and Privacy Policy.</span>
          </label>

          {error && (
            <p className="legal-gate-error" role="alert">
              {error}
            </p>
          )}

          <PholioButton
            type="button"
            variant="primary"
            className="legal-gate-submit"
            disabled={!accepted || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Saving…' : 'Agree & continue'}
          </PholioButton>
        </div>
      </div>
    </>
  );
}
