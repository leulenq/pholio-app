import React, { useEffect, useState } from 'react';
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

/**
 * `summarizeChange` splits the changelog sentence at its em dash, so the detail
 * arrives as a lower-case continuation ("agencies, casting organizations…").
 * That was fine when it hung under an accordion title; as a standalone
 * paragraph it needs a capital. Done here rather than in `summarizeChange`,
 * whose job is to split the sentence, not to rewrite it.
 */
function asSentence(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2026-07-18" → "18 July 2026". Returns null for anything unparseable. */
function formatEffectiveDate(version) {
  if (!version || typeof version !== 'string') return null;
  const date = new Date(`${version}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Blocks talent dashboard use until updated Terms + Privacy are accepted.
 * Full-screen scrim (the one legitimate backdrop-filter use) — an explicit
 * consent gate, so an affirmative tick is required here.
 *
 * Every change is printed open. This was an accordion of collapsed rows, which
 * meant reading what you were agreeing to cost five clicks and produced five
 * identical grey pills — the wrong control for a consent gate, which exists to
 * show the thing consent is being given to. The panel is wide enough to carry
 * legal prose at a readable measure, which is what removed the scroll-inside-
 * a-scroll that was slicing a change in half under the footer.
 *
 * Styled in the talent register (warm paper masthead, Noto Serif Display,
 * ink-fill control): it wraps the talent dashboard, and used to borrow agency
 * tokens, which the two-design-systems rule does not allow.
 */
export default function LegalAcceptanceGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [changes, setChanges] = useState([]);
  const [version, setVersion] = useState(null);
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
          setVersion(status?.version || null);
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

  const effective = formatEffectiveDate(version);
  const count = changes.length;

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
              <header className="legal-gate-header">
                {effective ? (
                  <p className="legal-gate-effective">Effective {effective}</p>
                ) : null}
                <h2 id="legal-gate-title" className="legal-gate-title">
                  Our terms have changed
                </h2>
                <p id="legal-gate-lead" className="legal-gate-lead">
                  {count > 0
                    ? `${count === 1 ? 'One change' : `${count} changes`} since you last agreed, summarised in full below. The complete documents are linked at the bottom.`
                    : 'Please review the updated documents linked below before continuing.'}
                </p>
              </header>

              {count > 0 && (
                <div className="legal-gate-scroll">
                  <ul className="legal-gate-changes">
                    {changes.map((change) => {
                      const { title, detail } = summarizeChange(change);
                      return (
                        <li key={change} className="legal-gate-change">
                          <h3 className="legal-gate-change-title">{title}</h3>
                          {detail ? (
                            <p className="legal-gate-change-detail">{asSentence(detail)}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <footer className="legal-gate-footer">
                <nav className="legal-gate-links" aria-label="Full legal documents">
                  <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
                    Terms of Service
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
                  <span className="legal-gate-check-box" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="legal-gate-check-text">
                    I agree to the updated Terms of Service and Privacy Policy.
                  </span>
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
