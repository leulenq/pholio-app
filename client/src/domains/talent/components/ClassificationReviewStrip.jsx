import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import PholioButton from '../../../shared/components/ui/PholioButton';
import {
  getClassificationState,
  imageNeedsReview,
  typeSignalParts,
} from '../../../shared/utils/imageClassification';
import './ClassificationReviewStrip.css';

function getImageUrl(image) {
  const value = image?.public_url || image?.path || '';
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('/')) return value;
  return `/uploads/${value.replace(/^\/+/, '')}`;
}

function ReadSignalStack({ signals, surface = 'strip' }) {
  if (!signals.length) return null;
  return (
    <div className={`${surface}-read-signals`} aria-label="Frame read">
      {signals.map((signal) => (
        <span
          key={`${signal.key}-${signal.label}`}
          className={`${surface}-read-signal ${surface}-read-signal--${signal.key}`}
        >
          {signal.label}
        </span>
      ))}
    </div>
  );
}

function reviewCopyFor(state, hasSignals) {
  if (state.status === 'pending') {
    return {
      title: 'Reading frame',
      detail: 'Pholio is placing the frame in your book.',
    };
  }
  if (hasSignals) {
    return {
      title: 'Read ready',
      detail: 'Keep it if the placement feels right, or refine the frame details.',
    };
  }
  return {
    title: 'Frame needs placement',
    detail: 'Set the framing and use so agencies can scan the book cleanly.',
  };
}

export default function ClassificationReviewStrip({ images = [], onConfirm, onEdit }) {
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(true);

  const reviewItems = useMemo(
    () => images.filter(imageNeedsReview),
    [images],
  );

  if (reviewItems.length === 0 || !open) return null;

  const holdReview = async (image) => {
    setBusyId(image.id);
    try {
      const payload = {
        metadata: {
          ...(typeof image.metadata === 'object' ? image.metadata : {}),
          ai: {
            ...(typeof image.metadata === 'object' ? image.metadata?.ai : {}),
            classification: {
              ...(typeof image.metadata === 'object'
                ? image.metadata?.ai?.classification
                : {}),
              source: 'user',
              confirmed: false,
              band: 'ask',
              review_deferred: true,
            },
          },
        },
      };
      const res = await talentApi.updateMedia(image.id, payload);
      if (res?.image) onConfirm?.(image.id, res.image);
    } catch (err) {
      toast.error(err?.message || 'Could not hold this frame read');
    } finally {
      setBusyId(null);
    }
  };

  const acceptSuggestion = async (image) => {
    const state = getClassificationState(image);
    setBusyId(image.id);
    try {
      const payload = {
        shot_type: state.suggestedShot || state.shotType || null,
        image_type: state.suggestedImageType || state.imageType || null,
        style_type: state.styleType || null,
        metadata: {
          ...(typeof image.metadata === 'object' ? image.metadata : {}),
          ai: {
            classification: {
              source: 'user',
              confirmed: true,
              band: 'auto',
            },
          },
        },
      };
      const res = await talentApi.updateMedia(image.id, payload);
      if (res?.image) onConfirm?.(image.id, res.image);
      toast.success('Frame read saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save this frame read');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="crs-strip" aria-label="Review frame reads">
      <div className="crs-strip__head">
        <div>
          <p className="crs-strip__title">Studio reads</p>
          <p className="crs-strip__summary">
            {reviewItems.length} {reviewItems.length === 1 ? 'frame is' : 'frames are'} ready for placement.
          </p>
        </div>
        <button
          type="button"
          className="crs-strip__dismiss"
          aria-label="Hide studio reads"
          title="Hide studio reads"
          onClick={() => setOpen(false)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <ul className="crs-strip__list">
        {reviewItems.map((image) => {
          const state = getClassificationState(image);
          const signals = typeSignalParts(
            state.suggestedShot || state.shotType,
            state.suggestedImageType || state.imageType,
            state.styleType,
          );
          const copy = reviewCopyFor(state, signals.length > 0);
          return (
            <li key={image.id} className="crs-strip__item">
              <img src={getImageUrl(image)} alt="" className="crs-strip__thumb" />
              <div className="crs-strip__copy">
                <span className="crs-strip__label">{copy.title}</span>
                <ReadSignalStack signals={signals} surface="crs" />
                <span className="crs-strip__reason">{copy.detail}</span>
              </div>
              <div className="crs-strip__actions">
                {state.suggestedShot && state.status !== 'pending' ? (
                  <PholioButton
                    variant="solid"
                    size="sm"
                    disabled={busyId === image.id}
                    onClick={() => acceptSuggestion(image)}
                  >
                    Keep read
                  </PholioButton>
                ) : null}
                <button
                  type="button"
                  className="crs-strip__link"
                  onClick={() => onEdit?.(image)}
                >
                  {state.suggestedShot ? 'Refine' : 'Place'}
                </button>
                {state.status !== 'pending' ? (
                  <button
                    type="button"
                    className="crs-strip__link crs-strip__link--skip"
                    disabled={busyId === image.id}
                    onClick={() => holdReview(image)}
                  >
                    Hold
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FrameTypeCaption({ image, classificationTimedOut = false }) {
  const state = getClassificationState(image);
  if (state.status === 'pending') {
    if (classificationTimedOut) {
      return (
        <span className="mw-frame__read-note mw-frame__read-note--ask">
          Add a frame read
        </span>
      );
    }
    return <span className="mw-frame__read-note mw-frame__read-note--pending">Reading frame</span>;
  }
  if (state.band === 'suggest' || state.band === 'ask') {
    const suggested = typeSignalParts(
      state.suggestedShot || state.shotType,
      state.suggestedImageType || state.imageType,
      state.styleType,
    );
    if (suggested.length) return <ReadSignalStack signals={suggested} surface="mw-frame" />;
    return (
      <span className="mw-frame__read-note mw-frame__read-note--ask">
        Add a frame read
      </span>
    );
  }
  const signals = typeSignalParts(state.shotType, state.imageType, state.styleType);
  if (!signals.length) return null;
  return <ReadSignalStack signals={signals} surface="mw-frame" />;
}
