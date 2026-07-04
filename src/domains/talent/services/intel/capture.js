/**
 * Intel Capture v2 — enriched event write path (tasks/intel-page-spec.md §6).
 *
 * Every attention event is resolved to a viewer class before it is stored:
 *   agency  — authenticated agency session (or agency-side discovery)
 *   client  — arrival via a per-recipient share token
 *   public  — social / search / direct traffic
 *   self    — the talent themselves (never written; excluded everywhere)
 *
 * Market is resolved server-side from IP at write time and stored as a market
 * slug only — never raw IP, city, or coordinates (spec §4 and §6).
 *
 * Capture must never break the surface it instruments: every exported entry
 * point swallows its own errors.
 */

const crypto = require("crypto");
const knex = require("../../../../shared/db/knex");
const { resolveMarketFromIp } = require("./market-resolve");
const { isMinorProfile } = require("../../../../shared/lib/talent-age");

const VIEWER_CLASSES = new Set(["agency", "client", "public", "self"]);

function requestIp(req) {
  return (
    req?.ip ||
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    null
  );
}

function requestReferrer(req) {
  const raw = req?.headers?.["referer"] || req?.headers?.["referrer"] || null;
  return raw ? String(raw).slice(0, 512) : null;
}

/**
 * Classify where public attention came from, for the source narrative.
 */
function deriveSource({ referrer, shareToken, viewerClass }) {
  if (shareToken) return shareToken.kind === "card" ? "card_link" : "share_link";
  if (viewerClass === "agency") return "agency";
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "direct";
  }
  if (/instagram\.com$/.test(host)) return "instagram";
  if (/tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(twitter|x)\.com$/.test(host)) return "twitter";
  if (/(facebook\.com|fb\.com)$/.test(host)) return "facebook";
  if (/(google|bing|duckduckgo|yahoo)\./.test(host)) return "search";
  if (/pholio\./.test(host) || host === "localhost") return "direct";
  return host.slice(0, 60);
}

/**
 * Resolve the viewer class for a request against a profile.
 * Share-token arrival counts as client/casting even when anonymous.
 */
function resolveViewerClass(profile, req, shareToken = null) {
  const sessionUserId = req?.session?.userId;
  if (sessionUserId && profile && sessionUserId === profile.user_id) {
    return "self";
  }
  if (req?.session?.role === "AGENCY") return "agency";
  if (shareToken) return "client";
  return "public";
}

/**
 * Look up a share token from a raw ?st= value, and record the open/re-open on
 * the token row. Returns the token row or null. Self-opens (the talent testing
 * their own link) don't advance open counts.
 */
async function resolveShareToken(profile, rawToken, req) {
  if (!rawToken || !profile?.id) return null;
  const token = String(rawToken).trim();
  if (!token || token.length > 64) return null;
  try {
    const row = await knex("share_tokens")
      .where({ token, profile_id: profile.id })
      .whereNull("revoked_at")
      .first();
    if (!row) return null;

    const isSelf =
      Boolean(req?.session?.userId) && req.session.userId === profile.user_id;
    if (!isSelf) {
      await knex("share_tokens")
        .where({ id: row.id })
        .update({
          open_count: knex.raw("open_count + 1"),
          first_opened_at: row.first_opened_at || knex.fn.now(),
          last_opened_at: knex.fn.now(),
        });
    }
    return row;
  } catch (error) {
    console.error("[IntelCapture] share token resolution failed:", error.message);
    return null;
  }
}

function generateShareToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Record one attention event. Fire-and-forget safe: never throws, and the geo
 * lookup happens inside so callers don't block their response on it.
 *
 * Self events are dropped here as a hard rule — spec §4, "self-views excluded
 * everywhere". Minor profiles are recorded without market/source/referrer so
 * no geo or audience detail ever accrues for an under-18 profile.
 */
async function recordProfileEvent({
  profile,
  action,
  req = null,
  viewerClass = null,
  sessionId = null,
  imageId = null,
  dwellMs = null,
  shareToken = null,
  metadata = null,
}) {
  try {
    if (!profile?.id || !action) return null;

    const resolvedClass =
      viewerClass && VIEWER_CLASSES.has(viewerClass)
        ? viewerClass
        : resolveViewerClass(profile, req, shareToken);
    if (resolvedClass === "self") return null;

    const minor = isMinorProfile(profile);
    const referrer = minor ? null : requestReferrer(req);
    const source = minor
      ? null
      : deriveSource({ referrer, shareToken, viewerClass: resolvedClass });

    let market = null;
    if (!minor) {
      market = await resolveMarketFromIp(requestIp(req)).catch(() => null);
    }

    const row = {
      id: crypto.randomUUID(),
      profile_id: profile.id,
      action: String(action).slice(0, 40),
      viewer_class: resolvedClass,
      session_id: sessionId ? String(sessionId).slice(0, 64) : null,
      market,
      image_id: imageId || null,
      dwell_ms: Number.isFinite(dwellMs) ? Math.max(0, Math.round(dwellMs)) : null,
      share_token_id: shareToken?.id || null,
      source,
      referrer,
      metadata: metadata ? JSON.stringify(metadata) : null,
      occurred_at: knex.fn.now(),
    };
    await knex("profile_events").insert(row);
    return row.id;
  } catch (error) {
    // Missing table before migrate, transient DB errors — capture is
    // observability, never behaviour.
    console.error("[IntelCapture] event write failed:", error.message);
    return null;
  }
}

/**
 * Batch-record agency discovery impressions ("the market is searching for
 * someone like you"). Called from agency-side search; aggregate only, the
 * agency identity is never stored on the event.
 */
async function recordDiscoveryImpressions(profileIds, { filters = null } = {}) {
  try {
    const ids = [...new Set((profileIds || []).filter(Boolean))].slice(0, 60);
    if (ids.length === 0) return;
    const metadata = filters ? JSON.stringify({ filters }) : null;
    await knex("profile_events").insert(
      ids.map((profileId) => ({
        id: crypto.randomUUID(),
        profile_id: profileId,
        action: "discovery_impression",
        viewer_class: "agency",
        metadata,
        occurred_at: knex.fn.now(),
      })),
    );
  } catch (error) {
    console.error("[IntelCapture] discovery impressions failed:", error.message);
  }
}

module.exports = {
  recordProfileEvent,
  recordDiscoveryImpressions,
  resolveViewerClass,
  resolveShareToken,
  deriveSource,
  generateShareToken,
};
