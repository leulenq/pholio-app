/**
 * Detail panel for one off-platform submission.
 *
 * The counterpart to `ApplicationDetail` in the same ledger: same mast, same
 * facts list, same action shelf — because to the talent these are the same kind
 * of thing, just sent somewhere Pholio has no part in. The differences are
 * honest ones: nobody can be messaged from here, nothing can be withdrawn, and
 * the record can be deleted outright because it is nobody else's (ruling R9).
 *
 * Mount it keyed on the row id: selecting a different submission then starts
 * with fresh drafts instead of carrying a half-finished edit onto someone
 * else's record.
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import ConfirmationDialog from '../../../../shared/components/ui/ConfirmationDialog';
import { TRACKER_STATUS } from '../../../../shared/constants/submissionTracker';
import {
  formatTrackerDate,
  isTrackerLapsed,
  trackerChannelLabel,
  trackerStatusConfig,
} from '../../utils/submissionTracker';
import { talentApi } from '../../api/talent';

const MAX_NOTE = 500;
const MAX_OUTCOME_NOTE = 300;

function agencyInitial(name) {
  return String(name || 'Agency').trim().charAt(0).toUpperCase() || 'A';
}

function linkLabel(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export default function TrackerDetail({ row, onDeleted }) {
  const queryClient = useQueryClient();
  const config = trackerStatusConfig(row);
  const StatusIcon = config.icon;
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(row.note || '');
  const [answering, setAnswering] = useState(false);
  const [outcomeDraft, setOutcomeDraft] = useState(row.outcomeNote || '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (payload) => talentApi.updateTrackedSubmission(row.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
      setEditingNote(false);
      setAnswering(false);
    },
    onError: (err) => {
      toast.error(err?.message || 'That change could not be saved.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => talentApi.deleteTrackedSubmission(row.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
      setConfirmingDelete(false);
      toast.success('Record deleted.');
      onDeleted?.(row);
    },
    onError: (err) => {
      setConfirmingDelete(false);
      toast.error(err?.message || 'That record could not be deleted.');
    },
  });

  const saveNote = () => {
    const next = noteDraft.trim();
    if (next === (row.note || '')) {
      setEditingNote(false);
      return;
    }
    updateMutation.mutate({ note: next || null });
  };

  // The router rejects a PATCH whose every field already holds the sent value,
  // so only what genuinely changes goes over the wire.
  const recordReply = () => {
    const payload = {};
    if (row.status !== TRACKER_STATUS.HEARD_BACK) payload.status = TRACKER_STATUS.HEARD_BACK;
    const next = outcomeDraft.trim();
    if (next !== (row.outcomeNote || '')) payload.outcomeNote = next || null;
    if (Object.keys(payload).length === 0) {
      setAnswering(false);
      return;
    }
    updateMutation.mutate(payload);
  };

  const closeRecord = () => {
    if (row.status === TRACKER_STATUS.CLOSED_BY_TALENT) return;
    updateMutation.mutate({ status: TRACKER_STATUS.CLOSED_BY_TALENT });
  };

  const link = row.destinationUrl || null;
  const domain = linkLabel(link);
  const lapsed = isTrackerLapsed(row);

  return (
    <div className="app-detail">
      <div className="app-detail__mast">
        <span className="app-detail__mark" aria-hidden>
          <span>{agencyInitial(row.agencyName)}</span>
        </span>
        <h2 className="app-detail__name">{row.agencyName}</h2>
      </div>

      <div className={`app-detail__status app-detail__status--${config.tone}`}>
        <StatusIcon size={15} aria-hidden />
        <span>{config.label}</span>
      </div>

      <p className="app-detail__next">{config.next}</p>

      <dl className="app-detail__facts">
        <div>
          <dt>Submitted</dt>
          <dd>{formatTrackerDate(row.submittedOn) || 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Channel</dt>
          <dd>{trackerChannelLabel(row.channel)}</dd>
        </div>
        <div>
          <dt>Review window</dt>
          <dd>
            {row.reviewWindowDays ? `${row.reviewWindowDays} days` : 'Not recorded'}
            {row.lapseDate && !lapsed && row.status === TRACKER_STATUS.AWAITING
              ? ` · to ${formatTrackerDate(row.lapseDate)}`
              : ''}
          </dd>
        </div>
        {row.sentSummary?.fileCount ? (
          <div>
            <dt>Files sent</dt>
            <dd>
              {row.sentSummary.fileCount}{' '}
              {row.sentSummary.fileCount === 1 ? 'file' : 'files'}
            </dd>
          </div>
        ) : null}
        {domain && (
          <div>
            <dt>Sent to</dt>
            <dd>
              <a href={link} target="_blank" rel="noreferrer">
                {domain}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {row.outcomeNote && !answering && (
        <div className="app-detail__note">
          <span className="app-detail__note-title">What they said</span>
          <p className="app-detail__note-text">{row.outcomeNote}</p>
        </div>
      )}

      {editingNote ? (
        <div className="app-detail__note app-tracker-edit">
          <label className="app-detail__note-title" htmlFor={`tracker-note-${row.id}`}>
            Your note
          </label>
          <textarea
            id={`tracker-note-${row.id}`}
            className="app-tracker-textarea"
            rows={3}
            maxLength={MAX_NOTE}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
          />
          <div className="app-tracker-edit__actions">
            <PholioButton
              type="button"
              variant="primary"
              onClick={saveNote}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save note'}
            </PholioButton>
            <PholioButton
              type="button"
              variant="secondary"
              onClick={() => {
                setNoteDraft(row.note || '');
                setEditingNote(false);
              }}
            >
              Cancel
            </PholioButton>
          </div>
        </div>
      ) : (
        row.note && (
          <div className="app-detail__note">
            <span className="app-detail__note-title">Your note</span>
            <p className="app-detail__note-text">{row.note}</p>
          </div>
        )
      )}

      {answering && (
        <div className="app-detail__note app-tracker-edit">
          <label className="app-detail__note-title" htmlFor={`tracker-outcome-${row.id}`}>
            What they said (optional)
          </label>
          <textarea
            id={`tracker-outcome-${row.id}`}
            className="app-tracker-textarea"
            rows={3}
            maxLength={MAX_OUTCOME_NOTE}
            value={outcomeDraft}
            onChange={(event) => setOutcomeDraft(event.target.value)}
          />
          <div className="app-tracker-edit__actions">
            <PholioButton
              type="button"
              variant="primary"
              onClick={recordReply}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : 'Record reply'}
            </PholioButton>
            <PholioButton
              type="button"
              variant="secondary"
              onClick={() => {
                setOutcomeDraft(row.outcomeNote || '');
                setAnswering(false);
              }}
            >
              Cancel
            </PholioButton>
          </div>
        </div>
      )}

      <div className="app-detail__actions">
        {!answering && (
          <PholioButton
            type="button"
            variant="secondary"
            className="app-detail__act"
            onClick={() => setAnswering(true)}
          >
            <MessageSquare size={14} aria-hidden />
            {row.status === TRACKER_STATUS.HEARD_BACK ? 'Edit their reply' : 'Heard back'}
          </PholioButton>
        )}
        {!editingNote && (
          <PholioButton
            type="button"
            variant="secondary"
            className="app-detail__act"
            onClick={() => setEditingNote(true)}
          >
            {row.note ? 'Edit note' : 'Add a note'}
          </PholioButton>
        )}
        {row.status !== TRACKER_STATUS.CLOSED_BY_TALENT && (
          <PholioButton
            type="button"
            variant="secondary"
            className="app-detail__act"
            onClick={closeRecord}
            disabled={updateMutation.isPending}
          >
            <Check size={14} aria-hidden />
            Close record
          </PholioButton>
        )}
        <PholioButton
          type="button"
          variant="destructive"
          className="app-detail__act"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleteMutation.isPending}
        >
          <Trash2 size={14} aria-hidden />
          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        </PholioButton>
      </div>

      <p className="app-tracker-privacy">
        You logged this yourself. No agency can see it, and deleting it removes it for good.
      </p>

      <ConfirmationDialog
        isOpen={confirmingDelete}
        title="Delete this record?"
        message={`Delete your record of the submission to ${row.agencyName}. It is your own note of what you sent — nothing is withdrawn and no agency is told — but the record cannot be recovered.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        isConfirming={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
