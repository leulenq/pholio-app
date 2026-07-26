import React from 'react';
import { Check } from 'lucide-react';

/**
 * One ruled, selectable row — the single selection affordance for this flow.
 *
 * Boards, agency type, roster path, and the open-call choice all use it, so the
 * paper reads as one list vocabulary rather than a mix of checkboxes, chips,
 * and dropdowns. A real input carries the semantics; the row is its label.
 */
export default function OptionRow({
  type = 'checkbox',
  name,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}) {
  return (
    <label className={`stg-row${checked ? ' is-selected' : ''}`}>
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="stg-row__text">
        <span className="stg-row__label">{label}</span>
        {hint ? <span className="stg-row__hint">{hint}</span> : null}
      </span>
      <span className="stg-row__mark" aria-hidden="true">
        <Check size={13} strokeWidth={2.5} />
      </span>
    </label>
  );
}
