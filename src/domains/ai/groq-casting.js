/**
 * Groq Casting Pipeline — 2-Step AI Archetype Generation
 *
 * Step 1 — Scout (llama-4-maverick, vision)
 *   Analyzes a headshot for observable traits only.
 *   Returns: { face_structure, body_impression, vibe_tags }
 *
 * Step 2 — Director (openai/gpt-oss-20b, text/reasoning)
 *   Synthesizes Scout output + physical stats into archetype scores.
 *   Returns: { scores: {runway, editorial, commercial, lifestyle}, verdict, primary_archetype }
 *
 * Vector blending:
 *   After Director, computes cosine similarity to archetype prototype embeddings
 *   and blends: final = 0.6 × director + 0.4 × vector (Director-only if vector unavailable).
 *
 * Public exports:
 *   generateArchetype(knex, profileId, photoStorageKey, stats) → full result
 *   blendArchetypeScores(directorScores, vectorScores, directorWeight) → scores
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const config = require('../../config');
const { upsertImageEmbedding, buildScoutText } = require('./embeddings');
const { ensureArchetypeEmbeddings, computeVectorArchetypeScores } = require('./archetypes');

// Lazy initialization to prevent crash on missing API Key
let _groq = null;
function getGroq() {
  if (!_groq) {
      const apiKey = config.groq.apiKey || process.env.GROQ_API_KEY;
      if (!apiKey) {
          console.warn('[Groq] API Key missing. AI features will fail gracefully.');
          // Initialize with dummy key to allow app to start, but calls will fail
          _groq = new Groq({ apiKey: 'dummy-key-for-init' });
      } else {
          _groq = new Groq({ apiKey });
      }
  }
  return _groq;
}

// ─── Step 1: Scout ─────────────────────────────────────────────────────────

const SCOUT_SYSTEM = `You are a casting assistant. Analyze this headshot for professional modeling potential.
Describe the VALID OBSERVABLE TRAITS only. Do NOT guess measurements.
Output strictly valid JSON:
{
  "face_structure": "string (e.g., 'high cheekbones, sharp jawline, soft features')",
  "body_impression": "string (e.g., 'slender', 'athletic', 'curvy' - based on neck/shoulders)",
  "vibe_tags": ["list", "of", "3-5", "adjectives", "e.g.", "edgy", "commercial", "classic"]
}`;

async function runScout(absolutePath) {
  const imageBuffer = fs.readFileSync(absolutePath);
  const base64Image = imageBuffer.toString('base64');

  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType =
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    'image/jpeg';

  const completion = await getGroq().chat.completions.create({
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: SCOUT_SYSTEM },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
      ]
    }],
    temperature: 0.3,
    max_completion_tokens: 512,
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

// ─── Step 2: Director ───────────────────────────────────────────────────────

function buildDirectorPrompt(scoutResult, stats) {
  const { height_cm, age, gender } = stats;
  return `Act as a Casting Director. Synthesize this data into a Modeling Archetype Profile.

[INPUT DATA]
Visuals: ${JSON.stringify(scoutResult)}
Stats: Height ${height_cm ? `${height_cm}cm` : 'unknown'}, Age ${age || 'unknown'}, Gender ${gender || 'unknown'}

[TASK]
1. Assign a 0-100 score for each Archetype: Runway, Editorial, Commercial, Lifestyle.
2. Write a 1-sentence "Casting Verdict" (e.g., "Strong editorial potential due to unique features and height.").

[OUTPUT]
Strictly valid JSON:
{
  "scores": { "runway": 0, "editorial": 0, "commercial": 0, "lifestyle": 0 },
  "verdict": "string",
  "primary_archetype": "string"
}`;
}

async function runDirector(scoutResult, stats) {
  const completion = await getGroq().chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: buildDirectorPrompt(scoutResult, stats) }],
    temperature: 0.4,
    max_completion_tokens: 512,
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

// ─── Fallback Director (uses math scoring when openai/gpt-oss-20b fails) ────

function fallbackDirector(scoutResult, stats) {
  const { height_cm = 170, gender = 'female' } = stats;
  const tags = (scoutResult.vibe_tags || []).join(' ').toLowerCase();
  const build = (scoutResult.body_impression || '').toLowerCase();

  // Baseline
  let runway = 50, editorial = 50, commercial = 60, lifestyle = 60;

  // Height signal
  const minRunway = gender === 'male' ? 183 : 175;
  if (height_cm >= minRunway) { runway += 20; editorial += 15; }
  else if (height_cm >= minRunway - 5) { editorial += 10; commercial += 5; }
  else { commercial += 10; lifestyle += 10; }

  // Vibe signals
  if (/edgy|editorial|fierce|avant.garde/.test(tags)) editorial += 15;
  if (/commercial|friendly|approachable|girl.next.door/.test(tags)) commercial += 15;
  if (/athletic|sporty|fit/.test(tags)) lifestyle += 15;
  if (/classic|elegant|refined/.test(tags)) runway += 10;

  // Build signal
  if (/slender|lean/.test(build)) { runway += 10; editorial += 5; }
  if (/athletic/.test(build)) { lifestyle += 10; commercial += 5; }
  if (/curvy/.test(build)) { commercial += 10; lifestyle += 5; }

  // Clamp to 0-100
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const scores = {
    runway: clamp(runway),
    editorial: clamp(editorial),
    commercial: clamp(commercial),
    lifestyle: clamp(lifestyle)
  };

  // Primary archetype = highest score
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const labels = {
    runway: 'Runway Star',
    editorial: 'Editorial Icon',
    commercial: 'Commercial Lead',
    lifestyle: 'Lifestyle Ambassador'
  };

  return {
    scores,
    verdict: `Strong ${top[0]} potential based on physical traits and visual impression.`,
    primary_archetype: labels[top[0]] || 'Versatile Talent'
  };
}

// ─── Score blending ──────────────────────────────────────────────────────────

/**
 * Blend Director scores (reasoning) and vector scores (similarity) into final scores.
 * Director carries more weight (default 60%) as it has access to physical stats.
 * Falls back to Director-only when vectorScores is null.
 *
 * @param {{runway:number, editorial:number, commercial:number, lifestyle:number}} directorScores
 * @param {{runway:number, editorial:number, commercial:number, lifestyle:number}|null} vectorScores
 * @param {number} [directorWeight=0.6]
 * @returns {{runway:number, editorial:number, commercial:number, lifestyle:number}}
 */
function blendArchetypeScores(directorScores, vectorScores, directorWeight = 0.6) {
  if (!vectorScores) return { ...directorScores }; // Director-only fallback

  const vectorWeight = 1 - directorWeight;
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

  return {
    runway:     clamp(directorScores.runway     * directorWeight + vectorScores.runway     * vectorWeight),
    editorial:  clamp(directorScores.editorial  * directorWeight + vectorScores.editorial  * vectorWeight),
    commercial: clamp(directorScores.commercial * directorWeight + vectorScores.commercial * vectorWeight),
    lifestyle:  clamp(directorScores.lifestyle  * directorWeight + vectorScores.lifestyle  * vectorWeight)
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

const ARCHETYPE_LABELS = {
  runway: 'Runway Star',
  editorial: 'Editorial Icon',
  commercial: 'Commercial Lead',
  lifestyle: 'Lifestyle Ambassador'
};

/**
 * Run the full casting pipeline: Scout → image embedding → Director → vector blend.
 *
 * Pipeline:
 *   1. Scout (vision) — observe face, build, vibe tags
 *   2. Store image embedding from Scout text (enables vector scores)
 *   3. Ensure archetype prototype embeddings exist
 *   4. Director (reasoning) — synthesize Scout + stats → archetype scores
 *   5. Vector scores — cosine similarity to archetype prototypes
 *   6. Blend: 60% Director + 40% vector
 *
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {string} photoStorageKey  — relative storage key or absolute path
 * @param {Object} [stats]
 * @param {number} [stats.height_cm]
 * @param {string} [stats.gender]
 * @param {number} [stats.age]
 * @returns {Promise<{
 *   scout: Object,
 *   director: Object,
 *   scores: {runway:number, editorial:number, commercial:number, lifestyle:number},
 *   verdict: string,
 *   primary_archetype: string,
 *   director_scores: {runway:number, editorial:number, commercial:number, lifestyle:number},
 *   vector_scores: {runway:number, editorial:number, commercial:number, lifestyle:number}|null,
 *   final_scores: {runway:number, editorial:number, commercial:number, lifestyle:number}
 * }>}
 */
async function generateArchetype(knex, profileId, photoStorageKey, stats = {}) {
  // Resolve absolute path
  let absolutePath;
  if (path.isAbsolute(photoStorageKey)) {
    absolutePath = photoStorageKey;
  } else {
    absolutePath = path.join(config.uploadsDir, path.basename(photoStorageKey));
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`[groq-casting] Photo not found at: ${absolutePath}`);
  }

  const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

  // ── Step 1: Scout ────────────────────────────────────────────────────────
  let scoutResult;
  try {
    scoutResult = await runScout(absolutePath);
    console.log('[groq-casting] Scout complete:', scoutResult);
  } catch (err) {
    console.error('[groq-casting] Scout (llama-4-maverick) failed:', err.message);
    // Proceed with empty scout — Director can still run on stats alone
    scoutResult = { face_structure: '', body_impression: '', vibe_tags: [] };
  }

  // ── Store image embedding now, before computing vector scores ────────────
  // (computeVectorArchetypeScores needs this row to exist in talent_image_embeddings)
  try {
    const scoutText = buildScoutText(scoutResult);
    if (scoutText && knex && profileId) {
      await upsertImageEmbedding(knex, profileId, scoutText);
      console.log('[groq-casting] Image embedding stored');
    }
  } catch (embErr) {
    console.warn('[groq-casting] Image embedding failed (non-blocking):', embErr.message);
  }

  // ── Ensure archetype prototype embeddings exist ─────────────────────────
  if (knex) {
    await ensureArchetypeEmbeddings(knex);
  }

  // ── Step 2: Director ─────────────────────────────────────────────────────
  let directorResult;
  try {
    directorResult = await runDirector(scoutResult, stats);
    console.log('[groq-casting] Director complete:', directorResult);
  } catch (err) {
    console.error('[groq-casting] Director (openai/gpt-oss-20b) failed, using fallback:', err.message);
    directorResult = fallbackDirector(scoutResult, stats);
  }

  // Normalise director scores (clamp, ensure all 4 keys)
  const directorScores = {
    runway:     clamp(directorResult.scores?.runway),
    editorial:  clamp(directorResult.scores?.editorial),
    commercial: clamp(directorResult.scores?.commercial),
    lifestyle:  clamp(directorResult.scores?.lifestyle)
  };

  // ── Vector archetype scores (best-effort) ────────────────────────────────
  let vectorScores = null;
  if (knex && profileId) {
    vectorScores = await computeVectorArchetypeScores(knex, profileId);
    if (vectorScores) {
      console.log('[groq-casting] Vector scores:', vectorScores);
    }
  }

  // ── Blend: 60% Director + 40% vector ────────────────────────────────────
  const finalScores = blendArchetypeScores(directorScores, vectorScores);

  // Primary archetype from final blended scores
  const top = Object.entries(finalScores).sort((a, b) => b[1] - a[1])[0];
  const primaryArchetype = ARCHETYPE_LABELS[top[0]] || directorResult.primary_archetype || 'Versatile Talent';

  return {
    scout:  scoutResult,
    director: directorResult,
    scores: finalScores,            // backward-compat key — always the final blended scores
    verdict: directorResult.verdict || '',
    primary_archetype: primaryArchetype,
    // Debug breakdown (stored in ai_results for analysis)
    director_scores: directorScores,
    vector_scores:   vectorScores,
    final_scores:    finalScores
  };
}

module.exports = { generateArchetype, blendArchetypeScores };
