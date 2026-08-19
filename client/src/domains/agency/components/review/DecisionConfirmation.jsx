import React, { useMemo, useState } from 'react';
import { AgencyModal } from '../ui/AgencyModal';
import { AgencyButton } from '../ui/AgencyButton';
import './DecisionConfirmation.css';

const PASS_REASONS = [
  { key: 'board_fit', label: 'Not current board fit' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'already_represented', label: 'Look already represented' },
  { key: 'location', label: 'Location' },
  { key: 'digitals_insufficient', label: 'Digitals insufficient' },
  { key: 'reconsider_later', label: 'Reconsider later' },
  { key: 'other', label: 'Other' },
];

/**
 * DecisionConfirmation — the action layer before an irreversible or structured
 * review decision. Reuses AgencyModal and AgencyButton so the review room stays
 * inside the agency design system.
 *
 * Modes:
 *  - offer:    confirm before signing / offering representation
 *  - shortlist: choose an optional board destination
 *  - pass:      structured pass reason + optional note
 */
export function DecisionConfirmation({
  mode,
  talentName,
  boards = [],
  busy = false,
  onClose,
  onConfirm,
}) {
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [passReason, setPassReason] = useState('');
  const [passNote, setPassNote] = useState('');

  const isOpen = Boolean(mode);

  const reset = () => {
    setSelectedBoardId('');
    setPassReason('');
    setPassNote('');
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose?.();
  };

  const handleConfirm = () => {
    if (mode === 'shortlist') {
      onConfirm?.({
        action: 'shortlist',
        boardId: selectedBoardId || null,
      });
      return;
    }
    if (mode === 'pass') {
      onConfirm?.({
        action: 'decline',
        reason: passReason || 'other',
        note: passNote.trim() || null,
      });
      reset();
      return;
    }
    onConfirm?.({ action: 'accept' });
  };

  const { title, body, confirmLabel, confirmVariant } = useMemo(() => {
    switch (mode) {
      case 'offer':
        return {
          title: 'Offer representation?',
          body: (
            <>
              <p className="dc-lead">
                You are about to offer representation to <strong>{talentName}</strong>.
              </p>
              <p className="dc-note">
                This sends the representation decision to the talent. Continue the relationship in your agency system.
              </p>
            </>
          ),
          confirmLabel: 'Offer representation',
          confirmVariant: 'gold',
        };
      case 'shortlist':
        return {
          title: 'Shortlist',
          body: (
            <>
              <p className="dc-lead">
                Add <strong>{talentName}</strong> to your shortlist.
              </p>
              {boards.length > 0 && (
                <fieldset className="dc-fieldset">
                  <legend className="dc-legend">File to a board (optional)</legend>
                  <div className="dc-boards">
                    <label className={`dc-board${selectedBoardId === '' ? ' is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="shortlist-board"
                        value=""
                        checked={selectedBoardId === ''}
                        onChange={() => setSelectedBoardId('')}
                        disabled={busy}
                      />
                      <span className="dc-board-name">No board</span>
                      <span className="dc-board-sub">Shortlist only</span>
                    </label>
                    {boards.map((b) => (
                      <label
                        key={b.id}
                        className={`dc-board${String(selectedBoardId) === String(b.id) ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="shortlist-board"
                          value={b.id}
                          checked={String(selectedBoardId) === String(b.id)}
                          onChange={() => setSelectedBoardId(b.id)}
                          disabled={busy}
                        />
                        <span className="dc-board-name">{b.name || 'Untitled board'}</span>
                        {b.client_name && <span className="dc-board-sub">{b.client_name}</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          ),
          confirmLabel: 'Shortlist',
          confirmVariant: 'primary',
        };
      case 'pass':
        return {
          title: `Pass on ${talentName}`,
          body: (
            <>
              <p className="dc-lead">
                This will mark <strong>{talentName}</strong> as not moving forward.
              </p>
              <fieldset className="dc-fieldset">
                <legend className="dc-legend">Reason (optional)</legend>
                <div className="dc-reasons">
                  {PASS_REASONS.map((r) => (
                    <label
                      key={r.key}
                      className={`dc-reason${passReason === r.key ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="pass-reason"
                        value={r.key}
                        checked={passReason === r.key}
                        onChange={() => setPassReason(r.key)}
                        disabled={busy}
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="dc-note-label">
                <span>Note (optional)</span>
                <textarea
                  className="dc-note-input"
                  rows={3}
                  value={passNote}
                  onChange={(e) => setPassNote(e.target.value)}
                  placeholder="Add any internal context…"
                  disabled={busy}
                />
              </label>
            </>
          ),
          confirmLabel: 'Pass',
          confirmVariant: 'secondary',
        };
      default:
        return { title: '', body: null, confirmLabel: 'Confirm', confirmVariant: 'primary' };
    }
  }, [mode, talentName, boards, selectedBoardId, passReason, passNote, busy]);

  return (
    <AgencyModal
      open={isOpen}
      onClose={handleClose}
      title={title}
      footer={
        <div className="dc-actions">
          <AgencyButton variant="ghost" onClick={handleClose} disabled={busy}>
            Cancel
          </AgencyButton>
          <AgencyButton
            variant={confirmVariant}
            onClick={handleConfirm}
            loading={busy}
          >
            {confirmLabel}
          </AgencyButton>
        </div>
      }
    >
      <div className="dc-body">{body}</div>
    </AgencyModal>
  );
}

export default DecisionConfirmation;
