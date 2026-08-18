import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Edit2, Crop, Trash2 } from 'lucide-react';
import { PholioIconButton } from '../../../shared/components/ui/PholioButton';
import {
  DIGITALS_SLOTS,
  analyzeDigitalsSet,
  frameForSlot,
} from '../../../shared/utils/profileReadinessImages';
import DigitalsFreshness from './DigitalsFreshness';
import './DigitalsContactSheet.css';

/**
 * The Digitals set — the whole of it.
 *
 * This was a small index sheet sitting directly above the section's frame grid,
 * and the two drew from the same bucket: `frameForSlot` picks its frames out of
 * exactly the images the grid rendered underneath. So Digitals printed the same
 * photographs twice, at two sizes, as two parallel content layers. That is what
 * made the section feel crowded — not the spacing between the layers.
 *
 * There is one content layer now. The five slots a booker opens ARE the digitals
 * section, at full scale, carrying the same edit / crop / remove affordances the
 * library frames carry. A filled slot shows the frame; an empty slot is left
 * visibly, deliberately empty and opens the uploader. It is the same five-slot
 * sheet `DigitalsSet` renders inside the agency dossier, from the same
 * predicates — what the talent works against is literally what the agency opens.
 *
 * Slot order is canonical, so there is no drag-reorder here: "headshot" is a
 * position in a set, not a sequence the talent arranges.
 *
 * No count, no meter, no coaching. You can see it.
 */
function slotSrc(image) {
  const value = image?.public_url || image?.path || '';
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}

/** Edit / crop / remove, in the library frame's own material. */
function FrameActions({ frame, onOpenFrame, onCropFrame, onDeleteFrame }) {
  return (
    <div className="mw-frame__actions" aria-label="Frame actions">
      <PholioIconButton
        label="Edit details"
        tone="dark"
        className="mw-frame__action"
        title="Edit details"
        onClick={(e) => { e.stopPropagation(); onOpenFrame?.(frame); }}
      >
        <Edit2 size={14} aria-hidden="true" />
      </PholioIconButton>
      <PholioIconButton
        label="Crop"
        tone="dark"
        className="mw-frame__action"
        title="Crop"
        onClick={(e) => { e.stopPropagation(); onCropFrame?.(frame); }}
      >
        <Crop size={14} aria-hidden="true" />
      </PholioIconButton>
      <PholioIconButton
        label="Remove"
        danger
        tone="dark"
        className="mw-frame__action mw-frame__action--danger"
        title="Remove"
        onClick={(e) => { e.stopPropagation(); onDeleteFrame?.(frame.id); }}
      >
        <Trash2 size={14} aria-hidden="true" />
      </PholioIconButton>
    </div>
  );
}

export default function DigitalsContactSheet({
  images = [],
  suppressBodyImagery = false,
  onDated = null,
  onAddFrames,
  onOpenFrame,
  onCropFrame,
  onDeleteFrame,
}) {
  const shouldReduce = useReducedMotion();
  const set = useMemo(
    () => analyzeDigitalsSet(images, { suppressBodyImagery }),
    [images, suppressBodyImagery],
  );

  // A minor without guardian consent is never asked for body frames, so those
  // slots are withheld rather than drawn as gaps they are not allowed to fill.
  const slots = useMemo(
    () => DIGITALS_SLOTS.filter((slot) => !(suppressBodyImagery && slot.body)),
    [suppressBodyImagery],
  );

  const slotFrames = useMemo(
    () => slots.map((slot) => ({ slot, frame: frameForSlot(images, slot.key) })),
    [slots, images],
  );

  // Frames in this set that no visible slot is showing: a second headshot, an
  // as-yet-unclassified upload, or a body frame withheld from a minor's sheet.
  // They are not dropped — they'd be unreachable, and unremovable — but they are
  // plainly subordinate to the set itself.
  const extras = useMemo(() => {
    const shown = new Set(slotFrames.map(({ frame }) => frame?.id).filter(Boolean));
    return images.filter((img) => !shown.has(img.id));
  }, [slotFrames, images]);

  return (
    <div className="mw-sheet">
      <ol className="mw-sheet__slots">
        {slotFrames.map(({ slot, frame }, index) => {
          const entrance = shouldReduce
            ? {}
            : {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.36, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] },
              };

          return (
            <motion.li key={slot.key} className="mw-sheet__slot" {...entrance}>
              <div className="mw-sheet__frame">
                <button
                  type="button"
                  className={`mw-sheet__stage${frame ? '' : ' mw-sheet__stage--empty'}`}
                  onClick={() => (frame ? onOpenFrame?.(frame) : onAddFrames?.())}
                  aria-label={frame ? `Open your ${slot.label.toLowerCase()} digital` : `Add a ${slot.label.toLowerCase()} digital`}
                >
                  {frame ? (
                    <img
                      className="mw-sheet__img"
                      src={slotSrc(frame)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <Plus size={20} className="mw-sheet__plus" aria-hidden="true" />
                  )}
                </button>
                {frame ? (
                  <FrameActions
                    frame={frame}
                    onOpenFrame={onOpenFrame}
                    onCropFrame={onCropFrame}
                    onDeleteFrame={onDeleteFrame}
                  />
                ) : null}
              </div>
              <span className={`mw-sheet__label${frame ? '' : ' mw-sheet__label--empty'}`}>
                {slot.label}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="mw-sheet__notes">
        {/*
          The four-state reading, straight off the freshness engine. This used to
          be a two-way `isStale ? … : "Current"` note, which rendered nothing at
          all for a set with no dated frames and — worse — printed "Current" for
          an undated set, since `isStale` is false there and `oldestDays` was
          non-null. The engine refuses to call an undated set current; the UI
          must not overrule it.
        */}
        <DigitalsFreshness onDated={onDated} />

        {suppressBodyImagery ? (
          <p className="mw-sheet__note">
            Body frames stay off this sheet until guardian consent is on file.
          </p>
        ) : null}

        {set.isComplete ? (
          <p className="mw-sheet__note mw-sheet__note--complete">
            Your set is complete — every slot an agency opens is filled.
          </p>
        ) : null}
      </div>

      {extras.length > 0 ? (
        <div className="mw-sheet__extras">
          <h3 className="mw-meta mw-sheet__extras-title">
            Also in this set · {extras.length}
          </h3>
          <ul className="mw-sheet__extras-list">
            {extras.map((frame) => (
              <li key={frame.id} className="mw-sheet__extra">
                <div className="mw-sheet__frame">
                  <button
                    type="button"
                    className="mw-sheet__stage mw-sheet__stage--extra"
                    onClick={() => onOpenFrame?.(frame)}
                    aria-label="Open frame"
                  >
                    <img
                      className="mw-sheet__img"
                      src={slotSrc(frame)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </button>
                  <FrameActions
                    frame={frame}
                    onOpenFrame={onOpenFrame}
                    onCropFrame={onCropFrame}
                    onDeleteFrame={onDeleteFrame}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
