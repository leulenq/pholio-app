import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { analyzePortfolio } from '../../../shared/utils/portfolioGapAnalysis';
import { buildBookIntelligence } from '../utils/bookIntelligence';
import './DigitalsBookPanel.css';

export default function DigitalsBookPanel({ images = [] }) {
  const analysis = useMemo(() => analyzePortfolio(images), [images]);
  const intel = useMemo(() => buildBookIntelligence(analysis), [analysis]);
  const [open, setOpen] = useState(false);

  if (images.length === 0 || intel.suggestions.length === 0) return null;

  const count = intel.suggestions.length;
  const segments = Array.from({ length: intel.total }, (_, i) => i < intel.covered);

  return (
    <div className={`phi${open ? ' phi--open' : ''}`}>
      <button
        type="button"
        className="phi__bar"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="phi__title">Digitals read</span>
        <span className="phi__coverage" aria-hidden="true">
          {segments.map((filled, i) => (
            <span key={i} className={`phi__seg${filled ? ' phi__seg--on' : ''}`} />
          ))}
        </span>
        <span className="phi__count">
          {count} {count === 1 ? 'refinement' : 'refinements'}
        </span>
        <ChevronDown size={14} className="phi__chevron" aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="phi__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <ul className="phi__list">
              {intel.suggestions.map((s) => (
                <li key={s.id} className="phi__item">
                  <span className="phi__item-title">{s.title}</span>
                  <span className="phi__item-text">{s.text}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
