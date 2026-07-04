/**
 * Pholio Email — Public base-URL resolution.
 *
 * Replicates the link-resolution contract the rest of the app depends on
 * (guardian-consent.js imports getEmailAppBaseUrl) so the new email system is a
 * true drop-in for the legacy module. Same env precedence, same production
 * fallbacks — emails always resolve to a real, absolute, https URL.
 */

const PRODUCTION_APP_URL = "https://app.pholio.studio";
const PRODUCTION_MARKETING_URL = "https://www.pholio.studio";

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function pickPublicBaseUrl(candidates, fallback) {
  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(candidate);
    if (normalized) return normalized;
  }
  return fallback;
}

/** App (dashboard) base URL for CTAs and the masthead link. */
function getEmailAppBaseUrl() {
  return pickPublicBaseUrl(
    [
      process.env.EMAIL_APP_URL,
      process.env.APP_URL,
      process.env.BASE_URL,
      process.env.URL,
      process.env.DEPLOY_PRIME_URL,
    ],
    PRODUCTION_APP_URL,
  );
}

/** Marketing site base URL for legal docs / public pages in emails. */
function getMarketingSiteUrl() {
  return pickPublicBaseUrl(
    [process.env.EMAIL_MARKETING_SITE_URL, process.env.MARKETING_SITE_URL],
    PRODUCTION_MARKETING_URL,
  );
}

module.exports = {
  PRODUCTION_APP_URL,
  PRODUCTION_MARKETING_URL,
  normalizeBaseUrl,
  pickPublicBaseUrl,
  getEmailAppBaseUrl,
  getMarketingSiteUrl,
};
