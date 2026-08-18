/**
 * Studio+ checkout jurisdiction gate (NY-first rollout).
 *
 * WHY THIS EXISTS
 * ---------------
 * California regulates anyone who, for compensation, procures or attempts to
 * procure employment or engagements for an artist (Cal. Lab. Code §1700.4:
 * "talent agency"), and §1700.5 requires such a person to be licensed.
 * §1701 et seq. separately governs "advance-fee talent services" — charging a
 * registered fee to an artist — and §1702.1 requires a filed bond and
 * registration before any such fee may be taken. Pholio charges talent (not
 * agencies) for Studio+, which is craft tooling only: comp-card themes,
 * exports, and the talent's own portfolio analytics. Nothing an agency sees or
 * receives changes with payment, and the submission quota is flat and
 * tier-blind — so Pholio's position is that Studio+ is not an advance fee for
 * procurement. That position has not yet been cleared by counsel for
 * California, so until it is, paid checkout is not offered to California
 * requesters. The FREE tier — profile, portfolio, comp card, submissions — is
 * entirely unaffected in every jurisdiction.
 *
 * DESIGN RULES (do not weaken any of these)
 * -----------------------------------------
 * 1. FAIL OPEN. Geolocation is a best-effort, third-party, network-dependent
 *    lookup. A timeout, an API error, a rate limit, an unknown or local IP, or
 *    a missing region MUST allow checkout. A geo outage may never become a
 *    revenue outage, and a false block is a worse harm than a false allow for a
 *    position we believe is defensible anyway.
 * 2. US STATES ONLY. `CA` here is the USPS code for California. In ISO 3166-1
 *    `CA` is CANADA. A match therefore requires country === 'US' AND the
 *    ipapi.co `region_code`/`region` naming California. Canadian requesters are
 *    never blocked.
 * 3. PAID CHECKOUT ONLY. This module is called from exactly one place —
 *    POST /stripe/create-checkout-session. It must never gate signup, login,
 *    submissions, the portfolio, comp cards, or any free surface.
 * 4. HONEST. The blocked response states the fact and its reason. No dark
 *    pattern, no fake waitlist, no "upgrade unavailable in your area" that
 *    implies the user did something wrong.
 */

const { getIPGeolocation } = require("./geolocation");

const DEFAULT_BLOCKED_REGIONS = "CA";

/** Long-form names ipapi.co may return in `region` instead of a code. */
const REGION_NAME_TO_CODE = {
  CALIFORNIA: "CA",
};

/**
 * Loopback / private / link-local addresses can never be geolocated. Short
 * circuit them so local and internal traffic never pays for a doomed 5-second
 * ipapi round trip (and so tests never touch the network).
 *
 * @param {string} ip
 * @returns {boolean}
 */
function isNonRoutableIp(ip) {
  const value = String(ip || "").trim().toLowerCase().replace(/^::ffff:/, "");
  if (!value) return true;
  if (value === "localhost" || value === "::1" || value === "::") return true;
  if (/^127\./.test(value)) return true;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
  if (/^169\.254\./.test(value)) return true;
  if (/^(fc|fd|fe80)/.test(value)) return true;
  return false;
}

/**
 * Blocked US state codes, from STUDIO_BLOCKED_REGIONS.
 * Empty string disables the fence entirely; unset uses the default ("CA").
 *
 * Read per call (not cached at module load) so tests and runtime config
 * changes take effect without a restart.
 *
 * @returns {Set<string>} uppercase USPS state codes
 */
function getBlockedRegions() {
  const raw =
    process.env.STUDIO_BLOCKED_REGIONS === undefined
      ? DEFAULT_BLOCKED_REGIONS
      : process.env.STUDIO_BLOCKED_REGIONS;

  return new Set(
    String(raw)
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * Normalize whatever ipapi.co gave us into a USPS state code.
 * `region_code` is authoritative; `region` (full name) is the fallback.
 *
 * @param {Object|null} geo
 * @returns {string|null}
 */
function resolveRegionCode(geo) {
  const code = String(geo?.region_code || "").trim().toUpperCase();
  if (code) return code;

  const name = String(geo?.region || "").trim().toUpperCase();
  if (!name) return null;
  if (REGION_NAME_TO_CODE[name]) return REGION_NAME_TO_CODE[name];
  // Two-letter `region` values are already codes on some ipapi responses.
  return /^[A-Z]{2}$/.test(name) ? name : null;
}

/**
 * The user-facing refusal. Stated as a fact about Pholio, not about the user.
 * @param {string} regionCode
 */
function blockedMessage(regionCode) {
  const place = regionCode === "CA" ? "California" : `your state (${regionCode})`;
  return (
    `Studio+ subscriptions aren't offered in ${place} yet — legal review of ` +
    "California's talent-services rules is still pending, so we've held the " +
    "paid tier back rather than sell into it. Nothing else changes: your " +
    "profile, portfolio, comp card, and agency submissions are free and stay " +
    "fully available."
  );
}

/**
 * Decide whether a checkout request may proceed.
 *
 * ALWAYS returns a decision object; never throws. Any failure path resolves to
 * `{ allowed: true }` (rule 1: fail open).
 *
 * @param {string|null} ipAddress - requester IP (req.clientIp)
 * @param {Object} [deps] - injection seam for tests
 * @param {Function} [deps.lookup] - getIPGeolocation replacement
 * @returns {Promise<{allowed: boolean, reason: string, regionCode?: string, message?: string}>}
 */
async function evaluateCheckoutJurisdiction(ipAddress, deps = {}) {
  const blocked = getBlockedRegions();
  if (blocked.size === 0) {
    return { allowed: true, reason: "fence_disabled" };
  }

  if (!ipAddress || isNonRoutableIp(ipAddress)) {
    return { allowed: true, reason: "no_ip" };
  }

  const lookup = deps.lookup || getIPGeolocation;

  let geo = null;
  try {
    geo = await lookup(ipAddress);
  } catch (error) {
    // getIPGeolocation already swallows its own errors, but a caller-supplied
    // lookup (or a future rewrite) might throw. Fail open, loudly in logs.
    console.warn(
      "[CheckoutJurisdiction] Geolocation lookup threw — allowing checkout (fail open):",
      error.message,
    );
    return { allowed: true, reason: "lookup_error" };
  }

  // null covers: localhost, timeout, non-200, ipapi error payload, no country.
  if (!geo) {
    return { allowed: true, reason: "lookup_unavailable" };
  }

  const country = String(geo.country || "").trim().toUpperCase();
  if (country !== "US") {
    // Rule 2: the blocked list is US states. A Canadian requester has
    // country 'CA' and must NOT be confused with California.
    return { allowed: true, reason: "non_us" };
  }

  const regionCode = resolveRegionCode(geo);
  if (!regionCode) {
    return { allowed: true, reason: "unknown_region" };
  }

  if (!blocked.has(regionCode)) {
    return { allowed: true, reason: "region_allowed", regionCode };
  }

  return {
    allowed: false,
    reason: "region_blocked",
    regionCode,
    message: blockedMessage(regionCode),
  };
}

module.exports = {
  evaluateCheckoutJurisdiction,
  getBlockedRegions,
  resolveRegionCode,
  isNonRoutableIp,
  blockedMessage,
  DEFAULT_BLOCKED_REGIONS,
};
