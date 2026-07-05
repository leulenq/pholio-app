/**
 * Crop-space transform (audit P0-2).
 *
 * Hero photographs render `object-fit: cover` with a focal-driven
 * `object-position`, so the pixels actually VISIBLE in a cell are a
 * sub-window of the raw image. Every on-photo verification (quiet bands,
 * face zone, subject mask, matte negative space) historically consulted
 * grids measured on the RAW image — meaning a "verified quiet bottom band"
 * could be cropped out of view while the band under the name on the page
 * held the talent's body.
 *
 * This module computes the visible window for a cover crop and remaps the
 * forensics object (and matte grids) into that window, so consumers keep
 * their existing raw-image-space contracts while reasoning about what the
 * page actually shows.
 *
 * Fail-soft: missing aspects/positions return the identity (null window /
 * the original forensics) — exactly the pre-fix behavior.
 */

const { buildQuiet, GRID_ROWS, GRID_COLS } = require("./image-forensics");

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Parse a CSS object-position value ("50% 18%") into fractions.
 * @returns {{ x: number, y: number }}
 */
function parseObjectPosition(value) {
  const fallback = { x: 0.5, y: 0.5 };
  if (typeof value !== "string") return fallback;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return fallback;
  const num = (s) => {
    const m = /^(-?[\d.]+)%$/.exec(s);
    return m ? clamp01(Number(m[1]) / 100) : null;
  };
  const x = num(parts[0]);
  const y = num(parts[1]);
  if (x == null || y == null) return fallback;
  return { x, y };
}

/**
 * Visible sub-window of an image cover-fitted into a cell.
 *
 * @param {object} args
 * @param {number} args.imageAspect — raw image w/h
 * @param {number} args.cellAspect — cell w/h
 * @param {string|{x,y}} [args.objectPosition="50% 50%"]
 * @returns {{ x0, y0, x1, y1 }|null} fractions of the raw image that are
 *   visible, or null when aspects are unusable (callers treat null as
 *   identity).
 */
function visibleCropWindow({ imageAspect, cellAspect, objectPosition } = {}) {
  const ai = Number(imageAspect);
  const ac = Number(cellAspect);
  if (!Number.isFinite(ai) || ai <= 0 || !Number.isFinite(ac) || ac <= 0) return null;
  const pos =
    objectPosition && typeof objectPosition === "object"
      ? { x: clamp01(Number(objectPosition.x) || 0.5), y: clamp01(Number(objectPosition.y) || 0.5) }
      : parseObjectPosition(objectPosition);
  if (ai > ac) {
    // image wider than cell → horizontal crop
    const visW = ac / ai;
    const x0 = (1 - visW) * pos.x;
    return { x0: round4(x0), y0: 0, x1: round4(x0 + visW), y1: 1 };
  }
  if (ai < ac) {
    // image taller than cell → vertical crop
    const visH = ai / ac;
    const y0 = (1 - visH) * pos.y;
    return { x0: 0, y0: round4(y0), x1: 1, y1: round4(y0 + visH) };
  }
  return { x0: 0, y0: 0, x1: 1, y1: 1 };
}

function isIdentity(window) {
  return (
    !window ||
    (window.x1 - window.x0 > 0.995 && window.y1 - window.y0 > 0.995)
  );
}

/** Nearest-cell resample of a rows×cols grid into the window. */
function resampleGrid(grid, window, rows, cols) {
  const srcRows = grid.length;
  const srcCols = grid[0].length;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    const ty = (r + 0.5) / rows;
    const y = window.y0 + ty * (window.y1 - window.y0);
    const sr = Math.min(srcRows - 1, Math.max(0, Math.floor(y * srcRows)));
    for (let c = 0; c < cols; c++) {
      const tx = (c + 0.5) / cols;
      const x = window.x0 + tx * (window.x1 - window.x0);
      const sc = Math.min(srcCols - 1, Math.max(0, Math.floor(x * srcCols)));
      row.push(grid[sr][sc]);
    }
    out.push(row);
  }
  return out;
}

/**
 * Remap a forensics object into the visible crop window: luma/detail grids
 * are resampled, quiet bands recomputed on the resampled grids, the focal
 * point re-expressed in window coordinates (clamped — a face cropped to the
 * edge still projects a protective zone at that edge).
 *
 * Identity windows (or missing inputs) return the original object.
 *
 * @param {object} forensics — image-forensics output
 * @param {{x0,y0,x1,y1}|null} window
 * @returns {object} forensics-shaped object valid in window space
 */
function cropForensics(forensics, window) {
  if (!forensics || isIdentity(window)) return forensics;
  const lumaGrid = forensics.luma?.grid;
  if (!Array.isArray(lumaGrid) || !lumaGrid.length) return forensics;
  const detailGrid =
    Array.isArray(forensics.detail?.grid) && forensics.detail.grid.length
      ? forensics.detail.grid
      : lumaGrid.map((row) => row.map(() => 0));

  const luma = resampleGrid(lumaGrid, window, GRID_ROWS, GRID_COLS);
  const detail = resampleGrid(detailGrid, window, GRID_ROWS, GRID_COLS);
  const quiet = buildQuiet(luma, detail);

  let mean = 0;
  for (const row of luma) for (const v of row) mean += v;
  mean /= GRID_ROWS * GRID_COLS;

  let focal = forensics.focal || null;
  if (focal && Number.isFinite(focal.x) && Number.isFinite(focal.y)) {
    const spanX = window.x1 - window.x0;
    const spanY = window.y1 - window.y0;
    focal = {
      x: round4(clamp01((focal.x - window.x0) / (spanX || 1))),
      y: round4(clamp01((focal.y - window.y0) / (spanY || 1))),
    };
  }

  return {
    ...forensics,
    luma: {
      ...forensics.luma,
      grid: luma,
      mean: round4(mean),
      isDark: mean < 0.42,
    },
    detail: { ...forensics.detail, grid: detail },
    quiet,
    focal,
    cropWindow: window,
  };
}

/**
 * Remap a matte subject-coverage grid (row 0 = top, values 0..1) into the
 * visible window. Identity/missing inputs return the original grid.
 */
function cropMatteGrid(matteGrid, window) {
  if (!Array.isArray(matteGrid) || !matteGrid.length || isIdentity(window)) {
    return matteGrid;
  }
  return resampleGrid(matteGrid, window, matteGrid.length, matteGrid[0].length);
}

module.exports = {
  parseObjectPosition,
  visibleCropWindow,
  cropForensics,
  cropMatteGrid,
};
