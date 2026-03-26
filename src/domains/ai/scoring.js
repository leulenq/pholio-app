/**
 * imageScoring.js — Image-Analysis-Driven Scoring
 *
 * Translates open-ended Groq Vision casting assessments into numerical
 * category scores using keyword matching. Values that don't match any
 * keywords receive a neutral score — this is correct behavior.
 *
 * Public API:
 *   scoreFromImageAnalysis(imageAnalysis) → { runway, editorial, commercial, lifestyle, swimFitness }
 *   buildDescriptorPrompt(imageAnalysis, topCategory, overallScore) → string
 */

'use strict';

// ─── Keyword scoring ────────────────────────────────────────────────────────

/**
 * Score image analysis fields into category scores (0-100).
 * Uses keyword matching on free-form text — no enum validation.
 *
 * @param {Object} imageAnalysis - Parsed image_analysis JSONB from profiles
 * @returns {{ runway: number, editorial: number, commercial: number, lifestyle: number, swimFitness: number }}
 */
function scoreFromImageAnalysis(imageAnalysis) {
  if (!imageAnalysis) return { runway: 0, editorial: 0, commercial: 0, lifestyle: 0, swimFitness: 0 };

  const scores = { runway: 50, editorial: 50, commercial: 50, lifestyle: 50, swimFitness: 50 };

  // ── Feature Contrast ──────────────────────────────────────────────────────
  const contrastText = (imageAnalysis.featureContrast || '').toLowerCase();
  if (contrastText.includes('high') || contrastText.includes('strong') || contrastText.includes('striking')) {
    scores.editorial += 20;
    scores.runway += 15;
  } else if (contrastText.includes('medium') || contrastText.includes('moderate')) {
    scores.commercial += 10;
    scores.lifestyle += 10;
  } else if (contrastText.includes('low') || contrastText.includes('soft') || contrastText.includes('subtle')) {
    scores.commercial += 15;
    scores.lifestyle += 15;
  }

  // ── Look Type ─────────────────────────────────────────────────────────────
  const lookText = (imageAnalysis.lookType || '').toLowerCase();
  if (lookText.includes('editorial') || lookText.includes('high fashion')) {
    scores.editorial += 35;
    scores.runway += 25;
  } else if (lookText.includes('commercial') || lookText.includes('natural')) {
    scores.commercial += 35;
    scores.lifestyle += 20;
  } else if (lookText.includes('athletic') || lookText.includes('active') || lookText.includes('fitness')) {
    scores.swimFitness += 35;
    scores.lifestyle += 25;
  } else if (lookText.includes('runway') || lookText.includes('avant')) {
    scores.runway += 40;
    scores.editorial += 20;
  } else if (lookText.includes('classic') || lookText.includes('catalogue')) {
    scores.commercial += 30;
    scores.lifestyle += 20;
  } else if (lookText.includes('beauty') || lookText.includes('cosmetic')) {
    scores.editorial += 25;
    scores.commercial += 25;
  }

  // ── Bone Structure ────────────────────────────────────────────────────────
  const boneText = (imageAnalysis.boneStructure || '').toLowerCase();
  if (boneText.includes('angular') || boneText.includes('chiseled') || boneText.includes('sharp') || boneText.includes('defined')) {
    scores.editorial += 15;
    scores.runway += 15;
  } else if (boneText.includes('soft') || boneText.includes('round') || boneText.includes('approachable')) {
    scores.commercial += 15;
    scores.lifestyle += 10;
  } else if (boneText.includes('symmetr') || boneText.includes('balanced')) {
    scores.commercial += 10;
    scores.editorial += 10;
  }

  // ── Symmetry ──────────────────────────────────────────────────────────────
  const symmetryText = (imageAnalysis.symmetryRead || '').toLowerCase();
  if (symmetryText.includes('exceptional') || symmetryText.includes('remarkable') || symmetryText.includes('striking')) {
    scores.runway += 15;
    scores.editorial += 15;
    scores.commercial += 10;
  } else if (symmetryText.includes('high') || symmetryText.includes('strong') || symmetryText.includes('excellent')) {
    scores.runway += 10;
    scores.editorial += 10;
  } else if (symmetryText.includes('moderate') || symmetryText.includes('average')) {
    scores.commercial += 5;
    scores.lifestyle += 5;
  }

  // ── Expression ────────────────────────────────────────────────────────────
  const expressionText = (imageAnalysis.expressionRead || '').toLowerCase();
  if (expressionText.includes('editorial') || expressionText.includes('intense') || expressionText.includes('fierce')) {
    scores.editorial += 10;
    scores.runway += 10;
  } else if (expressionText.includes('approachable') || expressionText.includes('warm') || expressionText.includes('friendly')) {
    scores.commercial += 15;
    scores.lifestyle += 10;
  } else if (expressionText.includes('joyful') || expressionText.includes('energetic')) {
    scores.lifestyle += 15;
    scores.commercial += 10;
  }

  // ── Photo Quality ─────────────────────────────────────────────────────────
  const qualityText = (imageAnalysis.photoQuality || '').toLowerCase();
  if (qualityText.includes('excellent') || qualityText.includes('outstanding') || qualityText.includes('professional')) {
    // Quality bonus across all categories
    scores.runway += 5;
    scores.editorial += 5;
    scores.commercial += 5;
  } else if (qualityText.includes('poor') || qualityText.includes('low') || qualityText.includes('amateur')) {
    // Slight penalty — poor photo undermines reads
    scores.runway -= 10;
    scores.editorial -= 10;
  }

  // ── Market Signals ────────────────────────────────────────────────────────
  const signals = (imageAnalysis.marketSignals || []).map(s => (s || '').toLowerCase());
  for (const signal of signals) {
    if (signal.includes('runway') || signal.includes('fashion week')) scores.runway += 5;
    if (signal.includes('editorial') || signal.includes('magazine') || signal.includes('vogue')) scores.editorial += 5;
    if (signal.includes('commercial') || signal.includes('advertising') || signal.includes('campaign')) scores.commercial += 5;
    if (signal.includes('lifestyle') || signal.includes('catalog') || signal.includes('e-comm')) scores.lifestyle += 5;
    if (signal.includes('fitness') || signal.includes('swim') || signal.includes('athletic') || signal.includes('sport')) scores.swimFitness += 5;
    if (signal.includes('beauty') || signal.includes('cosmetic') || signal.includes('skincare')) {
      scores.editorial += 3;
      scores.commercial += 3;
    }
  }

  // ── Clamp all scores to 0-100 ─────────────────────────────────────────────
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  return {
    runway: clamp(scores.runway),
    editorial: clamp(scores.editorial),
    commercial: clamp(scores.commercial),
    lifestyle: clamp(scores.lifestyle),
    swimFitness: clamp(scores.swimFitness)
  };
}

// ─── Descriptor prompt ──────────────────────────────────────────────────────

/**
 * Build a Groq prompt to generate a one-line look descriptor for the reveal.
 *
 * @param {Object} imageAnalysis - Parsed image_analysis JSONB
 * @param {string} topCategory - Top market category label
 * @param {number} overallScore - Overall readiness score (0-100)
 * @returns {string} Prompt string for Groq text completion
 */
function buildDescriptorPrompt(imageAnalysis, topCategory, overallScore) {
  return `You are a senior talent agent writing a one-line casting note for a talent's profile card.

Based on this casting assessment, write a single sentence (maximum 18 words) that captures this talent's most bookable quality. Be specific, use industry language, sound like a professional — not a marketing copywriter. No quotes, no explanation, just the sentence.

Casting assessment:
${JSON.stringify(imageAnalysis, null, 2)}

Top market: ${topCategory}
Overall readiness: ${overallScore}/100`;
}

module.exports = { scoreFromImageAnalysis, buildDescriptorPrompt };
