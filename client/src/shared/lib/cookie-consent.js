/**
 * Cookie consent — React SPA client.
 *
 * Mirrors pholio-app/src/shared/lib/consent.js (server),
 * pholio-landing/lib/cookie-consent.ts (marketing site) and
 * pholio-app/public/scripts/cookie-consent.js (EJS portfolio pages).
 * Keep CONSENT_COOKIE, CONSENT_VERSION and the payload shape identical in all four.
 *
 * Consent lives in a cookie on the shared `.pholio.studio` scope rather than in
 * `localStorage`. localStorage is origin-scoped, so the previous implementation
 * kept two unrelated records under one key name — one for www, one for app —
 * and the server could read neither, which is why the choice gated nothing.
 */

export const CONSENT_COOKIE = 'pholio_consent';
export const CONSENT_VERSION = 1;

/** Pre-cookie per-origin key. Read once to migrate, then left alone. */
export const LEGACY_CONSENT_KEY = 'pholio_cookie_consent_v1';

const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Fired on the window whenever consent is written or cleared. */
export const CONSENT_CHANGED_EVENT = 'pholio:consent-changed';

/**
 * Widest scope this cookie may take, derived from the current host so neither
 * repo needs a build-time env var and preview deploys stay isolated.
 * `.pholio.studio` in production (shared with app + www), host-only elsewhere.
 */
function cookieDomain() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host === 'pholio.studio' || host.endsWith('.pholio.studio')) {
    return '.pholio.studio';
  }
  return null;
}

function readRawCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.v !== CONSENT_VERSION) return null;
  if (
    typeof parsed.necessary !== 'boolean' ||
    typeof parsed.analytics !== 'boolean'
  ) {
    return null;
  }
  return {
    necessary: parsed.necessary,
    analytics: parsed.analytics,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
  };
}

/**
 * Pre-cookie consent recorded in this origin's localStorage. Adopted once so
 * existing visitors are not re-prompted by the migration itself.
 */
function readLegacyConsent() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.necessary !== 'boolean' ||
      typeof parsed?.analytics !== 'boolean'
    ) {
      return null;
    }
    return {
      necessary: parsed.necessary,
      analytics: parsed.analytics,
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

/** @returns {{necessary,analytics,updatedAt}|null} null == no choice recorded */
export function getConsent() {
  if (typeof window === 'undefined') return null;

  const raw = readRawCookie(CONSENT_COOKIE);
  if (raw) {
    try {
      const parsed = normalize(JSON.parse(decodeURIComponent(raw)));
      if (parsed) return parsed;
    } catch {
      // fall through to the legacy read
    }
  }

  const legacy = readLegacyConsent();
  if (legacy) {
    // Promote the old per-origin record to the shared cookie so this browser
    // keeps its answer and both surfaces now agree on it.
    writeConsentCookie(legacy);
    return legacy;
  }

  return null;
}

function writeConsentCookie(consent) {
  if (typeof document === 'undefined') return;

  const payload = encodeURIComponent(
    JSON.stringify({
      v: CONSENT_VERSION,
      necessary: true,
      analytics: consent.analytics === true,
      updatedAt: new Date().toISOString(),
    }),
  );

  const domain = cookieDomain();
  const parts = [
    `${CONSENT_COOKIE}=${payload}`,
    'path=/',
    `max-age=${CONSENT_MAX_AGE_SECONDS}`,
    'samesite=lax',
  ];
  if (domain) parts.push(`domain=${domain}`);
  if (window.location.protocol === 'https:') parts.push('secure');

  document.cookie = parts.join('; ');
}

export function setConsent(consent) {
  writeConsentCookie(consent);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
  }
}

/**
 * Withdraw consent — deletes the record so the banner asks again.
 * Withdrawal must be as easy as granting; this is what the "Cookie
 * preferences" control calls.
 */
export function clearConsent() {
  if (typeof document === 'undefined') return;

  const domain = cookieDomain();
  const expire = (withDomain) => {
    const parts = [`${CONSENT_COOKIE}=`, 'path=/', 'max-age=0', 'samesite=lax'];
    if (withDomain) parts.push(`domain=${withDomain}`);
    document.cookie = parts.join('; ');
  };
  expire(domain);
  expire(null); // also clear any host-only copy written before the domain existed

  try {
    window.localStorage.removeItem(LEGACY_CONSENT_KEY);
  } catch {
    // localStorage unavailable (private mode) — the cookie is the record anyway
  }

  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
}

export function analyticsAllowed() {
  return getConsent()?.analytics === true;
}

/** Subscribe to consent changes (including from another tab). */
export function onConsentChange(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
}
