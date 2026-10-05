/**
 * Perception — what is actually in the photograph.
 *
 * Runs MediaPipe (face landmarks, body pose, hair/person segmentation) in the
 * browser and reduces the output to a compact, serialisable record. All
 * coordinates are normalised to the image (0..1). Nothing here makes design
 * decisions; `model/subject.js` turns this record into the regions the crop
 * solver must protect.
 *
 * The same module runs in the talent's browser (studio) and in headless
 * Chromium (scripts), so results are identical wherever a card is composed.
 */
import { FaceLandmarker, FilesetResolver, ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';

export const PERCEPTION_VERSION = 4;

const ASSET_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const asset = (p) => `${ASSET_BASE.replace(/\/$/, '')}/compcard/${p}`;

const MAX_SIDE = 1024;
const GRID_COLS = 32;

let runtimePromise = null;

function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(asset('wasm'));
      // CPU delegate: deterministic across machines (GPU results drift by driver).
      const base = (model) => ({ baseOptions: { modelAssetPath: asset(`models/${model}`), delegate: 'CPU' }, runningMode: 'IMAGE' });
      const [face, pose, seg] = await Promise.all([
        FaceLandmarker.createFromOptions(fileset, { ...base('face_landmarker.task'), numFaces: 4, minFaceDetectionConfidence: 0.45 }),
        PoseLandmarker.createFromOptions(fileset, { ...base('pose_landmarker_full.task'), numPoses: 2, minPoseDetectionConfidence: 0.45 }),
        ImageSegmenter.createFromOptions(fileset, { ...base('selfie_multiclass_256x256.tflite'), outputCategoryMask: true, outputConfidenceMasks: false }),
      ]);
      return { face, pose, seg };
    })().catch((err) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function toCanvas(img) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

const r4 = (n) => Math.round(n * 10000) / 10000;
const pt = (p) => ({ x: r4(p.x), y: r4(p.y) });

function boxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: r4(x0), y: r4(y0), w: r4(x1 - x0), h: r4(y1 - y0) };
}

function summariseFace(lm) {
  const box = boxOf(lm);
  const nose = lm[1];
  const cheekL = lm[234];
  const cheekR = lm[454];
  const span = cheekR.x - cheekL.x || 1e-6;
  // Yaw: -1 (subject faces image-left) … +1 (faces image-right).
  const yaw = r4(((nose.x - cheekL.x) / span - 0.5) * 2);
  const eyeL = lm[468] || lm[33];
  const eyeR = lm[473] || lm[263];
  // Eye openness: lid gap over eye width, both eyes.
  const open = (top, bot, a, b) => Math.abs(lm[bot].y - lm[top].y) / (Math.abs(lm[b].x - lm[a].x) || 1e-6);
  const eyeOpen = r4((open(159, 145, 33, 133) + open(386, 374, 362, 263)) / 2);
  // Mouth: open gap over width — a smile shows teeth, a beauty face is closed.
  const mouthOpen = r4(Math.abs(lm[14].y - lm[13].y) / (Math.abs(lm[291].x - lm[61].x) || 1e-6));
  const mouthWidth = r4(Math.abs(lm[291].x - lm[61].x) / (box.w || 1e-6));
  return {
    box,
    forehead: pt(lm[10]),
    chin: pt(lm[152]),
    eyes: [pt(eyeL), pt(eyeR)],
    nose: pt(nose),
    yaw,
    eyeOpen,
    mouthOpen,
    mouthWidth,
  };
}

function summarisePose(landmarks) {
  return landmarks.map((p) => ({ x: r4(p.x), y: r4(p.y), v: r4(p.visibility ?? 0) }));
}

function categoryGrids(mask, w, h) {
  const cols = GRID_COLS;
  const rows = Math.max(1, Math.round((GRID_COLS * h) / w));
  const mw = mask.width;
  const mh = mask.height;
  const data = mask.getAsUint8Array();
  const person = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const hair = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const face = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const counts = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let y = 0; y < mh; y++) {
    const gy = Math.min(rows - 1, Math.floor((y / mh) * rows));
    for (let x = 0; x < mw; x++) {
      const gx = Math.min(cols - 1, Math.floor((x / mw) * cols));
      const c = data[y * mw + x];
      counts[gy][gx]++;
      if (c !== 0) person[gy][gx]++;
      if (c === 1) hair[gy][gx]++;
      if (c === 3) face[gy][gx]++;
    }
  }
  const norm = (g) => g.map((row, y) => row.map((v, x) => r4(v / (counts[y][x] || 1))));
  return { cols, rows, person: norm(person), hair: norm(hair), face: norm(face) };
}

function tonalGrid(ctx, w, h) {
  // 32 columns: fine enough to see lettering on a T-shirt from the page.
  const cols = 32;
  const rows = Math.max(1, Math.round((cols * h) / w));
  const { data } = ctx.getImageData(0, 0, w, h);
  const luma = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const varc = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const n = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const rgb = Array.from({ length: rows }, () => Array.from({ length: cols }, () => [0, 0, 0]));
  const step = Math.max(1, Math.floor(Math.min(w, h) / 384));
  for (let y = 0; y < h; y += step) {
    const gy = Math.min(rows - 1, Math.floor((y / h) * rows));
    for (let x = 0; x < w; x += step) {
      const gx = Math.min(cols - 1, Math.floor((x / w) * cols));
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      luma[gy][gx] += l;
      varc[gy][gx] += l * l;
      n[gy][gx]++;
      rgb[gy][gx][0] += r;
      rgb[gy][gx][1] += g;
      rgb[gy][gx][2] += b;
    }
  }
  const out = { cols, rows, luma: [], detail: [], color: [] };
  for (let y = 0; y < rows; y++) {
    out.luma.push([]);
    out.detail.push([]);
    out.color.push([]);
    for (let x = 0; x < cols; x++) {
      const c = n[y][x] || 1;
      const m = luma[y][x] / c;
      out.luma[y].push(r4(m));
      out.detail[y].push(r4(Math.sqrt(Math.max(0, varc[y][x] / c - m * m))));
      out.color[y].push(rgb[y][x].map((v) => Math.round(v / c)));
    }
  }
  return out;
}

/** Tiny perceptual hash (dHash 8x8) for near-duplicate detection. */
function dhash(img) {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = data[(y * 9 + x) * 4] + data[(y * 9 + x) * 4 + 1] + data[(y * 9 + x) * 4 + 2];
      const b = data[(y * 9 + x + 1) * 4] + data[(y * 9 + x + 1) * 4 + 1] + data[(y * 9 + x + 1) * 4 + 2];
      bits += a > b ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

/**
 * Analyse one image. Returns a plain JSON record (see file header).
 * Throws only when the image itself cannot be loaded.
 */
export async function analyzeImage(src) {
  const [img, rt] = await Promise.all([loadImage(src), loadRuntime()]);
  const { canvas, ctx, w, h } = toCanvas(img);

  const faceRes = rt.face.detect(canvas);
  const poseRes = rt.pose.detect(canvas);
  let grids = null;
  await new Promise((resolve) => {
    rt.seg.segment(canvas, (res) => {
      if (res.categoryMask) grids = categoryGrids(res.categoryMask, w, h);
      resolve();
    });
  });

  const faces = (faceRes.faceLandmarks || []).map(summariseFace).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const poses = (poseRes.landmarks || []).map(summarisePose);

  return {
    v: PERCEPTION_VERSION,
    width: img.naturalWidth,
    height: img.naturalHeight,
    faces,
    poses,
    mask: grids,
    tone: tonalGrid(ctx, w, h),
    hash: dhash(img),
  };
}
