import React, { useMemo, useState } from 'react';
import { Bookmark, Check, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import {
  getClassificationState,
  imageNeedsReview,
  frameTypeParts,
} from '../../../shared/utils/imageClassification';
import {
  pitsSignalParts,
  reviewStripCopy,
} from '../../../shared/constants/frameTaxonomy';
import FrameSignalStack from '../../../shared/components/frame/FrameSignalStack';
import FrameReviewStateLabel from '../../../shared/components/frame/FrameReviewStateLabel';
import { reviewStateLabel } from '../../../shared/components/frame/reviewStateLabel';
import FrameReadCaption from '../../../shared/components/frame/FrameReadCaption';
import PholioButton from '../../../shared/components/ui/PholioButton';
import '../../../shared/components/frame/FrameTaxonomy.css';
import './ClassificationReviewStrip.css';

function getImageUrl(image) {
  const value = image?.public_url || image?.path || '';
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('/')) return value;
  return `/uploads/${value.replace(/^\/+/, '')}`;
}

function parseSignals(image) {
  try {
    const meta = typeof image?.metadata === 'object' ? image.metadata : JSON.parse(image?.metadata || '{}');
    return meta?.ai?.signals || meta?.ai?.classification?.signals || {};
  } catch {
    return {};
  }
}

export function ClassificationReviewRows({ images = [], onConfirm, onEdit }) {
  const [busyId, setBusyId] = useState(null);

  const reviewItems = useMemo(
    () => images.filter(imageNeedsReview),
    [images],
  );

  if (reviewItems.length === 0) return null;

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
    <ul className="crs-strip__list">
      {reviewItems.map((image) => {
        const state = getClassificationState(image);
        const signals = parseSignals(image);
        const imageType = state.suggestedImageType || state.imageType;
        const parts = frameTypeParts(
          state.suggestedShot || state.shotType,
          imageType,
          state.styleType,
        );
        const signalParts = pitsSignalParts(signals, imageType);
        const copy = reviewStripCopy(state, parts.length > 0);
        const showActions = state.status !== 'pending';

        return (
          <li key={image.id} className="crs-strip__item">
            <img src={getImageUrl(image)} alt="" className="crs-strip__thumb" />
            <div className="crs-strip__copy">
              <FrameReviewStateLabel>{reviewStateLabel(state, parts.length > 0)}</FrameReviewStateLabel>
              <FrameSignalStack parts={parts} signalParts={signalParts} surface="crs" />
              <span className="crs-strip__reason">{copy.detail}</span>
            </div>
            {showActions ? (
              <div className="crs-decision-rail" aria-label="Frame read actions">
                {state.suggestedShot && state.status !== 'pending' ? (
                  <PholioButton
                    type="button"
                    variant="primary"
                    size="sm"
                    system="dashboard"
                    disabled={busyId === image.id}
                    onClick={() => acceptSuggestion(image)}
                  >
                    <Check size={13} aria-hidden="true" />
                    <span>Keep</span>
                  </PholioButton>
                ) : null}
                <PholioButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  system="dashboard"
                  onClick={() => onEdit?.(image)}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  <span>{state.suggestedShot ? 'Refine' : 'Place'}</span>
                </PholioButton>
                {state.status !== 'pending' ? (
                  <PholioButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    system="dashboard"
                    disabled={busyId === image.id}
                    onClick={() => holdReview(image)}
                  >
                    <Bookmark size={13} aria-hidden="true" />
                    <span>Hold</span>
                  </PholioButton>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default ClassificationReviewRows;

/** @deprecated Import FrameReadCaption from shared/components/frame instead */
export function FrameTypeCaption(props) {
  return <FrameReadCaption {...props} />;
}
