"use strict";

/**
 * Photo descriptions for the Discover semantic layer.
 *
 * A vision model writes one short, attribute-neutral paragraph about a
 * photograph: shot type, styling register, mood, lighting, wardrobe, setting,
 * expression. The paragraph is text a talent can read, is embedded as text,
 * and lets a brief like "editorial, androgynous, clean beauty" match how a
 * book looks without any vector of the face ever being stored
 * (tasks/discover-semantic-2026-09.md §2.3, §7).
 *
 * The prompt forbids, and a post-filter drops, anything about race,
 * ethnicity, heritage, skin tone, age, body measurements, health,
 * attractiveness, or resemblance to a person. If the filter trips, the
 * photo simply has no description.
 *
 * Gates (all re-read from the database at the provider boundary, never from a
 * request-captured object): PHOLIO_ENABLE_IMAGE_ANALYSIS and
 * PHOLIO_ENABLE_PROFILE_EMBEDDINGS, both consents, a recorded adult date of
 * birth, and the image not excluded from agencies.
 */

const crypto = require("crypto");
const config = require("../../config");
const { fetchImageBuffer } = require("../../shared/lib/fetch-image-buffer");
const {
  hasRecordedDateOfBirth,
  isMinorProfile,
} = require("../../shared/lib/talent-age");

const MAX_WORDS = 60;

const DESCRIBE_PROMPT = `Describe this photograph for a casting search index in ONE paragraph of at most ${MAX_WORDS} words.

Cover only these aspects, in plain nouns and adjectives: shot type (headshot, three-quarter, full length, profile), styling register (natural, polished, editorial, commercial, avant-garde), mood or energy, lighting (studio, daylight, hard, soft), wardrobe (colour, silhouette, formality), setting or background, expression and pose, hair styling and makeup level.

Never mention, guess, or imply: race, ethnicity, heritage, nationality, skin tone or complexion, age or age range, height, weight, body measurements or body type, health, attractiveness or beauty judgements, gender, or who the person looks like. Do not name the person. Do not evaluate the photo's quality or the person's potential.

Return only the paragraph.`;

// A description is dropped, not edited, if any of these appear.
const DENYLIST = [
  /\b(black|white|asian|latin[ao]?x?|hispanic|african|caucasian|european|arab|indian|mixed[- ]race|biracial|ethnic|ethnicity|heritage|race|racial|nationality)\b/i,
  /\b(skin[- ]?tone|complexion|dark[- ]skinned|light[- ]skinned|fair[- ]skinned|olive skin|melanin|tan(?:ned)?)\b/i,
  /\b(\d{1,2}s|teen(?:age)?r?|twenties|thirties|forties|fifties|elderly|mature|young|youthful|middle[- ]aged|years? old|age)\b/i,
  /\b(tall|short|petite|slim|slender|thin|skinny|curvy|plus[- ]size|athletic build|muscular|overweight|underweight|waist|hips|bust|chest|inches|cm|kg|lbs|pounds)\b/i,
  /\b(beautiful|gorgeous|stunning|attractive|handsome|pretty|ugly|hot|sexy)\b/i,
  /\b(man|woman|male|female|boy|girl|masculine|feminine|androgynous|non[- ]binary)\b/i,
  /\b(looks? like|resembles?|reminiscent of|lookalike)\b/i,
  /\b(sick|ill|disabled|disability|pregnant|scar|acne|blemish)\b/i,
];

function descriptionPasses(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (t.split(/\s+/).length > MAX_WORDS + 15) return false;
  return !DENYLIST.some((re) => re.test(t));
}

function cleanDescription(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}

// ── Groq client (lazy, injectable) ───────────────────────────────────────────

let groqClient = null;
let groqInitFailed = false;

function getGroq() {
  if (groqClient) return groqClient;
  if (groqInitFailed) return null;
  const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    // eslint-disable-next-line global-require
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey });
    return groqClient;
  } catch {
    groqInitFailed = true;
    return null;
  }
}

/** Test seam: inject a mock Groq client (chat.completions.create). */
function __setGroqClient(client) {
  groqClient = client;
  groqInitFailed = false;
}

/**
 * Describe a photograph from its bytes. Returns the paragraph, or null when
 * the model is unavailable or the description fails the attribute filter.
 * @param {Buffer} buffer
 * @param {{ mimeType?: string }} [opts]
 * @returns {Promise<{ text: string, model: string } | null>}
 */
async function describePhotoBuffer(buffer, opts = {}) {
  const groq = getGroq();
  if (!groq || !buffer) return null;
  const model = config.groq?.visionModel || "qwen/qwen3.6-27b";
  const dataUrl = `data:${opts.mimeType || "image/webp"};base64,${buffer.toString("base64")}`;
  try {
    const response = await groq.chat.completions.create({
      model,
      temperature: 0.2,
      max_completion_tokens: 220,
      reasoning_effort: config.groq?.visionReasoningEffort || "none",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DESCRIBE_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    const raw = response?.choices?.[0]?.message?.content || "";
    const text = cleanDescription(raw);
    if (!descriptionPasses(text)) return null;
    return { text, model };
  } catch (err) {
    console.warn(`[describe-photo] vision call failed: ${err.message}`);
    return null;
  }
}

// ── gates ────────────────────────────────────────────────────────────────────

function truthy(v) {
  return v === true || v === 1;
}

function photoDescriptionAllowed(profile, env = process.env) {
  return (
    env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true" &&
    env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true" &&
    truthy(profile?.ai_processing_consent) &&
    truthy(profile?.embedding_processing_consent) &&
    hasRecordedDateOfBirth(profile) &&
    !isMinorProfile(profile)
  );
}

async function loadGateProfile(knex, profileId) {
  return knex("profiles")
    .where({ id: profileId })
    .select(
      "id",
      "date_of_birth",
      "guardian_consent_at",
      "ai_processing_consent",
      "embedding_processing_consent",
    )
    .first();
}

function imageEligible(image) {
  if (!image) return false;
  if (image.exclude_from_agency === true || image.exclude_from_agency === 1) return false;
  const status = image.status == null ? "active" : String(image.status);
  if (!["active"].includes(status)) return false;
  const moderation = image.moderation_status == null ? "" : String(image.moderation_status);
  if (["rejected", "pending_review", "blocked"].includes(moderation)) return false;
  return true;
}

/**
 * Describe one image and store the description on image_signals.
 * Re-reads consent immediately before the provider call and again before the
 * write, so a withdrawal that races an in-flight job wins.
 *
 * @param {import('knex').Knex} knex
 * @param {string} imageId
 * @param {{ describe?: typeof describePhotoBuffer, env?: object }} [opts]
 * @returns {Promise<{ status: 'described'|'skipped'|'filtered'|'failed', text?: string }>}
 */
async function describeAndStore(knex, imageId, opts = {}) {
  const env = opts.env || process.env;
  const describe = opts.describe || describePhotoBuffer;

  const image = await knex("images").where({ id: imageId }).first();
  if (!image || !imageEligible(image)) return { status: "skipped" };

  const before = await loadGateProfile(knex, image.profile_id);
  if (!photoDescriptionAllowed(before, env)) return { status: "skipped" };

  const buffer = await fetchImageBuffer(image);
  if (!buffer) return { status: "failed" };

  const result = await describe(buffer, { mimeType: "image/webp" });
  if (!result) return { status: "filtered" };

  const after = await loadGateProfile(knex, image.profile_id);
  if (!photoDescriptionAllowed(after, env)) return { status: "skipped" };

  const now = knex.fn.now();
  const existing = await knex("image_signals").where({ image_id: imageId }).first();
  if (existing) {
    await knex("image_signals").where({ image_id: imageId }).update({
      description: result.text,
      description_model: result.model,
      described_at: now,
      updated_at: now,
    });
  } else {
    await knex("image_signals").insert({
      id: crypto.randomUUID(),
      image_id: imageId,
      description: result.text,
      description_model: result.model,
      described_at: now,
      created_at: now,
      updated_at: now,
    });
  }
  return { status: "described", text: result.text };
}

/** Clear every stored description for a profile's images (consent withdrawal). */
async function clearPhotoDescriptions(knex, profileId) {
  if (!(await knex.schema.hasTable("image_signals"))) return;
  if (!(await knex.schema.hasColumn("image_signals", "description"))) return;
  const imageIds = (
    await knex("images").where({ profile_id: profileId }).select("id")
  ).map((r) => r.id);
  if (!imageIds.length) return;
  await knex("image_signals").whereIn("image_id", imageIds).update({
    description: null,
    description_model: null,
    described_at: null,
    updated_at: knex.fn.now(),
  });
}

module.exports = {
  describePhotoBuffer,
  describeAndStore,
  clearPhotoDescriptions,
  descriptionPasses,
  photoDescriptionAllowed,
  imageEligible,
  DESCRIBE_PROMPT,
  DENYLIST,
  __setGroqClient,
};
