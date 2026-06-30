import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  LegalAcceptanceField,
  legalAcceptancePayload,
} from './LegalAcceptanceField';
import PholioButton from './ui/PholioButton';
import { talentApi } from '../../domains/talent/api/talent';
import './LegalAcceptanceGate.css';

/**
 * Blocks talent dashboard use until Terms + Privacy are accepted (legacy accounts).
 */
export default function LegalAcceptanceGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    try {
      await talentApi.acceptLegalTerms(legalAcceptancePayload(true));
      setNeedsAcceptance(false);
      toast.success('Thanks — you can continue using Pholio.');
    } catch (error) {
      toast.error(error?.message || 'Could not save your acceptance');
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
            Updated terms
          </h2>
          <p className="legal-gate-lead">
            Please review and accept the current Terms of Service and Privacy Policy
            to continue using your account.
          </p>
          <LegalAcceptanceField
            checked={accepted}
            onChange={setAccepted}
            className="legal-gate-check"
          />
          <PholioButton
            type="button"
            variant="primary"
            className="legal-gate-submit"
            disabled={!accepted || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Saving…' : 'Continue'}
          </PholioButton>
        </div>
      </div>
    </>
  );
}
