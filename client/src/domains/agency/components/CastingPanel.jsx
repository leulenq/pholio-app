import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Zap, Target, TrendingUp, AlertCircle, PenLine } from 'lucide-react';
import './CastingPanel.css';

const STAGES = ['Applied', 'Shortlisted', 'Interview', 'Offered', 'Booked'];

const AI_SIGNALS = [
  { icon: Target,      text: 'Matches 3 open castings based on measurements and type.' },
  { icon: TrendingUp,  text: 'Applied to 4 agencies in the past 6 months — actively seeking.' },
  { icon: AlertCircle, text: 'Profile 78% complete — missing runway experience and second language.' },
];

function getInitials(name) {
  const parts = (name || '').trim().split(' ');
  return parts.length > 1
    ? (parts[0][0] || '') + (parts[1][0] || '')
    : (parts[0]?.[0] || '');
}

function getAdvanceLabel(stage) {
  switch (stage) {
    case 'Applied':     return 'Shortlist →';
    case 'Shortlisted': return 'Invite to Interview →';
    case 'Interview':   return 'Make Offer →';
    case 'Offered':     return 'Book →';
    case 'Booked':      return '✓ Booked';
    case 'Passed':      return 'Restore to Applied';
    default:            return 'Advance →';
  }
}

export const CastingPanel = ({ candidate, casting, onClose, onAction }) => {
  const [noteDraft, setNoteDraft] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    setNoteDraft('');
    setLightboxUrl(null);
  }, [candidate?.id]);

  if (!candidate) return null;

  const currentStageIndex = STAGES.indexOf(candidate.stage);
  const isPassed = candidate.stage === 'Passed';
  const isBooked = candidate.stage === 'Booked';

  const handleAction = (action, payload) => {
    if (onAction) onAction(action, candidate, payload);
  };

  const portfolio = candidate.portfolio || [];

  return (
    <>
      {/* Scrim */}
      <motion.div
        className="casting-panel-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        className="casting-panel"
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        {/* ── ZONE 1: HERO ── */}
        <div className="cp-hero">
          {candidate.avatar ? (
            <>
              <img src={candidate.avatar} className="cp-hero-img" alt={candidate.name} />
              <div className="cp-hero-gradient" />
            </>
          ) : (
            <div className="cp-hero-fallback">
              {getInitials(candidate.name).toUpperCase()}
            </div>
          )}

          <button className="cp-close-btn" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>

          <div className="cp-hero-identity">
            <h2 className="cp-name">{candidate.name}</h2>
            <div className="cp-hero-pills">
              {candidate.archetype && (
                <span className="cp-pill cp-pill--archetype">{candidate.archetype}</span>
              )}
              <span className="cp-pill cp-pill--stage">{candidate.stage}</span>
            </div>
          </div>

          {candidate.score != null && (
            <div className="cp-score-badge">✦ {candidate.score}% Match</div>
          )}
        </div>

        {/* ── ZONE 2: ACTION BAR ── */}
        <div className="cp-action-bar">
          <button
            className="cp-btn cp-btn--pass"
            onClick={() => handleAction('pass')}
            disabled={isPassed}
          >
            Pass
          </button>

          <button
            className="cp-btn cp-btn--message"
            title="Message"
            aria-label="Send message"
            onClick={() => handleAction('message')}
          >
            <Mail size={16} />
          </button>

          {isPassed ? (
            <button
              className="cp-btn cp-btn--restore"
              onClick={() => handleAction('stage-change', 'Applied')}
            >
              Restore to Applied
            </button>
          ) : (
            <button
              className="cp-btn cp-btn--advance"
              disabled={isBooked}
              onClick={() => !isBooked && handleAction('advance')}
            >
              {getAdvanceLabel(candidate.stage)}
            </button>
          )}
        </div>

        {/* ── ZONE 3: BODY ── */}
        <div className="cp-body">

          {/* Stage Selector */}
          <div className="cp-stage-selector">
            {STAGES.map((stage, idx) => {
              let cls = 'cp-stage-pill';
              if (stage === candidate.stage) cls += ' cp-stage-pill--current';
              else if (idx < currentStageIndex) cls += ' cp-stage-pill--past';
              else cls += ' cp-stage-pill--future';
              return (
                <button
                  key={stage}
                  className={cls}
                  onClick={() => stage !== candidate.stage && handleAction('stage-change', stage)}
                >
                  {stage}
                </button>
              );
            })}
          </div>

          {/* Measurements */}
          <div className="cp-measurements">
            {[
              { label: 'Height',       value: candidate.height       },
              { label: 'Measurements', value: candidate.measurements },
              { label: 'Archetype',    value: candidate.archetype    },
              { label: 'Location',     value: candidate.location     },
            ].map(({ label, value }) => (
              <div key={label} className="cp-measure-chip">
                <span className="cp-measure-label">{label}</span>
                <span className="cp-measure-value">{value ?? '—'}</span>
              </div>
            ))}
          </div>

          {/* Photo Portfolio */}
          <section className="cp-section">
            <header className="cp-section-header">
              <span>Portfolio</span>
            </header>
            <div className="cp-portfolio-grid">
              {portfolio.length === 0 ? (
                <>
                  <div className="cp-portfolio-empty">No photos</div>
                  <div className="cp-portfolio-empty">No photos</div>
                </>
              ) : (
                portfolio.map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.url}
                    className="cp-portfolio-photo"
                    alt=""
                    onClick={() => setLightboxUrl(photo.url)}
                  />
                ))
              )}
            </div>
          </section>

          {/* Casting Notes */}
          <section className="cp-section">
            <header className="cp-section-header">
              <PenLine size={13} />
              {casting?.role ? `Notes for ${casting.role}` : 'Notes'}
            </header>
            <textarea
              className="cp-note-textarea"
              placeholder="Add casting notes..."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={4}
            />
          </section>

          {/* AI Signals */}
          <section className="cp-section">
            <header className="cp-section-header">
              <Zap size={13} color="#C9A55A" />
              AI Signals
            </header>
            <div>
              {AI_SIGNALS.map((signal, idx) => (
                <div key={idx} className="cp-signal-row">
                  <signal.icon size={14} className="cp-signal-icon" />
                  <span className="cp-signal-text">{signal.text}</span>
                </div>
              ))}
            </div>
          </section>

        </div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            className="cp-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
          >
            <img
              src={lightboxUrl}
              className="cp-lightbox-img"
              alt="Portfolio"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CastingPanel;
