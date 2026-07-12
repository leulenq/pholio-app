import React from 'react';
import './FilterChips.css';

/**
 * FilterChips — rectangular filter chips (6px radius, hairline border).
 * Active chip carries a gold border + gold-ghost fill and `aria-pressed`.
 *
 * Counts, when provided, render INLINE inside the chip label ("On file · 14")
 * — never as a separate count bubble.
 *
 * @param {Array<{ key: string, label: string, count?: number }>} options
 * @param {string | string[]} value   Selected key (single) or keys (multiple).
 * @param {(next: string | string[]) => void} onChange
 * @param {boolean} [multiple=false]  Toggle multiple chips instead of one.
 * @param {string} [ariaLabel]        Accessible label for the chip group.
 */
export function FilterChips({
  options = [],
  value,
  onChange,
  multiple = false,
  ariaLabel,
  className = '',
}) {
  const isActive = (key) =>
    multiple ? Array.isArray(value) && value.includes(key) : value === key;

  const activate = (key) => {
    if (typeof onChange !== 'function') return;
    if (multiple) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);
    } else {
      onChange(key);
    }
  };

  return (
    <div className={`ag-chips ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = isActive(opt.key);
        const hasCount = opt.count !== undefined && opt.count !== null;
        return (
          <button
            key={opt.key}
            type="button"
            className={`ag-chip${active ? ' ag-chip--active' : ''}`}
            aria-pressed={active}
            onClick={() => activate(opt.key)}
          >
            <span className="ag-chip-label">{opt.label}</span>
            {hasCount && <span className="ag-chip-count"> · {opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default FilterChips;
