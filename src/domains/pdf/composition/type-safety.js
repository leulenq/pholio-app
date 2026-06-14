/**
 * Typography-placement safety (production blocker system).
 *
 * No text ships over a photograph unless it passes ALL of:
 *   1. CONTRAST — readable against the actual measured backdrop
 *      (contrast.js worst-cell WCAG math; a solved scrim is acceptable, a
 *      'relocate' verdict is a hard fail).
 *   2. QUIET ZONE — the band must be visually calm (forensics quiet score).
 *   3. PROTECTED SUBJECT — the band must not sit on the talent:
 *      - FACE ZONE: an exclusion region around the measured attention focal
 *        point (sharp saliency tracks faces in portraiture).
 *      - BODY: cells whose detail/luma deviate from the backdrop estimate
 *        (the subject mask). A band mostly made of subject cells fails.
 *
 * STRICT RULE: if the image cannot be verified (no forensics, or no focal
 * point for the face zone), on-image NAME placement is REFUSED outright —
 * unverifiable text goes on paper. This is the "no text ships unless it
 * passes" mandate, not a heuristic preference.
 *
 * The backdrop estimate comes from the four image corners (studio portraits
 * have clean corners); subject cells are those that differ from it in luma
 * or carry texture the backdrop lacks.
 */

const { resolveTextContrast } = require("./contrast");

const QUIET_MIN = 0.55; // band must be at least this calm
const SUBJECT_OCCUPANCY_MAX = 0.34; // > this fraction of subject cells fails
const FACE_HALF_HEIGHT = 0.16; // face zone half-height (fraction of image)
const FACE_HALF_WIDTH = 0.24; // face zone half-width (fraction of image)
const SUBJECT_LUMA_DELTA = 0.18;
const SUBJECT_DETAIL_MIN = 0.45;

function gridDims(forensics) {
  const grid = forensics?.luma?.grid;
  if (!Array.isArray(grid) || !grid.length) return null;
  return { rows: grid.length, cols: grid[0].length };
}

/**
 * Per-cell subject mask: true where the cell reads as the talent rather
 * than the backdrop. Backdrop luma is estimated from the four corner cells.
 * @returns {boolean[][]|null}
 */
function subjectGrid(forensics) {
  const dims = gridDims(forensics);
  if (!dims) return null;
  const { rows, cols } = dims;
  const luma = forensics.luma.grid;
  const detail = forensics.detail?.grid || [];
  const corners = [
    luma[0][0], luma[0][cols - 1], luma[rows - 1][0], luma[rows - 1][cols - 1],
  ].filter((v) => typeof v === "number");
  const bg = corners.length ? corners.reduce((a, b) => a + b, 0) / corners.length : 0.5;

  return luma.map((row, r) =>
    row.map((l, c) => {
      const d = detail[r]?.[c] ?? 0;
      return Math.abs(l - bg) > SUBJECT_LUMA_DELTA || d > SUBJECT_DETAIL_MIN;
    }),
  );
}

/**
 * Face exclusion zone from the attention focal point.
 * @returns {{ x0, x1, y0, y1 }|null} fractions of the image, or null when
 *   no focal point exists (callers must treat that as unverifiable).
 */
function faceZone(forensics) {
  const focal = forensics?.focal;
  if (!focal || !Number.isFinite(focal.x) || !Number.isFinite(focal.y)) return null;
  return {
    x0: Math.max(0, focal.x - FACE_HALF_WIDTH),
    x1: Math.min(1, focal.x + FACE_HALF_WIDTH),
    y0: Math.max(0, focal.y - FACE_HALF_HEIGHT),
    y1: Math.min(1, focal.y + FACE_HALF_HEIGHT),
  };
}

function bandCellIndexes(forensics, edge, depth) {
  const dims = gridDims(forensics);
  if (!dims) return [];
  const { rows, cols } = dims;
  const d = depth ||
    forensics.quiet?.[edge]?.bandRows ||
    forensics.quiet?.[edge]?.bandCols || 2;
  const out = [];
  if (edge === "top") {
    for (let r = 0; r < Math.min(d, rows); r++) for (let c = 0; c < cols; c++) out.push([r, c]);
  } else if (edge === "bottom") {
    for (let r = Math.max(0, rows - d); r < rows; r++) for (let c = 0; c < cols; c++) out.push([r, c]);
  } else if (edge === "left") {
    for (let c = 0; c < Math.min(d, cols); c++) for (let r = 0; r < rows; r++) out.push([r, c]);
  } else {
    for (let c = Math.max(0, cols - d); c < cols; c++) for (let r = 0; r < rows; r++) out.push([r, c]);
  }
  return out;
}

function cellInZone(r, c, rows, cols, zone) {
  // cell center in image fractions
  const y = (r + 0.5) / rows;
  const x = (c + 0.5) / cols;
  return x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1;
}

/**
 * Evaluate one on-image band for NAME-grade text.
 *
 * @param {object} input — { forensics, edge: 'top'|'bottom', depth? }
 * @returns {{
 *   ok: boolean,
 *   because: string,
 *   contrast: object|null,        // resolveTextContrast result when ok-path reached
 *   subjectOccupancy: number|null,
 *   faceOverlap: boolean|null,
 * }}
 */
function evaluateNameBand({ forensics, edge, depth } = {}) {
  const dims = gridDims(forensics);
  if (!dims) {
    return {
      ok: false,
      because: "image not measured — on-image type refused (unverifiable)",
      contrast: null, subjectOccupancy: null, faceOverlap: null,
    };
  }
  const zone = faceZone(forensics);
  if (!zone) {
    return {
      ok: false,
      because: "no measured focal point — face protection unverifiable, type goes on paper",
      contrast: null, subjectOccupancy: null, faceOverlap: null,
    };
  }

  const cells = bandCellIndexes(forensics, edge, depth);
  const mask = subjectGrid(forensics);
  const { rows, cols } = dims;

  let faceOverlap = false;
  let subjectCells = 0;
  for (const [r, c] of cells) {
    if (cellInZone(r, c, rows, cols, zone)) faceOverlap = true;
    if (mask?.[r]?.[c]) subjectCells += 1;
  }
  const subjectOccupancy = cells.length ? subjectCells / cells.length : 1;

  if (faceOverlap) {
    return {
      ok: false,
      because: `the ${edge} band intersects the face zone — name over a face is forbidden`,
      contrast: null, subjectOccupancy, faceOverlap,
    };
  }
  if (subjectOccupancy > SUBJECT_OCCUPANCY_MAX) {
    return {
      ok: false,
      because: `the ${edge} band sits on the talent (${Math.round(subjectOccupancy * 100)}% subject cells) — name over the body is forbidden`,
      contrast: null, subjectOccupancy, faceOverlap,
    };
  }
  const quiet = forensics.quiet?.[edge]?.score ?? 0;
  if (quiet < QUIET_MIN) {
    return {
      ok: false,
      because: `the ${edge} band is too busy (quiet ${quiet.toFixed(2)} < ${QUIET_MIN})`,
      contrast: null, subjectOccupancy, faceOverlap,
    };
  }
  const contrast = resolveTextContrast({ forensics, edge, depth });
  if (contrast.verdict === "relocate") {
    return {
      ok: false,
      because: `contrast unrescuable on the ${edge} band — ${contrast.because}`,
      contrast, subjectOccupancy, faceOverlap,
    };
  }
  return {
    ok: true,
    because: `${edge} band verified: clear of face and body, quiet ${quiet.toFixed(2)}, ${contrast.verdict === "safe" ? "contrast safe unaided" : "contrast restored by solved scrim"}`,
    contrast, subjectOccupancy, faceOverlap,
  };
}

/**
 * Is a 2×2 corner protected (face zone or mostly subject)? Used for the
 * wordmark. Lenient on missing focal (the mark is 6.5pt brand type, judged
 * additionally by quiet + gold-contrast scoring) — but a KNOWN face there
 * is always a veto.
 */
function cornerProtected(forensics, corner) {
  const dims = gridDims(forensics);
  if (!dims) return false;
  const { rows, cols } = dims;
  const rIdx = corner.startsWith("top") ? [0, 1] : [rows - 2, rows - 1];
  const cIdx = corner.endsWith("left") ? [0, 1] : [cols - 2, cols - 1];
  const zone = faceZone(forensics);
  // Without a focal point the subject mask cannot distinguish the talent
  // from a dark vignette corner — stay lenient (quiet + gold-contrast
  // scoring still governs); a KNOWN face is always a veto.
  if (!zone) return false;
  const focal = forensics.focal;
  const mask = subjectGrid(forensics);
  let subjectNearFocal = 0;
  for (const r of rIdx) {
    for (const c of cIdx) {
      if (cellInZone(r, c, rows, cols, zone)) return true;
      const y = (r + 0.5) / rows;
      const x = (c + 0.5) / cols;
      const nearFocal = Math.abs(x - focal.x) <= 0.38 && Math.abs(y - focal.y) <= 0.45;
      if (nearFocal && mask?.[r]?.[c]) subjectNearFocal += 1;
    }
  }
  return subjectNearFocal >= 3; // ≥3 of 4 corner cells on the talent
}

module.exports = {
  evaluateNameBand,
  subjectGrid,
  faceZone,
  cornerProtected,
  QUIET_MIN,
  SUBJECT_OCCUPANCY_MAX,
};
