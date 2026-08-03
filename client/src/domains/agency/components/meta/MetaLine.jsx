import React from 'react';
import './meta-system.css';

/**
 * MetaLine — the canonical secondary line under a name.
 *
 * Replaces `[a, b, c].filter(Boolean).join(' · ')`, which was hand-rolled in
 * about twenty files. As a string join, the separator inherits the colour and
 * weight of whatever it lands in, so the dot competed with the content in
 * some rows and vanished in others; there was also no way to let the line
 * truncate without cutting a separator in half.
 *
 * Here the separator is a real element: one colour everywhere, quieter than
 * the values it divides, hidden from the accessibility tree (a screen reader
 * announcing "Editorial middot Copenhagen middot 6d ago" is noise), and
 * dropped automatically around empty children so a missing city cannot
 * produce a leading dot.
 *
 * @param {'sm'|'md'} [size]
 * @param {boolean} [onDark] Lighten for dark grounds; cascades to children.
 * @param {boolean} [wrap]  Allow wrapping instead of truncating. Off by
 *                          default — in a table row, truncation is correct.
 */
export function MetaLine({
  children,
  size = 'md',
  wrap = false,
  onDark = false,
  className = '',
  ...rest
}) {
  /* Nullish children are the normal case: callers pass `city && <Place …/>`.
     Filtering here is what lets them stay declarative. */
  const items = React.Children.toArray(children).filter(
    (child) => child !== null && child !== undefined && child !== false && child !== '',
  );
  if (items.length === 0) return null;

  const classes = [
    'ml',
    size !== 'md' && `ml--${size}`,
    wrap && 'ml--wrap',
    onDark && 'meta--onDark',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {items.map((child, i) => (
        /* Index keys are correct here: the list is positional, has no
           identity of its own, and is re-rendered whole. */
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="ml__sep" aria-hidden="true">
              ·
            </span>
          )}
          <span className="ml__item">{child}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

export default MetaLine;
