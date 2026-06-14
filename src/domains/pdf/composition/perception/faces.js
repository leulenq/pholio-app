/**
 * Face boxes (perception engine, P1).
 *
 * Detects REAL face rectangles per photograph so type-safety can enforce hard
 * face-exclusion exactly (0% name/face-box intersection — the 200-seed test
 * in the proposal) instead of the attention-focal proxy currently produced by
 * image-forensics.js (`focal`). Faces also feed the negative-space map used to
 * place type by search.
 *
 * Proposal: docs/comp-card-frontpage-intelligence-proposal.md §2.1
 * ("Face boxes: @vladmandic/human ... or OpenCV-YuNet via onnxruntime").
 *
 * ── Enabling real face detection (optional, heavy) ────────────────────────
 * Preferred:  npm install @vladmandic/human @tensorflow/tfjs-node
 *   @vladmandic/human ships its own model weights under node_modules but its
 *   Node entry requires a TFJS backend (@tensorflow/tfjs-node, a native
 *   addon). Without that backend require() throws — handled: detectFaces()
 *   returns [].
 * Alternative:  onnxruntime-node + an OpenCV YuNet ONNX model — swap the
 *   getDetector()/runDetector() internals; the public interface is unchanged.
 *
 * When no detector is available this module still loads and detectFaces()
 * returns []. Lazy-required, fail-soft, never throws.
 *
 * Box coordinates are image FRACTIONS in 0..1: { x, y, w, h } with origin at
 * the top-left, x→right, y→down (same orientation as the matte/forensics
 * grids and image-forensics `focal`).
 */

let sharpModule;
let sharpLoadFailed = false;
let humanInstance;
let humanLoadFailed = false;

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

/**
 * Lazy-build a singleton @vladmandic/human detector configured for face
 * detection only. Returns the Human instance or null if the dep / backend is
 * unavailable. Requiring Human throws without a TFJS backend — caught here.
 */
function getHuman() {
  if (humanInstance) return humanInstance;
  if (humanLoadFailed) return null;
  try {
    // eslint-disable-next-line global-require
    const mod = require("@vladmandic/human");
    const Human = mod && (mod.Human || mod.default || mod);
    if (typeof Human !== "function") {
      humanLoadFailed = true;
      return null;
    }
    humanInstance = new Human({
      // Faces only: disable the body/hand/gesture/emotion sub-models.
      modelBasePath: undefined,
      cacheSensitivity: 0,
      face: {
        enabled: true,
        detector: { enabled: true, return: false },
        mesh: { enabled: false },
        iris: { enabled: false },
        description: { enabled: false },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      gesture: { enabled: false },
      object: { enabled: false },
    });
    return humanInstance;
  } catch (err) {
    humanLoadFailed = true;
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
 * Detect faces in an image.
 * @param {Buffer} buffer — encoded source image
 * @returns {Promise<Array<{x:number,y:number,w:number,h:number}>>} boxes in
 *   0..1 image fractions; [] on any failure (dep/backend absent, decode error,
 *   no faces). Never throws.
 */
async function detectFaces(buffer) {
  const sharp = getSharp();
  if (!sharp || !buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return [];
  }
  const human = getHuman();
  if (!human) return [];

  let tensor = null;
  try {
    // Decode to a raw RGB tensor [1, h, w, 3] for Human's node path.
    const { data, info } = await sharp(buffer, { failOn: "none" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    if (!width || !height || channels < 3) return [];

    if (typeof human.load === "function") await human.load();
    const tf = human.tf;
    if (!tf || typeof tf.tensor !== "function") return [];

    tensor = tf.tensor(new Uint8Array(data), [1, height, width, channels], "int32");
    const result = await human.detect(tensor);
    const faces = (result && Array.isArray(result.face) ? result.face : [])
      .map((f) => {
        // Human face.box = [x, y, w, h] in source pixels.
        const box = Array.isArray(f.box) ? f.box : null;
        if (!box || box.length < 4) return null;
        const [bx, by, bw, bh] = box;
        if (!(bw > 0) || !(bh > 0)) return null;
        return {
          x: round4(clamp01(bx / width)),
          y: round4(clamp01(by / height)),
          w: round4(clamp01(bw / width)),
          h: round4(clamp01(bh / height)),
        };
      })
      .filter(Boolean);
    return faces;
  } catch (err) {
    return [];
  } finally {
    try {
      if (tensor && typeof tensor.dispose === "function") tensor.dispose();
    } catch (err) {
      /* ignore */
    }
  }
}

/**
 * The largest face box (by area) from a list, or null.
 * @param {Array<{x:number,y:number,w:number,h:number}>} boxes
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
function primaryFace(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) return null;
  let best = null;
  let bestArea = -1;
  for (const b of boxes) {
    if (!b || !Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
    const area = b.w * b.h;
    if (area > bestArea) {
      bestArea = area;
      best = b;
    }
  }
  return best;
}

module.exports = {
  detectFaces,
  primaryFace,
};
