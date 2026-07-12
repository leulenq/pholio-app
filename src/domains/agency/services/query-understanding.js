/**
 * Discover query understanding — Groq JSON decomposition with intent-parser fallback.
 */

"use strict";

const Groq = require("groq-sdk");
const config = require("../../../config");
const { decomposeQueryFallback } = require("../lib/intent-parser");
const { sanitizeUntrustedText } = require("./discover/validate-contract");

const CACHE_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map();

let _groq = null;
function getGroq() {
  if (!_groq) {
    const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

const DECOMPOSE_SYSTEM = `You decompose agency casting search queries into structured JSON.
Fields:
- residual_query: remaining descriptive phrase after extraction.
- attributes: visual/casting/vibe/demographic terms with confidence 0.0-1.0.
- constraints: structured filters (gender, heritage, hair_color, eye_color, min_height, archetype, city) with confidence 0.0-1.0. Use mode "soft" for all constraints.
- channel_queries: per-retrieval-channel rewrites — visual (bone structure, features), casting (presence, bio-oriented terms), market (market-fit terms), lexical (all searchable tokens lowercased).
Visual/casting language stays in attributes and channel_queries, not hard filters.`;

// Strict-mode schema (schema-constrained decoding, same pattern as
// domains/pdf/composition/art-director.js): every property required,
// additionalProperties:false on every object. Mirrors the EXISTING parse
// shape — the v2 roles contract lands in a later PR.
const UNDERSTANDING_SCHEMA = {
  name: "discover_query_understanding",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      residual_query: {
        type: "string",
        description: "Remaining descriptive phrase after extraction",
      },
      attributes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              enum: ["visual", "casting", "vibe", "demographic"],
            },
            term: { type: "string" },
            confidence: { type: "number", description: "0.0-1.0" },
          },
          required: ["type", "term", "confidence"],
        },
      },
      constraints: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: {
              type: "string",
              enum: [
                "gender",
                "heritage",
                "hair_color",
                "eye_color",
                "min_height",
                "archetype",
                "city",
              ],
            },
            value: { type: ["string", "number"] },
            confidence: { type: "number", description: "0.0-1.0" },
            mode: { type: "string", enum: ["soft"] },
          },
          required: ["field", "value", "confidence", "mode"],
        },
      },
      channel_queries: {
        type: "object",
        additionalProperties: false,
        properties: {
          visual: { type: "string" },
          casting: { type: "string" },
          market: { type: "string" },
          lexical: { type: "string" },
        },
        required: ["visual", "casting", "market", "lexical"],
      },
    },
    required: [
      "residual_query",
      "attributes",
      "constraints",
      "channel_queries",
    ],
  },
};

// Reasoning models (gpt-oss) spend completion tokens before the JSON body.
const DECOMPOSE_MAX_TOKENS = 1600;

async function groqDecomposeQuery(q) {
  const groq = getGroq();
  if (!groq) return null;

  // Sanitize the user-supplied query before interpolation so injection control
  // phrases / forged delimiters can't hijack the decomposition prompt. The raw
  // `q` is still used for structured defaults in normalizeUnderstanding().
  const safeQ = sanitizeUntrustedText(q, 500);

  const completion = await groq.chat.completions.create({
    model: config.groq.textModel,
    messages: [
      { role: "system", content: DECOMPOSE_SYSTEM },
      {
        role: "user",
        content: `Decompose this casting search query: "${safeQ}"`,
      },
    ],
    temperature: 0.1,
    max_completion_tokens: DECOMPOSE_MAX_TOKENS,
    response_format: { type: "json_schema", json_schema: UNDERSTANDING_SCHEMA },
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) return null;

  const parsed = JSON.parse(raw);
  return normalizeUnderstanding(parsed, q, "groq");
}

function normalizeUnderstanding(raw, q, source) {
  const trimmed = (q || "").trim();
  const channel = raw.channel_queries || {};

  return {
    residual_query: raw.residual_query || trimmed,
    attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
    constraints: Array.isArray(raw.constraints)
      ? raw.constraints.map((c) => ({ mode: "soft", ...c }))
      : [],
    channel_queries: {
      visual: channel.visual || raw.residual_query || trimmed,
      casting: channel.casting || trimmed,
      market: channel.market || `${trimmed} market fit`,
      lexical: channel.lexical || trimmed,
    },
    source,
  };
}

/**
 * Understand a Discover query (cached 5 min).
 * @param {string} q
 * @returns {Promise<Object>}
 */
async function understandQuery(q) {
  const trimmed = (q || "").trim();
  if (!trimmed) {
    return {
      residual_query: "",
      attributes: [],
      constraints: [],
      channel_queries: {
        visual: "",
        casting: "",
        market: "",
        lexical: "",
      },
      source: "empty",
    };
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }

  let result;
  try {
    result = await groqDecomposeQuery(trimmed);
  } catch (err) {
    console.warn(
      "[query-understanding] Groq failed, using fallback:",
      err.message,
    );
    result = null;
  }

  if (!result) {
    result = decomposeQueryFallback(trimmed);
  }

  queryCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

/** Clear cache (testing). */
function clearQueryCache() {
  queryCache.clear();
}

module.exports = {
  understandQuery,
  groqDecomposeQuery,
  clearQueryCache,
  UNDERSTANDING_SCHEMA,
  CACHE_TTL_MS,
};
