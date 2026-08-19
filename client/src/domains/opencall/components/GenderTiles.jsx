import React from 'react';

/**
 * Identity, as portrait tiles (`client/src/domains/onboarding/DESIGN.md` §4).
 *
 * Four hairline-framed tiles, each with a mark that reflects the identity; the
 * chosen tile's frame, icon and label light gold. Single-select, keyboard
 * operable as a radiogroup.
 *
 * The values are the canonical strings in `src/shared/lib/gender.js` — the
 * answer is projected onto `profiles.gender` at claim, so an off-vocabulary
 * label here becomes a profile that fails its own update schema later.
 */

const OPTIONS = [
  {
    value: 'Female',
    label: 'Female',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="13.6" r="4.2" />
        <line x1="12" y1="9.4" x2="12" y2="2.6" />
      </svg>
    ),
  },
  {
    value: 'Prefer not to say',
    label: 'Undisclosed',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M5.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      </svg>
    ),
  },
];

export default function GenderTiles({ value = null, onChange, label = 'Gender' }) {
  return (
    <div className="oc-tiles" role="radiogroup" aria-label={label}>
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`oc-tile${selected ? ' is-selected' : ''}`}
            onClick={() => onChange?.(option.value)}
          >
            {option.icon}
            <span className="oc-tile__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
