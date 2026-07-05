/**
 * Subject alpha matte (perception engine, P1).
 *
 * Produces an EXACT subject silhouette per photograph so the composition
 * engine can derive true protected-subject regions and the negative-space map
 * (largest type-safe rectangles) instead of the 9×6 backdrop-deviation guess
 * in image-forensics.js. Also enables the masked-subject cutout motif and
 * behind-subject z-ordering (type behind the talent).
 *
 * Proposal: docs/comp-card-frontpage-intelligence-proposal.md §2.1
 * ("Subject mask: @imgly/background-removal-node ... stored as a downscaled
 * mask").
 *
 * ── Enabling real mattes (optional, heavy) ────────────────────────────────
 * Requires:  npm install @imgly/background-removal-node
 * That package is an ISNet/U²-Net-class matting model on ONNX runtime. It is
 * HEAVY and, by default, fetches its model weights over the network on first
 * use (configurable to a self-hosted/local path via the `publicPath` option).
 * In a sandbox with no network / no model cache, inference will fail — that is
 * expected and handled: computeMatte() returns null. The existing forensics
 * subject grid is the fallback the rest of the system already consumes, so a
 * null matte degrades cleanly (it just isn't sharpened to pixel-exact).
 *
 * When the dependency is absent this module still loads and computeMatte()
 * returns null. Lazy-required, fail-soft, never throws. Deterministic for a
 * given input + model.
 *
 * maskGrid orientation: row 0 = TOP of the image, column 0 = LEFT. Each cell
 * is the mean subject alpha coverage of that block in 0..1 (1 = fully
 * subject, 0 = fully background) — same row-major, top-first convention as
 * image-forensics.js luma/detail grids.
 */

const MATTE_VERSION = 1;

let sharpModule;
let sharpLoadFailed = false;
let removerModule;
let removerLoadFailed = false;

/** Lazy-require sharp; null (cached) if unavailable. */
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

/** Lazy-require the background-removal matting fn; null (cached) if absent. */
function getRemover() {
  if (removerModule) return removerModule;
  if (removerLoadFailed) return null;
  try {
    // eslint-disable-next-line global-require
    const mod = require("@imgly/background-removal-node");
    const fn = mod && (mod.removeBackground || (mod.default && mod.default.removeBackground));
    if (typeof fn !== "function") {
      removerLoadFailed = true;
      return null;
    }
    removerModule = fn;
    return removerModule;
  } catch (err) {
    removerLoadFailed = true;
    return null;
  }
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Normalize the matting result (Blob | Buffer | Uint8Array) to a Buffer. */
async function resultToBuffer(result) {
  if (!result) return null;
  if (Buffer.isBuffer(result)) return result;
  if (typeof result.arrayBuffer === "function") {
    return Buffer.from(await result.arrayBuffer());
  }
  if (result instanceof Uint8Array) return Buffer.from(result);
  return null;
}

/**
 * Compute a downscaled subject alpha matte.
 * @param {Buffer} buffer — encoded source image
 * @param {object} [options]
 * @param {number} [options.gridW=12] — mask grid columns
 * @param {number} [options.gridH=18] — mask grid rows (portrait 2:3 default)
 * @returns {Promise<{ maskGrid:number[][], width:number, height:number,
 *   version:number }|null>} null on any failure (dep absent, no model/network,
 *   decode error). maskGrid is gridH rows × gridW cols, row 0 = top.
 */
async function computeMatte(buffer, options = {}) {
  const { gridW = 12, gridH = 18 } = options;
  const sharp = getSharp();
  const removeBackground = getRemover();
  if (
    !sharp ||
    !removeBackground ||
    !buffer ||
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0 ||
    !Number.isInteger(gridW) ||
    !Number.isInteger(gridH) ||
    gridW <= 0 ||
    gridH <= 0
  ) {
    return null;
  }

  try {
    // Original dimensions (recorded so callers can map the grid back).
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    const width = meta.width || null;
    const height = meta.height || null;
    if (!width || !height) return null;

    // Run matting → an RGBA cutout (background alpha = 0).
    const cutout = await removeBackground(buffer);
    const cutoutBuffer = await resultToBuffer(cutout);
    if (!cutoutBuffer) return null;

    // Downscale the ALPHA channel to the grid. fit:"fill" so each cell maps to
    // a fixed block of the (resampled) image; row-major raw is top-to-bottom.
    const { data } = await sharp(cutoutBuffer, { failOn: "none" })
      .ensureAlpha()
      .resize(gridW, gridH, { fit: "fill" })
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (!data || data.length < gridW * gridH) return null;

    const maskGrid = [];
    for (let r = 0; r < gridH; r++) {
      const row = [];
      for (let c = 0; c < gridW; c++) {
        row.push(round4(clamp01(data[r * gridW + c] / 255)));
      }
      maskGrid.push(row);
    }

    return { maskGrid, width, height, version: MATTE_VERSION };
  } catch (err) {
    return null;
  }
}

/**
 * STUDIO matte — sharp-only subject coverage for clean-backdrop photography
 * (the dominant comp-card case), no ML dependency. The backdrop color is
 * estimated PER ROW from the frame's left/right edges (studio seamless
 * varies vertically, not horizontally); a cell's coverage is the fraction
 * of its pixels that deviate from that row's backdrop.
 *
 * Honesty gate: when the edges disagree (a busy/location backdrop) the
 * image is UNVERIFIABLE and this returns null — the same refusal discipline
 * as type-safety. Grids from this path carry source:'studio': good enough
 * for negative-space type placement, NOT for cutout rendering (that needs
 * a real alpha matte, source:'alpha').
 *
 * @param {Buffer} buffer
 * @param {object} [options] — { gridW=12, gridH=18 }
 * @returns {Promise<{ maskGrid, width, height, version, source:'studio' }|null>}
 */
async function computeStudioMatte(buffer, options = {}) {
  const { gridW = 12, gridH = 18 } = options;
  const sharp = getSharp();
  if (!sharp || !buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const SAMPLE_W = 96;
  const SAMPLE_H = 144;
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    const width = meta.width || null;
    const height = meta.height || null;
    if (!width || !height) return null;

    const { data, info } = await sharp(buffer, { failOn: "none" })
      .resize(SAMPLE_W, SAMPLE_H, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const px = (x, y) => {
      const i = (y * SAMPLE_W + x) * ch;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const dist = (a, b) =>
      Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

    // per-row backdrop from the outer edges; the edges must agree
    const EDGE = 3;
    const rowBackdrop = [];
    let agree = 0;
    for (let y = 0; y < SAMPLE_H; y++) {
      const left = [0, 0, 0];
      const right = [0, 0, 0];
      for (let x = 0; x < EDGE; x++) {
        const l = px(x, y);
        const r = px(SAMPLE_W - 1 - x, y);
        for (let k = 0; k < 3; k++) { left[k] += l[k] / EDGE; right[k] += r[k] / EDGE; }
      }
      if (dist(left, right) < 36) agree += 1;
      rowBackdrop.push([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2]);
    }
    if (agree / SAMPLE_H < 0.8) return null; // not a clean studio backdrop

    // subject mask → grid coverage
    const cellW = SAMPLE_W / gridW;
    const cellH = SAMPLE_H / gridH;
    const maskGrid = [];
    let subjectTotal = 0;
    for (let gr = 0; gr < gridH; gr++) {
      const row = [];
      for (let gc = 0; gc < gridW; gc++) {
        let subject = 0;
        let n = 0;
        for (let y = Math.floor(gr * cellH); y < Math.floor((gr + 1) * cellH); y++) {
          for (let x = Math.floor(gc * cellW); x < Math.floor((gc + 1) * cellW); x++) {
            n += 1;
            if (dist(px(x, y), rowBackdrop[y]) > 42) subject += 1;
          }
        }
        const cov = n ? subject / n : 0;
        subjectTotal += cov;
        row.push(round4(clamp01(cov)));
      }
      maskGrid.push(row);
    }
    const subjectFrac = subjectTotal / (gridW * gridH);
    // sanity: a portrait has a real figure, not nothing and not everything
    if (subjectFrac < 0.04 || subjectFrac > 0.85) return null;

    return { maskGrid, width, height, version: MATTE_VERSION, source: "studio" };
  } catch (err) {
    return null;
  }
}

/**
 * Best available matte: the real alpha matte when @imgly is installed,
 * else the studio estimate, else null.
 */
async function computeBestMatte(buffer, options = {}) {
  const alpha = await computeMatte(buffer, options);
  if (alpha) return { ...alpha, source: "alpha" };
  return computeStudioMatte(buffer, options);
}

module.exports = {
  computeMatte,
  computeStudioMatte,
  computeBestMatte,
  MATTE_VERSION,
};
