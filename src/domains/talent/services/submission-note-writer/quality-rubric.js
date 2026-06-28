"use strict";

/**
 * Quality rubric for talent submission cover notes.
 *
 * Unlike the agency-facing bio (third person), a submission note is a short
 * first-person letter to the agency. The rubric therefore REQUIRES first-person
 * voice and rejects third-person self-description.
 */

const MAX_CHARS = 1200;
const TARGET_MIN_WORDS = 45;
const TARGET_MAX_WORDS = 90;
const HARD_MIN_WORDS = 18;
const HARD_MAX_WORDS = 110;
const MIN_PASS_SCORE = 75;

const FILLER_PATTERN =
  /\b(passionate|driven|dynamic|hardworking|hard-working|results-oriented|dedicated|versatile talent|unique individual|go-getter|self-starter|team player|always dreamed|lifelong dream)\b/i;

const AI_MENTION_PATTERN =
  /\b(as an ai|ai[-\s]?generated|language model|chatgpt|gpt|i am an ai|artificial intelligence)\b/i;

const FIRST_PERSON_PATTERN = /\b(I|I'm|I’m|I've|I’ve|I'd|I’d|my|me|mine|myself)\b/;

// "I am a model" / "I'm a model" style generic openers we want to avoid leading with.
const GENERIC_OPENER_PATTERN =
  /^\s*(hi|hello|hey|dear[^.]{0,40}[,.]?\s*)?\s*(i am|i'm|i’m)\s+(a|an)\s+(model|talent|aspiring model|new face)\b/i;

const SALUTATION_PATTERN =
  /^\s*(dear|hello|hi|hey|to whom it may concern)\b[^.!?\n]{0,100}[,:](?:\s+|\n+)/i;

const SIGNATURE_BLOCK_PATTERN =
  /\n\s*(best(?: regards)?|kind regards|regards|sincerely|warmly|thank you),?\s*(?:\n+\s*[^\n]{1,80})?\s*$/i;

const INTENT_PATTERN =
  /\b(representation|represent(?:ed|ation)?|consider(?:ed|ation)|submi(?:t|ts|tted|tting|ssion)|apply(?:ing|ication)|roster|board|division|seeking\s+(?:an?\s+)?agent|seeking\s+management)\b/i;

const COURTESY_PATTERN =
  /\b(thank you|thanks for|appreciate|grateful|glad to be considered|welcome the chance|welcome the opportunity|would be pleased|would value your consideration)\b/i;

const GENERIC_CLAIM_PATTERN =
  /\b(perfect fit|unique look|striking beauty|natural star|prestigious agency|best (?:agency|in the industry)|opportunity of a lifetime|confident in my (?:abilities|skills)|excited about (?:the|this) opportunity|ready to take my career to (?:the )?next (?:level|step)|next step in my career|look forward to (?:you|your) (?:considering|reviewing)|make (?:your|the) agency money|contribut(?:e|ing) to (?:your|the organization'?s) (?:continued )?success|hope (?:this|my email) finds you well)\b/i;

const DESPERATION_PATTERN =
  /\b(please (?:just )?give me a chance|begging|desperate|need this opportunity|anything it takes|won't let you down)\b/i;

const AGENCY_DISTANCE_PATTERN =
  /\b(they|their)\b[^.!?\n]{0,30}\b(agency|board|roster|division|team)\b/i;

const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const MEASUREMENT_PATTERN =
  /\b(\d{2,3}\s*cm|bust|waist|hips|inseam|shoe size|dress size)\b/i;

const LIST_PATTERN = /(^|\n)\s*[-•*]\s+/;

const HARD_FAILURE_ISSUES = new Set([
  "empty",
  "too_short",
  "too_long",
  "too_verbose",
  "third_person",
  "ai_mention",
  "generic_filler",
  "generic_claim",
  "agency_distance",
  "desperation",
  "measurement_leak",
  "list_like",
  "letter_wrapper",
  "missing_intent",
  "emoji",
  "ungrounded_facts",
  "missing_identity",
  "missing_profile_signal",
  "missing_target_board",
  "overstuffed_profile",
]);

function passesSubmissionNoteQuality(score, issues) {
  return (
    score >= MIN_PASS_SCORE &&
    !issues.some((issue) => HARD_FAILURE_ISSUES.has(issue))
  );
}

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

  if (wordCount < HARD_MIN_WORDS) {
    issues.push("too_short");
    score -= 35;
  } else if (wordCount < TARGET_MIN_WORDS) {
    issues.push("under_target_length");
    score -= wordCount < 30 ? 14 : 7;
  }

  if (wordCount > HARD_MAX_WORDS) {
    issues.push("too_verbose");
    score -= 30;
  } else if (wordCount > TARGET_MAX_WORDS) {
    issues.push("over_target_length");
    score -= 10;
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

  if (GENERIC_CLAIM_PATTERN.test(text)) {
    issues.push("generic_claim");
    score -= 25;
  }

  if (DESPERATION_PATTERN.test(text)) {
    issues.push("desperation");
    score -= 30;
  }

  if (AGENCY_DISTANCE_PATTERN.test(text)) {
    issues.push("agency_distance");
    score -= 18;
  }

  if (GENERIC_OPENER_PATTERN.test(text)) {
    issues.push("generic_opener");
    score -= 12;
  }

  if (
    SALUTATION_PATTERN.test(text) ||
    SIGNATURE_BLOCK_PATTERN.test(text)
  ) {
    issues.push("letter_wrapper");
    score -= 20;
  }

  if (!INTENT_PATTERN.test(text)) {
    issues.push("missing_intent");
    score -= 22;
  }

  if (!COURTESY_PATTERN.test(text)) {
    issues.push("missing_courtesy");
    score -= 10;
  }

  if (MEASUREMENT_PATTERN.test(text)) {
    issues.push("measurement_leak");
    score -= 25;
  }

  if (LIST_PATTERN.test(text)) {
    issues.push("list_like");
    score -= 18;
  }

  if (EMOJI_PATTERN.test(text)) {
    issues.push("emoji");
    score -= 25;
  }

  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 0) {
    issues.push("exclamation");
    score -= exclamationCount > 1 ? 12 : 5;
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 8);
  if (sentences.length < 2) {
    issues.push("too_few_sentences");
    score -= 12;
  } else if (sentences.length > 5) {
    issues.push("too_many_sentences");
    score -= sentences.length > 7 ? 22 : 12;
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

  const boundedScore = Math.max(0, Math.min(100, score));
  const pass = passesSubmissionNoteQuality(boundedScore, issues);

  return {
    score: boundedScore,
    issues,
    pass,
    wordCount,
    charCount,
  };
}

module.exports = {
  scoreSubmissionNote,
  passesSubmissionNoteQuality,
  MAX_CHARS,
  TARGET_MIN_WORDS,
  TARGET_MAX_WORDS,
  HARD_MAX_WORDS,
  MIN_PASS_SCORE,
  HARD_FAILURE_ISSUES,
  FILLER_PATTERN,
  AI_MENTION_PATTERN,
  FIRST_PERSON_PATTERN,
  GENERIC_OPENER_PATTERN,
  SALUTATION_PATTERN,
  SIGNATURE_BLOCK_PATTERN,
  INTENT_PATTERN,
  COURTESY_PATTERN,
  GENERIC_CLAIM_PATTERN,
  DESPERATION_PATTERN,
  AGENCY_DISTANCE_PATTERN,
  EMOJI_PATTERN,
  MEASUREMENT_PATTERN,
};
