"use strict";

const FILLER_PATTERN =
  /\b(passionate|driven|dynamic|hardworking|results-oriented|dedicated|versatile talent|unique individual|go-getter|self-starter)\b/i;

const FIRST_PERSON_PATTERN = /\b(I|I'm|I've|my|me|mine)\b/;

const MEASUREMENT_PATTERN =
  /\b(\d{2,3}\s*cm|bust|waist|hips|inseam|shoe size|dress size)\b/i;

const LIST_PATTERN = /(^|\n)\s*[-•*]\s+|;\s+[^.]{20,};\s+/;

/**
 * Lightweight editorial rubric for generated bios.
 * @returns {{ score: number, issues: string[], pass: boolean }}
 */
function scoreBio(bio, options = {}) {
  const text = (bio || "").trim();
  const issues = [];
  let score = 100;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (!text) {
    return { score: 0, issues: ["empty"], pass: false, wordCount: 0 };
  }

  if (wordCount < 18) {
    issues.push("too_short");
    score -= 35;
  } else if (wordCount < 28) {
    issues.push("short");
    score -= 10;
  }

  if (wordCount > 95) {
    issues.push("too_long");
    score -= 30;
  } else if (wordCount > 85) {
    issues.push("long");
    score -= 12;
  }

  if (FIRST_PERSON_PATTERN.test(text)) {
    issues.push("first_person");
    score -= 25;
  }

  if (FILLER_PATTERN.test(text)) {
    issues.push("generic_filler");
    score -= 20;
  }

  if (MEASUREMENT_PATTERN.test(text)) {
    issues.push("measurement_leak");
    score -= 30;
  }

  if (LIST_PATTERN.test(text)) {
    issues.push("list_like");
    score -= 18;
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 8);
  if (sentences.length > 4) {
    issues.push("too_many_sentences");
    score -= 15;
  }

  const lower = text.toLowerCase();
  const allowedLocations = (options.allowedPhrases || [])
    .map((p) => p.toLowerCase())
    .filter((p) => p.length > 3);

  for (const phrase of allowedLocations) {
    const occurrences = lower.split(phrase).length - 1;
    if (occurrences >= 2 && phrase.length > 4) {
      issues.push("repetition");
      score -= 12;
      break;
    }
  }

  const commaCount = (text.match(/,/g) || []).length;
  if (commaCount >= 6) {
    issues.push("overloaded");
    score -= 10;
  }

  if (!/[.!?]"?$/.test(text) && wordCount > 25) {
    issues.push("weak_close");
    score -= 5;
  }

  const pass =
    score >= 62 &&
    !issues.includes("empty") &&
    !issues.includes("too_short") &&
    !issues.includes("too_long") &&
    !issues.includes("measurement_leak");

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    pass,
    wordCount,
  };
}

module.exports = {
  scoreBio,
  FILLER_PATTERN,
  FIRST_PERSON_PATTERN,
  MEASUREMENT_PATTERN,
};
