/**
 * Generative layout solver (atelier engine v2).
 *
 * Replaces named grid templates with seeded constrained recursive
 * partitioning, so back-page composition geometry emerges from the talent's
 * actual image set (count, aspects, roles) and front geometry from the hero
 * image's measured structure. No two seeds share a recognizable skeleton;
 * the same seed + inputs always reproduces the identical layout.
 *
 * Contract: tasks/comp-card-atelier-spec.md §B. All geometry is in inches
 * with a top-left origin.
 *
 * Back partition algorithm:
 *   1. Chrome carving: name strip at the top of the region, contact/wordmark
 *      strip at the bottom — both pacing-scaled.
 *   2. Stats carving: the stats block is a real partition member — a left or
 *      right column (1.15–1.55in) or a bottom band (0.9–1.3in), seeded and
 *      tone-biased ('auto'), taken out of the content area before photos.
 *   3. Recursive split of the photo area: ratios from
 *      {0.5, 0.382, 0.618, 0.4, 0.6} ±0.03 jitter; orientation biased by the
 *      shape of the rect and the aspect mix of remaining images; gutters
 *      pacing-scaled 0.06–0.16in; min cell short edge 1.05in (cell count is
 *      clamped to what the rect can hold).
 *   4. Assignment: true full-length image → tallest cell, then per-cell
 *      best-fit minimizing aspect mismatch + crop unsafety (injected
 *      crop-engine resolveCrop); 'unsafe' assignments are avoided while any
 *      alternative exists.
 *   5. Bleeds: 0–2 photo cells whose photo-area edge coincides with the
 *      region's left/right boundary may extend across the page margin to the
 *      page edge (seeded, density-biased). Top/bottom never bleed — the name
 *      and contact strips own those boundaries.
 *
 * PRNG helpers (seedToUint32 / createMulberry32) are copied from
 * comp-card-selector.js / crop-engine.js for bit-compatible determinism.
 */

const MIN_CELL_SHORT_EDGE = 1.05;
const SPLIT_RATIOS = [0.5, 0.382, 0.618, 0.4, 0.6];
const RATIO_JITTER = 0.03;
const PAGE_W = 5.5;
const PAGE_H = 8.5;
const SAFE = 0.25;

// ── PRNG (copied from comp-card-selector.js, attribution in header) ────────

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

function createMulberry32(a) {
  let state = a >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

function roundRect(rect) {
  return { ...rect, x: r3(rect.x), y: r3(rect.y), w: r3(rect.w), h: r3(rect.h) };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function toneAxis(tone, key, fallback = 0.5) {
  const v = tone && Number(tone[key]);
  return Number.isFinite(v) ? clamp(v, 0, 1) : fallback;
}

/** CSS absolute-position style object for an inch-space rect. */
function toCssRect(rect) {
  return {
    left: `${r3(rect.x)}in`,
    top: `${r3(rect.y)}in`,
    width: `${r3(rect.w)}in`,
    height: `${r3(rect.h)}in`,
  };
}

function rectsOverlap(a, b, eps = 1e-6) {
  return (
    a.x + a.w > b.x + eps &&
    b.x + b.w > a.x + eps &&
    a.y + a.h > b.y + eps &&
    b.y + b.h > a.y + eps
  );
}

function isTrueFullLength(img) {
  const shot = String(img?.rawShotType || "").toLowerCase();
  return shot === "full_length" || shot === "full_body";
}

function naiveCrop(slotAspect) {
  return {
    fit: "cover",
    objectPosition: "50% 50%",
    safety: { level: "caution", notes: ["crop-engine unavailable; center crop"] },
    coverageLoss: 0,
  };
}

function resolveCropEngine(injected) {
  if (injected !== undefined) {
    return injected && typeof injected === "object" ? injected : null;
  }
  try {
    // eslint-disable-next-line global-require
    return require("./crop-engine");
  } catch {
    return null;
  }
}

// ── front geometry ──────────────────────────────────────────────────────────

/**
 * @param {object} input — see spec §B (pageW/pageH, heroAspect,
 *   heroForensics, pacing 0.8..1.6, tone vector, seed, salt)
 * @returns {object} FrontGeometry
 */
function solveFrontGeometry(input = {}) {
  const {
    pageW = PAGE_W,
    pageH = PAGE_H,
    heroAspect = null,
    heroForensics = null,
    pacing = 1,
    tone = {},
    seed,
    salt = "front",
    treatmentPreference = null, // 'full-bleed'|'floated'|'floated-asymmetric'
  } = input;

  const rng = createMulberry32(seedToUint32(`${seed ?? "auto"}:${salt}`));
  const decisions = [];
  const decide = (aspect, choice, because) => decisions.push({ aspect, choice, because });
  const density = toneAxis(tone, "density");
  const formality = toneAxis(tone, "formality");

  // Full bleed vs floated hero: an explicit treatment preference (art
  // director brief) wins; otherwise a density-biased seeded draw. Floated
  // heroes get a continuous coverage value that scales their margins.
  const asymmetricPreferred = treatmentPreference === "floated-asymmetric";
  let fullBleed;
  if (treatmentPreference === "full-bleed") {
    fullBleed = true;
  } else if (treatmentPreference === "floated" || asymmetricPreferred) {
    fullBleed = false;
  } else {
    fullBleed = rng() < 0.3 + 0.45 * density;
  }
  const coverage = fullBleed ? 1 : clamp(0.78 + 0.18 * rng(), 0.78, 0.96);
  decide(
    "front-coverage",
    r3(coverage),
    treatmentPreference
      ? `treatment '${treatmentPreference}' requested by brief`
      : fullBleed
        ? "full bleed (density-biased draw)"
        : "floated hero with paper margins",
  );

  const quiet = heroForensics?.quiet || null;
  const lumaGrid = heroForensics?.luma?.grid || null;

  // Name edge: best of hero top/bottom quiet bands when usable; bottom default.
  const topScore = quiet?.top?.score ?? 0;
  const bottomScore = quiet?.bottom?.score ?? 0;
  let nameEdge;
  let nameOnImage;
  if (fullBleed) {
    nameOnImage = true;
    nameEdge = topScore > bottomScore && topScore >= 0.55 ? "top" : "bottom";
    decide(
      "name-band",
      `${nameEdge} (on image)`,
      `quiet top ${r3(topScore)} vs bottom ${r3(bottomScore)} — full bleed forces on-image`,
    );
  } else if (Math.max(topScore, bottomScore) >= 0.55 && rng() < 0.5) {
    nameOnImage = true;
    nameEdge = topScore >= bottomScore ? "top" : "bottom";
    decide("name-band", `${nameEdge} (on image)`, `hero band is quiet (${r3(Math.max(topScore, bottomScore))})`);
  } else {
    nameOnImage = false;
    nameEdge = rng() < 0.42 + 0.3 * formality ? "top" : "bottom";
    decide("name-band", `${nameEdge} (on paper)`, "no sufficiently quiet hero band selected");
  }

  // Margins: pacing-scaled base with seeded horizontal imbalance ≤ 1.6×
  // (the asymmetric treatment floors the imbalance so it always shows).
  const baseMargin = lerp(0.32, 0.6, (clamp(pacing, 0.8, 1.6) - 0.8) / 0.8);
  const imbalance = asymmetricPreferred ? 1.35 + rng() * 0.25 : 1 + rng() * 0.6;
  const leftHeavy = rng() < 0.5;
  const margins = fullBleed
    ? { top: 0, right: 0, bottom: 0, left: 0 }
    : {
        top: nameOnImage || nameEdge !== "top" ? baseMargin * 0.7 : baseMargin + 0.55,
        bottom: nameOnImage || nameEdge !== "bottom" ? baseMargin * 0.9 + 0.3 : baseMargin + 0.62,
        left: r3(leftHeavy ? baseMargin * imbalance : baseMargin),
        right: r3(leftHeavy ? baseMargin : baseMargin * imbalance),
      };

  let hero;
  if (fullBleed) {
    hero = { x: 0, y: 0, w: pageW, h: pageH, bleedEdges: ["top", "right", "bottom", "left"] };
  } else {
    const w = pageW - margins.left - margins.right;
    let h = pageH - margins.top - margins.bottom;
    if (Number.isFinite(heroAspect) && heroAspect > 0) {
      // Respect the hero's own aspect when it is taller than the box.
      const aspectH = w / heroAspect;
      if (aspectH < h) h = aspectH;
    }
    hero = { x: margins.left, y: margins.top, w, h, bleedEdges: [] };
  }

  // Name band geometry. An on-image band must sit INSIDE the hero rect —
  // on floated heroes a page-wide band would straddle photo and paper.
  const bandH = lerp(0.55, 0.85, rng());
  let nameBand;
  if (nameOnImage && fullBleed) {
    const y = nameEdge === "top" ? SAFE + 0.12 : pageH - SAFE - bandH - 0.28;
    nameBand = { x: SAFE, y, w: pageW - 2 * SAFE, h: bandH };
  } else if (nameOnImage) {
    const heroTop = margins.top;
    const heroBottom = pageH - margins.bottom;
    const y = nameEdge === "top" ? heroTop + 0.16 : heroBottom - bandH - 0.2;
    nameBand = {
      x: margins.left + 0.18,
      y,
      w: pageW - margins.left - margins.right - 0.36,
      h: bandH,
    };
  } else {
    const y =
      nameEdge === "top"
        ? lerp(SAFE, Math.max(SAFE, margins.top - bandH - 0.05), rng())
        : hero.y + hero.h + lerp(0.1, 0.3, rng());
    nameBand = { x: margins.left || SAFE, y, w: pageW - 2 * (margins.left || SAFE), h: bandH };
  }

  // Ink on the band from the hero luma rows under it (on-image only).
  let inkOn = "dark";
  if (nameOnImage && lumaGrid) {
    const rows = nameEdge === "top" ? lumaGrid.slice(0, 2) : lumaGrid.slice(-2);
    const mean = rows.flat().reduce((a, b) => a + b, 0) / (rows.flat().length || 1);
    inkOn = mean < 0.5 ? "light" : "dark";
  }

  const contactBand = {
    x: SAFE,
    y: pageH - SAFE - 0.2,
    w: pageW - 2 * SAFE - 1.1,
    h: 0.2,
  };
  const statLine = {
    x: SAFE,
    y: pageH - SAFE - 0.46,
    w: pageW - 2 * SAFE,
    h: 0.16,
  };
  const wordmark = {
    x: pageW - SAFE - 0.9,
    y: pageH - SAFE - 0.18,
    w: 0.9,
    h: 0.18,
  };

  return {
    hero: roundRect(hero),
    nameBand: { ...roundRect(nameBand), onImage: nameOnImage, inkOn },
    contactBand: roundRect(contactBand),
    statLine: roundRect(statLine),
    wordmark: roundRect(wordmark),
    margins: {
      top: r3(margins.top),
      right: r3(margins.right),
      bottom: r3(margins.bottom),
      left: r3(margins.left),
    },
    decisions,
  };
}

// ── back partition ──────────────────────────────────────────────────────────

function maxCellsFor(rect, gutter) {
  // 1e-9: rects produced by carving are often EXACTLY MIN wide; float error
  // must not floor a legitimate 1.05in column down to zero capacity.
  const cols = Math.floor((rect.w + gutter) / (MIN_CELL_SHORT_EDGE + gutter) + 1e-9);
  const rows = Math.floor((rect.h + gutter) / (MIN_CELL_SHORT_EDGE + gutter) + 1e-9);
  return Math.max(0, cols * rows);
}

/**
 * Recursively split `rect` into `count` leaves. Ratio + orientation are
 * seeded; min short edge is enforced by re-draws then deterministic
 * fallbacks; impossible splits reduce to fewer leaves (caller clamps count
 * with maxCellsFor first, so this is a safety net).
 */
function partition(rect, count, rng, gutter, leaves) {
  if (count <= 1 || maxCellsFor(rect, gutter) <= 1) {
    leaves.push({ ...rect });
    return;
  }
  const countA = Math.max(1, Math.round(count * (0.35 + rng() * 0.3)));
  const countB = Math.max(1, count - countA);

  // Orientation bias: wide rects split vertically (side by side), tall
  // rects horizontally; the seed perturbs the boundary.
  const wideBias = rect.w / rect.h;
  const vertical = rng() < clamp(0.5 + (wideBias - 0.78) * 1.1, 0.08, 0.92);

  for (let attempt = 0; attempt < 4; attempt++) {
    const base = SPLIT_RATIOS[Math.floor(rng() * SPLIT_RATIOS.length) % SPLIT_RATIOS.length];
    const ratio = clamp(base + (rng() * 2 - 1) * RATIO_JITTER, 0.3, 0.7);
    const useVertical = attempt < 2 ? vertical : !vertical;

    if (useVertical) {
      const wA = (rect.w - gutter) * ratio;
      const wB = rect.w - gutter - wA;
      if (wA < MIN_CELL_SHORT_EDGE || wB < MIN_CELL_SHORT_EDGE) continue;
      const a = { x: rect.x, y: rect.y, w: wA, h: rect.h };
      const b = { x: rect.x + wA + gutter, y: rect.y, w: wB, h: rect.h };
      if (maxCellsFor(a, gutter) < 1 || maxCellsFor(b, gutter) < 1) continue;
      const aCount = Math.min(countA, maxCellsFor(a, gutter));
      const bCount = Math.min(count - aCount, maxCellsFor(b, gutter));
      partition(a, aCount, rng, gutter, leaves);
      partition(b, bCount, rng, gutter, leaves);
      return;
    }
    const hA = (rect.h - gutter) * ratio;
    const hB = rect.h - gutter - hA;
    if (hA < MIN_CELL_SHORT_EDGE || hB < MIN_CELL_SHORT_EDGE) continue;
    const a = { x: rect.x, y: rect.y, w: rect.w, h: hA };
    const b = { x: rect.x, y: rect.y + hA + gutter, w: rect.w, h: hB };
    if (maxCellsFor(a, gutter) < 1 || maxCellsFor(b, gutter) < 1) continue;
    const aCount = Math.min(countA, maxCellsFor(a, gutter));
    const bCount = Math.min(count - aCount, maxCellsFor(b, gutter));
    partition(a, aCount, rng, gutter, leaves);
    partition(b, bCount, rng, gutter, leaves);
    return;
  }
  leaves.push({ ...rect });
}

/**
 * Assign images to partition leaves: the true full-length image is pinned to
 * the tallest (smallest w/h) cell; remaining cells take the best-scoring
 * image (aspect proximity + crop safety via the injected crop engine).
 */
function assignImages(leaves, images, cropEngineRef, bleedsByLeaf = new Map()) {
  const cells = leaves
    .map((rect, i) => ({ rect, index: i, aspect: rect.w / rect.h }))
    .sort((a, b) => a.aspect - b.aspect); // tallest first
  const remaining = [...images];
  const out = new Array(leaves.length).fill(null);

  // The true full-length is pinned FIRST to the tall cell nearest its own
  // aspect (the reserved column) — the absolute tallest cell may be a
  // narrow column that would crop the figure's sides.
  const flIndex = remaining.findIndex(isTrueFullLength);
  if (flIndex !== -1) {
    const fl = remaining[flIndex];
    const flAspect = Number(fl.aspect) || 0.55;
    const tallCells = cells.filter((c) => c.aspect <= 0.8);
    if (tallCells.length) {
      const home = tallCells.reduce((best, c) =>
        Math.abs(c.aspect - flAspect) < Math.abs(best.aspect - flAspect) ? c : best,
      );
      remaining.splice(flIndex, 1);
      out[home.index] = {
        ...roundRect(home.rect),
        imageId: fl.id,
        crop: (() => {
          if (cropEngineRef && typeof cropEngineRef.resolveCrop === "function") {
            try {
              const crop = cropEngineRef.resolveCrop(fl, {
                aspect: home.aspect,
                role: fl.role ?? null,
                kind: "cell",
              });
              if (crop && crop.fit) return crop;
            } catch {
              /* fall through */
            }
          }
          return naiveCrop(home.aspect);
        })(),
        bleedEdges: bleedsByLeaf.get(home.rect) || [],
      };
      const homePos = cells.indexOf(home);
      cells.splice(homePos, 1);
    }
  }

  const cropFor = (img, cell) => {
    if (cropEngineRef && typeof cropEngineRef.resolveCrop === "function") {
      try {
        const crop = cropEngineRef.resolveCrop(img, {
          aspect: cell.aspect,
          role: img.role ?? null,
          kind: "cell",
        });
        if (crop && crop.fit) return crop;
      } catch {
        /* fall through */
      }
    }
    return naiveCrop(cell.aspect);
  };

  for (const cell of cells) {
    if (!remaining.length) break;
    let pickIndex = 0;

    if (cell === cells[0]) {
      const flIndex = remaining.findIndex(isTrueFullLength);
      if (flIndex !== -1) pickIndex = flIndex;
    }
    if (pickIndex === 0 && !(cell === cells[0] && remaining.some(isTrueFullLength))) {
      let bestScore = -Infinity;
      remaining.forEach((img, i) => {
        const crop = cropFor(img, cell);
        const aspect = Number(img.aspect);
        const mismatch =
          Number.isFinite(aspect) && aspect > 0
            ? Math.abs(Math.log(aspect / cell.aspect))
            : 0.7;
        const safety =
          crop.safety.level === "unsafe" ? -100 : crop.safety.level === "caution" ? -8 : 0;
        const score = safety - mismatch * 10 - (crop.coverageLoss || 0) * 5;
        if (score > bestScore) {
          bestScore = score;
          pickIndex = i;
        }
      });
    }

    const img = remaining.splice(pickIndex, 1)[0];
    out[cell.index] = {
      ...roundRect(cell.rect),
      imageId: img.id,
      crop: cropFor(img, cell),
      bleedEdges: bleedsByLeaf.get(cell.rect) || [],
    };
  }
  return out.filter(Boolean);
}

/**
 * @param {object} input — see spec §B
 * @returns {object} BackLayout
 */
function solveBackPartition(input = {}) {
  const {
    region,
    images = [],
    stats = {},
    pacing = 1,
    tone = {},
    seed,
    salt = "back",
    cropEngine,
    pageW = PAGE_W,
    pageH = PAGE_H,
    bleedAppetite = null, // 'none'|'restrained'|'expressive' (brief)
  } = input;

  if (!region || !(region.w > 0) || !(region.h > 0)) {
    throw new Error("solveBackPartition requires a region {x,y,w,h}");
  }

  const rng = createMulberry32(seedToUint32(`${seed ?? "auto"}:${salt}`));
  const decisions = [];
  const warnings = [];
  const decide = (aspect, choice, because) => decisions.push({ aspect, choice, because });
  const density = toneAxis(tone, "density");
  const formality = toneAxis(tone, "formality");
  const cropEngineRef = resolveCropEngine(cropEngine);

  const pacingT = (clamp(pacing, 0.8, 1.6) - 0.8) / 0.8;
  const gutter = r3(lerp(0.06, 0.16, pacingT));

  // 1. Chrome strips.
  const nameH = r3(lerp(0.38, 0.52, pacingT));
  // Footer holds the three-line booking hierarchy (label/primary/line) and
  // the wordmark + URL cue — 0.46in keeps both inside their boxes.
  const footH = 0.46;
  const nameBlock = { x: region.x, y: region.y, w: region.w, h: nameH };
  const contactBlock = {
    x: region.x,
    y: region.y + region.h - footH,
    w: region.w - 1.2,
    h: footH,
  };
  const wordmark = {
    x: region.x + region.w - 1.1,
    y: region.y + region.h - 0.3,
    w: 1.1,
    h: 0.3,
  };
  const content = {
    x: region.x,
    y: region.y + nameH + gutter,
    w: region.w,
    h: region.h - nameH - footH - 2 * gutter,
  };

  // 2. Stats carving (a real partition member). `stats.skip` (no stat lines
  // to render) gives the whole content area to photographs.
  let side = stats.side && stats.side !== "auto" ? stats.side : null;
  if (!side && !stats.skip) {
    const draw = rng();
    // Formal registers favor the column; relaxed ones the bottom band.
    const columnP = clamp(0.42 + 0.3 * formality, 0, 0.9);
    side = draw < columnP ? (rng() < 0.62 ? "right" : "left") : "bottom";
  }
  let statsBlock;
  let photoArea;
  if (stats.skip) {
    statsBlock = { x: content.x, y: content.y, w: 0, h: 0, orientation: "column" };
    photoArea = { ...content };
    side = "none";
  } else if (side === "bottom") {
    const bandH = clamp(stats.measureIn || lerp(0.9, 1.3, rng()), 0.9, 1.3);
    statsBlock = {
      x: content.x,
      y: content.y + content.h - bandH,
      w: content.w,
      h: bandH,
      orientation: "strip",
    };
    photoArea = { x: content.x, y: content.y, w: content.w, h: content.h - bandH - gutter };
  } else {
    const colW = clamp(stats.measureIn || lerp(1.15, 1.55, rng()), 1.15, 1.55);
    statsBlock = {
      x: side === "right" ? content.x + content.w - colW : content.x,
      y: content.y,
      w: colW,
      h: content.h,
      orientation: "column",
    };
    photoArea = {
      x: side === "right" ? content.x : content.x + colW + gutter,
      y: content.y,
      w: content.w - colW - gutter,
      h: content.h,
    };
  }
  decide(
    "stats-side",
    side,
    side === "none"
      ? "no stats to render — photo area takes the full content region"
      : "seeded, formality-biased carving of the content area",
  );

  // 3. Partition.
  const usable = images.filter((img) => img && img.id);
  let count = Math.min(usable.length, 5);
  if (count > 0) count = Math.max(count, Math.min(3, usable.length));
  const capacity = maxCellsFor(photoArea, gutter);
  if (count > capacity) {
    warnings.push(`photo area fits ${capacity} cells; requested ${count}`);
    count = Math.max(1, capacity);
  }
  const leaves = [];
  if (count > 0) {
    // A true full-length image NEEDS a genuinely tall cell — wide rows chop
    // the figure at the shins, while an over-tall column crops its sides.
    // Reserve a column strip whose top cell matches the figure's own aspect;
    // any leftover under it becomes a support cell.
    const fullLength = usable.find(isTrueFullLength);
    const needTall = Boolean(fullLength) && count >= 2;
    let reserved = false;
    if (needTall) {
      const flAspect = clamp(Number(fullLength.aspect) || 0.55, 0.4, 0.75);
      // 0.04in slack keeps the remainder comfortably above MIN so the rest
      // of the partition never lands on a razor-thin capacity boundary.
      const tallW = clamp(
        photoArea.w * lerp(0.38, 0.52, rng()),
        MIN_CELL_SHORT_EDGE,
        photoArea.w - MIN_CELL_SHORT_EDGE - gutter - 0.04,
      );
      const tallH = Math.min(photoArea.h, Math.max(MIN_CELL_SHORT_EDGE, tallW / flAspect));
      if (
        tallW >= MIN_CELL_SHORT_EDGE - 1e-6 &&
        photoArea.w - tallW - gutter >= MIN_CELL_SHORT_EDGE - 1e-6 &&
        tallW / tallH <= 0.8
      ) {
        const onLeft = rng() < 0.5;
        const stripX = onLeft ? photoArea.x : photoArea.x + photoArea.w - tallW;
        const tall = { x: stripX, y: photoArea.y, w: tallW, h: tallH };
        let used = 1;
        const belowH = photoArea.h - tallH - gutter;
        if (belowH >= MIN_CELL_SHORT_EDGE && count - 1 >= 1) {
          leaves.push(tall);
          leaves.push({ x: stripX, y: r3(photoArea.y + tallH + gutter), w: tallW, h: r3(belowH) });
          used = 2;
        } else {
          tall.h = photoArea.h; // not enough room below — take the full height
          leaves.push(tall);
        }
        const rest = {
          x: onLeft ? photoArea.x + tallW + gutter : photoArea.x,
          y: photoArea.y,
          w: photoArea.w - tallW - gutter,
          h: photoArea.h,
        };
        if (count - used > 0) partition(rest, count - used, rng, gutter, leaves);
        reserved = true;
        decide(
          "tall-cell",
          `${r3(tall.w)}×${r3(tall.h)}in ${onLeft ? "left" : "right"} (figure aspect ${flAspect})`,
          "column reserved at the full-length image's own aspect",
        );
      }
    }
    if (!reserved) partition(photoArea, count, rng, gutter, leaves);
  }
  decide("partition", `${leaves.length} cells`, "seeded recursive subdivision of the photo area");

  // 4. Bleeds — applied to the geometry BEFORE assignment so crops and the
  // tallest-cell rule see final rects. Left/right page edges only (the name
  // and contact strips own the top/bottom boundaries).
  const eps = 1e-4;
  let bleedBudget;
  if (bleedAppetite === "none") {
    bleedBudget = 0;
  } else if (bleedAppetite === "expressive") {
    bleedBudget = rng() < 0.85 ? 2 : 1;
  } else {
    bleedBudget = rng() < 0.25 + 0.45 * density ? (rng() < 0.4 ? 2 : 1) : 0;
  }
  let bled = 0;
  const bleedsByLeaf = new Map();
  for (let i = 0; i < leaves.length && bled < bleedBudget; i++) {
    const leaf = leaves[i];
    if (Math.abs(leaf.x - photoArea.x) < eps && Math.abs(photoArea.x - region.x) < eps) {
      leaf.w = r3(leaf.w + leaf.x);
      leaf.x = 0;
      bleedsByLeaf.set(leaf, ["left"]);
      bled += 1;
    } else if (
      Math.abs(leaf.x + leaf.w - (photoArea.x + photoArea.w)) < eps &&
      Math.abs(photoArea.x + photoArea.w - (region.x + region.w)) < eps
    ) {
      leaf.w = r3(pageW - leaf.x);
      bleedsByLeaf.set(leaf, ["right"]);
      bled += 1;
    }
  }
  if (bled) decide("bleed", `${bled} cell(s)`, "density-biased page-edge bleed");

  // 5. Assignment against final geometry.
  const cells = assignImages(leaves, usable, cropEngineRef, bleedsByLeaf);
  if (usable.length && !usable.some(isTrueFullLength)) {
    warnings.push("no true full-length image available for the back partition");
  }

  const photoAreaSize = photoArea.w * photoArea.h;
  const coverageRatio = photoAreaSize > 0
    ? r3(cells.reduce((sum, c) => sum + Math.min(c.w, photoArea.w) * c.h, 0) / photoAreaSize)
    : 0;

  return {
    cells,
    statsBlock: roundRect(statsBlock),
    nameBlock: roundRect(nameBlock),
    contactBlock: roundRect(contactBlock),
    wordmark: roundRect(wordmark),
    gutter,
    coverageRatio,
    decisions,
    warnings,
  };
}

/**
 * Structural invariants for a BackLayout. Returns { ok, problems }.
 * Bleed cells may exceed the region but never the page.
 */
function validateLayout(layout, { pageW = PAGE_W, pageH = PAGE_H } = {}) {
  const problems = [];
  const cells = layout?.cells || [];
  for (const cell of cells) {
    if (cell.x < -1e-6 || cell.y < -1e-6 || cell.x + cell.w > pageW + 1e-6 || cell.y + cell.h > pageH + 1e-6) {
      problems.push(`cell ${cell.imageId} exceeds page bounds`);
    }
    if (Math.min(cell.w, cell.h) < MIN_CELL_SHORT_EDGE - 0.02) {
      problems.push(`cell ${cell.imageId} short edge below minimum`);
    }
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (rectsOverlap(cells[i], cells[j], 1e-4)) {
        problems.push(`cells ${cells[i].imageId} and ${cells[j].imageId} overlap`);
      }
    }
    if (layout.statsBlock && rectsOverlap(cells[i], layout.statsBlock, 1e-4)) {
      problems.push(`cell ${cells[i].imageId} overlaps stats block`);
    }
  }
  return { ok: problems.length === 0, problems };
}

module.exports = {
  solveFrontGeometry,
  solveBackPartition,
  validateLayout,
  toCssRect,
  MIN_CELL_SHORT_EDGE,
  PAGE_W,
  PAGE_H,
};
