/**
 * Vendored font-file resolver + measured name metrics.
 *
 * Bridges the curated font library (font-library.js) to the static TTFs
 * vendored under public/fonts/compcard/ (scripts/fetch-compcard-fonts.js),
 * so callers get REAL shaped advances (HarfBuzz, via text-metrics.js — the
 * same shaping engine Chromium renders with) for the exact string they will
 * render instead of the calibrated per-family estimates.
 *
 * Everything is fail-soft: missing files, a missing harfbuzzjs, or a parse
 * failure return null and callers fall back to the estimate path — the
 * engine keeps composing, just less precisely (audit P0-1).
 */

const fs = require("fs");
const path = require("path");

const { FAMILIES, advanceEm, familyAxes } = require("../font-library");
const { loadFont, advanceEmFor } = require("./text-metrics");

/* Netlify's esbuild collapses src/ to the zip root, so `__dirname` is
   /var/task and the relative walk above resolves to `/public/fonts/compcard` —
   which does not exist. The 41 vendored TTFs ARE shipped (netlify.toml
   included_files), they were simply never found, and this module is fail-soft:
   production comp cards fell back to ESTIMATED type metrics while every local
   preview used real HarfBuzz shaping. Output silently differed from everything
   anyone reviewed. Same LAMBDA_TASK_ROOT branch app.js already uses for views. */
const APP_ROOT = process.env.LAMBDA_TASK_ROOT
  ? process.env.LAMBDA_TASK_ROOT
  : path.join(__dirname, "..", "..", "..", "..", "..");

const FONT_DIR = path.join(APP_ROOT, "public", "fonts", "compcard");

const slugify = (family) => String(family || "").toLowerCase().replace(/\s+/g, "-");

// path existence is cached (the resolver runs per compose, files never move)
const pathCache = new Map();
const varPathCache = new Map();

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

/**
 * Absolute path to the vendored VARIABLE master for a family
 * (`{slug}-variable.ttf`), or null when the family carries no design axis or
 * the file is not vendored. This face backs exact per-axis measurement and
 * the variable @font-face render path.
 * @param {string} family
 * @returns {string|null}
 */
function variableFontPathFor(family) {
  if (!familyAxes(family)) return null;
  if (varPathCache.has(family)) return varPathCache.get(family);
  const file = path.join(FONT_DIR, `${slugify(family)}-variable.ttf`);
  let resolved = null;
  try {
    if (fs.existsSync(file)) resolved = file;
  } catch {
    resolved = null;
  }
  varPathCache.set(family, resolved);
  return resolved;
}

/**
 * Keep only the axes this family actually carries, clamped to their ranges,
 * and drop the wght if not provided (the caller passes it explicitly so the
 * variable instance matches the rendered weight). Returns null when nothing
 * measurable remains.
 */
function sanitizeAxes(family, axes) {
  const meta = familyAxes(family);
  if (!meta || !axes || typeof axes !== "object") return null;
  const out = {};
  for (const tag of Object.keys(meta)) {
    const v = Number(axes[tag]);
    if (Number.isFinite(v)) {
      out[tag] = Math.min(meta[tag].max, Math.max(meta[tag].min, v));
    }
  }
  return Object.keys(out).length ? out : null;
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
 * When `axes` ({ wdth?, opsz? }) is supplied AND the family has a vendored
 * variable master, the advance is shaped at that exact axis position (the
 * value the renderer applies via font-variation-settings — parity by
 * construction). Without axes the behavior is byte-identical to before: the
 * static face at the nearest weight. If axes are requested but no variable
 * master is vendored, it falls back to the static measurement scaled by a
 * calibrated width factor and reports `measured:false` (the axis is estimated,
 * not shaped).
 *
 * @param {object} args — { family, weight, text, nameCase, axes? }
 * @returns {{ advanceEm: number, measured: boolean, axis?: object }}
 */
function nameAdvanceEm({ family, weight = 400, text, nameCase = "upper", axes = null } = {}) {
  const rendered = applyNameCase(text, nameCase);
  const wantAxes = sanitizeAxes(family, axes);

  // Exact per-axis path: variable master shaped at { wght, ...design axes }.
  if (wantAxes && rendered) {
    const varPath = variableFontPathFor(family);
    if (varPath) {
      const font = loadFont(varPath);
      const axisReq = { wght: weight, ...wantAxes };
      const measured = advanceEmFor(font, rendered, axisReq);
      if (Number.isFinite(measured) && measured > 0) {
        return { advanceEm: measured, measured: true, axis: axisReq };
      }
    }
  }

  // Static (default-cut) path — unchanged legacy behavior when no axes.
  const fontPath = fontPathFor(family, weight);
  if (fontPath && rendered) {
    const font = loadFont(fontPath);
    const measured = advanceEmFor(font, rendered);
    if (Number.isFinite(measured) && measured > 0) {
      if (wantAxes) {
        // No variable master but an axis was asked for: estimate its width
        // effect off the exact static measurement (wdth scales ~linearly;
        // opsz barely moves advance). Honest: measured:false, axis noted.
        const wf = Number.isFinite(wantAxes.wdth) ? wantAxes.wdth / 100 : 1;
        return { advanceEm: measured * wf, measured: false, axis: wantAxes };
      }
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
    // Axis-bearing families ship ONE variable @font-face (weight range +
    // stretch range) so the template's font-variation-settings actually take
    // effect. At the default axis this renders as the static instance the
    // engine measured with, so non-axis type is unaffected. Falls back to the
    // per-weight statics when no variable master is vendored.
    const varPath = variableFontPathFor(family);
    const axes = familyAxes(family);
    if (varPath && axes) {
      const weights = FAMILIES[family].weights;
      const wLo = axes.wght ? axes.wght.min : Math.min(...weights);
      const wHi = axes.wght ? axes.wght.max : Math.max(...weights);
      const stretch = axes.wdth ? `font-stretch:${axes.wdth.min}% ${axes.wdth.max}%;` : "";
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${wLo} ${wHi};${stretch}` +
          `src:url('/fonts/compcard/${slugify(family)}-variable.ttf') format('truetype');font-display:block;}`,
      );
      continue;
    }
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

/** Heaviest vendored weight for a family (display-scale split-name type). */
function heaviestWeight(family) {
  const meta = FAMILIES[family];
  if (!meta) return 700;
  return Math.max(...meta.weights);
}

module.exports = {
  fontPathFor,
  variableFontPathFor,
  nameAdvanceEm,
  applyNameCase,
  fontFaceCss,
  heaviestWeight,
  FONT_DIR,
};
