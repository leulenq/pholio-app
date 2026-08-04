import React from 'react';
import { placeParts } from './metaFormat';
import './meta-system.css';

/**
 * Place — where a talent is based, or where something happens.
 *
 * Shows the CITY by default. `profiles.city` is one free-text column holding
 * whatever was typed at onboarding — "Copenhagen, Denmark", "Los Angeles,
 * CA" — and in a roster row the country is noise that pushes real signal out
 * of the row. The full stored string stays on the title attribute, so the
 * detail is one hover away rather than lost.
 *
 * Pass `full` on the surfaces where the region genuinely matters: a talent's
 * record panel, an interview address, anywhere a booker is deciding about
 * travel or work eligibility rather than scanning.
 *
 * No pin icon by default. An icon on every location line in a dense table is
 * ornament repeated a hundred times; `icon` is opt-in for the cases where a
 * line would otherwise be ambiguous (an interview row carrying both a time
 * and a venue).
 *
 * @param {string} value       Stored location string.
 * @param {boolean} [full]     Render city AND region.
 * @param {React.ReactNode} [icon]
 * @param {'sm'|'md'} [size]
 * @param {boolean} [onDark] Lighten for dark grounds.
 */
export function Place({
  value,
  full = false,
  icon,
  size = 'md',
  onDark = false,
  className = '',
  ...rest
}) {
  const parts = placeParts(value);
  if (!parts) return null;

  const text = full && parts.region ? `${parts.city}, ${parts.region}` : parts.city;
  const classes = ['mp', size !== 'md' && `mp--${size}`, onDark && 'meta--onDark', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      /* Only worth a tooltip when it is actually hiding something. */
      {...(text !== parts.full ? { title: parts.full } : {})}
      {...rest}
    >
      {icon && (
        <span className="mp__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="mp__text">{text}</span>
    </span>
  );
}

export default Place;
