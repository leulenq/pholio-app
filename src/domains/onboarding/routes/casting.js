/**
 * Casting Call Routes — talent onboarding API
 *
 * Flow: entry → birthdate → gender → scout → measurements → profile → done
 * (birthdate before gender: COPPA age-gate precedes further personal data)
 *
 * Endpoints:
 * - POST /onboarding/entry        - Auth (OAuth or manual) + profile bootstrap
 * - POST /onboarding/birthdate    - DOB (13+ floor), advances to gender
 * - POST /onboarding/gender       - Gender, advances to scout
 * - POST /onboarding/scout        - Digitals upload (shot_type: headshot|full_body)
 * - POST /onboarding/scout/confirm- Confirm primary, advances to measurements
 * - POST /onboarding/measurements - Height (+ optional gender-branched stats);
 *                                   fires the archetype pipeline fire-and-forget
 * - POST /onboarding/profile      - Lanes + city (skippable), completes onboarding
 * - POST /onboarding/reveal-complete / /onboarding/complete - finalization
 * - GET  /onboarding/status       - State polling / resume
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// Dependencies
const knex = require("../../../shared/db/knex");
const { saveProfileSocialFields } = require("../../../shared/lib/social-helpers");
const {
  requireAuth,
  requireRole,
} = require("../../auth/middleware/require-auth");
const { addMessage } = require("../../../shared/middleware/context");
const { upload, processImage } = require("../../../shared/lib/uploader");
// Deprecated: const { analyzePhoto } = require('../../ai/photo-analysis');
const { generateArchetype } = require("../../ai/groq-casting");
const SignalCollector = require("../services/signal-collector");
const {
  getState,
  transitionTo,
  canComplete,
  getNextSteps,
  initialState,
} = require("../services/state-machine");
const {
  parseDateOfBirthParts,
  computeAge,
  canCollectSensitiveProfileFields,
} = require("../../../shared/lib/talent-age");
const { verifyGoogleToken } = require("../services/providers/google");
const { normalizeOAuthUser } = require("../services/providers/oauth-user");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { recordLegalAcceptance } = require("../../../shared/lib/legal-acceptance");
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

// Intake lane shortcut (canonical labels). The dashboard's full modeling
// taxonomy remains the real home; these three are just the onboarding subset.
const ONBOARDING_MODELING_CATEGORIES = ["Editorial", "Commercial", "Runway"];

/**
 * Normalize an incoming modeling_categories payload to the valid onboarding
 * subset. Returns null when the value is not an array (caller leaves the column
 * untouched); returns an ordered, de-duplicated array (possibly empty) otherwise.
 */
function normalizeOnboardingModelingCategories(raw) {
  if (!Array.isArray(raw)) return null;
  const canonicalByLower = new Map(
    ONBOARDING_MODELING_CATEGORIES.map((label) => [label.toLowerCase(), label]),
  );
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const canonical = canonicalByLower.get(item.trim().toLowerCase());
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

/**
 * AI archetype pipeline (best-effort). Consumes {height_cm, gender, age}, which
 * is why it runs at the measurements step where height first exists (moved from
 * reveal-complete). Finds the profile's primary image, runs the Groq casting
 * pipeline, and persists fit_score_* + onboarding_signals. No-op when there is no
 * primary image. Callers invoke it fire-and-forget with a `.catch` for logging;
 * it must never block the response path.
 *
 * @param {import("knex")} knex
 * @param {Object} profile - Profile row (must carry id, height_cm, gender, date_of_birth)
 */
async function runArchetypePipeline(knex, profile) {
  const primaryImage = await knex("images")
    .where({ profile_id: profile.id, is_primary: true })
    .first();
  const primaryKey = primaryImage
    ? primaryImage.storage_key ||
      (primaryImage.path ? primaryImage.path.replace(/^\//, "") : null)
    : null;

  if (!primaryKey) {
    console.warn(
      "[Archetype Pipeline] No primary image — skipping:",
      profile.id,
    );
    return null;
  }

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

  const archetypeResult = await generateArchetype(
    knex,
    profile.id,
    primaryKey,
    stats,
  );

  const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

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
      archetype_commercial_pct: clamp(archetypeResult.scores.commercial),
      archetype_editorial_pct: clamp(archetypeResult.scores.editorial),
      archetype_lifestyle_pct: clamp(archetypeResult.scores.lifestyle),
      archetype_label: archetypeResult.primary_archetype,
      casting_verdict: archetypeResult.verdict,
      updated_at: knex.fn.now(),
    });

  console.log(
    "[Archetype Pipeline] Persisted archetype:",
    profile.id,
    archetypeResult.primary_archetype,
  );

  return archetypeResult;
}

/**
 * POST /onboarding/entry
 * Smart Entry: OAuth authentication OR manual signup
 *
 * Creates or retrieves user/profile and initializes casting call state
 */
router.post(["/onboarding/entry", "/casting/entry"], async (req, res, next) => {
  try {
    const {
      firebase_token,
      manual_signup,
      name,
      email,
      password,
      terms_accepted,
      privacy_accepted,
    } = req.body;
    const termsAccepted = terms_accepted === true;
    const privacyAccepted = privacy_accepted === true;

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

      const providerUser = normalizeOAuthUser(decodedToken);

      if (!providerUser || !providerUser.uid) {
        return res.status(401).json({
          error: "Authentication failed",
          message: "Invalid token data",
        });
      }

      const normalizedEmail = providerUser.email
        ? providerUser.email.toLowerCase().trim()
        : `instagram_${providerUser.uid.replace(":", "_")}@pholio.me`;

      let userQuery = knex("users").where({ firebase_uid: providerUser.uid });
      if (providerUser.email) {
        userQuery = userQuery.orWhere({
          email: providerUser.email.toLowerCase().trim(),
        });
      }
      user = await userQuery.first();

      // Create user if doesn't exist
      if (!user) {
        if (!termsAccepted) {
          return res.status(400).json({
            error: "Terms acceptance required",
            message: "You must accept the Terms of Service to create an account",
          });
        }

        const userId = uuidv4();
        await knex.transaction(async (trx) => {
          await trx("users").insert({
            id: userId,
            email: normalizedEmail,
            firebase_uid: providerUser.uid,
            role: "TALENT",
            created_at: knex.fn.now(),
          });
          await recordLegalAcceptance(trx, userId, {
            terms: true,
            privacy: privacyAccepted,
          });
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
          city: "Not specified", // NOT NULL column; sentinel filtered to null at the API edge
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

        if (providerUser.instagram_handle) {
          await saveProfileSocialFields(profileId, {
            instagram_handle: providerUser.instagram_handle
          });
        }

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

      await SignalCollector.collectEntrySignals(profile.id, {
        oauth_provider: providerUser.oauth_provider || "google",
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

      if (!termsAccepted) {
        return res.status(400).json({
          error: "Terms acceptance required",
          message: "You must accept the Terms of Service to create an account",
        });
      }

      // Create user
      const userId = uuidv4();
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash(password, 10);

      await knex.transaction(async (trx) => {
        await trx("users").insert({
          id: userId,
          email,
          password_hash: hashedPassword,
          role: "TALENT",
          created_at: knex.fn.now(),
        });
        await recordLegalAcceptance(trx, userId, {
          terms: true,
          privacy: privacyAccepted,
        });
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
        city: "Not specified", // NOT NULL column; sentinel filtered to null at the API edge
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

    // Transition state to the first intake step. Birthdate runs before gender
    // (COPPA hygiene) — the age screen gates before any further personal data.
    const state = getState(profile);

    if (state.current_step === "entry" || state.completed_steps.length === 0) {
      const updatePayload = transitionTo(
        state,
        "birthdate",
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
      next_step: "birthdate",
      message: manual_signup
        ? "Account created."
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
          next_step: "birthdate",
          message: "Email already verified",
        });
      }

      if (
        user.verification_code !== code ||
        new Date() > new Date(user.verification_code_expires_at)
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
        "birthdate",
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
        next_step: "birthdate",
        message: "Email verified successfully",
      });
    } catch (error) {
      console.error("[Verify Email] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/gender
 * Persist the talent's gender and advance the state machine to "scout".
 *
 * New order runs birthdate before gender, so gender advances gender → scout.
 * This is the server counterpart to the client gender step. Without it the
 * server stays parked at "gender" while the client moves on, and the later
 * scout → measurements transition is rejected as out of sequence. Gender is
 * also the one essential we would otherwise lose on a mid-flow reload, since
 * it was previously only persisted at the very end (/profile).
 *
 * Idempotent: gender is always saved; the step only advances when the user is
 * actually on the gender step, so re-submits or out-of-order calls don't 403.
 */
router.post(
  ["/onboarding/gender", "/casting/gender"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { gender } = req.body;

      if (!gender || !String(gender).trim()) {
        return res.status(400).json({
          error: "Gender required",
          message: "Please select how you identify before continuing.",
        });
      }

      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      // Preserve multi-word labels (e.g. "Non-Binary", "Prefer not to say")
      const normalizedGender = String(gender).trim();

      const state = getState(profile);

      // Only drive the state machine forward when we're on the gender step.
      // Otherwise just persist the value so the call stays idempotent.
      let updatePayload = {
        gender: normalizedGender,
        updated_at: knex.fn.now(),
      };

      // New order is birthdate → gender → scout. A legacy in-flight profile
      // parked at "gender" under the OLD order has no DOB yet — send it to
      // birthdate instead of scout, or scout would 403 on DOB_REQUIRED with no
      // way back.
      const genderNextStep = profile.date_of_birth ? "scout" : "birthdate";

      if (state.current_step === "gender") {
        const transition = transitionTo(
          state,
          genderNextStep,
          { gender: normalizedGender },
          knex,
        );

        if (!transition) {
          return invalidOnboardingSequence(
            res,
            state,
            "Select your gender when the gender step is active.",
          );
        }

        updatePayload = { ...transition, gender: normalizedGender };
      }

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      return res.json({
        success: true,
        next_step: genderNextStep,
        message: "Gender saved",
      });
    } catch (error) {
      console.error("[Casting Gender] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/birthdate
 * Persist the talent's date of birth and advance the state machine to "gender".
 *
 * Birthdate now runs before gender (COPPA hygiene: age-gate before collecting
 * more personal data). Validates: YYYY-MM-DD format, not in the future, minimum
 * age 13 (COPPA floor). Idempotent: date_of_birth is always saved; the step only
 * advances when the profile is actually on the birthdate step, so re-submits stay
 * safe.
 */
router.post(
  ["/onboarding/birthdate", "/casting/birthdate"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { date_of_birth } = req.body;

      if (!date_of_birth || !String(date_of_birth).trim()) {
        return res.status(400).json({
          error: "DOB_REQUIRED",
          message: "Date of birth is required.",
        });
      }

      const dobStr = String(date_of_birth).trim();

      const parts = parseDateOfBirthParts(dobStr);
      if (!parts) {
        return res.status(400).json({
          error: "DOB_INVALID",
          message: "Please provide a valid date in YYYY-MM-DD format.",
        });
      }

      // Must not be in the future
      const dobDate = new Date(`${dobStr}T00:00:00.000Z`);
      if (dobDate > new Date()) {
        return res.status(400).json({
          error: "DOB_FUTURE",
          message: "Date of birth cannot be in the future.",
        });
      }

      // COPPA minimum age: 13
      const age = computeAge(dobStr);
      if (age === null || age < 13) {
        return res.status(400).json({
          error: "DOB_TOO_YOUNG",
          message: "You must be at least 13 years old to create an account.",
        });
      }

      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      const state = getState(profile);

      // Only advance the state machine when on the birthdate step.
      // Otherwise just persist the value idempotently.
      let updatePayload = {
        date_of_birth: dobStr,
        updated_at: knex.fn.now(),
      };

      // A legacy in-flight profile parked at "birthdate" under the OLD order
      // (gender → birthdate) already answered gender — skip straight to scout
      // so nothing is asked twice.
      const birthdateNextStep = profile.gender ? "scout" : "gender";

      if (state.current_step === "birthdate") {
        const transition = transitionTo(
          state,
          birthdateNextStep,
          { date_of_birth: dobStr, age },
          knex,
        );

        if (!transition) {
          return invalidOnboardingSequence(
            res,
            state,
            "Submit your date of birth when the birthdate step is active.",
          );
        }

        updatePayload = { ...transition, date_of_birth: dobStr };
      }

      await knex("profiles").where({ id: profile.id }).update(updatePayload);

      return res.json({
        success: true,
        next_step: birthdateNextStep,
        message: "Date of birth saved",
      });
    } catch (error) {
      console.error("[Casting Birthdate] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/scout
 * Visual Interview: labeled photo upload (headshot / full_body).
 *
 * Multipart body: `digi` (file) + `shot_type` ('headshot' | 'full_body').
 * The headshot is the casting photo and becomes/stays primary; a full-body
 * upload is stored but never steals primary.
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

      if (!profile.date_of_birth) {
        return res.status(403).json({
          error: "DOB_REQUIRED",
          message: "Please enter your date of birth before uploading photos.",
        });
      }

      // Check if file uploaded
      if (!req.file) {
        return res.status(400).json({
          error: "Photo required",
          message: "Please upload a headshot photo (digi)",
        });
      }

      // shot_type is required and constrained to the two labeled slots.
      const shotType =
        typeof req.body?.shot_type === "string"
          ? req.body.shot_type.trim().toLowerCase()
          : "";
      if (shotType !== "headshot" && shotType !== "full_body") {
        return res.status(400).json({
          error: "INVALID_SHOT_TYPE",
          message: "shot_type must be 'headshot' or 'full_body'.",
        });
      }

      // Process image (converts to WebP, optimizes)
      const { storageKey, publicUrl, absolutePath } = await processImage(
        req.file,
        profile.id,
      );
      const { v4: uuidv4 } = require("uuid");
      const imageId = uuidv4();

      // Headshots are the casting photo: they become/stay primary (demoting any
      // seeded Google avatar). A full-body upload is stored but never steals
      // primary.
      const isPrimary = shotType === "headshot";

      // Demote any existing primary (e.g. the seeded Google avatar) BEFORE
      // inserting the new one. The `one_primary_per_profile` constraint forbids
      // two primaries existing simultaneously, so the order matters.
      if (isPrimary) {
        await knex("images")
          .where({ profile_id: profile.id })
          .update({ is_primary: false });
      }

      // Save image to the images table
      await knex("images").insert({
        id: imageId,
        profile_id: profile.id,
        path: publicUrl, // Save public URL to be consistent with Media API
        absolute_path: absolutePath, // Reliable path to the optimized webp image
        is_primary: isPrimary,
        label: "Scout photo",
        image_type: "digital",
        shot_type: shotType,
        created_at: knex.fn.now(),
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
 * The user taps "Continue" — advances scout → measurements.
 *
 * AI body-stat estimation has been removed from intake; the archetype pipeline
 * now runs at the measurements step (where height first exists). This route just
 * confirms the chosen primary photo and stores its resume metadata.
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
      let primaryImage = await knex("images")
        .where({ profile_id: profile.id, is_primary: true })
        .first();

      // Defense-in-depth: if the primary is a remote seed with no file on disk
      // (e.g. a Google avatar), fall back to the most recent local upload so the
      // resume photo_url points at the real casting photo.
      if (primaryImage && !primaryImage.absolute_path) {
        const localImage = await knex("images")
          .where({ profile_id: profile.id })
          .whereNotNull("absolute_path")
          .orderBy("created_at", "desc")
          .first();
        if (localImage) primaryImage = localImage;
      }

      if (!primaryImage) {
        return res.status(400).json({ error: "No primary image set" });
      }

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
        ai_success: true,
      });

      return res.json({
        success: true,
        redirect: "/onboarding/measurements",
        photo_url: primaryImage.path,
        can_complete: canComplete(updatedState),
        next_steps: getNextSteps(updatedState),
        message: "Scout confirmed",
      });
    } catch (error) {
      console.error("[Casting Scout] Confirm Error:", error);
      return next(error);
    }
  },
);

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
        // Persisted profile values so the client can rehydrate collected answers
        // after a mid-flow reload instead of resuming with empty local state.
        profile: {
          first_name: profile.first_name || null,
          gender: profile.gender || null,
          // DOB + guardian consent drive the client's minor gate on resume —
          // without them a mid-flow reload fails closed and shows adults the
          // height-only path.
          date_of_birth: profile.date_of_birth || null,
          guardian_consent_at: profile.guardian_consent_at || null,
          city:
            profile.city && profile.city !== "Not specified"
              ? profile.city
              : null,
          height_cm: profile.height_cm || null,
          bust_cm: profile.bust_cm || null,
          waist_cm: profile.waist_cm || null,
          hips_cm: profile.hips_cm || null,
          chest_cm: profile.chest_cm || null,
          inseam_cm: profile.inseam_cm || null,
        },
        state: {
          current_step: state.current_step,
          completed_steps: state.completed_steps,
          can_complete: canComplete(state),
          next_steps: getNextSteps(state),
          version: state.version || "v2_onboarding",
          started_at: state.started_at || null,
          step_data: state.step_data || {},
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

      // Never log req.body here — it carries body measurements (sensitive data).
      // weight_kg is intentionally NOT accepted: weight is not a standard
      // submission stat and was removed from intake.
      const { height_cm, bust_cm, waist_cm, hips_cm, chest_cm, inseam_cm } =
        req.body;

      // Body measurements (bust/chest/waist/hips/inseam) are sensitive fields:
      // minors without recorded guardian consent — and profiles with no
      // verifiable DOB — may only store height. Same fail-closed policy as the
      // profile routes.
      const allowSensitive = canCollectSensitiveProfileFields(profile);

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

      // Only write fields the client actually sent — an absent field must never
      // null out a previously saved value (stats are optional/skippable now, and
      // the set differs by gender: bust/waist/hips vs chest/waist/inseam).
      const asRoundedNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      };

      const finalUpdate = {
        ...updatePayload,
        updated_at: knex.fn.now(),
      };

      const height = asRoundedNumber(height_cm);
      if (height !== null) finalUpdate.height_cm = height;

      if (allowSensitive) {
        const sensitiveFields = {
          bust_cm,
          waist_cm,
          hips_cm,
          chest_cm,
          inseam_cm,
        };
        for (const [column, raw] of Object.entries(sensitiveFields)) {
          const value = asRoundedNumber(raw);
          if (value !== null) finalUpdate[column] = value;
        }
      }

      await knex("profiles").where({ id: profile.id }).update(finalUpdate);

      // Archetype pipeline fires here (not reveal-complete): this is the first
      // moment height + gender + DOB all exist, and it leads the reveal by the
      // details screen plus the finishing beat. Fire-and-forget by design.
      runArchetypePipeline(knex, {
        ...profile,
        height_cm: height !== null ? height : profile.height_cm,
      }).catch((err) =>
        console.warn(
          "[Casting Measurements] Archetype pipeline failed (non-blocking):",
          err.message,
        ),
      );

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

      // gender and experience_level are intentionally NOT read here: gender is
      // owned by /onboarding/gender (this route used to re-persist it with
      // broken casing and null-wipe it when absent), and experience level was
      // removed from intake (dashboard-owned, no default write).
      const { city, modeling_categories } = req.body;

      console.log("[Casting Profile] User:", req.session.userId);
      console.log("[Casting Profile] Profile ID:", profile.id);

      // Gate: DOB must be on file before we allow onboarding completion.
      if (!profile.date_of_birth || !parseDateOfBirthParts(profile.date_of_birth)) {
        return res.status(400).json({
          error: "DOB_REQUIRED",
          message: "Date of birth is required to complete your profile. Please go back and enter your birthdate.",
        });
      }

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

      // City is skippable — only write a real value; a skip/clear stores the
      // "Not specified" sentinel (the column is NOT NULL; the API edge filters
      // the sentinel back to null).
      if (city !== undefined) {
        const normalizedCity = typeof city === "string" ? city.trim() : "";
        updatePayload.city =
          normalizedCity && normalizedCity.toLowerCase() !== "not specified"
            ? normalizedCity
            : "Not specified";
      }

      // Intake lanes shortcut. null = field not sent (leave column untouched);
      // [] = explicit "Not sure yet" (stored as an empty set — a first-class
      // answer, not missing data). Stored JSON-stringified per profile-route
      // convention.
      const normalizedLanes =
        normalizeOnboardingModelingCategories(modeling_categories);
      if (normalizedLanes !== null) {
        updatePayload.modeling_categories = JSON.stringify(normalizedLanes);
      }

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
 * Mark the reveal as viewed: state transition + timestamps only.
 *
 * The AI archetype pipeline no longer runs here — it fires fire-and-forget at
 * the measurements step (see runArchetypePipeline), the first moment height +
 * gender + DOB all exist, so its result can be ready by reveal time.
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

      await updateProfileCompleteness(profile.id);

      return res.json({
        success: true,
        next_step: "complete",
        message: "Reveal completed successfully",
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

module.exports = router;
