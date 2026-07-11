/**
 * EDITION field-structure builders (editions plan 2.4).
 *
 * When a take carries an edition (`ctx.edition = { def, operators }`), the
 * front program samples its field structure from the edition's weighted
 * structure pool and builds it here — masthead, column-grid, cover-story,
 * diptych, filmstrip-foot, plus edition-parameterized matted (deep mats /
 * dark fields), photo-dominant and cutout. The legacy sampler is NEVER
 * entered on this path, and this module is NEVER entered without an
 * edition — the two paths share only verified primitives (print rules,
 * lockup grammar, crop-space, face machinery).
 *
 * Every builder:
 * - emits the existing element vocabulary (photo / colorPlane / band /
 *   rule / name / contact / ghost) with ADDITIVE extensions only
 *   (photo.imageId/crop/layer/role, rule variants hairline|hinge, the
 *   folio element, name.lockup/leading/role);
 * - draws the name from the edition's lockup pool (lockups.js);
 * - honors the reversed-type print rules on dark fields (print-rules.js);
 * - REFUSES (returns null) when it cannot honor its invariants — the
 *   caller falls back to the photo-dominant builder;
 * - is deterministic for identical (seed, ctx).
 */

const { faceZone } = require("../type-safety");
const { visibleCropWindow, cropForensics, cropMatteGrid } = require("../crop-space");
const {
  reversedMinPt,
  reversedTypeOk,
  linearLuminance,
  gammaLuma,
  srgbLinear,
  contrastOfLinear,
  isDarkSurface,
  cellsUnderRect,
  worstCellRatio,
  worstCompositeInkRatio,
  solveVeilAlpha,
} = require("./print-rules");
const { buildLockupFromPool, buildInline, buildStacked, buildContrast } = require("./lockups");

const PAGE_W = 5.5;
const PAGE_H = 8.5;
const SAFE = 0.25;

// Booker's-law hero presence floors — sourced from the editions catalog
// when present (read-only import), else the spec defaults.
let HERO_AREA_FLOOR = 0.5;
let HERO_AREA_FLOOR_DEEP_MAT = 0.42;
try {
  // eslint-disable-next-line global-require
  const editions = require("../editions");
  if (Number.isFinite(editions.HERO_AREA_FLOOR)) HERO_AREA_FLOOR = editions.HERO_AREA_FLOOR;
  if (Number.isFinite(editions.HERO_AREA_FLOOR_DEEP_MAT)) {
    HERO_AREA_FLOOR_DEEP_MAT = editions.HERO_AREA_FLOOR_DEEP_MAT;
  }
} catch {
  /* catalog unavailable — spec defaults hold */
}

// ── small helpers (kept local; the legacy sampler's copies stay private) ────

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const r3 = (n) => Math.round(n * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

function rect(x, y, w, h) {
  return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

function bleedEdgesOf(r) {
  return [
    r.x <= 1e-6 ? "left" : null,
    r.y <= 1e-6 ? "top" : null,
    r.x + r.w >= PAGE_W - 1e-6 ? "right" : null,
    r.y + r.h >= PAGE_H - 1e-6 ? "bottom" : null,
  ].filter(Boolean);
}

/** Register-narrowed point bounds: quiet = lower third, display = upper. */
function registerBand(scale = {}, register = "standard") {
  const lo = Number.isFinite(scale.minPt) ? scale.minPt : 18;
  const hi = Number.isFinite(scale.maxPt) ? Math.max(scale.maxPt, lo) : Math.max(36, lo);
  const span = hi - lo;
  if (register === "quiet") return [lo, lo + span / 3];
  if (register === "display") return [hi - span / 3, hi];
  return [lo + span / 6, hi - span / 6];
}

/** Edition tracking: bias −1 tight … +1 wide, seeded upward jitter. */
function editionTracking(rng, scale = {}) {
  const bias = Number.isFinite(scale.trackingBias) ? scale.trackingBias : 0;
  return r3(clamp(0.06 + 0.18 * bias + 0.04 * rng() * Math.max(0, bias), 0, 0.45));
}

/** Crop-mapped forensics/matte for a hero rect (identity when unknown). */
function effViews(ctx, heroRect) {
  const cropWindow = visibleCropWindow({
    imageAspect: ctx.heroAspect,
    cellAspect: heroRect && heroRect.h > 0 ? heroRect.w / heroRect.h : null,
    objectPosition: ctx.heroCrop?.objectPosition || "50% 50%",
  });
  return {
    forensics: cropForensics(ctx.heroForensics || null, cropWindow),
    matte: cropMatteGrid(ctx.matteGrid || null, cropWindow),
  };
}

/** Bilinear sampler over a coverage grid (row 0 = top, values 0..1). */
function matteSampler(grid) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) return null;
  const rows = grid.length;
  const cols = grid[0].length;
  return (fx, fy) => {
    const gx = clamp(fx, 0, 1) * cols - 0.5;
    const gy = clamp(fy, 0, 1) * rows - 0.5;
    const c0 = clamp(Math.floor(gx), 0, cols - 1);
    const r0 = clamp(Math.floor(gy), 0, rows - 1);
    const c1 = Math.min(cols - 1, c0 + 1);
    const r1 = Math.min(rows - 1, r0 + 1);
    const tx = clamp(gx - c0, 0, 1);
    const ty = clamp(gy - r0, 0, 1);
    const a = grid[r0][c0] * (1 - tx) + grid[r0][c1] * tx;
    const b = grid[r1][c0] * (1 - tx) + grid[r1][c1] * tx;
    return a * (1 - ty) + b * ty;
  };
}

/** Mean matte coverage over a page rect mapped into the hero frame. */
function coverageOver(sampler, r, frame, sx = 4, sy = 3) {
  if (!sampler || !frame || !(frame.w > 0) || !(frame.h > 0)) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < sx; i++) {
    for (let j = 0; j < sy; j++) {
      const fx = (r.x + ((i + 0.5) / sx) * r.w - frame.x) / frame.w;
      const fy = (r.y + ((j + 0.5) / sy) * r.h - frame.y) / frame.h;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;
      sum += sampler(fx, fy);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/** Face zone mapped to page coords for a hero rect, or null. */
function facePageRect(effForensics, heroRect) {
  const zone = faceZone(effForensics);
  if (!zone || !heroRect) return null;
  return rect(
    heroRect.x + zone.x0 * heroRect.w,
    heroRect.y + zone.y0 * heroRect.h,
    (zone.x1 - zone.x0) * heroRect.w,
    (zone.y1 - zone.y0) * heroRect.h,
  );
}

function rectsIntersect(a, b, eps = 1e-4) {
  return (
    a.x + a.w > b.x + eps && b.x + b.w > a.x + eps &&
    a.y + a.h > b.y + eps && b.y + b.h > a.y + eps
  );
}

/**
 * Verified micro text riding a photograph: try the translucent inks in
 * `order` and keep the first whose worst-cell composited ratio clears 4.5.
 * Null = the text is DROPPED from the front (never set unverified).
 */
function verifiedPhotoInk(grid, r, frame, preferLight) {
  const cells = cellsUnderRect(grid, r, frame);
  if (!cells.length) return null;
  const light = { css: "rgba(255,255,255,0.82)", inkGamma: 1, alpha: 0.82 };
  const dark = { css: "rgba(20,18,16,0.72)", inkGamma: gammaLuma("#141210"), alpha: 0.72 };
  const order = preferLight ? [light, dark] : [dark, light];
  for (const ink of order) {
    if (worstCompositeInkRatio(cells, ink) >= 4.5) return ink.css;
  }
  return null;
}

/** Contact line box (legacy geometry, size-scaled for reversed floors). */
function contactBox(contactLine, cpt) {
  const perChar = 0.052 * (cpt / 7);
  return { w: clamp(contactLine.length * perChar, 1, PAGE_W - 1), h: (cpt / 72) * 1.6 };
}

// ── shared bundle prep ───────────────────────────────────────────────────────

function prepare(ctx, rng) {
  const def = ctx.edition?.def || {};
  const ops = ctx.edition?.operators || {};
  const paper = ctx.palette?.background || ctx.palette?.paper || "#FAF8F5";
  const ink = ctx.palette?.text || ctx.palette?.ink || "#1A1815";
  const dark = ctx.palette?.dark === true || isDarkSurface(paper);
  const scale = def.scale || {};
  const register = ops.register || "standard";
  // register-narrowed name bounds: design-language publishes the clamp on
  // plan.language.scale (source of truth); local thirds-narrowing is the
  // defensive fallback when the language object does not reach us.
  const langScale = ctx.language?.scale;
  const ptBounds =
    langScale && Number.isFinite(langScale.minPt) && Number.isFinite(langScale.maxPt)
      ? [langScale.minPt, Math.max(langScale.maxPt, langScale.minPt)]
      : registerBand(scale, register);
  return {
    ctx,
    rng,
    def,
    field: ops.field || "paper",
    register,
    ptBounds,
    lockups: Array.isArray(def.lockups) && def.lockups.length ? def.lockups : ["inline"],
    ornaments: Array.isArray(def.ornaments) ? def.ornaments : [],
    scale,
    stackBias: Number.isFinite(scale.stackBias) ? scale.stackBias : 0.3,
    trackingEm: editionTracking(rng, scale),
    paper,
    ink,
    muted: ctx.palette?.muted || (dark ? "#B9B3AB" : "#6B6560"),
    accent: ctx.palette?.accent || "#B8956A",
    ruleColor: ctx.palette?.rule || (dark ? "#3A3733" : "#E2DED6"),
    dark,
    nameText: ctx.nameText || "Untitled",
    metrics: ctx.nameMetrics || { advanceEm: 0.6 },
    displayFamily: ctx.typography?.display || null,
    bodyFamily: ctx.typography?.body || "Inter",
    weight: ctx.nameMetrics?.weight || ctx.language?.name?.weightClass || 500,
    contactLine: ctx.contactLine || null,
    intent: ctx.intent || { formality: 0.5, energy: 0.45, warmth: 0.5, density: 0.45, risk: 0.35 },
    supportPool: Array.isArray(ctx.supportPool) ? ctx.supportPool.filter((s) => s && s.id) : [],
    cropOf(imageId, cellAspect, fallback) {
      if (typeof ctx.cropResolver === "function") {
        try {
          const c = ctx.cropResolver(imageId, cellAspect);
          if (c && typeof c === "object") return c;
        } catch {
          /* resolver failure → default cover crop */
        }
      }
      return fallback || { objectPosition: "50% 50%" };
    },
  };
}

function lockupSpec(b, overrides = {}) {
  const [lo, hi] = b.ptBounds || registerBand(b.scale, b.register);
  return {
    nameText: b.nameText,
    metrics: b.metrics,
    trackingEm: b.trackingEm,
    dark: b.dark,
    displayFamily: b.displayFamily,
    bodyFamily: b.bodyFamily,
    weight: b.weight,
    stackBias: b.stackBias,
    loPt: Math.max(14, lo),
    hiPt: Math.max(hi, Math.max(14, lo)),
    allowVertical: false,
    ...overrides,
  };
}

/** Contact on paper: emitted under the name block (the reference lockup). */
function paperContact(b, x, y, { align = "left", blockW = 0 } = {}) {
  if (!b.contactLine) return null;
  const cpt = b.dark ? Math.max(10, reversedMinPt({ family: b.bodyFamily, weight: 400 })) : 7;
  const box = contactBox(b.contactLine, cpt);
  if (y + box.h > PAGE_H - SAFE + 0.02) return null;
  const cx = align === "center" ? x + (blockW - box.w) / 2 : align === "right" ? x + blockW - box.w : x;
  return {
    type: "contact",
    text: b.contactLine,
    rect: rect(clamp(cx, SAFE, PAGE_W - SAFE - box.w), y, box.w, box.h),
    orientation: "horizontal",
    sizePt: cpt,
    color: b.muted,
    z: 3,
  };
}

/** Folio — the one earned ornament: a small foot-anchored imprint line. */
function folioElement(b, { x, y, align = "left", color } = {}) {
  const text = b.ctx.folioText || "№ 01";
  const sizePt = b.dark ? Math.max(8, reversedMinPt({ family: b.bodyFamily, weight: 600 })) : 7;
  const w = clamp(text.length * 0.06 * (sizePt / 7), 0.3, 1.6);
  const h = (sizePt / 72) * 1.5;
  return {
    type: "folio",
    text,
    rect: rect(clamp(x, SAFE, PAGE_W - SAFE - w), y - h, w, h),
    sizePt,
    trackingEm: 0.2,
    color: color || b.muted,
    weight: 600,
    align,
    transform: "uppercase",
    z: 3,
  };
}

// ── structure builders ───────────────────────────────────────────────────────

/**
 * MASTHEAD — the name set as a magazine nameplate above the photograph.
 * Display scale solved from a 0.86–1.0 span of the page (minus margins);
 * hero below bleeding left/right/bottom; seam ≤ 0.12in.
 */
function buildMasthead(rng, b) {
  const elements = [];
  const decisions = [];
  const margin = 0.3;
  const innerW = PAGE_W - 2 * margin;
  const span = lerp(0.86, 1.0, rng());
  const gap = r3(lerp(0.04, 0.12, rng()));
  const bandTop = 0.3;

  // band height budget keeps the masthead 12–20% of the page
  const maxBandH = 0.2 * PAGE_H - bandTop - gap;
  const [lo, hi] = b.ptBounds || registerBand(b.scale, b.register);
  const pool = b.lockups.filter((l) => ["inline", "stacked", "contrast"].includes(l));
  const spec = lockupSpec(b, {
    maxWIn: innerW * span,
    loPt: Math.max(14, lo),
    // per-lockup ceiling: a stacked nameplate carries two lines in the band
    hiPt: Math.min(hi, (maxBandH - 0.06) * 72 / 1.25),
  });
  let block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], spec);
  if (block && block.lockup === "stacked" && block.h > maxBandH) {
    block = buildInline(rng, spec) || buildContrast(rng, spec);
  }
  if (!block || block.h > maxBandH + 1e-6) return null;

  const heroY = r3(bandTop + block.h + gap);
  const heroRect = rect(0, heroY, PAGE_W, PAGE_H - heroY);
  if ((heroRect.w * heroRect.h) / (PAGE_W * PAGE_H) < Math.max(HERO_AREA_FLOOR, 0.6)) return null;

  const blockX = (PAGE_W - block.w) / 2;
  elements.push(...block.place(blockX, bandTop, { color: b.ink, align: "center", z: 3 }));
  elements.push({ type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) });
  decisions.push({ k: "structure", v: "masthead", why: `nameplate span ${r3(block.w / innerW)}, seam ${gap}in` });

  // foot text rides the photograph — verified per-cell or dropped
  const { forensics } = effViews(b.ctx, heroRect);
  const grid = forensics?.luma?.grid;
  const preferLight = (forensics?.luma?.mean ?? 0.5) < 0.5;
  if (b.contactLine && grid) {
    const box = contactBox(b.contactLine, 7);
    const cRect = rect(SAFE, PAGE_H - 0.36, box.w, box.h);
    const ink = verifiedPhotoInk(grid, cRect, heroRect, preferLight);
    if (ink) {
      elements.push({
        type: "contact", text: b.contactLine, rect: cRect,
        orientation: "horizontal", sizePt: 7, color: ink, onPhoto: true, z: 4,
      });
    } else {
      decisions.push({ k: "contact", v: "dropped", why: "foot cells unverifiable ≥4.5:1" });
    }
  }
  if (b.ornaments.includes("folio") && grid) {
    const fw = 1.0;
    const fRect = rect(PAGE_W - SAFE - fw, PAGE_H - 0.38, fw, 0.15);
    const ink = verifiedPhotoInk(grid, fRect, heroRect, preferLight);
    if (ink) {
      const folio = folioElement(b, { x: fRect.x, y: PAGE_H - 0.23, align: "right", color: ink });
      folio.z = 4;
      folio.onPhoto = true;
      elements.push(folio);
    }
  }

  return {
    structure: "masthead",
    elements,
    decisions,
    lockup: block.lockup,
    metrics: {
      span: r3(block.w / innerW),
      bandFrac: r3(heroY / PAGE_H),
      seamGap: gap,
      heroFrac: r3((heroRect.w * heroRect.h) / (PAGE_W * PAGE_H)),
    },
  };
}

/**
 * COLUMN-GRID — a paper rail beside a bleeding hero; rail text and rules
 * snap to a computed module grid (rail height / {6,8,12}).
 */
function buildColumnGrid(rng, b) {
  const elements = [];
  const decisions = [];
  const railW = r3(lerp(1.1, 1.6, rng()));
  const side = rng() < 0.5 ? "left" : "right";
  const heroRect = side === "left"
    ? rect(railW, 0, PAGE_W - railW, PAGE_H)
    : rect(0, 0, PAGE_W - railW, PAGE_H);
  const railX0 = side === "left" ? SAFE : PAGE_W - railW + 0.14;
  const railX1 = side === "left" ? railW - 0.14 : PAGE_W - SAFE;
  const innerW = railX1 - railX0;
  const railTop = SAFE;
  const railH = PAGE_H - 2 * SAFE;
  const moduleCount = pick(rng, [6, 8, 12]);
  const module = railH / moduleCount;
  const lineY = (k) => railTop + k * module;
  const snap = (y) => lineY(clamp(Math.round((y - railTop) / module), 0, moduleCount));

  elements.push({ type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) });

  // name: spine along the rail (the premium register) or a stacked block
  const [lo, hi] = b.ptBounds || registerBand(b.scale, b.register);
  const occupied = [];
  let block = null;
  let nameEls = null;
  if (b.lockups.includes("spine") && rng() < 0.72) {
    const spanH = lerp(0.62, 0.9, rng()) * railH;
    const { buildSpine } = require("./lockups");
    block = buildSpine(rng, lockupSpec(b, { maxWIn: innerW, maxHIn: spanH, allowVertical: true }));
    if (block) {
      const y0 = snap(railTop + lerp(0.5, 1.5, rng()) * module);
      const y = Math.min(y0, railTop + railH - block.h);
      nameEls = block.place(railX0, y, { color: b.ink, z: 3 });
    }
  }
  if (!block) {
    const pool = b.lockups.filter((l) => l !== "spine");
    block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], lockupSpec(b, {
      maxWIn: innerW,
      loPt: Math.max(14, Math.min(lo, (innerW * 72) / 4)),
      hiPt: hi,
    }));
    if (!block) return null;
    nameEls = block.place(railX0, snap(railTop + module), { color: b.ink, z: 3 });
  }
  elements.push(...nameEls);
  for (const e of nameEls) occupied.push(e.rect);

  // 1–3 hairline rules ON module lines ('rules' ornament)
  let ruleCount = 0;
  if (b.ornaments.includes("rules")) {
    const want = 1 + Math.floor(rng() * 3);
    const candidates = [2, moduleCount - 2, Math.floor(moduleCount / 2), 3, moduleCount - 3];
    const used = new Set();
    for (const k of candidates) {
      if (ruleCount >= want) break;
      if (k <= 0 || k >= moduleCount || used.has(k)) continue;
      const rr = rect(railX0, lineY(k) - 0.005, innerW, 0.01);
      if (occupied.some((o) => rectsIntersect(rr, { ...o, y: o.y - 0.06, h: o.h + 0.12 }))) continue;
      used.add(k);
      elements.push({
        type: "rule", variant: "hairline", orientation: "horizontal",
        rect: rr, color: b.ruleColor, weight: 0.01, z: 2,
      });
      occupied.push(rr);
      ruleCount += 1;
    }
  }

  // contact: vertical along the rail (top edge snapped) or dropped
  if (b.contactLine) {
    const cpt = b.dark ? 10 : 7;
    const ch = clamp(b.contactLine.length * 0.045 * (cpt / 7), 1, railH * 0.5);
    const cw = 0.16;
    const cx = block.lockup === "spine" ? railX0 + block.w + 0.14 : railX0;
    const cy = snap(railTop + (moduleCount - Math.ceil(ch / module) - 1) * module);
    const cRect = rect(cx, Math.min(cy, railTop + railH - ch - module), cw, ch);
    if (cx + cw <= railX1 + 1e-6 && !occupied.some((o) => rectsIntersect(cRect, o))) {
      elements.push({
        type: "contact", text: b.contactLine, rect: cRect,
        orientation: "vertical", sizePt: cpt, color: b.muted, z: 3,
      });
      occupied.push(cRect);
    }
  }

  // folio at the rail foot — bottom edge on the last grid line
  if (b.ornaments.includes("folio")) {
    elements.push(folioElement(b, { x: railX0, y: railTop + railH, align: "left" }));
  }

  decisions.push({
    k: "structure", v: "column-grid",
    why: `rail ${side} ${railW}in, module ${moduleCount}, ${ruleCount} rule(s)`,
  });
  const nameEl = nameEls.find((e) => e.type === "name");
  return {
    structure: "column-grid",
    elements,
    decisions,
    lockup: block.lockup,
    metrics: {
      railSide: side,
      railWidth: railW,
      module: r3(module),
      moduleCount,
      ruleCount,
      railTop: r3(railTop),
      railHeight: r3(railH),
      railX0: r3(railX0),
      railX1: r3(railX1),
      railUtilization: r3(
        block.lockup === "spine" && nameEl ? nameEl.rect.h / railH : (nameEl ? nameEl.rect.w / innerW : 0),
      ),
    },
  };
}

/**
 * COVER-STORY — display type layered BEHIND the subject (matte-gated).
 * Emits base photo (layer 'base'), the name, then a duplicated cutout
 * photo (layer 'figure') above it. Interlock 0.12–0.4 of glyph area with
 * per-word readability; the face is never intersected by type.
 */
function buildCoverStory(rng, b) {
  const ctx = b.ctx;
  const hasAlphaMatte = !!ctx.matteGrid && (ctx.matteSource || "alpha") === "alpha";
  if (!hasAlphaMatte || !ctx.heroForensics) return null;
  const heroRect = rect(0, 0, PAGE_W, PAGE_H);
  const { forensics, matte } = effViews(ctx, heroRect);
  const sampler = matteSampler(matte);
  const face = facePageRect(forensics, heroRect);
  if (!sampler || !face) return null;
  const grid = forensics?.luma?.grid;
  if (!Array.isArray(grid) || !grid.length) return null;

  const [lo, hi] = b.ptBounds || registerBand(b.scale, b.register);
  const adv = b.metrics?.advanceEm || 0.6;
  const track = clamp(b.trackingEm, 0, 0.12); // display interlock sets tight
  const parts = String(b.nameText).trim().split(/\s+/).filter(Boolean);
  const stacked = parts.length > 1 &&
    (b.lockups.includes("stacked") ? rng() < 0.45 + 0.5 * b.stackBias : false);
  const lines = stacked ? [parts[0], parts.slice(1).join(" ")] : [String(b.nameText).trim()];

  // per-line word layout at a given pt/topY → glyph boxes + occlusions
  const layout = (pt, topY) => {
    const lineH = (pt / 72) * 1.04;
    const leading = stacked ? lerp(0.94, 0.98, 0.5) : 1;
    const glyphs = [];
    const lineRects = [];
    lines.forEach((line, li) => {
      const chars = line.length;
      const wIn = chars * (adv + track) * (pt / 72);
      const x0 = (PAGE_W - wIn) / 2;
      const y = topY + li * lineH * leading;
      lineRects.push(rect(x0, y, wIn, lineH));
      let wi = 0;
      const wordsOf = line.split(/(\s+)/);
      let cursor = 0;
      for (const seg of wordsOf) {
        if (/^\s+$/.test(seg)) { cursor += seg.length; wi += 1; continue; }
        for (let i = 0; i < seg.length; i++) {
          const gx = x0 + (cursor + i) * (adv + track) * (pt / 72);
          glyphs.push({
            word: `${li}:${Math.floor(wi / 2)}`,
            rect: rect(gx, y + lineH * 0.12, adv * (pt / 72), lineH * 0.74),
          });
        }
        cursor += seg.length;
      }
    });
    const blockW = Math.max(...lineRects.map((r) => r.w));
    const blockH = lineRects[lineRects.length - 1].y + lineRects[lineRects.length - 1].h - topY;
    const block = rect((PAGE_W - blockW) / 2, topY, blockW, blockH);
    return { lineRects, glyphs, block };
  };

  const evaluate = (pt, topY) => {
    const { lineRects, glyphs, block } = layout(pt, topY);
    if (block.x < 0.1 || block.x + block.w > PAGE_W - 0.1) return null;
    if (block.y < SAFE || block.y + block.h > PAGE_H - SAFE) return null;
    if (rectsIntersect(block, face)) return null; // type never enters the face
    let occSum = 0;
    let maxOcc = 0;
    const wordOcc = new Map();
    for (const g of glyphs) {
      const occ = coverageOver(sampler, g.rect, heroRect, 3, 3);
      occSum += occ;
      if (occ > maxOcc) maxOcc = occ;
      const agg = wordOcc.get(g.word) || { sum: 0, n: 0, max: 0 };
      agg.sum += occ;
      agg.n += 1;
      agg.max = Math.max(agg.max, occ);
      wordOcc.set(g.word, agg);
    }
    const interlock = glyphs.length ? occSum / glyphs.length : 0;
    if (interlock < 0.12 || interlock > 0.4) return null;
    if (maxOcc > 0.6) return null; // no glyph occluded beyond 60%
    for (const agg of wordOcc.values()) {
      // first and last name independently readable
      if (agg.sum / agg.n > 0.4 || agg.max > 0.6) return null;
    }
    return { lineRects, block, interlock: r3(interlock), maxOcc: r3(maxOcc) };
  };

  // seeded search: y anchors × shrinking pt
  const anchors = [0.1, 0.16, 0.22, 0.3, 0.38, 0.06];
  const startIdx = Math.floor(rng() * anchors.length);
  let pt = clamp(lerp(hi, lo + (hi - lo) * 0.4, rng() * 0.5), lo, hi);
  let placed = null;
  for (let attempt = 0; attempt < 4 && !placed; attempt++) {
    for (let i = 0; i < anchors.length && !placed; i++) {
      const fy = anchors[(startIdx + i) % anchors.length];
      placed = evaluate(pt, fy * PAGE_H);
    }
    if (!placed) {
      pt = r3(pt * 0.88);
      if (pt < Math.max(lo * 0.8, 24)) break;
    }
  }
  if (!placed) return null;

  // ink verified against the field the glyphs actually sit on
  const cells = cellsUnderRect(grid, placed.block, heroRect);
  const candidates = [
    { hex: "#FFFFFF" }, { hex: b.ink }, { hex: b.accent },
  ].filter((c) => /^#/.test(String(c.hex || "")));
  const fill = candidates.find((c) => worstCellRatio(cells, c.hex) >= 3.0) || null;
  if (!fill) return null;

  const elements = [];
  elements.push({ type: "photo", rect: heroRect, z: 1, layer: "base", bleedEdges: bleedEdgesOf(heroRect) });
  placed.lineRects.forEach((lr, li) => {
    elements.push({
      type: "name",
      role: lines.length > 1 ? (li === 0 ? "lockup-first" : undefined) : undefined,
      text: lines[li],
      rect: lr,
      orientation: "horizontal",
      stacked: false,
      sizePt: r3(pt),
      trackingEm: r3(track),
      lockup: stacked ? "stacked" : "inline",
      onPhoto: true,
      color: fill.hex,
      weight: b.metrics?.first?.weight || 700,
      align: "center",
      transform: "uppercase",
      scrim: null,
      z: 1.6,
    });
  });
  elements.push({
    type: "photo", rect: heroRect, z: 2, layer: "figure", isCutout: true,
    bleedEdges: bleedEdgesOf(heroRect),
  });

  // contact at the foot, verified over the COMPOSITE (worst of base cells)
  const decisions = [{
    k: "structure", v: "cover-story",
    why: `interlock ${placed.interlock}, display ${r3(pt)}pt behind the figure`,
  }];
  if (b.contactLine) {
    const box = contactBox(b.contactLine, 7);
    const cRect = rect(SAFE, PAGE_H - 0.36, box.w, box.h);
    const ink = verifiedPhotoInk(grid, cRect, heroRect, (forensics?.luma?.mean ?? 0.5) < 0.5);
    if (ink) {
      elements.push({
        type: "contact", text: b.contactLine, rect: cRect,
        orientation: "horizontal", sizePt: 7, color: ink, onPhoto: true, z: 4,
      });
    } else {
      decisions.push({ k: "contact", v: "dropped", why: "foot cells unverifiable ≥4.5:1" });
    }
  }

  const nameArea = placed.block.w * placed.block.h;
  return {
    structure: "cover-story",
    elements,
    decisions,
    lockup: stacked ? "stacked" : "inline",
    metrics: {
      interlock: placed.interlock,
      maxGlyphOcclusion: placed.maxOcc,
      nameAreaFrac: r3(nameArea / (PAGE_W * PAGE_H)),
    },
  };
}

/**
 * DIPTYCH — two frames on a hinge: the hero plus the best pairable
 * support (shot-type contrast preferred), equal-ish cells, shared edge,
 * name across the hinge or beneath.
 */
function buildDiptych(rng, b) {
  const support = pickPairableSupport(b);
  if (!support) return null;
  const vertical = rng() < 0.85 && (!Number.isFinite(support.aspect) || support.aspect <= 1.1);
  const gutter = r3(lerp(0.06, 0.12, rng()));
  const ratio = lerp(0.92, 1.08, rng()); // cell area ratio 0.85–1.18 by construction
  const heroFirst = rng() < 0.6;
  const elements = [];
  const decisions = [];
  let cellA;
  let cellB;
  let cellsBottom;

  if (vertical) {
    const H = lerp(0.66, 0.74, rng()) * PAGE_H;
    const total = PAGE_W - gutter;
    const wA = (total * ratio) / (1 + ratio);
    cellA = rect(0, 0, wA, H);
    cellB = rect(wA + gutter, 0, total - wA, H);
    cellsBottom = H;
  } else {
    const bandBudget = 1.5;
    const totalH = PAGE_H - bandBudget - gutter;
    const hA = (totalH * ratio) / (1 + ratio);
    cellA = rect(0, 0, PAGE_W, hA);
    cellB = rect(0, hA + gutter, PAGE_W, totalH - hA);
    cellsBottom = totalH + gutter;
  }
  const heroCell = heroFirst ? cellA : cellB;
  const supportCell = heroFirst ? cellB : cellA;
  elements.push({ type: "photo", rect: heroCell, z: 1, bleedEdges: bleedEdgesOf(heroCell) });
  elements.push({
    type: "photo",
    rect: supportCell,
    z: 1,
    role: "support",
    imageId: support.id,
    crop: b.cropOf(support.id, supportCell.w / supportCell.h, support.crop),
    bleedEdges: bleedEdgesOf(supportCell),
  });

  // hinge-rule ornament — a hairline in the gutter
  if (b.ornaments.includes("hinge-rule") && rng() < 0.55) {
    const rr = vertical
      ? rect(cellA.x + cellA.w + gutter / 2 - 0.005, 0.2, 0.01, cellsBottom - 0.4)
      : rect(0.2, cellA.y + cellA.h + gutter / 2 - 0.005, PAGE_W - 0.4, 0.01);
    elements.push({
      type: "rule", variant: "hinge", orientation: vertical ? "vertical" : "horizontal",
      rect: rr, color: b.ruleColor, weight: 0.01, z: 2,
    });
  }

  // name beneath the frames — across the hinge (centered) or under the hero
  const pool = b.lockups.filter((l) => ["inline", "contrast", "stacked"].includes(l));
  const block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], lockupSpec(b, {
    maxWIn: (PAGE_W - 2 * SAFE) * lerp(0.6, 0.82, rng()),
  }));
  if (!block) return null;
  const across = vertical && rng() < 0.6;
  const nameY = cellsBottom + lerp(0.16, 0.3, rng());
  if (nameY + block.h > PAGE_H - SAFE - 0.2) return null;
  const nameX = across
    ? clamp(cellA.x + cellA.w + gutter / 2 - block.w / 2, SAFE, PAGE_W - SAFE - block.w)
    : clamp(heroCell.x + Math.max(SAFE - heroCell.x, 0.02), SAFE, PAGE_W - SAFE - block.w);
  const nameEls = block.place(nameX, nameY, {
    color: b.ink, align: across ? "center" : "left", z: 3,
  });
  elements.push(...nameEls);
  const contact = paperContact(b, nameX, nameY + block.h + 0.07, {
    align: across ? "center" : "left", blockW: block.w,
  });
  if (contact) elements.push(contact);

  decisions.push({
    k: "structure", v: "diptych",
    why: `${vertical ? "vertical" : "horizontal"} hinge, gutter ${gutter}in, support ${support.id}`,
  });
  const areaA = cellA.w * cellA.h;
  const areaB = cellB.w * cellB.h;
  return {
    structure: "diptych",
    elements,
    decisions,
    lockup: block.lockup,
    metrics: {
      hinge: vertical ? "vertical" : "horizontal",
      gutter,
      cellRatio: r3(Math.max(areaA, areaB) / Math.min(areaA, areaB)),
      sharedEdgeDelta: 0,
      supportId: support.id,
      nameAcrossHinge: across,
    },
  };
}

function pickPairableSupport(b) {
  const pool = b.supportPool.filter((s) => !Number.isFinite(s.aspect) || (s.aspect > 0.3 && s.aspect < 1.6));
  if (!pool.length) return null;
  const heroShot = String(b.ctx.heroShotType || "").toLowerCase();
  const rank = (s) => {
    const shot = String(s.rawShotType || "").toLowerCase();
    let score = 0;
    if (shot && heroShot && shot !== heroShot) score += 2; // shot-type contrast
    if (shot === "full_length") score += 2;
    else if (shot === "three_quarter") score += 1;
    if (Number.isFinite(s.aspect) && s.aspect <= 1.05) score += 1; // portrait pairs on a vertical hinge
    if (s.forensics) score += 0.5;
    return score;
  };
  return pool.slice().sort((a, s) => rank(s) - rank(a))[0];
}

/**
 * FILMSTRIP-FOOT (the-strip) — full hero over a three-frame strip at the
 * foot, the name band in the seam. Refuses with < 3 supports.
 */
function buildFilmstripFoot(rng, b) {
  if (b.supportPool.length < 3) return null;
  const frames = b.supportPool
    .slice()
    .sort((x, y) => (y.forensics ? 1 : 0) - (x.forensics ? 1 : 0))
    .slice(0, 3);

  const pool = b.lockups.filter((l) => ["inline", "contrast"].includes(l));
  const block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], lockupSpec(b, {
    maxWIn: (PAGE_W - 2 * SAFE) * lerp(0.52, 0.7, rng()),
  }));
  if (!block) return null;
  const bandH = block.h + 0.22;
  const heroH = r3(clamp(lerp(0.62, 0.72, rng()) * PAGE_H, 0.6 * PAGE_H, PAGE_H - bandH - 0.9));
  const heroRect = rect(0, 0, PAGE_W, heroH);
  const stripTop = heroH + bandH;
  const stripH = PAGE_H - stripTop;

  const elements = [
    { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
  ];
  const g = 0.08;
  const frameW = (PAGE_W - 2 * g) / 3;
  frames.forEach((f, i) => {
    const fr = rect(i * (frameW + g), stripTop, frameW, stripH);
    elements.push({
      type: "photo",
      rect: fr,
      z: 1,
      role: "strip",
      imageId: f.id,
      crop: b.cropOf(f.id, fr.w / fr.h, f.crop),
      bleedEdges: bleedEdgesOf(fr),
    });
  });

  // name band in the seam between hero and strip
  const nameY = heroH + (bandH - block.h) / 2;
  const nameX = SAFE;
  const nameEls = block.place(nameX, nameY, { color: b.ink, align: "left", z: 3 });
  elements.push(...nameEls);
  if (b.contactLine) {
    const cpt = b.dark ? 10 : 7;
    const box = contactBox(b.contactLine, cpt);
    const cx = PAGE_W - SAFE - box.w;
    if (cx > nameX + block.w + 0.25) {
      elements.push({
        type: "contact", text: b.contactLine,
        rect: rect(cx, nameY + block.h - box.h - 0.02, box.w, box.h),
        orientation: "horizontal", sizePt: cpt, color: b.muted, z: 3,
      });
    }
  }

  return {
    structure: "filmstrip-foot",
    elements,
    decisions: [{
      k: "structure", v: "filmstrip-foot",
      why: `hero ${r3(heroH / PAGE_H)} of page over a 3-frame strip (${frames.map((f) => f.id).join(", ")})`,
    }],
    lockup: block.lockup,
    metrics: {
      heroFrac: r3(heroH / PAGE_H),
      stripFrames: frames.length,
      stripHeight: r3(stripH),
      seamBand: r3(bandH),
    },
  };
}

/**
 * MATTED (edition-parameterized) — deep mats via def.matDepth, dark-field
 * aware, monograph caption register with the initial-line lockup, keyline
 * + folio ornaments. Booker floor from def.heroAreaFloor.
 */
function buildMattedEdition(rng, b) {
  const md = Number.isFinite(b.def.matDepth) ? b.def.matDepth : 1;
  const floor = Number.isFinite(b.def.heroAreaFloor)
    ? b.def.heroAreaFloor
    : (md > 1.2 ? HERO_AREA_FLOOR_DEEP_MAT : HERO_AREA_FLOOR);

  let mt = lerp(0.32, 0.6, rng()) * md;
  let mb = clamp(mt * lerp(1.5, 2.2, rng()), mt * 1.45, 2.7);
  const ar = lerp(1.25, 2.1, rng());
  const base = lerp(0.3, 0.5, rng()) * Math.min(md, 1.3);
  const wideLeft = rng() < 0.5;
  let ml = wideLeft ? base * ar : base;
  let mr = wideLeft ? base : base * ar;
  // honor the hero floor: shrink all mats proportionally when too deep
  for (let i = 0; i < 8; i++) {
    const frac = ((PAGE_W - ml - mr) * (PAGE_H - mt - mb)) / (PAGE_W * PAGE_H);
    if (frac >= floor) break;
    mt *= 0.9; mb *= 0.9; ml *= 0.9; mr *= 0.9;
  }
  const heroRect = rect(ml, mt, PAGE_W - ml - mr, PAGE_H - mt - mb);
  const photoFrac = (heroRect.w * heroRect.h) / (PAGE_W * PAGE_H);
  if (photoFrac < floor - 1e-6) return null;

  const elements = [
    { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
  ];
  const decisions = [{
    k: "structure", v: "matted",
    why: `mats t${r3(mt)} b${r3(mb)} l${r3(ml)} r${r3(mr)} (depth ×${md})`,
  }];

  // keyline — on a dark field the desaturated gold hairline (≤0.5pt)
  if (b.ornaments.includes("keyline") && rng() < 0.65) {
    elements.push({
      type: "rule", variant: "frame", rect: heroRect,
      color: b.dark ? b.accent : b.ink,
      weight: b.dark ? 0.007 : 0.01,
      z: 2,
    });
    decisions.push({ k: "accent", v: "keyline", why: b.dark ? "gold hairline on the night field" : "gallery keyline" });
  }

  // one text cluster in the bottom mat
  const alignHero = rng() < 0.5;
  const maxW = Math.min(heroRect.w, PAGE_W - 2 * SAFE);
  const block = buildLockupFromPool(rng, b.lockups, lockupSpec(b, { maxWIn: maxW * lerp(0.6, 0.85, rng()) }));
  if (!block) return null;
  const clusterH = block.h + (b.contactLine ? 0.28 : 0);
  const nameY = clamp(
    heroRect.y + heroRect.h + lerp(0.2, 0.34, rng()),
    heroRect.y + heroRect.h + 0.14,
    PAGE_H - SAFE - clusterH,
  );
  const nameX = alignHero
    ? clamp(heroRect.x, SAFE, PAGE_W - SAFE - block.w)
    : (PAGE_W - block.w) / 2;
  const nameEls = block.place(nameX, nameY, {
    color: b.ink,
    align: alignHero ? "left" : "center",
    ruleColor: b.dark ? b.accent : b.muted,
    z: 3,
  });
  elements.push(...nameEls);
  const contact = paperContact(b, nameX, nameY + block.h + 0.08, {
    align: alignHero ? "left" : "center", blockW: block.w,
  });
  if (contact) elements.push(contact);

  if (b.ornaments.includes("folio")) {
    const corner = rng() < 0.5 ? "left" : "right";
    elements.push(folioElement(b, {
      x: corner === "left" ? SAFE : PAGE_W - SAFE - 1.0,
      y: PAGE_H - SAFE, // foot-anchored, bottom edge on the trim safe line
      align: corner,
    }));
  }

  const textArea = elements
    .filter((e) => ["name", "contact", "folio"].includes(e.type))
    .reduce((s, e) => s + e.rect.w * e.rect.h, 0);
  return {
    structure: "matted",
    elements,
    decisions,
    lockup: block.lockup,
    metrics: {
      matTop: r3(mt), matBottom: r3(mb), matLeft: r3(ml), matRight: r3(mr),
      photoFrac: r3(photoFrac),
      matAsymmetry: r3(Math.max(ml, mr) / Math.max(0.01, Math.min(ml, mr))),
      whitespaceFrac: r3(1 - photoFrac - textArea / (PAGE_W * PAGE_H)),
    },
  };
}

/**
 * CUTOUT (edition) — the figure lifted onto a flat plane, type set into
 * the silhouette's measured negative space. Alpha-matte gated.
 */
function buildCutoutEdition(rng, b, helpers) {
  const ctx = b.ctx;
  const hasAlphaMatte = !!ctx.matteGrid && (ctx.matteSource || "alpha") === "alpha";
  if (!hasAlphaMatte) return null;

  // plane tone: palette-pulled when the field operator asks and it verifies
  let planeTone = null;
  const planeField = b.field === "plane" || ctx.palette?.plane === true;
  if (planeField && typeof helpers.derivePlaneTone === "function") {
    planeTone = helpers.derivePlaneTone(ctx.heroForensics) || null;
  }
  const planeFill = planeTone ? planeTone.hex : b.paper;
  const planeDark = planeTone ? true : b.dark;
  const planeInk = planeTone ? planeTone.ink : b.ink;

  const top = lerp(0, 0.45, rng());
  const bottom = lerp(0.6, 1.3, 0.4 + 0.5 * rng());
  const sideInset = lerp(0, 0.6, rng());
  const heroRect = rect(sideInset, top, PAGE_W - sideInset * 2, PAGE_H - top - bottom);
  const { matte } = effViews(ctx, heroRect);
  const sampler = matteSampler(matte);
  if (!sampler) return null;

  const elements = [
    { type: "colorPlane", rect: rect(0, 0, PAGE_W, PAGE_H), fill: planeFill, z: 0 },
    { type: "photo", rect: heroRect, z: 1, isCutout: true, bleedEdges: bleedEdgesOf(heroRect) },
  ];
  const decisions = [{
    k: "structure", v: "cutout",
    why: planeTone ? `palette-pulled plane ${planeTone.hex}` : "paper plane",
  }];

  // name into the measured negative space — lockup pool, anchor-zone axis
  const pool = b.lockups.filter((l) => ["inline", "stacked"].includes(l));
  const [lo, hi] = b.ptBounds || registerBand(b.scale, b.register);
  let block = null;
  let placedRect = null;
  let pt = hi;
  for (let attempt = 0; attempt < 4 && !placedRect; attempt++) {
    block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], lockupSpec(b, {
      maxWIn: (PAGE_W - 2 * SAFE) * lerp(0.6, 0.8, rng()),
      loPt: Math.max(14, lo),
      hiPt: Math.max(Math.max(14, lo), pt),
      dark: planeDark,
    }));
    if (!block) break;
    const ns = helpers.matteNegativeSpace(matte, heroRect, { minWIn: block.w, minHIn: block.h });
    if (ns) {
      const anchor = pick(rng, [0.12, 0.4, 0.65, 0.85]);
      const x = clamp(ns.x + (ns.w - block.w) * 0.5, SAFE, PAGE_W - SAFE - block.w);
      const y = clamp(ns.y + (ns.h - block.h) * anchor, SAFE, PAGE_H - SAFE - block.h);
      const candidate = rect(x, y, block.w, block.h);
      if (coverageOver(sampler, candidate, heroRect, 5, 4) <= 0.05) placedRect = candidate;
    }
    if (!placedRect) pt = r3(pt * 0.85);
  }
  let nameOnPlane = false;
  if (!placedRect) {
    // the silhouette leaves no honest negative space — the type moves to
    // the plane's foot strip below the figure
    block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], lockupSpec(b, {
      maxWIn: PAGE_W - 2 * SAFE,
      dark: planeDark,
    }));
    if (!block) return null;
    const y = heroRect.y + heroRect.h + 0.14;
    if (y + block.h > PAGE_H - SAFE) return null;
    placedRect = rect((PAGE_W - block.w) / 2, y, block.w, block.h);
    nameOnPlane = true;
  }
  // exact contrast on the flat plane
  if (contrastOfLinear(linearLuminance(planeInk) ?? 0, srgbLinear(gammaLuma(planeFill) ?? 0.5)) < 4.5) {
    return null;
  }
  elements.push(...block.place(placedRect.x, placedRect.y, {
    color: planeInk, align: "center", z: nameOnPlane ? 3 : 4,
    onPhoto: !nameOnPlane,
  }));
  const contact = paperContact(
    { ...b, dark: planeDark, muted: planeTone ? planeTone.mutedInk : b.muted },
    placedRect.x,
    Math.max(placedRect.y + block.h + 0.08, heroRect.y + heroRect.h + 0.1),
    { align: "center", blockW: block.w },
  );
  if (contact) elements.push(contact);

  // matte bbox inset from the plane edges (ignoring intentional bleeds)
  let inset = null;
  if (Array.isArray(matte) && matte.length) {
    const rows = matte.length;
    const cols = matte[0].length;
    let r0 = rows, r1 = -1, c0 = cols, c1 = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (matte[r][c] > 0.15) {
          r0 = Math.min(r0, r); r1 = Math.max(r1, r);
          c0 = Math.min(c0, c); c1 = Math.max(c1, c);
        }
      }
    }
    if (r1 >= 0) {
      const bx0 = heroRect.x + (c0 / cols) * heroRect.w;
      const bx1 = heroRect.x + ((c1 + 1) / cols) * heroRect.w;
      const by0 = heroRect.y + (r0 / rows) * heroRect.h;
      const edges = [bx0, PAGE_W - bx1, by0].filter((v) => v > 0.005);
      inset = edges.length ? r3(Math.min(...edges)) : 0;
    }
  }

  return {
    structure: "cutout",
    elements,
    decisions,
    lockup: block.lockup,
    metrics: {
      planeTone: planeTone ? planeTone.hex : null,
      matteInsetIn: inset,
      nameSubjectOverlap: r3(coverageOver(sampler, placedRect, heroRect, 5, 4)),
    },
  };
}

// ── photo-dominant (edition) + the compact choreography ─────────────────────

/**
 * Verified fill pick over the visible cells under `r` — the edition-path
 * analogue of the legacy pickFill, floored at 3.0:1 (never relaxed).
 */
function pickVerifiedFill(grid, r, frame, candidates, { alsoPaper = null } = {}) {
  const cells = cellsUnderRect(grid, r, frame);
  if (!cells.length) return null;
  const paperLum = alsoPaper ? linearLuminance(alsoPaper) : null;
  return (
    candidates.find((f) => {
      if (worstCellRatio(cells, f.hex) < 3.0) return false;
      if (paperLum != null) {
        const l = linearLuminance(f.hex);
        if (l == null || contrastOfLinear(l, paperLum) < 2.2) return false;
      }
      return true;
    }) || null
  );
}

/**
 * Compact name choreography for treatmentsOpen editions: straddle / over /
 * band / inset re-built on the shared verified primitives (fill floor 3.0,
 * per-cell veils, reversed-type minimums). Returns { elements, heroRect,
 * variant, decisions } or null (→ the classic lockup path).
 */
function tryChoreography(rng, b) {
  const ctx = b.ctx;
  const parts = String(b.nameText).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !ctx.heroForensics) return null;
  const firstText = parts[0];
  const lastText = parts.slice(1).join(" ");
  const m = b.metrics;
  const fAdv = m?.first?.advanceEm || m?.advanceEm || 0.6;
  const heavy = m?.first?.weight || 700;
  const lastBody = m?.lastBody || m?.last || { advanceEm: m?.advanceEm || 0.6, weight: 500 };
  const fTrack = 0.02;
  const lTrack = clamp(0.2 + 0.18 * b.intent.formality, 0.16, 0.4);
  const menu = ["straddle", "over", "band", "inset"];
  const variant = pick(rng, menu);

  const fullPage = rect(0, 0, PAGE_W, PAGE_H);
  const heroFor = (heroRect) => {
    const { forensics } = effViews(ctx, heroRect);
    const grid = forensics?.luma?.grid;
    const face = facePageRect(forensics, heroRect);
    return { forensics, grid, face };
  };
  const clearsFace = (r, face, heroRect) =>
    !!face && r.y > face.y + face.h + 0.02 && r.y > heroRect.y + 0.15;

  if (variant === "over") {
    const heroRect = fullPage;
    const { grid, face } = heroFor(heroRect);
    if (!grid || !face) return null;
    const fPt = clamp((heroRect.w * lerp(0.66, 0.82, rng()) * 72) / (firstText.length * (fAdv + fTrack)), 30, 84);
    const fW = firstText.length * (fAdv + fTrack) * (fPt / 72);
    const fH = (fPt / 72) * 1.02;
    const lPt = clamp(fPt * 0.24, 10, 16);
    const lH = (lPt / 72) * 1.1;
    const lW = lastText.length * (lastBody.advanceEm + lTrack) * (lPt / 72);
    const blockH = fH + 0.06 + lH;
    const fRect = rect((PAGE_W - fW) / 2, PAGE_H - 0.42 - blockH, fW, fH);
    const lRect = rect((PAGE_W - lW) / 2, fRect.y + fH + 0.06, lW, lH);
    const blockRect = rect(Math.min(fRect.x, lRect.x), fRect.y, Math.max(fW, lW), blockH);
    if (fW > heroRect.w - 0.2 || lW > heroRect.w - 0.3) return null;
    if (!clearsFace(blockRect, face, heroRect)) return null;
    const fill = pickVerifiedFill(grid, blockRect, heroRect, [
      { hex: "#FFFFFF" }, { hex: b.ink }, { hex: b.accent },
    ]);
    if (!fill) return null;
    const els = [
      { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
      {
        type: "name", role: "split-first", variant: "over", text: firstText, rect: fRect,
        orientation: "horizontal", stacked: false, sizePt: r3(fPt), trackingEm: fTrack,
        lockup: "contrast", onPhoto: true, color: fill.hex, weight: heavy,
        align: "center", transform: "uppercase", scrim: null, z: 4,
      },
      {
        type: "name", role: "split-last", variant: "over", text: lastText, rect: lRect,
        orientation: "horizontal", stacked: false, sizePt: r3(lPt), trackingEm: r3(lTrack),
        lockup: "contrast", onPhoto: true, color: fill.hex, weight: lastBody.weight, font: "body",
        align: "center", transform: "uppercase", scrim: null, z: 4,
      },
    ];
    return { variant, heroRect, elements: els, grid, decisions: [{ k: "name", v: `over ${r3(fPt)}pt`, why: "hierarchical lockup on the photograph (worst-cell ≥3.0)" }] };
  }

  if (variant === "band") {
    const heroRect = fullPage;
    const { grid, face } = heroFor(heroRect);
    if (!grid || !face) return null;
    const chars = Math.max(1, String(b.nameText).replace(/\s+/g, " ").trim().length);
    const nPt = clamp((PAGE_W * 0.76 * 72) / (chars * ((m?.advanceEm || 0.6) + 0.14)), 16, 30);
    const nH = (nPt / 72) * 1.1;
    const bH = nH + 0.24;
    const bRect = rect(0, PAGE_H - lerp(0.5, 0.95, rng()) - bH, PAGE_W, bH);
    const nW = chars * ((m?.advanceEm || 0.6) + 0.14) * (nPt / 72);
    if (nW > PAGE_W - 0.3 || !clearsFace(bRect, face, heroRect)) return null;
    const cells = cellsUnderRect(grid, bRect, heroRect);
    if (!cells.length) return null;
    const mean = cells.reduce((s, v) => s + v, 0) / cells.length;
    const frost = mean < 0.55;
    const bandInk = frost ? b.ink : "#FFFFFF";
    if (!frost && !reversedTypeOk({ family: b.displayFamily, weight: b.weight, sizePt: nPt })) return null;
    const alpha = solveVeilAlpha({
      cells,
      veilGamma: gammaLuma(frost ? "#FAF9F6" : "#0C0B0A"),
      inkHex: frost ? b.ink : "#FFFFFF",
      startAlpha: frost ? 0.82 : 0.55,
    });
    if (alpha == null) return null;
    const bandFill = frost ? `rgba(250,249,246,${alpha})` : `rgba(12,11,10,${alpha})`;
    const nRect = rect((PAGE_W - nW) / 2, bRect.y + (bH - nH) / 2, nW, nH);
    const els = [
      { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
      { type: "band", rect: bRect, fill: bandFill, z: 3.4 },
      {
        type: "name", role: "split-first", variant: "band", text: b.nameText, rect: nRect,
        orientation: "horizontal", stacked: false, sizePt: r3(nPt), trackingEm: 0.14,
        lockup: "inline", onPhoto: true, color: bandInk, weight: b.weight,
        align: "center", transform: "uppercase", scrim: null, z: 4,
      },
    ];
    return { variant, heroRect, elements: els, grid, decisions: [{ k: "name", v: `band ${r3(nPt)}pt @${alpha}`, why: `${frost ? "frosted" : "veiled"} band, per-cell veil solved` }] };
  }

  if (variant === "straddle") {
    const bottom = lerp(1.1, 1.35, rng());
    const heroRect = rect(0, 0, PAGE_W, PAGE_H - bottom);
    const { grid, face } = heroFor(heroRect);
    if (!grid || !face) return null;
    const heroBottom = heroRect.y + heroRect.h;
    const margin = lerp(0.1, 0.3, rng());
    const fPt = clamp(((PAGE_W - 2 * margin) * 72) / (firstText.length * (fAdv + fTrack)), 34, 120);
    const fW = firstText.length * (fAdv + fTrack) * (fPt / 72);
    const fH = (fPt / 72) * 1.02;
    const fRect = rect((PAGE_W - fW) / 2, heroBottom - fH * 0.55, fW, fH);
    if (fW > PAGE_W - 0.12 || !clearsFace(fRect, face, heroRect) || bottom < fH * 0.45 + 0.55) return null;
    const fill = pickVerifiedFill(grid, rect(fRect.x, fRect.y, fRect.w, Math.max(0.01, heroBottom - fRect.y)), heroRect, [
      { hex: "#FFFFFF", opacity: 0.92 }, { hex: b.ink, opacity: 0.88 }, { hex: b.accent, opacity: 1 },
    ], { alsoPaper: b.paper });
    if (!fill) return null;
    const lPt = clamp((heroRect.w * 0.5 * 72) / (Math.max(1, lastText.length) * (lastBody.advanceEm + lTrack)), 13, Math.min(fPt * 0.4, 24));
    if (b.dark && !reversedTypeOk({ family: b.bodyFamily, weight: lastBody.weight, sizePt: lPt })) return null;
    const lH = (lPt / 72) * 1.05;
    const lY = fRect.y + fH + 0.08;
    if (lY + lH > PAGE_H - 0.3) return null;
    const lW = lastText.length * (lastBody.advanceEm + lTrack) * (lPt / 72);
    const lRect = rect((PAGE_W - lW) / 2, lY, lW, lH);
    const els = [
      { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
      {
        type: "name", role: "split-first", variant: "straddle", text: firstText, rect: fRect,
        orientation: "horizontal", stacked: false, sizePt: r3(fPt), trackingEm: fTrack,
        lockup: "contrast", onPhoto: true, color: fill.hex, opacity: fill.opacity, weight: heavy,
        align: "center", transform: "uppercase", scrim: null, z: 4,
      },
      {
        type: "name", role: "split-last", variant: "straddle", text: lastText, rect: lRect,
        orientation: "horizontal", stacked: false, sizePt: r3(lPt), trackingEm: r3(lTrack),
        lockup: "contrast", onPhoto: false, color: b.ink, weight: lastBody.weight, font: "body",
        align: "center", transform: "uppercase", scrim: null, z: 3,
      },
    ];
    return { variant, heroRect, elements: els, grid, decisions: [{ k: "name", v: `straddle ${r3(fPt)}pt`, why: "display type crosses the photo seam (worst-cell ≥3.0)" }] };
  }

  // inset — accent panel seam-tight under the photo
  {
    const lPt0 = 14;
    const pH = clamp((lPt0 / 72) * 1.05 + 0.22, 0.38, 0.8);
    const heroRect = rect(0, 0, PAGE_W, PAGE_H - pH - 0.34);
    const { grid, face } = heroFor(heroRect);
    if (!grid || !face) return null;
    const heroBottom = heroRect.y + heroRect.h;
    const fSpan = lerp(0.6, 0.8, rng());
    const fPt = clamp((heroRect.w * fSpan * 72) / (firstText.length * (fAdv + fTrack)), 30, 96);
    const fW = firstText.length * (fAdv + fTrack) * (fPt / 72);
    if (fW > heroRect.w - 0.16) return null;
    const fH = (fPt / 72) * 1.02;
    const fRect = rect((PAGE_W - fW) / 2, heroBottom - 0.1 - fH, fW, fH);
    if (!clearsFace(fRect, face, heroRect)) return null;
    const fill = pickVerifiedFill(grid, fRect, heroRect, [
      { hex: b.accent }, { hex: "#FFFFFF" }, { hex: b.ink },
    ]);
    if (!fill) return null;
    const lPt = clamp((PAGE_W * 0.7 * 72) / (Math.max(1, lastText.length) * (lastBody.advanceEm + lTrack)), 13, Math.min(fPt * 0.5, 30));
    const lH = (lPt / 72) * 1.05;
    const panelRect = rect(0, heroBottom, PAGE_W, pH);
    const inkOnAccent = contrastOfLinear(linearLuminance(b.ink) ?? 0, linearLuminance(b.accent) ?? 0.5);
    const whiteOnAccent = contrastOfLinear(1, linearLuminance(b.accent) ?? 0.5);
    const panelInk = inkOnAccent >= whiteOnAccent ? b.ink : "#FFFFFF";
    if (Math.max(inkOnAccent, whiteOnAccent) < 4.5) return null;
    if (!reversedTypeOk({ family: b.bodyFamily, weight: lastBody.weight, sizePt: lPt }) && panelInk === "#FFFFFF") return null;
    const lW = lastText.length * (lastBody.advanceEm + lTrack) * (lPt / 72);
    const lRect = rect((PAGE_W - lW) / 2, heroBottom + (pH - lH) / 2, lW, lH);
    const els = [
      { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
      { type: "band", rect: panelRect, fill: b.accent, z: 2.2 },
      {
        type: "name", role: "split-first", variant: "inset", text: firstText, rect: fRect,
        orientation: "horizontal", stacked: false, sizePt: r3(fPt), trackingEm: fTrack,
        lockup: "contrast", onPhoto: true, color: fill.hex, weight: heavy,
        align: "center", transform: "uppercase", scrim: null, z: 4,
      },
      {
        type: "name", role: "split-last", variant: "inset", text: lastText, rect: lRect,
        orientation: "horizontal", stacked: false, sizePt: r3(lPt), trackingEm: r3(lTrack),
        lockup: "contrast", onPhoto: false, color: panelInk, weight: lastBody.weight, font: "body",
        align: "center", transform: "uppercase", scrim: null, z: 3,
      },
    ];
    return { variant, heroRect, elements: els, grid, decisions: [{ k: "name", v: `inset ${r3(fPt)}pt`, why: "display over the photo, surname on the accent panel (worst-cell ≥3.0)" }] };
  }
}

/**
 * PHOTO-DOMINANT (edition) — hero over a name band sized to the lockup;
 * the universal fallback for every refused structure. treatmentsOpen
 * editions may sample the verified choreography instead.
 */
function buildPhotoDominantEdition(rng, b) {
  const decisions = [];
  // choreography gate (treatmentsOpen editions only)
  const gate = rng() < 0.24 + 0.42 * b.intent.energy;
  if (b.def.treatmentsOpen && gate) {
    const chor = tryChoreography(rng, b);
    if (chor) {
      const elements = chor.elements;
      // contact rides the photo bottom (verified) for full-bleed variants,
      // else joins the paper region beneath
      const heroBottom = chor.heroRect.y + chor.heroRect.h;
      if (b.contactLine) {
        if (heroBottom >= PAGE_H - 1e-6) {
          const box = contactBox(b.contactLine, 7);
          const cRect = rect(SAFE, PAGE_H - 0.36, box.w, box.h);
          const mean = (() => {
            const cells = cellsUnderRect(chor.grid, cRect, chor.heroRect);
            return cells.length ? cells.reduce((s, v) => s + v, 0) / cells.length : 0.5;
          })();
          const ink = verifiedPhotoInk(chor.grid, cRect, chor.heroRect, mean < 0.5);
          if (ink) {
            elements.push({
              type: "contact", text: b.contactLine, rect: cRect,
              orientation: "horizontal", sizePt: 7, color: ink, onPhoto: true, z: 4,
            });
          } else {
            decisions.push({ k: "contact", v: "dropped", why: "foot cells unverifiable ≥4.5:1" });
          }
        } else {
          const lastText = elements.filter((e) => e.type === "name" && !e.onPhoto).pop();
          const anchor = lastText || elements.filter((e) => e.type === "name").pop();
          const contact = paperContact(b, anchor.rect.x, anchor.rect.y + anchor.rect.h + 0.08, {
            align: "center", blockW: anchor.rect.w,
          });
          if (contact) elements.push(contact);
        }
      }
      return {
        structure: "photo-dominant",
        elements,
        decisions: [...chor.decisions, ...decisions],
        lockup: "contrast",
        treatment: chor.variant,
        metrics: { heroFrac: r3((chor.heroRect.w * chor.heroRect.h) / (PAGE_W * PAGE_H)), treatment: chor.variant },
      };
    }
  }

  // classic register: bottom band sized to the lockup
  const pool = b.lockups.filter((l) => ["inline", "stacked", "contrast"].includes(l));
  const block = buildLockupFromPool(rng, pool.length ? pool : ["inline"], lockupSpec(b, {
    maxWIn: (PAGE_W - 2 * SAFE) * lerp(0.74, 0.9, rng()),
  }));
  if (!block) return null;
  const pad = lerp(0.3, 0.42, rng());
  // the band SIZES TO the lockup — clamping it below the block height
  // would push the name past the trim (display-scale editions falling
  // back land here with big lockups; the hero floor still holds easily)
  const bottom = Math.max(0.72, block.h + (b.contactLine ? 0.24 : 0) + pad);
  const heroRect = rect(0, 0, PAGE_W, PAGE_H - bottom);
  const alignLeft = rng() < 0.55;
  const nameX = alignLeft ? SAFE : (PAGE_W - block.w) / 2;
  const nameY = heroRect.h + 0.5 * (pad - 0.14);
  const elements = [
    { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
    ...block.place(nameX, nameY, { color: b.ink, align: alignLeft ? "left" : "center", z: 3 }),
  ];
  const contact = paperContact(b, nameX, nameY + block.h + 0.07, {
    align: alignLeft ? "left" : "center", blockW: block.w,
  });
  if (contact) elements.push(contact);
  decisions.push({
    k: "structure", v: "photo-dominant",
    why: `hero over a ${r3(bottom)}in name band (${block.lockup} lockup)`,
  });
  return {
    structure: "photo-dominant",
    elements,
    decisions,
    lockup: block.lockup,
    metrics: {
      heroFrac: r3((heroRect.w * heroRect.h) / (PAGE_W * PAGE_H)),
      bandFrac: r3(bottom / PAGE_H),
    },
  };
}

// ── entry ───────────────────────────────────────────────────────────────────

const BUILDERS = {
  masthead: (rng, b, h) => buildMasthead(rng, b, h),
  "column-grid": (rng, b, h) => buildColumnGrid(rng, b, h),
  "cover-story": (rng, b, h) => buildCoverStory(rng, b, h),
  diptych: (rng, b, h) => buildDiptych(rng, b, h),
  "filmstrip-foot": (rng, b, h) => buildFilmstripFoot(rng, b, h),
  matted: (rng, b, h) => buildMattedEdition(rng, b, h),
  cutout: (rng, b, h) => buildCutoutEdition(rng, b, h),
  "photo-dominant": (rng, b, h) => buildPhotoDominantEdition(rng, b, h),
  // no edition programs split today — the photo-dominant register carries it
  split: (rng, b, h) => buildPhotoDominantEdition(rng, b, h),
};

function feasibleStructures(b) {
  const ctx = b.ctx;
  const hasAlphaMatte = !!ctx.matteGrid && (ctx.matteSource || "alpha") === "alpha";
  const can = {
    masthead: true,
    "column-grid": true,
    "photo-dominant": true,
    matted: true,
    split: true,
    "cover-story": hasAlphaMatte && !!ctx.heroForensics?.focal,
    cutout: hasAlphaMatte,
    diptych: !!pickPairableSupport(b),
    "filmstrip-foot": b.supportPool.length >= 3,
  };
  const weights = b.def.structures && typeof b.def.structures === "object"
    ? b.def.structures
    : { "photo-dominant": 1 };
  const out = [];
  for (const [s, w] of Object.entries(weights)) {
    if (Number(w) > 0 && can[s] && BUILDERS[s]) out.push([s, Number(w)]);
  }
  return out;
}

/**
 * Sample one EDITION front program. Deterministic per (seed, ctx). Always
 * returns a program: refused structures fall back to photo-dominant, which
 * cannot refuse (its lockup pool always holds inline on paper).
 *
 * @param {string} seed
 * @param {object} ctx — the front-program ctx (must carry ctx.edition)
 * @param {object} helpers — { makeRng, matteNegativeSpace, derivePlaneTone }
 */
function sampleEditionProgram(seed, ctx, helpers) {
  const rng = helpers.makeRng(seed, "front-program:edition");
  const b = prepare(ctx, rng);
  const feasible = feasibleStructures(b);
  let structure = "photo-dominant";
  if (feasible.length) {
    const total = feasible.reduce((s, [, w]) => s + w, 0);
    let roll = rng() * total;
    for (const [s, w] of feasible) {
      roll -= w;
      if (roll <= 0) {
        structure = s;
        break;
      }
    }
  }

  let built = BUILDERS[structure](rng, b, helpers);
  let fellBack = false;
  if (!built && structure !== "photo-dominant") {
    fellBack = true;
    built = buildPhotoDominantEdition(rng, b, helpers);
  }
  if (!built) {
    // last-resort paper program: hero + guaranteed inline name (Booker net)
    const heroRect = rect(0, 0, PAGE_W, PAGE_H - 1.0);
    const pt = Math.max(18, b.dark ? reversedMinPt({ family: b.displayFamily, weight: b.weight }) : 18);
    built = {
      structure: "photo-dominant",
      lockup: "inline",
      decisions: [{ k: "structure", v: "photo-dominant", why: "guaranteed fallback band" }],
      metrics: { heroFrac: r3((heroRect.w * heroRect.h) / (PAGE_W * PAGE_H)) },
      elements: [
        { type: "photo", rect: heroRect, z: 1, bleedEdges: bleedEdgesOf(heroRect) },
        {
          type: "name", text: b.nameText, rect: rect(SAFE, PAGE_H - 0.82, PAGE_W - 2 * SAFE, 0.42),
          orientation: "horizontal", stacked: false, sizePt: pt, trackingEm: b.trackingEm,
          lockup: "inline", onPhoto: false, color: b.ink, align: "left",
          transform: "uppercase", scrim: null, z: 3,
        },
      ],
    };
  }

  const decisions = [
    {
      k: "edition",
      v: b.def.id || "unknown",
      why: `field ${b.field}, register ${b.register}${fellBack ? `, '${structure}' refused → photo-dominant` : ""}`,
    },
    ...built.decisions,
  ];
  return {
    structure: built.structure,
    elements: built.elements,
    decisions,
    edition: b.def.id || null,
    lockup: built.lockup || null,
    field: b.field,
    register: b.register,
    treatment: built.treatment || null,
    editionMetrics: built.metrics || {},
  };
}

module.exports = {
  sampleEditionProgram,
  registerBand,
  buildMasthead,
  buildColumnGrid,
  buildCoverStory,
  buildDiptych,
  buildFilmstripFoot,
  buildMattedEdition,
  buildCutoutEdition,
  buildPhotoDominantEdition,
  tryChoreography,
  pickPairableSupport,
  feasibleStructures,
  prepare,
  PAGE_W,
  PAGE_H,
  SAFE,
};
