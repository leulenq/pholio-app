/**
 * Image forensics (atelier engine v2).
 *
 * Measures the actual pixels of a talent's photographs so the composition
 * engine can derive design parameters from the subject's own imagery —
 * dominant palette, luminance structure, visually "quiet" regions safe for
 * typography — instead of selecting among prebuilt templates.
 *
 * Contract: tasks/comp-card-atelier-spec.md §A.
 *
 * Field semantics:
 * - luma.grid: 9 rows × 6 cols, row-major, row 0 = TOP of the image, values
 *   0..1 (0 = black). Built by block-averaging a 48×72 grayscale decode.
 * - detail.grid: same dimensions; per-block pixel variance normalized to
 *   0..1 (raw variance of 0..1 grayscale values divided by 0.04 and clamped).
 *   Calibration: studio-flat backdrops ≈ 0.000x raw, busy photographic
 *   texture at this scale ≈ 0.02–0.05, a half-black/half-white block 0.25 —
 *   so 0.04 maps "clearly busy" to 1.0 while keeping flats at ~0.
 * - quiet: per-edge band quietness, 0..1. For a band B of grid cells:
 *     quietness = 1 − (0.6 · meanDetail(B) + 0.4 · lumaSpread(B))
 *   where lumaSpread = max(luma) − min(luma) within the band. Bands of
 *   depth 2 and 3 (rows for top/bottom, cols for left/right) are scored and
 *   the best is reported with its depth (bandRows / bandCols).
 * - palette: ≤5 dominant colors (population descending; population is the
 *   fraction of sampled pixels, 0..1) from a 16×16 RGB decode bucketed at
 *   3 bits/channel with near-color merging (RGB distance < 48).
 * - warmth: clamp(2 · (meanR − meanB) / 255, −1, 1).
 * - saturation: mean of per-pixel (max−min)/255 over the 16×16 sample.
 * - contrast: clamp(2 · stddev(luma 48×72), 0, 1).
 * - isDark: luma.mean < 0.42.
 *
 * Engineering: sharp is lazy-required; everything is fail-soft — any decode
 * or pipeline failure yields null, never a throw. Deterministic for
 * identical input buffers.
 */

const GRID_ROWS = 9;
const GRID_COLS = 6;
const LUMA_W = 48;
const LUMA_H = 72;
const PALETTE_DIM = 16;
const FORENSICS_VERSION = 2; // v2: + focal (attention) for type safety

let sharpModule;
let sharpLoadFailed = false;

function getSharp() {
  if (sharpModule) return sharpModule;
  if (sharpLoadFailed) return null;
  try {
    // eslint-disable-next-line global-require
    sharpModule = require("sharp");
    return sharpModule;
  } catch (err) {
    sharpLoadFailed = true;
    return null;
  }
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Block-average a raw grayscale buffer (LUMA_W×LUMA_H, 1 channel) into the
 * luma and detail grids.
 */
function buildGrids(raw) {
  const blockW = LUMA_W / GRID_COLS; // 8
  const blockH = LUMA_H / GRID_ROWS; // 8
  const luma = [];
  const detail = [];
  let rawMax = 0;

  for (let gr = 0; gr < GRID_ROWS; gr++) {
    const lumaRow = [];
    const detailRow = [];
    for (let gc = 0; gc < GRID_COLS; gc++) {
      let sum = 0;
      let sumSq = 0;
      const n = blockW * blockH;
      for (let y = gr * blockH; y < (gr + 1) * blockH; y++) {
        for (let x = gc * blockW; x < (gc + 1) * blockW; x++) {
          const v = raw[y * LUMA_W + x] / 255;
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      if (variance > rawMax) rawMax = variance;
      lumaRow.push(round4(clamp01(mean)));
      detailRow.push(variance);
    }
    luma.push(lumaRow);
    detail.push(detailRow);
  }

  // Normalize detail: raw variance of 0..1 values; see calibration note in
  // the module header (0.04 ≈ clearly busy texture at this sample scale).
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      detail[r][c] = round4(clamp01(detail[r][c] / 0.04));
    }
  }
  return { luma, detail };
}

function bandCells(luma, detail, edge, depth) {
  const cells = [];
  if (edge === "top" || edge === "bottom") {
    const rows =
      edge === "top"
        ? [...Array(depth).keys()]
        : [...Array(depth).keys()].map((i) => GRID_ROWS - 1 - i);
    for (const r of rows) {
      for (let c = 0; c < GRID_COLS; c++) {
        cells.push({ l: luma[r][c], d: detail[r][c] });
      }
    }
  } else {
    const cols =
      edge === "left"
        ? [...Array(depth).keys()]
        : [...Array(depth).keys()].map((i) => GRID_COLS - 1 - i);
    for (const c of cols) {
      for (let r = 0; r < GRID_ROWS; r++) {
        cells.push({ l: luma[r][c], d: detail[r][c] });
      }
    }
  }
  return cells;
}

function scoreBand(cells) {
  if (!cells.length) return 0;
  let dSum = 0;
  let lMin = Infinity;
  let lMax = -Infinity;
  for (const cell of cells) {
    dSum += cell.d;
    if (cell.l < lMin) lMin = cell.l;
    if (cell.l > lMax) lMax = cell.l;
  }
  const meanDetail = dSum / cells.length;
  const lumaSpread = clamp01(lMax - lMin);
  return round4(clamp01(1 - (0.6 * meanDetail + 0.4 * lumaSpread)));
}

function buildQuiet(luma, detail) {
  const quiet = {};
  for (const edge of ["top", "bottom"]) {
    let best = { score: 0, bandRows: 2 };
    for (const depth of [2, 3]) {
      const score = scoreBand(bandCells(luma, detail, edge, depth));
      if (score > best.score) best = { score, bandRows: depth };
    }
    quiet[edge] = best;
  }
  for (const edge of ["left", "right"]) {
    let best = { score: 0, bandCols: 2 };
    for (const depth of [2, 3]) {
      const score = scoreBand(bandCells(luma, detail, edge, depth));
      if (score > best.score) best = { score, bandCols: depth };
    }
    quiet[edge] = best;
  }
  return quiet;
}

function rgbToHex(r, g, b) {
  const h = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function colorStats(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    sat: round4((max - min) / 255),
    luma: round4((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255),
  };
}

/**
 * Dominant palette from a raw RGB(A) PALETTE_DIM² sample: 3-bit/channel
 * bucketing, near-color merge (< 48 RGB distance), top 5 by population.
 */
function buildPalette(raw, channels) {
  const total = PALETTE_DIM * PALETTE_DIM;
  const buckets = new Map();
  let sumR = 0;
  let sumB = 0;
  let satSum = 0;

  for (let i = 0; i < total; i++) {
    const r = raw[i * channels];
    const g = raw[i * channels + 1];
    const b = raw[i * channels + 2];
    sumR += r;
    sumB += b;
    satSum += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const candidates = [...buckets.values()]
    .map((bucket) => ({
      n: bucket.n,
      r: bucket.r / bucket.n,
      g: bucket.g / bucket.n,
      b: bucket.b / bucket.n,
    }))
    .sort((a, b) => b.n - a.n);

  const merged = [];
  for (const cand of candidates) {
    const near = merged.find(
      (m) =>
        Math.sqrt(
          (m.r - cand.r) ** 2 + (m.g - cand.g) ** 2 + (m.b - cand.b) ** 2,
        ) < 48,
    );
    if (near) {
      const n = near.n + cand.n;
      near.r = (near.r * near.n + cand.r * cand.n) / n;
      near.g = (near.g * near.n + cand.g * cand.n) / n;
      near.b = (near.b * near.n + cand.b * cand.n) / n;
      near.n = n;
    } else {
      merged.push({ ...cand });
    }
  }

  const palette = merged
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((m) => ({
      hex: rgbToHex(m.r, m.g, m.b),
      population: round4(m.n / total),
      ...colorStats(m.r, m.g, m.b),
    }));

  return {
    palette,
    warmth: round4(Math.min(1, Math.max(-1, (2 * (sumR - sumB)) / total / 255))),
    saturation: round4(clamp01(satSum / total)),
  };
}

/**
 * Measure one image buffer.
 * @param {Buffer} input
 * @returns {Promise<object|null>} Forensics or null on any failure.
 */
async function measureImage(input) {
  const sharp = getSharp();
  if (!sharp || !input || !Buffer.isBuffer(input) || input.length === 0) {
    return null;
  }
  try {
    const base = sharp(input, { failOn: "none" });
    const meta = await base.metadata();
    const width = meta.width || null;
    const height = meta.height || null;
    if (!width || !height) return null;

    const [gray, rgb] = await Promise.all([
      base
        .clone()
        .resize(LUMA_W, LUMA_H, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer(),
      base
        .clone()
        .resize(PALETTE_DIM, PALETTE_DIM, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);

    // Attention focal point (sharp's saliency tracks faces in portraiture).
    // Powers the type-safety protected-subject regions. Best-effort.
    let focal = null;
    try {
      const { info } = await base
        .clone()
        .resize(64, 64, { fit: "cover", position: sharp.strategy.attention })
        .toBuffer({ resolveWithObject: true });
      const scale = Math.max(64 / width, 64 / height);
      const scaledW = width * scale;
      const scaledH = height * scale;
      if (Number.isFinite(info.attentionX) && Number.isFinite(info.attentionY)) {
        focal = {
          x: round4(clamp01(info.attentionX / scaledW)),
          y: round4(clamp01(info.attentionY / scaledH)),
        };
      } else if (Number.isFinite(info.cropOffsetLeft)) {
        focal = {
          x: round4(clamp01((-info.cropOffsetLeft + 32) / scaledW)),
          y: round4(clamp01((-info.cropOffsetTop + 32) / scaledH)),
        };
      }
    } catch {
      focal = null;
    }

    const { luma, detail } = buildGrids(gray);
    const quiet = buildQuiet(luma, detail);
    const { palette, warmth, saturation } = buildPalette(
      rgb.data,
      rgb.info.channels,
    );

    let lumaSum = 0;
    let lumaSqSum = 0;
    const n = LUMA_W * LUMA_H;
    for (let i = 0; i < n; i++) {
      const v = gray[i] / 255;
      lumaSum += v;
      lumaSqSum += v * v;
    }
    const mean = lumaSum / n;
    const stddev = Math.sqrt(Math.max(0, lumaSqSum / n - mean * mean));

    return {
      width,
      height,
      aspect: round4(width / height),
      luma: {
        rows: GRID_ROWS,
        cols: GRID_COLS,
        grid: luma,
        mean: round4(mean),
        isDark: mean < 0.42,
      },
      detail: { grid: detail },
      quiet,
      palette,
      warmth,
      saturation,
      contrast: round4(clamp01(2 * stddev)),
      focal,
      version: FORENSICS_VERSION,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Measure many images with bounded concurrency and a per-image timeout.
 * One slow or broken image never delays or breaks the others.
 *
 * @param {Array<object>} images — rows with at least an `id`
 * @param {object} options
 * @param {(image: object) => Promise<Buffer|null>} options.fetchBuffer
 * @param {number} [options.timeoutMs=2500]
 * @param {number} [options.concurrency=3]
 * @returns {Promise<Map<string, object|null>>}
 */
async function forensicsForImages(images, options = {}) {
  const { fetchBuffer, timeoutMs = 2500, concurrency = 3 } = options;
  const results = new Map();
  const list = Array.isArray(images) ? images.filter((img) => img && img.id) : [];
  if (!list.length || typeof fetchBuffer !== "function") {
    list.forEach((img) => results.set(img.id, null));
    return results;
  }

  const queue = [...list];
  async function worker() {
    while (queue.length) {
      const image = queue.shift();
      if (!image) break;
      let timer = null;
      try {
        const work = (async () => {
          const buffer = await fetchBuffer(image);
          if (!buffer) return null;
          return measureImage(buffer);
        })();
        // Pre-handle late rejections so a timed-out promise can't become an
        // unhandled rejection after the race resolves.
        work.catch(() => {});
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        });
        const result = await Promise.race([work, timeout]);
        results.set(image.id, result || null);
      } catch (err) {
        results.set(image.id, null);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }

  const workers = [];
  const poolSize = Math.max(1, Math.min(concurrency, list.length));
  for (let i = 0; i < poolSize; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

module.exports = {
  measureImage,
  forensicsForImages,
  buildQuiet, // recompute per-edge quietness for a transformed grid (crop-space.js)
  FORENSICS_VERSION,
  GRID_ROWS,
  GRID_COLS,
};
