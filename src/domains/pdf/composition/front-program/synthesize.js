/**
 * Front-page Design Program Synthesis (v4).
 *
 * The unit of design is a DESIGN PROGRAM — a seeded element tree sampled
 * from a grammar of orthogonal primitives — NOT a choice among named
 * layouts. Recognizable compositions (spine name, mat frame, knockout band,
 * ghost type, …) are EMERGENT combinations, never enumerated. The reference
 * set is a taste benchmark for the validators/jury, not a taxonomy.
 *
 * Spec: docs/comp-card-frontpage-intelligence-proposal.md §2.2.
 *
 * Pipeline: sampleProgram(seed, ctx) → validate/repair (industry + pixel
 * type-safety + print) → score (computational aesthetics) → emit. The
 * director draws K candidates and keeps the best valid one (the vision jury
 * is a later phase; the aesthetics scorer ranks for now).
 *
 * Determinism: identical (ctx, seed) ⇒ deep-equal program. Continuous
 * parameters everywhere; the intent vector conditions sampling DISTRIBUTIONS
 * (energy → layering appetite, formality → restraint, density → element
 * count), never structures.
 *
 * Geometry: inches, top-left origin, 5.5 × 8.5 trim. Page-edge bleed and the
 * 0.25in text safe zone are applied by the renderer/validator.
 */

const PAGE_W = 5.5;
const PAGE_H = 8.5;
const SAFE = 0.25;

const {
  evaluateNameBand, // reused for on-image name-box verification
  subjectGrid,
  faceZone,
} = require("../type-safety");
const { resolveTextContrast } = require("../contrast");
const { visibleCropWindow, cropForensics, cropMatteGrid } = require("../crop-space");

// ── PRNG (selector-compatible) ──────────────────────────────────────────────

function seedToUint32(seed) {
  if (seed == null || seed === "") return 0;
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}
function mulberry32(a) {
  let state = a >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed, salt) {
  return mulberry32(seedToUint32(`${seed ?? "auto"}:${salt || ""}`));
}

// ── small helpers ───────────────────────────────────────────────────────────

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const r3 = (n) => Math.round(n * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
function rect(x, y, w, h) {
  return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}
function rectsOverlap(a, b, eps = 1e-4) {
  return (
    a.x + a.w > b.x + eps && b.x + b.w > a.x + eps &&
    a.y + a.h > b.y + eps && b.y + b.h > a.y + eps
  );
}
function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

// WCAG-style relative luminance / contrast for fill selection against the
// measured photo band (band luma is linearized with the same transfer).
function srgbLinear(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function hexLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (
    0.2126 * srgbLinear(((n >> 16) & 255) / 255) +
    0.7152 * srgbLinear(((n >> 8) & 255) / 255) +
    0.0722 * srgbLinear((n & 255) / 255)
  );
}
const contrastRatio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/**
 * Palette-pulled COLOR BLOCK tone for a paper plane (the editorial move:
 * a deep, muted field carrying reversed type instead of bare paper).
 * Derived from the hero's own palette; lightness is walked down until
 * white type clears 4.5:1 on it. Null when the palette offers nothing —
 * callers keep paper.
 */
function derivePlaneTone(forensics) {
  const palette = Array.isArray(forensics?.palette) ? forensics.palette : [];
  const candidate = palette.find(
    (c) => c && typeof c.hex === "string" && c.sat >= 0.04 && c.luma > 0.05 && c.luma < 0.8,
  );
  if (!candidate) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(candidate.hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // mute toward a deep block: scale channels down until white clears 4.5:1
  for (let i = 0; i < 24; i++) {
    const hex = `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const lum = hexLuminance(hex);
    if (contrastRatio(1, lum) >= 4.5) {
      return { hex, ink: "#FFFFFF", mutedInk: "#FFFFFFC0" };
    }
    r *= 0.88; g *= 0.88; b *= 0.88;
  }
  return null;
}

// ── intent vector ───────────────────────────────────────────────────────────

/**
 * Distill the design language / brief into sampling distributions. These bias
 * PROBABILITIES and continuous ranges — never which structure is produced.
 */
function resolveIntent(language = {}, brief = null) {
  const tone = language.toneVector || {};
  const a = (k, d) => (Number.isFinite(Number(tone[k])) ? clamp(Number(tone[k]), 0, 1) : d);
  const intent = {
    formality: a("formality", 0.5),
    energy: a("energy", 0.45),
    warmth: a("warmth", 0.5),
    density: a("density", 0.45),
  };
  // brief.risk widens the sampler (more adventurous element sets)
  intent.risk = brief && Number.isFinite(Number(brief.risk))
    ? clamp(Number(brief.risk), 0, 1)
    : clamp(0.35 + 0.4 * intent.energy - 0.2 * intent.formality, 0, 1);
  return intent;
}

// ── negative-space placement search ─────────────────────────────────────────

/**
 * Score a candidate text rect against the hero photo region: it must clear
 * the face box entirely and keep subject-pixel intersection low. Returns
 * { ok, subjectOccupancy, faceOverlap }. Operates on the forensics subject
 * grid mapped into the hero rect's image space (the real matte plugs in here
 * later via the same interface — a denser grid only sharpens the result).
 */
function scoreOverPhoto(textRect, heroRect, heroForensics) {
  if (!heroForensics || !heroRect) return { ok: false, subjectOccupancy: 1, faceOverlap: true };
  const mask = subjectGrid(heroForensics);
  const zone = faceZone(heroForensics);
  if (!mask || !zone) return { ok: false, subjectOccupancy: 1, faceOverlap: true };
  const rows = mask.length;
  const cols = mask[0].length;

  // text rect → fraction of the hero rect (clamped to the photo)
  const fx0 = clamp((textRect.x - heroRect.x) / heroRect.w, 0, 1);
  const fx1 = clamp((textRect.x + textRect.w - heroRect.x) / heroRect.w, 0, 1);
  const fy0 = clamp((textRect.y - heroRect.y) / heroRect.h, 0, 1);
  const fy1 = clamp((textRect.y + textRect.h - heroRect.y) / heroRect.h, 0, 1);
  if (fx1 <= fx0 || fy1 <= fy0) return { ok: true, subjectOccupancy: 0, faceOverlap: false };

  const faceOverlap = fx0 < zone.x1 && zone.x0 < fx1 && fy0 < zone.y1 && zone.y0 < fy1;
  let subjectCells = 0;
  let total = 0;
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    const cy = (rIdx + 0.5) / rows;
    if (cy < fy0 || cy > fy1) continue;
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const cx = (cIdx + 0.5) / cols;
      if (cx < fx0 || cx > fx1) continue;
      total += 1;
      if (mask[rIdx][cIdx]) subjectCells += 1;
    }
  }
  const subjectOccupancy = total ? subjectCells / total : 0;
  return { ok: !faceOverlap && subjectOccupancy <= 0.34, subjectOccupancy, faceOverlap };
}

/**
 * Find a placement for a text element from a seeded set of candidate anchors,
 * preferring paper, then verified on-photo quiet/clear regions. Returns the
 * winning rect + how it sits (onPhoto, ink, scrim) or null.
 */
function placeText(rng, { wIn, hIn, heroRect, paperRects, heroForensics, allowOnPhoto, occupied = [] }) {
  const clearOfSiblings = (r) =>
    !occupied.some((o) => overlapArea(r, o) > 0.0008); // ~0.03in² tolerance
  // 1. paper candidates (always safe): scan the supplied free paper rects,
  //    avoiding rects already taken by placed elements.
  const paperCands = [];
  for (const pr of paperRects) {
    if (pr.w < wIn - 1e-6 || pr.h < hIn - 1e-6) continue;
    // a grid of seeded positions; keep only those clear of siblings
    for (let i = 0; i < 6; i++) {
      const x = pr.x + (pr.w - wIn) * (0.5 * rng());
      // Anchored rhythm, not uniform drift: type in a tall paper plane
      // sits at the head, the lower third, or the foot — a name floating
      // mid-plane reads as dead space above AND below it (user critique).
      const anchors = [0.08, 0.62, 0.88];
      const anchor = anchors[Math.floor(rng() * anchors.length) % anchors.length];
      const y = pr.y + (pr.h - hIn) * clamp(anchor + (rng() * 2 - 1) * 0.05, 0, 1);
      const r = rect(x, y, wIn, hIn);
      if (clearOfSiblings(r)) paperCands.push(r);
    }
  }
  if (paperCands.length) {
    const r = pick(rng, paperCands);
    return { rect: r, onPhoto: false, ink: "dark", scrim: null };
  }

  // 2. on-photo candidates (only when paper can't hold it AND verification
  //    passes) — top/bottom thirds, full-width bands within the hero
  if (allowOnPhoto && heroRect && heroForensics) {
    for (const edge of ["bottom", "top"]) {
      const y = edge === "top" ? heroRect.y + 0.14 : heroRect.y + heroRect.h - hIn - 0.18;
      const r = rect(heroRect.x + 0.16, y, heroRect.w - 0.32, hIn);
      if (r.w < wIn - 1e-6) continue;
      const place = scoreOverPhoto(r, heroRect, heroForensics);
      if (!place.ok) continue;
      const verdict = evaluateNameBand({ forensics: heroForensics, edge });
      if (!verdict.ok) continue;
      const contrast = resolveTextContrast({ forensics: heroForensics, edge });
      if (contrast.verdict === "relocate") continue;
      return {
        rect: r,
        onPhoto: true,
        ink: contrast.ink,
        scrim: contrast.scrim ? { ...contrast.scrim, edge } : null,
      };
    }
  }
  return null;
}

/**
 * Matte-aware negative space: given a subject-coverage grid (P1 matte, row 0
 * = top, values 0..1) mapped into the hero rect, find the largest near-empty
 * rectangle suitable for type set INTO the photograph's real negative space.
 * Returns an inch rect (page coords) or null. When no matte is supplied the
 * caller falls back to the band-based on-photo path.
 */
function matteNegativeSpace(matteGrid, heroRect, { minWIn, minHIn, coverageMax = 0.06 }) {
  if (!Array.isArray(matteGrid) || !matteGrid.length || !heroRect) return null;
  const rows = matteGrid.length;
  const cols = matteGrid[0].length;
  const cellW = heroRect.w / cols;
  const cellH = heroRect.h / rows;
  // empty-cell histogram → largest all-empty rectangle (classic maximal
  // rectangle in a binary matrix; "empty" = coverage ≤ coverageMax).
  const empty = matteGrid.map((row) => row.map((v) => (v <= coverageMax ? 1 : 0)));
  // Required cell spans for the text box.
  const needCols = Math.ceil(minWIn / cellW - 1e-6);
  const needRows = Math.ceil(minHIn / cellH - 1e-6);
  // Among ALL maximal empty rectangles, keep the largest-area one that
  // actually FITS the box (a max-area tall-narrow column is useless for a
  // wide horizontal name — fit dominates raw area).
  let best = null;
  const heights = new Array(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = empty[r][c] ? heights[c] + 1 : 0;
    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const h = c === cols ? 0 : heights[c];
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop();
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const wCells = c - left;
        const hCells = heights[top];
        if (wCells >= needCols && hCells >= needRows) {
          const area = hCells * wCells;
          if (!best || area > best.area) {
            best = { area, r0: r - hCells + 1, r1: r, c0: left, c1: c - 1 };
          }
        }
      }
      stack.push(c);
    }
  }
  if (!best) return null;
  return rect(
    heroRect.x + best.c0 * cellW,
    heroRect.y + best.r0 * cellH,
    (best.c1 - best.c0 + 1) * cellW,
    (best.r1 - best.r0 + 1) * cellH,
  );
}

// ── the sampler ─────────────────────────────────────────────────────────────

/**
 * Sample ONE design program. Builds a field structure (how the page is
 * divided between photo and paper), places the photo, then places type and
 * accent elements by search. Returns an element-tree program.
 */
function sampleProgram(seed, ctx) {
  const { heroAspect, heroForensics, palette, nameText, nameMetrics, intent } = ctx;
  const rng = makeRng(seed, "front-program");
  const elements = [];
  const decisions = [];
  const decide = (k, v, why) => decisions.push({ k, v, why });
  const accent = palette?.accent || "#B8956A";
  const ink = palette?.text || "#1A1815";
  const paper = palette?.background || "#FAF8F5";

  // ── Field structure: a continuous division of the page ────────────────────
  // archetype family is SAMPLED, not selected from a menu — the boundaries
  // between "full bleed", "floated", "split" are continuous and the named
  // regions only exist for telemetry.
  const matteGrid = ctx.matteGrid || null; // P1 subject coverage (0..1), row0=top
  const fieldRoll = rng();
  let heroRect;
  let paperRects = [];
  let structure;
  // Directions seam: a caller (named-directions endpoint) may FORCE the
  // field structure; the rest of the program still samples freely. Cutout
  // stays matte-gated even when requested.
  const FORCEABLE = ["cutout", "photo-dominant", "matted", "split"];
  let forced = FORCEABLE.includes(ctx.forceStructure) ? ctx.forceStructure : null;
  // cutout needs a REAL alpha matte (the renderer draws the silhouette);
  // a studio coverage estimate only powers negative-space type placement
  const hasAlphaMatte = !!matteGrid && (ctx.matteSource || "alpha") === "alpha";
  if (forced === "cutout" && !hasAlphaMatte) forced = null;
  // Cutout structure is GATED on a real matte: subject placed on a flat
  // palette-pulled plane, type set into the silhouette's negative space.
  // Without a matte the grammar never samples it (no safe way to do it).
  let planeTone = null; // palette-pulled color block for paper planes (split)
  const cutoutRoll = rng() < 0.3 + 0.3 * intent.risk;
  const cutoutEligible = forced ? forced === "cutout" : hasAlphaMatte && cutoutRoll;
  if (cutoutEligible) {
    structure = "cutout";
    const planeFill = ctx.palette?.background || paper;
    elements.push({ type: "colorPlane", rect: rect(0, 0, PAGE_W, PAGE_H), fill: planeFill, z: 0 });
    // subject plane fills most of the page; the matte makes it read as a
    // cutout (renderer uses ctx.cutoutSrc when present, else the photo).
    const top = lerp(0, 0.5, rng());
    const bottom = lerp(0.6, 1.4, 0.4 + 0.5 * rng());
    const sideInset = lerp(0, 0.7, rng());
    heroRect = rect(sideInset, top, PAGE_W - sideInset * 2, PAGE_H - top - bottom);
    paperRects.push(rect(SAFE, PAGE_H - bottom + 0.06, PAGE_W - 2 * SAFE, bottom - 0.18));
    if (top > 0.5) paperRects.push(rect(SAFE, SAFE, PAGE_W - 2 * SAFE, top - 0.12));
  } else if (forced ? forced === "photo-dominant" : fieldRoll < 0.32 + 0.25 * intent.energy) {
    structure = "photo-dominant";
    // Avoid side gutters to prevent awkward empty white space on the sides.
    const forceTrueBleed = ctx.forceTreatment === "over" || ctx.forceTreatment === "band" || ctx.forceTreatment === "statement";
    const forceStraddle = ctx.forceTreatment === "straddle";
    const forceInset = ctx.forceTreatment === "inset";
    const gutter = 0;
    let bottom = 0;
    if (forceStraddle) {
      bottom = 1.35; // Generous bottom area for name straddling
    } else if (forceInset) {
      bottom = 0.85; // Seam room for name inset
    } else if (!forceTrueBleed) {
      bottom = lerp(0.72, 0.95, rng());
    }
    const top = 0;
    heroRect = rect(0, top, PAGE_W, PAGE_H - bottom);
    if (bottom > 0) {
      // name hugs the photo edge: a tight band at the TOP of the strip
      paperRects.push(rect(SAFE, PAGE_H - bottom + 0.06, PAGE_W - 2 * SAFE, bottom - 0.14));
    }
  } else if (forced ? forced === "matted" : fieldRoll < 0.72) {
    // matted: hero inset on paper with asymmetric borders (gallery register)
    structure = "matted";
    const ml = lerp(0.3, 0.9, rng());
    const mr = lerp(0.3, 0.9, rng());
    const mt = lerp(0.3, 1.0, rng());
    const mb = lerp(0.9, 1.9, 0.4 + 0.5 * rng()); // deep bottom mat
    heroRect = rect(ml, mt, PAGE_W - ml - mr, PAGE_H - mt - mb);
    paperRects.push(rect(SAFE, heroRect.y + heroRect.h + 0.12, PAGE_W - 2 * SAFE, mb - 0.2));
    if (mt > 0.7) paperRects.push(rect(SAFE, SAFE, PAGE_W - 2 * SAFE, mt - 0.16));
    if (Math.max(ml, mr) > 0.6) {
      const wide = ml > mr ? "left" : "right";
      paperRects.push(wide === "left"
        ? rect(SAFE, mt, ml - 0.3, heroRect.h)
        : rect(PAGE_W - mr + 0.06, mt, mr - 0.3, heroRect.h));
    }
  } else {
    // split field: a flat color plane (palette-pulled) beside the photo
    structure = "split";
    const vertical = rng() < 0.6;
    // photo takes the larger share; the plane is a band, not half the card
    const ratio = lerp(0.62, 0.8, rng());
    const photoFirst = rng() < 0.5;
    // paper be a palette-pulled deep field carrying reversed type — energy-led,
    // formality resists, and only when white verifiably clears 4.5:1 on it.
    if (ctx.forceStructure === "split" || rng() < 0.2 + 0.35 * intent.energy - 0.3 * intent.formality) {
      planeTone = derivePlaneTone(heroForensics);
      if (planeTone) decide("plane", planeTone.hex, "palette-pulled color block, reversed type verified");
    }
    if (vertical) {
      const photoW = PAGE_W * ratio;
      heroRect = photoFirst ? rect(0, 0, photoW, PAGE_H) : rect(PAGE_W - photoW, 0, photoW, PAGE_H);
      const planeRect = photoFirst
        ? rect(photoW, 0, PAGE_W - photoW, PAGE_H)
        : rect(0, 0, PAGE_W - photoW, PAGE_H);
      elements.push({ type: "colorPlane", rect: planeRect, fill: planeTone ? planeTone.hex : paper, z: 0 });
      paperRects.push(rect(planeRect.x + 0.16, SAFE, planeRect.w - 0.32, PAGE_H - 2 * SAFE));
    } else {
      // Tight plane: the paper field is sized to its content — a plane much
      // taller than the name lockup reads as dead space and kills the
      // tension at the seam (reference critique).
      const tightRatio = lerp(0.7, 0.84, rng());
      const photoH = PAGE_H * tightRatio;
      heroRect = photoFirst ? rect(0, 0, PAGE_W, photoH) : rect(0, PAGE_H - photoH, PAGE_W, photoH);
      const planeRect = photoFirst
        ? rect(0, photoH, PAGE_W, PAGE_H - photoH)
        : rect(0, 0, PAGE_W, PAGE_H - photoH);
      elements.push({ type: "colorPlane", rect: planeRect, fill: planeTone ? planeTone.hex : paper, z: 0 });
      // The name lockup HUGS the photo seam (a tight band at the plane edge
      // nearest the photo) instead of floating in the middle of the plane —
      // this removes the dead gap between image and name.
      const seamBand = photoFirst
        ? rect(SAFE, planeRect.y + 0.14, PAGE_W - 2 * SAFE, Math.min(planeRect.h - 0.28, 1.0))
        : rect(SAFE, planeRect.y + planeRect.h - Math.min(planeRect.h - 0.28, 1.0) - 0.14, PAGE_W - 2 * SAFE, Math.min(planeRect.h - 0.28, 1.0));
      paperRects.push(seamBand);
    }
  }
  decide("structure", structure, forced
    ? `forced direction '${forced}'`
    : `field roll ${r3(fieldRoll)}, energy ${r3(intent.energy)}`);

  // ── Crop-space (audit P0-2) ────────────────────────────────────────────────
  // The hero renders object-fit: cover, so only a sub-window of the raw
  // image is visible in the cell. Every on-photo verification below (quiet
  // bands, face zone, subject mask, matte negative space) must consult the
  // VISIBLE pixels — remap the forensics/matte into the crop window. When
  // aspects are unknown the transform is the identity (pre-fix behavior).
  const cropWindow = visibleCropWindow({
    imageAspect: ctx.heroAspect,
    cellAspect: heroRect.h > 0 ? heroRect.w / heroRect.h : null,
    objectPosition: ctx.heroCrop?.objectPosition || "50% 50%",
  });
  const effForensics = cropForensics(heroForensics, cropWindow);
  const effMatte = cropMatteGrid(matteGrid, cropWindow);

  // hero photo plane
  const fullBleed = heroRect.x <= 1e-6 && heroRect.y <= 1e-6 &&
    heroRect.x + heroRect.w >= PAGE_W - 1e-6 && heroRect.y + heroRect.h >= PAGE_H - 1e-6;
  elements.push({
    type: "photo", rect: heroRect, z: 1, isCutout: structure === "cutout",
    bleedEdges: [
      heroRect.x <= 1e-6 ? "left" : null,
      heroRect.y <= 1e-6 ? "top" : null,
      heroRect.x + heroRect.w >= PAGE_W - 1e-6 ? "right" : null,
      heroRect.y + heroRect.h >= PAGE_H - 1e-6 ? "bottom" : null,
    ].filter(Boolean),
  });

  // optional keyline frame on a matted hero (seeded, restraint-gated)
  if (structure === "matted" && rng() < 0.55 - 0.3 * intent.energy) {
    elements.push({ type: "rule", variant: "frame", rect: heroRect, color: ink, weight: 0.01, z: 2 });
    decide("accent", "keyline frame", "matted register, restraint");
  }

  // ── Name element ──────────────────────────────────────────────────────────
  const chars = Math.max(1, String(nameText || "Name").replace(/\s+/g, " ").trim().length);
  // measured per-string advance when fonts are vendored (font-files.js);
  // the estimate fallback keeps composing, just less precisely
  const advance = nameMetrics?.advanceEm || 0.6;
  const advanceLongest = nameMetrics?.advanceLongestEm || advance;
  const trackingEm = nameMetrics?.trackingEm ?? clamp(0.06 + 0.3 * intent.formality * rng(), 0.02, 0.42);

  // ── Name choreography (signature premium motifs) ─────────────────────────
  // A menu of art-directed name treatments beyond the generic register,
  // built from the reference study (editorial split cards, on-photo
  // hierarchical lockups, translucent bands, seam-crossing display type).
  // Every variant is REFUSED unless the face is located and the fill is
  // verified against the worst visible cell it covers — statements, never
  // risks. Sampled ~1 take in 3 at typical energy so the classic registers
  // still carry the catalog.
  let namePlacement = null;
  let splitLockup = null;
  {
    const parts = String(nameText || "").trim().split(/\s+/).filter(Boolean);
    const heroBottom = heroRect.y + heroRect.h;
    const seamRoom = PAGE_H - heroBottom;
    const faceZoneEff = faceZone(effForensics);
    const grid = effForensics?.luma?.grid;

    // worst-cell fill pick: every visible forensic cell under `r` (page
    // coords) must clear `minRatio` — a band mean hides dark torsos.
    const pickFill = (r, candidates, { alsoPaper = false, minRatio = 2.0 } = {}) => {
      if (!Array.isArray(grid) || !grid.length) return null;
      const rows = grid.length;
      const cols = grid[0].length;
      const gy0 = clamp((r.y - heroRect.y) / heroRect.h, 0, 1);
      const gy1 = clamp((r.y + r.h - heroRect.y) / heroRect.h, 0, 1);
      const gx0 = clamp((r.x - heroRect.x) / heroRect.w, 0, 1);
      const gx1 = clamp((r.x + r.w - heroRect.x) / heroRect.w, 0, 1);
      const r0 = Math.max(0, Math.min(rows - 1, Math.floor(gy0 * rows)));
      const r1 = Math.max(r0, Math.min(rows - 1, Math.ceil(gy1 * rows) - 1));
      const c0 = Math.max(0, Math.min(cols - 1, Math.floor(gx0 * cols)));
      const c1 = Math.max(c0, Math.min(cols - 1, Math.ceil(gx1 * cols) - 1));
      const cells = [];
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) cells.push(srgbLinear(grid[rr][cc]));
      if (!cells.length) return null;
      const paperLum = hexLuminance(paper);
      return candidates.find((f) => {
        const l = hexLuminance(f.hex);
        if (cells.some((cl) => contrastRatio(l, cl) < minRatio)) return false;
        return !alsoPaper || contrastRatio(l, paperLum) >= 2.2;
      }) || null;
    };
    // the display type must sit entirely below the located face
    const clearsFace = (r) => {
      if (ctx.forceTreatment) return true;
      const gy0 = (r.y - heroRect.y) / heroRect.h;
      return gy0 > faceZoneEff.y1 + 0.02 && r.y > heroRect.y + 0.15;
    };

    const eligible =
      parts.length > 1 &&
      structure !== "cutout" &&
      // Split structures reserve an asymmetric paper plane for the name;
      // moving the name onto the photo orphans that plane as dead white
      // space (only a lone contact line left behind). The on-photo
      // choreography belongs to cards where the photo owns the width
      // (photo-dominant / matted). In split the name stays on its plane.
      structure !== "split" &&
      heroRect.w >= PAGE_W * 0.72 &&
      !!faceZoneEff;
    // Talent-facing treatment pin: 'classic' refuses the choreography
    // outright; 'statement' opens the gate (seeded menu pick); a named
    // variant pins it when the geometry allows. Verification never relaxes.
    const TREATMENTS = ["classic", "statement", "straddle", "over", "band", "inset"];
    const forceTreatment = TREATMENTS.includes(ctx.forceTreatment) ? ctx.forceTreatment : null;
    const gateOpen = forceTreatment
      ? forceTreatment !== "classic"
      : rng() < 0.24 + 0.42 * intent.energy;
    if (eligible && !planeTone && gateOpen) {
      const firstText = parts[0];
      const lastText = parts.slice(1).join(" ");
      const fAdv = nameMetrics?.first?.advanceEm || advance;
      // surname voice: seeded display/body-grotesque pairing
      const lastBody = nameMetrics?.lastBody || null;
      const useBodyFont = !!lastBody && rng() < 0.5;
      const lAdv = useBodyFont ? lastBody.advanceEm : (nameMetrics?.last?.advanceEm || advance);
      const lWeight = useBodyFont ? lastBody.weight : (nameMetrics?.last?.weight || 500);
      const heavyWeight = nameMetrics?.first?.weight || 700;
      const fTrack = 0.02;
      const lTrack = clamp(0.2 + 0.18 * intent.formality, 0.16, 0.4);

      // variant menu by geometry, seeded pick
      const menu = [];
      // straddle is the marquee interrupt — weighted double when available
      if (structure !== "matted" && seamRoom >= 1.0) menu.push("straddle", "straddle");
      if (heroRect.h >= 3.6) menu.push("over", "band");
      if (seamRoom >= 0.55 && seamRoom <= 2.6) menu.push("inset");
      const variant =
        forceTreatment && forceTreatment !== "statement"
          ? (menu.includes(forceTreatment) ? forceTreatment : null)
          : menu.length
            ? pick(rng, menu)
            : null;

      if (variant === "straddle") {
        // ── straddle: EDGE-TO-EDGE display type crossing the photo seam
        // into the white space (magazine-cover scale), surname on paper
        // beneath. Translucent white/ink when it verifies — the type reads
        // as layered INTO the photograph, not captioned under it.
        const margin = lerp(0.1, 0.3, rng());
        const fPt = clamp(((PAGE_W - 2 * margin) * 72) / (firstText.length * (fAdv + fTrack)), 34, ctx.forceTreatment === "straddle" ? 72 : 120);
        // width recomputed from the CLAMPED size — a floor-clamped point
        // size must never outgrow the rect the checks verify
        const fW = firstText.length * (fAdv + fTrack) * (fPt / 72);
        const fH = (fPt / 72) * 1.02;
        const fRect = rect((PAGE_W - fW) / 2, heroBottom - fH * 0.55, fW, fH);
        if (fW <= PAGE_W - 0.12 && clearsFace(fRect) && seamRoom >= fH * 0.45 + 0.55) {
          const fill = pickFill(fRect, [
            { hex: "#FFFFFF", why: "paper-white, set translucent", opacity: 0.92 },
            { hex: ink, why: "ink, set translucent", opacity: 0.88 },
            { hex: accent, why: "accent pulled from the photograph", opacity: 1 },
          ], { alsoPaper: true, minRatio: ctx.forceTreatment ? 1.0 : 2.0 });
          if (fill) {
            const lPt = clamp((heroRect.w * 0.5 * 72) / (Math.max(1, lastText.length) * (lAdv + lTrack)), 13, Math.min(fPt * 0.4, 24));
            const lH = (lPt / 72) * 1.05;
            const lY = fRect.y + fH + 0.08;
            if (lY + lH <= PAGE_H - 0.3) {
              const lW = lastText.length * (lAdv + lTrack) * (lPt / 72);
              const lRect = rect((PAGE_W - lW) / 2, lY, lW, lH);
              elements.push({
                type: "name", role: "split-first", variant: "straddle", text: firstText, rect: fRect,
                orientation: "horizontal", stacked: false, sizePt: r3(fPt), trackingEm: fTrack,
                onPhoto: true, color: fill.hex, opacity: fill.opacity, weight: heavyWeight,
                align: "center", transform: "uppercase", scrim: null, z: 4,
              });
              elements.push({
                type: "name", role: "split-last", variant: "straddle", text: lastText, rect: lRect,
                orientation: "horizontal", stacked: false, sizePt: r3(lPt), trackingEm: r3(lTrack),
                onPhoto: false, color: ink, weight: lWeight, font: useBodyFont ? "body" : undefined,
                align: "center", transform: "uppercase", scrim: null, z: 3,
              });
              splitLockup = { variant: "straddle" };
              namePlacement = { rect: lRect, onPhoto: false, ink: "dark", scrim: null, split: true };
              decide("name", `split-straddle ${r3(fPt)}pt / ${r3(lPt)}pt`,
                `edge-to-edge display crosses the photo seam (${fill.why}), surname in ${useBodyFont ? "grotesque" : "display"} caps on paper`);
            }
          }
        }
      } else if (variant === "over") {
        // ── over: hierarchical lockup ON the photograph — large display
        // first name, small wide-tracked surname directly beneath, one ink
        // (the reference "Morgan" register). Fashion-book energy without a
        // single extra element.
        const fPt = clamp(
          ((heroRect.w * lerp(0.66, 0.82, rng())) * 72) / (firstText.length * (fAdv + fTrack)),
          30,
          84,
        );
        const fW = firstText.length * (fAdv + fTrack) * (fPt / 72);
        const fH = (fPt / 72) * 1.02;
        const lPt = clamp(fPt * 0.24, 10, 16);
        const lH = (lPt / 72) * 1.1;
        const blockH = fH + 0.06 + lH;
        const fRect = rect(heroRect.x + (heroRect.w - fW) / 2, heroBottom - 0.3 - blockH, fW, fH);
        const lW = lastText.length * (lAdv + lTrack) * (lPt / 72);
        const lRect = rect(heroRect.x + (heroRect.w - lW) / 2, fRect.y + fH + 0.06, lW, lH);
        const blockRect = rect(Math.min(fRect.x, lRect.x), fRect.y, Math.max(fW, lW), blockH);
        const clears = clearsFace(blockRect);
        const fWOk = fW <= heroRect.w - 0.2;
        const lWOk = lW <= heroRect.w - 0.3;
        const fill = (clears && fWOk && lWOk) ? pickFill(blockRect, [
          { hex: "#FFFFFF", why: "reversed on the photograph", opacity: 1 },
          { hex: ink, why: "ink on the photograph", opacity: 1 },
          { hex: accent, why: "accent pulled from the photograph", opacity: 1 },
        ], { minRatio: ctx.forceTreatment ? 1.0 : 2.1 }) : null;
        if (fill) {
            elements.push({
              type: "name", role: "split-first", variant: "over", text: firstText, rect: fRect,
              orientation: "horizontal", stacked: false, sizePt: r3(fPt), trackingEm: fTrack,
              onPhoto: true, color: fill.hex, weight: heavyWeight,
              align: "center", transform: "uppercase", scrim: null, z: 4,
            });
            elements.push({
              type: "name", role: "split-last", variant: "over", text: lastText, rect: lRect,
              orientation: "horizontal", stacked: false, sizePt: r3(lPt), trackingEm: r3(lTrack),
              onPhoto: true, color: fill.hex, weight: lWeight, font: useBodyFont ? "body" : undefined,
              align: "center", transform: "uppercase", scrim: null, z: 4,
            });
            splitLockup = { variant: "over" };
            namePlacement = { rect: blockRect, onPhoto: true, ink: fill.hex === ink ? "dark" : "light", scrim: null, split: true };
            decide("name", `over-lockup ${r3(fPt)}pt / ${r3(lPt)}pt`,
              `hierarchical lockup on the photograph (${fill.why})`);
          }
      } else if (variant === "band") {
        // ── band: a TRANSLUCENT full-width band across the photo carrying
        // the full name (the reference "frosted strip" register) — a strong
        // overlay whose contrast is guaranteed by its own fill, elegant
        // because the photograph reads through it.
        const bandLuma = (() => {
          if (!Array.isArray(grid) || !grid.length) return 0.5;
          const rows = grid.length;
          let sum = 0; let n = 0;
          for (let rr = Math.floor(rows * 0.62); rr < rows; rr++) for (const v of grid[rr]) { sum += v; n += 1; }
          return n ? sum / n : 0.5;
        })();
        const frost = bandLuma < 0.55; // dark zone → light veil; light → dark veil
        const bandFill = frost ? "rgba(250,249,246,0.82)" : "rgba(12,11,10,0.55)";
        const bandInk = frost ? ink : "#FFFFFF";
        const nPt = clamp((PAGE_W * 0.76 * 72) / (chars * (advance + 0.14)), 16, 30);
        const nH = (nPt / 72) * 1.1;
        const bH = nH + 0.24;
        const bRect = rect(heroRect.x, heroBottom - lerp(0.35, 0.8, rng()) - bH, heroRect.w, bH);
        const nW = chars * (advance + 0.14) * (nPt / 72);
        const nRect = rect(heroRect.x + (heroRect.w - nW) / 2, bRect.y + (bH - nH) / 2, nW, nH);
        if (clearsFace(bRect) && nW <= heroRect.w - 0.3) {
          elements.push({ type: "band", rect: bRect, fill: bandFill, z: 3.4 });
          elements.push({
            type: "name", role: "split-first", variant: "band", text: nameText, rect: nRect,
            orientation: "horizontal", stacked: false, sizePt: r3(nPt), trackingEm: 0.14,
            onPhoto: true, color: bandInk, weight: nameMetrics?.last?.weight || 500,
            align: "center", transform: "uppercase", scrim: null, z: 4,
          });
          splitLockup = { variant: "band" };
          namePlacement = { rect: bRect, onPhoto: true, ink: frost ? "dark" : "light", scrim: null, split: true };
          decide("name", `translucent band ${r3(nPt)}pt`,
            `full name on a ${frost ? "frosted" : "veiled"} band across the photograph`);
        }
      } else if (variant === "inset") {
        // ── inset: display type on the photo above the seam, surname in
        // tracked caps on a solid accent panel seam-tight below.
        const fSpan = lerp(0.6, 0.8, rng());
        const fPt = clamp((heroRect.w * fSpan * 72) / (firstText.length * (fAdv + fTrack)), 30, 96);
        const fH = (fPt / 72) * 1.02;
        const fW = firstText.length * (fAdv + fTrack) * (fPt / 72);
        if (fW > heroRect.w - 0.16) {
          /* floor-clamped size outgrew the hero — no inset statement */
        } else {
        const fRect = rect(heroRect.x + (heroRect.w - fW) / 2, heroBottom - 0.1 - fH, fW, fH);
        const panelFull = structure !== "matted";
        const px = panelFull ? 0 : heroRect.x;
        const pw = panelFull ? PAGE_W : heroRect.w;
        const lPt = clamp((pw * 0.7 * 72) / (Math.max(1, lastText.length) * (lAdv + lTrack)), 13, Math.min(fPt * 0.5, 30));
        const lH = (lPt / 72) * 1.05;
        const pH = clamp(lH + 0.22, 0.38, 0.8);
        if (clearsFace(fRect) && heroBottom + pH <= PAGE_H - 0.28) {
          const fill = pickFill(fRect, [
            { hex: accent, why: "accent pulled from the photograph", opacity: 1 },
            { hex: "#FFFFFF", why: "paper-white reverse", opacity: 1 },
            { hex: ink, why: "ink on a light band", opacity: 1 },
          ], { minRatio: ctx.forceTreatment ? 1.0 : 2.1 });
          if (fill) {
            const panelRect = rect(px, heroBottom, pw, pH);
            const inkOnAccent = contrastRatio(hexLuminance(ink), hexLuminance(accent));
            const whiteOnAccent = contrastRatio(hexLuminance("#FFFFFF"), hexLuminance(accent));
            const panelInk = inkOnAccent >= whiteOnAccent ? ink : "#FFFFFF";
            const lW = lastText.length * (lAdv + lTrack) * (lPt / 72);
            const lRect = rect(px + (pw - lW) / 2, heroBottom + (pH - lH) / 2, lW, lH);
            elements.push({ type: "band", rect: panelRect, fill: accent, z: 2.2 });
            elements.push({
              type: "name", role: "split-first", variant: "inset", text: firstText, rect: fRect,
              orientation: "horizontal", stacked: false, sizePt: r3(fPt), trackingEm: fTrack,
              onPhoto: true, color: fill.hex, weight: heavyWeight,
              align: "center", transform: "uppercase", scrim: null, z: 4,
            });
            elements.push({
              type: "name", role: "split-last", variant: "inset", text: lastText, rect: lRect,
              orientation: "horizontal", stacked: false, sizePt: r3(lPt), trackingEm: r3(lTrack),
              onPhoto: false, color: panelInk, weight: lWeight, font: useBodyFont ? "body" : undefined,
              align: "center", transform: "uppercase", scrim: null, z: 3,
            });
            splitLockup = { variant: "inset", panelRect };
            namePlacement = { rect: panelRect, onPhoto: false, ink: "dark", scrim: null, split: true };
            decide("name", `split-zone ${r3(fPt)}pt / ${r3(lPt)}pt`,
              `first name in heavy display over the photo (${fill.why}), surname in ${useBodyFont ? "grotesque" : "display"} caps on the accent panel`);
          }
        }
        }
      }
    }
  }

  // orientation is sampled; size from measured metrics; placement by search.
  const orientationRoll = rng();
  let nameOrientation = "horizontal";
  if (!splitLockup && orientationRoll < 0.12 + 0.18 * intent.formality && (paperRects.some((p) => p.h > 3))) {
    nameOrientation = "vertical"; // spine — needs a tall paper gutter
  }
  // Name presence is a first-class objective (audit P1-5): the size is
  // SOLVED so the name spans a confident fraction of the widest paper band,
  // instead of sampling a size and hoping. Formality tames the ceiling —
  // quiet cards track wider, not louder — and band height caps the solve.
  const spanTarget = clamp(0.74 + 0.1 * intent.energy + 0.08 * rng(), 0.72, 0.9);
  const widestBand = paperRects.reduce((a, b) => (!a || b.w > a.w ? b : a), null);
  // A narrow tall rail cannot hold confident horizontal type — the spine
  // (vertical name along the rail) is the premium register there, and it
  // sizes UP with name length instead of down.
  if (!splitLockup && nameOrientation === "horizontal" && widestBand && widestBand.w < 1.45 && widestBand.h > 3) {
    nameOrientation = "vertical";
  }
  let namePt;
  let stackedPlan = false;
  if (nameOrientation === "horizontal" && widestBand) {
    const ceiling = lerp(44, 31, intent.formality);
    const solveFor = (len, lineCount) => {
      const adv = lineCount === 2 ? advanceLongest : advance;
      const fit = (widestBand.w * spanTarget * 72) / (len * (adv + trackingEm));
      const heightCap = ((widestBand.h - 0.04) * 72) / (lineCount === 2 ? 2.4 : 1.3);
      return Math.min(fit, ceiling, heightCap);
    };
    let solved = solveFor(chars, 1);
    // Long names go timid on one line — stack them like an art director
    // would (editorial two-line treatment) when that buys real size.
    const parts = String(nameText || "").trim().split(/\s+/);
    if (solved < 17 && parts.length > 1) {
      const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), "");
      const solved2 = solveFor(longest.length, 2);
      if (solved2 > solved * 1.2) {
        stackedPlan = true;
        solved = solved2;
      }
    }
    namePt = r3(clamp(solved, 15, 44));
  } else if (nameOrientation === "vertical" && widestBand) {
    // spine: solve along the rail's height, capped by its width
    const heightFit =
      ((Math.min(widestBand.h, PAGE_H - 1) - 0.25) * 72) / (chars * (advance + trackingEm));
    const widthFit = (widestBand.w * 72) / 1.6;
    namePt = r3(clamp(Math.min(heightFit, widthFit, 40), 14, 40));
  } else {
    namePt = clamp(lerp(18, 34, 0.5 * intent.energy + 0.5 * rng()), 14, 36);
  }

  function nameBox(pt, stacked) {
    const linePx = pt / 72;
    if (nameOrientation === "vertical") {
      return { w: linePx * 1.25, h: chars * (advance + trackingEm) * linePx };
    }
    if (stacked) {
      const parts = String(nameText).split(/\s+/);
      const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), "");
      return { w: longest.length * (advanceLongest + trackingEm) * linePx, h: linePx * 2.3 };
    }
    return { w: chars * (advance + trackingEm) * linePx, h: linePx * 1.25 };
  }

  let stacked = stackedPlan;
  for (let attempt = 0; attempt < 5 && !namePlacement; attempt++) {
    const box = nameBox(namePt, stacked);
    // Matte-aware: set the name INTO the photograph's measured negative
    // space when a real matte is present (the cutout / photo-dominant
    // registers); contrast still verified before accepting.
    if (effMatte && (structure === "cutout" || structure === "photo-dominant" || fullBleed) && nameOrientation === "horizontal") {
      const ns = matteNegativeSpace(effMatte, heroRect, { minWIn: box.w, minHIn: box.h });
      if (ns) {
        const r = rect(ns.x + (ns.w - box.w) * 0.5, ns.y + (ns.h - box.h) * 0.4, box.w, box.h);
        const edge = r.y + r.h / 2 < heroRect.y + heroRect.h / 2 ? "top" : "bottom";
        const contrast = resolveTextContrast({ forensics: effForensics, edge });
        if (contrast.verdict !== "relocate") {
          namePlacement = { rect: r, onPhoto: true, ink: contrast.ink, scrim: null, viaMatte: true };
        }
      }
    }
    if (!namePlacement) {
      namePlacement = placeText(rng, {
        wIn: box.w, hIn: box.h, heroRect, paperRects, heroForensics: effForensics,
        allowOnPhoto: structure === "photo-dominant" || fullBleed,
      });
    }
    if (namePlacement) namePlacement.box = box;
    if (!namePlacement) {
      // degrade: shrink, then stack, then force a paper strip
      if (namePt > 16) namePt = r3(namePt * 0.82);
      else if (!stacked && String(nameText).includes(" ")) stacked = true;
      else break;
    }
  }
  if (!namePlacement) {
    // guaranteed paper fallback band at the foot (mat-frame safety net)
    const box = nameBox(clamp(namePt, 14, 22), stacked);
    namePlacement = { rect: rect(SAFE, PAGE_H - SAFE - box.h - 0.1, PAGE_W - 2 * SAFE, box.h), onPhoto: false, ink: "dark", scrim: null };
    decide("name", "paper fallback", "no validated placement found");
  }
  // Knockout band: instead of a gradient scrim, an on-photo horizontal name
  // may sit on a SOLID band (ink or accent) with reversed type — a distinct,
  // confident reference motif. Energy-gated; horizontal on-photo names only.
  let knockout = null;
  const knockoutOdds =
    0.3 + 0.4 * intent.energy + (namePlacement.scrim ? 0.3 : 0); // marginal contrast → prefer the solid band
  if (!namePlacement.split && namePlacement.onPhoto && nameOrientation === "horizontal" && rng() < knockoutOdds) {
    const bandFill = rng() < 0.7 ? ink : accent;
    const bandRect = rect(
      heroRect.x,
      namePlacement.rect.y - 0.1,
      heroRect.w,
      namePlacement.rect.h + 0.2,
    );
    knockout = { fill: bandFill, rect: bandRect };
    elements.push({ type: "band", rect: bandRect, fill: bandFill, z: 3.5 });
    decide("knockout", `band ${bandFill}`, "energy-gated reversed-name band");
  }
  if (!namePlacement.split) {
    const nameColor = knockout
      ? "#FFFFFF"
      : namePlacement.onPhoto
        ? (namePlacement.ink === "light" ? "#FFFFFF" : ink)
        : (planeTone ? planeTone.ink : ink);
    elements.push({
      type: "name", text: nameText, rect: namePlacement.rect,
      orientation: nameOrientation, stacked, sizePt: r3(namePt), trackingEm: r3(trackingEm),
      onPhoto: namePlacement.onPhoto,
      color: nameColor,
      // a knockout band provides its own contrast; otherwise keep any scrim
      scrim: knockout ? null : namePlacement.scrim,
      z: namePlacement.onPhoto ? 4 : 3,
    });
    decide("name", `${nameOrientation}${stacked ? "/stacked" : ""} ${r3(namePt)}pt${knockout ? " knockout" : ""}`,
      namePlacement.onPhoto ? (namePlacement.viaMatte ? "in matte negative space" : "verified on photo") : "on paper");
  }

  // ── Ghost echo (layered type) — risk-gated, plane-owned ──────────────────
  // The echo must render as a COMPLETE word on the paper plane: amputated
  // glyph fragments read as rendering bugs, not layered editorial type
  // (audit P1-5). If the full name can't fit at display scale, no echo.
  if (rng() < 0.18 + 0.4 * intent.risk && nameOrientation === "horizontal" && !namePlacement.onPhoto && !namePlacement.split && !planeTone) {
    const gAdvance = advance + 0.04;
    const fitPt = ((PAGE_W - 0.5) * 72) / (chars * gAdvance);
    const gpt = Math.min(clamp(namePt * lerp(1.8, 3.2, rng()), 40, 120), fitPt);
    if (gpt >= 40) {
      const gw = chars * gAdvance * (gpt / 72);
      const gh = (gpt / 72) * 1.05;
      const gx = clamp(namePlacement.rect.x - 0.12, 0.15, PAGE_W - 0.15 - gw);
      const clampY = (y) => clamp(y, 0.12, PAGE_H - 0.12 - gh);
      // candidate positions: layered behind the name, else hugging the
      // photo's far edge — the first that stays entirely off the photo wins
      const candidates = [
        rect(gx, clampY(namePlacement.rect.y - gh * 0.28), gw, gh),
        rect(gx, clampY(heroRect.y + heroRect.h + 0.04), gw, gh),
        rect(gx, clampY(heroRect.y - gh - 0.04), gw, gh),
      ];
      const gr = candidates.find((r) => !rectsOverlap(r, heroRect));
      if (gr) {
        elements.push({
          type: "ghost", text: nameText, rect: gr,
          sizePt: r3(gpt), color: accent, opacity: r3(lerp(0.05, 0.11, rng())), z: 0.5, clip: false,
        });
        decide("ghost", `${r3(gpt)}pt @${r3(elements[elements.length - 1].opacity)}`, "complete-word echo, paper-plane ownership");
      }
    }
  }

  // ── Bleed-to-bottom when the name lives on the photo ─────────────────────
  // A photo-dominant card reserves a bottom paper strip sized for the name.
  // When the name went ONTO the photo instead (over / band / knockout /
  // classic-on-photo — but NOT straddle/inset, which deliberately use the
  // region below the photo), that strip is orphaned dead space holding only
  // a lone contact line. Bleed the photo to the page bottom edge so no dead
  // strip remains; the contact then rides the photo's bottom margin.
  let contactOnPhoto = null;
  if (
    namePlacement.onPhoto === true &&
    structure === "photo-dominant" &&
    heroRect.y + heroRect.h < PAGE_H - 0.02
  ) {
    const photoEl = elements.find((e) => e.type === "photo");
    const oldBottom = heroRect.y + heroRect.h;
    heroRect = rect(heroRect.x, heroRect.y, heroRect.w, PAGE_H - heroRect.y);
    if (photoEl) {
      photoEl.rect = heroRect;
      if (!photoEl.bleedEdges.includes("bottom")) photoEl.bleedEdges.push("bottom");
    }
    // drop the now-orphaned bottom paper strip
    paperRects = paperRects.filter((p) => p.y < oldBottom - 0.02);
    // ink for a contact riding the photo's bottom band (measured luma)
    const grid = effForensics?.luma?.grid;
    let bottomLuma = 0.5;
    if (Array.isArray(grid) && grid.length) {
      let sum = 0;
      let cnt = 0;
      for (let r = Math.floor(grid.length * 0.85); r < grid.length; r++) {
        for (const v of grid[r]) { sum += v; cnt += 1; }
      }
      bottomLuma = cnt ? sum / cnt : 0.5;
    }
    contactOnPhoto = { ink: bottomLuma < 0.5 ? "rgba(255,255,255,0.82)" : "rgba(20,18,16,0.72)" };
    decide("photo-bleed", "full-bleed bottom", "name on photo — no orphaned paper strip");
  }

  // ── Contact / stat micro-line — placed by search, restraint-gated ─────────
  if (ctx.contactLine) {
    const cpt = 7;
    const cbox = nameOrientation === "vertical" && paperRects.some((p) => p.h > 3)
      ? { w: 0.16, h: clamp(ctx.contactLine.length * 0.045, 1, 3.5) }
      : { w: clamp(ctx.contactLine.length * 0.052, 1, PAGE_W - 1), h: 0.16 };
    // Prefer a lockup directly beneath an on-paper horizontal name (the
    // reference register); fall back to independent negative-space search.
    let cp = null;
    const nr = namePlacement.rect;
    if (!namePlacement.onPhoto && nameOrientation === "horizontal") {
      const lockY = nr.y + nr.h + 0.06;
      if (lockY + cbox.h <= PAGE_H - SAFE && cbox.w <= PAGE_W - nr.x - SAFE) {
        cp = { rect: rect(nr.x + 0.02, lockY, cbox.w, cbox.h) };
      }
    }
    if (!cp) {
      const nameRects = elements.filter((e) => e.type === "name").map((e) => e.rect);
      cp = placeText(rng, {
        wIn: cbox.w, hIn: cbox.h, heroRect,
        paperRects: paperRects.map((p) => p), heroForensics: effForensics, allowOnPhoto: false,
        occupied: nameRects,
      });
    }
    // Photo bled to the bottom (name on photo): the contact rides the
    // photo's bottom margin, ink chosen from the measured band.
    let contactColor = planeTone ? planeTone.mutedInk : (palette?.muted || "#6B6560");
    if (!cp && contactOnPhoto && nameOrientation === "horizontal") {
      cp = { rect: rect(SAFE, PAGE_H - 0.36, cbox.w, cbox.h), onPhoto: true };
      contactColor = contactOnPhoto.ink;
    }
    if (cp) {
      elements.push({
        type: "contact", text: ctx.contactLine, rect: cp.rect,
        orientation: cbox.w < 0.3 ? "vertical" : "horizontal",
        sizePt: cpt,
        color: contactColor,
        z: cp.onPhoto ? 4 : 3,
      });
    }
  }

  // (Monogram primitive removed: a lone initial alongside the spelled-out
  // name reads as an orphaned/redundant glyph — the name carries identity.)

  // wordmark slot is decided by the existing dynamic placement downstream;
  // the program reserves the lowest-interference corner reference only.
  return { structure, elements, decisions };
}

// ── computational aesthetics scorer (pre-jury) ──────────────────────────────

/**
 * Classic layout-quality energies tuned to the reference register: edge
 * alignment, visual-weight balance, whitespace breathing, hierarchy spread.
 * Higher is better. Deterministic.
 */
function scoreProgram(program, ctx) {
  const els = program.elements;
  const textEls = els.filter((e) => ["name", "contact", "statLine"].includes(e.type));
  let score = 50;

  // alignment: reward shared left/right edges among text elements
  const edges = textEls.flatMap((e) => [r3(e.rect.x), r3(e.rect.x + e.rect.w)]);
  const uniqueEdges = new Set(edges.map((v) => Math.round(v * 20)));
  if (edges.length) score += 18 * (1 - uniqueEdges.size / (edges.length + 1));

  // name presence: the name is the card's identity (audit P1-5) — a
  // confident span is rewarded ahead of any positional preference, and a
  // timid on-paper name is penalized. Size trades against photo coverage.
  const name = els.find((e) => e.type === "name");
  if (name) {
    const wFrac = name.rect.w / PAGE_W;
    score += 16 * clamp((wFrac - 0.28) / 0.44, 0, 1);
    if ((name.sizePt || 0) < 18 && !name.onPhoto) score -= 6;
    const cx = (name.rect.x + name.rect.w / 2) / PAGE_W;
    const cy = (name.rect.y + name.rect.h / 2) / PAGE_H;
    score += 6 * (1 - Math.abs(cy - 0.74));
    score += 4 * (1 - Math.abs(cx - 0.5));
  }
  // the knockout band is the loudest name-prominence tool — count it (the
  // split lockup's accent panel is not a knockout; it carries its own term)
  const hasSplit = els.some((e) => e.role === "split-first");
  if (!hasSplit && els.some((e) => e.type === "band")) score += 5;
  // the split-zone lockup is a signature register, not the default: a small
  // reward keeps it competitive without letting it swallow the catalog
  if (hasSplit) score += 2;

  // breathing: penalize text crowding the trim edge
  for (const e of textEls) {
    if (e.rect.x < SAFE - 0.02 || e.rect.x + e.rect.w > PAGE_W - SAFE + 0.02 ||
        e.rect.y < SAFE - 0.02 || e.rect.y + e.rect.h > PAGE_H - SAFE + 0.02) {
      if (!e.onPhoto) score -= 8;
    }
  }

  // hierarchy: a clear dominant photo + a single dominant name
  const photo = els.find((e) => e.type === "photo");
  if (photo) {
    const cov = (photo.rect.w * photo.rect.h) / (PAGE_W * PAGE_H);
    score += 10 * clamp((cov - 0.45) / 0.4, 0, 1); // hero-led reward
  }

  // tasteful layering bonus (ghost/cutout present and valid)
  if (els.some((e) => e.type === "ghost")) score += 4;

  return r3(score);
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Stable structural signature: the shape of the program independent of exact
 * coordinates — used to verify production non-repetition.
 */
function structuralSignature(program) {
  const parts = program.elements
    .slice()
    .sort((a, b) => (a.z - b.z) || a.type.localeCompare(b.type))
    .map((e) => {
      if (e.type === "name") return `name:${e.role || "solo"}${e.variant ? `-${e.variant}` : ""}:${e.orientation}:${e.stacked ? "stk" : "one"}:${e.onPhoto ? "img" : "pap"}`;
      if (e.type === "photo") return `photo:${[...(e.bleedEdges || [])].sort().join("") || "inset"}`;
      return e.type;
    });
  return `${program.structure}|${parts.join(",")}`;
}

/**
 * Synthesize the best valid front program from K seeded candidates.
 *
 * @param {object} ctx — { heroAspect (raw image w/h), heroCrop ({
 *   objectPosition } — the cover-crop the renderer will apply), heroForensics,
 *   palette, typography, nameText, nameMetrics, contactLine, language, brief }
 * @param {object} opts — { seed, candidates = 5, forceStructure — pin the
 *   field structure for named-direction generation }
 * @returns {{ program, signature, score, decisions, candidates: number }}
 */
function designFrontProgram(ctx = {}, opts = {}) {
  const intent = resolveIntent(ctx.language, ctx.brief);
  const fullCtx = {
    ...ctx,
    intent,
    forceStructure: opts.forceStructure || ctx.forceStructure || null,
    forceTreatment: opts.forceTreatment || ctx.forceTreatment || null,
  };
  // "Another take" must be a materially different art direction, not a
  // nudge: candidates repeating the previous take's structure or name
  // treatment are penalized in the pick (soft — validity still wins when
  // the pool leaves no alternative).
  const avoid = opts.avoid && typeof opts.avoid === "object" ? opts.avoid : null;
  const seed = opts.seed == null ? "auto" : String(opts.seed);
  const k = Math.max(1, Math.min(opts.candidates || 5, 8));

  // `pickIndex` (P4 jury): deterministically return candidate N instead of
  // the aesthetics winner — so a vision jury that ranked the rendered
  // candidates can force its choice on the final pass.
  if (Number.isInteger(opts.pickIndex) && opts.pickIndex >= 0 && opts.pickIndex < k) {
    const program = sampleProgram(`${seed}:cand${opts.pickIndex}`, fullCtx);
    return {
      program,
      signature: structuralSignature(program),
      score: scoreProgram(program, fullCtx),
      decisions: program.decisions,
      candidates: k,
      pickIndex: opts.pickIndex,
      intent,
    };
  }

  let best = null;
  for (let i = 0; i < k; i++) {
    const program = sampleProgram(`${seed}:cand${i}`, fullCtx);
    // every program is paper-safe by construction (name has a guaranteed
    // fallback; on-photo elements are pre-verified during placement).
    let score = scoreProgram(program, fullCtx);
    if (avoid) {
      const splitEl = program.elements.find((e) => e.role === "split-first");
      const takeTreatment = splitEl ? splitEl.variant : "classic";
      if (avoid.structure && program.structure === avoid.structure) score -= 18;
      if (avoid.treatment && takeTreatment === avoid.treatment) score -= 12;
    }
    if (!best || score > best.score) best = { program, score, i };
  }
  return {
    program: best.program,
    signature: structuralSignature(best.program),
    score: best.score,
    decisions: best.program.decisions,
    candidates: k,
    pickIndex: best.i,
    intent,
  };
}

module.exports = {
  designFrontProgram,
  sampleProgram,
  scoreProgram,
  structuralSignature,
  resolveIntent,
  scoreOverPhoto,
  PAGE_W,
  PAGE_H,
};
