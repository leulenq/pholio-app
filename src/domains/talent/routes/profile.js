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
const {
  upsertTextEmbedding,
  buildProfileText,
} = require("../../ai/embeddings");
const { masterVisionAnalysis } = require("../../ai/analyzeProfileImage");
const path = require("path");
const config = require("../../../config");
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

/**
 * Allowlisted profile columns for GET/PUT JSON (excludes raw vectors / embeddings).
 * Keep in sync when adding `profiles` columns intended for the talent app.
 */
const TALENT_PROFILE_API_BLOCKLIST = new Set([
  "vector_summary",
  "photo_embedding",
]);

const TALENT_PROFILE_API_KEYS = [
  "achievements",
  "age",
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
  "instagram_handle",
  "instagram_url",
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
  "skin_tone",
  "slug",
  "source_agency_id",
  "specialties",
  "submitted_at",
  "tattoos",
  "tiktok_handle",
  "tiktok_url",
  "timezone",
  "training",
  "twitter_handle",
  "twitter_url",
  "union_membership",
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
  "work_status",
  "youtube_handle",
  "youtube_url",
];

function pickTalentProfileForApi(row) {
  if (!row) return null;
  const out = {};
  for (const key of TALENT_PROFILE_API_KEYS) {
    if (TALENT_PROFILE_API_BLOCKLIST.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      out[key] = row[key];
    }
  }
  return out;
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
  return rows.map((img) => ({
    ...img,
    metadata: normalizeImageMetadataForApi(img.metadata),
    captured_at: normalizeOptionalIso(img.captured_at),
    retouched_at: normalizeOptionalIso(img.retouched_at),
  }));
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
    const profile = await knex("profiles").where({ user_id: userId }).first();
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

    // Fetch images
    // Fetch images (migrated to images table)
    const images = await knex("images")
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
      );

    response.images = mapProfileImagesForApi(images);

    // Subquery/Find primary image for hero_image_path mapping
    const primaryImage = images.find((img) => img.is_primary) || images[0];
    const derivedHeroPath = primaryImage ? primaryImage.path : null;
    const derivedPublicUrl = primaryImage
      ? primaryImage.public_url || primaryImage.path
      : null;

    const publicProfile = pickTalentProfileForApi(profile);
    formatProfileDateOfBirthForApi(publicProfile);
    response.profile = {
      ...publicProfile,
      email: user.email,
      hero_image_path: derivedHeroPath,
      photo_url_primary: derivedPublicUrl,
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
    const user = await knex("users").where({ id: userId }).first();
    if (!user) {
      if (req.session) req.session.destroy(() => {});
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }
    let profile = await knex("profiles").where({ user_id: userId }).first();

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    }

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

    // JSON fields - Knex handles stringifying for most drivers, but Postgres prefers objects
    // However, the error "invalid input syntax for type json" often occurs when a stringly-nested object is sent.
    // We'll ensure these are objects if they aren't already, or null.
    // JSON fields - Explicitly stringify for Knex/Postgres compatibility
    const formatJson = (val) => {
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? val : JSON.stringify(val);
    };

    if (data.languages !== undefined)
      updateData.languages = data.languages ? formatJson(data.languages) : null;
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

    // Weight conversion
    let finalWeightKg = data.weight_kg;
    let finalWeightLbs = data.weight_lbs;

    if (
      finalWeightKg !== undefined &&
      finalWeightKg !== null &&
      finalWeightKg !== "" &&
      (finalWeightLbs === undefined ||
        finalWeightLbs === null ||
        finalWeightLbs === "")
    ) {
      finalWeightLbs = convertKgToLbs(finalWeightKg);
    } else if (
      finalWeightLbs !== undefined &&
      finalWeightLbs !== null &&
      finalWeightLbs !== "" &&
      (finalWeightKg === undefined ||
        finalWeightKg === null ||
        finalWeightKg === "")
    ) {
      finalWeightKg = convertLbsToKg(finalWeightLbs);
    }

    if (finalWeightKg !== undefined) updateData.weight_kg = finalWeightKg;
    if (finalWeightLbs !== undefined) updateData.weight_lbs = finalWeightLbs;

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

    // Social Handle Parsing & URLs
    const isPro = profile.is_pro || false;

    const handleSocial = (network, handle) => {
      if (handle !== undefined) {
        const cleanHandle = handle ? parseSocialMediaHandle(handle) : null;
        updateData[`${network}_handle`] = cleanHandle;
        if (isPro && cleanHandle) {
          updateData[`${network}_url`] = generateSocialMediaUrl(
            network,
            cleanHandle,
          );
        }
      }
    };

    handleSocial("instagram", data.instagram_handle);
    handleSocial("twitter", data.twitter_handle);
    handleSocial("tiktok", data.tiktok_handle);
    handleSocial("youtube", data.youtube_handle);

    // Validate requested primary photo now, but apply after profile update succeeds.
    const requestedPrimaryPhotoId = data.primary_photo_id || null;
    if (requestedPrimaryPhotoId) {
      const selectedPrimaryPhoto = await knex("images")
        .where({ id: requestedPrimaryPhotoId, profile_id: profile.id })
        .first();
      if (!selectedPrimaryPhoto) {
        return res.status(400).json({
          success: false,
          message: "Primary photo not found for this profile",
        });
      }
    }

    // Perform Update only when actual profile fields changed.
    const hasProfileFieldChanges = Object.keys(updateData).some(
      (key) => key !== "updated_at",
    );
    if (hasProfileFieldChanges) {
      await knex("profiles").where({ id: profile.id }).update(updateData);

      // Log activity
      await logActivity(userId, "profile_updated", {
        profileId: profile.id,
        slug: updateData.slug || profile.slug,
        nameChanged: needsSlugUpdate,
      });
    }

    // Apply primary-image update only after profile save succeeds.
    if (requestedPrimaryPhotoId) {
      await knex.transaction(async (trx) => {
        await trx("images")
          .where({ profile_id: profile.id })
          .update({ is_primary: false });
        const updatedCount = await trx("images")
          .where({ id: requestedPrimaryPhotoId, profile_id: profile.id })
          .update({ is_primary: true });
        if (updatedCount === 0) {
          throw new Error("Failed to set primary image");
        }
      });

      const photo = await knex("images")
        .where({ id: requestedPrimaryPhotoId })
        .first();
      if (photo) {
        const fs = require("fs");
        const absolutePath =
          photo.absolute_path ||
          path.join(config.uploadsDir, path.basename(photo.path));

        fs.promises
          .readFile(absolutePath)
          .then((imageBuffer) => {
            masterVisionAnalysis(knex, imageBuffer, profile.id).catch((err) =>
              console.error(
                "[Profile API] Master image analysis failed silently:",
                err,
              ),
            );
          })
          .catch(() =>
            console.warn(
              "[Profile API] Could not read primary image for analysis (remote storage or missing file)",
            ),
          );
      }
    }

    // Return updated profile
    const updatedProfile = await knex("profiles")
      .where({ id: profile.id })
      .first();

    // Recompute and persist profile_status after every save
    const newStatus = computeProfileStatus(updatedProfile);
    if (newStatus !== updatedProfile.profile_status) {
      await knex("profiles")
        .where({ id: profile.id })
        .update({ profile_status: newStatus });
      updatedProfile.profile_status = newStatus;
    }

    // Update full-profile text embedding (best-effort, Postgres-only)
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
    } catch (embErr) {
      console.warn(
        "[Profile API] Text embedding failed (non-blocking):",
        embErr.message,
      );
    }

    const images = await knex("images")
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
      );

    const profileForCompleteness = {
      ...updatedProfile,
      email: updatedProfile.email || user.email || null,
    };
    const completeness = calculateProfileCompleteness(
      profileForCompleteness,
      images,
    );

    const responseProfile = pickTalentProfileForApi(updatedProfile);
    formatProfileDateOfBirthForApi(responseProfile);
    parseProfileImageAnalysisForApi(responseProfile);

    const primaryImage = images.find((img) => img.is_primary) || images[0];
    const derivedHeroPath = primaryImage ? primaryImage.path : null;
    const derivedPublicUrl = primaryImage
      ? primaryImage.public_url || primaryImage.path
      : null;

    return apiResponse.success(res, {
      profile: {
        ...responseProfile,
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
