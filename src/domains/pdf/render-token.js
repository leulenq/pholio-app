"use strict";

/**
 * Short-lived, HMAC-signed render tokens.
 *
 * The PDF pipeline renders by launching a headless browser that NAVIGATES to
 * the printable HTML route (`/pdf/digitals/view/:slug`). That request carries
 * no session cookie, so any auth we put on the document route would lock the
 * renderer out of its own page. The classic answer — an in-memory nonce — does
 * not survive the serverless deployment, where the browser's request can land
 * on a different instance than the one that minted it.
 *
 * So the token is stateless: an expiry plus an HMAC over
 * `scope | slug | expiry`, keyed on the server's session secret. Any instance
 * can verify it, nothing has to be stored, and it is useless two minutes later
 * or against a different slug.
 *
 * This is an INTERNAL renderer credential, not a share link: it is minted only
 * after the requesting session has been authorized, and it is never handed to
 * a browser the user controls.
 */

const crypto = require("crypto");
const config = require("../../config");

/** A render round-trip is seconds; two minutes is generous. */
const RENDER_TOKEN_TTL_MS = 2 * 60 * 1000;

/**
 * @param {string} scope — what is being rendered (e.g. "digitals")
 * @param {string} slug
 * @param {number} expiresAt — epoch ms
 * @returns {string} hex signature
 */
function sign(scope, slug, expiresAt) {
  return crypto
    .createHmac("sha256", String(config.sessionSecret || ""))
    .update(`${scope}|${slug}|${expiresAt}`)
    .digest("hex");
}

/**
 * Mint a token authorizing ONE render of one slug in one scope.
 * @param {string} scope
 * @param {string} slug
 * @param {{ now?: number, ttlMs?: number }} [options] — test hooks
 * @returns {string} `<expiresAt>.<signature>`
 */
function mintRenderToken(scope, slug, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const ttl = Number.isFinite(options.ttlMs) ? options.ttlMs : RENDER_TOKEN_TTL_MS;
  const expiresAt = now + ttl;
  return `${expiresAt}.${sign(String(scope), String(slug), expiresAt)}`;
}

/**
 * Verify a token. Fails closed on anything malformed, expired, or signed for a
 * different slug or scope.
 * @param {*} token
 * @param {string} scope
 * @param {string} slug
 * @param {{ now?: number }} [options] — test hook
 * @returns {boolean}
 */
function verifyRenderToken(token, scope, slug, options = {}) {
  if (typeof token !== "string" || token.length > 256) return false;
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || !/^[0-9a-f]{64}$/.test(signature)) return false;

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  if (expiresAt <= now) return false;

  const expected = sign(String(scope), String(slug), expiresAt);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  RENDER_TOKEN_TTL_MS,
  mintRenderToken,
  verifyRenderToken,
};
