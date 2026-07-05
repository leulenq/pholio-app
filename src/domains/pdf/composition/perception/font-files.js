/**
 * Vendored font-file resolver + measured name metrics.
 *
 * Bridges the curated font library (font-library.js) to the static TTFs
 * vendored under public/fonts/compcard/ (scripts/fetch-compcard-fonts.js),
 * so callers get REAL glyph advances for the exact string they will render
 * instead of the calibrated per-family estimates.
 *
 * Everything is fail-soft: missing files, a missing opentype.js, or a parse
 * failure return null and callers fall back to the estimate path — the
 * engine keeps composing, just less precisely (audit P0-1).
 */

const fs = require("fs");
const path = require("path");

const { FAMILIES, advanceEm } = require("../font-library");
const { loadFont, advanceEmFor } = require("./text-metrics");

const FONT_DIR = path.join(__dirname, "..", "..", "..", "..", "..", "public", "fonts", "compcard");

const slugify = (family) => String(family || "").toLowerCase().replace(/\s+/g, "-");

// path existence is cached (the resolver runs per compose, files never move)
const pathCache = new Map();

/**
 * Absolute path to the vendored TTF for a family at (nearest) weight, or
 * null when the family/weight file is not vendored.
 * @param {string} family — library family name (e.g. "Playfair Display")
 * @param {number} [weight=400]
 * @returns {string|null}
 */
function fontPathFor(family, weight = 400) {
  const meta = FAMILIES[family];
  if (!meta) return null;
  const nearest = meta.weights.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
  );
  const key = `${family}:${nearest}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const file = path.join(FONT_DIR, `${slugify(family)}-${nearest}.ttf`);
  let resolved = null;
  try {
    if (fs.existsSync(file)) resolved = file;
  } catch {
    resolved = null;
  }
  pathCache.set(key, resolved);
  return resolved;
}

/** Apply the voice's case policy the way the renderer will (CSS text-transform). */
function applyNameCase(text, nameCase) {
  const str = String(text || "");
  if (nameCase === "upper") return str.toUpperCase();
  if (nameCase === "title" || nameCase === "capitalize") {
    return str.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
  }
  return str;
}

/**
 * Per-glyph average advance (em, tracking excluded) MEASURED for the exact
 * string the renderer will draw (case transform applied). Falls back to the
 * library's calibrated estimate when measurement is unavailable.
 *
 * Because the caller's width math is `chars × (advanceEm + trackingEm) × pt/72`
 * over the same string, a per-string measured average makes that math exact
 * for that string.
 *
 * @param {object} args — { family, weight, text, nameCase }
 * @returns {{ advanceEm: number, measured: boolean }}
 */
function nameAdvanceEm({ family, weight = 400, text, nameCase = "upper" } = {}) {
  const rendered = applyNameCase(text, nameCase);
  const fontPath = fontPathFor(family, weight);
  if (fontPath && rendered) {
    const font = loadFont(fontPath);
    const measured = advanceEmFor(font, rendered);
    if (Number.isFinite(measured) && measured > 0) {
      return { advanceEm: measured, measured: true };
    }
  }
  return { advanceEm: advanceEm(family, nameCase), measured: false };
}

/**
 * Inline @font-face CSS for a set of families (all vendored weights), with
 * font URLs served from the app's static /fonts/compcard/ path. Returns null
 * when NO requested family is vendored — the template then falls back to the
 * Google Fonts link (previous behavior).
 *
 * @param {string[]} families
 * @returns {string|null}
 */
function fontFaceCss(families) {
  const list = [...new Set(["Inter", ...(families || [])])].filter((f) => FAMILIES[f]);
  const rules = [];
  for (const family of list) {
    for (const weight of FAMILIES[family].weights) {
      if (!fontPathFor(family, weight)) continue;
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
          `src:url('/fonts/compcard/${slugify(family)}-${weight}.ttf') format('truetype');font-display:block;}`,
      );
    }
  }
  return rules.length ? rules.join("\n") : null;
}

module.exports = {
  fontPathFor,
  nameAdvanceEm,
  applyNameCase,
  fontFaceCss,
  FONT_DIR,
};
