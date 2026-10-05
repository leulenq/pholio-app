/**
 * Subject model — turns a perception record into the facts a designer
 * actually reasons about: where the head is (including hair), where the body
 * ends, what framing the photograph really is, which way the subject looks.
 *
 * Pure and deterministic. Every coordinate is normalised to the image.
 * When perception is missing, `describeSubject` returns a conservative
 * record (`known: false`) so the crop solver protects the whole frame
 * rather than guessing.
 */

// MediaPipe pose indices.
const P = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8,
  shoulderL: 11, shoulderR: 12, hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const inFrame = (p, slack = 0.005) => p && p.x >= -slack && p.x <= 1 + slack && p.y >= -slack && p.y <= 1 + slack;
const seen = (p, min = 0.55) => p && (p.v ?? 1) >= min && inFrame(p);

export const FRAMING = ['close-up', 'head-and-shoulders', 'half', 'three-quarter', 'full-length'];

function pickPose(poses, face) {
  if (!poses?.length) return null;
  if (!face) return poses[0];
  const fx = face.box.x + face.box.w / 2;
  const fy = face.box.y + face.box.h / 2;
  let best = null;
  let bestD = Infinity;
  for (const pose of poses) {
    const n = pose[P.nose];
    const d = Math.hypot(n.x - fx, n.y - fy);
    if (d < bestD) {
      bestD = d;
      best = pose;
    }
  }
  return bestD < 0.25 ? best : poses[0];
}

/** Face box from pose landmarks when the face is too small for the face model. */
function faceFromPose(pose, aspect) {
  const pts = [P.nose, P.eyeL, P.eyeR, P.earL, P.earR].map((i) => pose[i]).filter((p) => p.v > 0.5);
  if (pts.length < 2) return null;
  const sL = pose[P.shoulderL];
  const sR = pose[P.shoulderR];
  let w = Math.abs(pose[P.earL].x - pose[P.earR].x) * 1.15;
  if (w < 0.01 && sL.v > 0.5 && sR.v > 0.5) w = Math.abs(sL.x - sR.x) * 0.45;
  if (w < 0.01) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  // A face is ~1.35x taller than wide; convert through the image aspect.
  const h = w * 1.35 * aspect;
  return {
    box: { x: cx - w / 2, y: cy - h * 0.45, w, h },
    forehead: { x: cx, y: cy - h * 0.45 },
    chin: { x: cx, y: cy + h * 0.55 },
    eyes: [pose[P.eyeL], pose[P.eyeR]].map((p) => ({ x: p.x, y: p.y })),
    nose: { x: pose[P.nose].x, y: pose[P.nose].y },
    yaw: clamp(((pose[P.nose].x - (pose[P.earL].x + pose[P.earR].x) / 2) / (w || 1)) * -3, -1, 1),
    eyeOpen: null,
    mouthOpen: null,
    fromPose: true,
  };
}

/** Topmost row of hair/person directly above the face — the real top of the head. */
function headTopFromMask(mask, face) {
  if (!mask || !face) return null;
  const { cols, rows, person, hair } = mask;
  const x0 = Math.max(0, Math.floor((face.box.x + face.box.w * 0.15) * cols));
  const x1 = Math.min(cols - 1, Math.ceil((face.box.x + face.box.w * 0.85) * cols) - 1);
  const startRow = Math.min(rows - 1, Math.floor((face.box.y + face.box.h * 0.3) * rows));
  let top = startRow;
  let gap = 0;
  for (let y = startRow; y >= 0; y--) {
    let cov = 0;
    for (let x = x0; x <= x1; x++) cov = Math.max(cov, Math.max(person[y][x], hair[y][x] * 1.2));
    if (cov >= 0.2) {
      top = y;
      gap = 0;
    } else if (++gap > 1) break;
  }
  // Grid cells are coarse — step half a cell above the last occupied row.
  return clamp((top - 0.5) / rows, 0, 1);
}

/** Bounding box of mask cells with real person coverage, within a vertical span. */
function maskExtent(mask, y0 = 0, y1 = 1) {
  if (!mask) return null;
  const { cols, rows, person } = mask;
  let minX = cols, maxX = -1, minY = rows, maxY = -1;
  const r0 = Math.floor(y0 * rows);
  const r1 = Math.min(rows - 1, Math.ceil(y1 * rows));
  for (let y = r0; y <= r1; y++) {
    for (let x = 0; x < cols; x++) {
      if (person[y][x] >= 0.3) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x0: minX / cols, x1: (maxX + 1) / cols, y0: minY / rows, y1: (maxY + 1) / rows };
}

/**
 * The subject's own silhouette: flood-fill the person mask from the face, so
 * other people and furniture-like false positives that don't touch the
 * subject are excluded. Returns the region's extent.
 */
function subjectRegion(mask, seedPt) {
  if (!mask || !seedPt) return null;
  const { cols, rows, person } = mask;
  const sx = clamp(Math.floor(seedPt.x * cols), 0, cols - 1);
  const sy = clamp(Math.floor(seedPt.y * rows), 0, rows - 1);
  // Find the nearest occupied cell to the seed (the face cell can be skin-only).
  let start = null;
  for (let r = 0; r < 4 && !start; r++) {
    for (let dy = -r; dy <= r && !start; dy++) {
      for (let dx = -r; dx <= r && !start; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x >= 0 && y >= 0 && x < cols && y < rows && person[y][x] >= 0.3) start = [x, y];
      }
    }
  }
  if (!start) return null;
  const seenCells = new Uint8Array(cols * rows);
  const stack = [start];
  let minX = cols, maxX = -1, minY = rows, maxY = -1, area = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = y * cols + x;
    if (seenCells[k]) continue;
    seenCells[k] = 1;
    if (person[y][x] < 0.3) continue;
    area++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > 0) stack.push([x - 1, y]);
    if (x < cols - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < rows - 1) stack.push([x, y + 1]);
  }
  return { x0: minX / cols, x1: (maxX + 1) / cols, y0: minY / rows, y1: (maxY + 1) / rows, area: area / (cols * rows), touchesBottom: maxY >= rows - 1 };
}

function backgroundCalm(tone, mask) {
  if (!tone) return null;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < tone.rows; y++) {
    for (let x = 0; x < tone.cols; x++) {
      if (mask) {
        const my = Math.min(mask.rows - 1, Math.floor(((y + 0.5) / tone.rows) * mask.rows));
        const mx = Math.min(mask.cols - 1, Math.floor(((x + 0.5) / tone.cols) * mask.cols));
        if (mask.person[my][mx] > 0.1) continue;
      }
      sum += tone.detail[y][x];
      n++;
    }
  }
  if (!n) return null;
  // detail is luma std-dev per cell; ~0.02 is seamless paper, >0.15 is a busy room.
  return clamp(1 - (sum / n - 0.02) / 0.14, 0, 1);
}

/**
 * Describe the subject of an image.
 * @param {object|null} perception output of analyzeImage
 * @param {{width:number,height:number}} dims fallback dimensions
 */
export function describeSubject(perception, dims = {}) {
  const width = perception?.width || dims.width || 1000;
  const height = perception?.height || dims.height || 1250;
  const aspect = width / height;
  const base = { width, height, aspect, known: false };
  if (!perception) return base;

  const faces = perception.faces || [];
  const pose = pickPose(perception.poses, faces[0]);
  let face = faces[0] || null;
  if (!face && pose) face = faceFromPose(pose, aspect);

  const people = Math.max(faces.filter((f) => !faces[0] || f.box.w * f.box.h > faces[0].box.w * faces[0].box.h * 0.35).length, perception.poses?.length || 0);

  if (!face && !pose) {
    const ext = maskExtent(perception.mask);
    return { ...base, known: Boolean(ext), noPerson: !ext, extent: ext, calm: backgroundCalm(perception.tone, perception.mask) };
  }

  const faceH = face ? face.box.h : 0.1;
  const maskTop = headTopFromMask(perception.mask, face);
  // Hair can sit well above the forehead landmark; never trust less than 30% of a face height of headroom.
  const foreheadTop = face ? face.box.y - faceH * 0.3 : null;
  const headTop = clamp(Math.min(maskTop ?? foreheadTop, foreheadTop ?? 1), 0, 1);
  const chin = face ? face.chin.y : null;

  const vis = (i) => pose && seen(pose[i]);
  const feet = [P.toeL, P.toeR, P.heelL, P.heelR, P.ankleL, P.ankleR].filter(vis).map((i) => pose[i].y);
  const knees = [P.kneeL, P.kneeR].filter(vis);
  const hips = [P.hipL, P.hipR].filter(vis);
  const shoulders = [P.shoulderL, P.shoulderR].filter(vis);

  // The subject's silhouette (flood fill from the face) is the ground truth
  // for extent; pose landmarks refine it where clothing hides the outline.
  const seedPt = face ? { x: face.box.x + face.box.w / 2, y: face.box.y + face.box.h / 2 } : pose ? pose[P.nose] : null;
  const region = subjectRegion(perception.mask, seedPt);

  let bottom = chin != null ? chin + faceH * 0.15 : 0.5;
  const lm = [...shoulders, ...hips, ...knees].map((i) => pose[i].y);
  if (lm.length) bottom = Math.max(bottom, ...lm);
  if (feet.length) bottom = Math.max(bottom, Math.max(...feet) + faceH * 0.2);
  if (region) bottom = Math.max(bottom, region.y1);
  bottom = clamp(bottom, 0, 1);
  const cutAtBottom = region ? region.touchesBottom : bottom > 0.985;

  // Framing from body proportion: the head is ~1/7.5 of standing height.
  const headH = chin != null ? chin - headTop : null;
  const span = headH ? (bottom - headTop) / headH : 0;
  const feetInFrame = !cutAtBottom && (feet.length >= 2 || span >= 6.2);
  const feetCut = cutAtBottom && (knees.length > 0 || span >= 5);

  let framing;
  if (feetInFrame) framing = 'full-length';
  else if (knees.length || span >= 4.6) framing = 'three-quarter';
  else if (hips.length || span >= 3.2) framing = 'half';
  else if (shoulders.length || span >= 1.8) framing = 'head-and-shoulders';
  else framing = 'close-up';
  if (face && faceH > 0.4) framing = 'close-up';

  const ext = maskExtent(perception.mask, headTop, bottom);
  const cols = region || (ext ? { x0: ext.x0, x1: ext.x1 } : null);
  let bodyX0 = cols ? cols.x0 : face ? face.box.x - face.box.w : 0.2;
  let bodyX1 = cols ? cols.x1 : face ? face.box.x + face.box.w * 2 : 0.8;
  if (pose) {
    const xs = [P.shoulderL, P.shoulderR, P.hipL, P.hipR, P.kneeL, P.kneeR, P.ankleL, P.ankleR].filter(vis).map((i) => pose[i].x);
    if (xs.length) {
      bodyX0 = Math.min(bodyX0, Math.min(...xs) - 0.02);
      bodyX1 = Math.max(bodyX1, Math.max(...xs) + 0.02);
    }
  }
  if (face) {
    bodyX0 = Math.min(bodyX0, face.box.x);
    bodyX1 = Math.max(bodyX1, face.box.x + face.box.w);
  }

  const head = face
    ? {
        x0: clamp(face.box.x - face.box.w * 0.2, 0, 1),
        x1: clamp(face.box.x + face.box.w * 1.2, 0, 1),
        y0: headTop,
        y1: clamp(chin + faceH * 0.08, 0, 1),
      }
    : null;

  const eyeY = face ? (face.eyes[0].y + face.eyes[1].y) / 2 : null;
  const shoulderSpan = shoulders.length === 2 ? Math.abs(pose[P.shoulderL].x - pose[P.shoulderR].x) : null;

  return {
    ...base,
    known: true,
    people,
    face: face
      ? {
          box: face.box,
          eyeY,
          cx: face.box.x + face.box.w / 2,
          yaw: face.yaw ?? 0,
          eyeOpen: face.eyeOpen,
          smile: face.mouthOpen != null ? face.mouthOpen > 0.12 && face.mouthWidth > 0.42 : null,
          fromPose: Boolean(face.fromPose),
          // Face height as a fraction of image height.
          size: faceH,
        }
      : null,
    head,
    body: { x0: clamp(bodyX0, 0, 1), x1: clamp(bodyX1, 0, 1), y0: headTop, y1: bottom },
    shoulderY: shoulders.length ? Math.max(...shoulders.map((i) => pose[i].y)) : chin != null ? chin + faceH * 0.6 : null,
    hipY: hips.length ? Math.max(...hips.map((i) => pose[i].y)) : null,
    shoulderSpan,
    // Where the soles meet the floor (heel/toe landmarks), for figure scaling.
    feetY: feet.length ? Math.max(...[P.toeL, P.toeR, P.heelL, P.heelR].filter(vis).map((i) => pose[i].y), ...feet) : null,
    // Visible joints: crops must not land on these (knee, ankle, elbow, wrist).
    joints: pose ? [13, 14, 15, 16, 25, 26, 27, 28].filter(vis).map((i) => ({ x: pose[i].x, y: pose[i].y })) : [],
    framing,
    feetInFrame,
    feetCut,
    calm: backgroundCalm(perception.tone, perception.mask),
  };
}
