/**
 * Crop solver.
 *
 * The contract is simple and absolute: every role defines a REQUIRED region
 * of the subject (the whole head including hair for a portrait; head to feet
 * for a full length). A crop either contains that region or the solver says
 * the photo does not fit the frame. Nothing downstream — layout, a user
 * drag, a zoom — can produce a crop that cuts the protected region.
 *
 * Inside that guarantee the solver composes like a photo editor: eye line
 * on the upper third, lead room in the direction of the gaze, more floor
 * than headroom on a full length, and no zoom past what the file's
 * resolution can print.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Print resolution floor (pixels per inch at final size) before we refuse to zoom further. */
export const PPI_TARGET = 240;
export const PPI_FLOOR = 150;

/**
 * Roles:
 *  - 'beauty'   face fills the frame; hair may be trimmed above the head but never the face.
 *  - 'portrait' head and shoulders; the whole head (hair included) is protected.
 *  - 'figure'   the look — head to the lowest visible point of the body when possible, at least to the hips.
 *  - 'full'     head to toe, nothing trimmed.
 *  - 'whole'    the photograph as composed: smallest possible crop, subject protected.
 */
export const ROLES = ['beauty', 'portrait', 'figure', 'full', 'whole'];

export function requiredRegion(s, role) {
  // Everything here is in image-normalised units.
  if (!s.known || !s.head) {
    // No subject knowledge: protect the central 80% so no edge crop can hurt much.
    return { x0: 0.1, x1: 0.9, y0: 0.08, y1: 0.92, unknown: true };
  }
  const fh = s.face ? s.face.size : (s.head.y1 - s.head.y0) * 0.75;
  const fw = s.face ? s.face.box.w : s.head.x1 - s.head.x0;
  const head = s.head;
  // Pads are in face units: crops never kiss the hair or the chin.
  const padY = fh * 0.12;
  const padX = fw * 0.18;

  if (role === 'beauty') {
    const f = s.face?.box || { x: head.x0, y: head.y0, w: head.x1 - head.x0, h: head.y1 - head.y0 };
    return {
      x0: f.x - fw * 0.1,
      x1: f.x + f.w + fw * 0.1,
      // Brow line to under the chin: hair above the forehead may be trimmed.
      y0: f.y - fh * 0.04,
      y1: head.y1 + padY * 0.5,
    };
  }
  const headR = { x0: head.x0 - padX, x1: head.x1 + padX, y0: head.y0 - padY, y1: head.y1 + padY };
  if (role === 'portrait') {
    const shoulders = s.shoulderY != null ? Math.min(s.shoulderY, head.y1 + fh * 0.9) : head.y1 + fh * 0.5;
    return { ...headR, y1: Math.max(headR.y1, shoulders) };
  }
  const body = s.body;
  // A body that already runs off the side of the photograph can't be
  // "protected" horizontally — only the head and the in-frame outline can.
  const bx0 = body.x0 <= 0.015 ? headR.x0 - fw * 0.6 : body.x0 - padX * 0.5;
  const bx1 = body.x1 >= 0.985 ? headR.x1 + fw * 0.6 : body.x1 + padX * 0.5;
  if (role === 'full' || role === 'whole') {
    return {
      x0: Math.min(headR.x0, bx0),
      x1: Math.max(headR.x1, bx1),
      y0: headR.y0,
      y1: s.feetInFrame ? body.y1 + fh * 0.12 : body.y1,
    };
  }
  // figure: to the hips at least, to the whole visible body when it fits.
  const hip = s.hipY != null ? s.hipY + fh * 0.6 : Math.min(body.y1, head.y1 + fh * 3.5);
  return {
    x0: Math.min(headR.x0, body.x0 <= 0.015 ? headR.x0 - fw * 0.5 : body.x0),
    x1: Math.max(headR.x1, body.x1 >= 0.985 ? headR.x1 + fw * 0.5 : body.x1),
    y0: headR.y0,
    y1: Math.max(headR.y1, Math.min(body.y1, hip)),
  };
}

/** Composition targets per role: eye line from the top, and face height share. */
const TARGET = {
  beauty: { eye: 0.42, face: 0.5 },
  portrait: { eye: 0.36, face: 0.3 },
  figure: { eye: 0.2, face: null },
  full: { eye: null, face: null },
  whole: { eye: null, face: null },
};

/**
 * Solve a crop.
 * @param {object} s       describeSubject() output
 * @param {number} aspect  frame width / height
 * @param {object} opts    { role, frameHeightIn, adjust: {x, y, zoom} }
 *   adjust.x / adjust.y  : user-chosen crop centre in image-normalised units
 *   adjust.zoom          : 1 = solver's choice; >1 tighter; <1 looser
 * @returns {{ x, y, w, h, feasible, ... }} crop rectangle in image-normalised units
 */
export function solveCrop(s, aspect, opts = {}) {
  const role = opts.role || 'whole';
  const W = s.width;
  const H = s.height;
  const R0 = requiredRegion(s, role);
  const R = {
    x0: clamp(R0.x0, 0, 1) * W,
    x1: clamp(R0.x1, 0, 1) * W,
    y0: clamp(R0.y0, 0, 1) * H,
    y1: clamp(R0.y1, 0, 1) * H,
  };
  const Rw = R.x1 - R.x0;
  const Rh = R.y1 - R.y0;

  // Optional safe window (frame-normalised): the protected region must sit
  // inside it — this is how type is kept off the subject.
  const sf = opts.safe || { x0: 0, y0: 0, x1: 1, y1: 1 };
  const sw = sf.x1 - sf.x0;
  const sh = sf.y1 - sf.y0;

  // Largest crop of this aspect inside the image.
  const ch0 = Math.min(H, W / aspect);
  const chMin = Math.max(Rh / sh, Rw / (aspect * sw));
  const feasible = chMin <= ch0 + 0.5;

  if (!feasible) {
    return {
      feasible: false,
      // How much of the required region a max crop would lose (for ranking).
      overflow: chMin / ch0,
      role,
      required: R0,
    };
  }

  // Resolution floor: don't zoom past PPI_TARGET at the printed size.
  const chRes = opts.frameHeightIn ? Math.min(ch0, opts.frameHeightIn * PPI_TARGET) : 0;
  const t = TARGET[role] || TARGET.whole;
  let ch;
  if (t.face && s.face && !opts.target) ch = (s.face.size * H) / t.face;
  else ch = ch0;
  if (opts.target?.zoom) ch = ch / opts.target.zoom;
  if (opts.adjust?.zoom) ch = ch / opts.adjust.zoom;
  ch = clamp(ch, Math.max(chMin, chRes), ch0);
  const cw = ch * aspect;

  // Desired placement.
  let cx;
  let top;
  const face = s.face;
  if (s.known && face) {
    const fcx = face.cx * W;
    // Lead room: leave space on the side the subject faces.
    const lead = clamp(face.yaw || 0, -1, 1) * 0.1 * cw;
    if (role === 'full' || role === 'whole') {
      const bodyCx = ((s.body.x0 + s.body.x1) / 2) * W;
      cx = bodyCx * 0.65 + fcx * 0.35 + lead * 0.5;
    } else {
      cx = fcx + lead;
    }
    if (t.eye != null && face.eyeY != null) {
      top = face.eyeY * H - t.eye * ch;
    } else {
      // More floor than headroom: 40% of the vertical slack above the head.
      top = R.y0 - 0.4 * (ch - Rh);
    }
  } else {
    cx = ((R.x0 + R.x1) / 2);
    top = R.y0 - 0.4 * (ch - Rh);
  }
  // Art-directed framing: land the face centre at (tx, ty) of the frame,
  // the way a designer places a portrait. The clamps below still enforce
  // the protected region and the image bounds.
  if (opts.target && face && !(opts.adjust && opts.adjust.x != null)) {
    const fcy = (face.box.y + face.box.h / 2) * H;
    cx = face.cx * W + (0.5 - (opts.target.tx ?? 0.5)) * cw;
    top = fcy - (opts.target.ty ?? 0.36) * ch;
  }
  if (opts.adjust && opts.adjust.x != null) cx = opts.adjust.x * W;
  if (opts.adjust && opts.adjust.y != null) top = opts.adjust.y * H - ch / 2;

  // Enforce: required region inside the (safe part of the) crop, crop inside the image.
  let left = cx - cw / 2;
  left = clamp(left, R.x1 - sf.x1 * cw, R.x0 - sf.x0 * cw);
  left = clamp(left, 0, W - cw);
  top = clamp(top, R.y1 - sf.y1 * ch, R.y0 - sf.y0 * ch);
  top = clamp(top, 0, H - ch);

  // Never end a frame on a joint: nudge the bottom edge (and, failing that,
  // the side edges) to mid-limb, within the same constraints.
  const joints = s.joints || [];
  if (joints.length) {
    const near = (edge, v, span) => Math.abs(edge - v) < span * 0.035;
    const topMin = Math.max(0, R.y1 - sf.y1 * ch);
    const topMax = Math.min(H - ch, R.y0 - sf.y0 * ch);
    const hits = (t) => joints.some((j) => near(t + ch, j.y * H, ch) && j.x * W > left && j.x * W < left + cw);
    if (hits(top)) {
      for (const d of [-0.04, 0.04, -0.07, 0.07, -0.1, 0.1]) {
        const t = top + d * ch;
        if (t >= topMin && t <= topMax && !hits(t)) {
          top = t;
          break;
        }
      }
    }
    const leftMin = Math.max(0, R.x1 - sf.x1 * cw);
    const leftMax = Math.min(W - cw, R.x0 - sf.x0 * cw);
    const sideHits = (l) => joints.some((j) => (near(l, j.x * W, cw) || near(l + cw, j.x * W, cw)) && j.y * H > top && j.y * H < top + ch);
    if (sideHits(left)) {
      for (const d of [-0.04, 0.04, -0.07, 0.07]) {
        const l = left + d * cw;
        if (l >= leftMin && l <= leftMax && !sideHits(l)) {
          left = l;
          break;
        }
      }
    }
  }

  // The image edge can win over the safe window when the photo has no room
  // (e.g. no headroom above the hair). Then this frame cannot honour the
  // window, and the caller must choose another composition.
  const e = 0.5;
  if (R.x0 < left + sf.x0 * cw - e || R.x1 > left + sf.x1 * cw + e || R.y0 < top + sf.y0 * ch - e || R.y1 > top + sf.y1 * ch + e) {
    return { feasible: false, overflow: 1, role, required: R0, reason: 'safe-window' };
  }

  const ppi = opts.frameHeightIn ? ch / opts.frameHeightIn : null;
  return {
    feasible: true,
    role,
    x: left / W,
    y: top / H,
    w: cw / W,
    h: ch / H,
    retained: (cw * ch) / (W * H),
    // How much room the required region leaves (1 = loose, 0 = touching both edges).
    slack: 1 - Math.max(Rw / (cw * sw), Rh / (ch * sh)),
    ppi,
    lowRes: ppi != null && ppi < PPI_FLOOR,
    required: R0,
  };
}

/**
 * Score how well an image serves a slot. Higher is better; -Infinity means
 * the photo cannot fill this slot without cutting the subject.
 */
export function scoreFit(s, aspect, role, frameHeightIn, safe) {
  const c = solveCrop(s, aspect, { role, frameHeightIn, safe });
  if (!c.feasible) return { score: -Infinity, crop: c };
  let score = 0;
  // Keep as much of the photographer's frame as possible.
  score += c.retained * 2;
  // Breathing room around the protected region.
  score += clamp(c.slack, 0, 0.5) * 1.5;
  if (c.ppi != null) score += c.ppi >= PPI_TARGET ? 0.6 : c.ppi >= PPI_FLOOR ? 0.2 : -2;
  return { score, crop: c };
}

/** Map a crop onto an <img> inside a frame: returns percentage geometry. */
export function cropToStyle(crop) {
  return {
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
  };
}
