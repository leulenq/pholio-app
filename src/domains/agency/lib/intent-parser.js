/**
 * Server-side intent parser for Discover semantic search.
 *
 * Ports the client lexicon from client/src/domains/agency/lib/intentParser.js
 * and adds parseIntentToFilters() for SQL hard filters + soft query embedding.
 */

"use strict";

// ── Vocabulary (ported from client) ─────────────────────────────────────────

const LEXICON = {
  location: {
    icon: "location",
    kind: "Location",
    terms: {
      Paris: ["paris", "parisian"],
      Milan: ["milan", "milano"],
      "New York": ["new york", "nyc", "new-york", "manhattan", "brooklyn"],
      London: ["london"],
      Tokyo: ["tokyo"],
      "Los Angeles": ["los angeles", "la", "l.a."],
      Berlin: ["berlin"],
      Copenhagen: ["copenhagen"],
      Seoul: ["seoul"],
      "São Paulo": ["sao paulo", "são paulo"],
      Sydney: ["sydney"],
      Amsterdam: ["amsterdam"],
    },
  },
  look: {
    icon: "look",
    kind: "Look",
    terms: {
      Editorial: ["editorial"],
      Commercial: ["commercial"],
      Runway: ["runway", "catwalk", "show model"],
      Fitness: ["fitness", "athletic", "sport", "activewear"],
      Beauty: ["beauty", "skincare", "cosmetic", "cosmetics"],
      Fashion: ["high fashion", "fashion"],
      Lifestyle: ["lifestyle"],
      "Avant-garde": [
        "avant-garde",
        "avant garde",
        "experimental",
        "alternative",
      ],
      Classic: ["classic", "timeless"],
    },
  },
  gender: {
    icon: "gender",
    kind: "Gender",
    terms: {
      Female: ["female", "women", "woman", "womenswear"],
      Male: ["male", "men", "man", "menswear"],
      "Non-binary": ["non-binary", "nonbinary", "androgynous"],
    },
  },
  heritage: {
    icon: "heritage",
    kind: "Heritage",
    terms: {
      Black: ["black", "african", "afro", "caribbean", "dark-skinned"],
      White: ["white", "caucasian", "european", "fair-skinned"],
      Asian: ["asian", "east asian", "south asian", "southeast asian"],
      Latino: ["latino", "latina", "hispanic", "latin"],
      "Middle Eastern": ["middle eastern", "arab", "persian"],
      Mixed: ["mixed", "multiracial", "biracial"],
    },
  },
  experience: {
    icon: "experience",
    kind: "Experience",
    terms: {
      "New face": [
        "new face",
        "new faces",
        "fresh face",
        "undiscovered",
        "emerging",
      ],
      Experienced: [
        "experienced",
        "agency experience",
        "professional",
        "seasoned",
      ],
      Established: ["established", "signed", "represented", "veteran"],
    },
  },
  vibe: {
    icon: "vibe",
    kind: "Energy",
    terms: {
      Soft: ["soft", "gentle", "tender"],
      Natural: ["natural", "effortless", "approachable", "warm"],
      Striking: ["striking", "bold", "strong", "dramatic"],
      Edgy: ["edgy", "raw", "rebellious"],
      Refined: ["refined", "elegant", "polished", "luxurious", "luxury"],
      Ethereal: ["ethereal", "luminous", "delicate", "dreamy"],
    },
  },
  context: {
    icon: "context",
    kind: "Campaign",
    terms: {
      "FW26 show": ["fw26", "fall winter", "fw"],
      "SS26 show": ["ss26", "spring summer", "ss"],
      Campaign: ["campaign"],
      Lookbook: ["lookbook", "e-commerce", "ecommerce"],
      Editorial: ["editorial shoot", "editorial spread"],
    },
  },
};

const FLAT_TERMS = [];
for (const group of Object.values(LEXICON)) {
  for (const [canonical, forms] of Object.entries(group.terms)) {
    for (const form of forms) FLAT_TERMS.push({ form, canonical, group });
  }
}
FLAT_TERMS.sort((a, b) => b.form.length - a.form.length);

const GENDER_DB_MAP = {
  Female: "Female",
  Male: "Male",
  "Non-binary": "Non-binary",
};

const HAIR_TERMS = {
  Red: ["redhead", "red hair", "ginger", "auburn", "copper"],
  Blonde: ["blonde", "blond", "platinum", "golden hair"],
  Brunette: ["brunette", "brown hair", "dark hair"],
  Black: ["black hair", "raven"],
};

const EYE_TERMS = {
  Blue: ["blue eyes", "blue-eyed"],
  Green: ["green eyes", "green-eyed"],
  Brown: ["brown eyes", "brown-eyed"],
  Hazel: ["hazel eyes", "hazel-eyed"],
};

const AGE_TERMS = {
  teen: ["teen", "teenage", "under 20"],
  twenties: ["20s", "twenties", "early 20s", "mid 20s"],
  thirties: ["30s", "thirties"],
};

const LOOK_ARCHETYPE_VALUES = new Set([
  "Editorial",
  "Commercial",
  "Runway",
  "Fitness",
  "Beauty",
  "Lifestyle",
  "Avant-garde",
  "Classic",
  "Fashion",
]);

const HAIR_COLOR_TERMS = {
  red: ["redhead", "red hair", "ginger", "auburn"],
  blonde: ["blonde", "blond"],
  brown: ["brunette", "brown hair"],
  black: ["black hair", "dark hair"],
};

const EYE_COLOR_TERMS = {
  blue: ["blue eyes", "blue-eyed"],
  green: ["green eyes", "green-eyed"],
  brown: ["brown eyes", "brown-eyed"],
  hazel: ["hazel eyes", "hazel-eyed"],
};

const CONSTRAINT_FIELD_MAP = {
  Location: "city",
  Gender: "gender",
  Heritage: "heritage",
  Look: "archetype",
  Experience: "experience_level",
  Build: "height",
};

// ── Height helpers ────────────────────────────────────────────────────────────

/**
 * Parse feet/inches or cm from a measurement string.
 * @param {string} raw
 * @returns {number|null} height in cm
 */
function parseHeightToCm(raw) {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();

  const cmMatch = text.match(/(\d{3})\s*cm/);
  if (cmMatch) return parseInt(cmMatch[1], 10);

  const ftInMatch = text.match(/(\d)\s*[''']\s*(\d{1,2})/);
  if (ftInMatch) {
    const feet = parseInt(ftInMatch[1], 10);
    const inches = parseInt(ftInMatch[2], 10);
    return Math.round(feet * 30.48 + inches * 2.54);
  }

  return null;
}

// ── parseIntent ───────────────────────────────────────────────────────────────

/**
 * Parse plain-language query into structured facets (debug / meta).
 * @param {string} text
 * @returns {{ facets: Array, coverage: number }}
 */
function parseIntent(text) {
  if (!text || !text.trim()) return { facets: [], coverage: 0 };
  const lower = ` ${text.toLowerCase()} `;
  const facets = [];
  const seenKinds = new Set();

  const heightMatch = text.match(/(\d[''']\s?\d{0,2}["”]?|\d{3}\s?cm)/);
  if (
    heightMatch &&
    /\b(tall|height|above|over|under|cm|ft|foot|\d['''])/i.test(text)
  ) {
    const dir = /above|over|min|tall/i.test(text) ? "+" : "";
    facets.push({
      kind: "Build",
      icon: "build",
      value: `${heightMatch[1].replace(/\s+/g, "")}${dir}`,
    });
    seenKinds.add("Build");
  } else if (/\btall\b/i.test(text)) {
    facets.push({ kind: "Build", icon: "build", value: "Tall" });
    seenKinds.add("Build");
  }

  for (const { form, canonical, group } of FLAT_TERMS) {
    if (
      lower.includes(` ${form} `) ||
      lower.includes(` ${form},`) ||
      lower.includes(`${form} `)
    ) {
      const kindLabel = group.kind;
      if (!seenKinds.has(kindLabel)) {
        facets.push({ kind: kindLabel, icon: group.icon, value: canonical });
        seenKinds.add(kindLabel);
      }
    }
  }

  const coverage = Math.min(1, facets.length / 4);
  return { facets, coverage };
}

/**
 * Map parsed facets + height heuristics to SQL filter fields.
 * @param {string} q
 * @returns {{
 *   facets: Array,
 *   filters: { city?: string, gender?: string, archetype?: string, experience_level?: string, min_height?: number, max_height?: number },
 *   softQuery: string
 * }}
 */
function parseIntentToFilters(q) {
  const trimmed = (q || "").trim();
  const { facets } = parseIntent(trimmed);

  const filters = {};

  for (const facet of facets) {
    if (facet.kind === "Location") {
      filters.city = facet.value;
    } else if (facet.kind === "Gender") {
      filters.gender = GENDER_DB_MAP[facet.value] || facet.value;
    } else if (facet.kind === "Heritage") {
      filters.heritage = facet.value;
    } else if (
      facet.kind === "Look" &&
      LOOK_ARCHETYPE_VALUES.has(facet.value)
    ) {
      filters.archetype = facet.value;
    } else if (facet.kind === "Experience") {
      filters.experience_level = facet.value;
    }
  }

  // Height heuristics
  if (/\btall\b/i.test(trimmed) && filters.min_height == null) {
    filters.min_height = 175;
  }

  const heightMatch = trimmed.match(/(\d[''']\s?\d{0,2}["”]?|\d{3}\s?cm)/i);
  if (heightMatch) {
    const cm = parseHeightToCm(heightMatch[1]);
    if (cm != null) {
      if (/above|over|min|tall/i.test(trimmed)) {
        filters.min_height = cm;
      } else if (/under|below|max/i.test(trimmed)) {
        filters.max_height = cm;
      } else {
        filters.min_height = Math.max(0, cm - 3);
        filters.max_height = cm + 3;
      }
    }
  }

  return {
    facets,
    filters,
    softQuery: trimmed,
  };
}

/**
 * Detect hair/eye color tokens not covered by main lexicon.
 * @param {string} text
 * @returns {Array<{ field: string, value: string, confidence: number }>}
 */
function parseColorConstraints(text) {
  const lower = ` ${(text || "").toLowerCase()} `;
  const constraints = [];

  for (const [value, forms] of Object.entries(HAIR_COLOR_TERMS)) {
    if (
      forms.some((f) => lower.includes(` ${f} `) || lower.includes(`${f} `))
    ) {
      constraints.push({ field: "hair_color", value, confidence: 0.8 });
      break;
    }
  }

  for (const [value, forms] of Object.entries(EYE_COLOR_TERMS)) {
    if (
      forms.some((f) => lower.includes(` ${f} `) || lower.includes(`${f} `))
    ) {
      constraints.push({ field: "eye_color", value, confidence: 0.75 });
      break;
    }
  }

  return constraints;
}

/**
 * Strip lexicon-matched tokens from query for residual channel text.
 * @param {string} text
 * @param {Array} facets
 * @returns {string}
 */
function stripMatchedTokens(text, facets) {
  let residual = ` ${(text || "").toLowerCase()} `;

  for (const { form } of FLAT_TERMS) {
    residual = residual
      .replace(
        new RegExp(` ${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `, "g"),
        " ",
      )
      .replace(
        new RegExp(` ${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`, "g"),
        " ",
      )
      .replace(
        new RegExp(`${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `, "g"),
        " ",
      );
  }

  for (const forms of Object.values(HAIR_COLOR_TERMS)) {
    for (const form of forms) {
      residual = residual.replace(
        new RegExp(` ${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `, "g"),
        " ",
      );
    }
  }

  for (const forms of Object.values(EYE_COLOR_TERMS)) {
    for (const form of forms) {
      residual = residual.replace(
        new RegExp(` ${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `, "g"),
        " ",
      );
    }
  }

  residual = residual.replace(
    /\b(tall|height|above|over|under|below)\b/gi,
    " ",
  );
  residual = residual.replace(/(\d[''']\s?\d{0,2}["”]?|\d{3}\s?cm)/gi, " ");

  return residual.replace(/\s+/g, " ").trim() || text.trim();
}

/**
 * Build soft constraints from parsed facets (hybrid mode — not SQL gates).
 * @param {string} q
 * @returns {Array<{ field: string, value: string|number, confidence: number, mode: string }>}
 */
function buildSoftConstraints(q) {
  const trimmed = (q || "").trim();
  const { facets, filters } = parseIntentToFilters(trimmed);
  const constraints = [];

  for (const facet of facets) {
    const field = CONSTRAINT_FIELD_MAP[facet.kind];
    if (!field) continue;

    if (facet.kind === "Build" && filters.min_height != null) {
      constraints.push({
        field: "min_height",
        value: filters.min_height,
        confidence: 0.75,
        mode: "soft",
      });
      continue;
    }

    if (field === "gender") {
      constraints.push({
        field: "gender",
        value: GENDER_DB_MAP[facet.value] || facet.value,
        confidence: 0.9,
        mode: "soft",
      });
    } else if (field === "heritage") {
      constraints.push({
        field: "heritage",
        value: facet.value,
        confidence: 0.85,
        mode: "soft",
      });
    } else if (field === "archetype") {
      constraints.push({
        field: "archetype",
        value: facet.value,
        confidence: 0.7,
        mode: "soft",
      });
    } else if (field === "city") {
      constraints.push({
        field: "city",
        value: facet.value,
        confidence: 0.8,
        mode: "soft",
      });
    } else if (field === "experience_level") {
      constraints.push({
        field: "experience_level",
        value: facet.value,
        confidence: 0.75,
        mode: "soft",
      });
    }
  }

  for (const color of parseColorConstraints(trimmed)) {
    constraints.push({ ...color, mode: "soft" });
  }

  return constraints;
}

/**
 * Fallback query decomposition when Groq is unavailable.
 * @param {string} q
 * @returns {Object}
 */
function decomposeQueryFallback(q) {
  const trimmed = (q || "").trim();
  const { facets } = parseIntent(trimmed);
  const constraints = buildSoftConstraints(trimmed);
  const residual = stripMatchedTokens(trimmed, facets);

  const attributes = facets.map((facet) => {
    let type = "casting";
    if (facet.kind === "Look" || facet.kind === "Energy") type = "vibe";
    if (facet.kind === "Heritage" || facet.kind === "Gender")
      type = "demographic";
    return {
      type,
      term: facet.value,
      confidence: 0.7,
    };
  });

  for (const c of parseColorConstraints(trimmed)) {
    attributes.push({
      type: "visual",
      term: c.value,
      confidence: c.confidence,
    });
  }

  if (
    residual &&
    !attributes.some((a) => a.term.toLowerCase() === residual.toLowerCase())
  ) {
    attributes.push({ type: "visual", term: residual, confidence: 0.6 });
  }

  const lexicalParts = [
    trimmed,
    residual,
    ...facets.map((f) => f.value),
    ...constraints.map((c) => String(c.value)),
  ].filter(Boolean);

  return {
    residual_query: residual || trimmed,
    attributes,
    constraints,
    channel_queries: {
      visual: residual || trimmed,
      casting:
        facets
          .filter((f) => ["Look", "Experience", "Campaign"].includes(f.kind))
          .map((f) => f.value)
          .join(" ") || trimmed,
      market:
        facets
          .filter((f) => ["Look", "Energy"].includes(f.kind))
          .map((f) => `${f.value} market fit`)
          .join(" ") || `${trimmed} market fit`,
      lexical: lexicalParts.join(" ").trim() || trimmed,
    },
    source: "intent_parser",
  };
}

module.exports = {
  LEXICON,
  parseIntent,
  parseIntentToFilters,
  parseHeightToCm,
  buildSoftConstraints,
  stripMatchedTokens,
  decomposeQueryFallback,
};
