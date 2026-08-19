import React from 'react';

/**
 * An attestation, rendered as the statement itself.
 *
 * The applicant affirms a full sentence set in the display serif, and the
 * sentence lights gold once they have. Deliberately not a tiny checkbox row and
 * deliberately not a badge: on an anonymous flow the 18+ attestation is the one
 * hard eligibility rule (ruling R8), and a control small enough to tick without
 * reading is a control nobody read.
 *
 * @param {string}   statement  The sentence being affirmed, in full.
 * @param {string}   [aside]    Quieter consequence line under it.
 * @param {boolean}  affirmed
 * @param {Function} onToggle   Receives the next boolean.
 */
export default function AttestationStatement({ statement, aside, affirmed, onToggle }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={affirmed === true}
      className={`oc-attest${affirmed ? ' is-affirmed' : ''}`}
      onClick={() => onToggle?.(!affirmed)}
    >
      {statement}
      {aside ? <span className="oc-attest__aside">{aside}</span> : null}
    </button>
  );
}
