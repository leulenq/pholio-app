import './PholioBillingWordmark.css';

/**
 * Code-accurate Pholio wordmark + gold sweep for billing surfaces.
 * Matches Brand Reference / TalentLayout lockup (Noto Serif Display, 0.2em, gold sweep).
 */
export default function PholioBillingWordmark({
  variant = 'on-ink',
  size = 'md',
  className = '',
}) {
  return (
    <div
      className={`ph-billing-wordmark ph-billing-wordmark--${variant} ph-billing-wordmark--${size} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="ph-billing-wordmark__text">PHOLIO</span>
      <span className="ph-billing-wordmark__sweep" />
    </div>
  );
}
