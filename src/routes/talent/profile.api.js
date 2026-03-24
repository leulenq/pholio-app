const express = require("express");
const router = express.Router();
const knex = require("../../db/knex");
const { requireRole } = require("../../middleware/auth");
const { talentProfileUpdateSchema } = require("../../lib/validation");
const { curateBio } = require("../../lib/curate");
const apiResponse = require("../../lib/api-response");
const { normalizeMeasurements } = require("../../lib/curate");
const { ensureUniqueSlug } = require("../../lib/slugify");
const {
  calculateProfileCompleteness,
} = require("../../lib/dashboard/completeness");
const { logActivity } = require("../../lib/dashboard/shared-utils");
const { asyncHandler } = require("../../middleware/error-handler");
const {
  parseSocialMediaHandle,
  generateSocialMediaUrl,
  convertKgToLbs,
  convertLbsToKg,
  toFeetInches,
} = require("../../lib/profile-helpers");
const {
  checkEssentialsComplete,
} = require("../../lib/onboarding/essentials-check");
const { computeProfileStatus } = require("../../lib/profile-status");
const {
  upsertTextEmbedding,
  buildProfileText,
} = require("../../lib/ai/embeddings");
const { masterVisionAnalysis } = require("../../lib/ai/analyzeProfileImage");
const path = require("path");
const {
  getAllThemes,
  getFreeThemes,
  getProThemes,
  getDefaultTheme,
} = require("../../lib/themes");
const { v4: uuidv4 } = require("uuid");
const {
  getCurrentStep,
  getState,
} = require("../../lib/onboarding/casting-machine");

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

    // Profile exists
    response.profile = {
      ...profile,
      email: user.email,
    };

    // Format date_of_birth for frontend (YYYY-MM-DD)
    if (response.profile.date_of_birth) {
      try {
        // Ensure we treat it as a date and format as YYYY-MM-DD
        const d = new Date(response.profile.date_of_birth);
        if (!isNaN(d.getTime())) {
          response.profile.date_of_birth = d.toISOString().split("T")[0];
        }
      } catch (e) {
        // Keep original value if parsing fails
      }
    }

    // Removed aliasing for frontend compatibility per user request

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
        "sort",
        "created_at",
      );

    console.log("[Profile API] Fetched images:", {
      profileId: profile.id,
      count: images.length,
    });

    // Subquery/Find primary image for hero_image_path mapping
    const primaryImage = images.find((img) => img.is_primary) || images[0];
    const derivedHeroPath = primaryImage ? primaryImage.path : null;
    const derivedPublicUrl = primaryImage
      ? primaryImage.public_url || primaryImage.path
      : null;

    // Profile exists
    response.profile = {
      ...profile,
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
    response.shareUrl = `${req.protocol}://${req.get("host")}/portfolio/${profile.slug}`;

    // Add calculated fields/stats that might be useful
    // e.g. height in feet/inches for display
    if (profile.height_cm) {
      response.profile.height_display = toFeetInches(profile.height_cm);
    }

    // Parse image_analysis if it's a string
    if (
      response.profile.image_analysis &&
      typeof response.profile.image_analysis === "string"
    ) {
      try {
        response.profile.image_analysis = JSON.parse(
          response.profile.image_analysis,
        );
      } catch (e) {
        console.warn(
          "[Profile API] Failed to parse image_analysis JSON:",
          e.message,
        );
      }
    }

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
      console.log(
        "Profile Validation Errors:",
        JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
      );
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const data = parsed.data;
    const user = await knex("users").where({ id: userId }).first();
    let profile = await knex("profiles").where({ user_id: userId }).first();

    // If profile doesn't exist, create it (keeping minimal creation logic)
    if (!profile) {
      // Extract name for slug
      const finalLastName = data.last_name || null;
      const finalFirstName = data.first_name || user.email.split("@")[0];
      const slug = await ensureUniqueSlug(
        knex,
        "profiles",
        `${finalFirstName}-${finalLastName}`,
      );
      const profileId = uuidv4();

      // Prepare insert object (simplified for brevity, assume defaults handling similar to original)
      // For new JSON API, we expect client to send most fields if they matter,
      // but creation might only have subset.
      // We'll init with minimal + data.

      // Note: This matches deserialization logic from original controller
      const insertData = {
        id: profileId,
        user_id: userId,
        slug,
        first_name: finalFirstName,
        last_name: finalLastName,
        // Original insert used `profile.email || currentUser?.email` for completeness check, implies it might not be in profile table.

        // Fields from data
        city: data.city || "Not specified",
        phone: data.phone || "0000000000",
        height_cm: data.height_cm || 0,
        bio_raw: data.bio || "",
        bio_curated: data.bio
          ? curateBio(data.bio, finalFirstName, finalLastName)
          : "",

        // ... map all other fields
        gender: data.gender || null,
        date_of_birth: data.date_of_birth || null,

        // JSON fields
        languages: data.languages ? JSON.stringify(data.languages) : null,
        specialties: data.specialties ? JSON.stringify(data.specialties) : null,
        comfort_levels: data.comfort_levels
          ? JSON.stringify(data.comfort_levels)
          : null,
        previous_representations: data.previous_representations
          ? JSON.stringify(data.previous_representations)
          : null,
        experience_details: data.experience_details
          ? typeof data.experience_details === "string"
            ? data.experience_details
            : JSON.stringify(data.experience_details)
          : null,
        seeking_representation:
          data.seeking_representation !== undefined
            ? data.seeking_representation
            : false,
        current_agency: data.current_agency || null,
      };

      // ... (rest of fields mappings would be here, for brevity trusting client sends updates after creation or we expand this)
      // Actually for a proper implementation I should map them all.
      // Let's use the update logic to handle the fields after creation or just do it in one go.
      // Better to do a comprehensive insert if possible.
      // But since `PUT` implies update, creating on PUT is a bit odd, but original `POST` handled creation.
      // Use `knex('profiles').insert(insertData)`...

      // For now, let's assume the client calls this endpoint to UPDATE.
      // If we want to support creation via PUT, we need full mapping.
      // Let's map the Critical ones.

      await knex("profiles").insert(insertData);
      profile = await knex("profiles").where({ id: profileId }).first();

      await logActivity(userId, "profile_created", {
        profileId,
        slug,
        action: "created",
      });
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

    // Explicit mapping for camelCase frontend fields
    if (data.firstName !== undefined) updateData.first_name = data.firstName;
    if (data.lastName !== undefined) updateData.last_name = data.lastName;
    if (data.dateOfBirth !== undefined)
      updateData.date_of_birth = data.dateOfBirth;
    if (data.dob !== undefined) updateData.date_of_birth = data.dob;
    if (data.location !== undefined) updateData.city = data.location;

    // Ensure date_of_birth is a string (YYYY-MM-DD) for DB compatibility if needed
    // (Knex usually handles Date objects but YYYY-MM-DD string is safest for date columns)
    if (updateData.date_of_birth) {
      const d = new Date(updateData.date_of_birth);
      if (!isNaN(d.getTime())) {
        // Only save the date part to avoid timezone shifts
        updateData.date_of_birth = d.toISOString().split("T")[0];
      }
    }

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
    mapNumberField("shoe_size");
    mapField("eye_color");
    mapField("hair_color");
    mapField("gender");
    mapField("pronouns");
    mapField("date_of_birth");
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
    if (data.modeling_categories !== undefined)
      updateData.modeling_categories = JSON.stringify(data.modeling_categories);

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

    if (finalWeightKg && !finalWeightLbs) {
      finalWeightLbs = convertKgToLbs(finalWeightKg);
    } else if (finalWeightLbs && !finalWeightKg) {
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

    // Handle Primary Photo (Hero Image)
    // Handle Primary Photo (Hero Image)
    if (data.primary_photo_id) {
      await knex.transaction(async (trx) => {
        // 1. Reset all images for this profile to NOT primary
        await trx("images")
          .where({ profile_id: profile.id })
          .update({ is_primary: false });

        // 2. Set the selected image as primary
        const updatedCount = await trx("images")
          .where({ id: data.primary_photo_id, profile_id: profile.id })
          .update({ is_primary: true });

        if (updatedCount > 0) {
          const photo = await trx("images")
            .where({ id: data.primary_photo_id })
            .first();

          // Fire image analysis in background — do NOT await
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
            .catch((err) =>
              console.warn(
                "[Profile API] Could not read image for analysis (might be on R2):",
                absolutePath,
              ),
            );

          console.log(
            "[Profile API] Primary image updated to:",
            data.primary_photo_id,
          );
        }
      });
    }

    // Perform Update
    if (Object.keys(updateData).length > 0) {
      await knex("profiles").where({ id: profile.id }).update(updateData);

      // Log activity
      await logActivity(userId, "profile_updated", {
        profileId: profile.id,
        slug: updateData.slug || profile.slug,
        nameChanged: needsSlugUpdate,
      });
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
      .select("id", "path", "label as kind", "created_at");

    const profileForCompleteness = {
      ...updatedProfile,
      email: updatedProfile.email || user.email || null,
    };
    const completeness = calculateProfileCompleteness(
      profileForCompleteness,
      images,
    );

    // Use apiResponse.success() for consistent response structure
    return apiResponse.success(res, {
      profile: updatedProfile,
      completeness,
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
    const { runway, editorial, commercial, lifestyle, swim_fitness, overall } =
      req.body;

    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found" });
    }

    // Clamp scores to 0-100 range
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    await knex("profiles")
      .where({ id: profile.id })
      .update({
        fit_score_runway: clamp(runway),
        fit_score_editorial: clamp(editorial),
        fit_score_commercial: clamp(commercial),
        fit_score_lifestyle: clamp(lifestyle),
        fit_score_swim_fitness: clamp(swim_fitness),
        fit_score_overall: clamp(overall),
        fit_scores_calculated_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

    return res.json({
      success: true,
      message: "Fit scores saved",
      scores: {
        runway: clamp(runway),
        editorial: clamp(editorial),
        commercial: clamp(commercial),
        lifestyle: clamp(lifestyle),
        swim_fitness: clamp(swim_fitness),
        overall: clamp(overall),
      },
    });
  }),
);

module.exports = router;
