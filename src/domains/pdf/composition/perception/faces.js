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
 * Fallback (always available, no native deps): OpenCV compiled to
 * WebAssembly (`@techstark/opencv-js`) running the vendored Haar frontal-face
 * cascade in `./cascades/`. ~150–350 ms on a 640px probe. Human is tried
 * first when installed because it is the stronger detector.
 *
 * When neither detector is available this module still loads and
 * detectFaces() returns []. Lazy-required, fail-soft, never throws.
 *
 * Box coordinates are image FRACTIONS in 0..1: { x, y, w, h } with origin at
 * the top-left, x→right, y→down (same orientation as the matte/forensics
 * grids and image-forensics `focal`).
 */

const fs = require("fs");
const path = require("path");

let sharpModule;
let sharpLoadFailed = false;
let humanInstance;
let humanLoadFailed = false;
let cvPromise = null;
let cvLoadFailed = false;

const CASCADE_PATH = path.join(__dirname, "cascades", "haarcascade_frontalface_default.xml");
const CASCADE_CANDIDATES = [
  CASCADE_PATH,
  path.join(process.cwd(), "src", "domains", "pdf", "composition", "perception", "cascades", "haarcascade_frontalface_default.xml"),
];
/** Longest edge of the greyscale probe the cascade scans. */
const CV_PROBE_MAX = 640;
const CV_SCALE_FACTOR = 1.08;
const CV_MIN_NEIGHBORS = 6;
const CV_MIN_SIZE = 20;

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
 * Lazy-load OpenCV.js (wasm) with the Haar cascade registered in its virtual
 * FS. Resolves to { cv, classifier } or null; cached; never throws.
 */
function getOpenCv() {
  if (cvLoadFailed) return Promise.resolve(null);
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    // eslint-disable-next-line global-require
    const cv = await require("@techstark/opencv-js");
    await new Promise((resolve) => {
      if (cv && cv.Mat) resolve();
      else cv.onRuntimeInitialized = resolve;
    });
    let xml = null;
    for (const candidate of CASCADE_CANDIDATES) {
      try {
        xml = fs.readFileSync(candidate);
        break;
      } catch (err) {
        /* next */
      }
    }
    if (!xml) throw new Error("cascade missing");
    cv.FS_createDataFile("/", "frontalface.xml", xml, true, false, false);
    const classifier = new cv.CascadeClassifier();
    if (!classifier.load("frontalface.xml")) throw new Error("cascade failed to load");
    return { cv, classifier };
  })().catch(() => {
    cvLoadFailed = true;
    cvPromise = null;
    return null;
  });
  return cvPromise;
}

/**
 * Haar cascade detection on a greyscale probe. Boxes in image fractions.
 * @param {Buffer} buffer
 * @returns {Promise<Array<{x:number,y:number,w:number,h:number}>>}
 */
async function detectFacesOpenCv(buffer) {
  const sharp = getSharp();
  const runtime = await getOpenCv();
  if (!sharp || !runtime) return [];
  const { cv, classifier } = runtime;
  let mat = null;
  let rects = null;
  try {
    const { data, info } = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(CV_PROBE_MAX, CV_PROBE_MAX, { fit: "inside", withoutEnlargement: true })
      .greyscale()
      .toColourspace("b-w")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || info.channels !== 1) return [];
    mat = new cv.Mat(info.height, info.width, cv.CV_8UC1);
    mat.data.set(data);
    rects = new cv.RectVector();
    classifier.detectMultiScale(mat, rects, CV_SCALE_FACTOR, CV_MIN_NEIGHBORS, 0, new cv.Size(CV_MIN_SIZE, CV_MIN_SIZE));
    const faces = [];
    for (let i = 0; i < rects.size(); i += 1) {
      const r = rects.get(i);
      if (!(r.width > 0) || !(r.height > 0)) continue;
      faces.push({
        x: round4(clamp01(r.x / info.width)),
        y: round4(clamp01(r.y / info.height)),
        w: round4(clamp01(r.width / info.width)),
        h: round4(clamp01(r.height / info.height)),
      });
    }
    return faces;
  } catch (err) {
    return [];
  } finally {
    try {
      if (mat) mat.delete();
      if (rects) rects.delete();
    } catch (err) {
      /* ignore */
    }
  }
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
  if (!human) return detectFacesOpenCv(buffer);

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
 * The face to build around: among boxes of comparable size (at least half
 * the largest area) the highest one in the frame. In photographs of people
 * the head is the topmost face-like thing; Haar false positives (a knee, a
 * hand, a fold of fabric) sit below it and are often as large.
 * @param {Array<{x:number,y:number,w:number,h:number}>} boxes
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
function primaryFace(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) return null;
  const valid = boxes.filter((b) => b && Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0);
  if (!valid.length) return null;
  const largest = Math.max(...valid.map((b) => b.w * b.h));
  return valid
    .filter((b) => b.w * b.h >= largest * 0.5)
    .sort((a, b) => a.y - b.y)[0];
}

module.exports = {
  detectFaces,
  detectFacesOpenCv,
  primaryFace,
};
