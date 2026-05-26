import React from 'react';
import { Sparkles } from 'lucide-react';
import './TierBadge.css';

/**
 * TierBadge — Reusable pricing tier tag for Pholio.
 *
 * @param {'free' | 'studio' | 'studio-solid'} tier
 *   - `free`          — Muted slate badge for free-tier users
 *   - `studio`        — Gold gradient badge with shimmer (light backgrounds)
 *   - `studio-solid`  — Solid gold badge (dark backgrounds)
 * @param {'sm' | 'md' | 'lg'} [size='sm'] — Badge scale
 * @param {boolean} [showDot=false] — Render a status dot instead of an icon
 * @param {boolean} [showIcon=true] — Render a sparkle icon (Studio+ only)
 * @param {string} [className] — Additional CSS classes
 * @param {object} [props] — Forwarded to the wrapper span
 *
 * @example
 *   <TierBadge tier="free" />
 *   <TierBadge tier="studio" size="md" />
 *   <TierBadge tier="studio-solid" size="lg" showDot />
 */
export default function TierBadge({
  tier = 'free',
  size = 'sm',
  showDot = false,
  showIcon = true,
  className = '',
  ...props
}) {
  const isStudio = tier === 'studio' || tier === 'studio-solid';
  const label = isStudio ? 'Studio+' : 'Free';

  // Map tier value → CSS modifier class
  const variantClass = {
    free: 'tier-tag--free',
    studio: 'tier-tag--studio',
    'studio-solid': 'tier-tag--studio-solid',
  }[tier] || 'tier-tag--free';

  const sizeClass = size !== 'sm' ? `tier-tag--${size}` : '';

  // Icon sizing per badge size
  const iconSize = { sm: 10, md: 11, lg: 12 }[size] || 10;

  return (
    <span
      className={`tier-tag ${variantClass} ${sizeClass} ${className}`.trim()}
      aria-label={`${label} tier`}
      {...props}
    >
      {showDot && <span className="tier-tag__dot" aria-hidden />}
      {!showDot && isStudio && showIcon && (
        <span className="tier-tag__icon" aria-hidden>
          <Sparkles size={iconSize} strokeWidth={2.25} />
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}

/**
 * Convenience wrapper — determines badge from subscription data.
 *
 * @param {{ isPro?: boolean }} subscription
 * @param {object} [rest] — Forwarded props to TierBadge
 *
 * @example
 *   <TierBadgeFromSubscription subscription={subscription} size="md" />
 */
export function TierBadgeFromSubscription({ subscription, ...rest }) {
  const tier = subscription?.isPro ? 'studio' : 'free';
  return <TierBadge tier={tier} {...rest} />;
}
