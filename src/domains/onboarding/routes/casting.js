/**
 * Casting Call Routes — talent onboarding API
 *
 * Flow: pre-auth adult DOB evidence → entry → gender → scout → measurements → profile → done
 *
 * Endpoints:
 * - POST /onboarding/entry        - Adult DOB evidence + auth + profile bootstrap
 * - POST /onboarding/birthdate    - Legacy adult-resume DOB confirmation only
 * - POST /onboarding/gender       - Gender, advances to scout
 * - POST /onboarding/scout        - Digitals upload (shot_type: headshot|full_body)
 * - POST /onboarding/scout/confirm- Confirm primary, advances to measurements
 * - POST /onboarding/measurements - Height (+ optional gender-branched stats)
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
const { syncProviderAccountAvatar } = require("../../../shared/lib/account-avatar");
const {
  requireAuth,
  requireRole,
  requireActiveAccount,
} = require("../../auth/middleware/require-auth");
const { findUserByFirebaseIdentity } = require("../../auth/services/account-matching");
const { addMessage } = require("../../../shared/middleware/context");
const { upload, processImage } = require("../../../shared/lib/uploader");
// Deprecated: const { analyzePhoto } = require('../../ai/photo-analysis');
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
  canCollectSensitiveProfileFields,
} = require("../../../shared/lib/talent-age");
const {
  MODERATION_STATUS,
  MODERATION_QUEUE_STATUS,
  analyzeImageBuffer,
} = require("../../../shared/lib/content-moderation");
const {
  screenImageForCsam,
  recordCsamEscalation,
} = require("../../../shared/lib/csam-moderation");
const {
  purgeStoredImageArtifacts,
} = require("../../../shared/lib/purge-image-artifacts");
const { verifyGoogleToken } = require("../services/providers/google");
const {
  sendVerificationEmailViaSmtp,
} = require("../../auth/services/email-verification");
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

const LAUNCH_TIME_ZONE = "America/New_York";

function launchCalendarParts(date = new Date()) {
  const values = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: LAUNCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).forEach(({ type, value }) => {
    if (type !== "literal") values[type] = Number(value);
  });
  return { year: values.year, month: values.month, day: values.day };
}

function computeLaunchAge(dob, referenceDate = new Date()) {
  const birth = parseDateOfBirthParts(dob);
  if (!birth) return null;
  const today = launchCalendarParts(referenceDate);
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

function canonicalDateOfBirth(value, { requireDateOnly = false } = {}) {
  if (value == null || !String(value).trim()) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  if (requireDateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const parts = parseDateOfBirthParts(raw);
  if (!parts) return null;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }

  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function adultEligibilityResult(dateOfBirth, { requireDateOnly = false } = {}) {
  if (dateOfBirth == null || !String(dateOfBirth).trim()) {
    return {
      ok: false,
      status: 400,
      error: "DOB_REQUIRED",
      message: "Date of birth is required before account creation.",
    };
  }

  const dob = canonicalDateOfBirth(dateOfBirth, { requireDateOnly });
  if (!dob) {
    return {
      ok: false,
      status: 400,
      error: "DOB_INVALID",
      message: "Please provide a valid date in YYYY-MM-DD format.",
    };
  }

  const birth = parseDateOfBirthParts(dob);
  const today = launchCalendarParts();
  if (
    birth.year > today.year ||
    (birth.year === today.year && birth.month > today.month) ||
    (birth.year === today.year && birth.month === today.month && birth.day > today.day)
  ) {
    return {
      ok: false,
      status: 400,
      error: "DOB_FUTURE",
      message: "Date of birth cannot be in the future.",
    };
  }

  const age = computeLaunchAge(dob);
  if (age === null) {
    return {
      ok: false,
      status: 400,
      error: "DOB_INVALID",
      message: "Please provide a valid date in YYYY-MM-DD format.",
    };
  }
  if (age < 18) {
    return {
      ok: false,
      status: 403,
      error: "ADULT_ELIGIBILITY_REQUIRED",
      message:
        "Pholio’s current launch is for adults 18 and over. We aren’t able to create an account right now.",
    };
  }

  return { ok: true, dob, age };
}

function rejectEligibility(res, result) {
  return res.status(result.status).json({
    error: result.error,
    message: result.message,
  });
}

async function requireAdultLaunchEligibility(req, res, next) {
  // This router is mounted at `/`. Only enforce on casting/onboarding traffic,
  // and never against agency (or other non-talent) sessions — those have no
  // talent profile/DOB and must fall through to their own domain routers.
  const path = req.path || "";
  if (!path.startsWith("/onboarding") && !path.startsWith("/casting")) {
    return next();
  }
  if (!req.session?.userId) return next();
  if (req.session.role && req.session.role !== "TALENT") return next();

  try {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();
    if (!profile) {
      return rejectEligibility(res, adultEligibilityResult(null));
    }

    const eligibility = adultEligibilityResult(profile.date_of_birth);
    if (!eligibility.ok) return rejectEligibility(res, eligibility);
    return next();
  } catch (error) {
    return next(error);
  }
}

function onlyCastingPaths(middleware) {
  return function castingPathGate(req, res, next) {
    const path = req.path || "";
    if (!path.startsWith("/onboarding") && !path.startsWith("/casting")) {
      return next();
    }
    return middleware(req, res, next);
  };
}

// Intake lane shortcut (canonical labels). The dashboard's full modeling
// taxonomy remains the real home; these three are just the onboarding subset.
const ONBOARDING_MODELING_CATEGORIES = ["Editorial", "Commercial", "Runway"];

// Optional non-sensitive appearance stats collected at the measurements step.
// Unlike body measurements these are NOT gated by canCollectSensitiveProfileFields
// — they are collected for ALL talent (including minors and non-binary/undisclosed).
const HAIR_COLORS = ["Black", "Brown", "Blonde", "Red", "Gray", "White", "Other"];
const EYE_COLORS = ["Brown", "Blue", "Green", "Hazel", "Gray", "Amber", "Other"];
const SHOE_REGIONS = ["US", "EU", "UK"];

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
 * POST /onboarding/entry
 * Smart Entry: Firebase OAuth authentication.
 *
 * Creates or retrieves user/profile and initializes casting call state. The
 * client always authenticates with Firebase and sends `firebase_token`.
 */
router.post(["/onboarding/entry", "/casting/entry"], async (req, res, next) => {
  try {
    const {
      firebase_token,
      name,
      date_of_birth,
      terms_accepted,
      privacy_accepted,
    } = req.body;
    const termsAccepted = terms_accepted === true;
    const privacyAccepted = privacy_accepted === true;

    let user,
      profile,
      isNewUser = false,
      isNewProfile = false,
      hasOAuthData = false,
      authMethod = "google",
      eligibility;

    // Firebase OAuth (Google/Instagram) is the only supported entry path.
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

      // Real auth method for state/analytics: every path is Firebase, but the
      // provider differs — email/password carries sign_in_provider "password".
      authMethod =
        providerUser.oauth_provider === "instagram"
          ? "instagram"
          : decodedToken.firebase?.sign_in_provider === "password"
            ? "email"
            : "google";

      const normalizedEmail = providerUser.email
        ? providerUser.email.toLowerCase().trim()
        : `instagram_${providerUser.uid.replace(":", "_")}@pholio.me`;

      // Match an existing account by firebase_uid, falling back to a verified
      // email match — same shared lookup /login uses (account-matching.js),
      // so this can no longer drift from that logic or exhibit the previous
      // single-OR-query's non-deterministic pick between a uid match and a
      // different email match. When the email is unverified we fall back to
      // firebase_uid only, which for a genuinely new identity simply creates
      // a fresh account (audit finding H3 — see account-matching.js).
      const emailVerified = decodedToken.email_verified === true;
      user = await findUserByFirebaseIdentity(knex, {
        firebaseUid: providerUser.uid,
        email: providerUser.email,
        emailVerified,
      });

      // Role guard (audit finding M2): talent onboarding must never run for an
      // AGENCY account. Entry sets req.session.role = "TALENT" unconditionally
      // and creates a talent profile row; if an existing AGENCY user signs in
      // here (e.g. same Google identity), their session role would disagree with
      // users.role and they'd get a stray talent profile. Reject instead.
      if (user && user.role === "AGENCY") {
        return res.status(409).json({
          error: "AGENCY_ACCOUNT",
          message:
            "This account is registered as an agency. Sign in from the agency dashboard instead of talent onboarding.",
        });
      }

      // Read existing DOB evidence before any write. This permits a proven adult
      // to resume, while all new or age-unknown entries fail closed before user,
      // profile, image, analytics, session, or verification-email writes.
      profile = user
        ? await knex("profiles").where({ user_id: user.id }).first()
        : null;
      const establishedDob = profile?.date_of_birth
        ? adultEligibilityResult(profile.date_of_birth)
        : null;
      const submittedDob = date_of_birth != null
        ? adultEligibilityResult(date_of_birth, { requireDateOnly: true })
        : null;

      if (profile?.date_of_birth && !establishedDob.ok) {
        return rejectEligibility(res, establishedDob);
      }
      if (submittedDob && !submittedDob.ok) {
        return rejectEligibility(res, submittedDob);
      }
      if (
        establishedDob?.ok &&
        submittedDob?.ok &&
        establishedDob.dob !== submittedDob.dob
      ) {
        return res.status(409).json({
          error: "DOB_IMMUTABLE",
          message: "Your established date of birth cannot be changed during onboarding.",
        });
      }

      eligibility = establishedDob?.ok ? establishedDob : submittedDob;
      if (!eligibility?.ok) {
        return rejectEligibility(
          res,
          adultEligibilityResult(date_of_birth, { requireDateOnly: true }),
        );
      }

      // Use normalized Google/OAuth data (extracting given_name/family_name)
      // Fallback to explicit 'name' payload if token claims are missing (e.g. immediate manual signup delay)
      const fallbackParts = name ? name.trim().split(/\s+/) : [];
      const derivedFirstName =
        providerUser.first_name || fallbackParts[0] || "User";
      const derivedLastName =
        providerUser.last_name || fallbackParts.slice(1).join(" ") || null;

      // Create user if doesn't exist
      if (!user) {
        // Diagnostic only (no behavior change): about to create a brand-new
        // account for this identity. If a row already exists for this email
        // under a different firebase_uid (or was skipped because the token's
        // email is unverified), log it — this is the exact "already had an
        // account but got signed up again" scenario, and otherwise leaves no
        // trace once entry succeeds and a second profile is created.
        if (providerUser.email) {
          try {
            const possibleMatch = await knex("users")
              .whereRaw("LOWER(email) = ?", [normalizedEmail])
              .first();
            if (possibleMatch) {
              console.warn(
                "[Casting Entry] Existing account found by email but did not match — creating a new account:",
                {
                  incomingFirebaseUid: providerUser.uid,
                  incomingEmailVerified: emailVerified,
                  existingUserId: possibleMatch.id,
                  existingFirebaseUid: possibleMatch.firebase_uid,
                  existingRole: possibleMatch.role,
                },
              );
            }
          } catch (diagError) {
            console.warn(
              "[Casting Entry] Account-match diagnostic lookup failed:",
              diagError.message,
            );
          }
        }

        if (!termsAccepted) {
          return res.status(400).json({
            error: "Terms acceptance required",
            message: "You must accept the Terms of Service to create an account",
          });
        }

        const userId = uuidv4();
        try {
          await knex.transaction(async (trx) => {
            await trx("users").insert({
              id: userId,
              email: normalizedEmail,
              firebase_uid: providerUser.uid,
              role: "TALENT",
              first_name: derivedFirstName,
              last_name: derivedLastName,
              created_at: knex.fn.now(),
            });
            await recordLegalAcceptance(trx, userId, {
              terms: true,
              privacy: privacyAccepted,
            });
          });

          user = await knex("users").where({ id: userId }).first();
          isNewUser = true;
        } catch (insertErr) {
          // Duplicate-user race (audit finding L4): two concurrent first entries
          // for the SAME identity race on the users unique constraints. Re-read
          // the row the winning request created instead of surfacing an
          // unhandled 500. We recover by firebase_uid — and by email ONLY when
          // Firebase verified it. Recovering on an unverified email would
          // reintroduce the H3 takeover through this error path: an insert that
          // collides with a pre-existing row on an UNVERIFIED email claim must
          // fail closed, not silently bind to that account.
          let recoverQuery = knex("users").where({
            firebase_uid: providerUser.uid,
          });
          if (providerUser.email && emailVerified) {
            recoverQuery = recoverQuery.orWhere({ email: normalizedEmail });
          }
          user = await recoverQuery.first();
          if (!user) {
            // Not our own row from a race. If the collision was on an email
            // owned by a DIFFERENT identity and this token's email is
            // unverified, fail closed (H3) with a clean 409 rather than an
            // unhandled 500 — never bind the caller to that account.
            const emailOwner = providerUser.email
              ? await knex("users").where({ email: normalizedEmail }).first()
              : null;
            if (emailOwner && !emailVerified) {
              return res.status(409).json({
                error: "EMAIL_IN_USE",
                message:
                  "An account already exists for this email. Please sign in with your original method.",
              });
            }
            throw insertErr;
          }
        }
      } else {
        // Backfill name in users table if missing or default "User"
        if (!user.first_name || user.first_name === "User") {
          const userUpdates = {};
          if (derivedFirstName && derivedFirstName !== "User") {
            userUpdates.first_name = derivedFirstName;
          }
          if (derivedLastName && !user.last_name) {
            userUpdates.last_name = derivedLastName;
          }
          if (Object.keys(userUpdates).length > 0) {
            await knex("users")
              .where({ id: user.id })
              .update(userUpdates);
            user = { ...user, ...userUpdates };
          }
        }
      }

      // Keep users.email_verified in sync with Firebase's verified claim —
      // Google users arrive verified; email/password users flip after they
      // click the verification link (also synced at /login and via
      // POST /onboarding/email-verified).
      if (decodedToken.email_verified === true && !user.email_verified) {
        await knex("users")
          .where({ id: user.id })
          .update({ email_verified: true });
        user.email_verified = true;
      }

      // Check if profile exists
      profile = await knex("profiles").where({ user_id: user.id }).first();

      // Create profile if doesn't exist
      if (!profile) {
        const profileId = uuidv4();
        const slug = await ensureUniqueSlug(
          knex,
          "profiles",
          derivedFirstName && derivedLastName
            ? `${derivedFirstName}-${derivedLastName}`
            : `user-${user.id.substring(0, 8)}`,
        );

        // Initialize with casting machine state
        const initial = initialState("entry", knex);

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
          date_of_birth: eligibility.dob,
          ...initial,
          visibility_mode: "private_intake",
          services_locked: true,
          analysis_status: "pending",
          profile_completeness: 0,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });

        if (providerUser.instagram_handle) {
          // Best-effort, matching the account-avatar sync just below: a social
          // field write failure must not throw and fail the whole entry
          // request after the profiles row has already been inserted (that
          // insert isn't in a transaction with this call — saveProfileSocialFields
          // uses its own connection — so an unguarded throw here would leave a
          // profile behind with no way for this request to report success or
          // clean up).
          try {
            await saveProfileSocialFields(profileId, {
              instagram_handle: providerUser.instagram_handle
            });
          } catch (socialError) {
            console.error(
              "[Onboarding] Error syncing Instagram handle:",
              socialError,
            );
            // Non-blocking error
          }
        }

        // Provider picture belongs on the account avatar layer only — never
        // ingest a Google/Instagram OAuth avatar into the book (`images`).
        if (providerUser.picture) {
          try {
            await syncProviderAccountAvatar(
              knex,
              user.id,
              providerUser.picture,
            );
            console.log(
              "[Onboarding] Synced provider picture to users.avatar_url",
            );
          } catch (avatarError) {
            console.error(
              "[Onboarding] Error syncing account avatar:",
              avatarError,
            );
            // Non-blocking error
          }
        }

        profile = await knex("profiles").where({ id: profileId }).first();
        isNewProfile = true;
      } else {
        // Backfill name in profiles table if missing or placeholder
        if (!profile.first_name || profile.first_name === "User") {
          const profileUpdates = {};
          if (derivedFirstName && derivedFirstName !== "User") {
            profileUpdates.first_name = derivedFirstName;
          }
          if (derivedLastName && !profile.last_name) {
            profileUpdates.last_name = derivedLastName;
          }
          if (Object.keys(profileUpdates).length > 0) {
            await knex("profiles")
              .where({ id: profile.id })
              .update(profileUpdates);
            profile = { ...profile, ...profileUpdates };
          }
        }

        // Refresh account avatar from provider on returning entry; never touch images.
        if (providerUser.picture) {
          try {
            await syncProviderAccountAvatar(
              knex,
              user.id,
              providerUser.picture,
            );
          } catch (avatarError) {
            console.error(
              "[Onboarding] Error refreshing account avatar:",
              avatarError,
            );
          }
        }
      }

      // Legacy adult accounts without a recorded DOB must provide the same
      // eligibility evidence as a new account. Persist it once; an established
      // DOB is never overwritten by entry or a back-button/replay request.
      if (!profile.date_of_birth) {
        await knex("profiles")
          .where({ id: profile.id })
          .update({ date_of_birth: eligibility.dob, updated_at: knex.fn.now() });
        profile = { ...profile, date_of_birth: eligibility.dob };
      }

      hasOAuthData = true;

      await SignalCollector.collectEntrySignals(profile.id, {
        oauth_provider: providerUser.oauth_provider || "google",
        inferred_location: null,
        inferred_bio_keywords: [],
      });
    } else {
      return res.status(400).json({
        error: "Invalid request",
        message: "A firebase_token is required.",
      });
    }

    // Session fixation defense: regenerate the session (issuing a fresh id)
    // BEFORE binding the authenticated identity to it, then persist. Any id an
    // unauthenticated client may have held is discarded before it carries auth.
    const preRegenerateSessionId = req.sessionID;
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    req.session.userId = user.id;
    req.session.role = "TALENT";
    req.session.profileId = profile.id;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log("[Casting Entry] Session established:", {
      preRegenerateSessionId,
      postRegenerateSessionId: req.sessionID,
      userId: user.id,
      profileId: profile.id,
    });

    // The DOB screen is now pre-authentication. Mark the eligibility beat
    // complete server-side and continue at gender without reopening a mutable
    // birthdate step.
    const state = getState(profile);

    if (state.current_step === "entry" || state.completed_steps.length === 0) {
      const entryPayload = transitionTo(
        state,
        "birthdate",
        {
          auth_method: authMethod,
          is_new_user: isNewUser,
          is_new_profile: isNewProfile,
        },
        knex,
      );

      if (!entryPayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Cannot advance onboarding from the current step via entry.",
        );
      }

      const birthdateState = getState({
        onboarding_state_json: entryPayload.onboarding_state_json,
      });
      const updatePayload = transitionTo(
        birthdateState,
        "gender",
        { date_of_birth: eligibility.dob, age: eligibility.age },
        knex,
      );
      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          birthdateState,
          "Cannot advance onboarding after age eligibility is confirmed.",
        );
      }
      await knex("profiles").where({ id: profile.id }).update(updatePayload);
    } else if (state.current_step === "birthdate") {
      const updatePayload = transitionTo(
        state,
        "gender",
        { date_of_birth: eligibility.dob, age: eligibility.age },
        knex,
      );
      if (!updatePayload) {
        return invalidOnboardingSequence(
          res,
          state,
          "Cannot advance onboarding after age eligibility is confirmed.",
        );
      }
      await knex("profiles").where({ id: profile.id }).update(updatePayload);
    }

    // Track analytics
    if (isNewProfile) {
      await OnboardingAnalytics.trackEntry(profile.id, "entry", {
        source: "casting_call",
        auth_method: authMethod,
      });
    }

    // Email/password signups verify through OUR SMTP provider, not Firebase's
    // built-in sender: generate the verification link with the Admin SDK and
    // send the branded email ourselves. Best-effort — delivery must never block
    // or fail entry — but log failures loudly (a broken SMTP or unauthorized
    // continue-URL domain would otherwise be invisible). OAuth (Google) users
    // arrive already verified and are skipped.
    if (authMethod === "email" && !user.email_verified) {
      try {
        await sendVerificationEmailViaSmtp({
          email: normalizedEmail,
          firstName: derivedFirstName,
        });
      } catch (verifyErr) {
        console.error(
          "[Casting Entry] SMTP verification email failed to send:",
          verifyErr.message,
        );
      }
    }

    // Return success with next steps
    return res.json({
      success: true,
      user_id: user.id,
      profile_id: profile.id,
      is_new_user: isNewUser,
      has_oauth_data: hasOAuthData,
      next_step: "gender",
      message: "Authentication successful. Ready to start casting call.",
    });
  } catch (error) {
    console.error("[Casting Entry] Error:", error);
    return next(error);
  }
});

// Active-account gate for the rest of onboarding (audit finding M1). Entry above
// is deliberately exempt so a stale/deleted-account session can still re-signup,
// but every step AFTER entry must refuse suspended/banned accounts — otherwise a
// banned TALENT could keep uploading photos and writing profile data through the
// onboarding endpoints (which are mounted before the app-level requireActiveAccount
// so new signups aren't blocked). Unauthenticated requests pass through untouched.
//
// Path filtering is required: this router is mounted at `/`, so an unfiltered
// router.use(mw) would also run for /api/agency/* and other non-casting traffic.
// Do not use router.use(["/onboarding", "/casting"], mw) — Express path-mounting
// strips the prefix and breaks chaining to sibling casting routes.
router.use(onlyCastingPaths(requireActiveAccount()));
// Entry is the sole bootstrap endpoint. Every subsequent onboarding route is
// closed to age-unknown and under-18 sessions, including legacy sessions that
// predate this adults-only pilot.
router.use(requireAdultLaunchEligibility);

/**
 * POST /onboarding/email-verified
 * Verification sync for the inbox beat: after the user clicks the Firebase
 * verification link, the client refreshes its ID token and posts it here. The
 * server trusts only the token's verified claim — bound to the signed-in
 * user's firebase_uid — never a bare client assertion. Idempotent.
 */
router.post(
  ["/onboarding/email-verified", "/casting/email-verified"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { firebase_token } = req.body;
      if (!firebase_token) {
        return res.status(400).json({
          error: "Invalid request",
          message: "A firebase_token is required.",
        });
      }

      let decodedToken;
      try {
        decodedToken = await verifyGoogleToken(firebase_token);
      } catch (error) {
        return res.status(401).json({
          error: "Authentication failed",
          message: error.message || "Invalid or expired token",
        });
      }

      const user = await knex("users")
        .where({ id: req.session.userId })
        .first();
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!decodedToken.uid || decodedToken.uid !== user.firebase_uid) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Token does not belong to the signed-in user.",
        });
      }

      if (decodedToken.email_verified === true && !user.email_verified) {
        await knex("users")
          .where({ id: user.id })
          .update({ email_verified: true });
        user.email_verified = true;
      }

      return res.json({
        success: true,
        email_verified: Boolean(user.email_verified),
      });
    } catch (error) {
      console.error("[Casting Email Verified] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /onboarding/resend-verification
 * Re-send the email-verification link (the inbox beat's "Resend email" action)
 * through our SMTP provider. Resolves the signed-in user's own address server
 * side — the client never names the recipient — and no-ops cleanly if the
 * account is already verified.
 */
router.post(
  ["/onboarding/resend-verification", "/casting/resend-verification"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const user = await knex("users")
        .where({ id: req.session.userId })
        .first();
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.email_verified) {
        return res.json({ success: true, already_verified: true });
      }
      if (!user.email) {
        return res.status(400).json({
          error: "NO_EMAIL",
          message: "No email address on file to verify.",
        });
      }

      await sendVerificationEmailViaSmtp({
        email: user.email,
        firstName: user.first_name,
      });
      return res.json({ success: true });
    } catch (error) {
      console.error(
        "[Casting Resend Verification] Error:",
        error.message,
      );
      return next(error);
    }
  },
);

/**
 * POST /onboarding/gender
 * Persist the talent's gender and advance the state machine to "scout".
 *
 * Adult DOB eligibility is complete before entry, so gender advances directly
 * to scout for the current launch.
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

      // Existing legacy rows without DOB are kept on the legacy resume route;
      // current adults reach gender only after pre-auth eligibility evidence.
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
 * The adult-only launch collects DOB before authentication. This legacy route is
 * retained for safe resume only: it accepts only the established adult DOB and
 * never lets a replay or back-button request change it.
 */
router.post(
  ["/onboarding/birthdate", "/casting/birthdate"],
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { date_of_birth } = req.body;

      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
          message: "Please complete entry step first",
        });
      }

      const establishedDob = profile.date_of_birth
        ? adultEligibilityResult(profile.date_of_birth)
        : null;
      const submittedDob = adultEligibilityResult(date_of_birth, {
        requireDateOnly: true,
      });
      if (profile.date_of_birth && !establishedDob.ok) {
        return rejectEligibility(res, establishedDob);
      }
      if (!submittedDob.ok) {
        return rejectEligibility(res, submittedDob);
      }
      if (establishedDob?.ok && establishedDob.dob !== submittedDob.dob) {
        return res.status(409).json({
          error: "DOB_IMMUTABLE",
          message: "Your established date of birth cannot be changed during onboarding.",
        });
      }

      const dobStr = establishedDob?.dob || submittedDob.dob;
      const age = establishedDob?.age ?? submittedDob.age;

      const state = getState(profile);

      // Established DOBs are immutable. Legacy profiles with no DOB may record
      // the validated adult value once, but retries never rewrite it.
      let updatePayload = profile.date_of_birth
        ? { updated_at: knex.fn.now() }
        : { date_of_birth: dobStr, updated_at: knex.fn.now() };

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

        updatePayload = profile.date_of_birth
          ? transition
          : { ...transition, date_of_birth: dobStr };
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

      // Minor / no-consent gate at COLLECTION (audit finding M5): full_body is a
      // sensitive shot type. A minor without recorded guardian consent — and any
      // profile with no verifiable DOB — may not upload it. The client hides the
      // slot, but the server must enforce the same policy at collection, not
      // just gate exposure downstream.
      if (shotType === "full_body" && !canCollectSensitiveProfileFields(profile)) {
        return res.status(403).json({
          error: "SENSITIVE_SHOT_BLOCKED",
          message:
            "A full-length photo can't be added yet — guardian consent is required first.",
        });
      }

      // Process image (converts to WebP, optimizes). processedBuffer is the exact
      // bytes we persist; it is what content moderation must inspect.
      const { storageKey, publicUrl, absolutePath, processedBuffer } =
        await processImage(req.file, profile.id);

      // Content moderation + CSAM screening (audit finding H2). The onboarding
      // The scout path handles adult pilot uploads. It still fails toward review
      // for moderation/CSAM safety and never auto-approves uncertain content.
      let moderation;
      try {
        moderation = await analyzeImageBuffer(processedBuffer);
      } catch (modErr) {
        moderation = {
          status: MODERATION_STATUS.REVIEW,
          reason: "moderation_error",
          flags: { error: modErr.message },
        };
      }
      let isRejected = moderation.status === MODERATION_STATUS.REJECTED;
      let isReview = moderation.status === MODERATION_STATUS.REVIEW;

      const csamScreen = await screenImageForCsam(processedBuffer, {
        moderationFlags: moderation.flags,
        moderationReason: moderation.reason,
      });
      if (csamScreen.shouldBlock) isRejected = true;
      if (csamScreen.shouldEscalate) isReview = true;

      if (isRejected) {
        // Do not persist a rejected image — purge the bytes we already wrote to
        // storage before returning.
        await purgeStoredImageArtifacts({
          storage_key: storageKey,
          absolute_path: absolutePath,
        });
        return res.status(422).json({
          error: "IMAGE_REJECTED",
          message:
            "This photo was blocked by automated content moderation and was not saved. Please upload a different photo.",
        });
      }

      const imageId = uuidv4();
      const hasModerationColumns = await knex.schema.hasColumn(
        "images",
        "moderation_status",
      );
      const hasModerationQueue = hasModerationColumns
        ? await knex.schema.hasTable("moderation_queue")
        : false;

      // Headshots are the casting photo: they become/stay primary (demoting any
      // leftover non-primary rows). A full-body upload never steals primary, and a
      // flagged (review) image must NEVER surface publicly or become the primary
      // casting photo until a moderator approves it.
      const isPrimary = shotType === "headshot" && !isReview;
      const effectiveModStatus = isReview
        ? MODERATION_STATUS.REVIEW
        : MODERATION_STATUS.APPROVED;

      // Demote-then-insert in one transaction. The one_primary_per_profile
      // constraint forbids two simultaneous primaries, so two concurrent
      // headshot uploads would otherwise race and 500 one of them (audit
      // finding L3); the transaction serializes the swap.
      await knex.transaction(async (trx) => {
        if (isPrimary) {
          await trx("images")
            .where({ profile_id: profile.id })
            .update({ is_primary: false });
        }

        await trx("images").insert({
          id: imageId,
          profile_id: profile.id,
          path: publicUrl, // Save public URL to be consistent with Media API
          absolute_path: absolutePath, // Reliable path to the optimized webp image
          is_primary: isPrimary,
          label: "Scout photo",
          image_type: "digital",
          shot_type: shotType,
          ...(hasModerationColumns
            ? {
                moderation_status: effectiveModStatus,
                moderation_reason: moderation.reason || null,
                moderated_at: trx.fn.now(),
              }
            : {}),
          created_at: knex.fn.now(),
        });

        if (isReview && hasModerationQueue) {
          await trx("moderation_queue").insert({
            id: uuidv4(),
            image_id: imageId,
            profile_id: profile.id,
            status: MODERATION_QUEUE_STATUS.PENDING,
            flags: JSON.stringify({
              ...(moderation.flags || {}),
              ...(csamScreen.flags || {}),
              ...(csamScreen.shouldEscalate ? { csam_escalation: true } : {}),
            }),
            created_at: trx.fn.now(),
          });
        }

        if (csamScreen.shouldEscalate) {
          await recordCsamEscalation(trx, {
            imageId,
            profileId: profile.id,
            provider: csamScreen.provider,
            severity: csamScreen.severity,
            flags: csamScreen.flags,
          });
        }
      });

      return res.json({
        success: true,
        imageId,
        isPrimary,
        photo_url: publicUrl,
        ...(isReview ? { pending_review: true } : {}),
        message: isReview
          ? "Photo uploaded and is pending a quick review before it appears."
          : "Photo uploaded successfully",
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

      // Defense-in-depth for legacy rows: if the primary is a remote seed with no
      // file on disk, fall back to the most recent local upload so the resume
      // photo_url points at the real casting photo.
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

      // Photo-gate truth (audit finding M4): the confirmed photo must be a REAL
      // uploaded headshot, not an account-avatar URL. Scout uploads are stored
      // with image_type='digital'. Without this a Google user could pass the
      // "photo" gate via direct API calls without ever uploading a headshot.
      const realUpload = await knex("images")
        .where({ profile_id: profile.id, image_type: "digital" })
        .first();
      if (!realUpload) {
        return res.status(400).json({
          error: "HEADSHOT_REQUIRED",
          message: "Please upload a headshot photo before continuing.",
        });
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

      // The signed-in user's account facts drive the resume-time verification
      // beat (email/password signups only) — never gate onboarding completion.
      const user = await knex("users")
        .where({ id: req.session.userId })
        .first();

      return res.json({
        success: true,
        user: {
          email: user?.email || null,
          email_verified: Boolean(user?.email_verified),
          auth_method: state.step_data?.entry?.auth_method || null,
        },
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
          // Optional non-sensitive appearance stats (resume rehydration).
          hair_color: profile.hair_color || null,
          eye_color: profile.eye_color || null,
          shoe_size: profile.shoe_size || null,
          shoe_region: profile.shoe_region || null,
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
      const {
        height_cm,
        bust_cm,
        waist_cm,
        hips_cm,
        chest_cm,
        inseam_cm,
        hair_color,
        eye_color,
        shoe_size,
        shoe_region,
      } = req.body;

      // Body measurements (bust/chest/waist/hips/inseam) are sensitive fields:
      // minors without recorded guardian consent — and profiles with no
      // verifiable DOB — may only store height. Same fail-closed policy as the
      // profile routes.
      const allowSensitive = canCollectSensitiveProfileFields(profile);

      const asRoundedNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      };

      // Height is the one genuinely required measurement (audit finding M4).
      // Accept it from this request or an already-saved positive value; without
      // a usable height we must NOT advance measurements → profile. Otherwise a
      // profile could complete onboarding with height_cm = 0 — the client-only
      // "height required" rule was never enforced on the server.
      const submittedHeight = asRoundedNumber(height_cm);
      const existingHeight = asRoundedNumber(profile.height_cm);
      const effectiveHeight = submittedHeight ?? existingHeight;
      if (effectiveHeight === null) {
        return res.status(400).json({
          error: "HEIGHT_REQUIRED",
          message: "Please enter your height before continuing.",
        });
      }

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
      const finalUpdate = {
        ...updatePayload,
        updated_at: knex.fn.now(),
      };

      if (submittedHeight !== null) finalUpdate.height_cm = submittedHeight;

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

      // Optional NON-SENSITIVE appearance stats — collected for ALL talent
      // (including minors and non-binary/undisclosed), so intentionally NOT
      // behind the `allowSensitive` gate. Only write fields actually provided;
      // an invalid enum value is ignored rather than rejected.
      if (typeof hair_color === "string" && HAIR_COLORS.includes(hair_color)) {
        finalUpdate.hair_color = hair_color;
      }
      if (typeof eye_color === "string" && EYE_COLORS.includes(eye_color)) {
        finalUpdate.eye_color = eye_color;
      }
      // Shoe sizes round to the nearest half — half sizes are standard in
      // US/UK sizing and the dashboard stores them as plain numbers too.
      const shoeRaw = Number(shoe_size);
      const shoeSize =
        Number.isFinite(shoeRaw) && shoeRaw > 0
          ? Math.round(shoeRaw * 2) / 2
          : null;
      if (shoeSize !== null) {
        finalUpdate.shoe_size = shoeSize;
        // shoe_region only travels with a shoe_size; default to "US".
        finalUpdate.shoe_region =
          typeof shoe_region === "string" && SHOE_REGIONS.includes(shoe_region)
            ? shoe_region
            : "US";
      }

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

      // State integrity: completion requires the photo (scout) and height
      // (measurements) steps to have genuinely been passed through. transitionTo
      // no longer fabricates completion of skipped steps, so a client parked at
      // an earlier step can no longer POST straight here to finish onboarding
      // without ever uploading a photo or entering a height.
      const completedSteps = state.completed_steps || [];
      if (
        !completedSteps.includes("scout") ||
        !completedSteps.includes("measurements")
      ) {
        return invalidOnboardingSequence(
          res,
          state,
          "Upload your photo and enter your measurements before completing onboarding.",
        );
      }

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
