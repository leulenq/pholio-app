import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useCardButton } from '../../hooks/useCardButton';
import { StatusText } from './StatusText';
import './AgencyRow.css';

/**
 * AgencyRow — the canonical 56px list row (44px `compact`).
 *
 * Layout: [checkbox?] · 40px photo (4px radius) · name (Inter 600) + meta line
 * · trailing (status text + chevron).
 *
 * States:
 * - Hover: surface-hover tint. No translateY lift (that is talent vocabulary).
 * - Selected: 2px gold FULL inset ring (never a side-stripe).
 * - Keyboard: when `onOpen` is provided the row becomes a role="button" with
 *   Enter/Space activation via useCardButton.
 *
 * No corner chips. Status renders as plain text (StatusText or `statusLabel`).
 *
 * @param {string} name
 * @param {React.ReactNode} [meta]        Secondary meta line.
 * @param {string} [photoUrl]
 * @param {string} [photoAlt]             Defaults to `name`.
 * @param {string} [status]              Status key → StatusText.
 * @param {string} [statusLabel]         Plain trailing text (used if no status).
 * @param {React.ReactNode} [trailing]   Custom trailing content (overrides status).
 * @param {(e: Event) => void} [onOpen]  Makes the row keyboard-activatable.
 * @param {boolean} [selected=false]
 * @param {boolean} [compact=false]      44px variant.
 * @param {boolean} [disabled=false]
 * @param {boolean} [selectable=false]   Renders leading checkbox slot.
 * @param {boolean} [checked=false]
 * @param {(checked: boolean) => void} [onCheckedChange]
 * @param {boolean} [showChevron=true]   Trailing chevron affordance when interactive.
 */
export function AgencyRow({
  name,
  meta,
  photoUrl,
  photoAlt,
  status,
  statusLabel,
  trailing,
  onOpen,
  selected = false,
  compact = false,
  disabled = false,
  selectable = false,
  checked = false,
  onCheckedChange,
  showChevron = true,
  className = '',
  ...props
}) {
  const interactive = typeof onOpen === 'function' && !disabled;
  const buttonProps = useCardButton(interactive ? onOpen : undefined, { disabled });

  const handleClick = (event) => {
    if (!interactive) return;
    onOpen(event);
  };

  const classes = [
    'ag-row',
    compact ? 'ag-row--compact' : '',
    selected ? 'ag-row--selected' : '',
    interactive ? 'ag-row--interactive' : '',
    disabled ? 'ag-row--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  let trailingContent = trailing;
  if (trailingContent === undefined) {
    if (status) trailingContent = <StatusText status={status} />;
    else if (statusLabel) trailingContent = <span className="ag-row-status-text">{statusLabel}</span>;
    else trailingContent = null;
  }

  return (
    <div
      className={classes}
      onClick={interactive ? handleClick : undefined}
      aria-selected={selected || undefined}
      {...(interactive ? buttonProps : {})}
      {...props}
    >
      {selectable && (
        // Stop propagation so toggling the checkbox never opens the row.
        <span className="ag-row-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            aria-label={name ? `Select ${name}` : 'Select row'}
          />
        </span>
      )}

      <span className="ag-row-photo">
        {photoUrl ? (
          <img src={photoUrl} alt={photoAlt ?? name ?? ''} loading="lazy" />
        ) : (
          <span className="ag-row-photo-fallback" aria-hidden="true">
            {name ? name.trim().charAt(0).toUpperCase() : ''}
          </span>
        )}
      </span>

      <span className="ag-row-main">
        <span className="ag-row-name">{name}</span>
        {meta ? <span className="ag-row-meta">{meta}</span> : null}
      </span>

      <span className="ag-row-trailing">
        {trailingContent}
        {showChevron && interactive ? (
          <ChevronRight className="ag-row-chevron" size={16} aria-hidden="true" />
        ) : null}
      </span>
    </div>
  );
}

export default AgencyRow;
