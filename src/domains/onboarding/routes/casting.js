/**
 * Casting Call Routes (Phase 2: API Implementation)
 * Implements the "2-Minute Casting Call" onboarding flow
 *
 * Flow: Entry → Scout/Vibe (parallel) → Reveal → Done
 *
 * Endpoints:
 * - POST /onboarding/entry - Smart Entry (OAuth authentication)
 * - POST /onboarding/scout - Visual Interview (photo upload + AI)
 * - POST /onboarding/vibe - Maverick Chat (3 psychographic questions)
 * - GET /onboarding/reveal - The Reveal (archetype calculation)
 * - GET /onboarding/status - Status polling (current state)
 */

const express = require("express");
const { z } = require("zod");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// Dependencies
const knex = require("../../../shared/db/knex");
const {
  requireAuth,
  requireRole,
} = require("../../auth/middleware/require-auth");
const { addMessage } = require("../../../shared/middleware/context");
const { upload, processImage } = require("../../../shared/lib/uploader");
// Deprecated: const { analyzePhoto } = require('../../ai/photo-analysis');
const { generateArchetype } = require("../../ai/groq-casting");
const { masterVisionAnalysis } = require("../../ai/analyzeProfileImage");
const SignalCollector = require("../services/signal-collector");
const {
  getState,
  transitionTo,
  canComplete,
  getNextSteps,
  initialState,
} = require("../services/state-machine");
const {
  verifyGoogleToken,
  normalizeGoogleUser,
} = require("../services/providers/google");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const OnboardingAnalytics = require("../analytics/onboarding-events");
const {
  updateProfileCompleteness,
} = require("../../talent/services/profile-completeness");

function invalidOnboardingSequence(res, state, message) {
  return res.status(403).json({
    error: "Invalid onboarding sequence",
    message:
      message || "Complete prior onboarding steps in order before this action.",
    current_step: state.current_step,
    completed_steps: state.completed_steps || [],
  });
}

/**
 * Validation Schemas
 */

// Vibe signals validation
const vibeSchema = z.object({
  ambition_type: z.enum(["editorial", "commercial", "hybrid"], {
    required_error: "Career ambition is required",
    invalid_type_error: "Must be one of: editorial, commercial, hybrid",
  }),
  travel_willingness: z.enum(["high", "moderate", "low"], {
    required_error: "Travel willingness is required",
    invalid_type_error: "Must be one of: high, moderate, low",
  }),
  comfort_level: z.enum(["adventurous", "moderate", "cautious"], {
    required_error: "Comfort level is required",
    invalid_type_error: "Must be one of: adventurous, moderate, cautious",
  }),
});

/**
 * POST /onboarding/entry
 * Smart Entry: OAuth authentication OR manual signup
 *
 * Creates or retrieves user/profile and initializes casting call state
 */
router.post(["/onboarding/entry", "/casting/entry"], async (req, res, next) => {
  try {
    const { firebase_token, manual_signup, name, email, password } = req.body;

    let user,
      profile,
      isNewUser = false,
      isNewProfile = false,
      hasOAuthData = false;

    // Path 1: OAuth (Google/Instagram)
    if (firebase_token) {
      // Verify Firebase token
      let decodedToken;
      try {
        decodedToken = await verifyGoogleToken(firebase_token);
      } catch (error) {
        console.error(
          "[Casting Entry] Token verification failed:",
          error.message,
        );
        return res.status(401).json({
          error: "Authentication failed",
          message: error.message || "Invalid or expired token",
        });
      }

      // Normalize Google user data
      const providerUser = normalizeGoogleUser(decodedToken);

      if (!providerUser || !providerUser.uid) {
        return res.status(401).json({
          error: "Authentication failed",
          message: "Invalid token data",
        });
      }

      // Check if user exists
      user = await knex("users")
        .where({ firebase_uid: providerUser.uid })
        .orWhere({ email: providerUser.email })
        .first();

      // Create user if doesn't exist
      if (!user) {
        const userId = uuidv4();
        await knex("users").insert({
          id: userId,
          email: providerUser.email,
          firebase_uid: providerUser.uid,
          role: "TALENT",
          created_at: knex.fn.now(),
        });

        user = await knex("users").where({ id: userId }).first();
        isNewUser = true;
      }

      // Check if profile exists
      profile = await knex("profiles").where({ user_id: user.id }).first();

      // Create profile if doesn't exist
      if (!profile) {
        const profileId = uuidv4();
        const slug = await ensureUniqueSlug(
          knex,
          "profiles",
          providerUser.first_name && providerUser.last_name
            ? `${providerUser.first_name}-${providerUser.last_name}`
            : `user-${user.id.substring(0, 8)}`,
        );

        // Initialize with casting machine state
        const initial = initialState("entry", knex);

        // Use normalized Google data (now robustly extracting given_name/family_name)
        // Fallback to explicit 'name' payload if token claims are missing (e.g. immediate manual signup delay)
        const fallbackParts = name ? name.trim().split(" ") : [];
        const derivedFirstName =
          providerUser.first_name || fallbackParts[0] || "User";
        const derivedLastName =
          providerUser.last_name || fallbackParts.slice(1).join(" ") || null;

        await knex("profiles").insert({
          id: profileId,
          user_id: user.id,
          slug,
          first_name: derivedFirstName,
          last_name: derivedLastName,
          city: "Not specified",
          height_cm: 0,
          bio_raw: "",
          bio_curated: "",
          ...initial,
          visibility_mode: "private_intake",
          services_locked: true,
          analysis_status: "pending",
          profile_completeness: 0,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });

        // Add Google photo to images table as primary
        if (providerUser.picture) {
          try {
            await knex("images").insert({
              id: uuidv4(),
              profile_id: profileId,
              path: providerUser.picture,
              public_url: providerUser.picture,
              is_primary: true,
              sort: 0,
              created_at: knex.fn.now(),
            });
            console.log(
              "[Onboarding] Synced Google profile photo to images table",
            );
          } catch (imgError) {
            console.error("[Onboarding] Error syncing Google photo:", imgError);
            // Non-blocking error
          }
        }

        profile = await knex("profiles").where({ id: profileId }).first();
        isNewProfile = true;
      }

      hasOAuthData = true;

      // Collect entry signals
      await SignalCollector.collectEntrySignals(profile.id, {
        oauth_provider: "google",
        inferred_location: null,
        inferred_bio_keywords: [],
      });
    }
    // Path 2: Manual Signup
    else if (manual_signup) {
      if (!name || !email || !password) {
        return res.status(400).json({
          error: "Missing required fields",
          message: "Name, email, and password are required for manual signup",
        });
      }

      // Check if email already exists
      const existingUser = await knex("users").where({ email }).first();
      if (existingUser) {
        return res.status(409).json({
          error: "Email already exists",
          message: "An account with this email already exists",
        });
      }

      // Create user
      const userId = uuidv4();
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash(password, 10);

      await knex("users").insert({
        id: userId,
        email,
        password_hash: hashedPassword,
        role: "TALENT",
        created_at: knex.fn.now(),
      });

      user = await knex("users").where({ id: userId }).first();
      isNewUser = true;

      // Create profile
      const profileId = uuidv4();
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0] || "User";
      const lastName = nameParts.slice(1).join(" ") || null;

      const slug = await ensureUniqueSlug(
        knex,
        "profiles",
        `${firstName}${lastName ? "-" + lastName : ""}`,
      );

      const initial = initialState("entry", knex);

      await knex("profiles").insert({
        id: profileId,
        user_id: user.id,
        slug,
        first_name: firstName,
        last_name: lastName,
        city: "Not specified",
        height_cm: 0,
        bio_raw: "",
        bio_curated: "",
        ...initial,
        visibility_mode: "private_intake",
        services_locked: true,
        analysis_status: "pending",
        profile_completeness: 0,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      profile = await knex("profiles").where({ id: profileId }).first();
      isNewProfile = true;
      hasOAuthData = false;

      // Collect entry signals
      await SignalCollector.collectEntrySignals(profile.id, {
        oauth_provider: "manual",
        inferred_location: null,
        inferred_bio_keywords: [],
      });
    } else {
      return res.status(400).json({
        error: "Invalid request",
        message: "Either firebase_token or manual_signup data is required",
      });
    }

    // Set session
    req.session.userId = user.id;
    req.session.role = "TALENT";
    req.session.profileId = profile.id;

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Transition state to 'entry'
    const state = getState(profile);

    if (state.current_step === "entry" || state.completed_steps.length === 0) {
      let nextStep = "gender";

      // If manual signup, skip verification (Temporary override)
      if (manual_signup) {
        nextStep = "gender"; // Was 'verification_pending'

        // Still generate verification code (mock for now) so email flows still work if needed later

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await knex("users").where({ id: user.id }).update({
          verification_code: code,
          verification_code_expires_at: expiresAt,
          email_verified: false,
        });

        console.log(`[Email Verification] Code for ${email}: ${code}`);
      }

      const updatePayload = transitionTo(
        state,
        nextStep,
        {
          auth_method: manual_signup ? "manual" : "google",
          is_new_user: isNewUser,
          is_new_profile: isNewProfile,
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Cannot advance onboarding from the current step via entry.",
        );
      }

      await knex("profiles").where({ id: profile.id }).update(updatePayload);
    }

    // Track analytics
    if (isNewProfile) {
      await OnboardingAnalytics.trackEntry(profile.id, "entry", {
        source: "casting_call",
        auth_method: manual_signup ? "manual" : "google",
      });
    }

    // Return success with next steps
    return res.json({
      success: true,
      user_id: user.id,
      profile_id: profile.id,
      is_new_user: isNewUser,
      has_oauth_data: hasOAuthData,
      next_step: "gender",
      message: manual_signup
        ? "Account created. Email verification skipped."
        : "Authentication successful. Ready to start casting call.",
    });
  } catch (error) {
    console.error("[Casting Entry] Error:", error);
    return next(error);
  }
});

/**
 * POST /onboarding/verify-email
 * Verifies the 6-digit code and transitions to Scout
 */
router.post(
  "/onboarding/verify-email",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Verification code required" });
      }

      const user = await knex("users")
        .where({ id: req.session.userId })
        .first();

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.email_verified) {
        return res.json({
          success: true,
          next_step: "gender",
          message: "Email already verified",
        });
      }

      // specific debug bypass
      if (
        code !== "000000" &&
        (user.verification_code !== code ||
          new Date() > new Date(user.verification_code_expires_at))
      ) {
        return res.status(400).json({
          error: "Invalid or expired code",
          message: "Please check your code and try again",
        });
      }

      // Mark verified
      await knex("users").where({ id: user.id }).update({
        email_verified: true,
        verification_code: null,
        verification_code_expires_at: null,
      });

      // Transition Profile State
      const profile = await knex("profiles")
        .where({ user_id: user.id })
        .first();

      const state = getState(profile);
      const updatePayload = transitionTo(
        state,
        "gender",
        {
          email_verified_at: new Date().toISOString(),
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Email verification does not apply at this onboarding step.",
        );
      }

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      return res.json({
        success: true,
        next_step: "gender",
        message: "Email verified successfully",
      });
    } catch (error) {
      console.error("[Verify Email] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/scout
 * Visual Interview: Single photo upload with AI analysis
 *
 * Processes "digi" (headshot), runs AI analysis, stores phenotype signals
 */
router.post(
  ["/onboarding/scout", "/casting/scout"],
  requireRole("TALENT"),
  upload.single("digi"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      // Check if file uploaded
      if (!req.file) {
        return res.status(400).json({
          error: "Photo required",
          message: "Please upload a headshot photo (digi)",
        });
      }

      // Process image (converts to WebP, optimizes)
      const { storageKey, publicUrl, absolutePath } = await processImage(
        req.file,
        profile.id,
      );
      const { v4: uuidv4 } = require("uuid");
      const imageId = uuidv4();

      // Check if profile already has images to determine if this should be primary
      const existingImages = await knex("images")
        .where({ profile_id: profile.id })
        .first();
      const isPrimary = !existingImages;

      // Save image to the images table
      await knex("images").insert({
        id: imageId,
        profile_id: profile.id,
        path: publicUrl, // Save public URL to be consistent with Media API
        absolute_path: absolutePath, // Reliable path to the optimized webp image
        is_primary: isPrimary,
        label: "Scout photo",
        created_at: knex.fn.now(),
      });

      // photo_url_primary and hero_image_path updates REMOVED as columns are consolidated

      console.log("[Onboarding] Scout image uploaded:", {
        profileId: profile.id,
        imageId,
        isPrimary,
        absolutePath,
      });

      return res.json({
        success: true,
        imageId,
        isPrimary,
        photo_url: publicUrl,
        message: "Photo uploaded successfully",
      });
    } catch (error) {
      console.error("[Casting Scout] Upload Error:", error);
      return next(error);
    }
  },
);

/**
 * PATCH /onboarding/scout/primary
 * Switch the primary image without running AI analysis.
 */
router.patch(
  ["/onboarding/scout/primary", "/casting/scout/primary"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { imageId } = req.body;
      if (!imageId) return res.status(400).json({ error: "imageId required" });

      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) return res.status(404).json({ error: "Profile not found" });

      // Verify image exists and belongs to user
      const targetImage = await knex("images")
        .where({ id: imageId, profile_id: profile.id })
        .first();

      if (!targetImage)
        return res.status(404).json({ error: "Image not found" });

      // Unset all previous primary images
      await knex("images")
        .where({ profile_id: profile.id })
        .update({ is_primary: false });

      // Set new primary
      await knex("images").where({ id: imageId }).update({ is_primary: true });

      const derivedStorageKey = targetImage.path
        ? targetImage.path.replace(/^\//, "")
        : null;

      // profiles table sync removed: hero_image_path is now a derived field

      console.log("[Onboarding] Primary image updated:", profile.id, imageId);

      return res.json({
        success: true,
        message: "Primary image updated",
      });
    } catch (error) {
      console.error("[Casting Scout] Primary Swap Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/scout/confirm
 * The user taps "Continue".
 * Runs master vision analysis on the single chosen primary image, returning completion.
 */
router.post(
  ["/onboarding/scout/confirm", "/casting/scout/confirm"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) return res.status(404).json({ error: "Profile not found" });

      // Find the primary image
      const primaryImage = await knex("images")
        .where({ profile_id: profile.id, is_primary: true })
        .first();

      if (!primaryImage) {
        return res.status(400).json({ error: "No primary image set" });
      }

      const fs = require("fs");

      let imageBuffer;
      try {
        // Use absolute_path if available (safest), else try back-filling path
        const safePath =
          primaryImage.absolute_path ||
          require("path").join(
            require("../../config").uploadsDir,
            require("path").basename(primaryImage.path || ""),
          );
        imageBuffer = await fs.promises.readFile(safePath);
      } catch (err) {
        console.error("[Scout] Failed to read primary image from disk:", err);
        return res.status(500).json({
          error:
            "Failed to access uploaded image. Please re-select your photo.",
        });
      }

      // Call Master Vision (Do not await, fire and forget)
      masterVisionAnalysis(knex, imageBuffer, profile.id)
        .then((measurementEstimates) => {
          if (
            measurementEstimates &&
            measurementEstimates.confidence !== "Low"
          ) {
            const isPg =
              knex.client.config.client === "pg" ||
              knex.client.config.client === "postgresql";
            const rawUpdate = isPg
              ? knex.raw(
                  `jsonb_set(COALESCE(onboarding_state_json::jsonb, '{}'::jsonb), '{predictions}', ?::jsonb, true)`,
                  [JSON.stringify(measurementEstimates)],
                )
              : knex.raw(
                  `json_set(COALESCE(onboarding_state_json, '{}'), '$.predictions', json(?))`,
                  [JSON.stringify(measurementEstimates)],
                );

            // Save predictions to profiles.onboarding_state_json for frontend polling
            return knex("profiles").where({ id: profile.id }).update({
              onboarding_state_json: rawUpdate,
            });
          }
        })
        .catch((err) =>
          console.error("[Scout] Master vision analysis failed silently:", err),
        );

      console.log(
        "[Onboarding] Master image analysis triggered on confirmed primary:",
        profile.id,
      );

      // Transition state
      const state = getState(profile);
      const derivedStorageKey = primaryImage.path
        ? primaryImage.path.replace(/^\//, "")
        : null;
      const updatePayload = transitionTo(
        state,
        "measurements",
        {
          photo_uploaded: true,
          storage_key: derivedStorageKey,
          photo_url: primaryImage.path,
          predictions: null, // Predictions arrive async
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Confirm your photo after the scout step when it is the current step.",
        );
      }

      // Also mark analysis status as complete on the profile
      updatePayload.analysis_status = "complete";

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      // Get updated state to check if can reveal
      const updatedProfile = await knex("profiles")
        .where({ id: profile.id })
        .first();
      const updatedState = getState(updatedProfile);

      // Track completion
      await OnboardingAnalytics.trackCompletion(profile.id, "scout", null, {
        ai_success: true, // Background job dispatched
      });

      return res.json({
        success: true,
        redirect: "/onboarding/measurements",
        photo_url: primaryImage.path,
        can_complete: canComplete(updatedState),
        next_steps: getNextSteps(updatedState),
        message: "Scout confirmed and analysis triggered",
      });
    } catch (error) {
      console.error("[Casting Scout] Confirm Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/vibe
 * DEPRECATED: This route is not used in the current casting flow
 * The new flow is: entry → scout → measurements → profile → done
 * Kept for backward compatibility with old data only
 *
 * Original purpose: Maverick Chat - 3-question psychographic assessment
 * Collected: ambition, travel willingness, and comfort level signals
 */
/* DEPRECATED - Commenting out unused route
router.post('/onboarding/vibe', requireRole('TALENT'), async (req, res, next) => {
  try {
    const profile = await knex('profiles')
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
        message: 'Please complete entry step first'
      });
    }

    // Validate vibe signals
    const parsed = vibeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
        message: 'Please provide valid responses to all questions'
      });
    }

    const data = parsed.data;

    // Collect vibe signals
    await SignalCollector.collectVibeSignals(profile.id, {
      ambition_type: data.ambition_type,
      travel_willingness: data.travel_willingness,
      comfort_level: data.comfort_level
    });

    // Transition state
    const state = getState(profile);
    const updatePayload = transitionTo(state, 'vibe', {
      questions_answered: 3,
      ambition: data.ambition_type
    }, knex);

    await knex('profiles')
      .where({ id: profile.id })
      .update(updatePayload);

    // Get updated state to check if can reveal
    const updatedProfile = await knex('profiles')
      .where({ id: profile.id })
      .first();
    const updatedState = getState(updatedProfile);

    // Track completion
    await OnboardingAnalytics.trackCompletion(profile.id, 'vibe', null, {
      ambition: data.ambition_type
    });

    return res.json({
      success: true,
      can_complete: canComplete(updatedState),
      next_steps: getNextSteps(updatedState),
      message: 'Responses recorded successfully'
    });

  } catch (error) {
    console.error('[Casting Vibe] Error:', error);
    return next(error);
  }
});
*/

/**
 * GET /onboarding/reveal
 * DEPRECATED: This route is not used in the current casting flow
 * The new flow is: entry → scout → measurements → profile → done
 * Kept for backward compatibility with old data only
 *
 * Original purpose: Calculate and display archetype after scout + vibe
 * Required: scout and vibe completion
 * Returned: archetype scores and radar chart data
 */
/* DEPRECATED - Commenting out unused route
router.get('/onboarding/reveal', requireRole('TALENT'), async (req, res, next) => {
  try {
    const profile = await knex('profiles')
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
        message: 'Please complete entry step first'
      });
    }

    // Check if both scout and vibe are complete
    const state = getState(profile);
    if (!canComplete(state)) {
      return res.status(403).json({
        error: 'Prerequisites not met',
        message: 'Please complete both photo upload and questions before viewing your archetype',
        completed_steps: state.completed_steps,
        required_steps: ['scout', 'vibe']
      });
    }

    // Get signals record
    const signals = await SignalCollector.getSignalsByProfileId(profile.id);

    if (!signals) {
      return res.status(404).json({
        error: 'Signals not found',
        message: 'Could not find your casting call data'
      });
    }

    // Calculate archetype (if not already calculated)
    let archetype;
    if (signals.archetype_label) {
      // Already calculated - return stored results
      archetype = {
        commercial: parseFloat(signals.archetype_commercial_pct),
        editorial: parseFloat(signals.archetype_editorial_pct),
        lifestyle: parseFloat(signals.archetype_lifestyle_pct),
        label: signals.archetype_label
      };
    } else {
      // Calculate now
      archetype = await SignalCollector.calculateArchetype(signals.id);
    }

    // Transition state to reveal
    const updatePayload = transitionTo(state, 'reveal', {
      archetype_calculated: true
    }, knex);

    await knex('profiles')
      .where({ id: profile.id })
      .update(updatePayload);

    // Prepare radar chart data
    const radarData = {
      labels: ['Commercial', 'Editorial', 'Lifestyle'],
      datasets: [{
        label: 'Your Archetype',
        data: [archetype.commercial, archetype.editorial, archetype.lifestyle]
      }]
    };

    // Track reveal view
    await OnboardingAnalytics.trackCompletion(profile.id, 'reveal', null, {
      archetype_label: archetype.label
    });

    return res.json({
      success: true,
      archetype: {
        label: archetype.label,
        commercial_pct: archetype.commercial,
        editorial_pct: archetype.editorial,
        lifestyle_pct: archetype.lifestyle,
        breakdown: archetype.breakdown || null
      },
      radar_data: radarData,
      message: 'Your model archetype has been calculated'
    });

  } catch (error) {
    console.error('[Casting Reveal] Error:', error);
    return next(error);
  }
});
*/

/**
 * GET /onboarding/status
 * Status Polling: Get current onboarding state
 *
 * Returns current step, completed steps, and available next steps
 */
router.get(
  ["/onboarding/status", "/casting/status"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "No profile found for this user",
        });
      }

      const state = getState(profile);

      return res.json({
        success: true,
        profile: {
          first_name: profile.first_name || null,
        },
        state: {
          current_step: state.current_step,
          completed_steps: state.completed_steps,
          can_complete: canComplete(state),
          next_steps: getNextSteps(state),
          version: state.version || "v2_onboarding",
          started_at: state.started_at || null,
          predictions: state.predictions || null,
        },
      });
    } catch (error) {
      console.error("[Casting Status] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/measurements
 * Confirm or adjust AI-predicted measurements
 *
 * Allows user to confirm or edit Scout's predictions
 */
router.post(
  ["/onboarding/measurements", "/casting/measurements"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        console.warn(
          "[Casting Measurements] Profile not found for user:",
          req.session.userId,
        );
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      console.log("[Casting Measurements] Request Body:", req.body);

      const { height_cm, weight_kg, bust_cm, waist_cm, hips_cm } = req.body;

      // REMOVED: Strict range validation logic to allow outlier inputs (e.g., child models)
      // Frontend validation is sufficient for UX guidance. Backend should accept reasonable numbers.

      console.log("[Casting Measurements] Updating profile measurements...");

      // Transition state
      const state = getState(profile);
      const updatePayload = transitionTo(
        state,
        "profile",
        {
          measurements_confirmed: true,
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Confirm measurements when measurements is the current onboarding step.",
        );
      }

      // Merge measurement values into the same update payload
      // Ensure unexpected nulls/undefined doesn't override existing data with null unless intended
      // But for this flow, user input is authoritative for the session.
      const finalUpdate = {
        ...updatePayload,
        height_cm: height_cm ? Math.round(height_cm) : null,
        weight_kg: weight_kg ? Math.round(weight_kg) : null,
        bust_cm: bust_cm ? Math.round(bust_cm) : null,
        waist_cm: waist_cm ? Math.round(waist_cm) : null,
        hips_cm: hips_cm ? Math.round(hips_cm) : null,
        updated_at: knex.fn.now(),
      };

      console.log("[Casting Measurements] Updating profile...", finalUpdate);

      await knex("profiles").where({ id: profile.id }).update(finalUpdate);

      return res.json({
        success: true,
        next_step: "profile",
        message: "Measurements confirmed successfully",
      });
    } catch (error) {
      console.error("[Casting Measurements] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/profile
 * Collect location and experience level
 *
 * Final profile details before completion
 */
router.post(
  ["/onboarding/profile", "/casting/profile"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      const { city, gender, experience_level } = req.body;

      console.log("[Casting Profile] User:", req.session.userId);
      console.log("[Casting Profile] Request Body:", {
        city,
        gender,
        experience_level,
      });
      console.log("[Casting Profile] Profile ID:", profile.id);

      // Relaxed Validation: Allow any gender string (e.g. custom input)
      // if (gender && !validGenders.includes(gender.toLowerCase())) { ... }

      // Relaxed Validation: Allow any string to match Dashboard behavior
      // This allows "Emerging", "Established" etc without failing
      // if (experience_level && !validLevels.includes(experience_level)) { ... }

      const state = getState(profile);
      const updatePayload = transitionTo(
        state,
        "done",
        {
          profile_completed: true,
          completed_at: new Date().toISOString(),
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Finish measurements and reach the profile step before completing onboarding.",
        );
      }

      updatePayload.city = city || "Not specified";
      updatePayload.gender = gender
        ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()
        : null;
      updatePayload.experience_level = experience_level || "beginner";
      updatePayload.onboarding_completed_at = knex.fn.now();

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      await updateProfileCompleteness(profile.id);

      console.log("[Casting Profile] Profile updated and onboarding completed");

      return res.json({
        success: true,
        next_step: "done",
        message: "Profile completed successfully",
      });
    } catch (error) {
      console.error("[Casting Profile] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/reveal-complete
 * Mark reveal screen as viewed and generate AI archetype.
 *
 * Runs the 2-step Groq casting pipeline (Scout → Director) using the
 * profile's primary photo and confirmed stats, then persists scores.
 * The AI call is best-effort: completion succeeds even if AI fails.
 */
router.post(
  "/onboarding/reveal-complete",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      // Guard against using reveal-complete as a completion shortcut.
      // The canonical completion path is /onboarding/profile (or /onboarding/complete)
      // which must set onboarding_completed_at first.
      if (!profile.onboarding_completed_at) {
        const state = getState(profile);
        return res.status(403).json({
          error: "Prerequisites not met",
          message:
            "Complete the profile step before marking reveal as complete.",
          current_step: state.current_step,
          completed_steps: state.completed_steps || [],
        });
      }

      // Transition state to 'done' and mark reveal viewed
      const state = getState(profile);
      const updatePayload = transitionTo(
        state,
        "done",
        {
          reveal_viewed: true,
          reveal_viewed_at: new Date().toISOString(),
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Reveal completion is only valid once the prior onboarding steps are complete.",
        );
      }

      updatePayload.onboarding_completed_at = knex.fn.now();

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      console.log("[Casting Reveal Complete] State → done");

      // ── AI Archetype Pipeline (best-effort) ────────────────────────────────
      let archetypeResult = null;

      const primaryImage = await knex("images")
        .where({ profile_id: profile.id, is_primary: true })
        .first();
      const primaryKey = primaryImage
        ? primaryImage.storage_key ||
          (primaryImage.path ? primaryImage.path.replace(/^\//, "") : null)
        : null;

      if (primaryKey) {
        try {
          // Calculate age from date_of_birth if available
          const age = profile.date_of_birth
            ? Math.floor(
                (Date.now() - new Date(profile.date_of_birth).getTime()) /
                  (365.25 * 24 * 60 * 60 * 1000),
              )
            : null;

          const stats = {
            height_cm: profile.height_cm || null,
            gender: profile.gender || null,
            age,
          };

          archetypeResult = await generateArchetype(
            knex,
            profile.id,
            primaryKey,
            stats,
          );

          console.log(
            "[Casting Reveal Complete] AI archetype:",
            archetypeResult.primary_archetype,
            archetypeResult.scores,
          );

          // Persist scores to profile fit_score_* columns
          const clamp = (v) =>
            Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
          await knex("profiles")
            .where({ id: profile.id })
            .update({
              fit_score_runway: clamp(archetypeResult.scores.runway),
              fit_score_editorial: clamp(archetypeResult.scores.editorial),
              fit_score_commercial: clamp(archetypeResult.scores.commercial),
              fit_score_lifestyle: clamp(archetypeResult.scores.lifestyle),
              fit_score_overall: clamp(
                (archetypeResult.scores.runway +
                  archetypeResult.scores.editorial +
                  archetypeResult.scores.commercial +
                  archetypeResult.scores.lifestyle) /
                  4,
              ),
              fit_scores_calculated_at: knex.fn.now(),
              updated_at: knex.fn.now(),
            });

          // Persist raw AI output + new columns to onboarding_signals
          const isPostgres =
            knex.client.config.client === "pg" ||
            knex.client.config.client === "postgresql";
          const aiResultsValue = isPostgres
            ? archetypeResult
            : JSON.stringify(archetypeResult);

          await knex("onboarding_signals")
            .where({ profile_id: profile.id })
            .update({
              ai_results: aiResultsValue,
              archetype_runway_pct: clamp(archetypeResult.scores.runway),
              archetype_commercial_pct: clamp(
                archetypeResult.scores.commercial,
              ),
              archetype_editorial_pct: clamp(archetypeResult.scores.editorial),
              archetype_lifestyle_pct: clamp(archetypeResult.scores.lifestyle),
              archetype_label: archetypeResult.primary_archetype,
              casting_verdict: archetypeResult.verdict,
              updated_at: knex.fn.now(),
            });
        } catch (aiErr) {
          console.warn(
            "[Casting Reveal Complete] AI pipeline failed (non-blocking):",
            aiErr.message,
          );
        }
      } else {
        console.warn(
          "[Casting Reveal Complete] No primary image found — skipping AI pipeline",
        );
      }
      // ── End AI Pipeline ────────────────────────────────────────────────────

      await updateProfileCompleteness(profile.id);

      return res.json({
        success: true,
        next_step: "complete",
        message: "Reveal completed successfully",
        ...(archetypeResult && {
          archetype: {
            primary: archetypeResult.primary_archetype,
            verdict: archetypeResult.verdict,
            scores: archetypeResult.scores,
          },
        }),
      });
    } catch (error) {
      console.error("[Casting Reveal Complete] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/complete
 * Mark onboarding as complete
 *
 * Transitions state to 'done' and sets onboarding_completed_at
 * This allows users to access the dashboard after completing the casting call
 */
router.post(
  ["/onboarding/complete", "/casting/complete"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      // Check if both scout and vibe are complete
      const state = getState(profile);
      if (!canComplete(state)) {
        return res.status(403).json({
          error: "Prerequisites not met",
          message:
            "Please complete all steps (Photo, Measurements, Profile) before marking as complete",
          completed_steps: state.completed_steps,
          required_steps: ["scout", "measurements", "profile"],
        });
      }

      // Transition state to 'done'
      const updatePayload = transitionTo(
        state,
        "done",
        {
          completed_at: new Date().toISOString(),
        },
        knex,
      );

      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Cannot mark onboarding complete from the current step.",
        );
      }

      // Add onboarding_completed_at timestamp (for middleware compatibility)
      updatePayload.onboarding_completed_at = knex.fn.now();

      // Ensure "essentials" are set to satisfy dashboard gating
      // We set defaults if they were missed in Scout analysis
      if (!profile.gender) updatePayload.gender = "Prefer not to say";
      if (!profile.first_name) updatePayload.first_name = "New";
      // Ensure last_name is null if not provided, not 'Talent'
      if (!profile.last_name && !updatePayload.last_name) {
        updatePayload.last_name = null;
      }

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      await updateProfileCompleteness(profile.id);

      // Track completion
      await OnboardingAnalytics.trackCompletion(profile.id, "done", null, {
        flow_version: "v2_casting_call",
      });

      return res.json({
        success: true,
        message: "Casting call completed successfully",
        redirect_url: "/dashboard/talent",
      });
    } catch (error) {
      console.error("[Casting Complete] Error:", error);
      return next(error);
    }
  },
);

/**
 * Helper: Infer build from AI predictions
 * @param {Object} predictions - AI predictions object
 * @returns {string} Build type: athletic, slender, curvy, average
 */
function inferBuildFromPredictions(predictions) {
  if (!predictions) return "average";

  const { bust, waist, hips } = predictions;

  // If we have measurements, infer build
  if (bust && waist && hips) {
    const bustWaistRatio = bust / waist;
    const hipWaistRatio = hips / waist;

    // Curvy: pronounced curves (high ratios)
    if (bustWaistRatio >= 1.3 && hipWaistRatio >= 1.3) {
      return "curvy";
    }

    // Slender: minimal curves (low ratios)
    if (bustWaistRatio <= 1.15 && hipWaistRatio <= 1.15) {
      return "slender";
    }

    // Athletic: moderate curves with more rectangular shape
    if (bustWaistRatio >= 1.15 && bustWaistRatio <= 1.25) {
      return "athletic";
    }
  }

  // Default
  return "average";
}

module.exports = router;
