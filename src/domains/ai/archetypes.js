/**
 * Archetype Embedding Helpers
 *
 * Each modeling archetype is represented by a rich prototype description text
 * that is embedded once (lazily, at runtime) and stored in archetype_embeddings.
 *
 * Cosine similarity between a talent's image embedding (derived from Scout
 * description text) and these prototype vectors gives a vector-based archetype
 * score that complements the Director LLM's reasoning-based scores.
 *
 * Public API:
 *   ARCHETYPE_TEXTS                                  — prototype descriptions
 *   ensureArchetypeEmbeddings(knex)                  → void (lazy, best-effort)
 *   computeVectorArchetypeScores(knex, profileId)    → {runway, editorial, commercial, lifestyle} | null
 *
 * All functions are best-effort: callers should wrap in try/catch or rely on
 * the internal catch that returns null on failure.
 */

'use strict';

const { embed, toVectorLiteral, isPostgresKnex } = require('./embeddings');

// ─── Archetype Prototype Descriptions ───────────────────────────────────────

/**
 * Rich text descriptions used as prototype embeddings for each archetype.
 * Intentionally verbose to capture the full semantic space.
 */
const ARCHETYPE_TEXTS = {
  runway: `High fashion runway model. Extremely tall and slender with sharp angular facial features,
    high cheekbones, strong jawline, and piercing eyes. An avant-garde and edgy aesthetic with
    androgynous features. Classic elegant refined presence. Striking and unconventional beauty.
    Dark dramatic intense features or ethereal otherworldly look. Long neck, elongated limbs.
    Geometric bone structure. Walks with commanding presence and fluid movement.`,

  editorial: `Editorial magazine model. Striking unique features that photograph exceptionally well.
    Expressive eyes with a versatile ability to convey complex emotions. Photogenic bone structure
    with high cheekbones and defined features. An artistic edgy look with unconventional beauty.
    Intense brooding gaze or playful whimsical expression. Fashion-forward styling with editorial
    intelligence. Expressive and communicative through facial expressions. Strong visual storytelling.`,

  commercial: `Commercial advertising model. Approachable friendly and relatable appearance.
    Warm welcoming smile with bright eyes. Girl-next-door or boy-next-door aesthetic.
    Classic all-American look. Diverse relatable beauty that appeals to broad audiences.
    Clean healthy appearance with natural beauty. Friendly approachable trustworthy face.
    Wholesome and aspirational lifestyle imagery. Versatile for family, beauty, and product campaigns.`,

  lifestyle: `Lifestyle brand ambassador model. Athletic sporty and active appearance.
    Healthy glowing skin and natural beauty. Fit toned body with an active outdoorsy look.
    Adventurous energetic and vibrant personality. Young fresh and modern aesthetic.
    Relatable aspirational active lifestyle. Natural organic wellness aesthetic.
    Warm sunny approachable with an active sporty build. Fitness, travel, and wellness campaigns.`
};

// ─── Lazy embed & upsert ─────────────────────────────────────────────────────

/**
 * Ensure all 4 archetype rows have embeddings. No-op if already populated.
 * Safe to call on every request — exits early if all rows are already embedded.
 *
 * @param {import('knex').Knex} knex
 */
async function ensureArchetypeEmbeddings(knex) {
  if (!isPostgresKnex(knex)) return;

  try {
    // Check which archetypes are missing embeddings
    const existing = await knex('archetype_embeddings')
      .whereNotNull('embedding')
      .select('name');

    const populated = new Set(existing.map((r) => r.name));
    const missing = Object.keys(ARCHETYPE_TEXTS).filter((name) => !populated.has(name));

    if (missing.length === 0) return; // All populated — fast path

    console.log('[archetypes] Embedding missing archetypes:', missing);

    for (const name of missing) {
      const text = ARCHETYPE_TEXTS[name];
      const embedding = await embed(text);
      const vectorLiteral = toVectorLiteral(embedding);

      await knex.raw(
        `INSERT INTO archetype_embeddings (name, embedding, embedded_at, updated_at)
         VALUES (?, ?::vector, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET
           embedding   = EXCLUDED.embedding,
           embedded_at = NOW(),
           updated_at  = NOW()`,
        [name, vectorLiteral]
      );

      console.log(`[archetypes] Embedded archetype: ${name}`);
    }
  } catch (err) {
    console.warn('[archetypes] ensureArchetypeEmbeddings failed (non-blocking):', err.message);
  }
}

// ─── Vector score computation ─────────────────────────────────────────────────

/**
 * Compute archetype scores for a profile using cosine similarity to
 * archetype prototype embeddings.
 *
 * Algorithm:
 *   1. Fetch talent's image embedding from talent_image_embeddings
 *   2. Compute cosine distance to each archetype prototype via pgvector <=>
 *   3. Convert distance → similarity: similarity = 1 − distance
 *   4. Min-max normalise across the 4 values → 0-100 scores
 *
 * Returns null (non-throwing) on any failure or missing data.
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @returns {Promise<{runway:number, editorial:number, commercial:number, lifestyle:number}|null>}
 */
async function computeVectorArchetypeScores(knex, profileId) {
  if (!isPostgresKnex(knex)) return null;

  try {
    // Verify the talent has an image embedding
    const talentRow = await knex('talent_image_embeddings')
      .where({ profile_id: profileId })
      .whereNotNull('embedding')
      .first();

    if (!talentRow) {
      console.warn('[archetypes] No image embedding for profile:', profileId);
      return null;
    }

    // Compute cosine distance from talent embedding to each archetype prototype.
    // pgvector <=> returns cosine distance ∈ [0, 2]: 0 = identical, 2 = opposite.
    const result = await knex.raw(
      `SELECT ae.name,
              (ti.embedding <=> ae.embedding) AS cosine_distance
       FROM talent_image_embeddings ti
       CROSS JOIN archetype_embeddings ae
       WHERE ti.profile_id = ?
         AND ae.embedding IS NOT NULL`,
      [profileId]
    );

    const distances = result.rows || result;

    if (!distances || distances.length === 0) return null;

    // Convert cosine distance → similarity (higher = more similar)
    const similarities = {};
    for (const row of distances) {
      similarities[row.name] = 1 - parseFloat(row.cosine_distance);
    }

    // Guard: ensure all 4 archetypes are present
    const required = ['runway', 'editorial', 'commercial', 'lifestyle'];
    if (!required.every((k) => k in similarities)) return null;

    // Min-max normalise to 0-100 across all 4 values
    const vals = required.map((k) => similarities[k]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1; // avoid divide-by-zero when all values are equal

    const normalize = (v) => Math.max(0, Math.min(100, Math.round(((v - min) / range) * 100)));

    const scores = {
      runway:     normalize(similarities.runway),
      editorial:  normalize(similarities.editorial),
      commercial: normalize(similarities.commercial),
      lifestyle:  normalize(similarities.lifestyle)
    };

    console.log('[archetypes] Vector scores computed:', scores);
    return scores;

  } catch (err) {
    console.warn('[archetypes] computeVectorArchetypeScores failed (non-blocking):', err.message);
    return null;
  }
}

module.exports = {
  ARCHETYPE_TEXTS,
  ensureArchetypeEmbeddings,
  computeVectorArchetypeScores
};
