import React from 'react';
import { DivisionMark } from './DivisionMark';

/**
 * BoardPlate — deprecated. Use <DivisionMark> directly.
 *
 * Superseded by the division system (divisions.js + DivisionMark), which adds
 * the full board taxonomy, a standing axis, a never-null resolver for
 * agency-authored board names, and an accessible name. Kept as a thin adapter
 * so existing call sites keep working.
 *
 * The old markup set the board name in the display serif, which the agency
 * design system forbids in dense controls; delegating fixes that too.
 *
 * @deprecated
 */
export function BoardPlate({ division, count, compact = false }) {
  return (
    <DivisionMark
      division={division}
      standing="active"
      count={count}
      codeOnly={compact}
      size={compact ? 'sm' : 'md'}
    />
  );
}

export default BoardPlate;
