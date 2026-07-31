import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { updateRosterBoards } from '../api/agency';
import { DivisionMark, STANDINGS } from './status';
import './BoardStandingsEditor.css';

/* The standings a booker can set by hand, in ladder order. `unknown` is
   deliberately absent: it is what the system records when nobody has said,
   not something anyone should choose. */
const SELECTABLE = [
  'represented',
  'active',
  'developing',
  'shortlisted',
  'onfile',
  'inactive',
  'ended',
  'passed',
];

/**
 * BoardStandingsEditor — the boards a talent sits on, and their standing on each.
 *
 * Replaces the single "Division" select, which could only express one board.
 * A talent booking both commercial and editorial is the normal case, not an
 * edge case, and the schema now supports it.
 *
 * Writes the whole set in one PUT. Standings are a small set edited as a unit,
 * so a single idempotent request avoids the partial-failure and ordering
 * problems that granular add/remove endpoints create.
 *
 * @param {string} membershipId
 * @param {Array}  value   Current standings: [{ board: {id, name}, standing, isPrimary }]
 * @param {Array}  boards  The agency's division boards (already filtered).
 * @param {Function} [onChanged]
 */
export default function BoardStandingsEditor({ membershipId, value, boards, onChanged }) {
  const queryClient = useQueryClient();
  const [pendingBoardId, setPendingBoardId] = useState('');

  const rows = useMemo(
    () =>
      (Array.isArray(value) ? value : [])
        .filter((r) => r?.board?.id)
        .map((r) => ({
          boardId: r.board.id,
          name: r.board.name,
          standing: r.standing || 'unknown',
          isPrimary: Boolean(r.isPrimary),
        })),
    [value],
  );

  const available = useMemo(() => {
    const taken = new Set(rows.map((r) => r.boardId));
    return boards.filter((b) => !taken.has(b.id));
  }, [boards, rows]);

  const mutation = useMutation({
    mutationFn: (next) =>
      updateRosterBoards(
        membershipId,
        next.map((r) => ({ boardId: r.boardId, standing: r.standing, isPrimary: r.isPrimary })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'roster-detail', membershipId] });
      onChanged?.();
    },
    onError: () => toast.error('Could not update boards'),
  });

  const commit = (next) => mutation.mutate(next);

  const setStanding = (boardId, standing) =>
    commit(rows.map((r) => (r.boardId === boardId ? { ...r, standing } : r)));

  const setPrimary = (boardId) =>
    commit(rows.map((r) => ({ ...r, isPrimary: r.boardId === boardId })));

  const remove = (boardId) => commit(rows.filter((r) => r.boardId !== boardId));

  const add = (boardId) => {
    if (!boardId) return;
    setPendingBoardId('');
    commit([
      ...rows,
      // A newly added board starts shortlisted, never represented — adding a
      // board is an intention, not a signature.
      { boardId, standing: 'shortlisted', isPrimary: rows.length === 0 },
    ]);
  };

  const busy = mutation.isPending;

  return (
    <div className="bse">
      {rows.length === 0 ? (
        <p className="bse__empty">
          Not on any board yet. Add one below to place this talent.
        </p>
      ) : (
        <ul className="bse__list">
          {rows.map((row) => (
            <li className="bse__row" key={row.boardId}>
              <DivisionMark division={row.name} standing={row.standing} size="sm" />

              <label className="bse__standing">
                <span className="bse__sr">Standing on {row.name}</span>
                <select
                  value={row.standing}
                  disabled={busy}
                  onChange={(event) => setStanding(row.boardId, event.target.value)}
                >
                  {SELECTABLE.map((key) => (
                    <option key={key} value={key}>
                      {STANDINGS[key].label}
                    </option>
                  ))}
                  {/* Keep an unset standing visible rather than silently
                      rewriting it to something the agency never chose. */}
                  {row.standing === 'unknown' && (
                    <option value="unknown">{STANDINGS.unknown.label}</option>
                  )}
                </select>
              </label>

              <label className="bse__primary" title="The talent's roster home at this agency">
                <input
                  type="radio"
                  name={`primary-${membershipId}`}
                  checked={row.isPrimary}
                  disabled={busy}
                  onChange={() => setPrimary(row.boardId)}
                />
                <span>Home</span>
              </label>

              <button
                type="button"
                className="bse__remove"
                onClick={() => remove(row.boardId)}
                disabled={busy}
                aria-label={`Remove ${row.name}`}
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <label className="bse__add">
          <span className="bse__sr">Add a board</span>
          <select
            value={pendingBoardId}
            disabled={busy}
            onChange={(event) => add(event.target.value)}
          >
            <option value="">Add a board…</option>
            {available.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
