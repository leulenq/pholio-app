"use strict";

/**
 * Editorial rubric for generated bios.
 *
 * Two jobs:
 *   1. Shape — length, voice, sentence count, no measurement or list leakage.
 *   2. Register — reject the AI-slop vocabulary and the hobbyist vocabulary.
 *      The house voice is concrete and declarative: nouns and facts, not
 *      adjectives. A bio that reads like a press release is a defect, not a
 *      stylistic preference, so the offending terms are hard failures rather
 *      than score deductions the model can out-earn elsewhere.
 *
 * Fact grounding lives in ./grounding.js and is applied by ./output-validator.js
 * — this module never sees the profile, only the text.
 */

const MIN_PASS_SCORE = 70;

/**
 * Banned single words: the adjective register that makes a bio sound generated.
 * Kept as a word list (not a hand-written regex) so the retry nudge can tell
 * the model exactly which words to drop.
 */
const SLOP_WORDS = [
  // Explicitly banned by the house voice.
  "passionate",
  "passion",
  "dynamic",
  "versatile",
  "captivating",
  "captivates",
  "captivate",
  "stunning",
  "seamlessly",
  "seamless",
  // Same register, same problem.
  "driven",
  "hardworking",
  "hard-working",
  "dedicated",
  "enthusiastic",
  "charismatic",
  "striking",
  "radiant",
  "alluring",
  "mesmerizing",
  "breathtaking",
  "effortless",
  "effortlessly",
  "flawless",
  "undeniable",
  "unforgettable",
  "unique",
  "showcases",
  "showcasing",
  "boasts",
  "exudes",
  "embodies",
  "epitomizes",
  "elevates",
  "transcends",
  "unparalleled",
  "unmatched",
  "prestigious",
  "renowned",
  "acclaimed",
  "iconic",
  "legendary",
  "glamorous",
  "multifaceted",
  "well-rounded",
  "ambitious",
  "poised",
];

/**
 * Banned phrases: filler cadences and self-referential throat-clearing.
 */
const SLOP_PHRASES = [
  { label: "unique blend", pattern: /\bunique blend\b/i },
  { label: "a passion for", pattern: /\b(?:with|has|have|share[sd]?)\s+(?:a|an)\s+(?:passion|love|flair|knack|deep appreciation)\s+for\b/i },
  { label: "an eye for", pattern: /\b(?:a|an|keen)\s+eye\s+for\b/i },
  { label: "brings ... to every", pattern: /\bbring(?:s|ing)?\b[^.]{0,40}\bto every\b/i },
  { label: "no stranger to", pattern: /\bno stranger to\b/i },
  { label: "in the world of", pattern: /\bin the world of\b|\bfashion world\b|\bworld of fashion\b/i },
  { label: "whether ... or ...", pattern: /\bwhether\b[^.]{0,60}\bor\b/i },
  { label: "not only ... but also", pattern: /\bnot only\b[^.]{0,60}\bbut also\b/i },
  { label: "wide range of", pattern: /\b(?:wide|broad|diverse)\s+range of\b/i },
  { label: "sought-after", pattern: /\bsought[-\s]after\b/i },
  { label: "rising star", pattern: /\brising star\b|\bnext big thing\b|\bstar quality\b|\bit factor\b/i },
  { label: "turns heads", pattern: /\bturn(?:s|ing)? heads\b|\bhead[-\s]turning\b/i },
  { label: "lasting impression", pattern: /\blasting impression\b|\bforce to be reckoned with\b/i },
  { label: "one of a kind", pattern: /\bone[-\s]of[-\s]a[-\s]kind\b|\bsecond to none\b|\btestament to\b/i },
  { label: "self-starter", pattern: /\bself[-\s]starter\b|\bgo[-\s]getter\b|\bteam player\b|\bresults[-\s]oriented\b/i },
  { label: "next level", pattern: /\b(?:to the )?next level\b|\bhon(?:e|ed|ing) (?:her|his|their|my) craft\b/i },
  { label: "more than just", pattern: /\bmore than just a (?:model|face|pretty face)\b/i },
];

/**
 * Hobbyist register: the phrasing that tells an agent this profile was not
 * written by anyone who works in the industry.
 */
const HOBBYIST_PHRASES = [
  { label: "aspiring model", pattern: /\baspiring\s+(?:model|actor|actress|talent|performer)\b/i },
  { label: "loves fashion", pattern: /\blov(?:e|es|ing)\s+(?:for\s+)?(?:fashion|modeling|modelling|the camera)\b|\blove for fashion\b/i },
  { label: "dreams of", pattern: /\bdream(?:s|ed|t)?\s+of\b|\bdream job\b|\bdream agency\b/i },
  { label: "at a young age", pattern: /\bat a (?:young|early) age\b|\bever since (?:she|he|they|i)\b|\bsince childhood\b/i },
  { label: "always been", pattern: /\balways been (?:fascinated|drawn|passionate|interested)\b/i },
  { label: "hoping to break in", pattern: /\bhop(?:e|es|ing) to (?:break into|get signed|be signed|make it)\b|\bbreak into the industry\b/i },
  { label: "amateur/hobby", pattern: /\bamateur\b|\bas a hobby\b|\bjust starting out\b|\bnew to the industry\b|\bwannabe\b/i },
];

// Legacy export — kept so any external consumer keeps working. The live check
// is findBannedLanguage(), which covers this list and more.
const FILLER_PATTERN =
  /\b(passionate|driven|dynamic|hardworking|results-oriented|dedicated|versatile talent|unique individual|go-getter|self-starter)\b/i;

const FIRST_PERSON_PATTERN = /\b(I|I'm|I’m|I've|I’ve|my|me|mine)\b/;

const MEASUREMENT_PATTERN =
  /\b(\d{2,3}\s*cm|bust|waist|hips|inseam|shoe size|dress size)\b/i;

const LIST_PATTERN = /(^|\n)\s*[-•*]\s+|;\s+[^.]{20,};\s+/;

const AI_MENTION_PATTERN =
  /\b(as an ai|ai[-\s]?generated|language model|i am an ai)\b/i;

/**
 * "Poised, polished, and camera-ready, Jane Doe is…" — the stacked-descriptor
 * opener. Deliberately anchored to a leading absolute phrase so that a genuine
 * three-lane list ("editorial, commercial, and runway model") is untouched.
 */
const TRICOLON_OPENER_PATTERN =
  /^\s*["']?[A-Z][\w’'-]+(?:\s+[\w’'-]+)?,\s+[\w’'-]+(?:\s+[\w’'-]+)?,\s+and\s+[\w’'-]+(?:\s+[\w’'-]+)?\s*[,.]/;

const DASH_PATTERN = /[—–]/g;

const SLOP_WORD_SET = new Set(SLOP_WORDS.map((w) => w.toLowerCase()));

/**
 * Individual tokens of every banned term. Used by ./grounding.js so that a
 * refine which strips "Passionate" from a talent-written bio is not mistaken
 * for a refine that dropped one of the talent's facts.
 */
const SLOP_TOKENS = new Set();
for (const word of SLOP_WORDS) {
  word.split(/[^a-z0-9]+/i).forEach((t) => t && SLOP_TOKENS.add(t.toLowerCase()));
}
for (const { label } of [...SLOP_PHRASES, ...HOBBYIST_PHRASES]) {
  label.split(/[^a-z0-9]+/i).forEach((t) => t && SLOP_TOKENS.add(t.toLowerCase()));
}

const SLOP_WORD_PATTERN = new RegExp(
  `\\b(${SLOP_WORDS.map((w) => w.replace(/[-]/g, "[-\\s]")).join("|")})\\b`,
  "gi",
);

/**
 * Word-count bounds per length mode. `tight` targets ~25-45 words,
 * `standard` preserves the original ~35-80 word window.
 */
const LENGTH_BOUNDS = {
  tight: { hardMin: 14, softMin: 22, softMax: 50, hardMax: 60 },
  standard: { hardMin: 18, softMin: 28, softMax: 85, hardMax: 95 },
};

/**
 * A bio can only be as long as the profile is full. These caps are applied on
 * top of the length mode so a two-fact profile cannot be inflated into a
 * paragraph of atmosphere.
 */
const RICHNESS_CAPS = {
  thin: { hardMin: 10, softMin: 14, softMax: 38, hardMax: 46 },
  moderate: { softMax: 62, hardMax: 72 },
  rich: {},
};

function resolveBounds(length, richness) {
  const base = LENGTH_BOUNDS[length === "tight" ? "tight" : "standard"];
  const cap = RICHNESS_CAPS[richness] || {};
  const floor = (key) =>
    cap[key] === undefined ? base[key] : Math.min(base[key], cap[key]);

  return {
    hardMin: floor("hardMin"),
    softMin: floor("softMin"),
    softMax: floor("softMax"),
    hardMax: floor("hardMax"),
  };
}

/**
 * Issues that no score can buy back. Everything here is either a factual
 * problem or a register problem, and both are worse than shipping nothing.
 */
const HARD_FAILURE_ISSUES = new Set([
  "empty",
  "too_short",
  "too_long",
  "measurement_leak",
  "first_person",
  "generic_filler",
  "ai_slop",
  "hobbyist_register",
  "tricolon_opener",
  "em_dash_chain",
  "list_like",
  "ai_mention",
  // Raised by ./output-validator.js
  "fabricated_facts",
  "ungrounded_facts",
  "padded",
  "dropped_user_fact",
  "no_grounded_signal",
]);

function passesBioQuality(score, issues = []) {
  return score >= MIN_PASS_SCORE && !issues.some((i) => HARD_FAILURE_ISSUES.has(i));
}

/**
 * Every banned word/phrase present in the text, as human-readable terms.
 * @returns {{ words: string[], phrases: string[], hobbyist: string[] }}
 */
function findBannedLanguage(text) {
  const source = String(text || "");
  const words = [
    ...new Set((source.match(SLOP_WORD_PATTERN) || []).map((w) => w.toLowerCase())),
  ];
  const phrases = SLOP_PHRASES.filter(({ pattern }) => pattern.test(source)).map(
    ({ label }) => label,
  );
  const hobbyist = HOBBYIST_PHRASES.filter(({ pattern }) =>
    pattern.test(source),
  ).map(({ label }) => label);

  return { words, phrases, hobbyist };
}

/**
 * @param {string} bio
 * @param {{ allowedPhrases?: string[], length?: 'tight'|'standard', person?: 'third'|'first', bounds?: object }} [options]
 * @returns {{ score: number, issues: string[], pass: boolean, wordCount: number, banned: object }}
 */
function scoreBio(bio, options = {}) {
  const length = options.length === "tight" ? "tight" : "standard";
  const person = options.person === "first" ? "first" : "third";
  const bounds = options.bounds || LENGTH_BOUNDS[length];

  const text = (bio || "").trim();
  const issues = [];
  let score = 100;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (!text) {
    return {
      score: 0,
      issues: ["empty"],
      pass: false,
      wordCount: 0,
      banned: { words: [], phrases: [], hobbyist: [] },
    };
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

  const banned = findBannedLanguage(text);

  if (banned.words.length) {
    issues.push("generic_filler");
    score -= 25;
  }

  if (banned.phrases.length) {
    issues.push("ai_slop");
    score -= 25;
  }

  if (banned.hobbyist.length) {
    issues.push("hobbyist_register");
    score -= 30;
  }

  if (TRICOLON_OPENER_PATTERN.test(text)) {
    issues.push("tricolon_opener");
    score -= 20;
  }

  if ((text.match(DASH_PATTERN) || []).length >= 2) {
    issues.push("em_dash_chain");
    score -= 15;
  }

  if (AI_MENTION_PATTERN.test(text)) {
    issues.push("ai_mention");
    score -= 40;
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

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score: finalScore,
    issues,
    pass: passesBioQuality(finalScore, issues),
    wordCount,
    banned,
  };
}

module.exports = {
  scoreBio,
  findBannedLanguage,
  passesBioQuality,
  resolveBounds,
  MIN_PASS_SCORE,
  HARD_FAILURE_ISSUES,
  LENGTH_BOUNDS,
  RICHNESS_CAPS,
  SLOP_WORDS,
  SLOP_WORD_SET,
  SLOP_TOKENS,
  SLOP_PHRASES,
  HOBBYIST_PHRASES,
  FILLER_PATTERN,
  FIRST_PERSON_PATTERN,
  MEASUREMENT_PATTERN,
  TRICOLON_OPENER_PATTERN,
};
