import React from 'react';
import './ColorSelect.css';

/**
 * ColorSelect — single-select colour tiles for the casting fitting (hair / eyes).
 * Reuses the GenderTiles selection language: hairline frame, gold active state,
 * keyboard-operable radiogroup. Each tile pairs a material swatch with its name
 * (the swatch stands in for the gender icon). No badges, no glass — banned here.
 *
 * @param {{ value:string, swatch?:string|null }[]} options  Tile options.
 * @param {string|null} value                One option value, or null.
 * @param {Function}    onChange(value)      Called with the chosen value.
 * @param {string}      ariaLabel            Group label for assistive tech.
 * @param {boolean}    [disabled=false]
 */
export default function ColorSelect({ options, value = null, onChange, ariaLabel, disabled = false }) {
  return (
    <div className="color-select" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.value}
            className={`color-tile${selected ? ' is-selected' : ''}`}
            onClick={() => !disabled && onChange?.(o.value)}
            disabled={disabled}
          >
            <span
              className={`color-swatch${o.swatch ? '' : ' color-swatch--other'}`}
              style={o.swatch ? { background: o.swatch } : undefined}
              aria-hidden="true"
            />
            <span className="color-tile-label">{o.value}</span>
          </button>
        );
      })}
    </div>
  );
}
