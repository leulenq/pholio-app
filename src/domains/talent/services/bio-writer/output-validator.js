"use strict";

const { scoreBio } = require("./quality-rubric");

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
 * Heuristic: flag capitalized multi-word phrases in output not grounded in allowed text.
 */
function findUngroundedPhrases(bio, allowedPhrases) {
  const allowedBlob = allowedPhrases.join(" ");
  const matches = bio.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
  const ungrounded = [];

  for (const phrase of matches) {
    const key = phrase.toLowerCase();
    if (key.length < 6) continue;
    if (allowedBlob.includes(key)) continue;
    if (/^(New York|Los Angeles|San Francisco|United States)/i.test(phrase)) {
      if (allowedBlob.includes(key.split(" ")[0])) continue;
    }
    ungrounded.push(phrase);
  }

  return ungrounded.slice(0, 3);
}

/**
 * @param {string} bio
 * @param {Object} context
 * @param {{ existingBio?: string, mode?: string, length?: 'tight'|'standard', person?: 'third'|'first' }} options
 * @returns {{ valid: boolean, rubric: object, ungrounded: string[] }}
 */
function validateBioOutput(bio, context, options = {}) {
  const allowedPhrases = collectAllowedPhrases(
    context,
    options.existingBio || "",
  );
  const rubric = scoreBio(bio, {
    allowedPhrases,
    length: options.length,
    person: options.person,
  });

  const ungrounded = findUngroundedPhrases(bio, allowedPhrases);
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
  validateBioOutput,
  collectAllowedPhrases,
};
