import { MARKETING_SITE_URL } from '../lib/logout';

const linkClass =
  'text-[#8a7040] font-medium hover:text-[#C9A55A] transition-colors duration-200 underline-offset-2 hover:underline';

/**
 * Clickwrap checkbox for Terms + Privacy acceptance at signup.
 */
export function LegalAcceptanceField({ checked, onChange, disabled = false, className = '' }) {
  return (
    <label
      className={`flex items-start gap-3 text-left cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-transparent accent-[#C9A55A] focus:ring-[#C9A55A]/40 focus:ring-offset-0"
        aria-required="true"
      />
      <span className="text-xs text-white/50 font-sans tracking-wide leading-relaxed group-hover:text-white/60 transition-colors">
        I agree to the{' '}
        <a
          href={`${MARKETING_SITE_URL}/terms`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          Terms of Service
        </a>
        ,{' '}
        <a
          href={`${MARKETING_SITE_URL}/privacy`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          Privacy Policy
        </a>
        , and{' '}
        <a
          href={`${MARKETING_SITE_URL}/ai-notice`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          AI Notice
        </a>
        .
      </span>
    </label>
  );
}

export function legalAcceptancePayload(accepted) {
  return {
    terms_accepted: accepted,
    privacy_accepted: accepted,
  };
}
