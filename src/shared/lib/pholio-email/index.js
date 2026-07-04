/**
 * Pholio Email Design System — public entry point.
 *
 * A from-scratch email system derived from the real Pholio marketing site and
 * talent dashboard. Drop-in for the legacy ./email-templates module: it exports
 * the same build* function names and getEmailAppBaseUrl, so email.js and every
 * route keep working unchanged.
 *
 *   • tokens.js      — brand DNA (color, type, spacing) in email-safe form
 *   • components.js  — reusable blocks (the shared design language)
 *   • templates.js   — the emails, assembled from blocks
 *   • urls.js        — absolute-URL resolution contract
 */

const tokens = require("./tokens");
const components = require("./components");
const templates = require("./templates");
const {
  getEmailAppBaseUrl,
  getMarketingSiteUrl,
  pickPublicBaseUrl,
  normalizeBaseUrl,
} = require("./urls");

module.exports = {
  // Drop-in template builders (consumed by email.js)
  ...templates,

  // URL helpers (getEmailAppBaseUrl consumed by guardian-consent.js)
  getEmailAppBaseUrl,
  getMarketingSiteUrl,
  pickPublicBaseUrl,
  normalizeBaseUrl,

  // Foundation, exposed for previews / future templates
  tokens,
  components,
};
