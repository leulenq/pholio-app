/**
 * Exact text metrics (perception engine, P1).
 *
 * Measures REAL glyph advances per font/size/tracking via opentype.js so the
 * composition engine can fit names by measurement instead of the calibrated
 * capAdvanceEm/titleAdvanceEm ESTIMATES in font-library.js (and the 0.95
 * safety fudge those estimates require). Replaces approximation with the
 * actual horizontal extent a string will occupy.
 *
 * Proposal: docs/comp-card-frontpage-intelligence-proposal.md §2.1
 * ("Exact type metrics: opentype.js with our Google-Fonts files").
 *
 * ── Wiring real fonts (NOT done here, on purpose) ─────────────────────────
 * The render pipeline pulls families from the Google Fonts CSS2 API at draw
 * time (font-library.js → fontsCssUrl), so there are usually NO local font
 * files on disk to measure. To make measureLine() authoritative for the
 * library families you must BUNDLE the matching TTFs and pass their path /
 * buffer in. The intended path is @fontsource/* packages, e.g.
 *   npm install @fontsource/inter @fontsource/playfair-display ...
 * then resolve `@fontsource/<family>/files/<family>-<weight>-normal.woff2`
 * (opentype.js parses woff/ttf/otf). That bundling is deliberately deferred —
 * this module only provides the measurement primitive plus an estimate
 * fallback so callers degrade cleanly when no font file is available.
 *
 * Engineering: opentype.js is lazy-required and everything is fail-soft — a
 * missing dependency, an unreadable path, or a corrupt font yields null (or,
 * for callers, a deliberate hop to estimateLine), never a throw. Mirrors the
 * lazy-sharp discipline in image-forensics.js.
 *
 * Tracking convention (shared by measureLine + estimateLine): trackingEm is
 * applied as additional advance of `trackingEm * sizePt` after EVERY glyph
 * (matching CSS letter-spacing), i.e. total tracking = trackingEm * sizePt *
 * text.length. Both functions use this identical convention so a caller can
 * swap measurement for estimate without a discontinuity.
 */

const fs = require("fs");

const PT_PER_IN = 72; // 1pt = 1/72in
const DEFAULT_ADVANCE_EM = 0.55; // neutral per-glyph advance for estimateLine
const DEFAULT_CAP_RATIO = 0.7; // cap-height / em fallback when font absent
const METRICS_VERSION = 1;

let opentypeModule;
let opentypeLoadFailed = false;

/** Lazy-require opentype.js; null (cached) if it isn't installed. */
function getOpentype() {
  if (opentypeModule) return opentypeModule;
  if (opentypeLoadFailed) return null;
  try {
    // eslint-disable-next-line global-require
    opentypeModule = require("opentype.js");
    return opentypeModule;
  } catch (err) {
    opentypeLoadFailed = true;
    return null;
  }
}

// Parsed fonts are cached by absolute path. A null entry means "we tried this
// path and it isn't usable" — so we never re-read a broken/missing file.
const fontCache = new Map();

/**
 * Parse a font from a Buffer. Returns an opentype Font or null. Not cached
 * (buffers aren't reliably keyable).
 * @param {Buffer} buffer
 * @returns {object|null}
 */
function parseFontBuffer(buffer) {
  const opentype = getOpentype();
  if (!opentype || !buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }
  try {
    const font = opentype.parse(buffer);
    return font && font.unitsPerEm ? font : null;
  } catch (err) {
    return null;
  }
}

/**
 * Load + cache a font from a filesystem path. Returns an opentype Font or
 * null on any failure (dep missing, file missing, parse error).
 * @param {string} fontPath
 * @returns {object|null}
 */
function loadFont(fontPath) {
  if (typeof fontPath !== "string" || !fontPath) return null;
  if (fontCache.has(fontPath)) return fontCache.get(fontPath);
  let font = null;
  try {
    const buffer = fs.readFileSync(fontPath);
    font = parseFontBuffer(buffer);
  } catch (err) {
    font = null;
  }
  fontCache.set(fontPath, font);
  return font;
}

/**
 * Total advance for a string at a given size, robust to fonts whose GSUB
 * tables opentype.js cannot shape (e.g. Inter's lookup-type-6 features make
 * getAdvanceWidth throw). Falls back to summing per-glyph advance widths
 * plus pair kerning — no ligature substitution, which is irrelevant for
 * tracked display names.
 * @returns {number|null} advance in the same units as sizePt
 */
function totalAdvance(font, text, sizePt) {
  try {
    const adv = font.getAdvanceWidth(text, sizePt);
    if (Number.isFinite(adv)) return adv;
  } catch {
    /* fall through to the manual path */
  }
  try {
    const scale = sizePt / font.unitsPerEm;
    let total = 0;
    let prev = null;
    for (const ch of text) {
      const glyph = font.charToGlyph(ch);
      if (!glyph) continue;
      if (prev) total += (font.getKerningValue(prev, glyph) || 0) * scale;
      total += (glyph.advanceWidth || 0) * scale;
      prev = glyph;
    }
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/**
 * Average per-glyph advance (em) for a string in a given font — the measured
 * analogue of font-library's capAdvanceEm/titleAdvanceEm estimates (same
 * semantics: tracking excluded, em units, divided by glyph count).
 * @param {object} font — an opentype Font (from loadFont/parseFontBuffer)
 * @param {string} text
 * @returns {number|null}
 */
function advanceEmFor(font, text) {
  if (!font || typeof font.getAdvanceWidth !== "function") return null;
  const str = typeof text === "string" ? text : "";
  if (!str.length) return 0;
  // total advance at fontSize=1 is in em units.
  const totalEm = totalAdvance(font, str, 1);
  if (!Number.isFinite(totalEm)) return null;
  return totalEm / str.length;
}

/** Cap-height / em ratio for a font, with sensible fallbacks. */
function capRatioFor(font) {
  try {
    const cap = font.tables && font.tables.os2 && font.tables.os2.sCapHeight;
    if (Number.isFinite(cap) && cap > 0) return cap / font.unitsPerEm;
    if (Number.isFinite(font.ascender) && font.ascender > 0) {
      return font.ascender / font.unitsPerEm;
    }
  } catch (err) {
    /* fall through */
  }
  return DEFAULT_CAP_RATIO;
}

/**
 * EXACT measurement of a single line.
 * @param {object} args
 * @param {string} [args.fontPath] — path to a TTF/OTF/WOFF (cached)
 * @param {Buffer} [args.fontBuffer] — alternative to fontPath
 * @param {string} args.text
 * @param {number} args.sizePt — font size in points
 * @param {number} [args.trackingEm=0] — letter-spacing in em
 * @returns {{ widthIn:number, heightIn:number, version:number }|null}
 *   null when opentype/font is unavailable or input is invalid — the signal
 *   for a caller to fall back to estimateLine.
 */
function measureLine({ fontPath, fontBuffer, text, sizePt, trackingEm = 0 } = {}) {
  if (typeof text !== "string" || !Number.isFinite(sizePt) || sizePt <= 0) {
    return null;
  }
  const font = fontBuffer ? parseFontBuffer(fontBuffer) : loadFont(fontPath);
  if (!font) return null;
  try {
    const advancePt = totalAdvance(font, text, sizePt); // pt at this size
    if (!Number.isFinite(advancePt)) return null;
    const track = Number.isFinite(trackingEm) ? trackingEm : 0;
    const trackingPt = track * sizePt * text.length;
    const widthIn = (advancePt + trackingPt) / PT_PER_IN;
    const heightIn = (capRatioFor(font) * sizePt) / PT_PER_IN;
    return {
      widthIn: Math.max(0, widthIn),
      heightIn: Math.max(0, heightIn),
      version: METRICS_VERSION,
    };
  } catch (err) {
    return null;
  }
}

/**
 * ESTIMATE of a single line (no font file required). Mirrors the historical
 * estimate math: width = (advanceEm + trackingEm) · sizePt · len. Always
 * returns an object for valid numeric input so callers degrade cleanly; the
 * same tracking convention as measureLine.
 * @param {object} args
 * @param {string} args.text
 * @param {number} args.sizePt
 * @param {number} [args.trackingEm=0]
 * @param {number} [args.advanceEm] — per-glyph advance estimate (em); from
 *   font-library's capAdvanceEm/titleAdvanceEm when known
 * @returns {{ widthIn:number, heightIn:number, estimated:true }}
 */
function estimateLine({ text, sizePt, trackingEm = 0, advanceEm } = {}) {
  const str = typeof text === "string" ? text : "";
  const size = Number.isFinite(sizePt) && sizePt > 0 ? sizePt : 0;
  const adv = Number.isFinite(advanceEm) && advanceEm > 0 ? advanceEm : DEFAULT_ADVANCE_EM;
  const track = Number.isFinite(trackingEm) ? trackingEm : 0;
  const widthIn = ((adv + track) * size * str.length) / PT_PER_IN;
  const heightIn = (DEFAULT_CAP_RATIO * size) / PT_PER_IN;
  return {
    widthIn: Math.max(0, widthIn),
    heightIn: Math.max(0, heightIn),
    estimated: true,
  };
}

module.exports = {
  loadFont,
  parseFontBuffer,
  measureLine,
  estimateLine,
  advanceEmFor,
  METRICS_VERSION,
};
