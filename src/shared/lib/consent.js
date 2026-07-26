/**
 * Cookie consent — canonical server-side contract.
 *
 * Consent used to live in `localStorage` under `pholio_cookie_consent_v1`, set
 * independently by the marketing site and the app. `localStorage` is
 * origin-scoped, so www.pholio.studio and app.pholio.studio each kept their own
 * copy under the same key: two records, no reconciliation, and nothing the
 * server could read — which is why the consent choice gated nothing at all.
 *
 * Consent is now a first-party cookie on the shared `.pholio.studio` scope, the
 * same mechanism the session cookie already uses successfully. That makes one
 * choice authoritative for both surfaces AND readable here, so server-side
 * analytics (public portfolio visitor tracking) can actually honour it.
 *
 * Mirrored by:
 *   - pholio-app/client/src/shared/lib/cookie-consent.js  (React SPA)
 *   - pholio-landing/lib/cookie-consent.ts                (marketing site)
 *   - pholio-app/public/scripts/cookie-consent.js         (EJS portfolio pages)
 * Keep CONSENT_COOKIE, CONSENT_VERSION and the payload shape identical in all four.
 */

const { baseCookieOptions } = require("./cookie-domain");

const CONSENT_COOKIE = "pholio_consent";
const CONSENT_VERSION = 1;

/** Legacy per-origin localStorage key, still read once by clients to migrate. */
const LEGACY_CONSENT_KEY = "pholio_cookie_consent_v1";

const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * @param {string|undefined} raw
 * @returns {{necessary: boolean, analytics: boolean, updatedAt: string|null}|null}
 */
function parseConsent(raw) {
  if (!raw || typeof raw !== "string") return null;

  try {
    // cookie-parser already decodes; decode defensively for direct callers.
    const decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
    const parsed = JSON.parse(decoded);

    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== CONSENT_VERSION) return null;
    if (
      typeof parsed.necessary !== "boolean" ||
      typeof parsed.analytics !== "boolean"
    ) {
      return null;
    }

    return {
      necessary: parsed.necessary,
      analytics: parsed.analytics,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function serializeConsent(consent) {
  return JSON.stringify({
    v: CONSENT_VERSION,
    necessary: true, // strictly-necessary storage is not optional
    analytics: consent.analytics === true,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Cookie attributes for the consent record. Deliberately NOT httpOnly — both
 * surfaces read and write this from client JS.
 */
function consentCookieOptions() {
  return {
    ...baseCookieOptions(),
    httpOnly: false,
    maxAge: CONSENT_MAX_AGE_MS,
  };
}

/** @returns {{necessary,analytics,updatedAt}|null} null == no choice recorded yet */
function readConsent(req) {
  return parseConsent(req?.cookies?.[CONSENT_COOKIE]);
}

/**
 * Has the visitor affirmatively allowed non-essential analytics?
 *
 * Fails closed: no recorded choice means no consent. Callers that track
 * visitors must check this before setting an identifier or writing a row.
 */
function analyticsAllowed(req) {
  const consent = readConsent(req);
  return consent?.analytics === true;
}

function writeConsent(res, consent) {
  res.cookie(CONSENT_COOKIE, serializeConsent(consent), consentCookieOptions());
}

module.exports = {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  CONSENT_MAX_AGE_MS,
  LEGACY_CONSENT_KEY,
  parseConsent,
  serializeConsent,
  consentCookieOptions,
  readConsent,
  analyticsAllowed,
  writeConsent,
};
