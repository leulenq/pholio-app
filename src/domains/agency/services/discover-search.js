/**
 * Discover semantic search service.
 *
 * Multi-vector fusion: discover_index text + Scout image embeddings.
 * Falls back to browse mode when q is empty or no OPENAI_API_KEY.
 * SQLite uses talent_embedding_cache + in-process cosine distance.
 */

"use strict";

const {
  embed,
  toVectorLiteral,
  isPostgresKnex,
  fusedDistance,
  loadEmbeddingCacheMap,
  cosineDistance,
  profileEmbeddingFeatureEnabled,
  embeddingStorageSource,
  adultDateOfBirthUpperBoundExclusive,
} = require("../../ai/embeddings");
const { parseIntentToFilters } = require("../lib/intent-parser");
const { understandQuery } = require("./query-understanding");
const { retrieveAndFuse } = require("./discover-retrieval");
const { rerankCandidates } = require("./discover-rerank");
const {
  AUDIENCE,
  buildAgencyDiscoveryDTO,
  loadTalentRepresentationsForProfiles,
} = require("../../../shared/lib/audience-dto");
const {
  selectColumnsForAudience,
  applyImageVisibility,
  isAgencyDiscoverable,
} = require("../../../shared/lib/profile-visibility");
const {
  ensureModerationColumnChecked,
} = require("../../../shared/lib/content-moderation");
const {
  loadSocialAccountsForProfiles,
} = require("../../../shared/lib/social-accounts");

/**
 * Convert min/max age filters into UTC date-of-birth cutoff STRINGS (YYYY-MM-DD)
 * derived from the reference date. Replaces any reliance on a stored
 * `profiles.age` column (audit P0-7): age is always derived from DOB.
 *
 * Boundaries (today = referenceDate):
 *   - age >= minAge  ⟺  DOB <  (today - minAge years) + 1 day   [strict <]
 *   - age <= maxAge  ⟺  DOB >= (today - (maxAge+1) years) + 1 day
 *
 * The strict `<` upper bound (an exclusive next-day date string) makes the
 * comparison correct for BOTH a date-only DOB ("1995-03-15") and a full ISO
 * timestamp DOB ("1995-03-15T05:00:00.000Z") under plain string/date ordering,
 * so it behaves identically on SQLite and Postgres without DB date math.
 */
function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function ageFilterDobCutoffs(minAge, maxAge, referenceDate = new Date()) {
  const y = referenceDate.getUTCFullYear();
  const m = referenceDate.getUTCMonth();
  const d = referenceDate.getUTCDate();
  const out = {};
  if (minAge != null) {
    const base = new Date(Date.UTC(y - minAge, m, d));
    base.setUTCDate(base.getUTCDate() + 1);
    out.maxDobExclusive = utcDateString(base);
  }
  if (maxAge != null) {
    const base = new Date(Date.UTC(y - (maxAge + 1), m, d));
    base.setUTCDate(base.getUTCDate() + 1);
    out.minDobInclusive = utcDateString(base);
  }
  return out;
}

function isDiscoverHybridEnabled() {
  return (
    process.env.DISCOVER_HYBRID === "true" ||
    process.env.DISCOVER_HYBRID === "1"
  );
}

const config = require("../../../config");

/**
 * Resolve the active Discover engine at call time (env is authoritative so
 * tests/rollout can flip it without a process restart). DISCOVER_ENGINE wins
 * when set to a valid value; DISCOVER_HYBRID=true is the legacy 'hybrid' alias.
 */
function resolveDiscoverEngine() {
  const raw = (process.env.DISCOVER_ENGINE || "").trim().toLowerCase();
  if (raw === "launch" || raw === "hybrid" || raw === "browse") return raw;
  if (isDiscoverHybridEnabled()) return "hybrid";
  return config.discover.engine || "hybrid";
}

function discoverCorpusThreshold() {
  return (
    parseInt(process.env.DISCOVER_CORPUS_THRESHOLD, 10) ||
    config.discover.corpusThreshold ||
    2500
  );
}
// Launch selection is text-only. Image/appearance vectors are deliberately
// retired, so the public metadata must not imply that they influence ranking.
const TEXT_WEIGHT = 1;
const IMAGE_WEIGHT = 0;
const MAX_DISTANCE = parseFloat(process.env.DISCOVER_MAX_DISTANCE) || 0.55;

/**
 * Merge explicit query-param filters with intent-derived filters.
 * Explicit params win when both are set.
 */
function mergeFilters(queryParams, intentFilters) {
  const merged = { ...intentFilters };

  const keys = [
    "city",
    "gender",
    "archetype",
    "experience_level",
    "min_height",
    "max_height",
    "min_age",
    "max_age",
    "eye_color",
    "hair_color",
    "letter",
    "search",
  ];

  for (const key of keys) {
    const value = queryParams[key];
    if (value !== undefined && value !== null && value !== "") {
      if (
        key === "min_height" ||
        key === "max_height" ||
        key === "min_age" ||
        key === "max_age"
      ) {
        const num = parseInt(value, 10);
        if (!Number.isNaN(num)) merged[key] = num;
      } else {
        merged[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Extract only explicit query-param filters (hard gates in hybrid mode).
 */
function extractExplicitFilters(queryParams) {
  return mergeFilters(queryParams, {});
}

/**
 * Apply discover hard filters to a knex query builder.
 */
function applyDiscoverFilters(query, filters, knex) {
  if (filters.city) {
    query.whereILike("profiles.city", `%${filters.city}%`);
  }

  if (filters.letter) {
    query.whereILike("profiles.last_name", `${filters.letter}%`);
  }

  if (filters.search) {
    query.andWhere((qb) => {
      qb.whereILike("profiles.first_name", `%${filters.search}%`).orWhereILike(
        "profiles.last_name",
        `%${filters.search}%`,
      );
    });
  }

  if (filters.min_height != null) {
    query.where("profiles.height_cm", ">=", filters.min_height);
  }
  if (filters.max_height != null) {
    query.where("profiles.height_cm", "<=", filters.max_height);
  }

  if (filters.min_age != null || filters.max_age != null) {
    const { maxDobExclusive, minDobInclusive } = ageFilterDobCutoffs(
      filters.min_age != null ? filters.min_age : null,
      filters.max_age != null ? filters.max_age : null,
    );
    if (maxDobExclusive) {
      query.where("profiles.date_of_birth", "<", maxDobExclusive);
    }
    if (minDobInclusive) {
      query.where("profiles.date_of_birth", ">=", minDobInclusive);
    }
  }

  if (filters.gender) {
    query.whereRaw("LOWER(profiles.gender) = ?", [
      String(filters.gender).toLowerCase(),
    ]);
  }

  if (filters.heritage) {
    // Compliance follow-up (WS5 / spec §0.3): skin tone must NOT be a search
    // signal in ANY engine. The skin_tone match was removed here — the column
    // stays, but query-time matching on it does not.
    // ethnicity is jsonb on Postgres; COALESCE(..., '') casts '' → jsonb and
    // throws "invalid input syntax for type json". Cast to text first.
    const term = String(filters.heritage).toLowerCase();
    const ethnicityExpr = isPostgresKnex(knex)
      ? "LOWER(COALESCE(profiles.ethnicity::text, '')) LIKE ?"
      : "LOWER(COALESCE(profiles.ethnicity, '')) LIKE ?";
    query.andWhere((qb) => {
      qb.whereRaw(ethnicityExpr, [`%${term}%`]).orWhereRaw(
        "LOWER(COALESCE(profiles.bio_curated, '')) LIKE ?",
        [`%${term}%`],
      );
    });
  }

  if (filters.eye_color) {
    query.where("profiles.eye_color", filters.eye_color);
  }

  if (filters.hair_color) {
    query.where("profiles.hair_color", filters.hair_color);
  }

  if (filters.archetype) {
    const archetype = filters.archetype;
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

  if (filters.experience_level) {
    query.where("profiles.experience_level", filters.experience_level);
  }

  return query;
}

function baseDiscoverQuery(knex) {
  return knex("profiles")
    .select(
      selectColumnsForAudience(AUDIENCE.AGENCY_DISCOVERY, { table: "profiles" }),
    )
    .where({
      "profiles.is_discoverable": true,
      "profiles.profile_status": "active",
    })
    .whereNotNull("profiles.bio_curated");
}

async function fetchApplicationMap(knex, agencyId) {
  const existingApplications = await knex("applications")
    .where({ agency_id: agencyId })
    .select("profile_id", "invited_by_agency_id");

  const applicationMap = new Map();
  existingApplications.forEach((app) => {
    applicationMap.set(app.profile_id, app);
  });
  return applicationMap;
}

async function attachImagesAndInvites(knex, profiles, applicationMap, agencyId) {
  const profileIds = profiles.map((p) => p.id).filter(Boolean);
  let allImages = [];
  if (profileIds.length > 0) {
    await ensureModerationColumnChecked(knex);
    const imageQuery = knex("images").whereIn("profile_id", profileIds);
    applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
      table: "images",
    });
    allImages = await imageQuery.orderBy(["profile_id", "sort", "created_at"]);
  }

  const imagesByProfile = {};
  allImages.forEach((img) => {
    if (!imagesByProfile[img.profile_id]) {
      imagesByProfile[img.profile_id] = [];
    }
    imagesByProfile[img.profile_id].push(img);
  });

  // Single batched query for the whole result page — avoids N+1
  // (audit P1-4: Discover readers must join social_accounts, not read dead
  // profile columns). The DTO itself still gates adults-only / minor.
  const socialByProfile = await loadSocialAccountsForProfiles(profileIds);

  // Representation status (WS6.1 / LB-5) — batch-loaded per result page so
  // deriveRepresentationStatus sees the talent_representations rows instead of
  // only the legacy fallback fields. Safe no-op when the table is absent.
  const repsByProfile = await loadTalentRepresentationsForProfiles(profileIds, {
    db: knex,
  });

  const shaped = [];
  for (const profile of profiles) {
    // Deny-by-default gate: minors (no named-agency guardian auth) and profiles
    // that exclude this agency never reach the DTO layer.
    if (!isAgencyDiscoverable(profile, { agencyId })) continue;

    // Static-allowlist DTO — a raw row / owner email can never leak here.
    // Social accounts are joined above and merged per-profile; the DTO itself
    // suppresses them for minors regardless of what is passed in.
    const dto = buildAgencyDiscoveryDTO(profile, {
      images: imagesByProfile[profile.id] || [],
      social: socialByProfile.get(profile.id) || [],
      representations: repsByProfile.get(profile.id) || [],
    });

    const app = applicationMap.get(profile.id);
    dto.is_invited = !!app;

    // Re-attach the search/match metadata that lives OUTSIDE the profile
    // allowlist (the DTO deliberately drops anything it doesn't recognize).
    if (profile.match_breakdown && typeof profile.match_breakdown === "object") {
      dto.match_score = profile.match_score ?? null;
      dto.match_breakdown = profile.match_breakdown;
      dto.match_rationale = profile.match_rationale ?? null;
    } else if (profile.vibe_distance != null) {
      dto.vibe_distance = profile.vibe_distance;
      dto.match_breakdown = {
        text: profile.text_dist != null ? Number(profile.text_dist) : null,
        image: profile.image_dist != null ? Number(profile.image_dist) : null,
      };
    }

    shaped.push(dto);
  }
  return shaped;
}

function canUseSemanticSearch(_knex, q) {
  return !!(
    profileEmbeddingFeatureEnabled() &&
    q &&
    q.trim() &&
    process.env.OPENAI_API_KEY
  );
}

/** Relaxed threshold when intent-derived demographic filters already narrowed SQL results. */
function effectiveMaxDistance(filters) {
  if (filters.heritage || filters.gender) {
    return 1.0;
  }
  return MAX_DISTANCE;
}

function semanticUnavailableReason(_knex, q) {
  if (!q || !q.trim()) return null;
  if (!profileEmbeddingFeatureEnabled()) return "feature_disabled";
  if (!process.env.OPENAI_API_KEY) return "missing_api_key";
  return null;
}

async function browseSearch(knex, ctx) {
  const {
    filters,
    sort,
    pageNum,
    limitNum,
    offset,
    applicationMap,
    agencyId,
    intent,
    q,
  } = ctx;

  let query = baseDiscoverQuery(knex);
  applyDiscoverFilters(query, filters, knex);

  const countQuery = query
    .clone()
    .clearSelect()
    .clearOrder()
    .count("* as count");
  const [countResult] = await countQuery;
  const totalCount = parseInt(countResult?.count || 0, 10);
  const totalPages = Math.ceil(totalCount / limitNum) || 0;

  if (sort === "city") {
    query.orderBy(["profiles.city", "profiles.last_name"]);
  } else if (sort === "newest") {
    query.orderBy("profiles.created_at", "desc");
  } else {
    query.orderBy(["profiles.last_name", "profiles.first_name"]);
  }

  const profiles = await query.limit(limitNum).offset(offset);
  const enriched = await attachImagesAndInvites(
    knex,
    profiles,
    applicationMap,
    agencyId,
  );

  const unavailableReason = semanticUnavailableReason(knex, q);

  return {
    profiles: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    meta: {
      semantic_search: false,
      query: q && q.trim() ? q : null,
      parsed_intent: intent?.facets?.length ? { facets: intent.facets } : null,
      semantic_unavailable_reason: unavailableReason,
    },
  };
}

/**
 * Build parameterized WHERE fragments for semantic raw SQL.
 * @returns {{ sql: string, bindings: unknown[] }}
 */
function buildSemanticWhereClause(filters) {
  const clauses = [
    "profiles.is_discoverable = true",
    "profiles.profile_status = 'active'",
    "profiles.bio_curated IS NOT NULL",
    "profiles.embedding_processing_consent = true",
    "profiles.date_of_birth IS NOT NULL",
    "profiles.date_of_birth < ?",
  ];
  const bindings = [adultDateOfBirthUpperBoundExclusive()];

  if (filters.city) {
    clauses.push("profiles.city ILIKE ?");
    bindings.push(`%${filters.city}%`);
  }
  if (filters.letter) {
    clauses.push("profiles.last_name ILIKE ?");
    bindings.push(`${filters.letter}%`);
  }
  if (filters.search) {
    clauses.push("(profiles.first_name ILIKE ? OR profiles.last_name ILIKE ?)");
    bindings.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.min_height != null) {
    clauses.push("profiles.height_cm >= ?");
    bindings.push(filters.min_height);
  }
  if (filters.max_height != null) {
    clauses.push("profiles.height_cm <= ?");
    bindings.push(filters.max_height);
  }
  if (filters.min_age != null || filters.max_age != null) {
    const { maxDobExclusive, minDobInclusive } = ageFilterDobCutoffs(
      filters.min_age != null ? filters.min_age : null,
      filters.max_age != null ? filters.max_age : null,
    );
    if (maxDobExclusive) {
      clauses.push("profiles.date_of_birth < ?");
      bindings.push(maxDobExclusive);
    }
    if (minDobInclusive) {
      clauses.push("profiles.date_of_birth >= ?");
      bindings.push(minDobInclusive);
    }
  }
  if (filters.gender) {
    clauses.push("LOWER(profiles.gender) = ?");
    bindings.push(String(filters.gender).toLowerCase());
  }
  if (filters.heritage) {
    // Compliance follow-up (WS5 / spec §0.3): skin tone is never a search
    // signal — the skin_tone clause was removed from this matcher too.
    // Semantic SQL is Postgres-only; ethnicity is jsonb — cast before LIKE.
    const term = String(filters.heritage).toLowerCase();
    clauses.push(
      `(LOWER(COALESCE(profiles.ethnicity::text, '')) LIKE ?
        OR LOWER(COALESCE(profiles.bio_curated, '')) LIKE ?)`,
    );
    bindings.push(`%${term}%`, `%${term}%`);
  }
  if (filters.eye_color) {
    clauses.push("profiles.eye_color = ?");
    bindings.push(filters.eye_color);
  }
  if (filters.hair_color) {
    clauses.push("profiles.hair_color = ?");
    bindings.push(filters.hair_color);
  }
  if (filters.archetype) {
    clauses.push(
      "(profiles.archetype = ? OR profiles.modeling_categories::jsonb @> ?::jsonb OR profiles.specialties::jsonb @> ?::jsonb)",
    );
    bindings.push(
      filters.archetype,
      JSON.stringify([filters.archetype]),
      JSON.stringify([filters.archetype]),
    );
  }
  if (filters.experience_level) {
    clauses.push("profiles.experience_level = ?");
    bindings.push(filters.experience_level);
  }

  return { sql: clauses.join(" AND "), bindings };
}

function extractCount(result) {
  const row = result?.rows?.[0] ?? result?.[0];
  return parseInt(row?.count || 0, 10);
}

async function semanticSearch(knex, ctx) {
  if (!profileEmbeddingFeatureEnabled()) return browseSearch(knex, ctx);
  const { q, intent, filters, pageNum, limitNum, offset, applicationMap, agencyId } =
    ctx;
  const maxDistance = effectiveMaxDistance(filters);

  const softQuery = intent.softQuery || q;
  const queryEmbedding = await embed(softQuery);
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const { sql: whereSql, bindings: whereBindings } =
    buildSemanticWhereClause(filters);

  const candidatesCte = `
    SELECT
      profiles.id,
      (tte.embedding <=> ?::vector) AS text_dist,
      NULL::double precision AS image_dist,
      (tte.embedding <=> ?::vector) AS fused_distance
    FROM profiles
    JOIN talent_text_embeddings tte
      ON tte.profile_id = profiles.id AND tte.source = ?
    WHERE ${whereSql}
  `;

  const cteBindings = [
    vectorLiteral,
    vectorLiteral,
    embeddingStorageSource("discover_index"),
    ...whereBindings,
  ];

  const countResult = await knex.raw(
    `WITH candidates AS (${candidatesCte})
     SELECT COUNT(*)::int AS count FROM candidates
     WHERE fused_distance IS NOT NULL AND fused_distance <= ?`,
    [...cteBindings, maxDistance],
  );
  const totalCount = extractCount(countResult);

  const excludedResult = await knex.raw(
    `WITH candidates AS (${candidatesCte})
     SELECT COUNT(*)::int AS count FROM candidates
     WHERE fused_distance IS NOT NULL AND fused_distance > ?`,
    [...cteBindings, maxDistance],
  );
  const resultsAboveThreshold = extractCount(excludedResult);

  const totalPages = Math.ceil(totalCount / limitNum) || 0;

  const discoverCols = selectColumnsForAudience(AUDIENCE.AGENCY_DISCOVERY, {
    table: "p",
  }).join(", ");

  const dataResult = await knex.raw(
    `WITH candidates AS (${candidatesCte})
     SELECT
       ${discoverCols},
       c.text_dist,
       c.image_dist,
       c.fused_distance AS vibe_distance
     FROM candidates c
     JOIN profiles p ON p.id = c.id
     WHERE c.fused_distance IS NOT NULL AND c.fused_distance <= ?
     ORDER BY c.fused_distance ASC
     LIMIT ?
     OFFSET ?`,
    [...cteBindings, maxDistance, limitNum, offset],
  );

  const profiles = dataResult?.rows || [];
  const enriched = await attachImagesAndInvites(
    knex,
    profiles,
    applicationMap,
    agencyId,
  );

  return {
    profiles: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    meta: {
      semantic_search: true,
      query: q,
      parsed_intent: { facets: intent.facets },
      fusion_weights: { text: TEXT_WEIGHT, image: IMAGE_WEIGHT },
      max_distance: maxDistance,
      results_above_threshold: resultsAboveThreshold,
      storage: "pgvector",
    },
  };
}

async function hybridSearch(knex, ctx) {
  if (!profileEmbeddingFeatureEnabled()) return browseSearch(knex, ctx);
  const {
    q,
    intent,
    explicitFilters,
    pageNum,
    limitNum,
    offset,
    applicationMap,
    agencyId,
  } = ctx;

  const understanding = await understandQuery(q);
  const { fused, legsUsed, eligibleCount } = await retrieveAndFuse(
    knex,
    understanding,
    explicitFilters,
  );

  const { ranked, provider } = await rerankCandidates(q, fused, knex);

  const totalCount = ranked.length;
  const totalPages = Math.ceil(totalCount / limitNum) || 0;
  const pageSlice = ranked.slice(offset, offset + limitNum);
  const pageIds = pageSlice.map((item) => item.profileId);

  const profileRows =
    pageIds.length > 0
      ? await knex("profiles")
          .select(
            selectColumnsForAudience(AUDIENCE.AGENCY_DISCOVERY, {
              table: "profiles",
            }),
          )
          .whereIn("profiles.id", pageIds)
      : [];

  const profileRowMap = new Map(profileRows.map((p) => [p.id, p]));

  const profiles = pageSlice.map((item) => ({
    ...profileRowMap.get(item.profileId),
    match_score: item.match_score,
    match_breakdown: item.match_breakdown,
    match_rationale: item.match_rationale,
  }));

  const enriched = await attachImagesAndInvites(
    knex,
    profiles,
    applicationMap,
    agencyId,
  );

  return {
    profiles: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    meta: {
      semantic_search: true,
      hybrid: true,
      query: q,
      query_understanding: {
        attributes: understanding.attributes,
        constraints: understanding.constraints,
        channel_queries: understanding.channel_queries,
        source: understanding.source,
      },
      retrieval: {
        legs_used: legsUsed,
        candidates_before_rerank: fused.length,
        eligible_count: eligibleCount,
      },
      fusion: "rrf",
      rerank_provider: provider,
      parsed_intent: intent?.facets?.length ? { facets: intent.facets } : null,
      storage: isPostgresKnex(knex) ? "pgvector+fts" : "sqlite_cache+fts5",
    },
  };
}

async function semanticSearchSqlite(knex, ctx) {
  if (!profileEmbeddingFeatureEnabled()) return browseSearch(knex, ctx);
  const { q, intent, filters, pageNum, limitNum, offset, applicationMap, agencyId } =
    ctx;
  const maxDistance = effectiveMaxDistance(filters);

  const softQuery = intent.softQuery || q;
  const queryEmbedding = await embed(softQuery);

  let query = baseDiscoverQuery(knex);
  applyDiscoverFilters(query, filters, knex);
  const candidates = await query;

  const cacheMap = await loadEmbeddingCacheMap(
    knex,
    candidates.map((p) => p.id),
  );

  const scored = [];
  let resultsAboveThreshold = 0;

  for (const profile of candidates) {
    const cached = cacheMap.get(profile.id) || {};
    const textVec = cached.discover_index || null;
    const imageVec = null;
    const fused = fusedDistance(
      queryEmbedding,
      textVec,
      imageVec,
      TEXT_WEIGHT,
      IMAGE_WEIGHT,
    );

    if (fused == null) continue;

    const textDist = textVec ? cosineDistance(queryEmbedding, textVec) : null;
    const imageDist = imageVec
      ? cosineDistance(queryEmbedding, imageVec)
      : null;

    if (fused > maxDistance) {
      resultsAboveThreshold += 1;
      continue;
    }

    scored.push({
      ...profile,
      text_dist: textDist,
      image_dist: imageDist,
      vibe_distance: fused,
    });
  }

  scored.sort((a, b) => a.vibe_distance - b.vibe_distance);

  const totalCount = scored.length;
  const totalPages = Math.ceil(totalCount / limitNum) || 0;
  const pageSlice = scored.slice(offset, offset + limitNum);
  const enriched = await attachImagesAndInvites(
    knex,
    pageSlice,
    applicationMap,
    agencyId,
  );

  return {
    profiles: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    meta: {
      semantic_search: true,
      query: q,
      parsed_intent: { facets: intent.facets },
      fusion_weights: { text: TEXT_WEIGHT, image: IMAGE_WEIGHT },
      max_distance: maxDistance,
      results_above_threshold: resultsAboveThreshold,
      storage: "sqlite_cache",
    },
  };
}

/**
 * Search discoverable talent for the agency Discover page.
 *
 * @param {import('knex').Knex} knex
 * @param {Object} options
 */
async function searchDiscoverableTalent(knex, options) {
  const {
    agencyId,
    q = "",
    sort = "az",
    page = "1",
    limit = "20",
    city = "",
    letter = "",
    search = "",
    min_height = "",
    max_height = "",
    min_age = "",
    max_age = "",
    gender = "",
    eye_color = "",
    hair_color = "",
    archetype = "",
    experience_level = "",
    include_outside_spec = "",
  } = options;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  // ── Launch-mode engine (WS5): score-everything, grouped results. Only for
  // engine=launch AND while the eligible pool is under the corpus threshold;
  // above it we log and fall through to the (unchanged) hybrid/browse paths.
  if (resolveDiscoverEngine() === "launch") {
    // eslint-disable-next-line global-require
    const { launchModeSearch, countEligiblePool } = require("./discover/engine");
    const threshold = discoverCorpusThreshold();
    const eligibleCount = await countEligiblePool(knex);
    if (eligibleCount < threshold) {
      return launchModeSearch({
        knex,
        briefText: q,
        limit: limitNum,
        includeOutsideSpec:
          include_outside_spec === "true" || include_outside_spec === "1",
        agencyUserId: agencyId,
        now: new Date(),
      });
    }
    console.warn(
      `[Discover] eligible pool ${eligibleCount} >= corpus threshold ${threshold}; launch mode → hybrid fallthrough`,
    );
  }

  const queryParams = {
    city,
    letter,
    search,
    min_height,
    max_height,
    min_age,
    max_age,
    gender,
    eye_color,
    hair_color,
    archetype,
    experience_level,
  };

  const intent = parseIntentToFilters(q);
  const explicitFilters = extractExplicitFilters(queryParams);

  const filters = isDiscoverHybridEnabled()
    ? explicitFilters
    : mergeFilters(queryParams, intent.filters);

  const applicationMap = await fetchApplicationMap(knex, agencyId);

  const ctx = {
    q,
    intent,
    filters,
    explicitFilters,
    sort,
    pageNum,
    limitNum,
    offset,
    applicationMap,
    agencyId,
  };

  if (canUseSemanticSearch(knex, q)) {
    try {
      if (isDiscoverHybridEnabled()) {
        return await hybridSearch(knex, ctx);
      }
      if (isPostgresKnex(knex)) {
        return await semanticSearch(knex, ctx);
      }
      return await semanticSearchSqlite(knex, ctx);
    } catch (err) {
      console.warn(
        "[Discover] Semantic search failed, using browse fallback:",
        err.message,
      );
    }
  }

  return browseSearch(knex, ctx);
}

module.exports = {
  searchDiscoverableTalent,
  mergeFilters,
  extractExplicitFilters,
  applyDiscoverFilters,
  canUseSemanticSearch,
  parseIntentToFilters,
  hybridSearch,
  isDiscoverHybridEnabled,
  resolveDiscoverEngine,
  discoverCorpusThreshold,
  // Shared by the launch engine (discover/engine.js) — DTO enrichment + invites.
  attachImagesAndInvites,
  fetchApplicationMap,
  TEXT_WEIGHT,
  IMAGE_WEIGHT,
  MAX_DISTANCE,
};
