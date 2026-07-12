/**
 * PER-EDITION SCORING (editions plan 2.6, spec §7.1).
 *
 * `score = base + Σ editionObjectives + Σ universalSoft − vetoes`.
 *
 * Hard vetoes (Booker's law + print) are never traded against soft score:
 * a veto subtracts a cliff (−400 each) so no objective mix can rescue the
 * candidate against a clean sibling. Objectives are implemented as
 * MEASURABLE checks on the program geometry + the builder's stamped
 * editionMetrics — never vibes.
 *
 * Universal soft objectives (shared with the legacy register):
 * - edge alignment among text elements;
 * - breathing (no non-bleeding text crowding the trim);
 * - sloppy-tension penalty — two text edges within 0.05in but NOT equal
 *   score worse than clearly aligned or clearly free.
 *
 * The legacy scorer is untouched: programs without an edition never
 * enter this module.
 */

const PAGE_W = 5.5;
const PAGE_H = 8.5;
const SAFE = 0.25;

const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Full credit inside [lo, hi]; linear falloff over `tol` outside. */
function inRange(v, lo, hi, w, tol) {
  if (!Number.isFinite(v)) return 0;
  const t = Number.isFinite(tol) ? tol : Math.max(0.001, (hi - lo) || 0.1);
  if (v >= lo && v <= hi) return w;
  const dist = v < lo ? lo - v : v - hi;
  return w * clamp(1 - dist / t, 0, 1);
}

/** Credit for v ≥ floor with linear falloff below. */
function atLeast(v, floor, w, tol) {
  if (!Number.isFinite(v)) return 0;
  if (v >= floor) return w;
  const t = Number.isFinite(tol) ? tol : Math.max(0.001, Math.abs(floor) * 0.5);
  return w * clamp(1 - (floor - v) / t, 0, 1);
}

/** Credit for v ≤ ceil with linear falloff above. */
function atMost(v, ceil, w, tol) {
  if (!Number.isFinite(v)) return 0;
  if (v <= ceil) return w;
  const t = Number.isFinite(tol) ? tol : Math.max(0.001, Math.abs(ceil) * 0.5 || 0.1);
  return w * clamp(1 - (v - ceil) / t, 0, 1);
}

// ── shared extraction ────────────────────────────────────────────────────────

function parts(program) {
  const els = program.elements || [];
  const photos = els.filter((e) => e.type === "photo");
  const hero = photos.reduce(
    (a, e) => (!a || e.rect.w * e.rect.h > a.rect.w * a.rect.h ? e : a),
    null,
  );
  const names = els.filter((e) => e.type === "name");
  const textEls = els.filter((e) => ["name", "contact", "statLine", "folio"].includes(e.type));
  const rules = els.filter((e) => e.type === "rule");
  const photoArea = photos
    // layered cover-story duplicates (base + figure) count the frame once
    .filter((e, i, arr) => arr.findIndex((o) =>
      o.rect.x === e.rect.x && o.rect.y === e.rect.y && o.rect.w === e.rect.w && o.rect.h === e.rect.h) === i)
    .reduce((s, e) => s + e.rect.w * e.rect.h, 0);
  return { els, photos, hero, names, textEls, rules, photoArea };
}

function primaryName(names) {
  return names.reduce((a, e) => (!a || (e.sizePt || 0) > (a.sizePt || 0) ? e : a), null);
}

// ── universal soft objectives ────────────────────────────────────────────────

function universalSoft(program) {
  const { textEls } = parts(program);
  let score = 0;

  // alignment: shared left/right edges among text elements
  const edges = textEls.flatMap((e) => [r3(e.rect.x), r3(e.rect.x + e.rect.w)]);
  const uniqueEdges = new Set(edges.map((v) => Math.round(v * 20)));
  if (edges.length) score += 12 * (1 - uniqueEdges.size / (edges.length + 1));

  // breathing: non-bleeding text must respect the trim safe zone
  for (const e of textEls) {
    if (e.onPhoto) continue;
    if (
      e.rect.x < SAFE - 0.02 || e.rect.x + e.rect.w > PAGE_W - SAFE + 0.02 ||
      e.rect.y < SAFE - 0.02 || e.rect.y + e.rect.h > PAGE_H - SAFE + 0.02
    ) {
      score -= 8;
    }
  }

  // sloppy tension: two vertical text edges within 0.05in but not equal
  let sloppy = 0;
  const xs = textEls.flatMap((e) => [e.rect.x, e.rect.x + e.rect.w]);
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const d = Math.abs(xs[i] - xs[j]);
      if (d > 0.005 && d <= 0.05) sloppy += 1;
    }
  }
  score -= Math.min(10, 2 * sloppy);

  return score;
}

// ── hard vetoes ──────────────────────────────────────────────────────────────

const VETO = 400;

function vetoes(program, ctx) {
  const { hero, names, textEls, photoArea } = parts(program);
  let count = 0;
  const why = [];

  // name below 14pt effective
  const name = primaryName(names);
  if (!name) {
    count += 1;
    why.push("no name");
  } else if ((name.sizePt || 0) < 14 - 1e-6) {
    count += 1;
    why.push(`name ${name.sizePt}pt < 14pt`);
  }

  // hero presence floor (edition-aware)
  const def = ctx?.edition?.def || {};
  const floor = Number.isFinite(def.heroAreaFloor)
    ? def.heroAreaFloor
    : (Number.isFinite(def.matDepth) && def.matDepth > 1.2 ? 0.42 : 0.5);
  const frac = photoArea / (PAGE_W * PAGE_H);
  if (!hero || frac < floor - 0.02) {
    count += 1;
    why.push(`photo area ${r3(frac)} below floor ${floor}`);
  }

  // non-bleeding text hard against the trim (outside the safe zone rule)
  for (const e of textEls) {
    if (e.onPhoto) continue;
    if (
      e.rect.x < SAFE - 0.06 || e.rect.x + e.rect.w > PAGE_W - SAFE + 0.06 ||
      e.rect.y < SAFE - 0.06 || e.rect.y + e.rect.h > PAGE_H - SAFE + 0.06
    ) {
      count += 1;
      why.push(`${e.type} inside the trim safe zone`);
      break;
    }
  }

  return { count, why };
}

// ── per-edition objectives ───────────────────────────────────────────────────

const OBJECTIVES = {
  "house-classic"(program) {
    const { hero, names, els } = parts(program);
    const m = program.editionMetrics || {};
    let s = 0;
    const heroFrac = hero ? (hero.rect.w * hero.rect.h) / (PAGE_W * PAGE_H) : 0;
    s += inRange(heroFrac, 0.78, 0.92, 8, 0.12);
    const bandFrac = Number.isFinite(m.bandFrac)
      ? m.bandFrac
      : hero ? (PAGE_H - (hero.rect.y + hero.rect.h)) / PAGE_H : 0;
    if (bandFrac > 0.001) s += inRange(bandFrac, 0.08, 0.12, 6, 0.06);
    // name aligned to the hero edge or centered
    const name = primaryName(names);
    if (name && hero) {
      const cx = name.rect.x + name.rect.w / 2;
      const centered = Math.abs(cx - PAGE_W / 2) <= 0.05;
      const edgeAligned = Math.abs(name.rect.x - Math.max(hero.rect.x, SAFE)) <= 0.05;
      if (centered || edgeAligned) s += 4;
    }
    s += atMost(els.filter((e) => e.type !== "colorPlane").length, 6, 4, 3);
    return s;
  },

  "the-strip"(program) {
    const m = program.editionMetrics || {};
    const { photos } = parts(program);
    let s = 0;
    s += inRange(m.heroFrac, 0.62, 0.72, 8, 0.08);
    const strip = photos.filter((e) => e.role === "strip");
    s += strip.length === 3 ? 8 : 0;
    return s;
  },

  "gallery-monograph"(program) {
    const m = program.editionMetrics || {};
    const { names } = parts(program);
    let s = 0;
    s += inRange(m.photoFrac, 0.42, 0.6, 7, 0.1);
    if (Number.isFinite(m.matBottom) && Number.isFinite(m.matTop) && m.matTop > 0) {
      s += atLeast(m.matBottom / m.matTop, 1.4, 5, 0.5);
    }
    s += inRange(m.matAsymmetry, 1.2, 2.2, 5, 0.5);
    const name = primaryName(names);
    if (name) {
      s += atMost(name.sizePt || 0, 22, 4, 6);
      s += atLeast(name.trackingEm || 0, 0.2, 4, 0.1);
    }
    s += inRange(m.whitespaceFrac, 0.35, 0.5, 5, 0.1);
    return s;
  },

  "editorial-masthead"(program) {
    const m = program.editionMetrics || {};
    let s = 0;
    s += atLeast(m.span, 0.86, 7, 0.1);
    s += inRange(m.bandFrac, 0.12, 0.2, 6, 0.06);
    s += atMost(m.seamGap, 0.12, 6, 0.08);
    s += atLeast(m.heroFrac, 0.6, 5, 0.1);
    return s;
  },

  "swiss-modernist"(program) {
    const m = program.editionMetrics || {};
    const { rules, textEls } = parts(program);
    let s = 0;
    // grid adherence: every rail element edge within 0.02in of a grid line
    if (Number.isFinite(m.module) && m.module > 0 && Number.isFinite(m.railTop)) {
      const onGrid = (y) => {
        const k = Math.round((y - m.railTop) / m.module);
        return Math.abs(y - (m.railTop + k * m.module)) <= 0.02 + 1e-6;
      };
      const railEls = [...rules, ...textEls].filter((e) =>
        Number.isFinite(m.railX0) && e.rect.x >= m.railX0 - 0.05 && e.rect.x <= (m.railX1 ?? PAGE_W) + 0.05);
      const snapped = railEls.filter((e) => onGrid(e.rect.y) || onGrid(e.rect.y + e.rect.h));
      if (railEls.length) s += 8 * (snapped.length / railEls.length);
    }
    s += atLeast(m.railUtilization, 0.6, 6, 0.35);
    const rc = Number.isFinite(m.ruleCount) ? m.ruleCount : rules.length;
    s += rc >= 1 && rc <= 3 ? 5 : 0;
    return s;
  },

  "cover-story"(program) {
    const m = program.editionMetrics || {};
    let s = 0;
    s += inRange(m.interlock, 0.12, 0.4, 9, 0.1);
    s += atLeast(m.nameAreaFrac, 0.18, 7, 0.12);
    s += atMost(m.maxGlyphOcclusion, 0.6, 4, 0.2);
    return s;
  },

  "ink-noir"(program) {
    const { textEls, rules } = parts(program);
    let s = 0;
    s += atMost(textEls.length, 5, 7, 3);
    s += rules.some((e) => e.variant === "frame") ? 6 : 0;
    return s;
  },

  duet(program) {
    const m = program.editionMetrics || {};
    let s = 0;
    s += inRange(m.cellRatio, 0.85, 1.18, 8, 0.2);
    s += atMost(m.sharedEdgeDelta ?? 0, 0.02, 6, 0.05);
    return s;
  },

  "studio-cutout"(program) {
    const m = program.editionMetrics || {};
    let s = 0;
    s += atLeast(m.matteInsetIn, 0.25, 7, 0.2);
    s += atMost(m.nameSubjectOverlap, 0.05, 7, 0.1);
    if (m.planeTone) s += 3; // palette-pulled plane, contrast pre-verified
    return s;
  },
};

// structure-keyed fallback when the edition id is unknown to this build
const BY_STRUCTURE = {
  masthead: OBJECTIVES["editorial-masthead"],
  "column-grid": OBJECTIVES["swiss-modernist"],
  "cover-story": OBJECTIVES["cover-story"],
  diptych: OBJECTIVES.duet,
  "filmstrip-foot": OBJECTIVES["the-strip"],
  cutout: OBJECTIVES["studio-cutout"],
  matted: OBJECTIVES["gallery-monograph"],
  "photo-dominant": OBJECTIVES["house-classic"],
};

/**
 * Score an edition program. Higher is better; deterministic.
 * @param {object} program — must carry edition metadata (editionMetrics)
 * @param {object} ctx — the front-program ctx ({ edition: { def } })
 */
function scoreEditionProgram(program, ctx) {
  let score = 50;
  score += universalSoft(program);

  const id = program.edition || ctx?.edition?.def?.id || null;
  const objective = (id && OBJECTIVES[id]) || BY_STRUCTURE[program.structure] || null;
  if (objective) score += objective(program, ctx);

  const v = vetoes(program, ctx);
  score -= v.count * VETO;
  return r3(score);
}

module.exports = {
  scoreEditionProgram,
  universalSoft,
  vetoes,
  OBJECTIVES,
  inRange,
  atLeast,
  atMost,
};
