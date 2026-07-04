"use strict";

const {
  scoreSubmissionNote,
  passesSubmissionNoteQuality,
} = require("./quality-rubric");
const { collectAllowedPhrases } = require("../bio-writer/output-validator");

const SIGNAL_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "model",
  "modeling",
  "talent",
  "agency",
  "representation",
  "open",
  "seeking",
  "experience",
  "experienced",
  "new",
  "face",
]);

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
  if (context.agencyDescription) {
    phrases.push(context.agencyDescription.toLowerCase());
  }
  for (const board of context.agencyOpenBoards || []) {
    phrases.push(String(board).toLowerCase());
  }

  return [...new Set(phrases)];
}

function meaningfulTokens(value) {
  const tokens = String(value || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  return (tokens || []).filter(
    (token) => token.length >= 3 && !SIGNAL_STOPWORDS.has(token),
  );
}

/**
 * Profile grounding is intentionally lexical and conservative. It does not try
 * to prove every claim; it verifies that the short note actually uses at least
 * one concrete signal selected from this talent's profile.
 */
function findCoveredProfileSignals(note, context = {}) {
  const noteTokens = new Set(meaningfulTokens(note));
  return (context.signals || [])
    .filter((signal) =>
      meaningfulTokens(signal.fact).some((token) => noteTokens.has(token)),
    )
    .map((signal) => signal.key);
}

function findCoveredTargetBoards(note, context = {}) {
  const text = String(note || "");
  return (context.targetBoards || []).filter((board) => {
    const escaped = String(board)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    return escaped && new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

function includesVerifiedIdentity(note, context = {}) {
  const name = String(context.name || "").trim();
  if (!name || name === "Talent") return true;
  return String(note || "").toLowerCase().includes(name.toLowerCase());
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
  if (ungrounded.length > 0) {
    rubric.issues.push("ungrounded_facts");
    rubric.score = Math.max(0, rubric.score - 20);
  }

  if (!includesVerifiedIdentity(note, context)) {
    rubric.issues.push("missing_identity");
    rubric.score = Math.max(0, rubric.score - 20);
  }

  const coveredProfileSignals = findCoveredProfileSignals(note, context);
  if (context.signals?.length && coveredProfileSignals.length === 0) {
    rubric.issues.push("missing_profile_signal");
    rubric.score = Math.max(0, rubric.score - 25);
  }
  if (coveredProfileSignals.length > 4) {
    rubric.issues.push("overstuffed_profile");
    rubric.score = Math.max(0, rubric.score - 18);
  }

  const coveredTargetBoards = findCoveredTargetBoards(note, context);
  if (context.targetBoards?.length && coveredTargetBoards.length === 0) {
    rubric.issues.push("missing_target_board");
    rubric.score = Math.max(0, rubric.score - 20);
  }

  rubric.pass = passesSubmissionNoteQuality(rubric.score, rubric.issues);

  return {
    valid: rubric.pass,
    rubric,
    ungrounded,
    coveredProfileSignals,
    coveredTargetBoards,
  };
}

module.exports = {
  validateNoteOutput,
  collectNoteAllowedPhrases,
  findUngroundedPhrases,
  findCoveredProfileSignals,
  findCoveredTargetBoards,
  includesVerifiedIdentity,
};
