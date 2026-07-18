import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import './ShortcutHelp.css';

const SHORTCUTS = [
  { keys: ['J', 'K'], label: 'Move through the list' },
  { keys: ['↑', '↓'], label: 'Move through the list' },
  { keys: ['Enter'], label: 'Open the talent panel' },
  { keys: ['S'], label: 'Shortlist' },
  { keys: ['A'], label: 'Sign' },
  { keys: ['X'], label: 'Pass' },
  { keys: ['?'], label: 'Toggle this help' },
  { keys: ['Esc'], label: 'Close panel or help' },
];

/**
 * ShortcutHelp — keyboard triage cheat sheet for the Submissions desk.
 * Controlled overlay; the parent owns `open` and toggles it on `?`.
 * The scrim is a functional full-screen dimmer (the one sanctioned place for
 * backdrop-filter). Esc handling is shared with the page's global handler.
 */
export default function ShortcutHelp({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open && dialogRef.current) dialogRef.current.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sc-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            className="sc-card"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            tabIndex={-1}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sc-head">
              <h2 className="sc-title">Keyboard triage</h2>
              <button type="button" className="sc-close" aria-label="Close shortcuts" onClick={onClose}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <dl className="sc-list">
              {SHORTCUTS.map((s) => (
                <div className="sc-item" key={`${s.keys.join()}-${s.label}`}>
                  <dt className="sc-keys">
                    {s.keys.map((k) => <kbd key={k} className="sc-key">{k}</kbd>)}
                  </dt>
                  <dd className="sc-label">{s.label}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
