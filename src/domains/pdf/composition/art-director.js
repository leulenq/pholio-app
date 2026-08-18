/**
 * Groq art-director planning layer (atelier engine v3).
 *
 * A fast structured-decision layer that authors a DESIGN BRIEF per talent —
 * typography voice, tone axes, front treatment, stat placement, bleed
 * appetite, hero choice — from the vision analysis, archetype, stats
 * category, and per-image forensics. The deterministic engine adopts the
 * brief for taste decisions but keeps hard vetoes: hero clamp, legibility
 * (front stat line requires a quiet hero bottom band), crop safety, print
 * specs, validation.
 *
 * Spec: tasks/comp-card-atelier-spec.md §G (v3 addendum).
 *
 * Model: openai/gpt-oss-120b with response_format json_schema strict:true —
 * the only Groq flagship with schema-CONSTRAINED decoding (verified live on
 * this account; ~1.7s / ~1k tokens per brief). Numeric axes are 0–100
 * integers in the schema (unbounded numbers come back on arbitrary scales)
 * and normalized to 0..1 here. Transport output is still validated field by
 * field — strict mode guarantees shape, not sense.
 *
 * Failure contract: ANY problem (no key, timeout, SDK error, invalid
 * values) resolves to null. Callers compose deterministically without it.
 */

const { isVoice } = require("./font-library");

const DIRECTOR_MODEL = "openai/gpt-oss-120b";
const DIRECTOR_TEMPERATURE = 0.4;
// Reasoning models spend completion tokens before the JSON body.
const DIRECTOR_MAX_TOKENS = 1600;
const DEFAULT_TIMEOUT_MS = 6000;

const FRONT_TREATMENTS = ["full-bleed", "floated", "floated-asymmetric"];
const STATS_SIDES = ["right", "left", "bottom"];
const BLEED_APPETITES = ["none", "restrained", "expressive"];
const WORDMARK_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"];

const BRIEF_SCHEMA = {
  name: "comp_card_design_brief",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      typographyVoice: {
        type: "string",
        enum: [
          "stark-grotesque",
          "editorial-serif",
          "romantic-didone",
          "quiet-classic",
          "modern-warm",
          "bold-grotesque",
          "hairline-fashion",
        ],
        description: "Typographic voice for the card",
      },
      formality: { type: "integer", description: "0-100; 100 = stark high-fashion register" },
      warmth: { type: "integer", description: "0-100; 100 = warm commercial register" },
      energy: { type: "integer", description: "0-100; 100 = athletic/dynamic register" },
      density: { type: "integer", description: "0-100; 100 = dense, image-packed composition" },
      frontTreatment: { type: "string", enum: FRONT_TREATMENTS },
      statsSide: { type: "string", enum: STATS_SIDES },
      frontStatLine: {
        type: "boolean",
        description: "Single hairline stat line on the front (rare, show-package style)",
      },
      bleedAppetite: { type: "string", enum: BLEED_APPETITES },
      heroImageId: { type: "string", description: "id of the front hero image from the pool" },
      wordmarkCorner: {
        type: "string",
        enum: WORDMARK_CORNERS,
        description:
          "Front brand-mark corner: the quietest hero corner that does not interfere with the name or figure",
      },
      rationale: { type: "string", description: "max 400 chars, one paragraph" },
    },
    required: [
      "typographyVoice",
      "formality",
      "warmth",
      "energy",
      "density",
      "frontTreatment",
      "statsSide",
      "frontStatLine",
      "bleedAppetite",
      "heroImageId",
      "wordmarkCorner",
      "rationale",
    ],
  },
};

const SYSTEM_PROMPT = `You are the senior art director of a top modeling agency, designing a printed comp card (5.5x8.5in, front: hero + name; back: photo composition + stats).
Author a design brief for THIS talent from their casting analysis, archetype, and image measurements. Decide like a human director:
- typographyVoice: the typographic register that fits the talent's market position (hairline-fashion/stark-grotesque for severe high-fashion looks, romantic-didone for beauty/elegance, editorial-serif for classic editorial, modern-warm for commercial warmth, bold-grotesque for athletic energy, quiet-classic for understated talent).
- tone axes (0-100): formality (high-fashion severity), warmth (commercial approachability), energy (dynamism), density (how packed the composition should feel).
- frontTreatment: full-bleed for strong confident heroes; floated/floated-asymmetric for quieter, gallery-like presentation.
- statsSide: where the stats block sits on the back (right/left column or bottom strip).
- frontStatLine: true ONLY for severe high-fashion show-package register with a calm hero bottom area; default false.
- bleedAppetite: how much the back photos may bleed off the page edges.
- heroImageId: the strongest front image (prefer the analyzed primary headshot unless another image is clearly stronger for this market).
- wordmarkCorner: where the small gold brand mark sits on the front — pick the corner with the calmest image area (use the quietTop/quietBottom measurements) that stays away from the name placement and the talent's face/figure.
Return ONLY the JSON brief.`;

// ── Groq client (lazy) ──────────────────────────────────────────────────────

let groqClient = null;
let groqInitFailed = false;

function getGroq() {
  if (groqClient) return groqClient;
  if (groqInitFailed) return null;
  if (!process.env.GROQ_API_KEY) return null;
  try {
    // eslint-disable-next-line global-require
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqClient;
  } catch (err) {
    groqInitFailed = true;
    return null;
  }
}

// ── prompt assembly ─────────────────────────────────────────────────────────

function compactForensics(forensicsById, poolSummary) {
  if (!forensicsById) return [];
  const get = (id) =>
    forensicsById instanceof Map ? forensicsById.get(id) : forensicsById[id];
  return (poolSummary || [])
    .map((item) => {
      const f = get(item.id);
      if (!f) return null;
      return {
        id: item.id,
        isDark: Boolean(f.luma?.isDark),
        warmth: f.warmth,
        quietTop: f.quiet?.top?.score ?? null,
        quietBottom: f.quiet?.bottom?.score ?? null,
        dominant: f.palette?.[0]?.hex ?? null,
      };
    })
    .filter(Boolean);
}

function buildUserPrompt({ profile, castingAnalysis, archetype, poolSummary, statsBlock, forensicsSummary }) {
  const ca = castingAnalysis || {};
  const lines = [
    `Talent: ${profile?.first_name || "Unknown"} — category ${statsBlock?.category || "unknown"}${statsBlock?.isFitness ? " (fitness)" : ""}.`,
    `Archetype: ${typeof archetype === "object" ? archetype?.label : archetype || "n/a"}.`,
  ];
  for (const key of ["lookType", "boneStructure", "featureContrast", "expressionRead", "primaryStrength", "castingNotes"]) {
    if (typeof ca[key] === "string" && ca[key].trim()) lines.push(`${key}: ${ca[key].trim()}`);
  }
  if (Array.isArray(ca.marketSignals) && ca.marketSignals.length) {
    lines.push(`marketSignals: ${ca.marketSignals.join(", ")}`);
  }
  lines.push(
    "Images (id | role | qualityScore | heroScore | label):",
    ...(poolSummary || []).map(
      (p) => `  ${p.id} | ${p.role || "untyped"} | ${p.qualityScore} | ${p.heroScore} | ${p.label || ""}`,
    ),
  );
  if (forensicsSummary && forensicsSummary.length) {
    lines.push(
      "Image measurements (id | isDark | warmth | quietTop | quietBottom | dominant):",
      ...forensicsSummary.map(
        (f) => `  ${f.id} | ${f.isDark} | ${f.warmth} | ${f.quietTop} | ${f.quietBottom} | ${f.dominant}`,
      ),
    );
  }
  return lines.join("\n");
}

// ── validation (strict mode guarantees shape, not sense) ────────────────────

function normalizeAxis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Tolerate 0..1 floats and 0..100 integers.
  const scaled = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
}

function validateBrief(raw, poolSummary) {
  if (!raw || typeof raw !== "object") return null;
  const poolIds = new Set((poolSummary || []).map((p) => String(p.id)));
  const brief = {};

  if (!isVoice(raw.typographyVoice)) return null;
  brief.typographyVoice = raw.typographyVoice;

  const tone = {};
  for (const axis of ["formality", "warmth", "energy", "density"]) {
    const v = normalizeAxis(raw[axis]);
    if (v == null) return null;
    tone[axis] = Math.round(v * 100) / 100;
  }
  brief.tone = tone;

  brief.frontTreatment = FRONT_TREATMENTS.includes(raw.frontTreatment)
    ? raw.frontTreatment
    : null;
  brief.statsSide = STATS_SIDES.includes(raw.statsSide) ? raw.statsSide : null;
  brief.bleedAppetite = BLEED_APPETITES.includes(raw.bleedAppetite)
    ? raw.bleedAppetite
    : "restrained";
  brief.frontStatLine = raw.frontStatLine === true;
  brief.heroImageId = poolIds.has(String(raw.heroImageId))
    ? String(raw.heroImageId)
    : null;
  brief.wordmarkCorner = WORDMARK_CORNERS.includes(raw.wordmarkCorner)
    ? raw.wordmarkCorner
    : null;
  brief.rationale =
    typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 400) : "";
  return brief;
}

// ── API ─────────────────────────────────────────────────────────────────────

/**
 * Author a design brief for one talent. Never throws; null on any failure.
 *
 * @param {object} input — { profile, castingAnalysis, archetype, poolSummary,
 *   statsBlock, forensicsById, timeoutMs }
 * @returns {Promise<object|null>} validated Brief
 */
async function getDesignBrief(input = {}) {
  const {
    profile,
    castingAnalysis,
    archetype,
    poolSummary = [],
    statsBlock,
    forensicsById = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = input;

  const groq = getGroq();
  if (!groq) {
    console.log("[art-director] no Groq client — deterministic composition only");
    return null;
  }
  if (!poolSummary.length) return null;

  let timer = null;
  try {
    const forensicsSummary = compactForensics(forensicsById, poolSummary);
    const request = groq.chat.completions.create({
      model: DIRECTOR_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt({
            profile,
            castingAnalysis,
            archetype,
            poolSummary,
            statsBlock,
            forensicsSummary,
          }),
        },
      ],
      temperature: DIRECTOR_TEMPERATURE,
      max_completion_tokens: DIRECTOR_MAX_TOKENS,
      response_format: { type: "json_schema", json_schema: BRIEF_SCHEMA },
    });
    Promise.resolve(request).catch(() => {}); // pre-handle late rejections
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const response = await Promise.race([request, timeout]);
    if (!response) {
      console.warn(`[art-director] timed out after ${timeoutMs}ms — composing without a brief`);
      return null;
    }
    const content = response.choices?.[0]?.message?.content || "";
    const brief = validateBrief(JSON.parse(content), poolSummary);
    if (!brief) {
      console.warn("[art-director] brief failed validation — composing without it");
      return null;
    }
    console.log(
      `[art-director] brief authored (voice=${brief.typographyVoice}, treatment=${brief.frontTreatment}, stats=${brief.statsSide}, hero=${brief.heroImageId})`,
    );
    return brief;
  } catch (error) {
    console.warn(`[art-director] failed (${error.message}) — composing without a brief`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  getDesignBrief,
  validateBrief,
  BRIEF_SCHEMA,
  DIRECTOR_MODEL,
  FRONT_TREATMENTS,
  STATS_SIDES,
  BLEED_APPETITES,
  WORDMARK_CORNERS,
};
