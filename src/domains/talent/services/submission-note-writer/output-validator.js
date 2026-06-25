"use strict";

const { scoreSubmissionNote } = require("./quality-rubric");
const { collectAllowedPhrases } = require("../bio-writer/output-validator");

/**
 * Build the allow-list of grounded phrases: profile signals, the talent name,
 * any existing note text, and the target agency name (allowed as addressee).
 */
function collectNoteAllowedPhrases(context = {}, existingNote = "") {
  const phrases = collectAllowedPhrases(context, existingNote);

  if (context.agencyName) {
    phrases.push(context.agencyName.toLowerCase());
    context.agencyName
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .forEach((p) => phrases.push(p.toLowerCase()));
  }
  if (context.agencyLocation) {
    phrases.push(context.agencyLocation.toLowerCase());
  }

  return [...new Set(phrases)];
}

/**
 * Flag capitalized multi-word phrases not grounded in the allow-list. These are
 * likely invented credits/agencies/clients.
 */
function findUngroundedPhrases(note, allowedPhrases) {
  const allowedBlob = allowedPhrases.join(" ");
  const matches = note.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
  const ungrounded = [];

  for (const phrase of matches) {
    const key = phrase.toLowerCase();
    if (key.length < 6) continue;
    if (allowedBlob.includes(key)) continue;
    // Common sentence-leading politeness phrases are not facts.
    if (/^(Thank You|Best Regards|Kind Regards|Looking Forward)/i.test(phrase)) {
      continue;
    }
    ungrounded.push(phrase);
  }

  return ungrounded.slice(0, 3);
}

/**
 * @param {string} note
 * @param {Object} context
 * @param {{ existingNote?: string, mode?: string }} [options]
 * @returns {{ valid: boolean, rubric: object, ungrounded: string[] }}
 */
function validateNoteOutput(note, context, options = {}) {
  const allowedPhrases = collectNoteAllowedPhrases(
    context,
    options.existingNote || context.note || "",
  );
  const rubric = scoreSubmissionNote(note, { allowedPhrases });

  const ungrounded = findUngroundedPhrases(note, allowedPhrases);
  if (ungrounded.length >= 2) {
    rubric.issues.push("ungrounded_facts");
    rubric.score -= 15;
    rubric.pass = rubric.pass && rubric.score >= 62;
  }

  const valid = rubric.pass && rubric.issues.length <= 2;

  return {
    valid,
    rubric,
    ungrounded,
  };
}

module.exports = {
  validateNoteOutput,
  collectNoteAllowedPhrases,
  findUngroundedPhrases,
};
