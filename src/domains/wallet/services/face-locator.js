"use strict";

/**
 * Pholio ID — where is the face?
 *
 * A Wallet pass is a small object: the square thumbnail and the poster crop
 * live or die on the head being where the layout expects it. Saliency
 * (sharp's attention crop) follows contrast, not faces, so it is the last
 * resort here, not the first.
 *
 * Sources, best first, all fail-soft:
 *   1. face boxes from the perception engine (@vladmandic/human when
 *      installed; returns [] otherwise)
 *   2. a head estimate from the subject matte: the cached matte on the image
 *      row, else the sharp-only studio matte for clean backdrops
 *   3. the attention focal (crop-engine, corrected for shrink-on-load)
 *   4. the people prior the comp card uses: (0.5, 0.38)
 *
 * All coordinates are image fractions, origin top-left.
 */

const { detectFaces, primaryFace } = require("../../pdf/composition/perception/faces");
const { computeBestMatte } = require("../../pdf/composition/perception/matte");
const { computeFocalPoint } = require("../../pdf/composition/crop-engine");

const PEOPLE_PRIOR = Object.freeze({ x: 0.5, y: 0.38 });
/** On portrait frames the subject is framed centrally; saliency x is held to this band. */
const PORTRAIT_X_BAND = Object.freeze({ min: 0.3, max: 0.7 });

/** A grid cell counts as subject at or above this coverage. */
const SUBJECT_CELL = 0.35;
/** Head height ≈ head width × this (hair to chin, averaged over hairstyles). */
const HEAD_ASPECT = 1.35;
/** Face centre sits this far down the head box. */
const FACE_CENTRE_IN_HEAD = 0.55;

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function parseJsonish(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Estimate the face from a subject matte grid (rows × cols of 0..1 coverage).
 * The head is the top of the silhouette; its width in the first subject rows
 * gives its height, which gives the face centre.
 *
 * @param {number[][]} maskGrid — row 0 = top
 * @param {{ width: number, height: number }} [dims] — source aspect (cells are
 *   not square unless the grid matches the image aspect)
 * @returns {{ x: number, y: number, w: number, h: number }|null} face box (fractions)
 */
function headFromMatte(maskGrid, dims) {
  if (!Array.isArray(maskGrid) || !maskGrid.length || !Array.isArray(maskGrid[0])) return null;
  const rows = maskGrid.length;
  const cols = maskGrid[0].length;
  if (!cols) return null;
  const isSubject = (v) => Number(v) >= SUBJECT_CELL;
  const rowHasSubject = maskGrid.map((row) => row.some(isSubject));
  const top = rowHasSubject.indexOf(true);
  if (top < 0) return null;
  let bottom = top;
  while (bottom + 1 < rows && rowHasSubject[bottom + 1]) bottom += 1;
  const subjectRows = bottom - top + 1;

  // Head width from the top two subject rows (hair line), as a column span.
  const band = maskGrid.slice(top, Math.min(top + 2, bottom + 1));
  let left = cols;
  let right = -1;
  band.forEach((row) => row.forEach((v, c) => {
    if (isSubject(v)) { left = Math.min(left, c); right = Math.max(right, c); }
  }));
  if (right < left) return null;
  const headCols = right - left + 1;

  const aspect = dims && dims.width && dims.height ? dims.width / dims.height : cols / rows;
  const cellW = 1 / cols; // fraction of image width
  const cellH = 1 / rows; // fraction of image height
  const headW = headCols * cellW; // fraction of width
  // Convert width fraction to a height fraction through the image aspect.
  const headH = Math.min(subjectRows * cellH, headW * aspect * HEAD_ASPECT);
  if (!(headH > 0)) return null;

  // Centre x: coverage-weighted centroid of the rows the head occupies.
  const headRowCount = Math.max(1, Math.min(subjectRows, Math.round(headH / cellH)));
  let weight = 0;
  let sumX = 0;
  for (let r = top; r < top + headRowCount; r += 1) {
    maskGrid[r].forEach((v, c) => {
      const cov = Number(v) || 0;
      if (cov >= SUBJECT_CELL) { weight += cov; sumX += cov * (c + 0.5) * cellW; }
    });
  }
  const cx = weight ? sumX / weight : (left + right + 1) / 2 * cellW;
  const y = top * cellH;
  return { x: clamp01(cx - headW / 2), y: clamp01(y), w: Math.min(headW, 1), h: Math.min(headH, 1) };
}

function faceCentre(face) {
  return { x: clamp01(face.x + face.w / 2), y: clamp01(face.y + face.h * FACE_CENTRE_IN_HEAD) };
}

/**
 * Locate the subject of a photograph.
 * @param {Buffer} photo — image bytes (as stored; EXIF orientation is applied
 *   by the renderers, and every source here reads the same bytes)
 * @param {object} [image] — images row (cached matte reused when present)
 * @returns {Promise<{ focal: {x:number,y:number}, face: object|null, source: string }>}
 */
async function locateSubject(photo, image) {
  const faces = await detectFaces(photo).catch(() => []);
  const detected = primaryFace(faces);
  if (detected) return { focal: faceCentre(detected), face: detected, source: "detector" };

  const metadata = parseJsonish(image?.metadata);
  let matte = metadata.matte && Array.isArray(metadata.matte.maskGrid) ? metadata.matte : null;
  let matteSource = matte ? "matte-cached" : null;
  if (!matte) {
    matte = await computeBestMatte(photo).catch(() => null);
    matteSource = matte ? `matte-${matte.source || "computed"}` : null;
  }
  if (matte) {
    const head = headFromMatte(matte.maskGrid, { width: matte.width, height: matte.height });
    if (head) return { focal: faceCentre(head), face: head, source: matteSource };
  }

  const attention = await computeFocalPoint(photo).catch(() => null);
  if (attention) {
    // Saliency follows contrast (a hand, a bag, a bright shoulder). In
    // portrait-orientation photographs of people the head is in the upper
    // frame, so the prior caps how low saliency may place the focal point.
    const portrait = await isPortrait(photo);
    const y = portrait ? Math.min(attention.y, PEOPLE_PRIOR.y) : attention.y;
    const x = portrait ? Math.min(PORTRAIT_X_BAND.max, Math.max(PORTRAIT_X_BAND.min, attention.x)) : attention.x;
    const adjusted = x !== attention.x || y !== attention.y;
    return { focal: { x, y }, face: null, source: adjusted ? "attention+prior" : "attention" };
  }
  return { focal: { ...PEOPLE_PRIOR }, face: null, source: "prior" };
}

async function isPortrait(photo) {
  try {
    // eslint-disable-next-line global-require
    const sharp = require("sharp");
    const meta = await sharp(photo).rotate().metadata();
    return Boolean(meta.width && meta.height && meta.height > meta.width);
  } catch {
    return false;
  }
}

module.exports = { PEOPLE_PRIOR, PORTRAIT_X_BAND, headFromMatte, faceCentre, locateSubject };
