/**
 * Hybrid Discover multi-retriever + RRF fusion.
 */

"use strict";

const {
  embed,
  toVectorLiteral,
  isPostgresKnex,
  cosineDistance,
  loadEmbeddingCacheMap,
} = require("../../ai/embeddings");

const RETRIEVAL_TOP_K =
  parseInt(process.env.DISCOVER_RETRIEVAL_TOP_K, 10) || 80;
const RRF_K = parseInt(process.env.DISCOVER_RRF_K, 10) || 60;

const DENSE_LEGS = [
  { leg: "dense_visual", source: "visual", channelKey: "visual" },
  { leg: "dense_casting", source: "casting", channelKey: "casting" },
  { leg: "dense_market", source: "market", channelKey: "market" },
];

/**
 * Eligible discoverable profile IDs (prefilter).
 */
async function loadEligibleProfileIds(knex, explicitFilters) {
  let query = knex("profiles")
    .where({
      is_discoverable: true,
      profile_status: "active",
    })
    .whereNotNull("bio_curated")
    .select("profiles.id");

  if (explicitFilters.city) {
    query.whereILike("profiles.city", `%${explicitFilters.city}%`);
  }
  if (explicitFilters.letter) {
    query.whereILike("profiles.last_name", `${explicitFilters.letter}%`);
  }
  if (explicitFilters.search) {
    query.andWhere((qb) => {
      qb.whereILike(
        "profiles.first_name",
        `%${explicitFilters.search}%`,
      ).orWhereILike("profiles.last_name", `%${explicitFilters.search}%`);
    });
  }
  if (explicitFilters.min_height != null) {
    query.where("profiles.height_cm", ">=", explicitFilters.min_height);
  }
  if (explicitFilters.max_height != null) {
    query.where("profiles.height_cm", "<=", explicitFilters.max_height);
  }
  if (explicitFilters.min_age != null) {
    query.where("profiles.age", ">=", explicitFilters.min_age);
  }
  if (explicitFilters.max_age != null) {
    query.where("profiles.age", "<=", explicitFilters.max_age);
  }
  if (explicitFilters.gender) {
    query.whereRaw("LOWER(profiles.gender) = ?", [
      String(explicitFilters.gender).toLowerCase(),
    ]);
  }
  if (explicitFilters.eye_color) {
    query.where("profiles.eye_color", explicitFilters.eye_color);
  }
  if (explicitFilters.hair_color) {
    query.where("profiles.hair_color", explicitFilters.hair_color);
  }
  if (explicitFilters.archetype) {
    const archetype = explicitFilters.archetype;
    query.andWhere((qb) => {
      qb.where("profiles.archetype", archetype);
      if (isPostgresKnex(knex)) {
        qb.orWhereRaw("profiles.modeling_categories::jsonb @> ?::jsonb", [
          JSON.stringify([archetype]),
        ]).orWhereRaw("profiles.specialties::jsonb @> ?::jsonb", [
          JSON.stringify([archetype]),
        ]);
      } else {
        qb.orWhere("profiles.modeling_categories", "like", `%"${archetype}"%`)
          .orWhere("profiles.specialties", "like", `%"${archetype}"%`);
      }
    });
  }
  if (explicitFilters.experience_level) {
    query.where("profiles.experience_level", explicitFilters.experience_level);
  }

  const rows = await query;
  return new Set(rows.map((r) => r.id));
}

async function denseLegPostgres(knex, source, queryVec, eligibleIds, topK) {
  if (!eligibleIds.size) return [];

  const vectorLiteral = toVectorLiteral(queryVec);
  const result = await knex.raw(
    `SELECT tte.profile_id, (tte.embedding <=> ?::vector) AS distance
     FROM talent_text_embeddings tte
     JOIN profiles p ON p.id = tte.profile_id
     WHERE tte.source = ?
       AND tte.embedding IS NOT NULL
       AND p.is_discoverable = true
       AND p.profile_status = 'active'
       AND p.bio_curated IS NOT NULL
     ORDER BY tte.embedding <=> ?::vector
     LIMIT ?`,
    [vectorLiteral, source, vectorLiteral, topK * 2],
  );

  const rows = result?.rows || [];
  const hits = [];
  for (const row of rows) {
    if (!eligibleIds.has(row.profile_id)) continue;
    hits.push({
      profileId: row.profile_id,
      score: 1 - Number(row.distance),
      leg: `dense_${source === "visual" ? "visual" : source === "casting" ? "casting" : "market"}`,
    });
    if (hits.length >= topK) break;
  }
  return hits;
}

async function denseLegSqlite(knex, source, queryVec, eligibleIds, topK, leg) {
  const cacheRows = await knex("talent_embedding_cache")
    .where({ source })
    .select("profile_id", "embedding_json");

  const scored = [];
  for (const row of cacheRows) {
    if (!eligibleIds.has(row.profile_id)) continue;
    try {
      const vec = JSON.parse(row.embedding_json);
      const dist = cosineDistance(queryVec, vec);
      scored.push({
        profileId: row.profile_id,
        score: 1 - dist,
        leg,
      });
    } catch {
      // skip corrupt
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

async function lexicalLegPostgres(knex, lexicalQuery, eligibleIds, topK) {
  if (!lexicalQuery?.trim() || !eligibleIds.size) return [];

  const result = await knex.raw(
    `SELECT p.id AS profile_id,
            ts_rank(p.search_vector, plainto_tsquery('english', ?)) AS score
     FROM profiles p
     WHERE p.search_vector @@ plainto_tsquery('english', ?)
       AND p.is_discoverable = true
       AND p.profile_status = 'active'
       AND p.bio_curated IS NOT NULL
     ORDER BY score DESC
     LIMIT ?`,
    [lexicalQuery, lexicalQuery, topK * 2],
  );

  const rows = result?.rows || [];
  const hits = [];
  for (const row of rows) {
    if (!eligibleIds.has(row.profile_id)) continue;
    hits.push({
      profileId: row.profile_id,
      score: Number(row.score) || 0,
      leg: "lexical",
    });
    if (hits.length >= topK) break;
  }
  return hits;
}

async function lexicalLegSqlite(knex, lexicalQuery, eligibleIds, topK) {
  const hasFts = await knex.schema.hasTable("profiles_fts");
  if (!hasFts || !lexicalQuery?.trim() || !eligibleIds.size) return [];

  const tokens = lexicalQuery
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-z0-9_-]/g, ""))
    .filter(Boolean);

  if (!tokens.length) return [];

  const matchQuery = tokens.map((t) => `"${t}"`).join(" OR ");

  try {
    const rows = await knex.raw(
      `SELECT profile_id, bm25(profiles_fts) AS bm
       FROM profiles_fts
       WHERE profiles_fts MATCH ?
       ORDER BY bm
       LIMIT ?`,
      [matchQuery, topK * 2],
    );

    const resultRows = rows || [];
    const hits = [];
    for (const row of resultRows) {
      if (!eligibleIds.has(row.profile_id)) continue;
      hits.push({
        profileId: row.profile_id,
        score: Math.abs(Number(row.bm) || 0),
        leg: "lexical",
      });
      if (hits.length >= topK) break;
    }
    return hits;
  } catch {
    return [];
  }
}

function heritageMatches(profile, value) {
  const term = String(value).toLowerCase();
  let ethnicity = profile.ethnicity;
  if (typeof ethnicity === "string") {
    try {
      ethnicity = JSON.parse(ethnicity);
    } catch {
      ethnicity = [ethnicity];
    }
  }
  if (Array.isArray(ethnicity)) {
    if (ethnicity.some((e) => String(e).toLowerCase().includes(term))) {
      return true;
    }
  }
  const bio = (profile.bio_curated || "").toLowerCase();
  const skin = (profile.skin_tone || "").toLowerCase();
  return bio.includes(term) || skin.includes(term);
}

function structuredBoostForProfile(profile, constraints) {
  let boost = 0;
  const legHits = {};

  for (const c of constraints || []) {
    if (!c || c.confidence < 0.5) continue;
    const conf = Number(c.confidence) || 0.5;
    const increment = 0.1 + conf * 0.2;

    if (c.field === "gender") {
      if (
        profile.gender &&
        String(profile.gender).toLowerCase() === String(c.value).toLowerCase()
      ) {
        boost += increment;
        legHits.gender = increment;
      }
    } else if (c.field === "heritage") {
      if (heritageMatches(profile, c.value)) {
        boost += increment;
        legHits.heritage = increment;
      }
    } else if (c.field === "hair_color") {
      if (
        profile.hair_color &&
        String(profile.hair_color)
          .toLowerCase()
          .includes(String(c.value).toLowerCase())
      ) {
        boost += increment;
        legHits.hair_color = increment;
      }
    } else if (c.field === "eye_color") {
      if (
        profile.eye_color &&
        String(profile.eye_color)
          .toLowerCase()
          .includes(String(c.value).toLowerCase())
      ) {
        boost += increment;
        legHits.eye_color = increment;
      }
    } else if (c.field === "min_height" && profile.height_cm != null) {
      if (profile.height_cm >= Number(c.value)) {
        boost += increment;
        legHits.height = increment;
      }
    } else if (c.field === "archetype") {
      if (profile.archetype === c.value) {
        boost += increment;
        legHits.archetype = increment;
      }
    } else if (c.field === "city" && profile.city) {
      if (profile.city.toLowerCase().includes(String(c.value).toLowerCase())) {
        boost += increment;
        legHits.city = increment;
      }
    }
  }

  return { boost, legHits };
}

async function structuredLeg(knex, constraints, eligibleIds, topK) {
  if (!constraints?.length || !eligibleIds.size) return [];

  const ids = [...eligibleIds];
  const profiles = await knex("profiles").whereIn("id", ids).select("*");

  const scored = profiles
    .map((profile) => {
      const { boost } = structuredBoostForProfile(profile, constraints);
      if (boost <= 0) return null;
      return { profileId: profile.id, score: boost, leg: "structured" };
    })
    .filter(Boolean);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Reciprocal rank fusion across retrieval legs.
 * @param {Array<Array<{ profileId: string, score: number, leg: string }>>} legResults
 * @param {number} k
 * @returns {Array<{ profileId: string, rrfScore: number, legRanks: Object }>}
 */
function reciprocalRankFusion(legResults, k = RRF_K) {
  const scores = new Map();

  for (const leg of legResults) {
    leg.forEach((hit, rank) => {
      const rrf = 1 / (k + rank + 1);
      const existing = scores.get(hit.profileId) || {
        profileId: hit.profileId,
        rrfScore: 0,
        legRanks: {},
        legScores: {},
      };
      existing.rrfScore += rrf;
      existing.legRanks[hit.leg] = rank + 1;
      existing.legScores[hit.leg] = hit.score;
      scores.set(hit.profileId, existing);
    });
  }

  return [...scores.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Run all retrieval legs and fuse with RRF.
 *
 * @param {import('knex').Knex} knex
 * @param {Object} understanding — from query-understanding
 * @param {Object} explicitFilters — hard gates from explicit query params only
 * @returns {Promise<{ fused: Array, legs: Object, legsUsed: string[] }>}
 */
async function retrieveAndFuse(knex, understanding, explicitFilters = {}) {
  const topK = RETRIEVAL_TOP_K;
  const channelQueries = understanding.channel_queries || {};
  const eligibleIds = await loadEligibleProfileIds(knex, explicitFilters);

  const legsUsed = [];
  const legResults = [];

  const denseEmbeds = {};
  for (const { leg, source, channelKey } of DENSE_LEGS) {
    const qText = channelQueries[channelKey] || understanding.residual_query;
    if (!qText?.trim()) continue;

    const queryVec = await embed(qText);
    denseEmbeds[leg] = queryVec;

    let hits;
    if (isPostgresKnex(knex)) {
      hits = await denseLegPostgres(knex, source, queryVec, eligibleIds, topK);
    } else {
      hits = await denseLegSqlite(
        knex,
        source,
        queryVec,
        eligibleIds,
        topK,
        leg,
      );
    }

    if (hits.length) {
      legsUsed.push(leg);
      legResults.push(hits);
    }
  }

  const lexicalQuery = channelQueries.lexical || understanding.residual_query;
  let lexicalHits;
  if (isPostgresKnex(knex)) {
    lexicalHits = await lexicalLegPostgres(
      knex,
      lexicalQuery,
      eligibleIds,
      topK,
    );
  } else {
    lexicalHits = await lexicalLegSqlite(knex, lexicalQuery, eligibleIds, topK);
  }
  if (lexicalHits.length) {
    legsUsed.push("lexical");
    legResults.push(lexicalHits);
  }

  const structuredHits = await structuredLeg(
    knex,
    understanding.constraints,
    eligibleIds,
    topK,
  );
  if (structuredHits.length) {
    legsUsed.push("structured");
    legResults.push(structuredHits);
  }

  const fused = reciprocalRankFusion(legResults, RRF_K);

  return {
    fused,
    legs: legResults,
    legsUsed,
    eligibleCount: eligibleIds.size,
  };
}

module.exports = {
  retrieveAndFuse,
  reciprocalRankFusion,
  structuredBoostForProfile,
  loadEligibleProfileIds,
  RETRIEVAL_TOP_K,
  RRF_K,
};
