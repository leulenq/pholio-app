import React from 'react';
import './GenderTiles.css';

/**
 * GenderTiles — 4 portrait tiles (direction C). Single-select; the chosen tile
 * lights gold (frame + icon + label). Keyboard operable (radiogroup / radio).
 *
 * @param {string|null} value                 One of the option values below, or null.
 * @param {Function}    onChange(value)        Called with the selected option value.
 * @param {boolean}    [disabled=false]
 *
 * Option values (payload contract): Female | Male | Non-binary | Prefer not to say.
 * These MUST match CANONICAL_GENDERS in src/shared/lib/gender.js — the value is
 * written straight to profiles.gender and is later re-validated by the profile
 * update schema on every dashboard save.
 */

// Icons ported verbatim from the prototype (stroke/fill handled in CSS).
const OPTIONS = [
  {
    value: 'Female',
    label: 'Female',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4.2" />
        <line x1="12" y1="12.2" x2="12" y2="21" />
        <line x1="8.4" y1="18" x2="15.6" y2="18" />
      </svg>
    ),
  },
  {
    value: 'Male',
    label: 'Male',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10.5" cy="14" r="4.2" />
        <line x1="13.6" y1="10.9" x2="20" y2="4.5" />
        <polyline points="15,4.5 20,4.5 20,9.5" />
      </svg>
    ),
  },
  {
    value: 'Non-binary',
    label: 'Non-binary',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13.6" r="4.2" />
        <line x1="12" y1="9.4" x2="12" y2="2.6" />
      </svg>
    ),
  },
  {
    value: 'Prefer not to say',
    label: 'Undisclosed',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M5.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      </svg>
    ),
  },
];

export default function GenderTiles({ value = null, onChange, disabled = false }) {
  return (
    <div className="gender-tiles" role="radiogroup" aria-label="How do you identify?">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            className={`gender-tile${selected ? ' is-selected' : ''}`}
            onClick={() => !disabled && onChange?.(o.value)}
            disabled={disabled}
          >
            {o.icon}
            <span className="gender-tile-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
