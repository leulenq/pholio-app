"use strict";

const { scoreBio, passesBioQuality, resolveBounds } = require("./quality-rubric");
const { resolveRichness } = require("./context-builder");
const {
  findFabrications,
  findDroppedUserFacts,
  findCoveredSignals,
  findGroundableSignals,
} = require("./grounding");

/**
 * Allow-list of phrases the bio may reuse.
 *
 * NOTE: also consumed by the submission-note writer
 * (services/submission-note-writer/output-validator.js). Keep the signature and
 * the shape of the return value stable.
 */
function collectAllowedPhrases(context = {}, existingBio = "") {
  const phrases = new Set();

  for (const signal of context.signals || []) {
    if (signal.fact) {
      phrases.add(signal.fact.toLowerCase());
      signal.fact
        .split(/[,|/·]/)
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.length > 3)
        .forEach((p) => phrases.add(p));
    }
  }

  if (context.name) phrases.add(context.name.toLowerCase());

  const nameParts = (context.name || "")
    .split(/\s+/)
    .filter((p) => p.length > 2);
  nameParts.forEach((p) => phrases.add(p.toLowerCase()));

  if (existingBio) {
    existingBio
      .replace(/[^a-zA-Z0-9\s,'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 40)
      .forEach((w) => phrases.add(w.toLowerCase()));
  }

  return [...phrases];
}

/**
 * How much the profile actually gives the writer to work with. Drives the word
 * ceiling: a two-fact profile gets two honest sentences, not a paragraph of
 * padding.
 * @returns {'thin'|'moderate'|'rich'}
 */
function deriveRichness(context = {}) {
  // buildBioContext already stamps this; hand-built contexts get it derived.
  return context.richness || resolveRichness(context.signals || []);
}

/**
 * @param {string} bio
 * @param {Object} context
 * @param {{ existingBio?: string, mode?: string, length?: 'tight'|'standard', person?: 'third'|'first' }} options
 * @returns {{ valid: boolean, rubric: object, fabrications: Array, ungrounded: string[], droppedUserFacts: string[], richness: string, coveredSignals: string[] }}
 */
function validateBioOutput(bio, context, options = {}) {
  const existingBio = options.existingBio || "";
  const allowedPhrases = collectAllowedPhrases(context, existingBio);
  const richness = deriveRichness(context);
  const bounds = resolveBounds(options.length, richness);

  const rubric = scoreBio(bio, {
    allowedPhrases,
    length: options.length,
    person: options.person,
    bounds,
  });

  // 1. Truthfulness. One invented name is one too many.
  const fabrications = findFabrications(bio, { context, existingBio });
  if (fabrications.length) {
    rubric.issues.push("fabricated_facts");
    rubric.score = Math.max(0, rubric.score - 40);
  }

  // 2. Padding. Length has to be earned by context.
  if (richness === "thin" && rubric.wordCount > bounds.softMax) {
    rubric.issues.push("padded");
    rubric.score = Math.max(0, rubric.score - 25);
  }

  // 3. The bio has to actually use the profile.
  const coveredSignals = findCoveredSignals(bio, context);
  const groundableSignals = findGroundableSignals(context);
  if (groundableSignals.length && coveredSignals.length === 0) {
    rubric.issues.push("no_grounded_signal");
    rubric.score = Math.max(0, rubric.score - 30);
  }

  // 4. Refine tightens prose; it never loses the talent's own facts.
  const droppedUserFacts =
    options.mode === "refine"
      ? findDroppedUserFacts(bio, existingBio, context)
      : [];
  if (droppedUserFacts.length) {
    rubric.issues.push("dropped_user_fact");
    rubric.score = Math.max(0, rubric.score - 30);
  }

  rubric.pass = passesBioQuality(rubric.score, rubric.issues);

  return {
    valid: rubric.pass,
    rubric,
    fabrications,
    // Legacy shape: array of the offending phrases.
    ungrounded: fabrications.map((f) => f.phrase),
    droppedUserFacts,
    coveredSignals,
    richness,
    bounds,
  };
}

module.exports = {
  validateBioOutput,
  collectAllowedPhrases,
  deriveRichness,
};
