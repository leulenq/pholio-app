"use strict";

const { computeAge, isMinorProfile } = require("./talent-age");

const SNAPSHOT_FIELDS = [
  "id",
  "slug",
  "first_name",
  "last_name",
  "city",
  "gender",
  "archetype",
  "height_cm",
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "hair_color",
  "eye_color",
  "measurements_updated_at",
  "nationality",
];

const ADULT_LINK_FIELDS = [
  "portfolio_url",
  "instagram_handle",
  "instagram_url",
  "tiktok_handle",
  "tiktok_url",
  "youtube_url",
  "twitter_handle",
  "twitter_url",
];

function normalizeStringList(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = source.split(",");
    }
  }
  if (!Array.isArray(source)) return [];
  return [
    ...new Set(
      source
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  ];
}

function buildSubmissionProfileSnapshot(profile, options = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  const minor =
    typeof options.minor === "boolean"
      ? options.minor
      : isMinorProfile(source);
  const snapshot = {};

  for (const field of SNAPSHOT_FIELDS) {
    snapshot[field] = source[field] ?? null;
  }

  const age = computeAge(source.date_of_birth ?? source.dob);
  snapshot.age = age;
  snapshot.age_band = minor ? "under_18" : age == null ? null : "18_or_older";
  snapshot.languages = normalizeStringList(source.languages);
  snapshot.bio_curated =
    String(source.bio_curated || source.bio_raw || "").trim() || null;
  snapshot.bio_raw = null;
  snapshot.is_minor = minor;

  if (!minor) {
    for (const field of ADULT_LINK_FIELDS) {
      snapshot[field] = source[field] ?? null;
    }
  }

  return snapshot;
}

module.exports = {
  buildSubmissionProfileSnapshot,
  normalizeStringList,
};
