/**
 * Back-page architecture grammar (v5).
 *
 * The back page was a single recursive-partition algorithm, so every back
 * converged. This replaces it with a GRAMMAR OF ARCHITECTURES — distinct
 * structural families sampled and parameterized per talent and per photo
 * set — emitting the SAME BackLayout contract the renderer + crop-healing
 * already consume:
 *   { cells:[{x,y,w,h,imageId,crop,bleedEdges}], statsBlock:{x,y,w,h,orientation},
 *     nameBlock, contactBlock, wordmark, gutter, coverageRatio, architecture,
 *     decisions, warnings }
 *
 * Architecture families (each a continuous generator, not a template):
 *   uniform-grid     — equal cells, columns×rows fit to the photo count
 *   feature-column   — one tall feature + a stacked support column (asymmetric)
 *   feature-row      — one wide feature band + a support row
 *   mosaic           — recursive ratio partition (the legacy look, kept as ONE family)
 *   filmstrip        — a single band of equal cells
 *   editorial-stagger— offset modular cells at varied sizes/positions
 *   restrained-duo   — two large photos + generous whitespace (premium minimal)
 *   high-density     — 5–6 packed cells (Z-card tradition)
 *
 * Stat strategies (orthogonal): right/left column, top/bottom band — placed
 * as a real region the photos flow around. Representation/booking placement
 * and name position vary with the architecture.
 *
 * Photo-set responsive: the usable image count and shot mix (true full-length?
 * headshot count?) gate which architectures are eligible and where the
 * full-length anchors. Spec: docs/comp-card-frontpage-intelligence-proposal.md.
 *
 * Deterministic: same (inputs, seed) ⇒ deep-equal. crop-engine injected for
 * per-cell crops; fail-soft to naive center crops.
 */

const PAGE_W = 5.5;
const PAGE_H = 8.5;
const MIN_CELL = 1.0; // min cell short edge (in)

// ── PRNG ────────────────────────────────────────────────────────────────────
function seedToUint32(seed) {
  if (seed == null || seed === "") return 0;
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0 || 1;
}
function mulberry32(a) {
  let st = a >>> 0;
  return function () { st = (st + 0x6d2b79f5) >>> 0; let t = Math.imul(st ^ (st >>> 15), st | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const r3 = (n) => Math.round(n * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const rect = (x, y, w, h) => ({ x: r3(x), y: r3(y), w: r3(w), h: r3(h) });
function toneAxis(tone, k, d = 0.5) { const v = tone && Number(tone[k]); return Number.isFinite(v) ? clamp(v, 0, 1) : d; }

function rawShot(img) {
  if (img?.rawShotType) return String(img.rawShotType);
  if (img?.shot_type == null) return "";
  return String(img.shot_type).trim().toLowerCase().replace(/\s+/g, "_");
}
function isFullLength(img) {
  const s = rawShot(img);
  return s === "full_length" || s === "full_body" || (!s && img?.role === "full_body");
}

function resolveCropEngine(injected) {
  if (injected !== undefined) return injected && typeof injected === "object" ? injected : null;
  try { return require("../crop-engine"); } catch { return null; }
}
function naiveCrop() {
  return { fit: "cover", objectPosition: "50% 50%", safety: { level: "caution", notes: ["naive center crop"] }, coverageLoss: 0 };
}

// ── cell architectures: photoArea + count → array of {x,y,w,h, tall?} ────────

function archUniformGrid(area, n, rng, gutter) {
  // choose a cols×rows close to square that holds n
  const all = { 2: [[2, 1], [1, 2]], 3: [[3, 1], [1, 3], [2, 2]], 4: [[2, 2], [4, 1], [1, 4]], 5: [[2, 3], [3, 2]], 6: [[2, 3], [3, 2]] }[n] || [[2, 2]];
  // keep configurations whose cells clear MIN_CELL AND hold a sane portrait
  // aspect (0.45–1.7) — a 3-columns-in-a-tall-area grid yields 0.15-aspect
  // slivers no portrait can fill, which then get matted into tiny voids.
  const cellAspect = ([c, r]) => ((area.w - gutter * (c - 1)) / c) / ((area.h - gutter * (r - 1)) / r);
  const fitsMin = ([c, r]) => (area.w - gutter * (c - 1)) / c >= MIN_CELL && (area.h - gutter * (r - 1)) / r >= MIN_CELL;
  const saneAspect = (o) => cellAspect(o) >= 0.45 && cellAspect(o) <= 1.7;
  const viable = all.filter((o) => fitsMin(o) && saneAspect(o));
  const options = viable.length ? viable : all.filter(fitsMin);
  const pool = options.length ? options : all;
  const choice = pool[Math.floor(rng() * pool.length) % pool.length];
  const [cols, rows] = choice;
  const cw = (area.w - gutter * (cols - 1)) / cols;
  const ch = (area.h - gutter * (rows - 1)) / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (cells.length >= n) break;
    cells.push(rect(area.x + c * (cw + gutter), area.y + r * (ch + gutter), cw, ch));
  }
  return cells;
}

function archFeatureColumn(area, n, rng, gutter) {
  const onLeft = rng() < 0.5;
  const fw = area.w * lerp(0.48, 0.6, rng());
  const sw = area.w - fw - gutter;
  const feature = rect(onLeft ? area.x : area.x + sw + gutter, area.y, fw, area.h);
  const supports = n - 1;
  const sh = supports > 0 ? (area.h - gutter * (supports - 1)) / supports : area.h;
  const cells = [feature];
  for (let i = 0; i < supports; i++) {
    cells.push(rect(onLeft ? area.x + fw + gutter : area.x, area.y + i * (sh + gutter), sw, sh));
  }
  return cells;
}

function archFeatureRow(area, n, rng, gutter) {
  const onTop = rng() < 0.5;
  const fh = area.h * lerp(0.5, 0.62, rng());
  const rh = area.h - fh - gutter;
  const feature = rect(area.x, onTop ? area.y : area.y + rh + gutter, area.w, fh);
  const supports = n - 1;
  const sw = supports > 0 ? (area.w - gutter * (supports - 1)) / supports : area.w;
  const cells = [feature];
  for (let i = 0; i < supports; i++) {
    cells.push(rect(area.x + i * (sw + gutter), onTop ? area.y + fh + gutter : area.y, sw, rh));
  }
  return cells;
}

function archFilmstrip(area, n, rng, gutter) {
  // choose the orientation whose cells stay portrait-sane (a horizontal strip
  // of N in a tall area makes sliver columns; vertical makes squat rows).
  const hCellAspect = ((area.w - gutter * (n - 1)) / n) / area.h;
  const vCellAspect = area.w / ((area.h - gutter * (n - 1)) / n);
  const hSane = hCellAspect >= 0.45 && hCellAspect <= 1.7;
  const vSane = vCellAspect >= 0.45 && vCellAspect <= 1.7;
  let vertical;
  if (hSane && !vSane) vertical = false;
  else if (vSane && !hSane) vertical = true;
  else vertical = rng() < 0.4;
  const cells = [];
  if (vertical) {
    const ch = (area.h - gutter * (n - 1)) / n;
    for (let i = 0; i < n; i++) cells.push(rect(area.x, area.y + i * (ch + gutter), area.w, ch));
  } else {
    const cw = (area.w - gutter * (n - 1)) / n;
    for (let i = 0; i < n; i++) cells.push(rect(area.x + i * (cw + gutter), area.y, cw, area.h));
  }
  return cells;
}

function archMosaic(area, n, rng, gutter) {
  // recursive ratio partition into n leaves
  const ratios = [0.5, 0.382, 0.618, 0.4, 0.6];
  const leaves = [];
  (function part(rc, k) {
    if (k <= 1) { leaves.push(rc); return; }
    const kA = Math.max(1, Math.round(k * (0.35 + rng() * 0.3)));
    const kB = Math.max(1, k - kA);
    const vertical = rng() < clamp(0.5 + (rc.w / rc.h - 0.8) * 0.8, 0.15, 0.85);
    const ratio = clamp(ratios[Math.floor(rng() * ratios.length) % ratios.length] + (rng() * 2 - 1) * 0.03, 0.3, 0.7);
    if (vertical) {
      const wA = (rc.w - gutter) * ratio;
      if (wA < MIN_CELL || rc.w - gutter - wA < MIN_CELL) { leaves.push(rc); return; }
      part(rect(rc.x, rc.y, wA, rc.h), kA);
      part(rect(rc.x + wA + gutter, rc.y, rc.w - gutter - wA, rc.h), kB);
    } else {
      const hA = (rc.h - gutter) * ratio;
      if (hA < MIN_CELL || rc.h - gutter - hA < MIN_CELL) { leaves.push(rc); return; }
      part(rect(rc.x, rc.y, rc.w, hA), kA);
      part(rect(rc.x, rc.y + hA + gutter, rc.w, rc.h - gutter - hA), kB);
    }
  })(area, n);
  return leaves;
}

function archEditorialStagger(area, n, rng, gutter) {
  // two columns; cells in each column vary in height and start offset
  const cols = 2;
  const cw = (area.w - gutter) / cols;
  const left = Math.ceil(n / 2);
  const right = n - left;
  const cells = [];
  const fill = (cx, count, offset) => {
    let y = area.y + offset;
    const usable = area.h - offset;
    // varied heights summing to usable
    const weights = Array.from({ length: count }, () => 0.7 + rng() * 0.6);
    const sum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < count; i++) {
      const h = (usable - gutter * (count - 1)) * (weights[i] / sum);
      cells.push(rect(cx, y, cw, h));
      y += h + gutter;
    }
  };
  fill(area.x, left, 0);
  fill(area.x + cw + gutter, right, lerp(0, 0.5, rng()));
  return cells;
}

function archRestrainedDuo(area, n, rng, gutter) {
  // two generous photos; vertical or horizontal split with breathing room
  const vertical = rng() < 0.6;
  const inset = lerp(0.1, 0.45, rng()); // whitespace
  if (vertical) {
    const w = (area.w - gutter) / 2;
    const h = area.h * (1 - inset);
    return [rect(area.x, area.y, w, h), rect(area.x + w + gutter, area.y + area.h * inset, w, h)];
  }
  const h = (area.h - gutter) / 2;
  const w = area.w * (1 - inset);
  return [rect(area.x, area.y, w, h), rect(area.x + area.w * inset, area.y + h + gutter, w, h)];
}

const ARCHITECTURES = {
  "uniform-grid": { fn: archUniformGrid, min: 3, max: 6 },
  "feature-column": { fn: archFeatureColumn, min: 3, max: 5 },
  "feature-row": { fn: archFeatureRow, min: 3, max: 5 },
  "mosaic": { fn: archMosaic, min: 3, max: 5 },
  "filmstrip": { fn: archFilmstrip, min: 3, max: 4 },
  "editorial-stagger": { fn: archEditorialStagger, min: 4, max: 6 },
  "restrained-duo": { fn: archRestrainedDuo, min: 2, max: 2 },
  "high-density": { fn: archUniformGrid, min: 5, max: 6 },
};

// ── assignment: full-length to the tallest cell, rest by aspect + safety ─────

function assign(cells, images, cropRef) {
  const ordered = cells
    .map((rc, i) => ({ rc, i, aspect: rc.w / rc.h }))
    .sort((a, b) => a.aspect - b.aspect); // tallest first
  const pool = [...images];
  const out = new Array(cells.length).fill(null);
  const cropFor = (img, aspect) => {
    if (cropRef && typeof cropRef.resolveCrop === "function") {
      try { const c = cropRef.resolveCrop(img, { aspect, role: img.role ?? null, kind: "cell" }); if (c && c.fit) return c; } catch { /* fall */ }
    }
    return naiveCrop();
  };
  // pin full-length to the tallest available cell (smallest aspect) — never
  // a wide cell that would crop the figure at the shins.
  const flIdx = pool.findIndex(isFullLength);
  if (flIdx !== -1 && ordered.length) {
    const fl = pool[flIdx];
    const flA = Number(fl.aspect) || 0.6;
    const tall = ordered.filter((c) => c.aspect <= 0.85);
    const pickFrom = tall.length ? tall : [ordered[0]]; // ordered[0] = tallest
    const home = pickFrom.reduce((b, c) => (Math.abs(c.aspect - flA) < Math.abs(b.aspect - flA) ? c : b));
    out[home.i] = { ...home.rc, imageId: fl.id, crop: cropFor(fl, home.aspect), bleedEdges: [] };
    pool.splice(flIdx, 1);
    ordered.splice(ordered.indexOf(home), 1);
  }
  for (const cell of ordered) {
    if (!pool.length) break;
    let best = 0, bestScore = -Infinity;
    pool.forEach((img, k) => {
      const a = Number(img.aspect);
      const mismatch = Number.isFinite(a) && a > 0 ? Math.abs(Math.log(a / cell.aspect)) : 0.7;
      const crop = cropFor(img, cell.aspect);
      const safety = crop.safety.level === "unsafe" ? -100 : crop.safety.level === "caution" ? -6 : 0;
      const score = safety - mismatch * 10;
      if (score > bestScore) { bestScore = score; best = k; }
    });
    const img = pool.splice(best, 1)[0];
    out[cell.i] = { ...cell.rc, imageId: img.id, crop: cropFor(img, cell.aspect), bleedEdges: [] };
  }
  return out.filter(Boolean);
}

// ── Swiss module snap (editions only) ────────────────────────────────────────
// Snap a set of rects to a `moduleCount × moduleCount` grid over `area`, so
// every edge lands on a grid line (≤ 0.02in error by construction). The x/y
// boundary maps are built order-preservingly with a minimum inter-boundary
// step of MIN_CELL, so snapping never collapses a cell below the minimum and
// never introduces an overlap the inputs did not already have.
function moduleSnapMaps(rects, area, moduleCount) {
  const mc = Math.max(2, Math.round(moduleCount) || 8);
  const mx = area.w / mc;
  const my = area.h / mc;
  // Snap each distinct boundary to its NEAREST grid line (clamped to the area
  // so nothing escapes the region), then enforce a monotonic non-decreasing
  // order so no two cells' boundaries invert — that guarantees the snap never
  // introduces an overlap or an out-of-area edge. A gutter that collapses to a
  // shared line just means two cells touch (no overlap).
  const build = (vals, start, m) => {
    const sorted = [...new Set(vals.map((v) => r3(v)))].sort((a, b) => a - b);
    const map = new Map();
    let prev = -Infinity;
    for (const v of sorted) {
      const u = Math.max(0, Math.min(mc, Math.round((v - start) / m)));
      let snapped = r3(start + u * m);
      if (snapped < prev) snapped = prev; // preserve order (merge, never invert)
      map.set(v, snapped);
      prev = snapped;
    }
    return map;
  };
  const xs = rects.flatMap((c) => [c.x, c.x + c.w]);
  const ys = rects.flatMap((c) => [c.y, c.y + c.h]);
  return { xmap: build(xs, area.x, mx), ymap: build(ys, area.y, my), mx, my };
}

// ── the back-program solver ──────────────────────────────────────────────────

/**
 * @param {object} input — { region, images:[{id,aspect,role,rawShotType}],
 *   stats:{side,skip,measureIn}, pacing, tone, seed, salt, cropEngine,
 *   bleedAppetite, edition?:{def,operators}, frontEcho?:{matAsymmetry,moduleCount} }
 * @returns {object} BackLayout (same contract as solveBackPartition; when an
 *   edition is present, additionally carries `style` + `nameplate`)
 */
function solveBackProgram(input = {}) {
  const { region, images = [], stats = {}, pacing = 1, tone = {}, seed, salt = "back", cropEngine, bleedAppetite } = input;
  if (!region || !(region.w > 0) || !(region.h > 0)) throw new Error("solveBackProgram requires a region");
  const rng = mulberry32(seedToUint32(`${seed ?? "auto"}:${salt}`));
  const decisions = [];
  const warnings = [];
  const decide = (a, c, b) => decisions.push({ aspect: a, choice: c, because: b });
  const warn = (m) => { if (m && !warnings.includes(m)) warnings.push(m); };
  const density = toneAxis(tone, "density");
  const formality = toneAxis(tone, "formality");
  const cropRef = resolveCropEngine(cropEngine);
  const usable = images.filter((i) => i && i.id);
  const n0 = usable.length;

  // ── Edition chrome + objectives (flag-gated) ────────────────────────────
  // input.edition = { def (catalog entry), operators { field, register } }.
  // ABSENT ⇒ every branch below is skipped and the output is byte-identical
  // to the pre-editions solver (regression-locked). `style` is emitted only
  // when an edition is present; the canonical stats line ORDER is never
  // touched by any of this — only the SETTING (side/orientation) varies.
  const edition = input.edition && typeof input.edition === "object" ? input.edition : null;
  const edDef = edition && edition.def && typeof edition.def === "object" ? edition.def : null;
  const edField = edition && edition.operators ? edition.operators.field || null : null;
  const frontEcho = input.frontEcho && typeof input.frontEcho === "object" ? input.frontEcho : null;
  const backStyleDef = (edDef && edDef.back && edDef.back.style) || null;
  let style = null;
  if (edDef) {
    style = {
      nameAlign: (backStyleDef && backStyleDef.nameAlign) || "left",
      statsStyle: (backStyleDef && backStyleDef.statsStyle) || "auto",
      dividers: Boolean(backStyleDef && backStyleDef.dividers),
      cellIndexes: Boolean(backStyleDef && backStyleDef.cellIndexes),
      airy: Boolean(backStyleDef && backStyleDef.airy),
      // A dark FIELD operator reverses the whole page even when the edition's
      // own back style does not declare it (noir + any dark-field edition).
      reversed: Boolean(backStyleDef && backStyleDef.reversed) || edField === "dark",
      field: edField,
    };
    decide(
      "edition-back",
      edDef.id,
      `chrome ${style.statsStyle}${style.airy ? ", airy" : ""}${style.reversed ? ", reversed" : ""}${style.dividers ? ", dividers" : ""}`,
    );
  }
  const airy = Boolean(style && style.airy);

  // Monograph "air as material": gutters + margins scale up (~1.3× pacing).
  // Legacy path (airy false) leaves pacingT byte-identical.
  const pacingBase = clamp(pacing, 0.8, 1.6);
  const effPacing = airy ? clamp(pacingBase * 1.3, 0.8, 1.6) : pacingBase;
  const pacingT = (effPacing - 0.8) / 0.8;
  const gutter = r3(lerp(0.06, 0.18, pacingT));

  // chrome: name strip top, contact/booking strip bottom
  const nameH = r3(lerp(0.36, 0.5, pacingT));
  const footH = 0.46;
  const nameBlock = rect(region.x, region.y, region.w, nameH);
  const wordmark = rect(region.x + region.w - 1.1, region.y + region.h - 0.3, 1.1, 0.3);
  const contactBlock = rect(region.x, region.y + region.h - footH, region.w - 1.2, footH);
  let content = rect(region.x, region.y + nameH + gutter, region.w, region.h - nameH - footH - 2 * gutter);

  // Monograph air: inset the content region (margins scale up). When the
  // front's mat asymmetry is known (frontEcho.matAsymmetry), echo its
  // direction — the heavier margin lands on the same side, so front and back
  // read as one art-directed spread.
  if (airy) {
    const airPad = 0.22;
    let padL = airPad;
    let padR = airPad;
    const echo =
      frontEcho && (frontEcho.matAsymmetry === "left" || frontEcho.matAsymmetry === "right")
        ? frontEcho.matAsymmetry
        : null;
    if (echo === "left") padL += 0.16;
    else if (echo === "right") padR += 0.16;
    const padY = airPad * 0.5;
    content = rect(content.x + padL, content.y + padY, content.w - padL - padR, content.h - 2 * padY);
    decide(
      "airy-margins",
      `L${r3(padL)}/R${r3(padR)}`,
      echo ? `monograph air — mat-asymmetry echo ${echo}` : "monograph air",
    );
  }

  // stats strategy (skip when no stats)
  let side = stats.side && stats.side !== "auto" ? stats.side : null;
  const statsStyle = style ? style.statsStyle : "auto";
  if (!side && !stats.skip) {
    if (style && statsStyle !== "auto") {
      // Edition chrome dictates the SETTING (never the canonical line order).
      // footline → a single stats row at the foot; strip → a band;
      // column/tabular → a side column (tabular flagged in style for ruled
      // rendering). The full-width footline reclaims the freed side column.
      if (statsStyle === "footline") side = "footline";
      else if (statsStyle === "strip") side = rng() < 0.5 ? "bottom" : "top";
      else side = rng() < 0.6 ? "right" : "left";
    } else {
      const draw = rng();
      // formal → column; relaxed → band; high density → narrower column
      side = draw < clamp(0.4 + 0.3 * formality, 0, 0.85) ? (rng() < 0.6 ? "right" : "left") : (rng() < 0.5 ? "bottom" : "top");
    }
  }
  let statsBlock, photoArea;
  if (stats.skip) {
    statsBlock = { x: content.x, y: content.y, w: 0, h: 0, orientation: "column" };
    photoArea = { ...content };
    side = "none";
  } else if (side === "footline") {
    // A single measure-disciplined stats ROW at the foot; photos reclaim the
    // full width above it (no side column). Never over an image.
    const rowH = clamp(stats.measureIn || 0.34, 0.28, 0.44);
    statsBlock = rect(content.x, content.y + content.h - rowH, content.w, rowH);
    statsBlock.orientation = "footline";
    photoArea = rect(content.x, content.y, content.w, content.h - rowH - gutter);
  } else if (side === "bottom" || side === "top") {
    const bandH = clamp(stats.measureIn || lerp(0.85, 1.25, rng()), 0.8, 1.3);
    if (side === "bottom") {
      statsBlock = rect(content.x, content.y + content.h - bandH, content.w, bandH); statsBlock.orientation = "strip";
      photoArea = rect(content.x, content.y, content.w, content.h - bandH - gutter);
    } else {
      statsBlock = rect(content.x, content.y, content.w, bandH); statsBlock.orientation = "strip";
      photoArea = rect(content.x, content.y + bandH + gutter, content.w, content.h - bandH - gutter);
    }
  } else {
    const colW = clamp(stats.measureIn || lerp(1.1, 1.5, rng()), 1.05, 1.55);
    statsBlock = side === "right"
      ? rect(content.x + content.w - colW, content.y, colW, content.h)
      : rect(content.x, content.y, colW, content.h);
    statsBlock.orientation = "column";
    photoArea = side === "right"
      ? rect(content.x, content.y, content.w - colW - gutter, content.h)
      : rect(content.x + colW + gutter, content.y, content.w - colW - gutter, content.h);
  }
  decide(
    "stats-side",
    side,
    stats.skip
      ? "no stats"
      : style && statsStyle !== "auto"
        ? `edition chrome '${statsStyle}'`
        : "seeded, formality-biased",
  );

  // Desired photo count is density-driven, but anchored to the industry
  // convention: a standard comp-card back shows ~4 frames (the "3–5" range).
  // We bias the neutral default to 4 and floor standard cards at 3; a 2-photo
  // back is reserved for an EXPLICITLY minimal style (very low density), which
  // is the only case the restrained-duo architecture should win. The
  // full-length and strongest frames survive the trim.
  const maxN = clamp(n0, 1, 6);
  const STANDARD_BACK_COUNT = 4;
  const minimalStyle = density < 0.18; // explicit minimal → duo permitted
  const floorN = clamp(minimalStyle ? 2 : 3, 1, maxN);
  let desired;
  if (density >= 0.66) {
    // Dense cards climb from the standard toward the full available set.
    desired = Math.round(lerp(STANDARD_BACK_COUNT, maxN, (density - 0.66) / 0.34));
  } else if (density <= 0.34) {
    // Quiet cards ease from the standard down to the floor (3, or 2 if minimal).
    desired = Math.round(lerp(floorN, STANDARD_BACK_COUNT, density / 0.34));
  } else {
    // Neutral density holds the 4-frame standard, with a seeded breath of
    // variety (3 or 5 occasionally) so backs don't all share one census.
    const jitter = rng();
    desired = jitter < 0.18 ? STANDARD_BACK_COUNT - 1 : jitter > 0.85 ? STANDARD_BACK_COUNT + 1 : STANDARD_BACK_COUNT;
  }
  desired = clamp(desired, floorN, maxN);
  decide("photo-count", `${desired}/${maxN}`, `density ${r3(density)} → ${desired} of ${maxN} frames (standard ${STANDARD_BACK_COUNT}, floor ${floorN})`);

  // architecture selection — eligibility by the DESIRED count, biased by density
  const n = desired;
  let eligible = Object.entries(ARCHITECTURES).filter(([, a]) => n >= a.min && n <= a.max).map(([k]) => k);
  if (!eligible.length) eligible = ["uniform-grid"];
  // Edition architecture pool: restrict the feasible eligibility set to the
  // edition's declared back pool and renormalize the draw over it. An
  // infeasible pool (none of its families fit the desired count) falls back
  // to today's full eligibility — logged, never a throw.
  if (edDef && edDef.back && Array.isArray(edDef.back.pool) && edDef.back.pool.length) {
    const poolList = edDef.back.pool;
    const restricted = eligible.filter((id) => poolList.includes(id));
    if (restricted.length) {
      eligible = restricted;
      decide(
        "edition-pool",
        restricted.join("/"),
        `edition '${edDef.id}' back pool — ${restricted.length} feasible of ${poolList.length} for ${n} image(s)`,
      );
    } else {
      decide(
        "edition-pool",
        "full-eligibility fallback",
        `edition '${edDef.id}' pool [${poolList.join("/")}] infeasible for ${n} image(s)`,
      );
    }
  }
  // density bias: high density favors packed families; low favors duo/feature
  const weighted = [];
  for (const id of eligible) {
    let w = 1;
    if (id === "high-density") w += 3 * density;
    if (id === "restrained-duo") w += 2 * (1 - density);
    if (id === "editorial-stagger") w += 1.5 * density + formality;
    if (id === "feature-column" || id === "feature-row") w += 1 * (1 - 0.5 * density);
    if (id === "mosaic") w += 0.6;
    if (id === "filmstrip") w += 0.8 * (1 - formality);
    // The Strip: a full hero over a support ROW — feature-row is its identity.
    if (edDef && edDef.id === "the-strip" && id === "feature-row") w += 2.5;
    for (let k = 0; k < Math.max(1, Math.round(w * 2)); k++) weighted.push(id);
  }
  const archId = input.forceArchitecture && ARCHITECTURES[input.forceArchitecture]
    ? input.forceArchitecture
    : weighted[Math.floor(rng() * weighted.length) % weighted.length];
  const arch = ARCHITECTURES[archId];
  let count = clamp(n, arch.min, arch.max);
  decide("architecture", archId, input.forceArchitecture ? `forced '${archId}'` : `${eligible.length} eligible for ${n} image(s), density ${r3(density)}`);

  // build cells
  let chosenArch = archId;
  let leaves = [];
  try {
    leaves = arch.fn(photoArea, count, rng, gutter).filter((c) => c.w >= MIN_CELL - 0.02 && c.h >= MIN_CELL - 0.02);
  } catch { leaves = []; }
  if (!leaves.length) {
    leaves = archUniformGrid(photoArea, clamp(n, 1, 4), rng, gutter);
    chosenArch = "uniform-grid";
    decide("architecture", "uniform-grid (fallback)", `${archId} produced no valid cells`);
  }
  // Full-length guarantee: the figure needs a portrait cell. If the chosen
  // architecture offers none (aspect ≤ 0.85), rebuild a feature column whose
  // feature width is CAPPED so its aspect is portrait even in a short photo
  // area (a stats band leaves little height).
  const hasFullLength = usable.some(isFullLength);
  const tallest = (cells) => cells.reduce((m, c) => Math.min(m, c.w / c.h), Infinity);
  // Before collapsing to feature-column (the historical variety killer:
  // nearly every back funneled through this rebuild), try the OTHER
  // eligible architectures in seeded order — many can host a portrait cell
  // depending on their rolls, and keeping the family keeps the variety.
  if (hasFullLength && tallest(leaves) > 0.85 && count >= 2) {
    const alternates = eligible.filter((id) => id !== chosenArch);
    for (let i = alternates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [alternates[i], alternates[j]] = [alternates[j], alternates[i]];
    }
    for (const altId of alternates) {
      const alt = ARCHITECTURES[altId];
      const altCount = clamp(count, alt.min, alt.max);
      let altLeaves = [];
      try {
        altLeaves = alt.fn(photoArea, altCount, rng, gutter)
          .filter((c) => c.w >= MIN_CELL - 0.02 && c.h >= MIN_CELL - 0.02);
      } catch { altLeaves = []; }
      if (altLeaves.length >= Math.min(altCount, 2) && tallest(altLeaves) <= 0.85) {
        leaves = altLeaves;
        chosenArch = altId;
        count = altCount;
        decide("architecture", altId, `${archId} had no portrait cell — seeded alternate keeps the variety`);
        break;
      }
    }
  }
  if (hasFullLength && tallest(leaves) > 0.85 && count >= 2) {
    // 0.04 headroom below the cap so the support column clears MIN_CELL even
    // after float rounding (an exact-MIN support otherwise fails the check).
    const fw = clamp(0.8 * photoArea.h, MIN_CELL, photoArea.w - MIN_CELL - gutter - 0.04);
    if (fw >= MIN_CELL - 1e-6 && photoArea.w - fw - gutter >= MIN_CELL - 1e-6) {
      const onLeft = rng() < 0.5;
      const sw = photoArea.w - fw - gutter;
      const supports = count - 1;
      const sh = supports > 0 ? (photoArea.h - gutter * (supports - 1)) / supports : photoArea.h;
      const built = [rect(onLeft ? photoArea.x : photoArea.x + sw + gutter, photoArea.y, fw, photoArea.h)];
      for (let i = 0; i < supports && sh >= MIN_CELL; i++) {
        built.push(rect(onLeft ? photoArea.x + fw + gutter : photoArea.x, photoArea.y + i * (sh + gutter), sw, sh));
      }
      if (tallest(built) <= 0.85) {
        leaves = built;
        chosenArch = "feature-column";
        decide("architecture", "feature-column", `${archId} had no portrait cell for the full-length`);
      }
    }
  }

  // Universal safety: no sub-minimum cell ships, whatever path produced the
  // leaves (architecture, rebuild, or fallback). A degenerate set collapses
  // to a single full-area cell rather than slivers.
  leaves = leaves.filter((c) => c.w >= MIN_CELL - 0.05 && c.h >= MIN_CELL - 0.05);
  if (!leaves.length) leaves = [rect(photoArea.x, photoArea.y, photoArea.w, photoArea.h)];

  // Trim to the chosen count, but keep the full-length first so a restrained
  // (fewer-photo) card never drops the mandatory full-length shot.
  const prioritized = [...usable].sort((a, b) => (isFullLength(b) ? 1 : 0) - (isFullLength(a) ? 1 : 0));
  const assignedCells = assign(leaves, prioritized.slice(0, leaves.length), cropRef);

  // ── Airy whitespace objective (Monograph) ──────────────────────────────
  // "Air as material": cap coverage so the whitespace fraction lands in the
  // 0.35–0.5 target. Cells contract about their own centers, which preserves
  // every cell's ASPECT — the full-length stays portrait and MIN_CELL holds.
  if (airy) {
    const areaSize = photoArea.w * photoArea.h;
    const cov = areaSize > 0
      ? assignedCells.reduce((s, c) => s + Math.min(c.w, photoArea.w) * c.h, 0) / areaSize
      : 0;
    const COVERAGE_CAP = 0.62; // whitespace ≈ 0.38 (within 0.35–0.5)
    if (cov > COVERAGE_CAP) {
      const f = Math.sqrt(COVERAGE_CAP / cov);
      for (const c of assignedCells) {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        const nw = Math.max(MIN_CELL, c.w * f);
        const nh = Math.max(MIN_CELL, c.h * f);
        c.x = r3(cx - nw / 2);
        c.y = r3(cy - nh / 2);
        c.w = r3(nw);
        c.h = r3(nh);
      }
      decide("airy-coverage", `${r3(cov)}→≤${COVERAGE_CAP}`, "whitespace target 0.35–0.5 — cells contracted about centers");
    }
  }

  // ── Swiss module-grid snap (Swiss) ─────────────────────────────────────
  // The module grid is laid over the PHOTO AREA (moduleCount from frontEcho,
  // else a seeded 6/8/12). Cells snap fully to it — within the photo area by
  // construction, so they never cross into the stats column. The stats
  // block's ROW edges (top/baseline) snap to the same y-rhythm, so the
  // tabular stats read on the cells' grid lines. The grid is published on
  // `style.grid` so the template renders its dividers on the same lines.
  if (style && style.dividers) {
    const seededModule = [6, 8, 12][Math.floor(rng() * 3) % 3];
    const moduleCount =
      frontEcho && [6, 8, 12].includes(Number(frontEcho.moduleCount))
        ? Number(frontEcho.moduleCount)
        : seededModule;
    style.moduleCount = moduleCount;
    style.grid = { x: r3(photoArea.x), y: r3(photoArea.y), w: r3(photoArea.w), h: r3(photoArea.h), moduleCount };
    const { xmap, ymap, my } = moduleSnapMaps(assignedCells, photoArea, moduleCount);
    for (const c of assignedCells) {
      const x0 = xmap.get(r3(c.x));
      const x1 = xmap.get(r3(c.x + c.w));
      const y0 = ymap.get(r3(c.y));
      const y1 = ymap.get(r3(c.y + c.h));
      if (x0 == null || x1 == null || y0 == null || y1 == null) continue;
      const nw = r3(x1 - x0);
      const nh = r3(y1 - y0);
      if (nw < MIN_CELL - 0.05 || nh < MIN_CELL - 0.05) continue;
      // Full-length protection is inviolable: reject a snap that would widen
      // the figure's cell out of portrait (aspect > 0.85).
      const isFl = isFullLength({
        id: c.imageId,
        rawShotType: (usable.find((u) => u.id === c.imageId) || {}).rawShotType,
        role: (usable.find((u) => u.id === c.imageId) || {}).role,
      });
      if (isFl && nw / nh > 0.85) continue;
      c.x = x0; c.y = y0; c.w = nw; c.h = nh;
    }
    // Snap the stats block's rows to the same y-grid (its column x/width is a
    // type measure, left intact — never pushed into the photo area).
    if (statsBlock.w > 0 && statsBlock.h > 0) {
      const snapY = (v) => r3(photoArea.y + Math.round((v - photoArea.y) / my) * my);
      const sy0 = snapY(statsBlock.y);
      const sy1 = snapY(statsBlock.y + statsBlock.h);
      if (sy1 - sy0 >= my - 1e-6) {
        statsBlock.y = sy0;
        statsBlock.h = r3(sy1 - sy0);
      }
    }
    decide("swiss-grid", `module ${moduleCount}`, "cells + stats rows snapped to the photo-area module grid (≤0.02in)");
  }

  // Bleeds (left/right page edges only), density-gated, applied AFTER
  // assignment and NEVER to the full-length cell — widening would defeat its
  // portrait protection.
  const eps = 1e-3;
  let budget = bleedAppetite === "none" ? 0 : bleedAppetite === "expressive" ? (rng() < 0.85 ? 2 : 1) : (rng() < 0.25 + 0.4 * density ? 1 : 0);
  for (const cell of assignedCells) {
    if (budget <= 0) break;
    if (isFullLength({ id: cell.imageId, rawShotType: (usable.find((u) => u.id === cell.imageId) || {}).rawShotType, role: (usable.find((u) => u.id === cell.imageId) || {}).role })) continue;
    if (Math.abs(cell.x - photoArea.x) < eps && Math.abs(photoArea.x - region.x) < eps) {
      cell.w = r3(cell.w + cell.x); cell.x = 0; cell.bleedEdges = ["left"]; budget--;
    } else if (Math.abs(cell.x + cell.w - (photoArea.x + photoArea.w)) < eps && Math.abs(photoArea.x + photoArea.w - (region.x + region.w)) < eps) {
      cell.w = r3(PAGE_W - cell.x); cell.bleedEdges = ["right"]; budget--;
    }
  }
  if (usable.length && !usable.some(isFullLength)) warn("no true full-length image on the back");

  const photoSize = photoArea.w * photoArea.h;
  const coverageRatio = photoSize > 0 ? r3(assignedCells.reduce((s, c) => s + Math.min(c.w, photoArea.w) * c.h, 0) / photoSize) : 0;

  return {
    cells: assignedCells,
    statsBlock: { x: r3(statsBlock.x), y: r3(statsBlock.y), w: r3(statsBlock.w), h: r3(statsBlock.h), orientation: statsBlock.orientation },
    nameBlock, contactBlock, wordmark,
    gutter, coverageRatio, architecture: chosenArch, decisions, warnings,
    // Editions only — the template renders these; a no-edition call omits
    // them entirely (legacy output is byte-identical).
    ...(style
      ? {
          style,
          // The nameplate: the front's name designed once per take, repeated
          // on the back as a running head. `text` is filled by the director;
          // the template renders it at running-head scale.
          nameplate: { text: null, scale: "running-head", align: style.nameAlign },
        }
      : {}),
  };
}

module.exports = { solveBackProgram, ARCHITECTURES, PAGE_W, PAGE_H, MIN_CELL };
