import React from 'react';
import {
  frameTypeParts,
  pitsSignalParts,
  qualityHintFromSignals,
  REVIEW_STATE_LABELS,
} from '../../constants/frameTaxonomy';
import { getClassificationState } from '../../utils/imageClassification';
import { DIGITALS_STALE_DAYS } from '../../constants/packageIntelligence';
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
 * Honest per-frame age, read from the real shoot date (captured_at) — never the
 * upload timestamp. A digital that has aged past the agency window reads "stale".
 */
function frameAge(image, imageType, now = new Date()) {
  const raw = image?.captured_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 0) return null;
  let label;
  if (days === 0) label = 'shot today';
  else if (days < 7) label = `shot ${days}d ago`;
  else if (days < 56) label = `shot ${Math.round(days / 7)}w ago`;
  else if (days < 365) label = `shot ${Math.round(days / 30)}mo ago`;
  else label = `shot ${Math.floor(days / 365)}y ago`;
  const isDigital = String(imageType || '').toLowerCase() === 'digital';
  const stale = isDigital && days > DIGITALS_STALE_DAYS;
  return { label: stale ? `${label} · stale` : label, stale };
}

/**
 * Unified frame caption: lifecycle state + taxonomy chips + PITS signals + quality hint.
 */
export default function FrameReadCaption({
  image,
  classificationTimedOut = false,
  showQualityHint = true,
  showPitsSignals = true,
  showAge = true,
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
  const age = showAge ? frameAge(image, imageType || state.imageType) : null;
  const ageEl = age ? (
    <span className={`frame-read-age${age.stale ? ' frame-read-age--stale' : ''}`}>{age.label}</span>
  ) : null;

  if ((state.band === 'suggest' || state.band === 'ask') && (parts.length || signalRow.length)) {
    return (
      <>
        <FrameSignalStack parts={parts} signalParts={signalRow} surface={surface} hint={hint} />
        {ageEl}
      </>
    );
  }

  if (state.band === 'suggest' || state.band === 'ask') {
    return (
      <>
        <span className="mw-frame__read-note mw-frame__read-note--ask frame-read-note frame-read-note--ask">
          {REVIEW_STATE_LABELS.ask}
        </span>
        {ageEl}
      </>
    );
  }

  if (!parts.length && !signalRow.length) return ageEl;

  return (
    <>
      <FrameSignalStack parts={parts} signalParts={signalRow} surface={surface} hint={hint} />
      {ageEl}
    </>
  );
}
