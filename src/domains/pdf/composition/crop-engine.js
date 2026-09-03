/**
 * Crop Engine — comp card composition engine (WS-B)
 *
 * Turns a PoolAnalysis image + a layout slot into a concrete, joint-safe CSS
 * crop, and assigns images to a set of slots deterministically.
 *
 * Exports:
 *   resolveCrop(poolImage, slot) → Crop
 *     slot: { aspect: number (w/h), role: string|null, kind: 'hero'|'cell' }
 *     Crop: {
 *       fit: 'cover'|'contain',
 *       objectPosition: '50% 18%',           // focal-aware CSS value
 *       safety: { level: 'safe'|'caution'|'unsafe', notes: [string] },
 *       coverageLoss: number,                // fraction of image area lost
 *     }
 *   assignImagesToSlots(poolAnalysis, slots, { seed, locks }) →
 *     [{ slotIndex, imageId, crop }]
 *   computeFocalPoint(buffer) → Promise<{ x, y } | null>   (sharp attention)
 *
 * Focal source order (resolveCrop):
 *   1. metadata.focal { x, y } in 0–1 (validated, clamped)
 *   2. role heuristic:
 *        headshot       → { x: 0.5, y: 0.18 }   (eye-line upper third)
 *        three_quarter  → { x: 0.5, y: 0.25 }
 *        full_body      → { x: 0.5, y: 0.50 }   (with full-figure guard)
 *        editorial /
 *        lifestyle      → { x: 0.5, y: 0.35 }
 *   3. center { 0.5, 0.5 }
 *
 * Full-body guard (mandatory crop rule): if cover-cropping a full_body /
 * full_length image into the slot loses more than 18% of the image height,
 * safety degrades to 'caution' and the vertical position is biased upward
 * (cap at 35%) to keep the head; more than 30% height loss → 'unsafe'
 * (assignment avoids these; if forced via locks, the note is preserved so
 * guardrails can warn).
 *
 * No DB access. `sharp` is only required lazily inside computeFocalPoint.
 */

"use strict";

// ---------------------------------------------------------------------------
// Seeded PRNG helpers — copied from src/domains/pdf/comp-card-selector.js
// (seedToUint32 / createMulberry32; the selector keeps them private, so the
// tiny implementations are duplicated here with attribution per the spec).
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash for string seeds; numbers are used as uint32 state.
 * @param {string|number|undefined|null} seed
 * @returns {number}
 */
function seedToUint32(seed) {
  if (seed == null || seed === "") {
    return 0;
  }
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

/**
 * Deterministic PRNG (mulberry32). Returns values in [0, 1).
 * @param {number} a — initial state (use seedToUint32)
 * @returns {() => number}
 */
function createMulberry32(a) {
  let state = a >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Focal resolution
// ---------------------------------------------------------------------------

/** Role-based default focal points (x, y in 0–1). */
const ROLE_FOCAL_DEFAULTS = {
  headshot: { x: 0.5, y: 0.18 },
  three_quarter: { x: 0.5, y: 0.25 },
  full_body: { x: 0.5, y: 0.5 },
  editorial: { x: 0.5, y: 0.35 },
  lifestyle: { x: 0.5, y: 0.35 },
};

/** Full-body height-loss thresholds (fraction of image height cropped away). */
const FULL_BODY_CAUTION_LOSS = 0.18;
const FULL_BODY_UNSAFE_LOSS = 0.3;

/** Max vertical object-position for biased full-body crops (keep the head). */
const FULL_BODY_BIAS_MAX_Y = 0.35;

/** @param {number} n @returns {number} clamped to [0, 1] */
function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/** Defensive metadata parse (string | object). */
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

/** Normalized enum-ish token: trim, lower, spaces → underscores. */
function normalizeEnumish(raw) {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Effective role for crop heuristics. PoolAnalysis maps three_quarter →
 * 'full_body', but crop rules distinguish them (3/4 crops at thigh, full
 * length must keep the figure), so the raw shot_type wins for that case.
 * @param {object} poolImage
 * @returns {string|null}
 */
function resolveCropRole(poolImage) {
  if (!poolImage) return null;
  const shot = normalizeEnumish(poolImage.shot_type);
  if (shot === "three_quarter") return "three_quarter";
  if (shot === "full_length" || shot === "full_body") return "full_body";
  if (shot === "headshot") return "headshot";
  return poolImage.role || null;
}

/**
 * Resolve the focal point for an image: metadata.focal wins, then role
 * heuristic, then center.
 * @param {object} poolImage
 * @param {string|null} cropRole
 * @returns {{ x: number, y: number, source: 'metadata'|'role'|'center' }}
 */
function resolveFocalPoint(poolImage, cropRole) {
  const metadata = parseJsonish(poolImage && poolImage.metadata);
  const isUsable = (f) =>
    f && typeof f === "object" &&
    Number.isFinite(Number(f.x)) && Number.isFinite(Number(f.y));
  // explicit focal on the record (pool/solver entries carry the measured
  // face location) → metadata.focal → the forensics attention focal cached
  // at upload/render → role heuristic → people prior
  const candidates = [
    [poolImage && poolImage.focal, "metadata"],
    [metadata.focal, "metadata"],
    [metadata.forensics && metadata.forensics.focal, "metadata"],
  ];
  for (const [focal, source] of candidates) {
    if (isUsable(focal)) {
      return { x: clamp01(Number(focal.x)), y: clamp01(Number(focal.y)), source };
    }
  }
  const roleDefault = cropRole ? ROLE_FOCAL_DEFAULTS[cropRole] : null;
  if (roleDefault) {
    return { x: roleDefault.x, y: roleDefault.y, source: "role" };
  }
  // Comp cards are photographs of PEOPLE: with nothing measured and no
  // role, dead-center vertical focus is the wrong prior — faces live in
  // the upper frame. (x stays centered.)
  return { x: 0.5, y: 0.38, source: "people-default" };
}

/**
 * Map a focal coordinate to a CSS object-position percentage along one axis.
 *
 * CSS `object-position: P%` aligns the P% point of the image with the P%
 * point of the container. To center a focal point f (0–1) in an axis where
 * the scaled image overflows the slot:
 *   pos = (f * displayed - 0.5 * slot) / (displayed - slot)
 * where `displayed` and `slot` are lengths in slot units. Clamped to [0, 1].
 * When there is no overflow on that axis the raw focal value is returned
 * (position is then a no-op but stays meaningful).
 *
 * @param {number} focal — 0–1
 * @param {number} displayed — displayed length in slot units
 * @param {number} slot — slot length in slot units
 * @returns {number} 0–1
 */
function focalToPosition(focal, displayed, slot) {
  const overflow = displayed - slot;
  if (!(overflow > 1e-6)) return clamp01(focal);
  return clamp01((focal * displayed - slot / 2) / overflow);
}

/** Format an {x, y} pair (0–1) as a CSS object-position string. */
function toObjectPosition(x, y) {
  return `${Math.round(clamp01(x) * 100)}% ${Math.round(clamp01(y) * 100)}%`;
}

/**
 * Resolve a safe, focal-aware crop for an image into a slot.
 *
 * @param {object} poolImage — PoolAnalysis pool entry (or raw image row with
 *   aspect/metadata/shot_type/role fields)
 * @param {{ aspect: number, role?: string|null, kind?: 'hero'|'cell' }} slot
 * @returns {{ fit: string, objectPosition: string, safety: { level: string, notes: string[] }, coverageLoss: number }}
 */
function resolveCrop(poolImage, slot) {
  const notes = [];
  const slotAspect =
    slot && Number.isFinite(Number(slot.aspect)) && Number(slot.aspect) > 0
      ? Number(slot.aspect)
      : null;
  const cropRole = resolveCropRole(poolImage);
  const focal = resolveFocalPoint(poolImage, cropRole);
  if (focal.source === "metadata") {
    notes.push("focal point from metadata.focal");
  } else if (focal.source === "role") {
    notes.push(`focal point from role heuristic (${cropRole})`);
  }

  const imageAspect =
    poolImage && Number.isFinite(Number(poolImage.aspect)) && poolImage.aspect > 0
      ? Number(poolImage.aspect)
      : null;

  // Without both aspects we cannot reason about overflow. Emitting the
  // focal as a raw position is DANGEROUS for portraits: any vertical crop
  // then starts the window below the head top and slices the face. Bias
  // the position toward the top of the head zone instead — a slightly
  // high crop is always survivable; a beheaded portrait never is.
  if (imageAspect == null || slotAspect == null) {
    notes.push(
      "image or slot dimensions unknown; head-biased positioning (cannot verify containment)",
    );
    return {
      fit: "cover",
      objectPosition: toObjectPosition(focal.x, Math.min(focal.y, 0.35)),
      safety: { level: "caution", notes },
      coverageLoss: 0,
    };
  }

  // Cover-fit geometry in slot units (slot = slotAspect wide × 1 tall).
  let widthLoss = 0; // fraction of image width cropped away
  let heightLoss = 0; // fraction of image height cropped away
  let displayedW = slotAspect;
  let displayedH = 1;
  if (imageAspect > slotAspect) {
    // Image relatively wider → horizontal crop.
    displayedH = 1;
    displayedW = imageAspect; // scaled to slot height
    widthLoss = 1 - slotAspect / imageAspect;
  } else if (imageAspect < slotAspect) {
    // Image relatively taller → vertical crop.
    displayedW = slotAspect;
    displayedH = slotAspect / imageAspect; // scaled to slot width
    heightLoss = 1 - imageAspect / slotAspect;
  }
  const coverageLoss =
    Math.round((1 - (1 - widthLoss) * (1 - heightLoss)) * 1000) / 1000;

  let posX = focalToPosition(focal.x, displayedW, slotAspect);
  let posY = focalToPosition(focal.y, displayedH, 1);

  // ---- Head containment (hard guarantee) -----------------------------------
  // Centering the focal point in the window is not the same as KEEPING THE
  // HEAD IN FRAME: a portrait cover-cropped into a wide cell can slice the
  // face while the focal sits comfortably inside. Clamp the position so the
  // head zone around the focal — it extends well ABOVE the eye line —
  // stays inside the visible window. When the window is too short for the
  // whole zone, the top of the head wins (chins survive crops; crowns
  // read as mistakes).
  const HEAD_ABOVE = 0.13; // image-height above the focal (crown/hair)
  const HEAD_BELOW = 0.08; // below the focal (chin/jaw)
  if (heightLoss > 1e-6) {
    const visH = 1 - heightLoss; // visible fraction of image height
    const faceTop = clamp01(focal.y - HEAD_ABOVE);
    const faceBottom = clamp01(focal.y + HEAD_BELOW);
    // window y0 = (1 - visH) · posY must sit at/above faceTop, and the
    // window must reach faceBottom
    const hi = faceTop / heightLoss;
    const lo = (faceBottom - visH) / heightLoss;
    const clamped = clamp01(Math.min(Math.max(posY, lo), hi));
    if (Math.abs(clamped - posY) > 1e-3) {
      posY = clamped;
      notes.push("vertical position clamped to keep the head in frame");
    }
  }
  if (widthLoss > 1e-6) {
    const visW = 1 - widthLoss;
    const faceLeft = clamp01(focal.x - 0.12);
    const faceRight = clamp01(focal.x + 0.12);
    const hi = faceLeft / widthLoss;
    const lo = (faceRight - visW) / widthLoss;
    const clamped = clamp01(Math.min(Math.max(posX, lo), hi));
    if (Math.abs(clamped - posX) > 1e-3) {
      posX = clamped;
      notes.push("horizontal position clamped to keep the face in frame");
    }
  }

  // ---- Safety evaluation ---------------------------------------------------
  let level = "safe";
  const isFullBody = cropRole === "full_body";

  if (isFullBody && heightLoss > 0) {
    if (heightLoss > FULL_BODY_UNSAFE_LOSS) {
      level = "unsafe";
      notes.push(
        `full-body crop loses ${Math.round(heightLoss * 100)}% of image height (>30%); figure cannot be kept`,
      );
    } else if (heightLoss > FULL_BODY_CAUTION_LOSS) {
      level = "caution";
      notes.push(
        `full-body crop loses ${Math.round(heightLoss * 100)}% of image height (>18%); risk of cropping at knees/ankles`,
      );
    }
    if (level !== "safe") {
      // Bias upward so the head survives; feet take the loss.
      const biased = Math.min(posY, FULL_BODY_BIAS_MAX_Y);
      if (biased !== posY) {
        posY = biased;
        notes.push("vertical position biased upward to keep head in frame");
      }
    }
  }

  if (cropRole === "headshot" && heightLoss > 0.45) {
    if (level === "safe") level = "caution";
    notes.push(
      `headshot loses ${Math.round(heightLoss * 100)}% of image height; verify chin/shoulder line`,
    );
  }

  // Subject presence: heavy horizontal cropping cuts the talent out of
  // their own photograph regardless of role — a half-missing face is worse
  // than any layout compromise. Face-led shots (headshot / three-quarter)
  // are held to a STRICTER bar: a face is ruined long before a full-length
  // is, so >42% width loss is unsafe for them (triggers crop-healing —
  // swap a better-fitting frame into the cell, or mat on the field —
  // instead of shipping a sliced face). Full-length / editorial shots keep
  // the looser 0.55 bar (their width has more survivable margin).
  const isFaceLed = cropRole === "headshot" || cropRole === "three_quarter";
  const widthUnsafe = isFaceLed ? 0.42 : 0.55;
  if (widthLoss > widthUnsafe) {
    level = "unsafe";
    notes.push(
      `crop loses ${Math.round(widthLoss * 100)}% of image width (>${Math.round(widthUnsafe * 100)}%${isFaceLed ? ", face-led" : ""}); subject presence cannot survive`,
    );
  } else if (widthLoss > 0.32) {
    if (level === "safe") level = "caution";
    notes.push(
      `crop loses ${Math.round(widthLoss * 100)}% of image width; subject presence at risk`,
    );
  }

  // Symmetric guard for heavy VERTICAL loss on a face-led shot: a headshot
  // dropped into a very WIDE cell slices the crown or chin. The full-body
  // guard above handles figures; this catches face shots the same way.
  if (isFaceLed && heightLoss > 0.5) {
    level = "unsafe";
    notes.push(
      `face-led crop loses ${Math.round(heightLoss * 100)}% of image height (>50%); head cannot be kept`,
    );
  }

  return {
    fit: "cover",
    objectPosition: toObjectPosition(posX, posY),
    safety: { level, notes },
    coverageLoss,
  };
}

// ---------------------------------------------------------------------------
// Slot assignment
// ---------------------------------------------------------------------------

const SAFETY_SCORE = { safe: 30, caution: 10, unsafe: -100 };

/**
 * Candidate fit score for a slot (deterministic). Higher is better.
 * @param {object} image — pool entry
 * @param {object} slot — { aspect, role, kind }
 * @param {object} crop — resolveCrop result
 * @returns {number}
 */
function scoreCandidateForSlot(image, slot, crop) {
  let score = SAFETY_SCORE[crop.safety.level] ?? 0;

  if (slot.role && image.role === slot.role) score += 25;

  if (slot.kind === "hero") {
    score += (image.heroScore || 0) / 2;
  } else {
    score += (image.qualityScore || 0) / 4;
  }

  const slotAspect = Number(slot.aspect) || 1;
  if (image.role === "full_body" && slotAspect <= 0.75) score += 20; // tall cell
  if (image.role === "headshot" && slotAspect >= 0.85) score += 15; // squarer cell

  // Penalize wasted pixels.
  score -= (crop.coverageLoss || 0) * 10;

  return score;
}

/**
 * Weighted pick: earlier in ordered list is more likely; same seed => same
 * pick. Without rng, the first candidate wins (mirrors the selector).
 */
function pickWeightedByOrder(ordered, rng) {
  if (!ordered.length) return null;
  if (!rng) return ordered[0];
  let total = 0;
  const weights = ordered.map((_, i) => {
    const w = 1 / (i + 1);
    total += w;
    return w;
  });
  let r = rng() * total;
  for (let i = 0; i < ordered.length; i++) {
    r -= weights[i];
    if (r <= 0) return ordered[i];
  }
  return ordered[ordered.length - 1];
}

/** Normalize locks the same way the selector does. */
function normalizeLocks(locks) {
  if (!locks || typeof locks !== "object") {
    return { heroId: null, gridIds: [] };
  }
  const rawGrid = Array.isArray(locks.gridIds) ? locks.gridIds : [];
  const gridIds = rawGrid.map((id) => {
    if (id == null) return null;
    const normalized = String(id).trim();
    return normalized || null;
  });
  const heroId =
    locks.heroId == null ? null : String(locks.heroId).trim() || null;
  return { heroId, gridIds };
}

/**
 * Assign pool images to layout slots, minimizing unsafe crops.
 *
 * Strategy (deterministic for a given seed):
 *   1. Locks first: `locks.heroId` claims the first 'hero' slot;
 *      `locks.gridIds[i]` claims the i-th 'cell' slot (selector semantics —
 *      a lock always wins if the image exists in the pool, even if its crop
 *      is unsafe; safety notes are preserved for guardrails).
 *   2. Remaining slots are filled hero-first, then cells from tallest
 *      (smallest aspect) to squarest, so full_body images land in the
 *      tallest cell and headshots in squarer cells.
 *   3. Per slot, unassigned candidates are scored (safety, role match,
 *      hero/quality score, shape affinity, coverage loss), 'unsafe' crops
 *      are excluded whenever any safer candidate exists, and the pick is
 *      the top scorer; exact score ties are broken with a seeded weighted
 *      pick (mulberry32 — same PRNG pattern as the selector).
 *
 * @param {{ pool: Array<object>, heroRanking?: string[] }} poolAnalysis
 * @param {Array<{ aspect: number, role?: string|null, kind?: 'hero'|'cell' }>} slots
 * @param {{ seed?: string|number, locks?: { heroId?: string, gridIds?: Array<string|null> } }} [options]
 * @returns {Array<{ slotIndex: number, imageId: string|null, crop: object|null }>}
 */
function assignImagesToSlots(poolAnalysis, slots, options = {}) {
  const pool =
    poolAnalysis && Array.isArray(poolAnalysis.pool) ? poolAnalysis.pool : [];
  const slotList = Array.isArray(slots) ? slots : [];
  const locks = normalizeLocks(options.locks);
  const seed = options.seed;
  const hasSeed = !(seed == null || seed === "");
  const rng = hasSeed ? createMulberry32(seedToUint32(seed)) : null;

  const byId = new Map(pool.map((img) => [String(img.id), img]));
  const assigned = new Map(); // slotIndex → imageId
  const used = new Set();

  const heroSlotIndices = [];
  const cellSlotIndices = [];
  slotList.forEach((slot, i) => {
    if (slot && slot.kind === "hero") heroSlotIndices.push(i);
    else cellSlotIndices.push(i);
  });

  // --- 1. Apply locks upfront so later picks cannot steal them. -------------
  if (locks.heroId && heroSlotIndices.length > 0) {
    const img = byId.get(locks.heroId);
    if (img && !used.has(String(img.id))) {
      assigned.set(heroSlotIndices[0], String(img.id));
      used.add(String(img.id));
    }
  }
  locks.gridIds.forEach((id, cellIndex) => {
    if (!id || cellIndex >= cellSlotIndices.length) return;
    const img = byId.get(id);
    if (img && !used.has(String(img.id))) {
      assigned.set(cellSlotIndices[cellIndex], String(img.id));
      used.add(String(img.id));
    }
  });

  // --- 2. Fill order: heroes first, then cells tallest-first. ---------------
  const fillOrder = [
    ...heroSlotIndices,
    ...[...cellSlotIndices].sort((a, b) => {
      const aa = Number(slotList[a]?.aspect) || 1;
      const ab = Number(slotList[b]?.aspect) || 1;
      if (aa !== ab) return aa - ab; // smaller aspect = taller cell first
      return a - b;
    }),
  ];

  for (const slotIndex of fillOrder) {
    if (assigned.has(slotIndex)) continue;
    const slot = slotList[slotIndex] || {};
    const candidates = pool.filter((img) => !used.has(String(img.id)));
    if (candidates.length === 0) continue;

    const scored = candidates
      .map((img, poolOrder) => {
        const crop = resolveCrop(img, slot);
        return { img, crop, poolOrder, score: scoreCandidateForSlot(img, slot, crop) };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.poolOrder - b.poolOrder; // pool is heroScore-desc already
      });

    // Avoid unsafe crops whenever a safer option exists.
    const safer = scored.filter((c) => c.crop.safety.level !== "unsafe");
    const ordered = safer.length > 0 ? safer : scored;

    // The seed only breaks ties — it must never override a dominant score
    // (otherwise a random pick could push a full_body into an unsafe slot
    // later in the fill order).
    const topScore = ordered[0].score;
    const tieGroup = ordered.filter((c) => Math.abs(c.score - topScore) < 1e-9);
    const pick = pickWeightedByOrder(tieGroup, rng);
    if (pick) {
      assigned.set(slotIndex, String(pick.img.id));
      used.add(String(pick.img.id));
    }
  }

  // --- 3. Emit in original slot order with resolved crops. -------------------
  return slotList.map((slot, slotIndex) => {
    const imageId = assigned.get(slotIndex) ?? null;
    const img = imageId != null ? byId.get(imageId) : null;
    return {
      slotIndex,
      imageId: img ? img.id : null,
      crop: img ? resolveCrop(img, slot || {}) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Focal point detection (sharp attention strategy — offline/lazy only)
// ---------------------------------------------------------------------------

const FOCAL_PROBE_SIZE = 64;
/** Longest edge of the re-encoded probe the attention pass reads. */
const FOCAL_PROBE_MAX = 512;

/**
 * Best-effort focal point detection via sharp's attention crop strategy.
 *
 * How it works (sharp >= 0.32; verified against the installed 0.34.x):
 * resizing with `fit: 'cover', position: sharp.strategy.attention` and
 * `.toBuffer({ resolveWithObject: true })` exposes on `info`:
 *   - `attentionX` / `attentionY` — the attention center in the *scaled*
 *     (post-resize, pre-crop) coordinate space
 *   - `cropOffsetLeft` / `cropOffsetTop` — negative offsets of the crop
 *     window within the scaled image
 * We normalize attentionX/Y by the scaled dimensions (original dims × the
 * cover scale factor) to get a 0–1 focal point. If `attentionX/Y` are
 * missing, we fall back to the center of the crop window from the crop
 * offsets; if neither is exposed (older sharp), we return null.
 *
 * Never throws; returns null when sharp is unavailable, the buffer is not a
 * decodable image, or the installed sharp does not expose the fields.
 *
 * @param {Buffer} buffer — image bytes
 * @returns {Promise<{ x: number, y: number } | null>}
 */
async function computeFocalPoint(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  let sharp;
  try {
    // Lazy require: must not crash environments without sharp installed.
    // eslint-disable-next-line global-require
    sharp = require("sharp");
  } catch {
    return null;
  }

  try {
    // libvips reports `attentionX/Y` in the space of the image it actually
    // analysed. For JPEG input that is the shrink-on-load space (a power-of-two
    // reduction chosen internally), which is not observable from here, so the
    // photo is first re-encoded as a bounded PNG probe (EXIF orientation
    // applied): from PNG input the coordinates are in the scaled space that
    // the math below assumes.
    const probe = await sharp(buffer)
      .rotate()
      .resize(FOCAL_PROBE_MAX, FOCAL_PROBE_MAX, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 1 })
      .toBuffer({ resolveWithObject: true });
    const origW = probe.info.width;
    const origH = probe.info.height;
    if (!origW || !origH) return null;

    const target = FOCAL_PROBE_SIZE;
    const scale = Math.max(target / origW, target / origH);
    const scaledW = Math.max(1, Math.round(origW * scale));
    const scaledH = Math.max(1, Math.round(origH * scale));

    const { info } = await sharp(probe.data)
      .resize(target, target, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .toBuffer({ resolveWithObject: true });

    if (
      Number.isFinite(info.attentionX) &&
      Number.isFinite(info.attentionY)
    ) {
      return {
        x: clamp01(info.attentionX / scaledW),
        y: clamp01(info.attentionY / scaledH),
      };
    }

    if (
      Number.isFinite(info.cropOffsetLeft) &&
      Number.isFinite(info.cropOffsetTop)
    ) {
      const cropLeft = -info.cropOffsetLeft;
      const cropTop = -info.cropOffsetTop;
      return {
        x: clamp01((cropLeft + info.width / 2) / scaledW),
        y: clamp01((cropTop + info.height / 2) / scaledH),
      };
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = {
  resolveCrop,
  assignImagesToSlots,
  computeFocalPoint,
  // Exposed for tests:
  resolveFocalPoint,
  resolveCropRole,
  FULL_BODY_CAUTION_LOSS,
  FULL_BODY_UNSAFE_LOSS,
};
