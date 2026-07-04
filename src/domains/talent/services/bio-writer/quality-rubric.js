"use strict";

const FILLER_PATTERN =
  /\b(passionate|driven|dynamic|hardworking|results-oriented|dedicated|versatile talent|unique individual|go-getter|self-starter)\b/i;

const FIRST_PERSON_PATTERN = /\b(I|I'm|I've|my|me|mine)\b/;

const MEASUREMENT_PATTERN =
  /\b(\d{2,3}\s*cm|bust|waist|hips|inseam|shoe size|dress size)\b/i;

const LIST_PATTERN = /(^|\n)\s*[-•*]\s+|;\s+[^.]{20,};\s+/;

/**
 * Word-count bounds per length mode. `tight` targets ~25-45 words,
 * `standard` preserves the original ~35-80 word window.
 */
const LENGTH_BOUNDS = {
  tight: { hardMin: 14, softMin: 22, softMax: 50, hardMax: 60 },
  standard: { hardMin: 18, softMin: 28, softMax: 85, hardMax: 95 },
};

/**
 * Lightweight editorial rubric for generated bios.
 * @param {string} bio
 * @param {{ allowedPhrases?: string[], length?: 'tight'|'standard', person?: 'third'|'first' }} [options]
 * @returns {{ score: number, issues: string[], pass: boolean }}
 */
function scoreBio(bio, options = {}) {
  const length = options.length === "tight" ? "tight" : "standard";
  const person = options.person === "first" ? "first" : "third";
  const bounds = LENGTH_BOUNDS[length];

  const text = (bio || "").trim();
  const issues = [];
  let score = 100;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (!text) {
    return { score: 0, issues: ["empty"], pass: false, wordCount: 0 };
  }

  if (wordCount < bounds.hardMin) {
    issues.push("too_short");
    score -= 35;
  } else if (wordCount < bounds.softMin) {
    issues.push("short");
    score -= 10;
  }

  if (wordCount > bounds.hardMax) {
    issues.push("too_long");
    score -= 30;
  } else if (wordCount > bounds.softMax) {
    issues.push("long");
    score -= 12;
  }

  // First person is a defect only when third-person voice is requested.
  if (person !== "first" && FIRST_PERSON_PATTERN.test(text)) {
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
