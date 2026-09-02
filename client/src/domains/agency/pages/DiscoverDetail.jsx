import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { DivisionMark } from '../components/status';
import { formatLocation } from '../../../shared/utils/locationFormat';
import './DiscoverDetail.css';

export function DiscoverDetail({ talent, talents, onClose, onNavigate, onInvite, inviting }) {
  const idx = talents.findIndex((t) => t.id === talent.id);
  const prev = idx > 0 ? talents[idx - 1] : null;
  const next = idx < talents.length - 1 ? talents[idx + 1] : null;

  const facts = Array.isArray(talent.facts) ? talent.facts : [];
  const notes = Array.isArray(talent.notes) ? talent.notes : [];
  const heritage = Array.isArray(talent.heritage) ? talent.heritage : [];
  // The semantic layer's one line, when the brief reached for meaning.
  const why = typeof talent.why === 'string' && talent.why.trim() ? talent.why.trim() : null;

  const stats = [
    talent.height  && { label: 'Height',    value: talent.height },
    talent.gender  && { label: 'Gender',    value: talent.gender },
    heritage.length > 0 && { label: 'Heritage', value: heritage.join(', ') },
    talent.city    && { label: 'Based',     value: formatLocation(talent.city) },
    talent.exp     && { label: 'Experience', value: talent.exp },
  ].filter(Boolean);

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape')      onClose();
    if (e.key === 'ArrowLeft'  && prev) onNavigate(prev);
    if (e.key === 'ArrowRight' && next) onNavigate(next);
  }, [onClose, onNavigate, prev, next]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Lock body scroll while open.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <motion.div
      className="dd-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onClick={onClose}
    >
      {/* prev / next — outside the frame, on the overlay edges */}
      <AnimatePresence>
        {prev && (
          <motion.button
            key="prev"
            className="dd-edge dd-edge--prev"
            onClick={(e) => { e.stopPropagation(); onNavigate(prev); }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            aria-label="Previous"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </motion.button>
        )}
        {next && (
          <motion.button
            key="next"
            className="dd-edge dd-edge--next"
            onClick={(e) => { e.stopPropagation(); onNavigate(next); }}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            aria-label="Next"
          >
            <ArrowRight size={20} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* frame */}
      <motion.div
        className="dd-frame"
        initial={{ opacity: 0, y: 20, scale: 0.975 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.975 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* photography */}
        <div className="dd-photo">
          {talent.photo
            ? <img src={talent.photo} alt={talent.name} className="dd-photo-img" />
            : <div className="dd-photo-empty"><span>{talent.name.charAt(0)}</span></div>
          }
          {/* bottom gradient keeps photography legible against the frame */}
          <div className="dd-photo-scrim" />
        </div>

        {/* identity panel */}
        <div className="dd-panel">
          {/* close */}
          <button className="dd-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>

          <div className="dd-panel-inner">
            {/* identity */}
            <div className="dd-identity">
              {(talent.archetype || talent.city) && (
                <div className="dd-sub">
                  {talent.archetype && <DivisionMark division={talent.archetype} size="sm" onDark />}
                  {talent.city ? <span className="dd-loc"> · {formatLocation(talent.city)}</span> : null}
                </div>
              )}
              <div className="dd-name-row">
                <h2 className="dd-name">{talent.name}</h2>
              </div>
            </div>

            {/* vitals */}
            {stats.length > 0 && (
              <div className="dd-vitals">
                {stats.map((s) => (
                  <div key={s.label} className="dd-vital">
                    <span className="dd-vital-label">{s.label}</span>
                    <span className="dd-vital-value">{s.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* the same lines the card carries: what matched, why the brief
                reached for this talent, then what is off or not listed */}
            {facts.length > 0 && <p className="dd-facts">{facts.join(' · ')}</p>}
            {why && <p className="dd-why">{why}</p>}
            {notes.length > 0 && <p className="dd-truth">{notes.join(' · ')}</p>}

            {/* bio */}
            {talent.bio && <p className="dd-bio">{talent.bio}</p>}
          </div>

          {/* actions — anchored below scroll area */}
          <div className="dd-actions">
            <button
              className={`dd-invite${talent.isInvited ? ' dd-invite--sent' : ''}`}
              disabled={inviting || talent.isInvited}
              onClick={() => onInvite(talent)}
            >
              {inviting ? 'Sending…' : talent.isInvited ? 'Invitation sent' : 'Invite to agency'}
            </button>
          </div>

          {/* position counter */}
          <div className="dd-counter">
            <span className="dd-counter-cur">{idx + 1}</span>
            <span className="dd-counter-sep">/</span>
            <span className="dd-counter-tot">{talents.length}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
