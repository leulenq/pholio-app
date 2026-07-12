/**
 * Reversed-type PRINT RULES (editions plan 2.5).
 *
 * Physical print reality: reversed type (light ink on a dark field) fills
 * in on press. Thin strokes disappear entirely. The rules here are hard
 * minimum sizes by stroke class, plus per-cell verification helpers for
 * translucent veils and photo-riding micro text — the machinery every
 * front-program path (legacy and edition) consults before setting type on
 * a dark surface.
 *
 * Stroke classes:
 * - hairline / didone / high-contrast serif families → 24pt minimum
 *   reversed (their thin strokes are sub-0.5pt below that);
 * - weight ≥ 600 → 8pt minimum;
 * - 400–500 grotesque / everything else → 10pt minimum.
 *
 * Failing the minimum means MOVING the type to a light surface or
 * REFUSING the construction — never relaxing the check.
 *
 * All luma conventions match the sampler: forensic grids hold gamma-space
 * luma (0..1); contrast ratios are computed on linearized values
 * (WCAG-style), identical to pickFill.
 */

// High-contrast (hairline/didone) display families. Reversed below 24pt
// their thin strokes fall under 0.5pt and vanish on press.
const HAIRLINE_FAMILIES = new Set([
  "italiana",
  "bodoni moda",
  "cormorant garamond",
  "playfair display",
]);

function normalizeFamily(family) {
  return String(family || "").trim().toLowerCase();
}

function isHairlineFamily(family) {
  return HAIRLINE_FAMILIES.has(normalizeFamily(family));
}

/**
 * Stroke class for a (family, weight) voice.
 * @returns {"hairline"|"heavy"|"regular"}
 */
function strokeClass({ family, weight } = {}) {
  if (isHairlineFamily(family)) return "hairline";
  const w = Number.isFinite(Number(weight)) ? Number(weight) : 500;
  return w >= 600 ? "heavy" : "regular";
}

/** Minimum reversed point size for a voice. */
function reversedMinPt({ family, weight } = {}) {
  const cls = strokeClass({ family, weight });
  if (cls === "hairline") return 24;
  if (cls === "heavy") return 8;
  return 10;
}

/** True when `sizePt` may be set reversed in this voice. */
function reversedTypeOk({ family, weight, sizePt } = {}) {
  const pt = Number(sizePt);
  if (!Number.isFinite(pt)) return false;
  return pt + 1e-6 >= reversedMinPt({ family, weight });
}

// ── color / contrast primitives (sampler-consistent conventions) ───────────

function srgbLinear(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexChannels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG relative luminance (linear space) of a hex color, or null. */
function linearLuminance(hex) {
  const c = hexChannels(hex);
  if (!c) return null;
  return (
    0.2126 * srgbLinear(c.r / 255) +
    0.7152 * srgbLinear(c.g / 255) +
    0.0722 * srgbLinear(c.b / 255)
  );
}

/** Gamma-space weighted luma of a hex color (the forensic grid's space). */
function gammaLuma(hex) {
  const c = hexChannels(hex);
  if (!c) return null;
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

function contrastOfLinear(a, b) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** True for a paper tone dark enough to demand reversed-type discipline. */
function isDarkSurface(hex) {
  const l = linearLuminance(hex);
  return l != null && l < 0.18;
}

// ── per-cell verification over forensic grids ───────────────────────────────

/**
 * Gamma-luma values of every forensic cell a page rect touches. `frame` is
 * the photo rect the grid maps onto (page coords, inches). Empty array when
 * the rect misses the frame or the grid is unusable.
 */
function cellsUnderRect(grid, r, frame) {
  if (!Array.isArray(grid) || !grid.length || !r || !frame || !(frame.w > 0) || !(frame.h > 0)) {
    return [];
  }
  const rows = grid.length;
  const cols = grid[0].length;
  const clamp01 = (n) => Math.min(1, Math.max(0, n));
  const gy0 = clamp01((r.y - frame.y) / frame.h);
  const gy1 = clamp01((r.y + r.h - frame.y) / frame.h);
  const gx0 = clamp01((r.x - frame.x) / frame.w);
  const gx1 = clamp01((r.x + r.w - frame.x) / frame.w);
  if (gy1 <= gy0 || gx1 <= gx0) return [];
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(gy0 * rows)));
  const r1 = Math.max(r0, Math.min(rows - 1, Math.ceil(gy1 * rows) - 1));
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(gx0 * cols)));
  const c1 = Math.max(c0, Math.min(cols - 1, Math.ceil(gx1 * cols) - 1));
  const out = [];
  for (let rr = r0; rr <= r1; rr++) {
    for (let cc = c0; cc <= c1; cc++) {
      const v = grid[rr][cc];
      if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** Worst-cell WCAG ratio of a SOLID ink hex over gamma-luma cells. */
function worstCellRatio(cells, inkHex) {
  const inkLin = linearLuminance(inkHex);
  if (inkLin == null || !cells.length) return 0;
  let worst = Infinity;
  for (const cell of cells) {
    const ratio = contrastOfLinear(inkLin, srgbLinear(cell));
    if (ratio < worst) worst = ratio;
  }
  return worst;
}

/**
 * Worst-cell ratio of a TRANSLUCENT ink composited over the cells: the
 * effective glyph color is alpha-blended with the cell (gamma space, the
 * display compositing model), then compared against the bare cell.
 */
function worstCompositeInkRatio(cells, { inkGamma, alpha }) {
  if (!cells.length || !Number.isFinite(inkGamma) || !Number.isFinite(alpha)) return 0;
  let worst = Infinity;
  for (const cell of cells) {
    const comp = alpha * inkGamma + (1 - alpha) * cell;
    const ratio = contrastOfLinear(srgbLinear(comp), srgbLinear(cell));
    if (ratio < worst) worst = ratio;
  }
  return worst;
}

/**
 * Solve the minimum veil alpha at which SOLID ink over the veil composited
 * on the WORST cell clears `minRatio`. The veil is alpha-blended over each
 * cell (gamma space); the ink is compared against that composited field.
 * Steps upward from `startAlpha`; null when even `maxAlpha` fails (refuse
 * the construction).
 */
function solveVeilAlpha({
  cells,
  veilGamma,
  inkHex,
  startAlpha,
  step = 0.04,
  maxAlpha = 0.92,
  minRatio = 4.5,
} = {}) {
  const inkLin = linearLuminance(inkHex);
  if (inkLin == null || !Array.isArray(cells) || !cells.length || !Number.isFinite(veilGamma)) {
    return null;
  }
  for (let a = startAlpha; a <= maxAlpha + 1e-9; a += step) {
    let worst = Infinity;
    for (const cell of cells) {
      const bg = a * veilGamma + (1 - a) * cell;
      const ratio = contrastOfLinear(inkLin, srgbLinear(bg));
      if (ratio < worst) worst = ratio;
    }
    if (worst >= minRatio) return Math.round(a * 100) / 100;
  }
  return null;
}

module.exports = {
  HAIRLINE_FAMILIES,
  isHairlineFamily,
  strokeClass,
  reversedMinPt,
  reversedTypeOk,
  srgbLinear,
  linearLuminance,
  gammaLuma,
  contrastOfLinear,
  isDarkSurface,
  cellsUnderRect,
  worstCellRatio,
  worstCompositeInkRatio,
  solveVeilAlpha,
};
