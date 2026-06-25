import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COMP_CARD_SLOT_LABELS } from '../../../shared/constants/frameTaxonomy';
import './ReadinessBar.css';

const ROLE_SLOTS = [
  { role: 'headshot', label: COMP_CARD_SLOT_LABELS.headshot },
  { role: 'full_body', label: COMP_CARD_SLOT_LABELS.full_length },
  { role: 'editorial', label: COMP_CARD_SLOT_LABELS.editorial },
  { role: 'lifestyle', label: COMP_CARD_SLOT_LABELS.lifestyle },
];

function parseRole(img) {
  try {
    const m = typeof img.metadata === 'string' ? JSON.parse(img.metadata) : img.metadata;
    return m?.role || null;
  } catch { return null; }
}

function hasShotType(img) {
  return img.shot_type != null && String(img.shot_type).trim() !== '';
}

function hasStyleType(img) {
  return img.style_type != null && String(img.style_type).trim() !== '';
}

/** Comp-card readiness slots: prefer structured shot/style; fall back to metadata.role when unset. */
function imageFillsSlot(img, slotRole) {
  const legacy = parseRole(img);
  switch (slotRole) {
    case 'headshot':
      if (img.shot_type === 'headshot') return true;
      if (!hasShotType(img) && legacy === 'headshot') return true;
      return false;
    case 'full_body':
      if (img.shot_type === 'full_length' || img.shot_type === 'three_quarter' || img.shot_type === 'full_body') return true;
      if (!hasShotType(img) && legacy === 'full_body') return true;
      return false;
    case 'editorial':
      if (img.style_type === 'editorial') return true;
      if (!hasStyleType(img) && legacy === 'editorial') return true;
      return false;
    case 'lifestyle':
      if (img.style_type === 'lifestyle') return true;
      if (!hasStyleType(img) && legacy === 'lifestyle') return true;
      return false;
    default:
      return false;
  }
}

export default function ReadinessBar({ images = [] }) {
  const [collapsed, setCollapsed] = useState(false);

  const roleStatus = useMemo(() => {
    const filled = {};
    for (const img of images) {
      for (const slot of ROLE_SLOTS) {
        if (imageFillsSlot(img, slot.role)) filled[slot.role] = true;
      }
    }

    return ROLE_SLOTS.map(slot => ({
      ...slot,
      filled: !!filled[slot.role],
    }));
  }, [images]);

  const filledCount = roleStatus.filter(r => r.filled).length;
  const total = ROLE_SLOTS.length;
  const isComplete = filledCount === total;
  const progressPct = Math.round((filledCount / total) * 100);

  React.useEffect(() => {
    if (!isComplete && collapsed) {
      setCollapsed(false);
    }
  }, [isComplete, collapsed]);

  if (isComplete && collapsed) return null;

  const statusText = isComplete
    ? 'Comp card slots filled'
    : `${filledCount} of ${total} comp card slots`;

  return (
    <div
      className={`readiness-bar ${isComplete ? 'readiness-bar--complete' : ''}`}
      aria-label={`Comp card slots: ${statusText}`}
    >
      <div className="readiness-bar__header">
        <div className="readiness-bar__roles">
          {roleStatus.map(slot => (
            <div key={slot.role} className="readiness-bar__role">
              <div
                className={`readiness-bar__circle ${slot.filled ? 'readiness-bar__circle--filled' : ''}`}
              >
                {slot.filled && <Check size={10} strokeWidth={3} />}
              </div>
              <span className={`readiness-bar__label ${slot.filled ? 'readiness-bar__label--filled' : ''}`}>
                {slot.label}
              </span>
            </div>
          ))}
        </div>

        <div className="readiness-bar__status">
          <span className="readiness-bar__count">
            {statusText}
          </span>
          {isComplete && (
            <button
              className="readiness-bar__collapse-btn"
              onClick={() => setCollapsed(true)}
              aria-label="Dismiss comp card slots bar"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {!isComplete && (
        <div className="readiness-bar__track">
          <div
            className="readiness-bar__fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
