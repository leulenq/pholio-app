"use strict";

/**
 * Discover semantic layer — query-time scoring, fusion, and the why-line.
 *
 * Given the look part of a brief (`soft_query`) and the candidate profiles the
 * requirement engine already grouped, score each candidate by the best cosine
 * similarity between the brief and any of that profile's chunks, then fuse
 * that order with the lexical mention order (Reciprocal Rank Fusion). The
 * fused order is used only INSIDE the match and partial groups; it never moves
 * anyone between groups (tasks/discover-semantic-2026-09.md §3.3).
 *
 * No number leaves this module towards the API: callers get an ordering and a
 * `why` string quoting the talent's own words or their book's description.
 */

const config = require("../../../../config");
const provider = require("../../../ai/embedding-provider");
const {
  cachedEmbed,
  cosineDistance,
  toVectorLiteral,
  isPostgresKnex,
} = require("../../../ai/embeddings");

const RRF_K = 60;
const WHY_MAX_CHARS = 120;

/** 'off' | 'shadow' | 'on' — honours the global embedding flag as well. */
function semanticMode(env = process.env) {
  if (!provider.featureEnabled(env)) return "off";
  const mode = String(env.DISCOVER_SEMANTIC || config.embedding?.semanticMode || "off")
    .toLowerCase()
    .trim();
  return mode === "on" || mode === "shadow" ? mode : "off";
}

function minSim(env = process.env) {
  const raw = parseFloat(env.DISCOVER_SEMANTIC_MIN_SIM);
  if (Number.isFinite(raw)) return raw;
  return config.embedding?.minSim ?? 0.32;
}

function parseVector(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Score candidates against a query text.
 * @param {import('knex').Knex} knex
 * @param {string} queryText — the brief's look language
 * @param {string[]} candidateIds
 * @param {{ embedTexts?: Function, env?: object }} [opts]
 * @returns {Promise<Map<string, {sim:number, kind:string, text:string, image_id:string|null}>>}
 */
async function scoreCandidates(knex, queryText, candidateIds, opts = {}) {
  const env = opts.env || process.env;
  const out = new Map();
  const text = String(queryText || "").trim();
  if (!text || !candidateIds.length) return out;
  if (!(await knex.schema.hasTable("discover_chunks"))) return out;

  const embedTexts = opts.embedTexts || provider.embedTexts;
  const queryVec = await cachedEmbed(knex, text, {
    embedFn: async (t) => (await embedTexts([t], { kind: "query", env }))[0],
  });
  if (!Array.isArray(queryVec) || !queryVec.length) return out;

  if (isPostgresKnex(knex)) {
    // Consent is re-read in the join: a withdrawn profile's chunks are purged,
    // and even a purge that lagged is filtered out here.
    const { rows } = await knex.raw(
      `SELECT DISTINCT ON (c.profile_id) c.profile_id, c.kind, c.text, c.image_id,
              1 - (c.embedding <=> ?::vector) AS sim
         FROM discover_chunks c
         JOIN profiles p ON p.id = c.profile_id
        WHERE c.profile_id = ANY(?::uuid[])
          AND p.embedding_processing_consent = TRUE
          AND c.embedding IS NOT NULL
        ORDER BY c.profile_id, sim DESC`,
      [toVectorLiteral(queryVec), candidateIds],
    );
    for (const row of rows || []) {
      out.set(row.profile_id, {
        sim: Number(row.sim),
        kind: row.kind,
        text: row.text,
        image_id: row.image_id,
      });
    }
    return out;
  }

  const rows = await knex("discover_chunks as c")
    .join("profiles as p", "p.id", "c.profile_id")
    .whereIn("c.profile_id", candidateIds)
    .where(function consented() {
      this.where("p.embedding_processing_consent", true).orWhere(
        "p.embedding_processing_consent",
        1,
      );
    })
    .select("c.profile_id", "c.kind", "c.text", "c.image_id", "c.embedding_json");
  for (const row of rows) {
    const vec = parseVector(row.embedding_json);
    if (!vec) continue;
    const sim = 1 - cosineDistance(queryVec, vec);
    const best = out.get(row.profile_id);
    if (!best || sim > best.sim) {
      out.set(row.profile_id, { sim, kind: row.kind, text: row.text, image_id: row.image_id });
    }
  }
  return out;
}

/**
 * Reciprocal Rank Fusion of two orderings over the same items.
 * @param {Array<{id:string, sim:number|null, lexical:number}>} entries
 * @returns {Map<string, number>} fused score per id (higher is better)
 */
function fuseRanks(entries) {
  const scores = new Map(entries.map((e) => [e.id, 0]));
  const bySim = entries.filter((e) => Number.isFinite(e.sim)).sort((a, b) => b.sim - a.sim);
  bySim.forEach((e, i) => scores.set(e.id, scores.get(e.id) + 1 / (RRF_K + i + 1)));
  const byLex = entries.filter((e) => e.lexical > 0).sort((a, b) => b.lexical - a.lexical);
  byLex.forEach((e, i) => scores.set(e.id, scores.get(e.id) + 1 / (RRF_K + i + 1)));
  return scores;
}

/**
 * The full text of each candidate's chunks, joined, for the reranker's
 * document. Consent is re-read in the join as in scoreCandidates.
 */
async function loadChunkTexts(knex, profileIds) {
  const out = new Map();
  if (!profileIds.length || !(await knex.schema.hasTable("discover_chunks"))) return out;
  const rows = await knex("discover_chunks as c")
    .join("profiles as p", "p.id", "c.profile_id")
    .whereIn("c.profile_id", profileIds)
    .where(function consented() {
      this.where("p.embedding_processing_consent", true).orWhere(
        "p.embedding_processing_consent",
        1,
      );
    })
    .orderBy(["c.profile_id", "c.kind", "c.chunk_key"])
    .select("c.profile_id", "c.text");
  for (const row of rows) {
    out.set(row.profile_id, [...(out.get(row.profile_id) || []), row.text]);
  }
  return new Map([...out.entries()].map(([id, texts]) => [id, texts.join(" ")]));
}

/**
 * Re-order the head of a group with the cross-encoder when enabled. Entries
 * without a document keep their fused position after the reranked head.
 * @param {import('knex').Knex} knex
 * @param {string} queryText
 * @param {Array<{profile:{id:string}}>} entries — already fused
 * @param {{ topN?: number, rerankFn?: Function, env?: object }} [opts]
 */
async function rerankTop(knex, queryText, entries, opts = {}) {
  const env = opts.env || process.env;
  const reranker = require("../../../ai/rerank-provider");
  if (!opts.rerankFn && reranker.rerankMode(env) !== "cohere") return entries;
  const topN = opts.topN || 50;
  const head = entries.slice(0, topN);
  const tail = entries.slice(topN);
  const docs = await loadChunkTexts(knex, head.map((e) => e.profile.id));
  const withDocs = head.filter((e) => docs.has(e.profile.id));
  const withoutDocs = head.filter((e) => !docs.has(e.profile.id));
  if (!withDocs.length) return entries;
  const fn = opts.rerankFn || ((q, d) => reranker.rerank(q, d, { env }));
  let results;
  try {
    results = await fn(queryText, withDocs.map((e) => docs.get(e.profile.id)));
  } catch (err) {
    console.warn(`[discover-semantic] rerank failed: ${err.message}`);
    return entries;
  }
  if (!Array.isArray(results) || !results.length) return entries;
  const seen = new Set();
  const reordered = [];
  for (const r of results) {
    const entry = withDocs[r.index];
    if (!entry || seen.has(entry.profile.id)) continue;
    seen.add(entry.profile.id);
    reordered.push(entry);
  }
  for (const entry of withDocs) if (!seen.has(entry.profile.id)) reordered.push(entry);
  return [...reordered, ...withoutDocs, ...tail];
}

function trimQuote(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= WHY_MAX_CHARS) return t;
  const cut = t.slice(0, WHY_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : WHY_MAX_CHARS).trim()}…`;
}

/**
 * The card's explanation for a semantic match: the talent's own words or the
 * book's description, never a number. Null under the floor.
 */
function buildWhy(best, env = process.env) {
  if (!best || !Number.isFinite(best.sim) || best.sim < minSim(env)) return null;
  const quote = trimQuote(best.text);
  if (!quote) return null;
  if (best.kind === "bio") return `From their bio: “${quote}”`;
  if (best.kind === "photo") return `From their book: ${quote.replace(/\.$/, "")}`;
  return quote;
}

module.exports = {
  semanticMode,
  minSim,
  scoreCandidates,
  fuseRanks,
  buildWhy,
  loadChunkTexts,
  rerankTop,
  RRF_K,
};
