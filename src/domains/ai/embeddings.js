/**
 * Embedding Service
 *
 * Provider: OpenAI text-embedding-3-small (native fetch — no SDK required)
 * Dimension: 512 (reduced from 1536; same cost, smaller storage, ~same quality)
 * Distance:  cosine (<=> in pgvector)
 *
 * Public API:
 *   embed(text)                                  → float[]
 *   upsertImageEmbedding(knex, profileId, text)  → void  (Postgres-only)
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

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

// ─── Core embed call ────────────────────────────────────────────────────────

/**
 * Call OpenAI embeddings endpoint and return a float array.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
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
const DENSE_CHANNEL_SOURCES = ["visual", "casting", "market", "discover_index"];

/**
 * Load cached embeddings for a set of profile IDs.
 * @returns {Promise<Map<string, Record<string, number[]>>>}
 */
async function loadEmbeddingCacheMap(knex, profileIds) {
  const map = new Map();
  if (!profileIds.length) return map;

  const hasTable = await knex.schema.hasTable("talent_embedding_cache");
  if (!hasTable) return map;

  const rows = await knex("talent_embedding_cache")
    .whereIn("profile_id", profileIds)
    .select("profile_id", "source", "embedding_json");

  for (const row of rows) {
    if (!map.has(row.profile_id)) {
      map.set(row.profile_id, {});
    }
    try {
      const vec = JSON.parse(row.embedding_json);
      map.get(row.profile_id)[row.source] = vec;
    } catch {
      // skip corrupt row
    }
  }
  return map;
}

// ─── Upsert helpers ─────────────────────────────────────────────────────────

/**
 * Compute and upsert an image embedding for a profile.
 * Source text = Scout's face_structure + body_impression + vibe_tags.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {string} sourceText  — Scout description text
 */
async function upsertImageEmbedding(knex, profileId, sourceText) {
  if (!sourceText?.trim()) return;

  const embedding = await embed(sourceText);

  if (isPostgresKnex(knex)) {
    const vectorLiteral = toVectorLiteral(embedding);
    await knex.raw(
      `INSERT INTO talent_image_embeddings
       (profile_id, source_text, embedding, embedded_at, updated_at)
     VALUES (?, ?, ?::vector, NOW(), NOW())
     ON CONFLICT (profile_id) DO UPDATE SET
       source_text  = EXCLUDED.source_text,
       embedding    = EXCLUDED.embedding,
       embedded_at  = NOW(),
       updated_at   = NOW()`,
      [profileId, sourceText, vectorLiteral],
    );
    return;
  }

  await upsertEmbeddingCache(knex, profileId, "image", sourceText, embedding);
}

/**
 * Compute and upsert a text embedding for a profile.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {'bio'|'full_profile'|'discover_index'|'visual'|'casting'|'market'} source
 * @param {string} sourceText  — concatenated profile text to embed
 */
async function upsertTextEmbedding(knex, profileId, source, sourceText) {
  if (!sourceText?.trim()) return;

  const embedding = await embed(sourceText);

  if (isPostgresKnex(knex)) {
    const vectorLiteral = toVectorLiteral(embedding);
    await knex.raw(
      `INSERT INTO talent_text_embeddings
       (profile_id, source, source_text, embedding, embedded_at, updated_at)
     VALUES (?, ?, ?, ?::vector, NOW(), NOW())
     ON CONFLICT (profile_id, source) DO UPDATE SET
       source_text  = EXCLUDED.source_text,
       embedding    = EXCLUDED.embedding,
       embedded_at  = NOW(),
       updated_at   = NOW()`,
      [profileId, source, sourceText, vectorLiteral],
    );
    return;
  }

  await upsertEmbeddingCache(knex, profileId, source, sourceText, embedding);
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

  if (profile.first_name || profile.last_name) {
    parts.push(`${profile.first_name || ""} ${profile.last_name || ""}`.trim());
  }
  if (profile.city) parts.push(`Based in ${profile.city}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);
  if (profile.experience_level)
    parts.push(`Experience: ${profile.experience_level}`);

  const bio = profile.bio_curated || profile.bio_raw || "";
  if (bio) parts.push(bio);

  const training = profile.training || "";
  if (training) parts.push(training);

  // JSON array fields — parse safely
  const parseJsonArray = (v) => {
    if (!v) return [];
    try {
      return typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  const specialties = parseJsonArray(profile.specialties);
  if (specialties.length) parts.push(`Specialties: ${specialties.join(", ")}`);

  const languages = parseJsonArray(profile.languages);
  if (languages.length) parts.push(`Languages: ${languages.join(", ")}`);

  const ethnicity = parseJsonArray(profile.ethnicity);
  if (ethnicity.length) parts.push(`Heritage: ${ethnicity.join(", ")}`);

  if (profile.body_type) parts.push(`Build: ${profile.body_type}`);
  if (profile.hair_color) parts.push(`Hair: ${profile.hair_color}`);
  if (profile.eye_color) parts.push(`Eyes: ${profile.eye_color}`);

  return parts.join(". ");
}

/**
 * Build image embedding source text from a groq-casting Scout result.
 *
 * @param {Object} scout — {face_structure, body_impression, vibe_tags}
 * @returns {string}
 */
function buildScoutText(scout) {
  const parts = [];
  if (scout.face_structure) parts.push(scout.face_structure);
  if (scout.body_impression) parts.push(scout.body_impression);
  if (Array.isArray(scout.vibe_tags) && scout.vibe_tags.length) {
    parts.push(scout.vibe_tags.join(", "));
  }
  return parts.join(". ");
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
  const obj = parseJsonObject(imageAnalysis);
  if (!obj) return "";

  const parts = [];
  if (obj.boneStructure) parts.push(`Bone structure: ${obj.boneStructure}`);
  if (obj.featureContrast)
    parts.push(`Feature contrast: ${obj.featureContrast}`);
  if (obj.lookType) parts.push(`Look type: ${obj.lookType}`);
  if (obj.castingNotes) parts.push(obj.castingNotes);
  if (Array.isArray(obj.marketSignals) && obj.marketSignals.length) {
    parts.push(`Market signals: ${obj.marketSignals.join(", ")}`);
  }
  if (Array.isArray(obj.bookingStrengths) && obj.bookingStrengths.length) {
    parts.push(`Booking strengths: ${obj.bookingStrengths.join(", ")}`);
  }
  return parts.join(". ");
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

  if (profile.first_name || profile.last_name) {
    parts.push(`${profile.first_name || ""} ${profile.last_name || ""}`.trim());
  }

  // Compliance (WS2): heritage/ethnicity and skin tone are protected traits
  // and must never be emitted into any Discover index text or embedding.
  // Exact age is also excluded — only a coarse DOB-derived band is indexed.

  if (profile.city) parts.push(`Based in ${profile.city}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);
  const ageBand = deriveAgeBand(profile.date_of_birth);
  if (ageBand) parts.push(`Age band: ${ageBand}`);
  if (profile.height_cm) parts.push(`Height: ${profile.height_cm} cm`);
  if (profile.body_type) parts.push(`Build: ${profile.body_type}`);

  if (profile.hair_color) parts.push(`Hair: ${profile.hair_color}`);
  if (profile.eye_color) parts.push(`Eyes: ${profile.eye_color}`);

  if (profile.experience_level) {
    parts.push(`Experience: ${profile.experience_level}`);
  }
  if (profile.archetype) parts.push(`Archetype: ${profile.archetype}`);

  const specialties = parseJsonArray(profile.specialties);
  if (specialties.length) parts.push(`Specialties: ${specialties.join(", ")}`);

  const modelingCategories = parseJsonArray(profile.modeling_categories);
  if (modelingCategories.length) {
    parts.push(`Booking lanes: ${modelingCategories.join(", ")}`);
  }

  const fitScores = [];
  if (profile.fit_score_runway != null)
    fitScores.push(`runway ${profile.fit_score_runway}`);
  if (profile.fit_score_editorial != null) {
    fitScores.push(`editorial ${profile.fit_score_editorial}`);
  }
  if (profile.fit_score_commercial != null) {
    fitScores.push(`commercial ${profile.fit_score_commercial}`);
  }
  if (profile.fit_score_lifestyle != null) {
    fitScores.push(`lifestyle ${profile.fit_score_lifestyle}`);
  }
  if (profile.fit_score_overall != null) {
    fitScores.push(`overall ${profile.fit_score_overall}`);
  }
  if (fitScores.length) parts.push(`Fit scores: ${fitScores.join(", ")}`);

  if (profile.look_descriptor) parts.push(profile.look_descriptor);

  const analysisText = flattenImageAnalysis(profile.image_analysis);
  if (analysisText) parts.push(analysisText);

  const scout = extras.scout;
  if (scout) {
    const scoutText = buildScoutText(scout);
    if (scoutText) parts.push(`Scout: ${scoutText}`);
  }

  const bio = profile.bio_curated || profile.bio_raw || "";
  if (bio) parts.push(bio);

  const training = profile.training || "";
  if (training) parts.push(training);

  const languages = parseJsonArray(profile.languages);
  if (languages.length) parts.push(`Languages: ${languages.join(", ")}`);

  return parts.filter(Boolean).join(". ");
}

/**
 * Visual channel: look_descriptor, image_analysis, Scout face/body.
 * @param {Object} profile
 * @param {Object} [extras]
 * @returns {string}
 */
function buildVisualIndexText(profile, extras = {}) {
  const parts = [];

  if (profile.look_descriptor) parts.push(profile.look_descriptor);

  const analysisText = flattenImageAnalysis(profile.image_analysis);
  if (analysisText) parts.push(analysisText);

  const scout = extras.scout;
  if (scout) {
    if (scout.face_structure) parts.push(scout.face_structure);
    if (scout.body_impression) parts.push(scout.body_impression);
  }

  return parts.filter(Boolean).join(". ");
}

/**
 * Casting channel: bio, archetype, experience, physical stats, training.
 * @param {Object} profile
 * @returns {string}
 */
function buildCastingIndexText(profile) {
  const parts = [];

  const bio = profile.bio_curated || profile.bio_raw || "";
  if (bio) parts.push(bio);

  if (profile.archetype) parts.push(`Archetype: ${profile.archetype}`);
  if (profile.experience_level) {
    parts.push(`Experience: ${profile.experience_level}`);
  }

  const training = profile.training || "";
  if (training) parts.push(training);

  const languages = parseJsonArray(profile.languages);
  if (languages.length) parts.push(`Languages: ${languages.join(", ")}`);

  if (profile.height_cm) parts.push(`Height: ${profile.height_cm} cm`);
  if (profile.body_type) parts.push(`Build: ${profile.body_type}`);
  if (profile.hair_color) parts.push(`Hair: ${profile.hair_color}`);
  if (profile.eye_color) parts.push(`Eyes: ${profile.eye_color}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);

  // Compliance (WS2): heritage/ethnicity is protected and never indexed.

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

  const fitScores = [];
  if (profile.fit_score_runway != null)
    fitScores.push(`runway ${profile.fit_score_runway}`);
  if (profile.fit_score_editorial != null) {
    fitScores.push(`editorial ${profile.fit_score_editorial}`);
  }
  if (profile.fit_score_commercial != null) {
    fitScores.push(`commercial ${profile.fit_score_commercial}`);
  }
  if (profile.fit_score_lifestyle != null) {
    fitScores.push(`lifestyle ${profile.fit_score_lifestyle}`);
  }
  if (profile.fit_score_overall != null) {
    fitScores.push(`overall ${profile.fit_score_overall}`);
  }
  if (fitScores.length) parts.push(`Fit scores: ${fitScores.join(", ")}`);

  const analysis = parseJsonObject(profile.image_analysis);
  if (analysis) {
    if (
      Array.isArray(analysis.marketSignals) &&
      analysis.marketSignals.length
    ) {
      parts.push(`Market signals: ${analysis.marketSignals.join(", ")}`);
    }
    if (
      Array.isArray(analysis.bookingStrengths) &&
      analysis.bookingStrengths.length
    ) {
      parts.push(`Booking strengths: ${analysis.bookingStrengths.join(", ")}`);
    }
    if (analysis.castingNotes) parts.push(analysis.castingNotes);
  }

  const specialties = parseJsonArray(profile.specialties);
  if (specialties.length) parts.push(`Specialties: ${specialties.join(", ")}`);

  const modelingCategories = parseJsonArray(profile.modeling_categories);
  if (modelingCategories.length) {
    parts.push(`Booking lanes: ${modelingCategories.join(", ")}`);
  }

  const scout = extras.scout;
  if (scout && Array.isArray(scout.vibe_tags) && scout.vibe_tags.length) {
    parts.push(`Vibe: ${scout.vibe_tags.join(", ")}`);
  }

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
  if (profile.gender)
    tokens.push(`gender:${String(profile.gender).toLowerCase()}`);
  // Compliance (WS2): no heritage:/ethnicity/skin-tone tokens — protected
  // traits must never be lexically searchable.
  if (profile.hair_color) {
    tokens.push(`hair:${String(profile.hair_color).toLowerCase()}`);
  }
  if (profile.eye_color) {
    tokens.push(`eyes:${String(profile.eye_color).toLowerCase()}`);
  }
  if (profile.height_cm) tokens.push(`height:${profile.height_cm}cm`);
  if (profile.body_type) {
    tokens.push(`build:${String(profile.body_type).toLowerCase()}`);
  }
  if (profile.archetype) {
    tokens.push(`archetype:${String(profile.archetype).toLowerCase()}`);
  }

  return `${prose} ${tokens.join(" ")}`
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
  const scoutText = scout ? buildScoutText(scout) : "";
  if (scoutText?.trim()) return scoutText;

  const parts = [];
  if (profile.look_descriptor) parts.push(profile.look_descriptor);
  const analysisText = flattenImageAnalysis(profile.image_analysis);
  if (analysisText) parts.push(analysisText);
  return parts.filter(Boolean).join(". ");
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
  const document = buildLexicalDocument(profile, extras);
  if (!document?.trim()) return;

  await knex("profiles")
    .where({ id: profileId })
    .update({ search_document: document });

  if (isPostgresKnex(knex)) {
    await knex.raw(
      `UPDATE profiles
       SET search_vector = to_tsvector('english', ?)
       WHERE id = ?`,
      [document, profileId],
    );
    return;
  }

  const hasFts = await knex.schema.hasTable("profiles_fts");
  if (!hasFts) return;

  await knex("profiles_fts").where({ profile_id: profileId }).del();
  await knex("profiles_fts").insert({
    profile_id: profileId,
    document,
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
  const indexText = buildDiscoverIndexText(profile, extras);
  if (!indexText?.trim()) return;
  await upsertTextEmbedding(knex, profileId, "discover_index", indexText);
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
  if (!profile) return;

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
    await upsertTextEmbedding(knex, profileId, "visual", visualText);
  }

  const castingText = buildCastingIndexText(profile);
  if (castingText?.trim()) {
    await upsertTextEmbedding(knex, profileId, "casting", castingText);
  }

  const marketText = buildMarketIndexText(profile, indexExtras);
  if (marketText?.trim()) {
    await upsertTextEmbedding(knex, profileId, "market", marketText);
  }

  await upsertDiscoverIndexEmbedding(knex, profileId, profile, indexExtras);
  await upsertLexicalDocument(knex, profileId, profile, indexExtras);

  const imageText = buildImageSourceText(profile, scout);
  if (imageText?.trim()) {
    await upsertImageEmbedding(knex, profileId, imageText);
  }
}

async function reindexDiscoverProfile(knex, profileId, extras = {}) {
  await reindexDiscoverChannels(knex, profileId, extras);
}

module.exports = {
  embed,
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
  DENSE_CHANNEL_SOURCES,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
};
