/**
 * Phone helpers: normalize digits (and optional leading +) without losing dialable info;
 * display formatting is cosmetic and reversible via normalizePhoneInput.
 */

const DIGITS_ONLY = /[^\d]/g;

/**
 * @param {string | null | undefined} raw
 * @returns {string} Leading + only if present in input; otherwise digits only. Empty string if no digits.
 */
export function normalizePhoneInput(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(DIGITS_ONLY, '');
  if (!digits) return hasPlus ? '+' : '';

  return hasPlus ? `+${digits}` : digits;
}

/**
 * US 10-digit national number (no country code); extra digits appended without stripping.
 * @param {string} digits
 */
function formatUsNational(digits) {
  const core = digits.slice(0, 10);
  const extra = digits.slice(10);
  let base;
  if (core.length <= 3) base = `(${core}`;
  else if (core.length <= 6) base = `(${core.slice(0, 3)}) ${core.slice(3)}`;
  else base = `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6, 10)}`;
  return extra ? `${base} ${extra}`.trim() : base;
}

/**
 * +1 NANP: show as +1 (XXX) XXX-XXXX when enough digits.
 * @param {string} digitsAfterPlus digits only after stripping +
 */
function formatNanpInternational(digitsAfterPlus) {
  const rest = digitsAfterPlus.slice(1);
  if (rest.length === 0) return '+1';
  return `+1 ${formatUsNational(rest)}`.replace(/\s+$/, '');
}

/**
 * Loose international grouping: + then clusters of 2–4 digits for readability.
 * @param {string} digitsAfterPlus
 */
function formatInternationalLoose(digitsAfterPlus) {
  if (!digitsAfterPlus) return '+';
  const chunks = [];
  let i = 0;
  const lens = [3, 3, 4, 4, 4];
  for (const len of lens) {
    if (i >= digitsAfterPlus.length) break;
    chunks.push(digitsAfterPlus.slice(i, i + len));
    i += len;
  }
  if (i < digitsAfterPlus.length) chunks.push(digitsAfterPlus.slice(i));
  return `+${chunks.join(' ')}`.trim();
}

/**
 * Pretty-print for UI. Pass normalized or raw user string; internally normalizes first
 * so display matches stored value.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function formatPhoneDisplay(raw) {
  const normalized = normalizePhoneInput(raw);
  if (!normalized || normalized === '+') return normalized === '+' ? '+' : '';

  if (normalized.startsWith('+')) {
    const body = normalized.slice(1);
    if (body.startsWith('1') && body.length >= 2) {
      return formatNanpInternational(body);
    }
    return formatInternationalLoose(body);
  }

  if (normalized.length === 11 && normalized.startsWith('1')) {
    return formatNanpInternational(normalized);
  }

  if (normalized.length <= 10) {
    return formatUsNational(normalized);
  }

  return normalized;
}
