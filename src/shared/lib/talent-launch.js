"use strict";

/**
 * Talent launch gate — when talent can sign up and use the product.
 *
 * Until TALENT_LAUNCH_AT, talent cannot create an account, sign in, or reach
 * any talent surface. Agencies are untouched: they are provisioned through the
 * reviewed request flow on pholio-site and keep full access.
 *
 * The marketing site's pre-launch CTAs point at a notify page that collects an
 * email (POST /api/public/launch-notifications); anyone the app turns away is
 * sent there too, so the two sides agree on one destination.
 *
 * Who gets through early, decided at login and cached on the session as
 * `talentLaunchAccess`:
 *   - platform staff (an ACTIVE platform_admins row), who sign in as TALENT;
 *   - a browser that opened the preview link (GET /api/public/talent-launch/preview?key=…)
 *     with TALENT_LAUNCH_PREVIEW_KEY. The flag survives login's session regenerate.
 *
 * Configuration:
 *   TALENT_LAUNCH_AT           ISO timestamp. Gate is closed before it, open after.
 *                              Set "open" to open immediately, "closed" to hold.
 *   TALENT_LAUNCH_PREVIEW_KEY  Shared secret for the preview link. Unset = no preview link.
 *
 * Unset TALENT_LAUNCH_AT falls back to DEFAULT_LAUNCH_AT in production only, so
 * a forgotten env var cannot open the product early; dev and test stay open.
 */

const crypto = require("crypto");

/** Midnight at the start of 31 October 2026, US Eastern. */
const DEFAULT_LAUNCH_AT = "2026-10-31T00:00:00-04:00";

const LAUNCH_PENDING_ERROR = "TALENT_LAUNCH_PENDING";

function marketingOrigin() {
  return String(process.env.MARKETING_SITE_URL || "https://www.pholio.studio").replace(/\/+$/, "");
}

/** Where everyone the gate turns away is sent. Lives on pholio-site. */
function launchNotifyUrl() {
  return `${marketingOrigin()}/opening`;
}

/** The launch instant, `null` when there is no gate (open), or `Infinity` when held closed. */
function talentLaunchAt(env = process.env) {
  const raw = String(env.TALENT_LAUNCH_AT || "").trim();
  if (raw.toLowerCase() === "open") return null;
  if (raw.toLowerCase() === "closed") return Infinity;
  if (raw) {
    const at = Date.parse(raw);
    // An unparseable value holds the gate closed rather than opening it.
    return Number.isNaN(at) ? Infinity : at;
  }
  return env.NODE_ENV === "production" ? Date.parse(DEFAULT_LAUNCH_AT) : null;
}

function isTalentLaunchOpen(now = Date.now(), env = process.env) {
  const at = talentLaunchAt(env);
  return at === null || now >= at;
}

/** Public, cache-safe description of the gate for the SPA and pholio-site. */
function talentLaunchStatus(now = Date.now(), env = process.env) {
  const at = talentLaunchAt(env);
  return {
    open: isTalentLaunchOpen(now, env),
    launchAt: at === null || at === Infinity ? null : new Date(at).toISOString(),
    notifyUrl: launchNotifyUrl(),
  };
}

function previewKeyMatches(candidate, env = process.env) {
  const key = String(env.TALENT_LAUNCH_PREVIEW_KEY || "");
  if (!key || typeof candidate !== "string" || !candidate) return false;
  const a = crypto.createHash("sha256").update(key).digest();
  const b = crypto.createHash("sha256").update(candidate).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Whether this session may use talent surfaces right now. */
function sessionHasTalentAccess(session, now = Date.now()) {
  return isTalentLaunchOpen(now) || session?.talentLaunchAccess === true;
}

/** Platform staff sign in as TALENT and must keep working before launch. Fails closed. */
async function isPlatformStaff(db, userId) {
  if (!userId) return false;
  try {
    const row = await db("platform_admins")
      .where({ user_id: userId, status: "ACTIVE" })
      .whereNull("revoked_at")
      .first("id");
    return Boolean(row);
  } catch {
    return false;
  }
}

function launchPendingBody() {
  return {
    success: false,
    error: LAUNCH_PENDING_ERROR,
    message: "Pholio opens to talent on October 31.",
    redirect: launchNotifyUrl(),
  };
}

module.exports = {
  DEFAULT_LAUNCH_AT,
  LAUNCH_PENDING_ERROR,
  isPlatformStaff,
  isTalentLaunchOpen,
  launchNotifyUrl,
  launchPendingBody,
  previewKeyMatches,
  sessionHasTalentAccess,
  talentLaunchAt,
  talentLaunchStatus,
};
