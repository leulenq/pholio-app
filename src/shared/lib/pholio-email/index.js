/**
 * Pholio Email — public surface.
 *
 * Talent templates render the cream dashboard vocabulary; agency templates stay
 * on the older dark composition (see templates-agency.js). `text` holds the
 * hand-written plain-text alternative for every talent template — never derive
 * one from the HTML.
 */

const templates = require("./templates");
const text = require("./text");
const { getEmailAppBaseUrl, getMarketingSiteUrl } = require("./urls");

module.exports = { ...templates, text, getEmailAppBaseUrl, getMarketingSiteUrl };
