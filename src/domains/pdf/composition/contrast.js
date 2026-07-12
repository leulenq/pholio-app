/**
 * Dynamic text-over-image contrast control (atelier engine v3).
 *
 * Decides how the name (and wordmark) can sit on a photograph: which ink to
 * use, whether a gradient scrim is needed and how strong, or whether the
 * band is unrescuable and the type must relocate to paper.
 *
 * Spec: tasks/comp-card-atelier-spec.md §F (v3 addendum).
 *
 * Model: the forensics luma grid gives mean/extremes of the band under the
 * type. Treating band mean luma as a flat backdrop, WCAG contrast for white
 * ink is (1.05)/(Yband + 0.05) and for near-black ink (Yband + 0.05)/(0.11).
 * Targets: ≥ 4.5 for confident placement; a scrim multiplies the effective
 * backdrop toward its own tone, so the required scrim strength is solved
 * from the contrast deficit. Bands that are both mid-luma AND busy (high
 * detail / luma spread) can't be rescued tastefully → 'relocate'.
 *
 * COLOR SPACE (critical): the forensics luma grid stores GAMMA-encoded sRGB
 * gray (built from sharp().greyscale(), values 0..1). WCAG relative-luminance
 * contrast is defined on LINEAR luminance Y, so every band gray g must pass
 * through the sRGB transfer (srgbToLinear) before any ratio math — feeding
 * gamma gray straight into the ratio formula roughly DOUBLES dark-ink verdicts
 * (gamma 0.5 judged 5.0:1 vs the true 2.4:1). CSS, by contrast, composites a
 * semi-opaque scrim in gamma space, so scrim blends are solved in gamma space
 * and only the resulting effective backdrop is linearized for the ratio. This
 * matches the convention in front-program/synthesize.js.
 */

const TARGET_CONTRAST = 4.5;
const SCRIM_MIN = 0.2;
const SCRIM_MAX = 0.62;
// Conservative LINEAR relative-luminance floor for the darkest usable ink.
// Pure #1A1815 sits near Y=0.009; we hold 0.06 so the dark-ink gate never
// flatters itself. Compared in linear space against linearized backdrop Y.
const INK_DARK_LUMA = 0.06;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// sRGB transfer (gamma → linear) and its inverse (linear → gamma). Grid gray
// is gamma-encoded; ratio math needs linear Y, scrim compositing needs gamma.
function srgbToLinear(g) {
  const c = clamp(g, 0, 1);
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(y) {
  const c = clamp(y, 0, 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

// White (#FFFFFF, Y=1) over a band whose GAMMA gray is `luma`.
function contrastWhiteOver(luma) {
  return 1.05 / (srgbToLinear(luma) + 0.05);
}

// Near-black ink over a band whose GAMMA gray is `luma`.
function contrastDarkOver(luma) {
  return (srgbToLinear(luma) + 0.05) / (INK_DARK_LUMA + 0.05);
}

/**
 * Mean/min/max luma + mean detail of the grid cells inside a band.
 * @param {object} forensics — image-forensics Forensics
 * @param {'top'|'bottom'|'left'|'right'} edge
 * @param {number} [depth] — band depth in grid units (defaults to the
 *   forensics quiet band depth for that edge, else 2)
 */
function bandStats(forensics, edge, depth) {
  const luma = forensics?.luma?.grid;
  const detail = forensics?.detail?.grid;
  if (!Array.isArray(luma) || !luma.length) return null;
  const rows = luma.length;
  const cols = luma[0].length;
  const quiet = forensics?.quiet?.[edge] || {};
  const d = depth || quiet.bandRows || quiet.bandCols || 2;

  const cells = [];
  const push = (r, c) => {
    const l = luma[r]?.[c];
    if (typeof l === "number") {
      cells.push({ l, d: detail?.[r]?.[c] ?? 0 });
    }
  };
  if (edge === "top") {
    for (let r = 0; r < Math.min(d, rows); r++) for (let c = 0; c < cols; c++) push(r, c);
  } else if (edge === "bottom") {
    for (let r = Math.max(0, rows - d); r < rows; r++) for (let c = 0; c < cols; c++) push(r, c);
  } else if (edge === "left") {
    for (let c = 0; c < Math.min(d, cols); c++) for (let r = 0; r < rows; r++) push(r, c);
  } else {
    for (let c = Math.max(0, cols - d); c < cols; c++) for (let r = 0; r < rows; r++) push(r, c);
  }
  if (!cells.length) return null;

  let sum = 0;
  let dSum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const cell of cells) {
    sum += cell.l;
    dSum += cell.d;
    if (cell.l < min) min = cell.l;
    if (cell.l > max) max = cell.l;
  }
  return {
    mean: sum / cells.length,
    min,
    max,
    spread: max - min,
    meanDetail: dSum / cells.length,
    quietScore: forensics?.quiet?.[edge]?.score ?? null,
  };
}

/**
 * Resolve ink + scrim for type over an image band.
 *
 * @param {object} input
 * @param {object|null} input.forensics — hero Forensics (null ⇒ heuristic)
 * @param {'top'|'bottom'|'left'|'right'} input.edge — band edge
 * @param {number} [input.depth] — band depth in grid units
 * @returns {{
 *   ink: 'light'|'dark',
 *   estContrast: number,        // for the chosen ink over the WORST cell
 *   scrim: null | { direction: 'darken'|'lighten', strength: number },
 *   verdict: 'safe'|'scrim'|'relocate',
 *   because: string,
 * }}
 */
function resolveTextContrast({ forensics, edge = "bottom", depth } = {}) {
  const stats = forensics ? bandStats(forensics, edge, depth) : null;
  if (!stats) {
    // No measurements: industry-safe default — light ink over a darkening
    // scrim reads on any photograph.
    return {
      ink: "light",
      estContrast: TARGET_CONTRAST,
      scrim: { direction: "darken", strength: 0.42 },
      verdict: "scrim",
      because: "no forensics; conservative light-ink + scrim default",
    };
  }

  // Worst-case backdrop for each ink: white ink fights the LIGHTEST cell,
  // dark ink fights the DARKEST cell.
  const whiteWorst = contrastWhiteOver(stats.max);
  const darkWorst = contrastDarkOver(stats.min);
  const preferLight = whiteWorst >= darkWorst;
  const ink = preferLight ? "light" : "dark";
  const estContrast = preferLight ? whiteWorst : darkWorst;

  if (estContrast >= TARGET_CONTRAST && stats.meanDetail <= 0.5) {
    return {
      ink,
      estContrast,
      scrim: null,
      verdict: "safe",
      because: `band reads ${stats.mean.toFixed(2)} luma, worst-case ${estContrast.toFixed(1)}:1 ${ink} ink — no scrim`,
    };
  }

  // Scrim: blend the worst-case backdrop toward the scrim tone until the
  // target holds. CSS composites the semi-opaque veil in GAMMA space, so the
  // blend effG = worstG·(1−s) + toneG·s is solved in gamma space; the target,
  // however, is a LINEAR-luminance threshold, so we convert it back to gamma
  // (linearToSrgb) before solving for s.
  const direction = ink === "light" ? "darken" : "lighten";
  const tone = direction === "darken" ? 0.02 : 0.97; // scrim tone (gamma space)
  const worst = direction === "darken" ? stats.max : stats.min; // gamma gray
  const neededLin =
    direction === "darken"
      ? 1.05 / TARGET_CONTRAST - 0.05 // max effective backdrop Y for white ink
      : TARGET_CONTRAST * (INK_DARK_LUMA + 0.05) - 0.05; // min Y for dark ink
  const needed = linearToSrgb(neededLin); // threshold re-expressed in gamma
  let strength;
  if (direction === "darken") {
    strength = worst <= needed ? 0 : (worst - needed) / (worst - tone);
  } else {
    strength = worst >= needed ? 0 : (needed - worst) / (tone - worst);
  }
  // Busy bands need extra coverage for legibility regardless of mean math.
  strength += stats.meanDetail * 0.18 + stats.spread * 0.08;
  strength = clamp(strength, SCRIM_MIN, SCRIM_MAX + 0.001);

  // Unrescuable: a mid-luma, busy band where even the max tasteful scrim
  // leaves the type fighting the photograph.
  const effWorst =
    direction === "darken"
      ? worst * (1 - SCRIM_MAX) + tone * SCRIM_MAX
      : worst * (1 - SCRIM_MAX) + tone * SCRIM_MAX;
  const effContrast =
    direction === "darken" ? contrastWhiteOver(effWorst) : contrastDarkOver(effWorst);
  if (effContrast < TARGET_CONTRAST || (stats.meanDetail > 0.72 && stats.spread > 0.5)) {
    return {
      ink,
      estContrast,
      scrim: null,
      verdict: "relocate",
      because: `band luma ${stats.mean.toFixed(2)} / detail ${stats.meanDetail.toFixed(2)} cannot be rescued by a tasteful scrim — type belongs on paper`,
    };
  }

  return {
    ink,
    estContrast,
    scrim: { direction, strength: Math.round(strength * 100) / 100 },
    verdict: "scrim",
    because: `worst-case ${estContrast.toFixed(1)}:1 → ${direction} scrim ${(strength * 100).toFixed(0)}% restores ≥ ${TARGET_CONTRAST}:1`,
  };
}

/**
 * Stats for one corner region of the image (2×2 grid cells) — used to place
 * the brand wordmark where it interferes least with the photograph.
 *
 * @param {object} forensics
 * @param {'bottom-right'|'bottom-left'|'top-right'|'top-left'} corner
 * @returns {{ mean, spread, meanDetail, quiet } | null}
 */
function cornerStats(forensics, corner) {
  const luma = forensics?.luma?.grid;
  const detail = forensics?.detail?.grid;
  if (!Array.isArray(luma) || !luma.length) return null;
  const rows = luma.length;
  const cols = luma[0].length;
  const rIdx = corner.startsWith("top") ? [0, 1] : [rows - 2, rows - 1];
  const cIdx = corner.endsWith("left") ? [0, 1] : [cols - 2, cols - 1];

  let sum = 0;
  let dSum = 0;
  let min = Infinity;
  let max = -Infinity;
  let n = 0;
  for (const r of rIdx) {
    for (const c of cIdx) {
      const l = luma[r]?.[c];
      if (typeof l !== "number") continue;
      sum += l;
      dSum += detail?.[r]?.[c] ?? 0;
      if (l < min) min = l;
      if (l > max) max = l;
      n += 1;
    }
  }
  if (!n) return null;
  const meanDetail = dSum / n;
  const spread = max - min;
  return {
    mean: sum / n,
    spread,
    meanDetail,
    quiet: clamp(1 - (0.6 * meanDetail + 0.4 * spread), 0, 1),
  };
}

module.exports = {
  resolveTextContrast,
  bandStats,
  cornerStats,
  // exported for known-answer contrast tests; they take GAMMA grid gray and
  // linearize internally per the sRGB transfer.
  contrastWhiteOver,
  contrastDarkOver,
  srgbToLinear,
  TARGET_CONTRAST,
  SCRIM_MIN,
  SCRIM_MAX,
  INK_DARK_LUMA,
};
