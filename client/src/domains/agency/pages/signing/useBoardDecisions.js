import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  shortlistApplication,
  requestMoreApplication,
  requestMeetingApplication,
  acceptApplication,
  offerDevelopmentApplication,
  confirmRepresentationApplication,
  keepOnFileApplication,
  declineApplication,
  updateCastingApplicationStage,
  bulkUpdateCastingApplicationStage,
  bulkDeclineApplications,
  createNote,
} from '../../api/agency';
import { BOARD_VOCAB } from '../../lib/board-identity';
import { restorableStatus, standingWord } from '../../lib/standing';

/**
 * Decisions on the signing board.
 *
 * Every verdict here is a decision that notifies the talent, so this hook is
 * the whole mechanism the spec asks for in one place: an optimistic write so
 * the wall re-sections the instant a key is pressed, one toast in the agency
 * register, and an Undo that PATCHes the prior standing back (§2.2, §4.3).
 * The toast never claims the notification was recalled, because it was not.
 *
 * Bulk is limited to `keep_on_file` and `pass` on purpose: an offer is
 * consequential and individual, and a batch of them would be a decision made
 * by a keystroke rather than by a house.
 */

/** The represent toast, in the board's own vocabulary. */
function representPhrase(vocab) {
  const fallback = vocab?.decidedLower === 'confirmed'
    ? BOARD_VOCAB.package.toast
    : BOARD_VOCAB.division.toast;
  const phrase = vocab?.toast || fallback;
  return `${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`;
}

const readCandidate = (byId, id) => {
  if (!byId) return null;
  if (typeof byId.get === 'function') return byId.get(id) || null;
  return byId[id] || null;
};

const nameOf = (candidate) => {
  if (!candidate) return 'Unnamed applicant';
  const joined = [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim();
  return candidate.name || candidate.talentName || joined || 'Unnamed applicant';
};

/**
 * One row per action key. `status` is the standing the optimistic cache write
 * records; `single` is the API call for one id; `bulk` (where it exists) is the
 * batch route — its absence is what makes an action single-only.
 */
const ACTIONS = {
  shortlist: {
    status: 'shortlisted',
    single: (id) => shortlistApplication(id),
    toast: (name) => `Shortlisted ${name}`,
  },
  request_digitals: {
    status: 'requested_more',
    single: (id) => requestMoreApplication(id),
    toast: (name) => `Digitals requested from ${name}`,
  },
  invite_meeting: {
    status: 'meeting_requested',
    single: (id) => requestMeetingApplication(id),
    toast: (name) => `Meeting requested with ${name}`,
  },
  offer: {
    status: 'accepted',
    single: (id) => acceptApplication(id),
    toast: (name) => `Offer sent to ${name}`,
  },
  development: {
    status: 'development',
    single: (id) => offerDevelopmentApplication(id),
    toast: (name) => `Development offer sent to ${name}`,
  },
  represent: {
    status: 'represented',
    single: (id) => confirmRepresentationApplication(id),
    toast: (name, vocab) => `${name} ${representPhrase(vocab)}`,
  },
  keep_on_file: {
    status: 'kept_on_file',
    single: (id) => keepOnFileApplication(id),
    bulk: (ids) => bulkUpdateCastingApplicationStage(ids, { status: 'kept_on_file' }),
    toast: (name) => `${name} kept on file`,
    bulkToast: (n) => `${n} kept on file`,
  },
  pass: {
    status: 'declined',
    single: (id, { declineReason = null } = {}) => declineApplication(id, { declineReason }),
    bulk: (ids, { declineReason = null } = {}) => bulkDeclineApplications(ids, declineReason),
    toast: (name) => `Passed on ${name}`,
    bulkToast: (n) => `Passed on ${n}`,
  },
  reopen: {
    status: 'shortlisted',
    single: (id) => updateCastingApplicationStage(id, { status: 'shortlisted' }),
    toast: (name) => `Reopened ${name}`,
  },
};

export function useBoardDecisions({ boardId, vocab, byId } = {}) {
  const qc = useQueryClient();
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [sessionDecided, setSessionDecided] = useState(0);

  // Latest inputs, read inside callbacks without re-creating them.
  const ctxRef = useRef({ boardId, vocab, byId });
  useEffect(() => { ctxRef.current = { boardId, vocab, byId }; });

  const boardKey = useCallback(() => ['board-candidates', ctxRef.current.boardId], []);

  const markBusy = useCallback((ids, on) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  /**
   * Write a standing into the raw `{ board, stages, candidates }` payload so
   * the wall re-sections synchronously. Returns { key, prev } for rollback.
   */
  const applyOptimistic = useCallback((ids, status) => {
    const key = boardKey();
    /* Ids travel as strings everywhere on this surface (boardModel.candidateId
       stringifies), while a cached row may carry a numeric legacy `id`. Match
       on strings on both sides or the optimistic write silently misses. */
    const set = new Set(ids.map((id) => String(id)));
    const prev = qc.getQueryData(key);
    const at = new Date().toISOString();
    qc.setQueryData(key, (old) => {
      if (!old || !Array.isArray(old.candidates)) return old;
      return {
        ...old,
        candidates: old.candidates.map((c) => (set.has(String(c.applicationId ?? c.id))
          ? { ...c, backendStatus: status, statusChangedAt: at }
          : c)),
      };
    });
    return { key, prev };
  }, [qc, boardKey]);

  /** One snapshot of the board cache, taken before any write touches it. */
  const snapshotBoard = useCallback(() => {
    const key = boardKey();
    return { key, prev: qc.getQueryData(key) };
  }, [qc, boardKey]);

  const rollback = useCallback((snapshot) => {
    if (snapshot && snapshot.prev !== undefined) qc.setQueryData(snapshot.key, snapshot.prev);
  }, [qc]);

  const refresh = useCallback((ids) => {
    qc.invalidateQueries({ queryKey: boardKey() });
    qc.invalidateQueries({ queryKey: ['agency-boards'] });
    ids.forEach((id) => qc.invalidateQueries({ queryKey: ['application', id] }));
  }, [qc, boardKey]);

  /**
   * Undo: PATCH each id back to the standing it held. It restores the record,
   * not the notification — the toast copy is careful about that difference,
   * and it names the standing that was actually written, never the raw prior.
   */
  const undo = useCallback(async (priors) => {
    const restore = priors
      .map((p) => ({ id: p.id, status: restorableStatus(p.status) }))
      .filter((p) => p.status);
    if (restore.length === 0) return;

    const ids = restore.map((p) => p.id);
    /* One snapshot, taken before the first write. A snapshot per row would
       capture a cache the previous row had already mutated, and rolling those
       back in turn would restore the half-written state, not the original. */
    const snapshot = snapshotBoard();
    restore.forEach((p) => applyOptimistic([p.id], p.status));
    markBusy(ids, true);
    try {
      await Promise.all(restore.map((p) => updateCastingApplicationStage(p.id, { status: p.status })));
      setSessionDecided((n) => Math.max(0, n - restore.length));
      if (restore.length === 1) {
        const name = nameOf(readCandidate(ctxRef.current.byId, restore[0].id));
        toast.success(`Restored ${name} to ${standingWord(restore[0].status)}`);
      } else {
        toast.success(`Restored ${restore.length} to prior standing`);
      }
    } catch {
      rollback(snapshot);
      toast.error('Action failed');
    } finally {
      markBusy(ids, false);
      refresh(ids);
    }
  }, [applyOptimistic, markBusy, refresh, rollback, snapshotBoard]);

  /**
   * `decide(action, ids, { declineReason, note, variant })`.
   * Resolves to true when the decision was recorded, false when it was refused
   * (unknown action, empty selection, or a bulk of an action that is single by
   * design — bulk offers above all).
   */
  const decide = useCallback(async (action, ids, opts = {}) => {
    const spec = ACTIONS[action];
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!spec || list.length === 0) return false;
    if (list.length > 1 && !spec.bulk) return false;

    const { byId: map, vocab: v } = ctxRef.current;
    const priors = list.map((id) => ({
      id,
      status: readCandidate(map, id)?.backendStatus || 'submitted',
    }));

    await qc.cancelQueries({ queryKey: boardKey() });
    const snapshot = applyOptimistic(list, spec.status);
    markBusy(list, true);

    try {
      if (list.length > 1) await spec.bulk(list, opts);
      else await spec.single(list[0], opts);
    } catch (e) {
      rollback(snapshot);
      markBusy(list, false);
      toast.error(e?.message || 'Action failed');
      return false;
    }

    // The house note rides alongside a pass; a failed note must not read as a
    // failed decision, so it is reported on its own.
    const note = typeof opts.note === 'string' ? opts.note.trim() : '';
    if (note) {
      const results = await Promise.allSettled(list.map((id) => createNote(id, note)));
      if (results.some((r) => r.status === 'rejected')) toast.error('Could not save the note');
    }

    markBusy(list, false);
    setSessionDecided((n) => n + list.length);

    const message = list.length > 1
      ? spec.bulkToast(list.length)
      : spec.toast(nameOf(readCandidate(map, list[0])), v);
    /* Undo is offered only when every prior standing is one an agency may
       write. A talent's withdrawal, confirmation or decline — and the
       auto-close job's silence — are not the house's to take back, and an
       Undo that would fail at the API is worse than no Undo at all. */
    const undoable = priors.every((p) => restorableStatus(p.status));
    toast.success(
      message,
      undoable ? { action: { label: 'Undo', onClick: () => undo(priors) } } : undefined,
    );

    refresh(list);
    return true;
  }, [qc, boardKey, applyOptimistic, markBusy, rollback, refresh, undo]);

  return { decide, busyIds, sessionDecided };
}

export default useBoardDecisions;
