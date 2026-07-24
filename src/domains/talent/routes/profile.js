const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { talentProfileUpdateSchema } = require("../../../shared/lib/validation");
const { curateBio } = require("../../../shared/lib/curate");
const apiResponse = require("../../../shared/lib/api-response");
const { normalizeMeasurements } = require("../../../shared/lib/curate");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { calculateProfileCompleteness } = require("../services/completeness");
const { logActivity } = require("../services/shared-utils");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const {
  parseSocialMediaHandle,
  generateSocialMediaUrl,
  convertKgToLbs,
  convertLbsToKg,
  toFeetInches,
} = require("../services/profile-helpers");
const {
  checkEssentialsComplete,
} = require("../../onboarding/validation/essentials-check");
const { computeProfileStatus } = require("../services/profile-status");
const { marketFromGeo } = require("../services/intel/market-resolve");
const {
  captureSubmissionReadiness,
  notifyIfSubmissionReadinessLost,
} = require("../../../shared/services/notify-profile-readiness");
const { loadImageRightsMap } = require("../../../shared/lib/image-rights");
const { imageRightsRowToApi } = require("../../../shared/lib/validation");
const { injectSocialFields, saveProfileSocialFields } = require("../../../shared/lib/social-helpers");
const {
  upsertTextEmbedding,
  buildProfileText,
  reindexDiscoverProfile,
} = require("../../ai/embeddings");
const {
  normalizeProfileLanguages,
} = require("../../../shared/lib/language-reference");
const {
  normalizeBookingLaneList,
  normalizeBookingLaneSlug,
} = require("../../../shared/constants/booking-lanes");
const { z } = require("zod");
const {
  getAllThemes,
  getFreeThemes,
  getProThemes,
  getDefaultTheme,
} = require("../../pdf/themes");
const { v4: uuidv4 } = require("uuid");
const {
  getCurrentStep,
  getState,
} = require("../../onboarding/services/state-machine");
const {
  canCollectSensitiveProfileFields,
  listSensitiveProfileUpdateFields,
  isMinorProfile,
  minorPublicExposureAllowed,
  hasRecordedDateOfBirth,
} = require("../../../shared/lib/talent-age");
const { getConsentStatus } = require("../services/guardian-consent");
const { loadFieldVisibility } = require("../../../shared/lib/field-visibility");
const {
  listRepresentations,
  syncStructuredRepresentationFromLegacy,
} = require("../services/representations");
const {
  excludeProviderAccountAvatarImages,
  reclaimProviderAccountAvatarSeeds,
} = require("../../../shared/lib/account-avatar");


/**
 * Allowlisted profile columns for GET/PUT JSON (excludes raw vectors / embeddings).
 * Keep in sync when adding `profiles` columns intended for the talent app.
 */
// Infra / AI / inference columns that must never reach the owner client, even if
// one is (re)added to the allowlist below. Defense-in-depth over the allowlist.
// (audit item 6 — conservative response hardening.) `fit_score_*` are intentionally
// NOT blocked: the owner editor renders its own lane signal from them.
const TALENT_PROFILE_API_BLOCKLIST = new Set([
  "vector_summary",
  "vector_summary_text",
  "photo_embedding",
  "search_document",
  "visual_intel",
  "librarian_synthesis",
  "market_fit_rankings",
  "onboarding_predictions",
  // P0-7: stored age/age_range are no longer maintained; derive age from DOB.
  "age",
  "age_range",
]);

// Any column whose name starts with one of these prefixes is stripped regardless
// of the allowlist (predicted_*, ip_*, google_* inference/telemetry columns).
const TALENT_PROFILE_API_BLOCKED_PREFIXES = ["predicted_", "ip_", "google_"];

const TALENT_PROFILE_API_KEYS = [
  "achievements",
  "analysis_error",
  "analysis_status",
  "archetype",
  "availability_schedule",
  "availability_travel",
  "bio_curated",
  "bio_raw",
  "body_type",
  "bust",
  "bust_cm",
  "city",
  "city_secondary",
  "comfort_levels",
  "created_at",
  "current_agency",
  "date_of_birth",
  "dress_size",
  "drivers_license",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "ethnicity",
  "experience_details",
  "experience_level",
  "eye_color",
  "first_name",
  "fit_score_commercial",
  "fit_score_editorial",
  "fit_score_lifestyle",
  "fit_score_overall",
  "fit_score_runway",
  "fit_score_swim_fitness",
  "fit_scores_calculated_at",
  "gender",
  "guardian_consent_at",
  "guardian_email",
  "hair_color",
  "hair_length",
  "hair_type",
  "height_cm",
  "hero_image_path",
  "hips",
  "hips_cm",
  "id",
  "image_analysis",
  "inseam_cm",
  "measurements_updated_at",
  "instagram_handle",
  "instagram_url",
  "instagram_verified",
  "instagram_followers",
  "instagram_engagement",
  "is_discoverable",
  "is_pro",
  "is_unicorn",
  "languages",
  "last_name",
  "market_fit_rankings",
  "measurements",
  "modeling_categories",
  "nationality",
  "onboarding_completed_at",
  "onboarding_stage",
  "onboarding_state_json",
  "onlyfans_url",
  "partner_agency_id",
  "passport_ready",
  "pdf_customizations",
  "pdf_theme",
  "phone",
  "photo_key_primary",
  "piercings",
  "place_of_birth",
  "playing_age_max",
  "playing_age_min",
  "portfolio_url",
  "previous_representations",
  "processed_at",
  "profile_completeness",
  "profile_status",
  "pronouns",
  "reference_email",
  "reference_name",
  "reference_phone",
  "seeking_representation",
  "services_locked",
  "shoe_size",
  "shoe_region",
  "skin_tone",
  "slug",
  "source_agency_id",
  "specialties",
  "submitted_at",
  "tattoos",
  "tiktok_handle",
  "tiktok_url",
  "tiktok_verified",
  "tiktok_followers",
  "tiktok_engagement",
  "timezone",
  "training",
  "twitter_handle",
  "twitter_url",
  "twitter_verified",
  "twitter_followers",
  "twitter_engagement",
  "union_membership",
  "unlock_celebrated_at",
  "updated_at",
  "user_id",
  "vibe_score",
  "video_reel_url",
  "visibility_mode",
  "waist",
  "waist_cm",
  "weight_kg",
  "weight_lbs",
  "weight_unit",
  "work_eligibility",
  "work_permit_on_file",
  "work_status",
  "youtube_handle",
  "youtube_url",
  "youtube_verified",
  "youtube_followers",
  "youtube_engagement",
];

function pickTalentProfileForApi(row) {
  if (!row) return null;
  const out = {};
  for (const key of TALENT_PROFILE_API_KEYS) {
    if (TALENT_PROFILE_API_BLOCKLIST.has(key)) continue;
    if (TALENT_PROFILE_API_BLOCKED_PREFIXES.some((p) => key.startsWith(p))) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      out[key] = row[key];
    }
  }
  return out;
}

/** Normalize a DOB to a bare YYYY-MM-DD string for change comparison. */
function normalizeDobString(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Optimistic-concurrency comparison for the P1-1 versioned save. The client passes
 * its last-known `updated_at` (body `expected_updated_at` or an `If-Match` header).
 * Returns true (proceed) when no token is supplied or either side is unparseable —
 * a safe fallback until the client always sends the token.
 */
function profileVersionMatches(currentUpdatedAt, providedVersion) {
  if (providedVersion == null || providedVersion === "") return true;
  const current = new Date(currentUpdatedAt).getTime();
  const provided = new Date(providedVersion).getTime();
  if (Number.isNaN(current) || Number.isNaN(provided)) return true;
  return current === provided;
}

/** Loosely compare an old vs new measurement value (numeric-aware). */
function measurementValueChanged(oldValue, newValue) {
  const isEmpty = (v) => v === null || v === undefined || v === "";
  if (isEmpty(oldValue) && isEmpty(newValue)) return false;
  if (isEmpty(oldValue) || isEmpty(newValue)) return true;
  const oldNum = Number(oldValue);
  const newNum = Number(newValue);
  if (Number.isFinite(oldNum) && Number.isFinite(newNum)) {
    return oldNum !== newNum;
  }
  return String(oldValue).trim() !== String(newValue).trim();
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

async function loadProfileBookingLanePayload(profileId, legacyModelingCategories) {
  if (!profileId) {
    return {
      booking_primary_lane: null,
      booking_secondary_lanes: [],
      booking_lanes: [],
    };
  }

  const hasJoinTable = await knex.schema.hasTable("profile_booking_lanes");
  if (!hasJoinTable) {
    const legacyLanes = normalizeBookingLaneList(
      parseJsonArray(legacyModelingCategories),
    );
    return {
      booking_primary_lane: legacyLanes[0] || null,
      booking_secondary_lanes: legacyLanes.slice(1, 4),
      booking_lanes: legacyLanes.map((laneSlug, index) => ({
        lane_slug: laneSlug,
        priority: index + 1,
        source: "legacy_modeling_categories",
        confidence: null,
      })),
    };
  }

  const rows = await knex("profile_booking_lanes")
    .where({ profile_id: profileId })
    .orderBy("priority", "asc")
    .orderBy("lane_slug", "asc")
    .select("lane_slug", "priority", "source", "confidence");

  const normalizedRows = rows
    .map((row) => ({
      ...row,
      lane_slug: normalizeBookingLaneSlug(row.lane_slug),
    }))
    .filter((row) => row.lane_slug);

  const laneSlugs = normalizedRows.map((row) => row.lane_slug);
  return {
    booking_primary_lane: laneSlugs[0] || null,
    booking_secondary_lanes: laneSlugs.slice(1, 4),
    booking_lanes: normalizedRows,
  };
}

/** Pure: normalize a desired (primary, secondary[]) selection into an ordered lane list. */
function resolveDesiredBookingLanes(primaryLane, secondaryLanes) {
  const primary = normalizeBookingLaneSlug(primaryLane);
  const secondary = normalizeBookingLaneList(secondaryLanes).filter(
    (laneSlug) => laneSlug !== primary,
  );
  return [primary, ...secondary].filter(Boolean).slice(0, 4);
}

/**
 * Persist the profile's booking lanes. When a transaction `trx` is supplied the
 * writes join the caller's transaction (P1-1 single atomic save); otherwise a
 * dedicated transaction is opened.
 */
async function syncProfileBookingLanes(
  profileId,
  primaryLane,
  secondaryLanes,
  trx = null,
) {
  const lanes = resolveDesiredBookingLanes(primaryLane, secondaryLanes);
  const db = trx || knex;
  const hasJoinTable = await db.schema.hasTable("profile_booking_lanes");
  if (!hasJoinTable) return lanes;

  const run = async (tx) => {
    await tx("profile_booking_lanes").where({ profile_id: profileId }).del();
    if (!lanes.length) return;
    await tx("profile_booking_lanes").insert(
      lanes.map((laneSlug, index) => ({
        profile_id: profileId,
        lane_slug: laneSlug,
        priority: index + 1,
        source: "talent_selected",
        updated_at: tx.fn.now(),
      })),
    );
  };

  if (trx) {
    await run(trx);
  } else {
    await knex.transaction(run);
  }

  return lanes;
}

function formatProfileDateOfBirthForApi(profilePayload) {
  if (!profilePayload?.date_of_birth) return;
  try {
    const d = new Date(profilePayload.date_of_birth);
    if (!isNaN(d.getTime())) {
      profilePayload.date_of_birth = d.toISOString().split("T")[0];
    }
  } catch {
    /* keep original */
  }
}

function parseProfileImageAnalysisForApi(profilePayload) {
  if (
    !profilePayload?.image_analysis ||
    typeof profilePayload.image_analysis !== "string"
  ) {
    return;
  }
  try {
    profilePayload.image_analysis = JSON.parse(profilePayload.image_analysis);
  } catch {
    profilePayload.image_analysis = null;
    if (process.env.NODE_ENV === "development") {
      console.warn("[Profile API] Failed to parse image_analysis JSON");
    }
  }
}

/** Normalize images.metadata for JSON responses (DB may return string JSON). */
function normalizeImageMetadataForApi(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return { ...parsed };
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ...raw };
  }
  return {};
}

function normalizeOptionalIso(raw) {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapProfileImagesForApi(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((img) => {
    const metadata = normalizeImageMetadataForApi(img.metadata);
    const band = metadata?.ai?.classification?.band;
    const classification_status = band === "pending" ? "pending" : "ready";
    return {
      ...img,
      metadata,
      classification_status,
      captured_at: normalizeOptionalIso(img.captured_at),
      retouched_at: normalizeOptionalIso(img.retouched_at),
    };
  });
}

function resolveMeasurementCm(data, cmKey, aliasKey) {
  if (Object.hasOwn(data, cmKey)) {
    const raw = data[cmKey];
    if (raw === "" || raw === null || raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  }
  if (Object.hasOwn(data, aliasKey)) {
    const raw = data[aliasKey];
    if (raw === "" || raw === null || raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

const fitScoresUpdateSchema = z.object({
  runway: z.coerce.number().optional(),
  editorial: z.coerce.number().optional(),
  commercial: z.coerce.number().optional(),
  lifestyle: z.coerce.number().optional(),
  swim_fitness: z.coerce.number().optional(),
  overall: z.coerce.number().optional(),
});

/**
 * GET /api/talent/profile
 * Returns full profile data, images, completeness, and metadata
 */
router.get(
  "/profile",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;

    // Fetch profile
    let profile = await knex("profiles").where({ user_id: userId }).first();
    if (profile) {
      profile = await injectSocialFields(profile);
    }
    const user = await knex("users").where({ id: userId }).first(); // Need email/role

    if (!user) {
      // Session exists but user not found (deleted?)
      req.session.destroy();
      return res.status(401).json({ error: "User not found" });
    }

    // Clean user object for response (remove password, etc)
    const safeUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url || null,
    };

    // Base response structure
    const response = {
      user: safeUser,
      profile: null,
      images: [],
      completeness: null,
      subscription: {
        status: "active", // Placeholder for now
        isPro: false,
        trialDaysRemaining: 0,
      },
      themes: {
        all: getAllThemes(),
        free: getFreeThemes(),
        pro: getProThemes(),
        current: getDefaultTheme(),
      },
      shareUrl: null,
    };

    // If no profile exists, return empty state with calculated completeness
    if (!profile) {
      const emptyCompleteness = calculateProfileCompleteness(null, []);
      response.completeness = emptyCompleteness;
      return apiResponse.success(res, response);
    }

    // Reclaim any legacy OAuth seeds that were incorrectly stored as book media.
    await reclaimProviderAccountAvatarSeeds(knex, {
      userId,
      profileId: profile.id,
    });
    if (await knex.schema.hasColumn("users", "avatar_url")) {
      const refreshed = await knex("users")
        .where({ id: userId })
        .first("avatar_url");
      safeUser.avatar_url = refreshed?.avatar_url || null;
    }

    // Fetch images (migrated to images table) — account avatars are excluded.
    const images = excludeProviderAccountAvatarImages(
      await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc")
      .select(
        "id",
        "path",
        "public_url",
        "is_primary",
        "metadata",
        "label as kind",
        "image_type",
        "shot_type",
        "style_type",
        "status",
        "exclude_from_public",
        "exclude_from_agency",
        "captured_at",
        "retouched_at",
        "set_id",
        "sort",
        "created_at",
        // Motion assets (media-audit server-core) — surfaced so the grid can
        // distinguish video from image frames.
        "asset_kind",
        "video_url",
        "video_duration_seconds",
      ),
    );

    const rightsMap = await loadImageRightsMap(
      knex,
      images.map((img) => img.id),
    );
    response.images = mapProfileImagesForApi(images).map((img) => {
      const rightsRow = rightsMap.get(String(img.id));
      return {
        ...img,
        rights: imageRightsRowToApi(rightsRow),
      };
    });

    // Subquery/Find primary image for hero_image_path mapping
    const primaryImage = images.find((img) => img.is_primary) || images[0];
    const derivedHeroPath = primaryImage ? primaryImage.path : null;
    const derivedPublicUrl = primaryImage
      ? primaryImage.public_url || primaryImage.path
      : null;

    const publicProfile = pickTalentProfileForApi(profile);
    formatProfileDateOfBirthForApi(publicProfile);
    const bookingLanePayload = await loadProfileBookingLanePayload(
      profile.id,
      profile.modeling_categories,
    );
    const consentStatus = await getConsentStatus(knex, profile);
    const representations = await listRepresentations(knex, profile.id);
    response.profile = {
      ...publicProfile,
      ...bookingLanePayload,
      representations: representations.filter(
        (representation) => representation.status === "active",
      ),
      representation_history: representations.filter(
        (representation) => representation.status === "ended",
      ),
      email: user.email,
      hero_image_path: derivedHeroPath,
      photo_url_primary: derivedPublicUrl,
      guardian_consent_status: consentStatus.status,
      guardian_email: consentStatus.guardianEmail,
    };

    // Calculate completeness
    const profileForCompleteness = {
      ...profile,
      email: profile.email || user.email || null,
    };
    const completeness = calculateProfileCompleteness(
      profileForCompleteness,
      images,
    );
    response.completeness = completeness;

    // Update subscription/theme info
    response.subscription.isPro = profile.is_pro || false;
    response.themes.current = profile.pdf_theme || getDefaultTheme();

    // Share URL
    const appBaseUrl =
      process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    response.shareUrl = `${appBaseUrl}/portfolio/${profile.slug}`;

    // Add calculated fields/stats that might be useful
    // e.g. height in feet/inches for display
    if (profile.height_cm) {
      response.profile.height_display = toFeetInches(profile.height_cm);
    }

    parseProfileImageAnalysisForApi(response.profile);

    // Add onboarding/gating status
    const essentialsCheck = checkEssentialsComplete(profile, images);
    const isOnboardingComplete = !!profile.onboarding_completed_at;

    response.onboarding = {
      isComplete: isOnboardingComplete,
      stage: getCurrentStep(profile),
      state: getState(profile), // Full state object
      essentials: essentialsCheck,
      canGenerateCompCard: isOnboardingComplete && essentialsCheck.ok,
      canApplyToAgencies: isOnboardingComplete && essentialsCheck.ok,
      canPublishPortfolio: isOnboardingComplete && essentialsCheck.ok,
    };

    // Per-field audience visibility (Wave 2B/2C "public stats opt-in"),
    // merged over the seeded defaults. Additive-only field so a future toggle
    // UI has something to render; does not change any existing response shape.
    response.fieldVisibility = await loadFieldVisibility(profile.id);

    return apiResponse.success(res, response);
  }),
);

/**
 * PUT /api/talent/profile
 * Update profile data
 * Expects clean JSON body matching talentProfileUpdateSchema
 */
router.put(
  "/profile",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;

    // Validate request body
    const parsed = talentProfileUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Profile API] Validation failed:",
          parsed.error.flatten().fieldErrors,
        );
      }
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const data = parsed.data;
    // P1-1 optimistic concurrency token. Read from the RAW body/header because the
    // zod schema strips unknown keys, so it never reaches `data` or the DB write.
    const clientProfileVersion =
      req.body?.expected_updated_at ?? req.get("If-Match") ?? null;
    const user = await knex("users").where({ id: userId }).first();
    if (!user) {
      if (req.session) req.session.destroy(() => {});
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }
    let profile = await knex("profiles").where({ user_id: userId }).first();
    if (profile) {
      profile = await injectSocialFields(profile);
    }

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    }

    const wasSubmissionReady = await captureSubmissionReadiness(profile.id);

    // Update Logic (Common for Create-then-Update or just Update)
    const updateData = {
      updated_at: knex.fn.now(),
    };

    // Helper to update only if defined
    const mapField = (field, dbField = field) => {
      if (data[field] !== undefined) {
        if (data[field] === "") {
          updateData[dbField] = null;
        } else if (typeof data[field] === "object" && data[field] !== null) {
          updateData[dbField] = JSON.stringify(data[field]);
        } else {
          updateData[dbField] = data[field];
        }
      }
    };

    // Aliases (firstName, location, dob, …) are merged in talentProfileUpdateSchema preprocess

    // Number fields (ensure no NaN is saved)
    const mapNumberField = (field, dbField = field) => {
      if (data[field] !== undefined) {
        if (data[field] === "" || data[field] === null) {
          updateData[dbField] = null;
        } else {
          const val = Number(data[field]);
          updateData[dbField] = isNaN(val) ? null : val;
        }
      }
    };

    mapField("city");
    mapField("city_secondary");
    // Discover market (WS3.5): whenever the primary city changes, re-derive
    // the canonical industry-market slug on the same write. Unrecognised
    // cities clear the market (NULL) rather than leaving a stale slug.
    if (Object.hasOwn(updateData, "city")) {
      updateData.market = updateData.city
        ? marketFromGeo({ city: updateData.city })
        : null;
    }
    mapField("phone");
    mapNumberField("height_cm");
    mapNumberField("weight_kg");
    mapNumberField("bust_cm");
    mapNumberField("waist_cm");
    mapNumberField("hips_cm");
    if (!Object.hasOwn(data, "bust_cm")) mapNumberField("bust", "bust_cm");
    if (!Object.hasOwn(data, "waist_cm")) mapNumberField("waist", "waist_cm");
    if (!Object.hasOwn(data, "hips_cm")) mapNumberField("hips", "hips_cm");
    mapNumberField("shoe_size");
    mapField("shoe_region");
    mapNumberField("chest_cm");
    mapField("suit_size");
    mapField("stats_track");
    mapField("discipline");
    mapField("eye_color");
    mapField("hair_color");
    mapField("gender");
    mapField("pronouns");
    mapField("date_of_birth");
    if (updateData.date_of_birth) {
      const d = new Date(updateData.date_of_birth);
      if (!isNaN(d.getTime())) {
        updateData.date_of_birth = d.toISOString().split("T")[0];
      }
    }
    mapField("dress_size");
    mapField("hair_length");
    mapField("hair_type");
    mapField("body_type");
    mapField("skin_tone");
    mapField("nationality");
    mapField("place_of_birth");
    mapField("timezone");
    mapField("inseam_cm");
    mapField("video_reel_url");
    mapField("playing_age_min");
    mapField("playing_age_max");
    mapField("availability_schedule"); // Enum
    mapField("experience_level");
    // Map training_summary (frontend) to training (db) if provided
    if (data.training_summary !== undefined)
      updateData.training = data.training_summary;
    if (data.training !== undefined) updateData.training = data.training;
    mapField("portfolio_url");
    mapField("onlyfans_url");
    mapField("reference_name");
    mapField("reference_email");
    mapField("reference_phone");
    mapField("emergency_contact_name");
    mapField("emergency_contact_phone");
    mapField("emergency_contact_relationship");
    mapField("work_eligibility");
    mapField("work_status");
    mapField("union_membership");
    mapField("ethnicity");
    mapField("seeking_representation");
    mapField("current_agency");
    // mapField('hero_image_path'); // DEPRECATED: Tracked via images.is_primary

    // Boolean fields
    if (data.tattoos !== undefined) updateData.tattoos = data.tattoos;
    if (data.piercings !== undefined) updateData.piercings = data.piercings;
    if (data.availability_travel !== undefined)
      updateData.availability_travel = data.availability_travel;
    if (data.drivers_license !== undefined)
      updateData.drivers_license = data.drivers_license;
    if (data.passport_ready !== undefined)
      updateData.passport_ready = data.passport_ready;

    // P0-6: The general profile update MUST NOT read or interpret guardian-consent
    // state. Previously a falsy `guardian_consent_recorded` — which the client sends
    // for ordinary adults with no guardian record — was treated as consent
    // revocation and silently set is_public=false, unpublishing an adult portfolio.
    // Consent (grant AND revocation) now lives only in the dedicated, scoped
    // guardian-consent flow (services/guardian-consent.js). `guardian_consent_recorded`
    // is intentionally ignored here and never touches is_public / guardian_consent_at.
    if (data.work_permit_on_file !== undefined) {
      updateData.work_permit_on_file = !!data.work_permit_on_file;
    }

    // P0-7(a): Stored age is no longer a source of truth. Age is ALWAYS derived from
    // date_of_birth (talent-age.js). Defensively guarantee neither age column is ever
    // written from this path.
    // TODO(schema-wave): add an `age_verified_at` column so a verified-age status is
    // separate from the freely-editable DOB (changing DOB should not silently keep an
    // old verification — see the DOB-change invalidation below).
    delete updateData.age;
    delete updateData.age_range;

    const mergedForPolicy = { ...profile, ...updateData };
    const sensitiveAttempted = listSensitiveProfileUpdateFields(data).filter(
      (key) =>
        data[key] !== undefined &&
        data[key] !== null &&
        data[key] !== "",
    );
    if (
      sensitiveAttempted.length > 0 &&
      !canCollectSensitiveProfileFields(mergedForPolicy)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Date of birth and guardian consent are required before measurements or weight can be saved.",
        code: "MINOR_CONSENT_REQUIRED",
      });
    }

    // Adult-content field: onlyfans_url must never be collected for a minor, and
    // fails closed when no verifiable adult DOB is on file. Clearing the field
    // (empty/null) is always permitted. Mirrors the MINOR_CONSENT_REQUIRED gate
    // used for sensitive measurements above.
    const onlyfansAttempted =
      data.onlyfans_url !== undefined &&
      data.onlyfans_url !== null &&
      data.onlyfans_url !== "";
    if (
      onlyfansAttempted &&
      (!hasRecordedDateOfBirth(mergedForPolicy) ||
        isMinorProfile(mergedForPolicy))
    ) {
      return res.status(403).json({
        success: false,
        message:
          "This field is not available for accounts without a verified adult date of birth.",
        code: "ADULT_DOB_REQUIRED",
      });
    }

    // Fail closed: force private whenever public exposure isn't cleared
    // (no verifiable adult DOB on file, or an unconsented minor). NOTE: for an
    // ordinary adult with a valid DOB this is a no-op, so a routine bio-only save
    // can never flip is_public (the P0-6 regression). Minor/adult status here is
    // derived from DOB via minorPublicExposureAllowed — never a stored age column.
    if (!minorPublicExposureAllowed(mergedForPolicy)) {
      updateData.is_public = false;
    }

    // P0-7(c): A DOB change invalidates any prior public/discovery exposure until the
    // new age is re-verified. Behavioral invalidation only (no new column): force the
    // profile private and non-discoverable whenever the normalized DOB actually
    // changes. Combined with the fail-closed gate above, self-editing DOB can never
    // silently keep or unlock exposure.
    if (Object.hasOwn(updateData, "date_of_birth")) {
      const previousDob = normalizeDobString(profile.date_of_birth);
      const nextDob = normalizeDobString(updateData.date_of_birth);
      if (previousDob !== nextDob) {
        updateData.is_public = false;
        updateData.is_discoverable = false;
      }
    }

    // JSON fields - Knex handles stringifying for most drivers, but Postgres prefers objects
    // However, the error "invalid input syntax for type json" often occurs when a stringly-nested object is sent.
    // We'll ensure these are objects if they aren't already, or null.
    // JSON fields - Explicitly stringify for Knex/Postgres compatibility
    const formatJson = (val) => {
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? val : JSON.stringify(val);
    };

    if (data.languages !== undefined) {
      const normalizedLanguages = await normalizeProfileLanguages(
        data.languages,
      );
      updateData.languages = normalizedLanguages.length
        ? formatJson(normalizedLanguages)
        : null;
    }
    if (data.specialties !== undefined)
      updateData.specialties = data.specialties
        ? formatJson(data.specialties)
        : null;
    if (data.comfort_levels !== undefined)
      updateData.comfort_levels = data.comfort_levels
        ? formatJson(data.comfort_levels)
        : null;
    if (data.modeling_categories !== undefined)
      updateData.modeling_categories = data.modeling_categories
        ? formatJson(data.modeling_categories)
        : null;
    if (data.previous_representations !== undefined)
      updateData.previous_representations = data.previous_representations
        ? formatJson(data.previous_representations)
        : null;
    if (data.experience_details !== undefined) {
      updateData.experience_details = data.experience_details
        ? formatJson(data.experience_details)
        : null;
    }

    // P1-2: Canonical weight. Accept ONE source-of-truth unit and ALWAYS derive the
    // other server-side, so a stale opposite-unit value in a full hydrated payload can
    // never survive (e.g. "70 kg" beside a leftover "149.9 lb"). The canonical unit is
    // `weight_unit` when provided; otherwise it is inferred from whichever value the
    // client actually sent. Clearing the canonical value clears both units.
    const isBlank = (v) => v === undefined || v === null || v === "";
    const kgProvided = Object.hasOwn(data, "weight_kg");
    const lbsProvided = Object.hasOwn(data, "weight_lbs");
    let canonicalUnit = data.weight_unit || null;
    if (!canonicalUnit) {
      if (kgProvided && !isBlank(data.weight_kg)) canonicalUnit = "kg";
      else if (lbsProvided && !isBlank(data.weight_lbs)) canonicalUnit = "lbs";
      else if (kgProvided) canonicalUnit = "kg";
      else if (lbsProvided) canonicalUnit = "lbs";
    }

    if (canonicalUnit === "kg" && kgProvided) {
      if (isBlank(data.weight_kg)) {
        updateData.weight_kg = null;
        updateData.weight_lbs = null;
      } else {
        const kg = Number(data.weight_kg);
        updateData.weight_kg = Number.isFinite(kg) ? kg : null;
        updateData.weight_lbs = Number.isFinite(kg) ? convertKgToLbs(kg) : null;
      }
    } else if (canonicalUnit === "lbs" && lbsProvided) {
      if (isBlank(data.weight_lbs)) {
        updateData.weight_lbs = null;
        updateData.weight_kg = null;
      } else {
        const lbs = Number(data.weight_lbs);
        updateData.weight_lbs = Number.isFinite(lbs) ? lbs : null;
        updateData.weight_kg = Number.isFinite(lbs) ? convertLbsToKg(lbs) : null;
      }
    }
    if (data.weight_unit) updateData.weight_unit = data.weight_unit;

    // Bio curation
    if (data.bio !== undefined) {
      updateData.bio_raw = data.bio;
      updateData.bio_curated = data.bio
        ? curateBio(
            data.bio,
            data.first_name || profile.first_name,
            data.last_name || profile.last_name,
          )
        : "";
    }

    // Handle Name Change & Slug
    let needsSlugUpdate = false;
    if (
      data.first_name !== undefined &&
      data.first_name !== profile.first_name
    ) {
      updateData.first_name = data.first_name;
      needsSlugUpdate = true;
    }
    if (data.last_name !== undefined && data.last_name !== profile.last_name) {
      updateData.last_name = data.last_name;
      needsSlugUpdate = true;
    }

    if (needsSlugUpdate) {
      const firstName = updateData.first_name || profile.first_name;
      const lastName = updateData.last_name || profile.last_name;
      const oldNameSlug = `${profile.first_name}-${profile.last_name}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");

      // Only update slug if it looks like it was auto-generated (matches old name)
      if (
        profile.slug === oldNameSlug ||
        profile.slug.startsWith(`${oldNameSlug}-`)
      ) {
        const newNameSlug = `${firstName}-${lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-");
        updateData.slug = await ensureUniqueSlug(knex, "profiles", newNameSlug);
      }
    }

    // Social Handle Parsing & URLs. Social accounts live in their own table and are
    // written independently of the profile row (the client also mutates them via the
    // OAuth endpoints), so this runs before the profile transaction.
    const isPro = profile.is_pro || false;
    await saveProfileSocialFields(profile.id, data, isPro);

    // Remove social fields from updateData since they no longer exist on profiles table
    delete updateData.instagram_handle;
    delete updateData.instagram_url;
    delete updateData.tiktok_handle;
    delete updateData.tiktok_url;
    delete updateData.twitter_handle;
    delete updateData.twitter_url;
    delete updateData.youtube_handle;
    delete updateData.youtube_url;
    delete updateData.onlyfans_url;
    delete updateData.portfolio_url;

    // NOTE: legacy `primary_photo_id` handling was removed from this route. Setting a
    // primary image is a /media concern (PUT /api/talent/media/:id/hero); the profile
    // TAB does not send it, and the SettingsPage avatar upload now calls the media
    // set-primary endpoint directly. Removing it also drops the automatic
    // masterVisionAnalysis image inference that contradicted the accepted AI notices
    // (audit P0-5). See report for the caller audit.

    // Booking lanes (P1-1): resolve the desired lane set now so modeling_categories is
    // written in the SAME atomic UPDATE; the join-table rows are persisted inside the
    // transaction below.
    const shouldSyncBookingLanes =
      data.booking_primary_lane !== undefined ||
      data.booking_secondary_lanes !== undefined;
    let desiredBookingLanes = null;
    if (shouldSyncBookingLanes) {
      const currentLanePayload = await loadProfileBookingLanePayload(
        profile.id,
        profile.modeling_categories,
      );
      desiredBookingLanes = resolveDesiredBookingLanes(
        data.booking_primary_lane !== undefined
          ? data.booking_primary_lane
          : currentLanePayload.booking_primary_lane,
        data.booking_secondary_lanes !== undefined
          ? data.booking_secondary_lanes
          : currentLanePayload.booking_secondary_lanes,
      );
      // Legacy compatibility until all consumers are moved off modeling_categories.
      updateData.modeling_categories = desiredBookingLanes.length
        ? formatJson(desiredBookingLanes)
        : null;
    }

    // P1-2: Stamp measurement recency ONLY when a CANONICAL measurement value truly
    // changes (old vs new), not merely because a full hydrated payload echoes the
    // measurement keys. weight_lbs is derived server-side, so it is excluded here to
    // avoid rounding churn refreshing the "measured" date.
    const CANONICAL_MEASUREMENT_FIELDS = [
      "height_cm",
      "weight_kg",
      "bust_cm",
      "chest_cm",
      "waist_cm",
      "hips_cm",
      "inseam_cm",
      "shoe_size",
      "dress_size",
      "suit_size",
    ];
    const measurementsChanged = CANONICAL_MEASUREMENT_FIELDS.some(
      (key) =>
        Object.hasOwn(updateData, key) &&
        measurementValueChanged(profile[key], updateData[key]),
    );
    if (measurementsChanged) {
      updateData.measurements_updated_at = knex.fn.now();
    }

    // Images are not mutated by this route anymore; load once for status,
    // completeness, and the response payload. Exclude OAuth account avatars.
    const images = excludeProviderAccountAvatarImages(
      await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc")
      .select(
        "id",
        "path",
        "public_url",
        "is_primary",
        "metadata",
        "label as kind",
        "image_type",
        "shot_type",
        "style_type",
        "status",
        "exclude_from_public",
        "exclude_from_agency",
        "captured_at",
        "retouched_at",
        "set_id",
        "sort",
        "created_at",
        // Motion assets (media-audit server-core) — surfaced so the grid can
        // distinguish video from image frames.
        "asset_kind",
        "video_url",
        "video_duration_seconds",
      ),
    );

    // Precompute profile_status so it is written in the SAME atomic UPDATE instead of
    // a second post-hoc write.
    const mergedForStatus = {
      ...profile,
      ...updateData,
      email: profile.email || user.email || null,
    };
    const nextStatus = computeProfileStatus(mergedForStatus, images);
    if (nextStatus !== profile.profile_status) {
      updateData.profile_status = nextStatus;
    }

    // Perform Update only when actual profile fields changed.
    const hasProfileFieldChanges = Object.keys(updateData).some(
      (key) => key !== "updated_at",
    );

    // P1-1: ONE transaction covering the canonical profile mutation set (profile row,
    // booking-lane join rows, and structured representation), guarded by optimistic
    // concurrency on the existing `updated_at` version token. A mid-failure now rolls
    // the whole set back instead of leaving a partial save, and a stale writer (two
    // open tabs each submitting a full hydrated record) is rejected with 409 rather
    // than clobbering newer data.
    try {
      await knex.transaction(async (trx) => {
        const currentRow = await trx("profiles")
          .where({ id: profile.id })
          .first("updated_at");
        if (
          !profileVersionMatches(currentRow?.updated_at, clientProfileVersion)
        ) {
          const staleError = new Error("Profile modified concurrently");
          staleError.code = "STALE_PROFILE_VERSION";
          throw staleError;
        }

        if (shouldSyncBookingLanes) {
          await syncProfileBookingLanes(
            profile.id,
            desiredBookingLanes[0] || null,
            desiredBookingLanes.slice(1),
            trx,
          );
        }

        if (hasProfileFieldChanges) {
          await trx("profiles").where({ id: profile.id }).update(updateData);

          if (Object.hasOwn(data, "current_agency")) {
            await syncStructuredRepresentationFromLegacy(
              trx,
              profile.id,
              data.current_agency,
            );
          }
        }
      });
    } catch (txError) {
      if (txError && txError.code === "STALE_PROFILE_VERSION") {
        return res.status(409).json({
          success: false,
          code: "STALE_PROFILE_VERSION",
          message:
            "This profile was changed in another tab or on another device. Reload to get the latest version, then save again.",
        });
      }
      throw txError;
    }

    // Activity logging is non-critical — run it after commit and never block the
    // response (also keeps it out of the write transaction).
    if (hasProfileFieldChanges) {
      logActivity(userId, "profile_updated", {
        profileId: profile.id,
        slug: updateData.slug || profile.slug,
        nameChanged: needsSlugUpdate,
      }).catch(() => {});
    }

    // Return updated profile
    let updatedProfile = await knex("profiles")
      .where({ id: profile.id })
      .first();
    if (updatedProfile) {
      updatedProfile = await injectSocialFields(updatedProfile);
    }

    // P1 (26s-timeout risk): embedding + Discover reindex is derived, external, and
    // best-effort. Move it OFF the request path (fire-and-forget after commit) so a
    // slow index can never time out the function AFTER the DB already committed and
    // make the client believe a persisted save failed.
    setImmediate(() => {
      (async () => {
        try {
          const profileText = buildProfileText(updatedProfile);
          if (profileText) {
            await upsertTextEmbedding(
              knex,
              profile.id,
              "full_profile",
              profileText,
            );
          }
          await reindexDiscoverProfile(knex, profile.id);
        } catch (embErr) {
          console.warn(
            "[Profile API] Text embedding failed (non-blocking):",
            embErr.message,
          );
        }
      })();
    });

    const profileForCompleteness = {
      ...updatedProfile,
      email: updatedProfile.email || user.email || null,
    };
    const completeness = calculateProfileCompleteness(
      profileForCompleteness,
      images,
    );

    await notifyIfSubmissionReadinessLost(profile.id, wasSubmissionReady);

    const responseProfile = pickTalentProfileForApi(updatedProfile);
    formatProfileDateOfBirthForApi(responseProfile);
    parseProfileImageAnalysisForApi(responseProfile);
    const updatedConsentStatus = await getConsentStatus(knex, updatedProfile);
    responseProfile.guardian_consent_status = updatedConsentStatus.status;
    responseProfile.guardian_email = updatedConsentStatus.guardianEmail;
    const responseBookingLanePayload = await loadProfileBookingLanePayload(
      updatedProfile.id,
      updatedProfile.modeling_categories,
    );
    const responseRepresentations = await listRepresentations(
      knex,
      updatedProfile.id,
    );

    const primaryImage = images.find((img) => img.is_primary) || images[0];
    const derivedHeroPath = primaryImage ? primaryImage.path : null;
    const derivedPublicUrl = primaryImage
      ? primaryImage.public_url || primaryImage.path
      : null;

    return apiResponse.success(res, {
      profile: {
        ...responseProfile,
        ...responseBookingLanePayload,
        representations: responseRepresentations.filter(
          (representation) => representation.status === "active",
        ),
        representation_history: responseRepresentations.filter(
          (representation) => representation.status === "ended",
        ),
        email: user.email,
        hero_image_path: derivedHeroPath,
        photo_url_primary: derivedPublicUrl,
      },
      completeness,
      images: mapProfileImagesForApi(images),
    });
  }),
);

/**
 * POST /api/talent/profile/fit-scores
 * Persist calculated fit scores from the Casting Reveal experience
 */
router.post(
  "/profile/fit-scores",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const parsedScores = fitScoresUpdateSchema.safeParse(req.body);
    if (!parsedScores.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsedScores.error.flatten().fieldErrors,
      });
    }
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found" });
    }

    // Clamp scores to 0-100 range
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    const scoreFieldMap = [
      ["runway", "fit_score_runway"],
      ["editorial", "fit_score_editorial"],
      ["commercial", "fit_score_commercial"],
      ["lifestyle", "fit_score_lifestyle"],
      ["swim_fitness", "fit_score_swim_fitness"],
      ["overall", "fit_score_overall"],
    ];
    const scorePatch = {};
    const responseScores = {};
    for (const [payloadKey, dbKey] of scoreFieldMap) {
      if (!Object.hasOwn(parsedScores.data, payloadKey)) continue;
      const value = clamp(parsedScores.data[payloadKey]);
      scorePatch[dbKey] = value;
      responseScores[payloadKey] = value;
    }
    if (Object.keys(scorePatch).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one fit score is required",
      });
    }

    await knex("profiles")
      .where({ id: profile.id })
      .update({
        ...scorePatch,
        fit_scores_calculated_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

    return res.json({
      success: true,
      message: "Fit scores saved",
      scores: responseScores,
    });
  }),
);

module.exports = router;
