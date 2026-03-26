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
 *   upsertTextEmbedding(knex, profileId, src, text) → void (Postgres-only)
 *   buildProfileText(profile)                    → string  (for callers)
 *
 * All writes are best-effort: callers should wrap in try/catch.
 * Missing OPENAI_API_KEY → throws with a clear message; caller decides how to handle.
 */

'use strict';

const EMBEDDING_MODEL = 'text-embedding-3-small';
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
    throw new Error('[embeddings] OPENAI_API_KEY not set — cannot compute embedding');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // stay well under token limit
      dimensions: EMBEDDING_DIMENSIONS
    })
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
  return `[${embedding.join(',')}]`;
}

function isPostgresKnex(knex) {
  const client = knex.client?.config?.client || '';
  return client === 'pg' || client === 'postgresql';
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
  if (!isPostgresKnex(knex)) return; // SQLite — no-op

  const embedding = await embed(sourceText);
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
    [profileId, sourceText, vectorLiteral]
  );
}

/**
 * Compute and upsert a text embedding for a profile.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {'bio'|'full_profile'} source
 * @param {string} sourceText  — concatenated profile text to embed
 */
async function upsertTextEmbedding(knex, profileId, source, sourceText) {
  if (!isPostgresKnex(knex)) return; // SQLite — no-op
  if (!sourceText?.trim()) return;    // nothing to embed

  const embedding = await embed(sourceText);
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
    [profileId, source, sourceText, vectorLiteral]
  );
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
    parts.push(`${profile.first_name || ''} ${profile.last_name || ''}`.trim());
  }
  if (profile.city) parts.push(`Based in ${profile.city}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);
  if (profile.experience_level) parts.push(`Experience: ${profile.experience_level}`);

  const bio = profile.bio_curated || profile.bio_raw || '';
  if (bio) parts.push(bio);

  const training = profile.training || '';
  if (training) parts.push(training);

  // JSON array fields — parse safely
  const parseJsonArray = (v) => {
    if (!v) return [];
    try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
    catch { return []; }
  };

  const specialties = parseJsonArray(profile.specialties);
  if (specialties.length) parts.push(`Specialties: ${specialties.join(', ')}`);

  const languages = parseJsonArray(profile.languages);
  if (languages.length) parts.push(`Languages: ${languages.join(', ')}`);

  const ethnicity = parseJsonArray(profile.ethnicity);
  if (ethnicity.length) parts.push(`Heritage: ${ethnicity.join(', ')}`);

  if (profile.body_type) parts.push(`Build: ${profile.body_type}`);
  if (profile.hair_color) parts.push(`Hair: ${profile.hair_color}`);
  if (profile.eye_color) parts.push(`Eyes: ${profile.eye_color}`);

  return parts.join('. ');
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
    parts.push(scout.vibe_tags.join(', '));
  }
  return parts.join('. ');
}

module.exports = {
  embed,
  toVectorLiteral,
  upsertImageEmbedding,
  upsertTextEmbedding,
  buildProfileText,
  buildScoutText,
  EMBEDDING_DIMENSIONS
};
