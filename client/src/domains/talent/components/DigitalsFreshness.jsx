import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import './DigitalsFreshness.css';

/**
 * What state this set of digitals is in, and the one action that fixes it.
 *
 * The freshness engine has computed four honest states for a while, but nothing
 * showed them. What the sheet showed instead was a two-way read —
 * `isStale ? "reshoot" : "Current"` — which had two faults:
 *
 *   - a set with no dated frames at all rendered *nothing*, so `undated` was
 *     invisible;
 *   - a set with one recent frame and one undated frame rendered
 *     **"Current — within the 3-month window"**, because `isStale` is false for
 *     an undated set and `oldestDays` was non-null. That is precisely the claim
 *     `digitals-freshness.js` exists to refuse: "Undated is never reported as
 *     current." The engine was right and the last mile overrode it.
 *
 * The root cause was deeper than the wording. The client carries its *own*
 * `shared/utils/packageIntelligence.js`, whose `analyzeRecency` never had the
 * four-state reading — only the older `isStale` / `oldestDays` pair. So the
 * browser was re-deriving freshness from a weaker parallel implementation than
 * the one the server reasons with, and no amount of rewording the note would
 * have fixed that.
 *
 * This component therefore reads `GET /api/talent/digitals/freshness` — the
 * server engine, as the single source of truth — rather than recomputing
 * anything locally. Where the state is `undated` it offers the only thing that
 * resolves it: the date the pictures were taken. That date can only come from
 * the talent; the upload path refuses to infer one from upload time, and comp
 * card import writes none at all.
 */

const STATE_LABEL = {
  current: 'Current',
  aging: 'Aging',
  stale: 'Stale',
  undated: 'Undated',
};

/** Today, as the date input's max — a shoot date cannot be in the future. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DigitalsFreshness({ onDated }) {
  const queryClient = useQueryClient();
  const { data: freshness } = useQuery({
    queryKey: ['digitals-freshness'],
    queryFn: () => talentApi.getDigitalsFreshness(),
    staleTime: 30_000,
  });

  const [dating, setDating] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  if (!freshness || !freshness.hasDigitals) return null;

  // Every frame the server reports as undated, across all sets.
  const undatedIds = (freshness.sets || [])
    .flatMap((set) => set.images || [])
    .filter((image) => image.state === 'undated')
    .map((image) => image.imageId)
    .filter(Boolean);

  const state = freshness.state;
  const label = STATE_LABEL[state] || STATE_LABEL.undated;
  const canDate = state === 'undated' && undatedIds.length > 0;

  const submit = async (event) => {
    event.preventDefault();
    if (!value) return;
    setSaving(true);
    try {
      const result = await talentApi.setDigitalsCaptureDate(undatedIds, value);
      toast.success(
        `Shoot date added to ${result.dated.length} frame${result.dated.length === 1 ? '' : 's'}.`,
      );
      setDating(false);
      setValue('');
      queryClient.setQueryData(['digitals-freshness'], result.freshness);
      onDated?.(result);
    } catch (error) {
      toast.error(error?.message || 'That date could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mw-fresh">
      <p className="mw-fresh__line">
        <span className={`mw-fresh__state mw-fresh__state--${state}`}>{label}</span>
        <span className="mw-fresh__guidance">{freshness.guidance}</span>
      </p>

      {canDate && !dating ? (
        <button type="button" className="mw-fresh__action" onClick={() => setDating(true)}>
          Add the shoot date
        </button>
      ) : null}

      {canDate && dating ? (
        <form className="mw-fresh__form" onSubmit={submit}>
          <label className="mw-fresh__label" htmlFor="digitals-captured-on">
            When were these taken?
          </label>
          <div className="mw-fresh__controls">
            <input
              id="digitals-captured-on"
              type="date"
              className="mw-fresh__input"
              value={value}
              max={todayIso()}
              onChange={(event) => setValue(event.target.value)}
            />
            <button type="submit" className="mw-fresh__submit" disabled={!value || saving}>
              {saving ? 'Saving…' : `Date ${undatedIds.length} frame${undatedIds.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              className="mw-fresh__cancel"
              onClick={() => {
                setDating(false);
                setValue('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
