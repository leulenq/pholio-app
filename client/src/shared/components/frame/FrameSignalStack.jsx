import React from 'react';
import { surfacePrefix, signalClass } from './frameSurface';
import './FrameTaxonomy.css';

/**
 * Linked editorial chips: framing · use · register, plus optional PITS signal row.
 */
export default function FrameSignalStack({
  parts = [],
  signalParts = [],
  surface = 'frame',
  hint = null,
  className = '',
}) {
  const prefix = surfacePrefix(surface);
  const hasPrimary = parts.length > 0;
  const hasSignals = signalParts.length > 0;

  if (!hasPrimary && !hasSignals && !hint) return null;

  return (
    <span className={`frame-read-caption ${className}`.trim()}>
      {hasPrimary ? (
        <span className={`${prefix}-read-signals`} aria-label="Frame type">
          {parts.map((part) => (
            <span
              key={`${part.key}-${part.slug}`}
              className={signalClass(prefix, part.key)}
            >
              {part.label}
            </span>
          ))}
        </span>
      ) : null}

      {hasSignals ? (
        <span className={`${prefix}-read-signals frame-read-signals--secondary`} aria-label="Frame signals">
          {signalParts.map((part) => (
            <span
              key={`${part.key}-${part.slug}`}
              className={signalClass(prefix, part.key)}
            >
              {part.label}
            </span>
          ))}
        </span>
      ) : null}

      {hint ? <span className="frame-read-hint">{hint}</span> : null}
    </span>
  );
}
