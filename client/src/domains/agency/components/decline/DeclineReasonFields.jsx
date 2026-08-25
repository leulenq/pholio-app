import React, { useId, useMemo } from 'react';
import './DeclineReasonFields.css';

/**
 * The templated decline reason picker's guts — a radio list sourced from
 * `GET /api/agency/decline-reasons` (see `useDeclineReasons`) plus a preview
 * of the exact sentence the talent will read.
 *
 * Deliberately just fields, not a modal: both the review room's decision
 * confirmation and the standalone decline modal embed this so the picker
 * behaves identically everywhere a reviewer can decline.
 *
 * "No reason" always sits first and is the default — declining without one
 * is a first-class outcome (services/decline-reasons.js), never a dead end
 * behind an extra click.
 */
export function DeclineReasonFields({
  reasons = [],
  isLoading = false,
  isError = false,
  value = '',
  onChange,
  disabled = false,
  name,
}) {
  const generatedName = useId();
  const groupName = name || generatedName;

  const selected = useMemo(
    () => reasons.find((r) => r.id === value) || null,
    [reasons, value],
  );

  return (
    <div className="drf">
      <fieldset className="drf-fieldset">
        <legend className="drf-legend">Reason (optional)</legend>
        <div className="drf-list">
          <label className={`drf-option${value === '' ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={groupName}
              value=""
              checked={value === ''}
              onChange={() => onChange?.('')}
              disabled={disabled}
            />
            <span className="drf-option-text">
              <span className="drf-option-name">No reason</span>
              <span className="drf-option-sub">The talent sees a plain decline, nothing more</span>
            </span>
          </label>

          {!isLoading && !isError && reasons.map((r) => (
            <label key={r.id} className={`drf-option${value === r.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name={groupName}
                value={r.id}
                checked={value === r.id}
                onChange={() => onChange?.(r.id)}
                disabled={disabled}
              />
              <span className="drf-option-text">
                <span className="drf-option-name">{r.label}</span>
              </span>
            </label>
          ))}

          {isLoading && <p className="drf-status">Loading reasons…</p>}
          {isError && (
            <p className="drf-status">
              The reason list isn&rsquo;t available right now — you can still decline without one.
            </p>
          )}
        </div>
      </fieldset>

      {selected && (
        <div className="drf-preview">
          <p className="drf-preview-label">What the talent will read</p>
          <p className="drf-preview-text">{selected.talentMessage}</p>
        </div>
      )}
    </div>
  );
}

export default DeclineReasonFields;
