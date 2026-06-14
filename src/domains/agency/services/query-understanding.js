/**
 * Discover query understanding — Groq JSON decomposition with intent-parser fallback.
 */

"use strict";

const Groq = require("groq-sdk");
const config = require("../../../config");
const { decomposeQueryFallback } = require("../lib/intent-parser");

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
Return ONLY valid JSON with this shape:
{
  "residual_query": "remaining descriptive phrase",
  "attributes": [{ "type": "visual|casting|vibe|demographic", "term": "string", "confidence": 0.0-1.0 }],
  "constraints": [{ "field": "gender|heritage|hair_color|eye_color|min_height|archetype|city", "value": "string or number", "confidence": 0.0-1.0, "mode": "soft" }],
  "channel_queries": {
    "visual": "angular bone structure jawline etc",
    "casting": "editorial presence bio-oriented terms",
    "market": "editorial luxury market fit terms",
    "lexical": "all searchable tokens lowercased"
  }
}
Use mode "soft" for all constraints. Visual/casting language stays in attributes and channel_queries, not hard filters.`;

async function groqDecomposeQuery(q) {
  const groq = getGroq();
  if (!groq) return null;

  const completion = await groq.chat.completions.create({
    model: config.groq.textModel,
    messages: [
      { role: "system", content: DECOMPOSE_SYSTEM },
      {
        role: "user",
        content: `Decompose this casting search query: "${q}"`,
      },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
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
  CACHE_TTL_MS,
};
