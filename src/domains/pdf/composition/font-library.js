/**
 * Font library + typography pairing (atelier engine v3).
 *
 * A curated library of Google Fonts families with real metadata — available
 * weights, approximate glyph advances for name-size solving, tracking
 * bounds — and six PAIRING VOICES that encode display/body pairings the way
 * an art director would: contrast of classification, matched register, and
 * a tone-affinity vector so the deterministic engine can cast a voice from
 * the talent's tone, while the Groq art-director can request one by id.
 *
 * Spec: tasks/comp-card-atelier-spec.md §E (v3 addendum).
 *
 * Glyph advance metadata: capAdvanceEm / titleAdvanceEm are average advance
 * widths (em units, tracking excluded) used by solveNameSizePt-style math.
 * They are calibrated estimates per family — the name sizer clamps to
 * 17–34pt, so ±5% estimate error is invisible.
 *
 * Loading: families render via the Google Fonts CSS2 API (the Puppeteer
 * pipeline already waits on document.fonts.ready). fontsCssUrl() builds one
 * <link> URL for any set of families with their library weights.
 */

/** Curated family manifest. Every family here is on Google Fonts. */
const FAMILIES = Object.freeze({
  Inter: {
    classification: "neutral-grotesque",
    weights: [300, 400, 500, 600, 700],
    capAdvanceEm: 0.61,
    titleAdvanceEm: 0.53,
  },
  Archivo: {
    classification: "grotesque-display",
    weights: [400, 500, 600, 700, 800],
    capAdvanceEm: 0.63,
    titleAdvanceEm: 0.55,
    // Variable master vendored as archivo-variable.ttf (see
    // scripts/fetch-compcard-fonts.js + variable-manifest.json). Ranges are
    // [min, default, max] verified against the face. wdth drives the
    // condensed-masthead / extended-rail edition treatments (spec R6.7).
    axes: {
      wght: { min: 100, default: 600, max: 900 },
      wdth: { min: 62, default: 100, max: 125 },
    },
  },
  Manrope: {
    classification: "modern-sans",
    weights: [300, 400, 500, 600, 700],
    capAdvanceEm: 0.63,
    titleAdvanceEm: 0.55,
  },
  "Playfair Display": {
    classification: "transitional-display-serif",
    weights: [400, 500, 600, 700],
    capAdvanceEm: 0.64,
    titleAdvanceEm: 0.55,
  },
  "Bodoni Moda": {
    classification: "didone",
    weights: [400, 500, 600, 700],
    capAdvanceEm: 0.6,
    titleAdvanceEm: 0.52,
    // Variable master (bodoni-moda-variable.ttf). opsz gives the true display
    // didone cut at masthead sizes (spec R6.7 optical axes).
    axes: {
      wght: { min: 400, default: 400, max: 900 },
      opsz: { min: 6, default: 11, max: 96 },
    },
  },
  "Cormorant Garamond": {
    classification: "garalde",
    weights: [400, 500, 600, 700],
    capAdvanceEm: 0.56,
    titleAdvanceEm: 0.48,
  },
  Fraunces: {
    classification: "soft-serif",
    weights: [400, 500, 600, 700],
    capAdvanceEm: 0.6,
    titleAdvanceEm: 0.53,
    // Variable master (fraunces-variable.ttf). opsz is the design axis we use;
    // SOFT/WONK are left at their defaults.
    axes: {
      wght: { min: 100, default: 900, max: 900 },
      opsz: { min: 9, default: 9, max: 144 },
    },
  },
  Marcellus: {
    classification: "roman-capitals",
    weights: [400],
    capAdvanceEm: 0.68,
    titleAdvanceEm: 0.58,
  },
  Italiana: {
    classification: "hairline-fashion",
    weights: [400],
    capAdvanceEm: 0.6,
    titleAdvanceEm: 0.53,
  },
  "Noto Serif Display": {
    classification: "workhorse-display-serif",
    weights: [400, 500, 600],
    capAdvanceEm: 0.63,
    titleAdvanceEm: 0.55,
  },
});

/**
 * Pairing voices. Each voice is a complete typographic stance:
 * - display/body family pairing (classification contrast on purpose)
 * - case + tracking + weight policy for the name
 * - affinity: where in tone space (0..1 axes) this voice belongs — used by
 *   the deterministic caster; the art-director brief can request a voice
 *   directly by id.
 */
const VOICES = Object.freeze({
  "stark-grotesque": {
    label: "Stark Grotesque",
    display: "Archivo",
    body: "Inter",
    nameCase: "upper",
    tracking: { min: 0.18, max: 0.42 },
    weights: { name: [400, 500], accentWeight: 500 },
    affinity: { formality: 0.9, warmth: 0.2, energy: 0.45, density: 0.45 },
  },
  "editorial-serif": {
    label: "Editorial Serif",
    display: "Playfair Display",
    body: "Inter",
    nameCase: "upper",
    tracking: { min: 0.08, max: 0.18 },
    weights: { name: [400, 500, 600], accentWeight: 500 },
    affinity: { formality: 0.68, warmth: 0.45, energy: 0.4, density: 0.5 },
  },
  "romantic-didone": {
    label: "Romantic Didone",
    display: "Bodoni Moda",
    body: "Inter",
    nameCase: "upper",
    tracking: { min: 0.12, max: 0.26 },
    weights: { name: [400, 500], accentWeight: 400 },
    affinity: { formality: 0.8, warmth: 0.55, energy: 0.3, density: 0.4 },
  },
  "quiet-classic": {
    label: "Quiet Classic",
    display: "Marcellus",
    body: "Inter",
    nameCase: "upper",
    tracking: { min: 0.1, max: 0.22 },
    weights: { name: [400], accentWeight: 400 },
    affinity: { formality: 0.6, warmth: 0.5, energy: 0.25, density: 0.35 },
  },
  "modern-warm": {
    label: "Modern Warm",
    display: "Fraunces",
    body: "Manrope",
    nameCase: "title",
    tracking: { min: 0.01, max: 0.06 },
    weights: { name: [500, 600], accentWeight: 600 },
    affinity: { formality: 0.4, warmth: 0.75, energy: 0.55, density: 0.55 },
  },
  "bold-grotesque": {
    label: "Bold Grotesque",
    display: "Archivo",
    body: "Inter",
    nameCase: "upper",
    tracking: { min: 0.06, max: 0.14 },
    weights: { name: [700, 800], accentWeight: 700 },
    affinity: { formality: 0.45, warmth: 0.4, energy: 0.9, density: 0.65 },
  },
  "hairline-fashion": {
    label: "Hairline Fashion",
    display: "Italiana",
    body: "Inter",
    nameCase: "upper",
    tracking: { min: 0.2, max: 0.4 },
    weights: { name: [400], accentWeight: 400 },
    affinity: { formality: 0.95, warmth: 0.35, energy: 0.2, density: 0.3 },
  },
  "clean-modern": {
    label: "Clean Modern",
    display: "Manrope",
    body: "Inter",
    nameCase: "title",
    tracking: { min: 0.0, max: 0.05 },
    weights: { name: [600, 700], accentWeight: 600 },
    affinity: { formality: 0.35, warmth: 0.65, energy: 0.5, density: 0.5 },
  },
});

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

// ── API ─────────────────────────────────────────────────────────────────────

function isVoice(id) {
  return Object.prototype.hasOwnProperty.call(VOICES, id);
}

function getVoice(id) {
  return isVoice(id) ? VOICES[id] : null;
}

/**
 * Cast a voice from a tone vector: distance in tone space to each voice's
 * affinity, softmax-ish seeded pick among the 2–3 nearest so near-identical
 * talents still differentiate. Kids never get hairline or didone voices.
 *
 * @param {object} tone — { formality, energy, warmth, density } 0..1
 * @param {object} [options] — { seed, salt, requested (voice id, wins when
 *   valid), kids (boolean — restricts the candidate set), pool (voice-id
 *   allowlist, e.g. an edition's voice pool — restricts the cast; kids
 *   vetoes still apply on top; the pool is IGNORED when honoring it would
 *   empty the candidate set), avoid (previous take's voice id) }
 * @returns {{ voiceId, voice, because }}
 */
function resolveVoice(tone = {}, options = {}) {
  const { seed, salt = "voice", requested = null, kids = false, avoid = null, pool = null } = options;

  if (requested && isVoice(requested)) {
    if (!kids || !["hairline-fashion", "romantic-didone"].includes(requested)) {
      return {
        voiceId: requested,
        voice: VOICES[requested],
        because: "requested voice adopted (valid library id)",
      };
    }
    return {
      voiceId: "modern-warm",
      voice: VOICES["modern-warm"],
      because: `requested '${requested}' vetoed for kids; modern-warm substituted`,
    };
  }

  // Edition voice pool: restricts the cast AFTER the kids veto (safety
  // composes with taste). A pool that would empty the set — e.g. every
  // pooled voice kids-vetoed — is ignored rather than obeyed.
  const kidsEligible = Object.entries(VOICES).filter(
    ([id]) => !kids || !["hairline-fashion", "romantic-didone"].includes(id),
  );
  const poolIds = Array.isArray(pool) ? pool.filter((id) => isVoice(id)) : null;
  let entries = kidsEligible;
  let pooled = false;
  if (poolIds && poolIds.length) {
    const restricted = kidsEligible.filter(([id]) => poolIds.includes(id));
    if (restricted.length) {
      entries = restricted;
      pooled = true;
    }
  }

  const axes = ["formality", "warmth", "energy", "density"];
  const candidates = entries
    // take-to-take diversity: the previous take's voice is excluded so a
    // fresh take always speaks in a different register (unless it is the
    // only voice left standing)
    .filter(([id], _, all) => !avoid || id !== avoid || all.length <= 1)
    .map(([id, voice]) => {
      let dist = 0;
      for (const axis of axes) {
        const t = Number(tone[axis]);
        const a = voice.affinity[axis];
        const d = (Number.isFinite(t) ? t : 0.5) - a;
        dist += d * d;
      }
      return { id, voice, dist: Math.sqrt(dist) };
    })
    .sort((a, b) => a.dist - b.dist);

  const nearest = candidates.slice(0, 3);
  const rng = createMulberry32(seedToUint32(`${seed ?? "auto"}:${salt}`));
  // Weighted by inverse distance: the best fit usually wins, neighbors keep
  // the casting from collapsing to one voice per register.
  const weights = nearest.map((c) => 1 / (0.08 + c.dist));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let pick = nearest[0];
  for (let i = 0; i < nearest.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = nearest[i];
      break;
    }
  }
  return {
    voiceId: pick.id,
    voice: pick.voice,
    because: `tone-affinity cast (distance ${pick.dist.toFixed(3)}, ${nearest.length} candidates${pooled ? `, edition pool [${poolIds.join(", ")}]` : ""})`,
  };
}

// ── variable-font axes ─────────────────────────────────────────────────────

/** Axis metadata ({ tag: {min,default,max} }) for a family, or null. */
function familyAxes(family) {
  const meta = FAMILIES[family];
  return meta && meta.axes ? meta.axes : null;
}

/** True when the family exposes a design axis we drive (wdth or opsz). */
function hasVariableAxis(family) {
  const axes = familyAxes(family);
  return !!axes && (!!axes.wdth || !!axes.opsz);
}

function clampAxis(meta, value) {
  if (!meta || !Number.isFinite(value)) return null;
  return Math.min(meta.max, Math.max(meta.min, value));
}

/**
 * Resolve a name's variable-axis position from a typographic intent. This is
 * the low-level mechanical mapping (design-language derives the intent from
 * the edition/register/name and carries the result on the name treatment).
 *
 * Returns `{ wdth?, opsz? }` (only the axes the family actually carries and
 * that move off default), or null when the family has no design axis. Values
 * are clamped to the face's ranges, so callers can pass raw intent numbers.
 *
 * Intent:
 * - widthMode: 'extended' (rail/spine — pull wide), 'condense' (masthead /
 *   large display — narrow long names to fit), or 'normal' (leave at default).
 * - nameLength: rendered character count (drives the condense curve).
 * - opszSizePt: the display size the optical cut targets; opsz tracks it.
 *
 * @param {string} family
 * @param {object} intent — { widthMode, nameLength, opszSizePt }
 * @returns {{ wdth?: number, opsz?: number }|null}
 */
function resolveNameAxes(family, intent = {}) {
  const axes = familyAxes(family);
  if (!axes || (!axes.wdth && !axes.opsz)) return null;
  const { widthMode = "normal", nameLength = 0, opszSizePt } = intent;
  const out = {};

  if (axes.wdth) {
    const w = axes.wdth;
    if (widthMode === "extended") {
      // pull ~60% toward the wide extreme — an unmistakably extended rail
      out.wdth = Math.round(w.default + (w.max - w.default) * 0.6);
    } else if (widthMode === "condense") {
      // condense only the part of the name past a comfortable length, so short
      // names stay at the design width and long ones narrow to earn their size
      const overflow = Math.max(0, Number(nameLength) - 14);
      const target = w.default - overflow * 2.4;
      out.wdth = Math.round(clampAxis(w, target));
    }
    // 'normal' → leave wdth at default (omit — a render/measure no-op)
    if (out.wdth === w.default) delete out.wdth;
  }

  if (axes.opsz && Number.isFinite(Number(opszSizePt))) {
    // Optical size tracks the display point size: true display cut when large,
    // text cut when small. The SAME value is carried to render, so parity is
    // exact regardless of the later solved point size.
    out.opsz = Math.round(clampAxis(axes.opsz, Number(opszSizePt)));
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Glyph advance (em) for name-size solving, per family + case.
 */
function advanceEm(family, nameCase) {
  const meta = FAMILIES[family] || FAMILIES.Inter;
  return nameCase === "upper" ? meta.capAdvanceEm : meta.titleAdvanceEm;
}

/**
 * Nearest available weight in the family to the requested one.
 */
function resolveWeight(family, requested) {
  const meta = FAMILIES[family] || FAMILIES.Inter;
  return meta.weights.reduce((best, w) =>
    Math.abs(w - requested) < Math.abs(best - requested) ? w : best,
  );
}

/**
 * Google Fonts CSS2 URL for a set of families with their library weights.
 */
function fontsCssUrl(families) {
  const list = [...new Set(["Inter", ...(families || [])])].filter(
    (f) => FAMILIES[f],
  );
  const params = list
    .map((f) => {
      const weights = FAMILIES[f].weights.join(";");
      return `family=${f.replace(/ /g, "+")}:wght@${weights}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

module.exports = {
  FAMILIES,
  VOICES,
  isVoice,
  getVoice,
  resolveVoice,
  advanceEm,
  resolveWeight,
  fontsCssUrl,
  familyAxes,
  hasVariableAxis,
  resolveNameAxes,
};
