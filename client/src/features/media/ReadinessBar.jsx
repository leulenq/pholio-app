import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './ReadinessBar.css';

const ROLE_SLOTS = [
  { role: 'headshot',  label: 'Headshot',  color: '#C9A55A' },
  { role: 'full_body', label: 'Full Body', color: '#2563EB' },
  { role: 'editorial', label: 'Editorial', color: '#7C3AED' },
  { role: 'lifestyle', label: 'Lifestyle', color: '#059669' },
];

function parseRole(img) {
  try {
    const m = typeof img.metadata === 'string' ? JSON.parse(img.metadata) : img.metadata;
    return m?.role || null;
  } catch { return null; }
}

export default function ReadinessBar({ images = [] }) {
  const [collapsed, setCollapsed] = useState(false);

  const roleStatus = useMemo(() => {
    const filled = {};
    images.forEach(img => {
      const r = parseRole(img);
      if (r && !filled[r]) filled[r] = true;
    });

    return ROLE_SLOTS.map(slot => ({
      ...slot,
      filled: !!filled[slot.role],
    }));
  }, [images]);

  const filledCount = roleStatus.filter(r => r.filled).length;
  const total = ROLE_SLOTS.length;
  const isComplete = filledCount === total;
  const progressPct = Math.round((filledCount / total) * 100);

  // If all roles filled, show compact "ready" state
  if (isComplete && collapsed) return null;

  return (
    <div className={`readiness-bar ${isComplete ? 'readiness-bar--complete' : ''}`}>
      <div className="readiness-bar__header">
        <div className="readiness-bar__roles">
          {roleStatus.map(slot => (
            <div key={slot.role} className="readiness-bar__role">
              <div
                className={`readiness-bar__circle ${slot.filled ? 'readiness-bar__circle--filled' : ''}`}
                style={slot.filled ? { borderColor: slot.color, background: slot.color } : { borderColor: '#d1d5db' }}
              >
                {slot.filled && <Check size={10} strokeWidth={3} color="#fff" />}
              </div>
              <span className={`readiness-bar__label ${slot.filled ? 'readiness-bar__label--filled' : ''}`}>
                {slot.label}
              </span>
            </div>
          ))}
        </div>

        <div className="readiness-bar__status">
          <span className="readiness-bar__count">
            {isComplete ? '✓ Comp card ready' : `${filledCount} of ${total} roles filled`}
          </span>
          {isComplete && (
            <button
              className="readiness-bar__collapse-btn"
              onClick={() => setCollapsed(true)}
              aria-label="Dismiss readiness bar"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
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
