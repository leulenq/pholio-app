import React from 'react';
import {
  frameTypeParts,
  pitsSignalParts,
  qualityHintFromSignals,
  REVIEW_STATE_LABELS,
} from '../../constants/frameTaxonomy';
import { getClassificationState } from '../../utils/imageClassification';
import FrameSignalStack from './FrameSignalStack';
import './FrameTaxonomy.css';

function parseSignals(image) {
  try {
    const meta = typeof image?.metadata === 'object' ? image.metadata : JSON.parse(image?.metadata || '{}');
    return meta?.ai?.signals || meta?.ai?.classification?.signals || {};
  } catch {
    return {};
  }
}

/**
 * Unified frame caption: lifecycle state + taxonomy chips + PITS signals + quality hint.
 */
export default function FrameReadCaption({
  image,
  classificationTimedOut = false,
  showQualityHint = true,
  showPitsSignals = true,
  surface = 'mw-frame',
}) {
  const state = getClassificationState(image);
  const signals = parseSignals(image);

  if (state.status === 'pending') {
    const note = classificationTimedOut
      ? REVIEW_STATE_LABELS.pending_timeout
      : REVIEW_STATE_LABELS.pending;
    return (
      <span className="mw-frame__read-note mw-frame__read-note--pending frame-read-note frame-read-note--pending">
        {note}
      </span>
    );
  }

  const shot = state.suggestedShot || state.shotType;
  const imageType = state.suggestedImageType || state.imageType;
  const styleType = state.styleType;
  const parts = frameTypeParts(shot, imageType, styleType);
  const signalRow = showPitsSignals ? pitsSignalParts(signals, imageType || state.imageType) : [];
  const hint = showQualityHint ? qualityHintFromSignals(signals, imageType || state.imageType) : null;

  if ((state.band === 'suggest' || state.band === 'ask') && (parts.length || signalRow.length)) {
    return (
      <FrameSignalStack
        parts={parts}
        signalParts={signalRow}
        surface={surface}
        hint={hint}
      />
    );
  }

  if (state.band === 'suggest' || state.band === 'ask') {
    return (
      <span className="mw-frame__read-note mw-frame__read-note--ask frame-read-note frame-read-note--ask">
        {REVIEW_STATE_LABELS.ask}
      </span>
    );
  }

  if (!parts.length && !signalRow.length) return null;

  return (
    <FrameSignalStack
      parts={parts}
      signalParts={signalRow}
      surface={surface}
      hint={hint}
    />
  );
}

export { reviewStateLabel } from './reviewStateLabel';
