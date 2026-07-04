import { MARKETING_SITE_URL } from '../lib/logout';
import './LegalNoticeLine.css';

/**
 * Quiet legal colophon shown beneath auth actions (signup + login).
 * Behaves like a colophon, not a form field — never blocks, never toasts.
 * 11px sans, white/40, muted-gold links that underline on hover only.
 */
export default function LegalNoticeLine({ className = '' }) {
  return (
    <p className={`legal-notice-line ${className}`.trim()}>
      By continuing, you agree to the{' '}
      <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
        Terms
      </a>
      ,{' '}
      <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
        Privacy Policy
      </a>
      , and{' '}
      <a href={`${MARKETING_SITE_URL}/ai-notice`} target="_blank" rel="noopener noreferrer">
        AI Notice
      </a>
      .
    </p>
  );
}
