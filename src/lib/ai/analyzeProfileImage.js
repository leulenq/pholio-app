/**
 * analyzeProfileImage.js — Groq Vision Image Analysis Service
 *
 * Analyzes a talent's headshot using Groq Vision and returns structured
 * casting-grade assessments: skin tone, bone structure, feature contrast,
 * look type, photo quality, and market signals.
 *
 * Public API:
 *   runImageAnalysis(knex, imageUrl, profileId) → analysis result or null
 *
 * Writes to profiles table:
 *   - image_analysis (JSONB)
 *   - image_analyzed_at (TIMESTAMP)
 *   - image_analysis_model (VARCHAR)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const config = require('../../config');
const { scoreFromImageAnalysis, buildDescriptorPrompt } = require('./imageScoring');

// ─── Groq client (lazy init) ────────────────────────────────────────────────

let _groq = null;
function getGroq() {
  if (!_groq) {
    const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('[ImageAnalysis] GROQ_API_KEY missing — analysis will be skipped.');
      return null;
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

// ─── Vision model + prompt ──────────────────────────────────────────────────

const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const MASTER_VISION_PROMPT = `You are a senior casting director at a premier international modeling agency reviewing a new talent submission. You are also providing physical measurement estimates for their profile.

Analyze this photograph and return a single JSON object with two sections: measurement estimates and casting assessment.

Return exactly this structure, no other text:

{
  "measurementEstimates": {
    "height_cm": <number or null>,
    "bust_cm": <number or null>,
    "waist_cm": <number or null>,
    "hips_cm": <number or null>,
    "weight_kg": <number or null>,
    "build_type": "Petite | Slim | Athletic | Average | Curvy | Plus",
    "confidence": "Low | Medium | High",
    "visible_features": ["list what was visible to derive these estimates"]
  },
  "castingAnalysis": {
    "skinTone": "specific description of skin tone and undertones as visible in this image",
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

const TEXT_MODEL = 'llama-3.3-70b-versatile';

/**
 * Analyze a profile's primary photo with Groq Vision from a raw buffer.
 *
 * @param {import('knex').Knex} knex - Knex instance
 * @param {Buffer} imageBuffer - Raw image buffer (must be < 20MB)
 * @param {string} profileId - Profile UUID
 * @returns {Promise<Object|null>} Parsed measurementEstimates object, or null on failure
 */
async function masterVisionAnalysis(knex, imageBuffer, profileId) {
  const groq = getGroq();
  if (!groq) {
    console.warn(`[ImageAnalysis] Skipped for profile ${profileId} — no Groq client.`);
    return null;
  }

  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/webp'; // We assume sharp typically converts to webp up the chain

  // Guard: size check (Groq limit is ~20MB)
  const sizeInMB = imageBuffer.length / (1024 * 1024);
  if (sizeInMB > 19) {
    console.warn(`[MasterVision] Image too large (${sizeInMB.toFixed(1)}MB), skipping:`, profileId);
    return null;
  }

  try {
    // Single vision call — returns both measurements and casting analysis
    const visionResponse = await groq.chat.completions.create({
      model: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: MASTER_VISION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
        ]
      }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_completion_tokens: 1500
    });

    let content = visionResponse.choices[0]?.message?.content || '{}';
    content = content.replace(/```json\n?|\n?```/g, '').trim();

    const parsed = JSON.parse(content);
    const { measurementEstimates = {}, castingAnalysis = {} } = parsed;

    // Validate minimum expected fields
    if (!castingAnalysis.skinTone && !castingAnalysis.boneStructure) {
      console.warn(`[MasterVision] Empty casting analysis for profile ${profileId} — discarding.`);
      await clearAnalysis(knex, profileId);
      return null;
    }

    // Store casting analysis on profile
    await knex('profiles').where({ id: profileId }).update({
      image_analysis: JSON.stringify(castingAnalysis),
      image_analyzed_at: knex.fn.now(),
      image_analysis_model: VISION_MODEL,
      updated_at: knex.fn.now()
    });

    // Generate look descriptor from casting analysis (Call 2)
    const descriptor = await generateLookDescriptor(castingAnalysis, profileId);
    if (descriptor) {
      await knex('profiles').where({ id: profileId }).update({
        look_descriptor: descriptor,
        look_descriptor_generated_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
    }

    console.log(`[MasterVision] ✓ Profile ${profileId} analyzed:`, {
      skinTone: castingAnalysis.skinTone,
      boneStructure: castingAnalysis.boneStructure,
      lookType: castingAnalysis.lookType,
      descriptor: descriptor ? 'Generated' : 'Failed'
    });

    // Return measurement estimates for onboarding prefill
    return measurementEstimates;

  } catch (error) {
    console.error(`[MasterVision] Failed for profile ${profileId}:`, error.message);
    await clearAnalysis(knex, profileId);
    return null;
  }
}

/**
 * Given a casting analysis block, calculate scores and hit Llama 3 for a one-line description.
 */
async function generateLookDescriptor(castingAnalysis, profileId) {
  const groq = getGroq();
  if (!groq) return null;

  try {
    // Calculate scores to feed into descriptor prompt
    const scores = scoreFromImageAnalysis(castingAnalysis);
    
    // Find top market and overall readiness
    const sortedMarkets = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedMarkets[0][0];
    const overallScore = Math.round(
      (scores.runway + scores.editorial + scores.commercial + scores.lifestyle + scores.swimFitness) / 5
    );

    const descriptorPrompt = buildDescriptorPrompt(castingAnalysis, topCategory, overallScore);
    
    const descCompletion = await groq.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: descriptorPrompt }],
      temperature: 0.4,
      max_completion_tokens: 100
    });

    let lookDescriptor = descCompletion.choices[0]?.message?.content?.trim() || null;
    if (lookDescriptor) {
      // Strip quotes if model added them
      lookDescriptor = lookDescriptor.replace(/^["']|["']$/g, '');
    }
    
    return lookDescriptor;
  } catch (descError) {
    console.error(`[MasterVision] Failed to generate descriptor for profile ${profileId}:`, descError.message);
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function clearAnalysis(knex, profileId) {
  try {
    await knex('profiles').where({ id: profileId }).update({
      image_analysis: null,
      updated_at: knex.fn.now()
    });
  } catch (e) {
    // Silent — this is a cleanup path
  }
}

module.exports = { masterVisionAnalysis };
