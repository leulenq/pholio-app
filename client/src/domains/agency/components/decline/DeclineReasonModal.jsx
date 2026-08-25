import React, { useState } from 'react';
import { AgencyModal } from '../ui/AgencyModal';
import { AgencyButton } from '../ui/AgencyButton';
import { useDeclineReasons } from '../../hooks/useDeclineReasons';
import { DeclineReasonFields } from './DeclineReasonFields';
import './DeclineReasonModal.css';

/**
 * The standalone decline confirmation — for the surfaces that decide outside
 * the review room (the dossier's Decision Dock, the submissions list's row
 * and bulk actions, the casting board rail). The review room has its own
 * confirmation shell (DecisionConfirmation) and embeds DeclineReasonFields
 * directly instead of this wrapper.
 *
 * Declining is a real moment for the person on the other end, so this is a
 * composed modal, not a quick dropdown — the reviewer sees who (or how many)
 * they're passing on, picks a reason or doesn't, and — only if they picked
 * one — sees exactly what that person will read before it sends.
 *
 * @param {boolean} open
 * @param {string} [talentName]   Name for a single decline.
 * @param {number} [count]        Selection size for a bulk decline (>1).
 * @param {boolean} [busy]
 * @param {() => void} onClose
 * @param {(declineReasonId: string|null) => void} onConfirm
 */
export function DeclineReasonModal({
  open,
  talentName,
  count = 1,
  busy = false,
  onClose,
  onConfirm,
}) {
  const [reasonId, setReasonId] = useState('');
  const { reasons, isLoading, isError } = useDeclineReasons({ enabled: open });
  const isBulk = count > 1;

  // Reset the choice each time the modal opens for a new target, so a reason
  // picked for one person never rides along onto the next. Adjusted during
  // render (React's documented pattern for this) rather than in an effect,
  // which would set state a tick after the open-triggering render commits.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && reasonId !== '') setReasonId('');
  }

  const handleClose = () => {
    if (busy) return;
    onClose?.();
  };

  const handleConfirm = () => {
    onConfirm?.(reasonId || null);
  };

  return (
    <AgencyModal
      open={open}
      onClose={handleClose}
      title={isBulk ? `Pass on ${count} submissions` : `Pass on ${talentName || 'this submission'}`}
      footer={
        <div className="drm-actions">
          <AgencyButton variant="ghost" onClick={handleClose} disabled={busy}>
            Cancel
          </AgencyButton>
          <AgencyButton variant="secondary" onClick={handleConfirm} loading={busy}>
            Pass
          </AgencyButton>
        </div>
      }
    >
      <div className="drm-body">
        <p className="drm-lead">
          {isBulk
            ? <>This will mark <strong>{count} submissions</strong> as not moving forward.</>
            : <>This will mark <strong>{talentName || 'this submission'}</strong> as not moving forward.</>}
        </p>
        <DeclineReasonFields
          reasons={reasons}
          isLoading={isLoading}
          isError={isError}
          value={reasonId}
          onChange={setReasonId}
          disabled={busy}
        />
      </div>
    </AgencyModal>
  );
}

export default DeclineReasonModal;
