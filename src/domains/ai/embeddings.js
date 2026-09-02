/**
 * Embedding Service
 *
 * Provider: OpenAI text-embedding-3-small (native fetch — no SDK required)
 * Dimension: 512 (reduced from 1536; same cost, smaller storage, ~same quality)
 * Distance:  cosine (<=> in pgvector)
 *
 * Public API:
 *   embed(text)                                  → float[]
 *   upsertImageEmbedding(knex, profileId, text)  → false (retired at launch)
 *   upsertTextEmbedding(knex, profileId, src, text) → void
 *   upsertDiscoverIndexEmbedding(knex, profileId, profile, extras) → void
 *   upsertLexicalDocument(knex, profileId, profile, extras) → void
 *   reindexDiscoverProfile(knex, profileId, extras) → void
 *   buildProfileText(profile)                    → string  (for callers)
 *   buildDiscoverIndexText(profile, extras)      → string  (casting-oriented corpus)
 *   buildVisualIndexText / buildCastingIndexText / buildMarketIndexText / buildLexicalDocument
 *
 * Postgres: pgvector tables. SQLite: talent_embedding_cache JSON rows.
 * Missing OPENAI_API_KEY → throws with a clear message; caller decides how to handle.
 */

"use strict";

const crypto = require("crypto");
const {
  hasRecordedDateOfBirth,
  isMinorProfile,
} = require("../../shared/lib/talent-age");
const {
  normalizeBookingLaneList,
  BOOKING_LANES,
} = require("../../shared/constants/booking-lanes");

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

// Selection embeddings are not part of the launch by default. This is a
// deliberately narrow, separate consent from image analysis: neither a broad
// privacy setting nor a missing value is permission to send profile data to an
// embedding provider or retain a local search derivative.
const SAFE_SELECTION_LANE_SLUGS = new Set([
  "commercial",
  "ecomm",
  "editorial",
  "runway",
  "lifestyle",
  "beauty",
  "promotional",
  "creator_ugc",
]);
const BOOKING_LANE_LABEL_BY_SLUG = new Map(
  BOOKING_LANES.map((lane) => [lane.slug, lane.label]),
);
const SAFE_EXPERIENCE_LEVELS = new Map([
  ["emerging", "Emerging"],
  ["new face", "New face"],
  ["new_face", "New face"],
  ["developing", "Developing"],
  ["professional", "Professional"],
  ["experienced", "Experienced"],
  ["established", "Established"],
]);
const SAFE_EMBEDDING_STORAGE_SOURCES = Object.freeze({
  bio: "consented_v1_bio",
  full_profile: "consented_v1_full_profile",
  discover_index: "consented_v1_discover_index",
  casting: "consented_v1_casting",
  market: "consented_v1_market",
});
const SAFE_EMBEDDING_LOGICAL_SOURCES = new Map(
  Object.entries(SAFE_EMBEDDING_STORAGE_SOURCES).map(([logical, stored]) => [
    stored,
    logical,
  ]),
);
const SAFE_LEXICAL_DOCUMENT_PREFIX = "consent_corpus_v1";

function profileEmbeddingFeatureEnabled(env = process.env) {
  return env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true";
}

function adultDateOfBirthUpperBoundExclusive(referenceDate = new Date()) {
  const cutoff = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear() - 18,
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  return cutoff.toISOString().slice(0, 10);
}

function hasExplicitConsent(value) {
  // PostgreSQL returns booleans while SQLite commonly returns 0/1.
  return value === true || value === 1;
}

/**
 * Embeddings and local selection indexes are permitted only for an adult who
 * has affirmatively enabled this separate processing purpose, and only when
 * the feature is explicitly enabled by the deploy environment. Unknown DOB,
 * null/false consent, and all minors fail closed.
 */
function isProfileEmbeddingAllowed(profile, env = process.env) {
  return (
    profileEmbeddingFeatureEnabled(env) &&
    hasExplicitConsent(profile?.embedding_processing_consent) &&
    hasRecordedDateOfBirth(profile) &&
    !isMinorProfile(profile)
  );
}

async function loadEmbeddingEligibleProfile(knex, profileId) {
  // Never trust a profile captured by a request or background job. Withdrawal,
  // DOB changes, and deployment flags must be observed from authoritative state
  // immediately beside every provider or derivative boundary.
  if (!profileEmbeddingFeatureEnabled()) return null;
  const profile = await knex("profiles").where({ id: profileId }).first();
  return isProfileEmbeddingAllowed(profile) ? profile : null;
}

function safeExperienceLevel(profile) {
  const raw = String(profile?.experience_level || "")
    .trim()
    .toLowerCase();
  return SAFE_EXPERIENCE_LEVELS.get(raw) || "";
}

function embeddingStorageSource(source) {
  return SAFE_EMBEDDING_STORAGE_SOURCES[source] || null;
}

function safeBookingLanes(profile) {
  const values = [
    ...parseJsonArray(profile?.modeling_categories),
    ...parseJsonArray(profile?.booking_lanes),
  ];
  return normalizeBookingLaneList(values).filter((slug) =>
    SAFE_SELECTION_LANE_SLUGS.has(slug),
  );
}

function selectionLaneText(profile) {
  const labels = safeBookingLanes(profile)
    .map((slug) => BOOKING_LANE_LABEL_BY_SLUG.get(slug))
    .filter(Boolean);
  return labels.length ? `Booking lanes: ${labels.join(", ")}` : "";
}

// ─── Core embed call ────────────────────────────────────────────────────────

/**
 * Call OpenAI embeddings endpoint and return a float array.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  if (!profileEmbeddingFeatureEnabled()) {
    throw new Error("[embeddings] profile embedding feature is disabled");
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[embeddings] OPENAI_API_KEY not set — cannot compute embedding",
    );
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // stay well under token limit
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[embeddings] OpenAI API ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Normalized text hash used as the discover_embed_cache key. Mirrors the
 * parse-cache normalization (trim → collapse whitespace → lowercase) so the
 * same soft-query text hashes identically across processes.
 */
function hashEmbedText(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Get-or-compute a soft-query embedding through the Postgres-backed
 * `discover_embed_cache` (WS6.3) — per-process Maps are empty on every cold
 * serverless invocation. Best-effort and dual-dialect: a missing cache table or
 * a DB error never blocks the embedding (it just recomputes).
 *
 * `embedFn` is injectable so callers can pass the module's (mock-aware) `embed`
 * reference and so unit tests can supply a stub without hitting the network.
 *
 * @param {import('knex').Knex|null} knex
 * @param {string} text
 * @param {{ embedFn?: (t:string)=>Promise<number[]> }} [opts]
 * @returns {Promise<number[]|null>}
 */
async function cachedEmbed(knex, text, opts = {}) {
  if (!profileEmbeddingFeatureEnabled()) return null;
  const embedFn = opts.embedFn || embed;
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const textHash = hashEmbedText(trimmed);

  if (knex) {
    try {
      const row = await knex("discover_embed_cache")
        .where({ text_hash: textHash })
        .first();
      if (row && row.embedding != null) {
        const vec =
          typeof row.embedding === "string"
            ? JSON.parse(row.embedding)
            : row.embedding;
        if (Array.isArray(vec) && vec.length) return vec;
      }
    } catch {
      // missing table / DB down — cache is best-effort
    }
  }

  const vec = await embedFn(trimmed);

  if (knex && Array.isArray(vec) && vec.length) {
    try {
      await knex("discover_embed_cache")
        .insert({
          text_hash: textHash,
          embedding: JSON.stringify(vec),
          created_at: knex.fn.now(),
        })
        .onConflict("text_hash")
        .merge();
    } catch {
      // best-effort
    }
  }

  return vec;
}

// ─── pgvector helpers ────────────────────────────────────────────────────────

/**
 * Format a JS float array as the pgvector literal '[0.1,0.2,...]'.
 * @param {number[]} embedding
 * @returns {string}
 */
function toVectorLiteral(embedding) {
  return `[${embedding.join(",")}]`;
}

function isPostgresKnex(knex) {
  const client = knex.client?.config?.client || "";
  return client === "pg" || client === "postgresql";
}

/**
 * Cosine distance (matches pgvector <=> for normalized vectors).
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineDistance(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return 1;
  return 1 - dot / denom;
}

/**
 * Fused text + image distance (same weights as discover-search.js).
 * @param {number[]} queryVec
 * @param {number[]|null} textVec
 * @param {number[]|null} imageVec
 * @param {number} textWeight
 * @param {number} imageWeight
 * @returns {number|null}
 */
function fusedDistance(
  queryVec,
  textVec,
  imageVec,
  textWeight = 0.6,
  imageWeight = 0.4,
) {
  const textDist = textVec ? cosineDistance(queryVec, textVec) : null;
  const imageDist = imageVec ? cosineDistance(queryVec, imageVec) : null;

  if (textDist != null && imageDist != null) {
    return textWeight * textDist + imageWeight * imageDist;
  }
  if (textDist != null) return textDist;
  if (imageDist != null) return imageDist;
  return null;
}

async function upsertEmbeddingCache(
  knex,
  profileId,
  source,
  sourceText,
  embedding,
) {
  const hasTable = await knex.schema.hasTable("talent_embedding_cache");
  if (!hasTable) return;

  const row = {
    profile_id: profileId,
    source,
    embedding_json: JSON.stringify(embedding),
    source_text: sourceText,
    embedded_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  };

  await knex("talent_embedding_cache")
    .insert(row)
    .onConflict(["profile_id", "source"])
    .merge(["embedding_json", "source_text", "embedded_at", "updated_at"]);
}

/** Dense channel sources for hybrid Discover retrieval. */
const DENSE_CHANNEL_SOURCES = ["casting", "market", "discover_index"];

/**
 * Load cached embeddings for a set of profile IDs.
 * @returns {Promise<Map<string, Record<string, number[]>>>}
 */
async function loadEmbeddingCacheMap(knex, profileIds) {
  const map = new Map();
  if (!profileEmbeddingFeatureEnabled() || !profileIds.length) return map;

  const hasTable = await knex.schema.hasTable("talent_embedding_cache");
  if (!hasTable) return map;

  let rows;
  try {
    rows = await knex("talent_embedding_cache as tec")
      .join("profiles as p", "p.id", "tec.profile_id")
      .whereIn("tec.profile_id", profileIds)
      .whereIn(
        "tec.source",
        Object.values(SAFE_EMBEDDING_STORAGE_SOURCES),
      )
      .where("p.embedding_processing_consent", true)
      .whereNotNull("p.date_of_birth")
      .where(
        "p.date_of_birth",
        "<",
        adultDateOfBirthUpperBoundExclusive(),
      )
      .select(
        "tec.profile_id",
        "tec.source",
        "tec.embedding_json",
        "p.date_of_birth",
        "p.embedding_processing_consent",
      );
  } catch {
    // A pre-migration or partially migrated schema must fail closed rather than
    // exposing legacy derivatives.
    return map;
  }

  for (const row of rows) {
    if (!isProfileEmbeddingAllowed(row)) continue;
    const logicalSource = SAFE_EMBEDDING_LOGICAL_SOURCES.get(row.source);
    if (!logicalSource) continue;
    if (!map.has(row.profile_id)) {
      map.set(row.profile_id, {});
    }
    try {
      const vec = JSON.parse(row.embedding_json);
      map.get(row.profile_id)[logicalSource] = vec;
    } catch {
      // skip corrupt row
    }
  }
  return map;
}

// ─── Upsert helpers ─────────────────────────────────────────────────────────

/**
 * Legacy image-embedding entry point.
 *
 * Image-derived vectors are prohibited from launch selection, so this remains
 * a defensive no-op until a separately reviewed product policy replaces it.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {string} sourceText  — Scout description text
 */
async function upsertImageEmbedding(knex, profileId, sourceText, opts = {}) {
  // Image-derived vectors are not an allowed launch selection signal. Keep a
  // defensive no-op at this legacy API boundary because older background
  // callers (for example the casting pipeline) still invoke it directly.
  void knex;
  void profileId;
  void sourceText;
  void opts;
  return false;
}

/**
 * Compute and upsert a text embedding for a profile.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {'bio'|'full_profile'|'discover_index'|'visual'|'casting'|'market'} source
 * @param {string} sourceText  — concatenated profile text to embed
 */
async function upsertTextEmbedding(
  knex,
  profileId,
  source,
  sourceText,
  opts = {},
) {
  void sourceText;
  void opts.profile;

  // Fresh authoritative read immediately before the provider boundary. The
  // corpus is rebuilt here too, so callers cannot smuggle arbitrary profile
  // text through a nominally safe source name.
  const profile = await loadEmbeddingEligibleProfile(knex, profileId);
  if (!profile) return false;
  const storageSource = embeddingStorageSource(source);
  if (!storageSource) return false;
  const safeSourceText = buildSafeEmbeddingText(source, profile);
  if (!safeSourceText) return false;

  const embedding = await (opts.embedFn || embed)(safeSourceText);

  // Re-check and lock current consent before persistence. If consent/DOB or the
  // bounded corpus changed while the provider was running, discard the result.
  return knex.transaction(async (trx) => {
    let currentQuery = trx("profiles").where({ id: profileId });
    if (isPostgresKnex(trx)) currentQuery = currentQuery.forUpdate();
    const current = await currentQuery.first();
    if (!isProfileEmbeddingAllowed(current)) return false;
    if (buildSafeEmbeddingText(source, current) !== safeSourceText) return false;

    if (isPostgresKnex(trx)) {
      const vectorLiteral = toVectorLiteral(embedding);
      await trx.raw(
        `INSERT INTO talent_text_embeddings
         (profile_id, source, source_text, embedding, embedded_at, updated_at)
       VALUES (?, ?, ?, ?::vector, NOW(), NOW())
       ON CONFLICT (profile_id, source) DO UPDATE SET
         source_text  = EXCLUDED.source_text,
         embedding    = EXCLUDED.embedding,
         embedded_at  = NOW(),
         updated_at   = NOW()`,
        [profileId, storageSource, safeSourceText, vectorLiteral],
      );
      return true;
    }

    await upsertEmbeddingCache(
      trx,
      profileId,
      storageSource,
      safeSourceText,
      embedding,
    );
    return true;
  });
}

// ─── Text builders ───────────────────────────────────────────────────────────

/**
 * Build a rich text representation of a profile for embedding.
 * Concatenates the most semantically meaningful fields.
 *
 * @param {Object} profile — raw DB row
 * @returns {string}
 */
function buildProfileText(profile) {
  const parts = [];

  // Selection inputs must be narrowly bounded. Names, city, gender, heritage,
  // language, free text, physical traits, and image outputs can all encode a
  // protected trait or a close proxy, so none belong in an embedding corpus.
  const experience = safeExperienceLevel(profile);
  if (experience) parts.push(`Experience: ${experience}`);
  const lanes = selectionLaneText(profile);
  if (lanes) parts.push(lanes);

  return parts.join(". ");
}

/**
 * Build image embedding source text from an image analysis result.
 *
 * @param {Object} scout — {face_structure, body_impression, vibe_tags}
 * @returns {string}
 */
function buildScoutText(scout) {
  // Scout is image-derived inference and is never a selection/index input.
  void scout;
  return "";
}

// ─── Discover index helpers ──────────────────────────────────────────────────

const parseJsonArray = (v) => {
  if (!v) return [];
  try {
    return typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const parseJsonObject = (v) => {
  if (!v) return null;
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
};

/**
 * Derive a coarse, casting-style age band from date_of_birth.
 *
 * Exact age never enters index text (WS2 / council review: `profiles.age`
 * is deprecated and drifts; DOB is canonical but must not be exposed).
 * Handles both "1995-03-15" and "1995-03-15T05:00:00.000Z" DOB formats.
 *
 * @param {string|Date|null} dateOfBirth
 * @returns {string|null} coarse band, or null (unknown DOB or minor)
 */
function deriveAgeBand(dateOfBirth, referenceDate = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDiff = referenceDate.getMonth() - dob.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < dob.getDate())
  ) {
    age -= 1;
  }

  if (age < 18) return null; // minors are never discoverable
  if (age <= 21) return "late teens to early twenties";
  if (age <= 25) return "early to mid twenties";
  if (age <= 29) return "late twenties";
  if (age <= 39) return "thirties";
  if (age <= 49) return "forties";
  return "fifties plus";
}

/**
 * Flatten vision image_analysis JSON into embeddable prose.
 *
 * Compliance (WS2): never emit skinTone / measurementEstimates (or any
 * ethnicity/heritage proxy) — protected traits and AI-estimated
 * measurements must never reach index text or embeddings.
 *
 * @param {Object|string|null} imageAnalysis
 * @returns {string}
 */
function flattenImageAnalysis(imageAnalysis) {
  // Model-produced appearance and "market" assessments are image-derived
  // selection signals. They remain excluded even when an adult has opted into
  // profile embedding; consent does not turn a prohibited signal into an
  // allowed one.
  void imageAnalysis;
  return "";
}

/**
 * Build an enriched casting-oriented document for discover semantic search.
 *
 * @param {Object} profile — raw DB row
 * @param {Object} [extras]
 * @param {Object} [extras.scout] — Scout result from onboarding_signals.ai_results
 * @returns {string}
 */
function buildDiscoverIndexText(profile, extras = {}) {
  const parts = [];

  const experience = safeExperienceLevel(profile);
  if (experience) parts.push(`Experience: ${experience}`);
  const lanes = selectionLaneText(profile);
  if (lanes) parts.push(lanes);

  // `extras` currently contains Scout output. It is intentionally ignored.
  void extras;

  return parts.filter(Boolean).join(". ");
}

/**
 * Visual channel: look_descriptor, image_analysis, Scout face/body.
 * @param {Object} profile
 * @param {Object} [extras]
 * @returns {string}
 */
function buildVisualIndexText(profile, extras = {}) {
  // All visual channels are appearance/image-derived, therefore unavailable
  // for launch selection indexing.
  void profile;
  void extras;
  return "";
}

/**
 * Casting channel: bio, archetype, experience, physical stats, training.
 * @param {Object} profile
 * @returns {string}
 */
function buildCastingIndexText(profile) {
  const parts = [];
  const experience = safeExperienceLevel(profile);
  if (experience) parts.push(`Experience: ${experience}`);
  const lanes = selectionLaneText(profile);
  if (lanes) parts.push(lanes);

  return parts.filter(Boolean).join(". ");
}

/**
 * Market/vibe channel: fit scores, market signals, specialties, vibe tags.
 * @param {Object} profile
 * @param {Object} [extras]
 * @returns {string}
 */
function buildMarketIndexText(profile, extras = {}) {
  const parts = [];
  const lanes = selectionLaneText(profile);
  if (lanes) parts.push(lanes);
  void extras;

  return parts.filter(Boolean).join(". ");
}

/**
 * Lowercased FTS document with structured tokens for hybrid lexical leg.
 * @param {Object} profile
 * @param {Object} [extras]
 * @returns {string}
 */
function buildLexicalDocument(profile, extras = {}) {
  const prose = [
    buildVisualIndexText(profile, extras),
    buildCastingIndexText(profile),
    buildMarketIndexText(profile, extras),
  ]
    .filter(Boolean)
    .join(" ");

  const tokens = [];
  for (const lane of safeBookingLanes(profile)) {
    tokens.push(`booking_lane:${lane}`);
  }

  return `${SAFE_LEXICAL_DOCUMENT_PREFIX} ${prose} ${tokens.join(" ")}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive image embedding text from Scout or vision analysis fallback.
 * @param {Object} profile
 * @param {Object|null} scout
 * @returns {string}
 */
function buildImageSourceText(profile, scout) {
  void profile;
  void scout;
  return "";
}

function buildSafeEmbeddingText(source, profile) {
  switch (source) {
    case "bio":
    case "full_profile":
      return buildProfileText(profile);
    case "discover_index":
      return buildDiscoverIndexText(profile);
    case "casting":
      return buildCastingIndexText(profile);
    case "market":
      return buildMarketIndexText(profile);
    // Image/appearance-derived vectors are not allowed launch inputs.
    case "visual":
    default:
      return "";
  }
}

/**
 * Upsert lexical search document + FTS index for a profile.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {Object} profile
 * @param {Object} [extras]
 */
async function upsertLexicalDocument(knex, profileId, profile, extras = {}) {
  void profile;
  return knex.transaction(async (trx) => {
    let currentQuery = trx("profiles").where({ id: profileId });
    if (isPostgresKnex(trx)) currentQuery = currentQuery.forUpdate();
    const current = await currentQuery.first();
    if (!isProfileEmbeddingAllowed(current)) return false;

    const document = buildLexicalDocument(current, extras);
    if (!document?.trim()) return false;

    await trx("profiles")
      .where({ id: profileId })
      .update({ search_document: document });

    if (isPostgresKnex(trx)) {
      await trx.raw(
        `UPDATE profiles
         SET search_vector = to_tsvector('english', ?)
         WHERE id = ?`,
        [document, profileId],
      );
      return true;
    }

    const hasFts = await trx.schema.hasTable("profiles_fts");
    if (!hasFts) return false;

    await trx("profiles_fts").where({ profile_id: profileId }).del();
    await trx("profiles_fts").insert({
      profile_id: profileId,
      document,
    });
    return true;
  });
}

/**
 * Upsert discover_index text embedding for a profile.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {Object} profile
 * @param {Object} [extras]
 */
async function upsertDiscoverIndexEmbedding(
  knex,
  profileId,
  profile,
  extras = {},
) {
  void profile;
  void extras;
  return upsertTextEmbedding(knex, profileId, "discover_index", "", {});
}

/**
 * Load profile + scout extras and re-index all Discover channels (best-effort).
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {Object} [extras]
 */
/** Alias for Scout/image_analysis fallback visual text (no Scout row). */
function buildVisualTextFromProfile(profile) {
  return buildImageSourceText(profile, null);
}

async function reindexDiscoverChannels(knex, profileId, extras = {}) {
  const profile = await knex("profiles").where({ id: profileId }).first();
  if (!profile || !isProfileEmbeddingAllowed(profile)) return false;

  let scout = extras.scout;
  if (!scout) {
    const signal = await knex("onboarding_signals")
      .where({ profile_id: profileId })
      .first();
    if (signal?.ai_results) {
      const aiResults = parseJsonObject(signal.ai_results);
      scout = aiResults?.scout || null;
    }
  }

  const indexExtras = { scout };

  const visualText = buildVisualIndexText(profile, indexExtras);
  if (visualText?.trim()) {
    await upsertTextEmbedding(knex, profileId, "visual", visualText, {
      profile,
    });
  }

  const castingText = buildCastingIndexText(profile);
  if (castingText?.trim()) {
    await upsertTextEmbedding(knex, profileId, "casting", castingText, {
      profile,
    });
  }

  const marketText = buildMarketIndexText(profile, indexExtras);
  if (marketText?.trim()) {
    await upsertTextEmbedding(knex, profileId, "market", marketText, {
      profile,
    });
  }

  await upsertDiscoverIndexEmbedding(knex, profileId, profile, indexExtras);
  await upsertLexicalDocument(knex, profileId, profile, indexExtras);

  const imageText = buildImageSourceText(profile, scout);
  if (imageText?.trim()) {
    await upsertImageEmbedding(knex, profileId, imageText, { profile });
  }
  return true;
}

async function reindexDiscoverProfile(knex, profileId, extras = {}) {
  return reindexDiscoverChannels(knex, profileId, extras);
}

/**
 * Remove every Pholio-held embedding and search-index derivative for one
 * profile. This deliberately does not represent a deletion request to any
 * provider: when an embedding was already sent, provider retention follows the
 * vendor agreement and the account's separate deletion workflow.
 */
async function purgeProfileEmbeddingDerivatives(knex, profileId) {
  const hasTable = async (name) => {
    try {
      return await knex.schema.hasTable(name);
    } catch {
      return false;
    }
  };
  const hasColumn = async (table, column) => {
    try {
      return await knex.schema.hasColumn(table, column);
    } catch {
      return false;
    }
  };

  const [hasProfiles, hasText, hasImage, hasCache, hasFts] = await Promise.all([
    hasTable("profiles"),
    hasTable("talent_text_embeddings"),
    hasTable("talent_image_embeddings"),
    hasTable("talent_embedding_cache"),
    hasTable("profiles_fts"),
  ]);

  if (hasText) {
    await knex("talent_text_embeddings").where({ profile_id: profileId }).del();
  }
  if (hasImage) {
    await knex("talent_image_embeddings").where({ profile_id: profileId }).del();
  }
  if (hasCache) {
    await knex("talent_embedding_cache").where({ profile_id: profileId }).del();
  }
  if (hasFts) {
    await knex("profiles_fts").where({ profile_id: profileId }).del();
  }
  // Semantic layer: the chunk corpus and the photo descriptions go too.
  if (await hasTable("discover_chunks")) {
    await knex("discover_chunks").where({ profile_id: profileId }).del();
  }
  await clearPhotoDescriptionsSafe(knex, profileId);
  if (hasProfiles) {
    const profileUpdate = {};
    if (await hasColumn("profiles", "search_document")) {
      profileUpdate.search_document = null;
    }
    if (await hasColumn("profiles", "search_vector")) {
      profileUpdate.search_vector = null;
    }
    if (Object.keys(profileUpdate).length) {
      profileUpdate.updated_at = knex.fn.now();
      await knex("profiles").where({ id: profileId }).update(profileUpdate);
    }
  }
}

async function clearPhotoDescriptionsSafe(knex, profileId) {
  try {
    // Lazy: describe-photo requires this module's peers; avoid a load cycle.
    // eslint-disable-next-line global-require
    const { clearPhotoDescriptions } = require("./describe-photo");
    await clearPhotoDescriptions(knex, profileId);
  } catch {
    // best-effort
  }
}

/** Remove only image/visual embedding derivatives for an image-processing opt-out. */
async function purgeImageEmbeddingDerivatives(knex, profileId) {
  const hasTable = async (name) => {
    try {
      return await knex.schema.hasTable(name);
    } catch {
      return false;
    }
  };

  // Semantic layer: photo chunks and their descriptions are image-derived.
  if (await hasTable("discover_chunks")) {
    await knex("discover_chunks").where({ profile_id: profileId, kind: "photo" }).del();
  }
  await clearPhotoDescriptionsSafe(knex, profileId);

  if (await hasTable("talent_image_embeddings")) {
    await knex("talent_image_embeddings").where({ profile_id: profileId }).del();
  }
  if (await hasTable("talent_embedding_cache")) {
    await knex("talent_embedding_cache")
      .where({ profile_id: profileId })
      .whereIn("source", ["image", "visual"])
      .del();
  }
  if (await hasTable("talent_text_embeddings")) {
    await knex("talent_text_embeddings")
      .where({ profile_id: profileId })
      .where("source", "visual")
      .del();
  }
}

module.exports = {
  embed,
  cachedEmbed,
  hashEmbedText,
  toVectorLiteral,
  isPostgresKnex,
  cosineDistance,
  fusedDistance,
  loadEmbeddingCacheMap,
  upsertImageEmbedding,
  upsertTextEmbedding,
  upsertDiscoverIndexEmbedding,
  upsertLexicalDocument,
  reindexDiscoverChannels,
  reindexDiscoverProfile,
  buildProfileText,
  buildDiscoverIndexText,
  buildVisualIndexText,
  buildCastingIndexText,
  buildMarketIndexText,
  buildLexicalDocument,
  buildImageSourceText,
  buildVisualTextFromProfile,
  buildScoutText,
  flattenImageAnalysis,
  deriveAgeBand,
  isProfileEmbeddingAllowed,
  profileEmbeddingFeatureEnabled,
  adultDateOfBirthUpperBoundExclusive,
  safeExperienceLevel,
  embeddingStorageSource,
  SAFE_LEXICAL_DOCUMENT_PREFIX,
  buildSafeEmbeddingText,
  safeBookingLanes,
  purgeProfileEmbeddingDerivatives,
  purgeImageEmbeddingDerivatives,
  DENSE_CHANNEL_SOURCES,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
};
