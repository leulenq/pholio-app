"use strict";

const { computeAge, isMinorProfile } = require("./talent-age");
const { buildCanonicalStats } = require("./stats-formatter");

const SNAPSHOT_FIELDS = [
  "id",
  "slug",
  "first_name",
  "last_name",
  "city",
  "gender",
  "archetype",
  "stats_track",
  "height_cm",
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "suit_size",
  "hair_color",
  "eye_color",
  "measurements_updated_at",
  "nationality",
];

// Shaped, allowlisted subset of a `social_accounts` row. Mirrors
// audience-dto.SOCIAL_ACCOUNT_FIELDS exactly (platform/handle/url/verified —
// never raw OAuth tokens or follower/engagement metrics). Duplicated as a
// tiny local constant rather than imported: audience-dto.js requires this
// module (buildAgencySubmissionDTO delegates here), so importing the other
// direction would be circular. Both callers of buildSubmissionProfileSnapshot
// that bypass audience-dto entirely (applications.js, inbox.js) still need
// this shaping done here.
const SOCIAL_FIELDS = ["platform", "handle", "url", "verified"];

function shapeSocialForSnapshot(social) {
  if (!social) return [];
  const rows = Array.isArray(social) ? social : [social];
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const out = {};
      for (const field of SOCIAL_FIELDS) out[field] = row[field] ?? null;
      return out;
    });
}

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
  // Canonical, track-driven stats so submission agrees with profile / agency /
  // portfolio / PDF (audit P1-6). Raw *_cm columns above stay for back-compat.
  snapshot.stats = buildCanonicalStats(source);

  // Social links now live in `social_accounts` (migration
  // 20260629160000_create_social_accounts_table) — `profiles` no longer has
  // instagram_handle/portfolio_url/etc columns. Callers load the rows (see
  // shared/lib/social-accounts.js) and pass them as `options.social`; minors
  // never get social links in a submission (audit P1-4 / minor data
  // minimization already established for this snapshot).
  snapshot.social = minor ? [] : shapeSocialForSnapshot(options.social);

  return snapshot;
}

module.exports = {
  buildSubmissionProfileSnapshot,
  normalizeStringList,
  shapeSocialForSnapshot,
};
