"use strict";

/**
 * Quality rubric for talent submission cover notes.
 *
 * Unlike the agency-facing bio (third person), a submission note is a short
 * first-person letter to the agency. The rubric therefore REQUIRES first-person
 * voice and rejects third-person self-description.
 */

const MAX_CHARS = 1200;

const FILLER_PATTERN =
  /\b(passionate|driven|dynamic|hardworking|hard-working|results-oriented|dedicated|versatile talent|unique individual|go-getter|self-starter|team player)\b/i;

const AI_MENTION_PATTERN =
  /\b(as an ai|ai[-\s]?generated|language model|chatgpt|gpt|i am an ai|artificial intelligence)\b/i;

const FIRST_PERSON_PATTERN = /\b(I|I'm|I’m|I've|I’ve|I'd|I’d|my|me|mine|myself)\b/;

// "I am a model" / "I'm a model" style generic openers we want to avoid leading with.
const GENERIC_OPENER_PATTERN =
  /^\s*(hi|hello|hey|dear[^.]{0,40}[,.]?\s*)?\s*(i am|i'm|i’m)\s+(a|an)\s+(model|talent|aspiring model|new face)\b/i;

const MEASUREMENT_PATTERN =
  /\b(\d{2,3}\s*cm|bust|waist|hips|inseam|shoe size|dress size)\b/i;

const LIST_PATTERN = /(^|\n)\s*[-•*]\s+/;

/**
 * @param {string} note
 * @param {{ allowedPhrases?: string[] }} [options]
 * @returns {{ score: number, issues: string[], pass: boolean, wordCount: number, charCount: number }}
 */
function scoreSubmissionNote(note, options = {}) {
  const text = (note || "").trim();
  const issues = [];
  let score = 100;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = text.length;

  if (!text) {
    return { score: 0, issues: ["empty"], pass: false, wordCount: 0, charCount: 0 };
  }

  if (charCount > MAX_CHARS) {
    issues.push("too_long");
    score -= 40;
  }

  if (wordCount < 12) {
    issues.push("too_short");
    score -= 30;
  } else if (wordCount < 20) {
    issues.push("short");
    score -= 8;
  }

  if (!FIRST_PERSON_PATTERN.test(text)) {
    issues.push("third_person");
    score -= 40;
  }

  if (AI_MENTION_PATTERN.test(text)) {
    issues.push("ai_mention");
    score -= 40;
  }

  if (FILLER_PATTERN.test(text)) {
    issues.push("generic_filler");
    score -= 25;
  }

  if (GENERIC_OPENER_PATTERN.test(text)) {
    issues.push("generic_opener");
    score -= 15;
  }

  if (MEASUREMENT_PATTERN.test(text)) {
    issues.push("measurement_leak");
    score -= 25;
  }

  if (LIST_PATTERN.test(text)) {
    issues.push("list_like");
    score -= 18;
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 8);
  if (sentences.length > 6) {
    issues.push("too_many_sentences");
    score -= 12;
  }

  const lower = text.toLowerCase();
  const allowed = (options.allowedPhrases || [])
    .map((p) => p.toLowerCase())
    .filter((p) => p.length > 4);
  for (const phrase of allowed) {
    const occurrences = lower.split(phrase).length - 1;
    if (occurrences >= 3) {
      issues.push("repetition");
      score -= 10;
      break;
    }
  }

  const pass =
    score >= 62 &&
    !issues.includes("empty") &&
    !issues.includes("too_short") &&
    !issues.includes("too_long") &&
    !issues.includes("third_person") &&
    !issues.includes("ai_mention") &&
    !issues.includes("generic_filler") &&
    !issues.includes("measurement_leak");

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    pass,
    wordCount,
    charCount,
  };
}

module.exports = {
  scoreSubmissionNote,
  MAX_CHARS,
  FILLER_PATTERN,
  AI_MENTION_PATTERN,
  FIRST_PERSON_PATTERN,
  GENERIC_OPENER_PATTERN,
  MEASUREMENT_PATTERN,
};
