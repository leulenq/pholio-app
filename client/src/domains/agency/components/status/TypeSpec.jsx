import React from 'react';
import { getType } from './statusConfig';
import './status-system.css';

/**
 * TypeSpec — Type (a market descriptor). The lightest status form: tracked
 * capitals over a fine pigment rule, set like a spec on the back of a comp
 * card. Several sit together without competing.
 *
 * @param {string} type - archetype/market key (editorial, commercial, runway…)
 */
export function TypeSpec({ type }) {
  if (!type) return null;
  const t = getType(type);
  return (
    <span className="ss-spec" style={{ '--c': t.c }}>
      <span className="ss-spec__label">{t.label}</span>
      <span className="ss-spec__rule" aria-hidden="true" />
    </span>
  );
}

export default TypeSpec;
