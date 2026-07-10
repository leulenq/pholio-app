/**
 * Comp Card EDITIONS — the living design system's top level (v7).
 *
 * An edition is a complete, named art direction: composition logic, image
 * hierarchy, typography behavior (voice pool + lockup grammar + scale
 * culture), palette program, negative-space strategy, ornament grammar,
 * editorial tone, and a back-page program. Editions exist because parameter
 * jitter inside one aesthetic converges — for one talent the tone vector,
 * voice cast, and palette were effectively constant, so "another take" only
 * moved the name. A new take must be a different creative program, not a
 * re-roll of the same sampler.
 *
 * Spec: tasks/comp-card-editions-spec.md (v7 — includes the debate rounds
 * that shaped this catalog; notably the Booker's audit that killed the
 * proof-sheet front and turned the poster front into the matte-gated
 * cover-story interlock).
 *
 * Contract:
 * - `resolveEdition(input)` — suitability-gated, tone- and photo-affinity
 *   weighted, seeded draw; `avoidEditions` guarantees take-to-take cycling;
 *   `force` pins.
 * - Suitability gates are honest capabilities (pool size, alpha matte,
 *   pairable aspects, kids) — never taste. Taste enters only as weights,
 *   floored at 0.35, so nothing suitable is ever eliminated.
 * - Photographs are never altered (no duotone/filters) — industry rule.
 * - The Booker's law (universal front invariants) is enforced by the
 *   validators regardless of edition: unobstructed face, contrast-verified
 *   name ≥ 14pt effective, hero presence floor, stats on front only under
 *   the researched rule, booking block on the back.
 */

const INK_FIELD_PAPER = "#141210";
const INK_FIELD_INK = "#F4F1EC";
const INK_FIELD_MUTED = "#B9B3AB";
const INK_FIELD_RULE = "#3A3733";
const INK_FIELD_ACCENT = "#C9A55A"; // gold on night paper — house signature

/** Booker's-law hero presence floors (fraction of page area). */
const HERO_AREA_FLOOR = 0.5;
const HERO_AREA_FLOOR_DEEP_MAT = 0.42;

/**
 * The catalog. Order is presentation order for the dashboard; ids are
 * stable (persisted on saved cards).
 *
 * Distinctness contract (test-enforced): every pair of editions differs on
 * at least 3 of 6 axes — structure, image hierarchy, type scale culture,
 * palette, ornament grammar, back chrome. An edition that fails the matrix
 * fails CI; that is the anti-collapse mechanism.
 *
 * Fields:
 * - structures: seeded-draw weights over front field structures (the front
 *   program filters infeasible ones and renormalizes).
 * - lockups: name-lockup grammar pool (inline | stacked | contrast | spine
 *   | initial-line) the take draws from.
 * - scale: name point bounds + tracking bias (−1 tight … +1 wide) +
 *   stacking appetite.
 * - palette: palette program id resolved by resolveEditionPalette.
 * - voices: font-library voice-id pool (cast stays tone+seed within it).
 * - ornaments: earned decoration grammar (most editions carry none).
 * - back: architecture pool + chrome style consumed by the back program
 *   and template. statsStyle: column | strip | tabular | footline.
 * - needs: hard suitability gates.
 * - toneWeight(tone) / photoAffinity(ctx): multiplicative ranking weights.
 */
const EDITIONS = Object.freeze([
  {
    id: "house-classic",
    label: "The Standard",
    tone: "The industry card — one strong frame, a clean name band, a working back.",
    // v10: house-classic is the photo-dominant edition, full stop — its
    // matted mode shaded into gallery-monograph territory (red team P1-4).
    structures: { "photo-dominant": 1 },
    treatmentsOpen: true, // name choreography (straddle/over/band/inset) may sample
    lockups: ["inline", "contrast"],
    voices: ["editorial-serif", "quiet-classic"],
    palette: "auto",
    scale: { minPt: 20, maxPt: 38, trackingBias: 0, stackBias: 0.3 },
    ornaments: [],
    back: {
      pool: ["uniform-grid", "feature-column", "feature-row", "mosaic"],
      style: { nameAlign: "left", statsStyle: "auto", dividers: false, cellIndexes: false },
    },
    needs: {},
    toneWeight: (t) => 1 + 0.3 * t.warmth,
  },
  {
    id: "the-strip",
    label: "The Strip",
    tone: "The working commercial card — a full hero over a three-frame strip.",
    // Rebuilt from the failed fresh-commercial concept (red team P0): the
    // real premium commercial format — hero + front filmstrip — instead of
    // house-classic with title case. Warmth is styling, not the identity.
    structures: { "filmstrip-foot": 1 },
    treatmentsOpen: false,
    lockups: ["inline", "contrast"],
    voices: ["clean-modern", "modern-warm"],
    palette: "paper-warm",
    scale: { minPt: 20, maxPt: 32, trackingBias: 0, stackBias: 0.2 },
    ornaments: [],
    back: {
      pool: ["uniform-grid", "feature-row"],
      style: { nameAlign: "left", statsStyle: "strip", dividers: false, cellIndexes: false },
    },
    needs: { minImages: 4 }, // hero + three strip frames
    toneWeight: (t) => 0.9 + 0.5 * t.warmth,
  },
  {
    id: "gallery-monograph",
    label: "The Monograph",
    tone: "Museum register — deep mats, caption typography, air as material.",
    structures: { matted: 1 },
    treatmentsOpen: false,
    lockups: ["initial-line", "inline"],
    voices: ["hairline-fashion", "quiet-classic", "romantic-didone"],
    palette: "paper-ivory",
    scale: { minPt: 15, maxPt: 22, trackingBias: 0.8, stackBias: 0.15 },
    ornaments: ["keyline", "folio"],
    matDepth: 1.5, // deep-mat multiplier consumed by the matted builder
    heroAreaFloor: HERO_AREA_FLOOR_DEEP_MAT,
    back: {
      pool: ["restrained-duo", "feature-column"],
      style: { nameAlign: "center", statsStyle: "footline", dividers: false, cellIndexes: false, airy: true },
    },
    needs: { minImages: 3 },
    toneWeight: (t) => 0.7 + 0.7 * t.formality,
    photoAffinity: (ctx) => (ctx.heroQuiet >= 0.4 ? 1.15 : 1),
  },
  {
    id: "editorial-masthead",
    label: "The Masthead",
    tone: "Magazine logic — the name set as a masthead, the photograph under it.",
    structures: { masthead: 1 },
    treatmentsOpen: false,
    lockups: ["stacked", "contrast", "inline"],
    voices: ["romantic-didone", "editorial-serif"],
    palette: "auto",
    scale: { minPt: 40, maxPt: 76, trackingBias: -0.4, stackBias: 0.6 },
    ornaments: ["folio"],
    back: {
      pool: ["feature-row", "editorial-stagger", "uniform-grid"],
      style: { nameAlign: "center", statsStyle: "strip", dividers: false, cellIndexes: false },
    },
    needs: {},
    toneWeight: (t) => 0.8 + 0.5 * t.energy + 0.3 * t.formality,
  },
  {
    id: "swiss-modernist",
    label: "The Grid",
    tone: "Structural — a visible modular grid, grotesque type, a spine rail.",
    structures: { "column-grid": 1 },
    treatmentsOpen: false,
    lockups: ["spine", "inline"],
    voices: ["stark-grotesque", "bold-grotesque"],
    palette: "paper-white",
    scale: { minPt: 18, maxPt: 30, trackingBias: 0.3, stackBias: 0.2 },
    ornaments: ["rules", "folio"],
    back: {
      pool: ["uniform-grid", "filmstrip"],
      style: { nameAlign: "left", statsStyle: "tabular", dividers: true, cellIndexes: false },
    },
    needs: {},
    toneWeight: (t) => 0.7 + 0.6 * t.formality + 0.2 * t.density,
  },
  {
    id: "cover-story",
    label: "The Cover Story",
    tone: "Display type layered behind the figure — the magazine-cover interlock.",
    structures: { "cover-story": 1 },
    treatmentsOpen: false,
    lockups: ["stacked", "inline"],
    voices: ["stark-grotesque", "bold-grotesque"],
    palette: "auto",
    scale: { minPt: 56, maxPt: 110, trackingBias: -0.6, stackBias: 1 },
    ornaments: [],
    back: {
      pool: ["feature-column", "mosaic", "uniform-grid"],
      style: { nameAlign: "left", statsStyle: "column", dividers: false, cellIndexes: false },
    },
    needs: { alphaMatte: true },
    toneWeight: (t) => 0.6 + 0.9 * t.energy,
  },
  {
    id: "ink-noir",
    label: "The Night Edition",
    tone: "Dark paper, reversed type, gold that finally sings.",
    structures: { "photo-dominant": 2, matted: 1.5 },
    treatmentsOpen: true,
    lockups: ["inline", "contrast"],
    voices: ["hairline-fashion", "romantic-didone", "stark-grotesque"],
    palette: "ink-field",
    scale: { minPt: 22, maxPt: 40, trackingBias: 0.4, stackBias: 0.3 },
    ornaments: [],
    back: {
      pool: ["feature-column", "restrained-duo", "uniform-grid"],
      style: { nameAlign: "left", statsStyle: "column", dividers: false, cellIndexes: false, reversed: true },
    },
    needs: { notKids: true },
    // Weighted low by default; the dark register must be an intentional
    // pick or a rare draw — and the photographs must be able to carry it.
    toneWeight: (t) => 0.45 + 0.45 * t.formality + 0.15 * (1 - t.warmth),
    photoAffinity: (ctx) => {
      // dark or studio-quiet heroes carry a night card; bright warm
      // location shots do not.
      if (!Number.isFinite(ctx.heroLuma)) return 0.85;
      if (ctx.heroLuma <= 0.38) return 1.5;
      if (ctx.heroLuma >= 0.62) return 0.55;
      return 0.9;
    },
  },
  {
    id: "duet",
    label: "The Diptych",
    tone: "Two frames on a hinge — a face and a figure, read together.",
    structures: { diptych: 1 },
    treatmentsOpen: false,
    lockups: ["inline", "contrast"],
    voices: ["editorial-serif", "modern-warm", "quiet-classic"],
    palette: "auto",
    scale: { minPt: 18, maxPt: 30, trackingBias: 0.1, stackBias: 0.2 },
    ornaments: ["hinge-rule"],
    back: {
      pool: ["restrained-duo", "feature-row", "uniform-grid"],
      style: { nameAlign: "center", statsStyle: "strip", dividers: false, cellIndexes: false },
    },
    needs: { pairableSupport: true },
    toneWeight: (t) => 0.8 + 0.4 * t.warmth,
  },
  {
    id: "studio-cutout",
    label: "The Cutout",
    tone: "The figure lifted onto a flat plane, type in the silhouette's negative space.",
    structures: { cutout: 1 },
    treatmentsOpen: false,
    lockups: ["inline", "stacked"],
    voices: ["bold-grotesque", "modern-warm"],
    palette: "auto",
    scale: { minPt: 24, maxPt: 44, trackingBias: -0.2, stackBias: 0.5 },
    ornaments: [],
    back: {
      pool: ["uniform-grid", "feature-column"],
      style: { nameAlign: "left", statsStyle: "column", dividers: false, cellIndexes: false },
    },
    needs: { alphaMatte: true },
    toneWeight: (t) => 0.7 + 0.6 * t.energy,
  },
]);

const EDITIONS_BY_ID = Object.freeze(
  Object.fromEntries(EDITIONS.map((e) => [e.id, e])),
);

// ── PRNG (selector-compatible, attribution: comp-card-selector.js) ─────────

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

function clamp01(n) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
}

// ── suitability ─────────────────────────────────────────────────────────────

/**
 * Kids draw pool (v10): kids is a GATING PROFILE, not an edition — the
 * catalog restricts to warm, safe programs and the existing guardian-
 * contact + tone clamps do the rest. (Red team P0: without this, kids
 * inherited the full adult catalog minus noir.)
 */
const KIDS_POOL = Object.freeze(["house-classic", "the-strip", "duet", "studio-cutout"]);

/**
 * Photo-affinity gate threshold (v10): below this, the hero's measured
 * pixels cannot honestly carry the edition (e.g. a bright warm location
 * hero on a night card) — a CAPABILITY, exactly like the matte gate, so
 * it removes the candidate instead of merely down-weighting it. Above
 * the threshold, affinity multiplies the ranking weight as before.
 */
const AFFINITY_GATE = 0.6;

/**
 * Hard gates only — an unsuitable edition is one the engine cannot honor
 * honestly (not one the talent's tone merely disfavors).
 *
 * ctx: { poolSize, hasAlphaMatte, kids, hasPairableSupport }
 */
function isSuitable(edition, ctx = {}) {
  const needs = edition.needs || {};
  const poolSize = Number.isFinite(ctx.poolSize) ? ctx.poolSize : 0;
  if (needs.minImages && poolSize < needs.minImages) return false;
  if (needs.alphaMatte && !ctx.hasAlphaMatte) return false;
  if (needs.notKids && ctx.kids) return false;
  if (needs.pairableSupport && !ctx.hasPairableSupport) return false;
  if (ctx.kids && !KIDS_POOL.includes(edition.id)) return false;
  return true;
}

/**
 * Available editions for a talent (dashboard catalog + resolver input).
 */
function listEditions(ctx = {}) {
  return EDITIONS.map((e) => ({
    id: e.id,
    label: e.label,
    tone: e.tone,
    available: isSuitable(e, ctx),
  }));
}

function getEdition(id) {
  return EDITIONS_BY_ID[id] || null;
}

function isEditionId(id) {
  return Boolean(EDITIONS_BY_ID[id]);
}

// ── resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the edition for a take.
 *
 * @param {object} input — {
 *   seed, identity, force (edition id), avoidEditions (string[]),
 *   toneVector { formality, energy, warmth, density },
 *   poolSize, hasAlphaMatte, kids, hasPairableSupport,
 *   heroLuma (0..1 mean luma of the hero), heroQuiet (0..1 max quiet-band
 *   score) — photo-affinity signals; absent signals are neutral }
 * @returns {{ edition, because, available: string[] }}
 */
function resolveEdition(input = {}) {
  const {
    seed,
    identity = "",
    force = null,
    avoidEditions = [],
    toneVector = {},
    poolSize = 0,
    hasAlphaMatte = false,
    kids = false,
    hasPairableSupport = false,
    heroLuma = null,
    heroQuiet = null,
  } = input;

  const ctx = { poolSize, hasAlphaMatte, kids, hasPairableSupport };
  const suitable = EDITIONS.filter((e) => isSuitable(e, ctx));
  const available = suitable.map((e) => e.id);

  if (force && EDITIONS_BY_ID[force]) {
    if (suitable.some((e) => e.id === force)) {
      return {
        edition: EDITIONS_BY_ID[force],
        because: `edition '${force}' pinned`,
        available,
      };
    }
    // pinned but unsuitable — fall through to the draw; the caller logs it
  }

  if (!suitable.length) {
    // catalog invariant: house-classic has no needs — unreachable, but the
    // engine must never throw over a catalog bug
    return {
      edition: EDITIONS_BY_ID["house-classic"],
      because: "no suitable edition (catalog fault) — house-classic fallback",
      available,
    };
  }

  const tone = {
    formality: clamp01(toneVector.formality),
    energy: clamp01(toneVector.energy),
    warmth: clamp01(toneVector.warmth),
    density: clamp01(toneVector.density),
  };
  const affinityCtx = {
    heroLuma: Number.isFinite(Number(heroLuma)) ? Number(heroLuma) : NaN,
    heroQuiet: Number.isFinite(Number(heroQuiet)) ? Number(heroQuiet) : 0,
  };
  const affinityOf = (e) => (e.photoAffinity ? e.photoAffinity(affinityCtx) : 1);

  // Photo-affinity GATE (v10): pixels that measurably cannot carry an
  // edition remove it — a capability, like the matte gate — unless that
  // would empty the pool entirely.
  let pool = suitable.filter((e) => affinityOf(e) >= AFFINITY_GATE);
  if (!pool.length) pool = suitable;

  // Cycling contract (v10): avoidEditions is ordered MOST-RECENT-FIRST.
  // Effective avoid depth is clamped to pool−1 so avoidance can never
  // empty the pool; the immediate predecessor is ALWAYS excluded when the
  // pool has ≥ 2 members (red team P0: the old fallback readmitted the
  // just-served edition, making "New direction" a coin flip on small pools).
  const avoidList = (Array.isArray(avoidEditions) ? avoidEditions : [avoidEditions])
    .filter(Boolean)
    .map(String);
  const effectiveAvoid = new Set(avoidList.slice(0, Math.max(0, pool.length - 1)));
  let candidates = pool.filter((e) => !effectiveAvoid.has(e.id));
  if (!candidates.length && avoidList.length && pool.length > 1) {
    candidates = pool.filter((e) => e.id !== avoidList[0]);
  }
  if (!candidates.length) candidates = pool;

  // Ranking: tone biases the draw among survivors; affinity multiplies
  // above the gate. The 0.35 floor keeps ranking from eliminating.
  const weights = candidates.map((e) =>
    Math.max(0.35, (e.toneWeight ? e.toneWeight(tone) : 1) * affinityOf(e)),
  );
  const rng = createMulberry32(
    seedToUint32(`${seed ?? "auto"}:edition:${identity}`),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let pick = candidates[0];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = candidates[i];
      break;
    }
  }
  return {
    edition: pick,
    because: `seeded draw over ${candidates.length} candidate(s) of ${suitable.length} suitable${effectiveAvoid.size ? ` (avoiding ${[...effectiveAvoid].join(", ")})` : ""}, affinity-gated, tone-weighted`,
    available,
  };
}

// ── palette programs ────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function srgbLinear(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (
    0.2126 * srgbLinear(rgb.r / 255) +
    0.7152 * srgbLinear(rgb.g / 255) +
    0.0722 * srgbLinear(rgb.b / 255)
  );
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return 1;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The ink-field paper: prefer a deep tone pulled from the hero's own palette
 * (darkened until INK_FIELD_INK clears 7:1 on it — print-safe headroom on
 * dark stock), else the house near-black. Never pure #000 (ink coverage).
 */
function deriveInkFieldPaper(heroForensics) {
  const palette = Array.isArray(heroForensics?.palette) ? heroForensics.palette : [];
  const candidate = palette.find(
    (c) => c && typeof c.hex === "string" && c.sat >= 0.05 && c.luma > 0.04 && c.luma < 0.6,
  );
  if (!candidate) return { paper: INK_FIELD_PAPER, source: "house night paper" };
  const rgb = hexToRgb(candidate.hex);
  if (!rgb) return { paper: INK_FIELD_PAPER, source: "house night paper" };
  let { r, g, b } = rgb;
  for (let i = 0; i < 30; i++) {
    const hex = `#${[r, g, b]
      .map((v) => Math.round(Math.max(8, v)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
    if (contrastRatio(INK_FIELD_INK, hex) >= 7) {
      return { paper: hex, source: `hero-pulled night paper (${candidate.hex})` };
    }
    r *= 0.82;
    g *= 0.82;
    b *= 0.82;
  }
  return { paper: INK_FIELD_PAPER, source: "house night paper (derivation muddy)" };
}

/**
 * Resolve an edition's palette program to a concrete verified palette, or
 * null to keep design-language's default (auto) behavior.
 *
 * @returns {null | { paper, ink, muted, rule, accent, dark, source }}
 *   accent null = keep the hero-derived accent from design-language.
 */
function resolveEditionPalette(edition, { heroForensics } = {}) {
  if (!edition) return null;
  switch (edition.palette) {
    case "paper-white":
      return { paper: "#FFFFFF", ink: "#111111", muted: "#5C5C5C", rule: "#D9D9D9", accent: null, dark: false, source: "edition paper-white" };
    case "paper-ivory":
      return { paper: "#FFFEFA", ink: "#1A1815", muted: "#6B6560", rule: "#E2DED6", accent: null, dark: false, source: "edition paper-ivory" };
    case "paper-warm":
      return { paper: "#FAF8F5", ink: "#1A1815", muted: "#6B6560", rule: "#E2DED6", accent: null, dark: false, source: "edition paper-warm" };
    case "ink-field": {
      const { paper, source } = deriveInkFieldPaper(heroForensics);
      return {
        paper,
        ink: INK_FIELD_INK,
        muted: INK_FIELD_MUTED,
        rule: INK_FIELD_RULE,
        accent: INK_FIELD_ACCENT,
        dark: true,
        source,
      };
    }
    case "auto":
    default:
      return null;
  }
}

module.exports = {
  EDITIONS,
  EDITIONS_BY_ID,
  listEditions,
  getEdition,
  isEditionId,
  isSuitable,
  resolveEdition,
  resolveEditionPalette,
  deriveInkFieldPaper,
  contrastRatio,
  INK_FIELD_PAPER,
  INK_FIELD_INK,
  HERO_AREA_FLOOR,
  HERO_AREA_FLOOR_DEEP_MAT,
  KIDS_POOL,
  AFFINITY_GATE,
};
