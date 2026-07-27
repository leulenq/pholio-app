import React, { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import PholioButton from './ui/PholioButton';
import { talentApi } from '../../domains/talent/api/talent';
import { MARKETING_SITE_URL } from '../lib/logout';
import { summarizeChange } from './legalChangeSummary';
import './LegalAcceptanceGate.css';

// The version and its plain-language changelog come from the server
// (/settings/legal-status, sourced from src/shared/lib/legal-versions.js).
// They used to be hardcoded here as a fourth copy, which could — and did —
// describe a different version than the gate was actually enforcing.

function ChangeRow({ change, defaultOpen = false }) {
  const { title, detail } = summarizeChange(change);
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const hasDetail = Boolean(detail);

  if (!hasDetail) {
    return (
      <li className="legal-gate-change">
        <p className="legal-gate-change-title">{title}</p>
      </li>
    );
  }

  return (
    <li className={`legal-gate-change${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="legal-gate-change-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="legal-gate-change-title">{title}</span>
        <span className="legal-gate-change-chevron" aria-hidden="true" />
      </button>
      <div
        id={panelId}
        className="legal-gate-change-detail"
        hidden={!open}
      >
        <p>{detail}</p>
      </div>
    </li>
  );
}

/**
 * Blocks talent dashboard use until updated Terms + Privacy are accepted.
 * Full-screen scrim (the one legitimate backdrop-filter use) — an explicit
 * consent gate, so an affirmative tick is required here.
 *
 * Mobile: bottom sheet with sticky agree footer (thumb-zone CTA).
 * Desktop: centered dialog. Same information architecture on both.
 */
export default function LegalAcceptanceGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [changes, setChanges] = useState([]);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await talentApi.getLegalStatus({ skipRedirect: true });
        if (!cancelled) {
          setNeedsAcceptance(Boolean(status?.needsAcceptance));
          setChanges(Array.isArray(status?.changes) ? status.changes : []);
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

  useEffect(() => {
    if (!needsAcceptance) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [needsAcceptance]);

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

  const panelMotion = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.15 },
      }
    : {
        initial: { opacity: 0, y: 28 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 16 },
        transition: { type: 'spring', stiffness: 55, damping: 16 },
      };

  return (
    <>
      {children}
      <AnimatePresence>
        {needsAcceptance ? (
          <motion.div
            key="legal-gate"
            className="legal-gate-scrim"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
          >
            <motion.div
              className="legal-gate-panel"
              role="dialog"
              aria-labelledby="legal-gate-title"
              aria-describedby="legal-gate-lead"
              aria-modal="true"
              {...panelMotion}
            >
              <div className="legal-gate-handle" aria-hidden="true" />

              <div className="legal-gate-scroll">
                <header className="legal-gate-header">
                  <h2 id="legal-gate-title" className="legal-gate-title">
                    Our terms have changed
                  </h2>
                  <p id="legal-gate-lead" className="legal-gate-lead">
                    Here&rsquo;s what&rsquo;s new. Tap a point for detail, or open
                    the full documents.
                  </p>
                </header>

                {changes.length > 0 && (
                  <ul className="legal-gate-changes">
                    {changes.map((change) => (
                      <ChangeRow key={change} change={change} />
                    ))}
                  </ul>
                )}
              </div>

              <footer className="legal-gate-footer">
                <nav className="legal-gate-links" aria-label="Full legal documents">
                  <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
                    Terms
                  </a>
                  <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </a>
                  <a href={`${MARKETING_SITE_URL}/ai-notice`} target="_blank" rel="noopener noreferrer">
                    AI Notice
                  </a>
                </nav>

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
              </footer>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
