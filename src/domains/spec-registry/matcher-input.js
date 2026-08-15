"use strict";

/** Database adapter for matcher.js. It intentionally returns only normalized,
 * agency-eligible facts and never lets an explicit image ID broaden scope. */

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function uniqueStringIds(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))].sort();
}

function isEligibleImage(row) {
  return (
    String(row?.status || "active") === "active" &&
    !row?.exclude_from_agency &&
    String(row?.asset_kind || "image") === "image" &&
    !row?.retired_at
  );
}

function socialMap(rows) {
  const social = {};
  for (const row of rows || []) {
    const rawPlatform = String(row?.platform || "").trim().toLowerCase();
    const platform = rawPlatform === "twitter" ? "x" : rawPlatform;
    const value = row?.handle || row?.url || null;
    if (platform && value && !social[platform]) social[platform] = value;
  }
  return social;
}

function normalizeWorkAuthorization(value) {
  if (value === true || value === 1 || String(value).trim().toLowerCase() === "yes") return true;
  if (value === false || value === 0 || String(value).trim().toLowerCase() === "no") return false;
  return null;
}

/**
 * PostgreSQL returns BIGINT columns as strings. Convert only positive safe
 * integer values at the persistence boundary so matcher comparisons use the
 * exact persisted delivery fact rather than treating a valid string as
 * unknown (or silently rounding an unsafe value).
 */
function normalizeDeliverySizeBytes(value) {
  let normalized = null;
  if (typeof value === "number") normalized = value;
  if (typeof value === "bigint") normalized = Number(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    normalized = Number(value.trim());
  }
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

async function hasTable(db, table) {
  try {
    return await db.schema.hasTable(table);
  } catch {
    return false;
  }
}

async function hasColumn(db, table, column) {
  try {
    return await db.schema.hasColumn(table, column);
  } catch {
    return false;
  }
}

async function buildMatcherInput(db, { profileId, selectedImageIds = null } = {}) {
  if (!db || typeof db !== "function") throw new TypeError("db must be a Knex instance");
  if (typeof profileId !== "string" || !profileId.trim()) throw new TypeError("profileId is required");

  const profile = await db("profiles as profiles")
    .leftJoin("users as users", "profiles.user_id", "users.id")
    .where("profiles.id", profileId)
    .select("profiles.*", "users.email as user_email")
    .first();
  if (!profile) {
    const error = new Error("Profile not found");
    error.code = "PROFILE_NOT_FOUND";
    throw error;
  }

  const [hasSets, hasSignals, hasSocial, hasDeliverySize, hasDeliveryMime] = await Promise.all([
    hasTable(db, "image_sets"),
    hasTable(db, "image_signals"),
    hasTable(db, "social_accounts"),
    hasColumn(db, "images", "delivery_size_bytes"),
    hasColumn(db, "images", "delivery_mime_type"),
  ]);
  const imageColumns = ["images.*"];
  if (hasSets) imageColumns.push("image_sets.retired_at");
  const query = db("images")
    .where("images.profile_id", profile.id)
    .select(imageColumns);
  if (hasSets) query.leftJoin("image_sets", "images.set_id", "image_sets.id");
  const rows = await query;

  const imageIds = rows.map((row) => row.id);
  let signalsByImageId = new Map();
  if (hasSignals && imageIds.length) {
    const signals = await db("image_signals").whereIn("image_id", imageIds);
    signalsByImageId = new Map(signals.map((row) => [String(row.image_id), row]));
  }
  let socialRows = [];
  if (hasSocial) {
    socialRows = await db("social_accounts")
      .where({ profile_id: profile.id })
      .select("platform", "handle", "url");
  }

  const requestedIds = uniqueStringIds(selectedImageIds);
  const requestedSet = requestedIds == null ? null : new Set(requestedIds);
  const eligible = rows.filter(isEligibleImage).map((row) => String(row.id));
  const selectedRows = rows.filter((row) =>
    isEligibleImage(row) && (requestedSet == null || requestedSet.has(String(row.id))),
  );
  const selectedIds = new Set(selectedRows.map((row) => String(row.id)));
  const rejectedImageIds = requestedIds == null ? [] : requestedIds.filter((id) => !selectedIds.has(id));

  return {
    talent: {
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
      email: profile.user_email ?? profile.email ?? null,
      phone: profile.phone ?? null,
      city: profile.city ?? null,
      dateOfBirth: profile.date_of_birth ?? null,
      heightCm: profile.height_cm ?? null,
      weightKg: profile.weight_kg ?? null,
      bustCm: profile.bust_cm ?? null,
      chestCm: profile.chest_cm ?? null,
      waistCm: profile.waist_cm ?? null,
      hipsCm: profile.hips_cm ?? null,
      shoeSize: profile.shoe_size ?? null,
      dressSize: profile.dress_size ?? null,
      suitSize: profile.suit_size ?? null,
      nationality: profile.nationality ?? null,
      gender: profile.gender ?? null,
      pronouns: profile.pronouns ?? null,
      workAuthorization: normalizeWorkAuthorization(profile.work_eligibility),
      hairColor: profile.hair_color ?? null,
      eyeColor: profile.eye_color ?? null,
      social: socialMap(socialRows),
    },
    images: selectedRows.map((row) => {
      const metadata = parseJson(row.metadata);
      const classification = metadata?.ai?.classification || {};
      const signal = signalsByImageId.get(String(row.id));
      return {
        id: String(row.id),
        shotType: row.shot_type ?? null,
        retouchedAt: row.retouched_at ?? null,
        classification: {
          source: classification.source ?? null,
          confirmed: classification.confirmed === true,
        },
        // Kept for a future declaration surface, but matcher.js deliberately
        // treats these AI-only values as unknown.
        signals: signal || metadata?.ai?.signals || classification.signals || {},
        file: {
          sizeBytes: hasDeliverySize
            ? normalizeDeliverySizeBytes(row.delivery_size_bytes)
            : null,
          mimeType: hasDeliveryMime ? row.delivery_mime_type ?? null : null,
        },
      };
    }),
    selection: {
      explicit: requestedIds != null,
      eligibleImageIds: eligible.sort(),
      selectedImageIds: [...selectedIds].sort(),
      rejectedImageIds,
    },
  };
}

module.exports = {
  buildMatcherInput,
  isEligibleImage,
  normalizeDeliverySizeBytes,
  parseJson,
  normalizeWorkAuthorization,
  socialMap,
  uniqueStringIds,
};
