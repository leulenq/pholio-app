import React from 'react';
import './LanePlates.css';

/**
 * LanePlates — editorial image plates (direction A). Multi-select lanes plus an
 * exclusive dashed "Not sure yet" text plate. Selecting a lane clears notSure;
 * selecting "Not sure yet" clears lanes. Keyboard operable (checkbox roles).
 *
 * @param {{ lanes: string[], notSure: boolean }} value
 * @param {Function} onChange(next)   Called with the next { lanes, notSure } shape.
 * @param {boolean}  [disabled=false]
 */

// TODO: replace with owned/licensed lane imagery before ship
const LANES = [
  { value: 'Editorial', img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=380&q=70' },
  { value: 'Commercial', img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=380&q=70' },
  { value: 'Runway', img: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=380&q=70' },
];

export default function LanePlates({ value, onChange, disabled = false }) {
  const lanes = value?.lanes || [];
  const notSure = !!value?.notSure;

  const toggleLane = (lane) => {
    if (disabled) return;
    const has = lanes.includes(lane);
    const nextLanes = has ? lanes.filter((l) => l !== lane) : [...lanes, lane];
    onChange?.({ lanes: nextLanes, notSure: false });
  };

  const toggleNotSure = () => {
    if (disabled) return;
    onChange?.({ lanes: [], notSure: !notSure });
  };

  return (
    <div className="lane-plates" role="group" aria-label="What work calls to you?">
      {LANES.map((l) => {
        const selected = lanes.includes(l.value);
        return (
          <button
            key={l.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={l.value}
            className={`lane-plate${selected ? ' is-selected' : ''}`}
            onClick={() => toggleLane(l.value)}
            disabled={disabled}
          >
            <img src={l.img} alt="" />
            <span className="lane-plate-check" aria-hidden="true" />
            <span className="lane-plate-label">{l.value}</span>
          </button>
        );
      })}

      <button
        type="button"
        role="checkbox"
        aria-checked={notSure}
        className={`lane-plate-text${notSure ? ' is-selected' : ''}`}
        onClick={toggleNotSure}
        disabled={disabled}
      >
        Not sure yet
      </button>
    </div>
  );
}
