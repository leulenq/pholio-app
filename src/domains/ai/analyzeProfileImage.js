/**
 * analyzeProfileImage.js — Groq Vision Image Analysis Service
 *
 * Analyzes a talent's headshot using Groq Vision and returns structured
 * casting-grade assessments: bone structure, feature contrast, look type,
 * photo quality, and market signals.
 *
 * Compliance (Discover WS2): the vision pipeline must NEVER extract or
 * persist AI-estimated skin tone or body measurements. Skin tone /
 * ethnicity must never become a discovery signal, and AI measurement
 * estimation is a bias / pseudo-precision hazard. Do not re-add
 * `skinTone` or `measurementEstimates` to the prompt, the persisted
 * image_analysis JSONB, or anything search-facing.
 *
 * Public API:
 *   masterVisionAnalysis(knex, imageBuffer, profileId) → castingAnalysis or null
 *
 * Writes to profiles table:
 *   - image_analysis (JSONB)
 *   - image_analyzed_at (TIMESTAMP)
 *   - image_analysis_model (VARCHAR)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");
const config = require("../../config");
const { scoreFromImageAnalysis, buildDescriptorPrompt } = require("./scoring");
const {
  buildTextCompletionParams,
} = require("../../shared/lib/groq-text-model");
const {
  hasRecordedDateOfBirth,
  isMinorProfile,
} = require("../../shared/lib/talent-age");

// ─── Groq client (lazy init) ────────────────────────────────────────────────

let _groq = null;
function getGroq() {
  if (!_groq) {
    const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn(
        "[ImageAnalysis] GROQ_API_KEY missing — analysis will be skipped.",
      );
      return null;
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

// ─── Vision model + prompt ──────────────────────────────────────────────────

// Single source of truth — see config.groq.visionModel. Never hardcode here.
const VISION_MODEL = config.groq.visionModel;

const MASTER_VISION_PROMPT = `You are a senior casting director at a premier international modeling agency reviewing a new talent submission.

Analyze this photograph and return a single JSON object containing a casting assessment.

Do NOT estimate, describe, or mention skin tone, complexion, ethnicity, heritage, or body measurements anywhere in your output.

Return exactly this structure, no other text:

{
  "castingAnalysis": {
    "boneStructure": "specific description of facial structure and how it photographs",
    "featureContrast": "assessment of visual contrast between features",
    "lookType": "primary market category this talent signals and why",
    "photoQuality": "honest assessment of photo quality, lighting, and framing",
    "lightingRead": "how lighting affects the talent's read in this image",
    "expressionRead": "emotional and casting register of the expression",
    "symmetryRead": "assessment of facial symmetry and market suitability impact",
    "primaryStrength": "one sentence identifying strongest castable visual asset",
    "castingNotes": "2-3 sentences of open professional casting assessment",
    "marketSignals": ["2-4 specific market categories this look signals strongly"],
    "bookingStrengths": ["2-4 specific visual qualities that are immediately castable"],
    "developmentNotes": "one sentence on what would most strengthen market position"
  }
}`;

// The look descriptor is a TEXT call, not a vision call: it reads the parsed
// casting analysis, never the image. It resolves from config.groq.textModel
// (never hardcoded — see the visionModel note above for why), and the
// completion budget is sized by shared/lib/groq-text-model.js because the
// configured text model is reasoning-class.
const DESCRIPTOR_ANSWER_TOKENS = 100;

/**
 * Has this talent granted image-processing consent, and can they?
 *
 * Consent state only — no feature flag. A minor cannot grant it and a profile
 * with no recorded date of birth cannot be shown to be an adult, so both fail
 * closed regardless of what the column says.
 *
 * `imageAiProcessingAllowed` is this plus the portfolio-classification launch
 * flag. Any caller that is not the portfolio classifier wants this one, and
 * every caller shares this single definition of "consented" so the two cannot
 * drift into disagreeing about what a talent agreed to.
 */
function imageAiConsentGranted(profile) {
  return (
    (profile?.ai_processing_consent === true ||
      profile?.ai_processing_consent === 1) &&
    hasRecordedDateOfBirth(profile) &&
    !isMinorProfile(profile)
  );
}

function imageAiProcessingAllowed(profile, env = process.env) {
  return (
    env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true" && imageAiConsentGranted(profile)
  );
}

async function loadImageAiProfile(knex, profileId, { forUpdate = false } = {}) {
  const columns = ["id", "date_of_birth"];
  if (await knex.schema.hasColumn("profiles", "ai_processing_consent")) {
    columns.push("ai_processing_consent");
  }
  let query = knex("profiles").where({ id: profileId }).select(columns);
  if (
    forUpdate &&
    ["pg", "postgres", "postgresql"].includes(knex.client?.config?.client)
  ) {
    query = query.forUpdate();
  }
  return query.first();
}

async function currentImageAiProcessingAllowed(knex, profileId) {
  const profile = await loadImageAiProfile(knex, profileId);
  return imageAiProcessingAllowed(profile);
}

/** Current image-processing consent state for a profile, read fresh. */
async function currentImageAiConsentGranted(knex, profileId) {
  if (!profileId) return false;
  const profile = await loadImageAiProfile(knex, profileId);
  return imageAiConsentGranted(profile);
}

async function persistProfileImageAiUpdate(knex, profileId, updates) {
  let updated = false;
  await knex.transaction(async (trx) => {
    const profile = await loadImageAiProfile(trx, profileId, {
      forUpdate: true,
    });
    if (!imageAiProcessingAllowed(profile)) return;
    await trx("profiles")
      .where({ id: profileId })
      .update({ ...updates, updated_at: trx.fn.now() });
    updated = true;
  });
  return updated;
}

/**
 * Analyze a profile's primary photo with Groq Vision from a raw buffer.
 *
 * @param {import('knex').Knex} knex - Knex instance
 * @param {Buffer} imageBuffer - Raw image buffer (must be < 20MB)
 * @param {string} profileId - Profile UUID
 * @returns {Promise<Object|null>} Sanitized castingAnalysis object, or null on failure
 */
async function masterVisionAnalysis(knex, imageBuffer, profileId) {
  const groq = getGroq();
  if (!groq) {
    console.warn(
      `[ImageAnalysis] Skipped for profile ${profileId} — no Groq client.`,
    );
    return null;
  }

  const base64Image = imageBuffer.toString("base64");
  const mimeType = "image/webp"; // We assume sharp typically converts to webp up the chain

  // Guard: size check (Groq limit is ~20MB)
  const sizeInMB = imageBuffer.length / (1024 * 1024);
  if (sizeInMB > 19) {
    console.warn(
      `[MasterVision] Image too large (${sizeInMB.toFixed(1)}MB), skipping:`,
      profileId,
    );
    return null;
  }

  // Upload requests and queued work can outlive the consent state they began
  // with. Use the profile row and feature flag as they exist at the exact
  // provider boundary; never trust a route-captured profile object.
  if (!(await currentImageAiProcessingAllowed(knex, profileId))) return null;

  try {
    // Single vision call — returns the casting analysis
    const visionResponse = await groq.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: MASTER_VISION_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: config.groq.visionReasoningEffort,
      temperature: 0.2,
      max_completion_tokens: 1500,
    });

    // Consent may be withdrawn while the provider is working. Drop the result
    // before parsing, cleanup, or persistence when that happens.
    if (!(await currentImageAiProcessingAllowed(knex, profileId))) return null;

    let content = visionResponse.choices[0]?.message?.content || "{}";
    content = content.replace(/```json\n?|\n?```/g, "").trim();

    const parsed = JSON.parse(content);
    const castingAnalysis = stripSensitiveVisionFields(
      parsed.castingAnalysis || {},
    );

    // Validate minimum expected fields
    if (!castingAnalysis.boneStructure && !castingAnalysis.lookType) {
      console.warn(
        `[MasterVision] Empty casting analysis for profile ${profileId} — discarding.`,
      );
      await clearAnalysis(knex, profileId);
      return null;
    }

    // Store casting analysis on profile
    const analysisStored = await persistProfileImageAiUpdate(knex, profileId, {
      image_analysis: JSON.stringify(castingAnalysis),
      image_analyzed_at: knex.fn.now(),
      image_analysis_model: VISION_MODEL,
    });
    if (!analysisStored) return null;

    // Generate look descriptor from casting analysis (Call 2)
    const descriptor = await generateLookDescriptor(
      castingAnalysis,
      profileId,
      knex,
    );
    if (descriptor) {
      const descriptorStored = await persistProfileImageAiUpdate(
        knex,
        profileId,
        {
          look_descriptor: descriptor,
          look_descriptor_generated_at: knex.fn.now(),
        },
      );
      if (!descriptorStored) return null;
    }

    // Do not perform downstream writes after a withdrawal that happened while
    // descriptor generation was in flight.
    if (!(await currentImageAiProcessingAllowed(knex, profileId))) return null;

    console.log(`[MasterVision] ✓ Profile ${profileId} analyzed:`, {
      boneStructure: castingAnalysis.boneStructure,
      lookType: castingAnalysis.lookType,
      descriptor: descriptor ? "Generated" : "Failed",
    });

    // Return the sanitized casting analysis (no consumer prefills
    // measurements from this pipeline — see WS2 compliance note above).
    return castingAnalysis;
  } catch (error) {
    console.error(
      `[MasterVision] Failed for profile ${profileId}:`,
      error.message,
    );
    try {
      if (await currentImageAiProcessingAllowed(knex, profileId)) {
        await clearAnalysis(knex, profileId);
      }
    } catch {
      // Preserve the provider's fail-soft contract when the eligibility
      // re-read itself fails.
    }
    return null;
  }
}

/**
 * Given a casting analysis block, calculate scores and hit Llama 3 for a one-line description.
 */
async function generateLookDescriptor(castingAnalysis, profileId, knex) {
  const groq = getGroq();
  if (!groq) return null;

  try {
    // Calculate scores to feed into descriptor prompt
    const scores = scoreFromImageAnalysis(castingAnalysis);

    // Find top market and overall readiness
    const sortedMarkets = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedMarkets[0][0];
    const overallScore = Math.round(
      (scores.runway +
        scores.editorial +
        scores.commercial +
        scores.lifestyle +
        scores.swimFitness) /
        5,
    );

    const descriptorPrompt = buildDescriptorPrompt(
      castingAnalysis,
      topCategory,
      overallScore,
    );

    if (!(await currentImageAiProcessingAllowed(knex, profileId))) return null;

    const descCompletion = await groq.chat.completions.create(
      buildTextCompletionParams({
        messages: [{ role: "user", content: descriptorPrompt }],
        temperature: 0.4,
        maxTokens: DESCRIPTOR_ANSWER_TOKENS,
      }),
    );

    if (!(await currentImageAiProcessingAllowed(knex, profileId))) return null;

    let lookDescriptor =
      descCompletion.choices[0]?.message?.content?.trim() || null;
    if (lookDescriptor) {
      // Strip quotes if model added them
      lookDescriptor = lookDescriptor.replace(/^["']|["']$/g, "");
    }

    return lookDescriptor;
  } catch (descError) {
    console.error(
      `[MasterVision] Failed to generate descriptor for profile ${profileId}:`,
      descError.message,
    );
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sensitive vision fields that must never persist or reach anything
 * search-facing (WS2 compliance). Kept as a list so the backfill script
 * (scripts/strip-vision-sensitive-fields.js) can share the same contract.
 */
const SENSITIVE_VISION_KEYS = [
  "skinTone",
  "skin_tone",
  "measurementEstimates",
  "measurement_estimates",
];

/**
 * Defensively remove banned keys from a parsed castingAnalysis object.
 * The prompt no longer requests them, but vision models occasionally emit
 * schema fields they were trained on — never trust model output here.
 *
 * @param {Object} castingAnalysis
 * @returns {Object} same object with sensitive keys deleted
 */
function stripSensitiveVisionFields(castingAnalysis) {
  if (!castingAnalysis || typeof castingAnalysis !== "object") return {};
  for (const key of SENSITIVE_VISION_KEYS) {
    delete castingAnalysis[key];
  }
  return castingAnalysis;
}

async function clearAnalysis(knex, profileId) {
  try {
    await persistProfileImageAiUpdate(knex, profileId, {
      image_analysis: null,
    });
  } catch (e) {
    // Silent — this is a cleanup path
  }
}

module.exports = {
  masterVisionAnalysis,
  imageAiConsentGranted,
  imageAiProcessingAllowed,
  loadImageAiProfile,
  currentImageAiConsentGranted,
  currentImageAiProcessingAllowed,
  stripSensitiveVisionFields,
  SENSITIVE_VISION_KEYS,
};
