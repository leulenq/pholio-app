import React from 'react';
import { Link } from 'react-router-dom';
import './PholioButton.css';

const BUTTON_VARIANTS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'meta',
  'icon',
  'destructive',
  'toggle',
  'ai',
]);

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

function normalizeVariant(variant) {
  return BUTTON_VARIANTS.has(variant) ? variant : 'secondary';
}

function renderButtonContent(children, variant, icon) {
  // A caller-supplied mark replaces the variant's built-in one, so a control can
  // carry the house spark (or any other glyph) without forking the variant.
  if (icon) {
    return (
      <>
        {icon}
        <span>{children}</span>
      </>
    );
  }
  if (variant === 'ai') {
    return (
      <>
        <svg 
          viewBox="0 0 24 24" 
          width="13" 
          height="13" 
          className="pholio-btn-ai-flare-icon" 
          style={{ 
            fill: 'var(--ph-btn-gold-warm)', 
            marginRight: '6px',
            display: 'inline-block', 
            verticalAlign: 'middle',
            transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <path d="M 12 2 C 12 10, 8 12, 12 22 C 12 14, 16 12, 12 2 Z" />
        </svg>
        <span>{children}</span>
      </>
    );
  }
  return children;
}

/**
 * Canonical talent button primitive.
 *
 * Roles come directly from button-audit.html:
 * primary commit, secondary alternative, tertiary quiet action, meta/inline
 * action, icon action, destructive action, and toggle item.
 */
const PholioButton = React.forwardRef(function PholioButton({
  children,
  variant = 'secondary',
  tone = 'light',
  fullWidth = false,
  className = '',
  disabled = false,
  loading = false,
  icon = null,
  type,
  as,
  to,
  href,
  tabIndex,
  onClick,
  ...props
}, ref) {
  const resolvedVariant = normalizeVariant(variant);
  const isDisabled = disabled || loading;
  const classes = cx(
    'pholio-btn',
    `pholio-btn--${resolvedVariant}`,
    tone === 'dark' && 'pholio-btn--tone-dark',
    fullWidth && 'pholio-btn--full',
    loading && 'is-loading',
    className,
  );

  const handleClick = (event) => {
    if (isDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const sharedProps = {
    ...props,
    ref,
    className: classes,
    'aria-busy': loading || undefined,
    onClick: handleClick,
  };

  const content = renderButtonContent(children, resolvedVariant, icon);

  if (as === 'a' || href) {
    return (
      <a
        href={isDisabled ? undefined : href}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : tabIndex}
        {...sharedProps}
      >
        {content}
      </a>
    );
  }

  if (as === Link || to) {
    return (
      <Link
        to={isDisabled ? '#' : to}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : tabIndex}
        {...sharedProps}
      >
        {content}
      </Link>
    );
  }

  const Component = as || 'button';

  return (
    <Component
      type={type || 'button'}
      disabled={isDisabled}
      {...sharedProps}
    >
      {content}
    </Component>
  );
});

export default PholioButton;

export const PholioIconButton = React.forwardRef(function PholioIconButton({
  label,
  danger = false,
  className = '',
  children,
  ...props
}, ref) {
  return (
    <PholioButton
      ref={ref}
      variant="icon"
      aria-label={label}
      className={cx(danger && 'pholio-btn--icon-danger', className)}
      {...props}
    >
      {children}
    </PholioButton>
  );
});

export function PholioToggleGroup({
  children,
  className = '',
  tone = 'light',
  role = 'group',
  onKeyDown,
  ...props
}) {
  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(
      event.currentTarget.querySelectorAll(
        '[data-pholio-toggle]:not(:disabled):not([aria-disabled="true"])',
      ),
    );
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1 + items.length) % items.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (nextIndex < 0) nextIndex = 0;

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div
      className={cx(
        'pholio-toggle-group',
        tone === 'dark' && 'pholio-toggle-group--tone-dark',
        className,
      )}
      role={role}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </div>
  );
}

export function PholioToggleButton({
  active = false,
  className = '',
  children,
  ...props
}) {
  const stateProps = props.role
    ? {}
    : { 'aria-pressed': props['aria-pressed'] ?? active };

  return (
    <PholioButton
      variant="toggle"
      className={cx(active && 'is-active', className)}
      data-pholio-toggle
      {...stateProps}
      {...props}
    >
      {children}
    </PholioButton>
  );
}
