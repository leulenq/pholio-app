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
 * ink is (1.05)/(Lband + 0.05) and for near-black ink (Lband + 0.05)/(0.055).
 * Targets: ≥ 4.5 for confident placement; a scrim multiplies the effective
 * backdrop toward its own tone, so the required scrim strength is solved
 * from the contrast deficit. Bands that are both mid-luma AND busy (high
 * detail / luma spread) can't be rescued tastefully → 'relocate'.
 */

const TARGET_CONTRAST = 4.5;
const SCRIM_MIN = 0.2;
const SCRIM_MAX = 0.62;
const INK_DARK_LUMA = 0.06; // ≈ #1A1815 relative luminance

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function contrastWhiteOver(luma) {
  return 1.05 / (luma + 0.05);
}

function contrastDarkOver(luma) {
  return (luma + 0.05) / (INK_DARK_LUMA + 0.05);
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
  // target holds. effL = L·(1−s) + Ltone·s ⇒ solve s for the target.
  const direction = ink === "light" ? "darken" : "lighten";
  const tone = direction === "darken" ? 0.02 : 0.97;
  const worst = direction === "darken" ? stats.max : stats.min;
  const needed =
    direction === "darken"
      ? 1.05 / TARGET_CONTRAST - 0.05 // max effective backdrop for white ink
      : TARGET_CONTRAST * (INK_DARK_LUMA + 0.05) - 0.05; // min for dark ink
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
  TARGET_CONTRAST,
  SCRIM_MIN,
  SCRIM_MAX,
};
