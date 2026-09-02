"use strict";

/**
 * Embedding provider seam for the Discover semantic layer.
 *
 * One call shape, `embedTexts(texts, { kind })`, over two adapters:
 *   - openai : text-embedding-3-small, `dimensions` sliced to EMBEDDING_DIMENSIONS
 *   - voyage : voyage-4-lite (or VOYAGE_EMBED_MODEL), `output_dimension` 512,
 *              with the query/document asymmetry Voyage supports
 *
 * `kind` is 'query' (a booker's brief) or 'document' (a profile chunk). OpenAI
 * has no asymmetry and ignores it; the seam keeps the distinction so a
 * provider that has it can use it.
 *
 * Fails closed: the feature flag and the key are both required, and no call
 * is made otherwise. Tests inject a fake with `__setEmbedder`.
 */

const config = require("../../config");

const EMBEDDING_DIMENSIONS = 512;
const MAX_INPUT_CHARS = 8000;
const MAX_BATCH = 64;

let injectedEmbedder = null;

function featureEnabled(env = process.env) {
  return env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true";
}

function providerName() {
  return String(config.embedding?.provider || "openai").toLowerCase();
}

function modelName() {
  const provider = providerName();
  if (provider === "voyage") return config.embedding?.voyageModel || "voyage-4-lite";
  return config.embedding?.openaiModel || "text-embedding-3-small";
}

function cleanInputs(texts) {
  return (Array.isArray(texts) ? texts : [texts]).map((t) =>
    String(t == null ? "" : t).slice(0, MAX_INPUT_CHARS),
  );
}

async function callOpenAI(inputs, fetchImpl) {
  const apiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("[embedding-provider] OPENAI_API_KEY not set");
  const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName(),
      input: inputs,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[embedding-provider] OpenAI ${response.status}: ${body}`);
  }
  const data = await response.json();
  const rows = (data.data || []).slice().sort((a, b) => a.index - b.index);
  return rows.map((row) => row.embedding);
}

async function callVoyage(inputs, kind, fetchImpl) {
  const apiKey = config.embedding?.voyageApiKey || process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("[embedding-provider] VOYAGE_API_KEY not set");
  const response = await fetchImpl("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName(),
      input: inputs,
      input_type: kind === "query" ? "query" : "document",
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[embedding-provider] Voyage ${response.status}: ${body}`);
  }
  const data = await response.json();
  const rows = (data.data || []).slice().sort((a, b) => a.index - b.index);
  return rows.map((row) => row.embedding);
}

/**
 * Embed one or more texts.
 * @param {string|string[]} texts
 * @param {{ kind?: 'query'|'document', fetchImpl?: typeof fetch, env?: object }} [opts]
 * @returns {Promise<number[][]>} one vector per input, same order
 */
async function embedTexts(texts, opts = {}) {
  const env = opts.env || process.env;
  if (!featureEnabled(env)) {
    throw new Error("[embedding-provider] profile embedding feature is disabled");
  }
  const inputs = cleanInputs(texts);
  if (!inputs.length) return [];
  if (injectedEmbedder) return injectedEmbedder(inputs, opts.kind || "document");
  // EMBEDDING_PROVIDER=fake: the deterministic hash embedder, for local
  // development and evaluation plumbing only. Refused in production.
  if (providerName() === "fake") {
    if (env.NODE_ENV === "production") {
      throw new Error("[embedding-provider] the fake provider is not allowed in production");
    }
    return hashEmbedder()(inputs);
  }

  const fetchImpl = opts.fetchImpl || fetch;
  const out = [];
  for (let i = 0; i < inputs.length; i += MAX_BATCH) {
    const batch = inputs.slice(i, i + MAX_BATCH);
    // eslint-disable-next-line no-await-in-loop
    const vectors =
      providerName() === "voyage"
        ? await callVoyage(batch, opts.kind || "document", fetchImpl)
        : await callOpenAI(batch, fetchImpl);
    out.push(...vectors);
  }
  return out;
}

/** Test seam: replace the provider with a function (inputs, kind) => vectors. */
function __setEmbedder(fn) {
  injectedEmbedder = typeof fn === "function" ? fn : null;
}

/**
 * A deterministic, dependency-free embedder for tests and local demos: each
 * word hashes to a few coordinates, so texts sharing vocabulary land close
 * together. Never used in production.
 */
function hashEmbedder(dimensions = EMBEDDING_DIMENSIONS) {
  return async (inputs) =>
    inputs.map((text) => {
      const vec = new Array(dimensions).fill(0);
      const words = String(text)
        .toLowerCase()
        .split(/[^a-z0-9']+/)
        .filter((w) => w.length > 2);
      for (const word of words) {
        let h = 2166136261;
        for (let i = 0; i < word.length; i += 1) {
          h ^= word.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
        for (let k = 0; k < 3; k += 1) {
          const idx = (h + k * 97) % dimensions;
          vec[idx] += 1;
        }
      }
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map((v) => v / norm);
    });
}

module.exports = {
  embedTexts,
  featureEnabled,
  providerName,
  modelName,
  hashEmbedder,
  __setEmbedder,
  EMBEDDING_DIMENSIONS,
};
