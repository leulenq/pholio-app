import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import './ShortcutHelp.css';

/**
 * The working surface's keys, per surface.
 *
 * Both decks read from one verdict bar, so most of this list is shared; what
 * differs is the verb set each surface actually has. A card that names a key
 * the surface does not answer to is a lie about the surface, so the two lists
 * are separate rather than a union.
 */
const SUBMISSION_SHORTCUTS = [
  { keys: ['J', 'K'], label: 'Move the focus' },
  { keys: ['↑', '↓'], label: 'Move the focus' },
  { keys: ['Space'], label: 'Select or deselect the focused submission' },
  { keys: ['Enter'], label: 'Open the review room' },
  { keys: ['L'], label: 'Line up the selection side by side' },
  { keys: ['S'], label: 'Shortlist' },
  { keys: ['B'], label: 'File to a board, then confirm' },
  { keys: ['D'], label: 'Request digitals' },
  { keys: ['M'], label: 'Invite to meet' },
  { keys: ['F'], label: 'Keep on file' },
  { keys: ['A'], label: 'Offer representation, press again or Enter to confirm' },
  { keys: ['N'], label: 'Switch the armed offer to development' },
  { keys: ['X'], label: 'Pass, press again or Enter to confirm' },
  { keys: ['?'], label: 'Toggle this help' },
  { keys: ['Esc'], label: 'Close a layer, disarm a verdict, then clear the selection' },
];

const BOARD_SHORTCUTS = [
  { keys: ['J', 'K'], label: 'Move the focus' },
  { keys: ['↑', '↓'], label: 'Move the focus' },
  { keys: ['Space'], label: 'Select or deselect the focused face' },
  { keys: ['Enter'], label: 'Open the record' },
  { keys: ['L'], label: 'Line up the selection side by side' },
  { keys: ['V'], label: 'Switch between the wall and the ledger' },
  { keys: ['S'], label: 'Shortlist' },
  { keys: ['D'], label: 'Request digitals' },
  { keys: ['M'], label: 'Invite to meet' },
  { keys: ['F'], label: 'Keep on file' },
  { keys: ['A'], label: 'Offer representation, press again or Enter to confirm' },
  { keys: ['N'], label: 'Switch the armed offer to development' },
  { keys: ['R'], label: 'Mark represented' },
  { keys: ['X'], label: 'Pass, press again or Enter to confirm' },
  { keys: ['?'], label: 'Toggle this help' },
  { keys: ['Esc'], label: 'Close a layer, disarm a verdict, then clear the selection' },
];

const BY_SURFACE = { submissions: SUBMISSION_SHORTCUTS, board: BOARD_SHORTCUTS };

/**
 * ShortcutHelp — the keyboard card for a working surface.
 * Controlled overlay; the parent owns `open` and toggles it on `?`, and names
 * which surface's keys the card describes.
 * The scrim is a functional full-screen dimmer (the one sanctioned place for
 * backdrop-filter). Esc handling is shared with the page's global handler.
 */
export default function ShortcutHelp({ open, onClose, surface = 'submissions' }) {
  const dialogRef = useRef(null);
  const shortcuts = BY_SURFACE[surface] || SUBMISSION_SHORTCUTS;

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
              <h2 className="sc-title">Keyboard</h2>
              <button type="button" className="sc-close" aria-label="Close shortcuts" onClick={onClose}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <dl className="sc-list">
              {shortcuts.map((s) => (
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
