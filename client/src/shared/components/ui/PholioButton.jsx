import React from 'react';
import { Link } from 'react-router-dom';
import './PholioButton.css';

/**
 * PholioButton
 * 
 * Unified button system for Pholio.
 * Based on the refined editorial button language from the Overview page.
 * 
 * @param {string} variant - 'primary' | 'outline' | 'secondary' | 'ghost' |
 *   'inverse' | 'inverse-ghost' | 'danger' | 'danger-ghost' | 'solid'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {string} system - 'legacy' | 'dashboard'
 * @param {boolean} fullWidth - true to expand to 100% width
 * @param {string} className - additional custom classes
 * @param {string} as - element to render as (e.g. 'a', Link)
 */
export default function PholioButton({
  children,
  variant = 'secondary',
  size = 'md',
  system = 'legacy',
  fullWidth = false,
  className = '',
  disabled = false,
  type,
  as,
  to,
  href,
  ...props
}) {
  const isDashboardSystem = system === 'dashboard';
  const classes = [
    'pholio-btn',
    isDashboardSystem ? 'pholio-btn--dashboard' : '',
    isDashboardSystem ? `pholio-btn--dashboard-${variant}` : `pholio-btn--${variant}`,
    isDashboardSystem ? `pholio-btn--dashboard-${size}` : `pholio-btn--${size}`,
    fullWidth ? 'pholio-btn--full' : '',
    className
  ].filter(Boolean).join(' ');

  if (as === 'a' || href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }

  if (as === Link || to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  const Component = as || 'button';

  return (
    <Component
      type={type || (Component === 'button' ? 'button' : undefined)}
      className={classes}
      disabled={disabled}
      {...props}
    >
      {children}
    </Component>
  );
}
