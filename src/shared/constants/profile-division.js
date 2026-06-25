"use strict";

const DIVISIONS = {
  FASHION_EDITORIAL: "fashion_editorial",
  COMMERCIAL_LIFESTYLE: "commercial_lifestyle",
  TALENT_PERFORMANCE: "talent_performance",
  FIT_SHOWROOM: "fit_showroom",
};

const SPECIALTY_KEYWORDS = {
  [DIVISIONS.COMMERCIAL_LIFESTYLE]: ["commercial", "lifestyle", "catalog", "e-commerce", "ecommerce"],
  [DIVISIONS.TALENT_PERFORMANCE]: [
    "actor",
    "actress",
    "host",
    "presenter",
    "voice",
    "dancer",
    "performer",
  ],
  [DIVISIONS.FIT_SHOWROOM]: ["fit", "showroom"],
};

const EXPERIENCE_HINTS_PERFORMANCE = [
  "actor",
  "actress",
  "host",
  "presenter",
  "voice",
  "dancer",
  "perform",
  "theater",
  "theatre",
  "on-camera",
  "on camera",
];

const DIVISION_CONFIG = {
  [DIVISIONS.FASHION_EDITORIAL]: {
    label: "Fashion & Editorial",
    tagline: "Bookers on this board scan for clean digitals, profile angles, and editorial range.",
    emphasizeImproveKeys: ["photo_editorial", "photo_profile", "look"],
    deemphasizeImproveKeys: [],
  },
  [DIVISIONS.COMMERCIAL_LIFESTYLE]: {
    label: "Commercial & Lifestyle",
    tagline: "Bookers on this board scan for smile energy, relatable lifestyle frames, and social proof.",
    emphasizeImproveKeys: ["photo_smile", "photo_lifestyle", "social"],
    deemphasizeImproveKeys: [],
  },
  [DIVISIONS.TALENT_PERFORMANCE]: {
    label: "Talent & Performance",
    tagline: "Casting teams on this board scan for story, training, and audience-facing presence.",
    emphasizeImproveKeys: ["bio", "social", "training"],
    deemphasizeImproveKeys: ["photo_editorial", "shoe", "weight"],
  },
  [DIVISIONS.FIT_SHOWROOM]: {
    label: "Fit & Showroom",
    tagline: "Fit bookers on this board scan for precise measurements and consistent fit stats.",
    emphasizeImproveKeys: ["measurements", "weight", "shoe"],
    deemphasizeImproveKeys: [],
  },
};

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      // Fall back to comma parsing below.
    }
  }

  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function toHaystack(values = []) {
  return values
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
}

function includesAny(haystack, needles) {
  return haystack.some((value) => needles.some((needle) => value.includes(needle)));
}

function resolveTalentDivision(profile = null) {
  const specialties = toHaystack(coerceArray(profile?.specialties));
  const experience = String(profile?.experience_level || "").trim().toLowerCase();

  if (
    includesAny(specialties, SPECIALTY_KEYWORDS[DIVISIONS.TALENT_PERFORMANCE]) ||
    includesAny([experience], EXPERIENCE_HINTS_PERFORMANCE)
  ) {
    return DIVISIONS.TALENT_PERFORMANCE;
  }

  if (includesAny(specialties, SPECIALTY_KEYWORDS[DIVISIONS.FIT_SHOWROOM])) {
    return DIVISIONS.FIT_SHOWROOM;
  }

  if (includesAny(specialties, SPECIALTY_KEYWORDS[DIVISIONS.COMMERCIAL_LIFESTYLE])) {
    return DIVISIONS.COMMERCIAL_LIFESTYLE;
  }

  return DIVISIONS.FASHION_EDITORIAL;
}

function getDivisionReadinessConfig(division) {
  return DIVISION_CONFIG[division] || DIVISION_CONFIG[DIVISIONS.FASHION_EDITORIAL];
}

module.exports = {
  resolveTalentDivision,
  getDivisionReadinessConfig,
  PROFILE_DIVISIONS: DIVISIONS,
};
