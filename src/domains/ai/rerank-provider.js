"use strict";

/**
 * Cross-encoder reranker seam for the Discover semantic layer.
 *
 * Optional and off by default (`DISCOVER_RERANK=off`). When `cohere`, the top
 * of the match group is re-ordered by Cohere Rerank against the brief's look
 * language, using each profile's own chunk texts as the document. This is a
 * deterministic cross-encoder, not the LLM listwise rerank the 2026-07 council
 * rejected. Tests inject a function with `__setReranker`.
 */

const config = require("../../config");

let injectedReranker = null;

function rerankMode(env = process.env) {
  const mode = String(env.DISCOVER_RERANK || config.embedding?.rerank || "off")
    .toLowerCase()
    .trim();
  return mode === "cohere" ? "cohere" : "off";
}

async function callCohere(query, documents, fetchImpl, env) {
  const apiKey = config.embedding?.cohereApiKey || env.COHERE_API_KEY;
  if (!apiKey) throw new Error("[rerank-provider] COHERE_API_KEY not set");
  const response = await fetchImpl("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.COHERE_RERANK_MODEL || "rerank-v3.5",
      query,
      documents,
      top_n: documents.length,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[rerank-provider] Cohere ${response.status}: ${body}`);
  }
  const data = await response.json();
  return (data.results || []).map((r) => ({ index: r.index, score: r.relevance_score }));
}

/**
 * Rerank documents against a query.
 * @param {string} query
 * @param {string[]} documents
 * @param {{ fetchImpl?: typeof fetch, env?: object }} [opts]
 * @returns {Promise<Array<{index:number, score:number}>>} best first
 */
async function rerank(query, documents, opts = {}) {
  const env = opts.env || process.env;
  if (!documents.length) return [];
  if (injectedReranker) return injectedReranker(query, documents);
  if (rerankMode(env) !== "cohere") return [];
  const results = await callCohere(query, documents, opts.fetchImpl || fetch, env);
  return results.slice().sort((a, b) => b.score - a.score);
}

/** Test seam: (query, documents) => [{index, score}] best first. */
function __setReranker(fn) {
  injectedReranker = typeof fn === "function" ? fn : null;
}

module.exports = { rerank, rerankMode, __setReranker };
