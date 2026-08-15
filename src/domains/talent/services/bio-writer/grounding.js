"use strict";

/**
 * Fact grounding for the bio writer.
 *
 * A bio that invents a Vogue credit is worse than no bio at all, so this module
 * is deliberately the single source of truth for "what may this bio name?".
 * The prompt builder renders the same allow-list into the prompt and the output
 * validator enforces it, which means the model is never punished for a rule it
 * was not given, and never given a rule that is not enforced.
 *
 * The check is lexical and conservative, in two layers:
 *
 *   1. Capitalized runs in the output ("Ford Models", "Maison Verre") must be
 *      built from tokens that appear in the verified context, the talent's
 *      name, or — on refine — the bio the talent wrote themselves.
 *   2. A lexicon of the names a model is most likely to hallucinate (major
 *      agencies, publications, brands, markets, fashion weeks) is matched
 *      regardless of casing, so "based in milan" is caught too.
 *
 * Sentence-initial single words are skipped by layer 1 — "Trained", "She",
 * "Now" are capitalized by grammar, not by claim — but layer 2 still sees them.
 */

const { SLOP_TOKENS } = require("./quality-rubric");

/**
 * Capitalized words that assert nothing: grammar, industry vocabulary, and the
 * verbs bios are built from. A token in here is never treated as a claim.
 */
const NEUTRAL_TOKENS = new Set(
  [
    // Grammar and function words.
    "i", "im", "ive", "my", "me", "mine", "myself", "she", "her", "hers", "he",
    "him", "his", "they", "them", "their", "theirs", "we", "us", "our", "it",
    "its", "this", "that", "these", "those", "the", "and", "but", "for", "with",
    "without", "from", "into", "over", "across", "between", "both", "also",
    "plus", "while", "when", "where", "after", "before", "since", "now",
    "currently", "recently", "recent", "today", "are", "was", "were", "been",
    "being", "has", "have", "had", "does", "did", "will", "would", "can",
    "could", "should", "may", "might", "must", "who", "what", "there", "then",
    "here", "each", "every", "all", "any", "some", "more", "most", "other",
    "than", "out", "off", "per",
    // Verbs and states that open bio sentences.
    "based", "trained", "training", "trains", "work", "works", "working",
    "worked", "book", "books", "booked", "booking", "bookings", "shot",
    "shoots", "shooting", "walk", "walks", "walked", "sign", "signed",
    "represented", "representation", "represents", "available", "availability",
    "open", "seeking", "new", "face", "faces", "developing", "experience",
    "experienced", "appears", "appeared", "brings", "holds", "speaks",
    "fluent", "native", "moves", "splits", "travels", "raised", "born",
    "started", "began", "joins", "joined", "adds", "keeps", "takes",
    // Industry vocabulary — the language the bio is supposed to speak.
    "model", "models", "modeling", "modelling", "talent", "talents", "agency",
    "agencies", "agent", "agents", "board", "boards", "division", "divisions",
    "market", "markets", "roster", "casting", "castings", "client", "clients",
    "brand", "brands", "campaign", "campaigns", "editorial", "editorials",
    "commercial", "commercials", "runway", "catwalk", "showroom", "fitting",
    "fittings", "beauty", "lifestyle", "print", "digital", "digitals",
    "lookbook", "lookbooks", "catalog", "catalogue", "catalogs", "ecommerce",
    "fashion", "season", "seasons", "show", "shows", "shoot", "presenter",
    "host", "actor", "acting", "performance", "performer", "dance", "dancer",
    "athlete", "sports", "size", "straight", "petite", "curve", "mature",
    "kids", "men", "women", "mens", "womens", "unisex", "fit", "range",
    "content", "creator", "voice", "stage", "screen", "camera", "studio",
    "portfolio", "profile", "bio", "test", "tests", "tested", "testing",
    "tearsheet", "tearsheets", "tears", "polaroids", "comp", "card", "cards",
    "sample", "samples", "comm", "board", "week",
  ].map((t) => t.toLowerCase()),
);

/**
 * Names a model reaches for when it decides to invent a credit. Only entries
 * that cannot be confused with ordinary English are listed — "Elite", "Next",
 * "Storm" and "Premier" are agency names but also common words, so they are
 * left to the capitalization heuristic instead.
 */
const HIGH_RISK_NAMES = [
  // Agencies
  "IMG", "IMG Models", "Ford Models", "Wilhelmina", "Elite Model Management",
  "DNA Models", "DNA Model Management", "Storm Management", "The Lions",
  "Muse Management", "Models 1", "Photogenics", "Next Models",
  "Sutherland Models", "Elmer Olsen", "Marilyn Agency", "Viva Models",
  "Silent Models", "Women Management", "Premier Model Management",
  "Select Model Management", "Wilhelmina Models",
  // Publications
  "Vogue", "Elle", "Harper's Bazaar", "Cosmopolitan", "Numero", "Numéro",
  "Dazed", "W Magazine", "Marie Claire", "Allure", "Vanity Fair", "Esquire",
  "Paper Magazine", "Interview Magazine", "L'Officiel", "Grazia", "GQ",
  // Brands
  "Nike", "Adidas", "Gucci", "Prada", "Chanel", "Dior", "Versace",
  "Balenciaga", "Louis Vuitton", "Zara", "H&M", "Uniqlo", "Levi's",
  "Calvin Klein", "Tommy Hilfiger", "Ralph Lauren", "Burberry", "Fendi",
  "Hermes", "Hermès", "Saint Laurent", "Valentino", "Armani", "Balmain",
  "Givenchy", "Lululemon", "Sephora", "Aritzia", "American Eagle",
  "Abercrombie", "Victoria's Secret", "Skims", "Fenty", "Glossier",
  "Coca-Cola", "Pepsi", "Samsung", "Toyota",
  // Markets
  "New York", "Los Angeles", "Paris", "Milan", "London", "Tokyo", "Seoul",
  "Berlin", "Barcelona", "Madrid", "Amsterdam", "Copenhagen", "Stockholm",
  "Hamburg", "Munich", "Sydney", "Melbourne", "Toronto", "Vancouver",
  "Montreal", "Montréal", "Chicago", "Miami", "Atlanta", "Dallas", "Houston",
  "Seattle", "San Francisco", "Cape Town", "Johannesburg", "Shanghai",
  "Beijing", "Hong Kong", "Singapore", "Dubai", "Mumbai", "Mexico City",
  "Sao Paulo", "São Paulo", "Buenos Aires", "Manila", "Bangkok", "Jakarta",
  "Lagos", "Nairobi", "Warsaw", "Prague", "Vienna", "Zurich", "Brussels",
  "Lisbon", "Athens", "Istanbul", "Tel Aviv", "Auckland",
  // Events and platforms
  "Fashion Week", "Met Gala", "Coachella", "Instagram", "TikTok", "YouTube",
  "Netflix", "Disney", "HBO", "Hulu",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HIGH_RISK_TERMS = HIGH_RISK_NAMES.map((name) => {
  const body = escapeRegExp(name).replace(/\s+/g, "\\s+");
  const lead = /^[\w]/.test(name) ? "\\b" : "(?<![\\w])";
  const tail = /[\w]$/.test(name) ? "\\b" : "(?![\\w])";
  return { name, pattern: new RegExp(`${lead}${body}${tail}`, "i") };
});

const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const SEASON_PATTERN = /\b(?:SS|FW|AW)\s?\d{2}\b/gi;
const TENURE_PATTERN =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\+?\s+years?\b/gi;
const DECADE_PATTERN = /\b(?:over |more than |nearly |almost )?a decade\b/i;

const NUMBER_WORDS = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
};

/**
 * Capitalized runs: "Jane Doe", "Vogue Italia", "Maison de Verre", "Trained".
 * Hyphenated words stay whole ("Ravensport-based") and are split at token level.
 */
const CAPITALIZED_RUN =
  /[A-Z][A-Za-z’'&-]*(?:\s+(?:of|the|de|du|da|di|van|von|&)\s+[A-Z][A-Za-z’'&-]*|\s+[A-Z][A-Za-z’'&-]*)*/g;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
}

function isSentenceInitial(source, index) {
  const before = source.slice(0, index).replace(/\s+$/, "");
  if (!before) return true;
  return /[.!?:;"'“”()\[\]]$/.test(before);
}

/**
 * @param {string} text
 * @param {{ includeSentenceInitial?: boolean }} [options]
 * @returns {Array<{ phrase: string, sentenceInitial: boolean }>}
 */
function extractEntityPhrases(text, options = {}) {
  const source = String(text || "");
  const out = [];
  let match;

  CAPITALIZED_RUN.lastIndex = 0;
  while ((match = CAPITALIZED_RUN.exec(source)) !== null) {
    const phrase = match[0].trim();
    if (!phrase) continue;
    const sentenceInitial = isSentenceInitial(source, match.index);
    const isSingleWord = !/\s/.test(phrase);
    if (sentenceInitial && isSingleWord && !options.includeSentenceInitial) {
      continue;
    }
    out.push({ phrase, sentenceInitial });
  }

  return out;
}

/**
 * Every token the bio is allowed to reuse: the talent's name, the verified
 * context facts, and (on refine) the talent's own prose.
 */
function buildGroundedTokens(context = {}, existingBio = "") {
  const tokens = new Set();
  const add = (value) => tokenize(value).forEach((t) => tokens.add(t));

  add(context.name);
  for (const signal of context.signals || []) add(signal.fact);
  add(existingBio);

  return tokens;
}

/**
 * Named facts the model is permitted to use, in the order they appear in the
 * context. Rendered into the prompt as an explicit ledger.
 * @returns {string[]}
 */
function collectGroundedEntities(context = {}, limit = 14) {
  const seen = new Set();
  const entities = [];
  const sources = [context.name, ...(context.signals || []).map((s) => s.fact)];

  for (const source of sources) {
    const text = String(source || "");
    if (!text) continue;

    for (const { phrase } of extractEntityPhrases(text, {
      includeSentenceInitial: true,
    })) {
      const meaningful = tokenize(phrase).filter(
        (t) => t.length >= 3 && !NEUTRAL_TOKENS.has(t),
      );
      if (!meaningful.length) continue;
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push(phrase);
    }

    for (const year of text.match(YEAR_PATTERN) || []) {
      if (seen.has(year)) continue;
      seen.add(year);
      entities.push(year);
    }
  }

  return entities.slice(0, limit);
}

/**
 * Claims in the output that nothing in the context supports.
 * @param {string} bio
 * @param {{ context?: object, existingBio?: string }} [options]
 * @returns {Array<{ phrase: string, kind: 'entity'|'year'|'season'|'tenure' }>}
 */
function findFabrications(bio, options = {}) {
  const text = String(bio || "");
  const grounded = buildGroundedTokens(options.context, options.existingBio);
  const found = [];
  const seen = new Set();

  const push = (phrase, kind) => {
    const key = `${kind}:${String(phrase).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ phrase, kind });
  };

  // Layer 1 — capitalized runs that are not built from grounded tokens.
  for (const { phrase } of extractEntityPhrases(text)) {
    const unknown = tokenize(phrase).filter(
      (t) => t.length >= 3 && !NEUTRAL_TOKENS.has(t) && !grounded.has(t),
    );
    if (unknown.length) push(phrase, "entity");
  }

  // Layer 2 — high-risk names in any casing.
  for (const { name, pattern } of HIGH_RISK_TERMS) {
    if (!pattern.test(text)) continue;
    const unknown = tokenize(name).filter((t) => !grounded.has(t));
    if (unknown.length) push(name, "entity");
  }

  // Dates and tenure are facts too.
  for (const year of text.match(YEAR_PATTERN) || []) {
    if (!grounded.has(year)) push(year, "year");
  }

  for (const season of text.match(SEASON_PATTERN) || []) {
    const normalized = season.replace(/\s+/g, "").toLowerCase();
    const groundedSeason = [...grounded].some(
      (t) => t.replace(/\s+/g, "") === normalized,
    );
    if (!groundedSeason) push(season.trim(), "season");
  }

  for (const claim of text.match(TENURE_PATTERN) || []) {
    const raw = claim.trim().split(/\s+/)[0].replace("+", "").toLowerCase();
    const digits = NUMBER_WORDS[raw] || raw;
    if (!grounded.has(raw) && !grounded.has(digits)) {
      push(claim.trim(), "tenure");
    }
  }

  if (DECADE_PATTERN.test(text) && !grounded.has("decade")) {
    push("a decade", "tenure");
  }

  return found;
}

/**
 * Facts the talent wrote that a refine quietly deleted. Refine may tighten
 * prose; it may not lose the talent's own credits, markets, or dates.
 *
 * Short all-caps tokens are skipped (NYC → "New York" is a rewrite, not a
 * deletion), as are the talent's own name tokens (a third-to-first person
 * rewrite legitimately drops the name) and any banned word the refine was
 * supposed to remove.
 */
function findDroppedUserFacts(bio, existingBio, context = {}) {
  const original = String(existingBio || "").trim();
  if (!original) return [];

  const outputTokens = new Set(tokenize(bio));
  const nameTokens = new Set(tokenize(context.name));
  const dropped = [];
  const seen = new Set();

  const consider = (raw) => {
    const clean = String(raw).replace(/[^A-Za-z0-9’'-]/g, "");
    if (!clean) return;
    if (/^[A-Z0-9]{2,4}$/.test(clean)) return;
    const token = tokenize(clean)[0];
    if (!token || token.length < 3) return;
    if (NEUTRAL_TOKENS.has(token)) return;
    if (SLOP_TOKENS.has(token)) return;
    if (nameTokens.has(token)) return;
    if (outputTokens.has(token)) return;
    if (seen.has(token)) return;
    seen.add(token);
    dropped.push(clean);
  };

  for (const { phrase } of extractEntityPhrases(original, {
    includeSentenceInitial: true,
  })) {
    phrase.split(/\s+/).forEach(consider);
  }

  for (const year of original.match(YEAR_PATTERN) || []) {
    if (!outputTokens.has(year) && !seen.has(year)) {
      seen.add(year);
      dropped.push(year);
    }
  }

  return dropped;
}

/**
 * Tokens that prove nothing about coverage. Narrower than NEUTRAL_TOKENS on
 * purpose: naming the booking lane ("editorial", "runway") IS using the
 * profile, even though those words are industry vocabulary.
 */
const COVERAGE_STOPWORDS = new Set([
  "model", "models", "modeling", "modelling", "talent", "agency", "agencies",
  "agent", "work", "works", "working", "experience", "experienced", "open",
  "seeking", "representation", "represented", "available", "availability",
  "new", "face", "faces", "and", "the", "with", "for", "level",
]);

function signalCarriesContent(signal) {
  return tokenize(signal?.fact).some(
    (token) => token.length >= 3 && !COVERAGE_STOPWORDS.has(token),
  );
}

/**
 * Which of the context signals the bio actually used. A bio that touches none
 * of them is atmosphere, not a bio.
 */
function findCoveredSignals(bio, context = {}) {
  const bioTokens = new Set(tokenize(bio));
  return (context.signals || [])
    .filter((signal) =>
      tokenize(signal.fact).some(
        (token) =>
          token.length >= 3 &&
          !COVERAGE_STOPWORDS.has(token) &&
          bioTokens.has(token),
      ),
    )
    .map((signal) => signal.key);
}

/** Signals that could be detected in output at all. */
function findGroundableSignals(context = {}) {
  return (context.signals || [])
    .filter(signalCarriesContent)
    .map((signal) => signal.key);
}

module.exports = {
  tokenize,
  extractEntityPhrases,
  buildGroundedTokens,
  collectGroundedEntities,
  findFabrications,
  findDroppedUserFacts,
  findCoveredSignals,
  findGroundableSignals,
  NEUTRAL_TOKENS,
  COVERAGE_STOPWORDS,
  HIGH_RISK_NAMES,
};
