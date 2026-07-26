/**
 * Single source of truth for the cookie scope shared by app.pholio.studio and
 * www.pholio.studio.
 *
 * This was previously inlined in three places (session config in src/app.js,
 * logout in domains/auth/routes/auth.js, and nowhere at all for the consent
 * cookie), which is how the session cookie and the logout clear ended up with
 * different attribute sets.
 */

const config = require("../../config");

function resolveCookieDomain() {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  return config.nodeEnv === "production" ? ".pholio.studio" : "localhost";
}

/**
 * Attributes every first-party Pholio cookie shares. `httpOnly` is deliberately
 * NOT set here — the session cookie needs it, the consent cookie must not have
 * it (both surfaces read consent from JS), so each caller opts in.
 */
function baseCookieOptions() {
  return {
    domain: resolveCookieDomain(),
    path: "/",
    sameSite: "lax",
    secure: config.nodeEnv === "production",
  };
}

/**
 * Attributes required to *delete* a cookie. A deletion only matches when name,
 * domain and path line up, but passing the full attribute set keeps the clear
 * symmetric with the set and avoids browser-specific edge cases.
 */
function clearCookieOptions() {
  return baseCookieOptions();
}

module.exports = {
  resolveCookieDomain,
  baseCookieOptions,
  clearCookieOptions,
};
