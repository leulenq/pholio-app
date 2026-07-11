/**
 * Design-language synthesizer (atelier engine v2).
 *
 * Produces the continuous visual parameters of a comp card from the talent's
 * actual data — archetype scores, vision/casting analysis, category, and the
 * hero image's measured pixels (forensics). There are no tone enums or
 * variant lists: every axis is a number inside hard taste bounds, so each
 * talent lands at a genuinely distinct point in the design space while the
 * output stays inside the brand.
 *
 * Contract: tasks/comp-card-atelier-spec.md §C.
 *
 * Axes:
 * - toneVector { formality, energy, warmth, density } ∈ [0,1]⁴ — computed
 *   from archetype scores (runway/editorial → formality, commercial/
 *   lifestyle → warmth, fitness/athletic → energy), casting-analysis text,
 *   and the stats category (kids clamps formality ≤ 0.45, warmth ≥ 0.6).
 *   A small seeded jitter (±0.05) separates near-identical talents; AI
 *   advice may nudge each axis by at most ±0.15 (clamped, logged).
 * - typeScale ratio ∈ {1.2, 1.25, 1.333, 1.414, 1.5, 1.618} — formality
 *   picks the register (higher formality → larger ratio, fewer levels).
 * - name treatment — case/weight/tracking continuous; the point size is
 *   SOLVED from the band geometry: size = (targetSpan · bandW · 72) /
 *   (chars · (glyphEm + trackingEm)), clamped 17–34pt. Glyph width
 *   constants: 0.58em for Inter caps, 0.52em for serif title case.
 * - palette — paper from hero warmth ({pure, ivory, warm} whites only); ink
 *   in the house near-black range; accent DERIVED from the hero photo's
 *   dominant palette (saturation clamped ≤ 0.38, darkened until WCAG
 *   contrast vs paper ≥ 4.5:1), falling back to brand gold when the photo
 *   yields nothing usable.
 * - statsPlacement — back by default; a single front stat line only under
 *   the researched rule: formality ≥ 0.7 AND hero bottom quiet ≥ 0.55 AND
 *   seeded draw < 0.15 (or an explicit override). Always logged.
 */

const {
  resolveVoice,
  advanceEm,
  resolveWeight,
} = require("./font-library");
const { nameAdvanceEm } = require("./perception/font-files");
const {
  resolveEditionPalette,
  REGISTER_QUIET_MAX_MIN_PT,
  REGISTER_DISPLAY_MIN_MAX_PT,
} = require("./editions");

const TYPE_RATIOS = [1.2, 1.25, 1.333, 1.414, 1.5, 1.618];
const PAPERS = { pure: "#FFFFFF", ivory: "#FFFEFA", warm: "#FAF8F5" };
const BRAND_GOLD_WARM = "#B8956A";
const BRAND_GOLD_NEUTRAL = "#C9A55A";
const NAME_PT_MIN = 17;
const NAME_PT_MAX = 34;
const FRONT_STAT_LINE_P = 0.15;
const FRONT_STAT_QUIET_MIN = 0.55;

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

// ── color utilities ─────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }) {
  const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  if (la == null || lb == null) return 1;
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Derive a print-safe accent from the hero photo's dominant palette:
 * usable candidate → clamp saturation ≤ 0.38 → darken until contrast vs
 * paper ≥ 4.5:1. Brand gold fallback when the photo yields nothing usable.
 */
function deriveAccent(heroForensics, paper, warmth) {
  // The brand-gold fallback passes the SAME contrast gate as derived
  // accents (audit P0: raw #C9A55A is ~2.2–2.3:1 on the papers, shipped on
  // 5.4–7pt labels). Darken along the same loop until ≥ 4.5:1.
  const gateFallback = () => {
    const raw = warmth > 0.15 ? BRAND_GOLD_WARM : BRAND_GOLD_NEUTRAL;
    if (contrastRatio(raw, paper) >= 4.5) return raw;
    const rgb = hexToRgb(raw);
    if (!rgb) return raw;
    const hsl = rgbToHsl(rgb);
    for (let i = 0; i < 40; i++) {
      const hex = rgbToHex(hslToRgb(hsl));
      if (contrastRatio(hex, paper) >= 4.5) return hex;
      hsl.l = Math.max(0.1, hsl.l - 0.02);
    }
    return rgbToHex(hslToRgb(hsl));
  };
  const palette = Array.isArray(heroForensics?.palette) ? heroForensics.palette : [];
  const candidate = palette.find(
    (c) => c && typeof c.hex === "string" && c.sat >= 0.06 && c.luma > 0.08 && c.luma < 0.85,
  );
  if (!candidate) return { accent: gateFallback(), source: "brand-gold-fallback" };

  const rgb = hexToRgb(candidate.hex);
  if (!rgb) return { accent: gateFallback(), source: "brand-gold-fallback" };
  const hsl = rgbToHsl(rgb);
  hsl.s = Math.min(hsl.s, 0.38);

  for (let i = 0; i < 40; i++) {
    const hex = rgbToHex(hslToRgb(hsl));
    if (contrastRatio(hex, paper) >= 4.5) {
      return { accent: hex, source: `hero-palette ${candidate.hex}` };
    }
    hsl.l = Math.max(0.1, hsl.l - 0.02);
    if (hsl.l <= 0.1 && contrastRatio(rgbToHex(hslToRgb(hsl)), paper) < 4.5) break;
  }
  const final = rgbToHex(hslToRgb(hsl));
  if (contrastRatio(final, paper) >= 4.5) {
    return { accent: final, source: `hero-palette ${candidate.hex}` };
  }
  return { accent: gateFallback(), source: "brand-gold-fallback (derivation muddy)" };
}

// ── tone vector ─────────────────────────────────────────────────────────────

function clamp01(n) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

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

function archetypeScores(archetype) {
  const src =
    archetype && typeof archetype === "object"
      ? archetype.scores || archetype
      : {};
  const norm = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n > 1 ? clamp01(n / 100) : clamp01(n);
  };
  return {
    runway: norm(src.runway),
    editorial: norm(src.editorial),
    commercial: norm(src.commercial),
    lifestyle: norm(src.lifestyle),
  };
}

function signalText({ archetype, castingAnalysis }) {
  const parts = [];
  if (typeof archetype === "string") parts.push(archetype);
  if (archetype && typeof archetype === "object") {
    parts.push(archetype.label, archetype.archetype_label);
  }
  const ca = parseJsonish(castingAnalysis);
  parts.push(ca.lookType);
  if (Array.isArray(ca.marketSignals)) parts.push(...ca.marketSignals);
  if (Array.isArray(ca.bookingStrengths)) parts.push(...ca.bookingStrengths);
  return parts
    .filter((p) => typeof p === "string" && p.trim())
    .join(" ")
    .toLowerCase();
}

/**
 * Continuous tone vector from talent data (no enum buckets).
 */
function computeToneVector({ archetype, castingAnalysis, statsBlock, poolSize = 4 }) {
  const scores = archetypeScores(archetype);
  const text = signalText({ archetype, castingAnalysis });
  const has = (re) => re.test(text);

  let formality = 0.5;
  let energy = 0.42;
  let warmth = 0.45;

  if (scores.runway != null) formality += 0.42 * scores.runway;
  if (scores.editorial != null) formality += 0.3 * scores.editorial;
  if (scores.commercial != null) warmth += 0.4 * scores.commercial;
  if (scores.lifestyle != null) {
    warmth += 0.25 * scores.lifestyle;
    energy += 0.15 * scores.lifestyle;
  }
  if (has(/runway|high[\s-]?fashion/)) formality += 0.3;
  if (has(/editorial/)) formality += 0.18;
  if (has(/commercial|lifestyle|beauty/)) warmth += 0.2;
  if (has(/fitness|athletic|sport/)) {
    energy += 0.45;
    formality -= 0.1;
  }
  // Formal registers are cooler; warm registers less formal.
  formality -= 0.12 * clamp01(warmth - 0.5);
  warmth -= 0.1 * clamp01(formality - 0.6);

  let density = 0.35 + 0.3 * clamp01(energy) + 0.04 * (poolSize - 4);

  if (statsBlock?.category === "kids") {
    formality = Math.min(formality, 0.45);
    warmth = Math.max(warmth, 0.6);
    energy = Math.max(energy, 0.5);
  }
  if (statsBlock?.isFitness) energy = Math.max(energy, 0.7);

  return {
    formality: clamp01(formality),
    energy: clamp01(energy),
    warmth: clamp01(warmth),
    density: clamp01(density),
  };
}

// ── name sizing ─────────────────────────────────────────────────────────────

/**
 * Solve the name point size so the tracked name spans `targetSpan` of the
 * band width. widthIn · targetSpan = chars · (glyphEm + trackingEm) · pt/72.
 * `clamp: false` returns the raw fit — callers use it to detect names that
 * cannot fit at the floor (flooring up GUARANTEES overflow; the director
 * degrades tracking / stacks the name instead).
 */
function solveNameSizePt({ text, bandWidthIn, targetSpan, trackingEm, glyphEm, clamp = true }) {
  const chars = Math.max(1, String(text || "").replace(/\s+/g, " ").trim().length);
  const widthPt = bandWidthIn * targetSpan * 72;
  const pt = widthPt / (chars * (glyphEm + trackingEm));
  if (!clamp) return Math.round(pt * 10) / 10;
  return Math.round(Math.min(NAME_PT_MAX, Math.max(NAME_PT_MIN, pt)) * 10) / 10;
}

// ── synthesizer ─────────────────────────────────────────────────────────────

/**
 * @param {object} input — { profile, archetype, castingAnalysis, statsBlock,
 *   poolAnalysis, heroForensics, seed, salt, advice, overrides, edition,
 *   operators }
 *
 * EDITIONS THREADING (opt-in): when `edition` (a resolved catalog def from
 * editions.js) is present, the language is set inside that edition's
 * program — voice cast restricted to `edition.voices`, tracking biased by
 * `edition.scale.trackingBias` inside the voice's own bounds, the palette
 * mapped from the `operators.field` axis (dark → verified ink-field
 * program; warm/paper → the corresponding paper program with a re-gated
 * accent; plane → default palette kept + `field: 'plane'` flag for the
 * front program), and `language.scale = { minPt, maxPt, register }`
 * exposed for the director's name-solve clamps. Without an edition the
 * output is byte-identical to the legacy synthesizer (regression-tested).
 *
 * @returns {object} DesignLanguage (spec §C)
 */
function synthesizeDesignLanguage(input = {}) {
  const {
    profile = {},
    archetype = null,
    castingAnalysis = null,
    statsBlock = null,
    poolAnalysis = null,
    heroForensics = null,
    seed,
    salt = "language",
    advice = null,
    brief = null, // art-director design brief (validated upstream)
    overrides = null,
    direction = null, // pinned creative direction — salts the voice cast so
    // each direction carries its own typographic identity (same seed, same
    // talent, different register per direction)
    avoidVoice = null, // the previous take's voice — excluded from the cast
    edition = null, // resolved edition def (editions.js catalog entry)
    operators = null, // { field, register } from resolveOperators
  } = input;

  const decisions = [];
  const warnings = [];
  const decide = (aspect, choice, because) => decisions.push({ aspect, choice, because });
  const identity = profile.slug || profile.id || `${profile.first_name || ""}-${profile.last_name || ""}`;
  const rng = createMulberry32(seedToUint32(`${seed ?? "auto"}:${salt}:${identity}`));

  // 1. Tone vector. An art-director brief is AUTHORITATIVE for the taste
  // axes (adopted directly, no jitter); otherwise the deterministic
  // computation + seeded jitter + legacy advice nudges apply. Category
  // clamps (kids/fitness) hold in both paths.
  const poolSize = Array.isArray(poolAnalysis?.pool) ? poolAnalysis.pool.length : 4;
  let tone;
  const briefTone =
    brief && brief.tone && ["formality", "energy", "warmth", "density"].every(
      (axis) => Number.isFinite(Number(brief.tone[axis])),
    )
      ? brief.tone
      : null;
  if (briefTone) {
    tone = {
      formality: clamp01(Number(briefTone.formality)),
      energy: clamp01(Number(briefTone.energy)),
      warmth: clamp01(Number(briefTone.warmth)),
      density: clamp01(Number(briefTone.density)),
    };
    if (statsBlock?.category === "kids") {
      tone.formality = Math.min(tone.formality, 0.45);
      tone.warmth = Math.max(tone.warmth, 0.6);
    }
    if (statsBlock?.isFitness) tone.energy = Math.max(tone.energy, 0.7);
    decide("tone-source", "art-director brief", brief.rationale || "authored design brief");
  } else {
    tone = computeToneVector({ archetype, castingAnalysis, statsBlock, poolSize });
    for (const axis of ["formality", "energy", "warmth", "density"]) {
      tone[axis] = clamp01(tone[axis] + (rng() * 2 - 1) * 0.05);
    }
  }
  if (!briefTone && advice && advice.tone) {
    const NUDGES = {
      "high-fashion": { formality: +0.15, warmth: -0.1 },
      "editorial-classic": { formality: +0.08 },
      "commercial-warm": { warmth: +0.15, formality: -0.1 },
      "fitness-bold": { energy: +0.15 },
      "kids-bright": { warmth: +0.15, formality: -0.15 },
    };
    const nudge = NUDGES[advice.tone];
    if (nudge && statsBlock?.category !== "kids") {
      for (const [axis, delta] of Object.entries(nudge)) {
        tone[axis] = clamp01(tone[axis] + Math.max(-0.15, Math.min(0.15, delta)));
      }
      decide("advice.tone", advice.tone, "advisor register accepted as a ±0.15 tone nudge");
    } else if (nudge) {
      decide("advice.tone", "ignored", "kids category locks the tone vector");
    } else {
      decide("advice.tone", "ignored", `'${advice.tone}' is not a known register`);
    }
  }
  decide(
    "tone-vector",
    `formality ${tone.formality.toFixed(2)} energy ${tone.energy.toFixed(2)} warmth ${tone.warmth.toFixed(2)} density ${tone.density.toFixed(2)}`,
    "computed from archetype scores, casting analysis, category; seeded jitter ±0.05",
  );

  // 2. Type system.
  const ratioIndex = Math.min(
    TYPE_RATIOS.length - 1,
    Math.max(0, Math.round(tone.formality * (TYPE_RATIOS.length - 1) + (rng() - 0.5))),
  );
  const ratio = TYPE_RATIOS[ratioIndex];
  const basePt = 7 + tone.density * 1.5; // stat value size seedbed
  const typeScale = {
    ratio,
    basePt: Math.round(basePt * 10) / 10,
    statValue: Math.round(basePt * 10) / 10,
    statLabel: Math.round(basePt * 0.82 * 10) / 10,
    contact: Math.round(basePt * 0.9 * 10) / 10,
  };
  decide("type-scale", `ratio ${ratio}`, "formality-biased register on the classic scale ratios");

  // 3. Typography voice from the font library: the brief may request a
  // voice by id (validated, kids-vetoed); otherwise the voice is cast from
  // the tone vector's affinity distance with a seeded tie-break.
  const kids = statsBlock?.category === "kids";
  const { voiceId, voice, because: voiceBecause } = resolveVoice(tone, {
    seed: `${seed ?? "auto"}:${salt}:${identity}${direction ? `:dir-${direction}` : ""}${edition ? `:ed-${edition.id}` : ""}`,
    salt: "voice",
    requested: brief?.typographyVoice || null,
    kids,
    avoid: avoidVoice,
    // edition voice pool: the cast stays tone+seed WITHIN the pool (kids
    // vetoes apply on top; an emptied pool is ignored inside resolveVoice)
    pool: edition && Array.isArray(edition.voices) ? edition.voices : null,
  });
  decide("typography-voice", voiceId, voiceBecause);
  const display = voice.display;
  const nameCase = voice.nameCase;

  const first = String(profile.first_name || "").trim();
  const last = String(profile.last_name || "").trim();
  const text = `${first} ${last}`.trim() || "Untitled Talent";

  // Tracking inside the voice's own bounds, positioned by formality + seed.
  // An active edition applies its tracking bias (−1 tight … +1 wide) INSIDE
  // those bounds — culture, not noise; the position never leaves [0,1].
  const editionTrackingBias =
    edition && Number.isFinite(Number(edition.scale?.trackingBias))
      ? Number(edition.scale.trackingBias)
      : 0;
  const trackingPos = clamp01(
    0.35 * tone.formality + 0.65 * rng() + 0.35 * editionTrackingBias,
  );
  const trackingEm =
    Math.round(
      (voice.tracking.min + (voice.tracking.max - voice.tracking.min) * trackingPos) * 1000,
    ) / 1000;
  if (edition && editionTrackingBias !== 0) {
    decide(
      "edition-tracking",
      `bias ${editionTrackingBias} inside voice bounds`,
      `edition '${edition.id}' tracking culture`,
    );
  }
  // Span capped at 0.85: glyph-advance estimates carry error and a clipped
  // name is a ruined card — leave real breathing room in the band.
  const targetSpan = Math.round((0.5 + 0.35 * (0.35 * tone.density + 0.65 * rng())) * 100) / 100;
  const weightOptions = voice.weights.name;
  const weightPick =
    weightOptions[
      Math.min(
        weightOptions.length - 1,
        Math.floor(clamp01(0.5 * tone.energy + 0.5 * rng()) * weightOptions.length),
      )
    ];
  const weightClass = resolveWeight(display, weightPick);
  const rotation = tone.formality >= 0.6 && rng() < 0.08 ? -90 : 0;
  if (rotation !== 0) decide("name-rotation", "-90 (vertical spine)", "rare editorial treatment, formality-gated");

  // Real glyph metrics (audit P0-1): measure the exact string the renderer
  // will draw, in the cast voice's family/weight/case, from the vendored
  // font files. Falls back to the library's calibrated estimate.
  const { advanceEm: glyphEm, measured: glyphMeasured } = nameAdvanceEm({
    family: display,
    weight: weightClass,
    text,
    nameCase,
  });
  // Stacked (two-line) treatments size from the longest segment, whose
  // per-glyph average differs from the full string's (spaces are narrow) —
  // measure it separately so stacked solves are exact too.
  const longestPart = text.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
  const { advanceEm: glyphEmLongest } = nameAdvanceEm({
    family: display,
    weight: weightClass,
    text: longestPart,
    nameCase,
  });
  decide(
    "name-metrics",
    glyphMeasured ? "measured" : "estimated",
    glyphMeasured
      ? "glyph advances shaped from vendored font files (harfbuzz)"
      : "no vendored font file — calibrated per-family estimate",
  );

  const name = { text, case: nameCase, weightClass, trackingEm, targetSpan, rotation, glyphEm, glyphEmLongest, glyphMeasured };
  decide(
    "name-treatment",
    `${display} ${nameCase} w${weightClass} tracking ${trackingEm}em span ${targetSpan}`,
    `voice '${voiceId}' bounds + tone/seed position`,
  );

  // 4. Palette.
  const heroWarmth = Number(heroForensics?.warmth ?? 0);
  const paper =
    heroWarmth > 0.12 || tone.warmth > 0.62
      ? PAPERS.warm
      : heroWarmth > -0.05 && tone.formality < 0.72
        ? PAPERS.ivory
        : PAPERS.pure;
  const ink = tone.formality >= 0.6 ? "#111111" : "#1A1815";
  const { accent, source } = deriveAccent(heroForensics, paper, tone.warmth);
  const rule = tone.formality >= 0.78 ? "#D9D9D9" : accent;
  decide("palette", `${paper} / ${ink} / ${accent}`, `accent: ${source}`);
  if (source.includes("fallback") && heroForensics) {
    warnings.push("hero palette yielded no usable accent; brand gold used");
  }

  // 4b. Edition field program — the operators' field axis maps to a palette
  // program. `dark` runs the verified ink-field program (hero-pulled night
  // paper, reversed ink, gold accent) REGARDLESS of the edition's own
  // palette id — a dark Monograph exists. `warm`/`paper` run the matching
  // paper program with the accent re-gated against the new paper. `plane`
  // keeps the design-language default and flags the front program to pull
  // the plane tone itself.
  let palette = { paper, ink, accent, rule };
  const field = edition ? (operators && operators.field) || "paper" : null;
  if (edition && field === "dark") {
    const inkField = resolveEditionPalette({ palette: "ink-field" }, { heroForensics });
    palette = {
      paper: inkField.paper,
      ink: inkField.ink,
      muted: inkField.muted,
      rule: inkField.rule,
      accent: inkField.accent,
      dark: true,
    };
    decide("edition-field", "dark", `ink-field program — ${inkField.source}`);
  } else if (edition && field === "warm") {
    const program = resolveEditionPalette({ palette: "paper-warm" }, {});
    const warmAccent = deriveAccent(heroForensics, program.paper, tone.warmth);
    palette = {
      paper: program.paper,
      ink: program.ink,
      muted: program.muted,
      rule: program.rule,
      accent: warmAccent.accent,
      dark: false,
    };
    decide("edition-field", "warm", `paper-warm program; accent ${warmAccent.source}`);
  } else if (edition && field === "paper") {
    // The neutral paper field: the edition's own light paper program when it
    // declares one, ivory otherwise — always distinct from the warm field.
    const programId = edition.palette === "paper-white" ? "paper-white" : "paper-ivory";
    const program = resolveEditionPalette({ palette: programId }, {});
    const paperAccent = deriveAccent(heroForensics, program.paper, tone.warmth);
    palette = {
      paper: program.paper,
      ink: program.ink,
      muted: program.muted,
      rule: program.rule,
      accent: paperAccent.accent,
      dark: false,
    };
    decide("edition-field", "paper", `${programId} program; accent ${paperAccent.source}`);
  } else if (edition && field === "plane") {
    palette = { ...palette, plane: true };
    decide(
      "edition-field",
      "plane",
      "design-language palette kept; plane tone derived by the front program",
    );
  }

  // 4c. Edition scale — the name-solve clamps the director consumes. The
  // register operator narrows the edition's honest bounds: quiet caps the
  // top at 22pt, display floors the bottom at 56pt, standard keeps the
  // edition's full range.
  let scale = null;
  if (edition && edition.scale) {
    const minPt = Number(edition.scale.minPt) || NAME_PT_MIN;
    const maxPt = Number(edition.scale.maxPt) || NAME_PT_MAX;
    const register = (operators && operators.register) || "standard";
    let lo = minPt;
    let hi = maxPt;
    if (register === "quiet") hi = Math.min(hi, REGISTER_QUIET_MAX_MIN_PT);
    if (register === "display") lo = Math.max(lo, REGISTER_DISPLAY_MIN_MAX_PT);
    if (lo > hi) {
      lo = minPt;
      hi = maxPt;
    }
    scale = { minPt: lo, maxPt: hi, register };
    decide(
      "edition-scale",
      `${lo}–${hi}pt (${register})`,
      `edition '${edition.id}' bounds × register operator`,
    );
  }

  // 5. Stats placement. The researched rule stands; an art-director brief
  // may request the front line but the deterministic legibility veto holds:
  // no quiet hero bottom band ⇒ no type over the figure.
  const quietBottom = heroForensics?.quiet?.bottom?.score ?? 0;
  let frontLine = false;
  let justification = "back by default — fronts stay image-led (industry two-sided convention)";
  if (overrides && overrides.frontStats === true) {
    frontLine = true;
    justification = "explicit frontStats override";
  } else if (brief && brief.frontStatLine === true) {
    if (quietBottom >= FRONT_STAT_QUIET_MIN) {
      frontLine = true;
      justification = "art-director brief (hero bottom band is quiet — legibility check passed)";
    } else {
      justification = `art-director brief requested a front line — VETOED: hero bottom quiet ${quietBottom.toFixed(2)} < ${FRONT_STAT_QUIET_MIN}`;
      decide("brief.frontStatLine", "vetoed", justification);
    }
  } else if (
    !brief &&
    tone.formality >= 0.7 &&
    quietBottom >= FRONT_STAT_QUIET_MIN &&
    rng() < FRONT_STAT_LINE_P
  ) {
    frontLine = true;
    justification =
      "show-package register: high formality, quiet hero bottom band, seeded draw";
  }
  decide("stats-placement", frontLine ? "back + front line" : "back", justification);

  return {
    toneVector: tone,
    typeScale,
    name,
    voiceId,
    fonts: { display, body: voice.body },
    palette,
    pacing:
      Math.round(
        (0.8 + 0.8 * clamp01(0.55 * tone.formality + 0.45 * (1 - tone.density))) * 100,
      ) / 100,
    statsPlacement: { page: "back", frontLine, justification },
    // Edition-only keys: absent on the legacy path so legacy plans stay
    // byte-identical (regression contract).
    ...(edition ? { edition: edition.id, field, scale } : {}),
    decisions,
    warnings,
  };
}

module.exports = {
  synthesizeDesignLanguage,
  computeToneVector,
  deriveAccent,
  solveNameSizePt,
  contrastRatio,
  TYPE_RATIOS,
  NAME_PT_MIN,
  NAME_PT_MAX,
};
