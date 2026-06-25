"use strict";

const INSTITUTION_HINT = /\b(university|college|school|academy|studio|conservatory|institute|workshop)\b/i;
const MODE_LIST = new Set(["format", "expand"]);

function countWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

function toLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);
}

function sentenceCount(text) {
  return String(text || "")
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function hasScannableLineShape(line) {
  if (!line.includes("·")) return false;
  const parts = line
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return false;
  return parts.every((part) => part.length >= 2);
}

function collectAllowedPhrases(context = {}, inputText = "", mode = "format") {
  const phrases = new Set(context.allowedPhrases || []);
  if (mode !== "expand" && inputText) {
    const raw = String(inputText).toLowerCase();
    phrases.add(raw);
    raw
      .split(/[\n,;|·/()-]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .forEach((part) => phrases.add(part));
  }
  return [...phrases];
}

function findUngroundedInstitutions(summary, allowedPhrases = []) {
  const matches =
    String(summary || "").match(/\b([A-Z][A-Za-z&'/-]+(?:\s+[A-Z][A-Za-z&'/-]+){0,4})\b/g) || [];
  const allowedBlob = allowedPhrases.join(" ");
  const blocked = [];

  for (const phrase of matches) {
    const normalized = phrase.toLowerCase().trim();
    if (normalized.length < 6) continue;
    if (!INSTITUTION_HINT.test(phrase)) continue;
    if (allowedBlob.includes(normalized)) continue;
    blocked.push(phrase);
  }

  return [...new Set(blocked)].slice(0, 4);
}

function validateTrainingSummaryOutput(summary, context = {}, options = {}) {
  const mode = options.mode || "format";
  const issues = [];
  const clean = String(summary || "").trim();
  const words = countWords(clean);
  const lines = toLines(clean);

  if (!clean) {
    return {
      valid: false,
      issues: ["empty"],
      wordCount: 0,
      lines: [],
      ungroundedInstitutions: [],
    };
  }

  if (mode === "summarize") {
    const sentences = sentenceCount(clean);
    if (sentences < 2 || sentences > 3) issues.push("sentence_count");
    if (clean.includes("\n")) issues.push("single_paragraph_required");
    if (words < 14 || words > 95) issues.push("word_count");
  } else if (MODE_LIST.has(mode)) {
    if (!lines.length) issues.push("missing_lines");
    if (lines.some((line) => line.length > 110)) issues.push("line_too_long");
    const structured = lines.filter(hasScannableLineShape);
    if (!structured.length) issues.push("missing_scannable_structure");
  }

  const allowedPhrases = collectAllowedPhrases(
    context,
    options.inputText || "",
    mode,
  );
  const ungroundedInstitutions =
    mode === "expand" ? findUngroundedInstitutions(clean, allowedPhrases) : [];
  if (ungroundedInstitutions.length > 0) {
    issues.push("ungrounded_institution");
  }

  return {
    valid: issues.length === 0,
    issues,
    wordCount: words,
    lines,
    ungroundedInstitutions,
  };
}

module.exports = {
  validateTrainingSummaryOutput,
  countWords,
  toLines,
  sentenceCount,
  hasScannableLineShape,
  findUngroundedInstitutions,
};
