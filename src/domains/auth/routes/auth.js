const path = require("path");
const express = require("express");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const config = require("../../../config");
const knex = require("../../../shared/db/knex");
const {
  loginSchema,
} = require("../../../shared/lib/validation");
const { clearCookieOptions } = require("../../../shared/lib/cookie-domain");
const {
  verifyIdToken,
  createUser: createFirebaseUser,
  getUserByEmail,
  revokeRefreshTokens,
} = require("../services/firebase-admin");
const { findUserByFirebaseIdentity } = require("../services/account-matching");
const { extractIdToken } = require("../middleware/firebase-auth");
const {
  resolveAgencyContextForMemberUser,
} = require("../../agency/services/context");
const {
  isInstagramUid,
  normalizeOAuthUser,
  resolveAuthProvider,
} = require("../../onboarding/services/providers/oauth-user");
const { stampSessionDevice } = require("../../../shared/lib/session-device");
const { registerSession } = require("../../../shared/lib/session-registry");
const {
  loadPermissionsArrayForSession,
} = require("../../agency/services/permissions");
const { normalizePresetRole } = require("../../agency/lib/permissions");
const {
  getIPGeolocation,
  createVerifiedLocationIntel,
} = require("../../../shared/lib/geolocation");
const { syncProviderAccountAvatar } = require("../../../shared/lib/account-avatar");
const {
  sendPasswordResetViaSmtp,
  sendSignInMethodNoticeViaSmtp,
} = require("../services/email-verification");
const { sendPasswordChangedEmail } = require("../../../shared/lib/email");
const {
  acceptTeamInvitation,
  loadTeamInvitation,
} = require("../../agency/services/team-invitations");

const router = express.Router();

function redirectForRole(role) {
  if (role === "TALENT") return "/dashboard/talent";
  if (role === "AGENCY") return "/dashboard/agency";
  return "/";
}

function redirectForSession(session) {
  if (!session?.role) {
    return "/";
  }

  const agencySetupRedirect = agencySetupRedirectForSession(session);
  if (agencySetupRedirect) {
    return agencySetupRedirect;
  }

  return redirectForRole(session.role);
}

function safeNext(input) {
  if (!input || typeof input !== "string") return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  return input;
}

function safeLoginValues(body) {
  if (!body || typeof body !== "object") return {};

  return {
    email: typeof body.email === "string" ? body.email : undefined,
    next: safeNext(body.next) || undefined,
  };
}

async function talentPostLoginRedirect(userId, emailVerified) {
  if (!emailVerified) return "/onboarding?verification=required";

  const profile = await knex("profiles").where({ user_id: userId }).first();
  return profile?.onboarding_completed_at ? "/dashboard/talent" : "/onboarding";
}

async function redirectForAuthenticatedSession(session) {
  if (session?.role !== "TALENT" || !session.userId) {
    return redirectForSession(session);
  }

  const user = await knex("users")
    .where({ id: session.userId })
    .select("email_verified")
    .first();
  return talentPostLoginRedirect(session.userId, Boolean(user?.email_verified));
}

function isAgencySetupComplete(session) {
  return Boolean(session?.agencyOnboardingCompletedAt);
}

function agencySetupRedirectForSession(session) {
  if (session?.role === "AGENCY" && !isAgencySetupComplete(session)) {
    return "/dashboard/agency/setup";
  }
  return null;
}

function isAllowedAgencySetupNext(pathname) {
  if (!pathname) return false;
  return (
    pathname === "/dashboard/agency/setup" ||
    pathname.startsWith("/dashboard/agency/setup?") ||
    pathname === "/logout" ||
    pathname === "/login" ||
    pathname.startsWith("/reply")
  );
}

function agencyRequestAccessUrl() {
  const marketingBase =
    process.env.MARKETING_SITE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://www.pholio.studio"
      : "http://localhost:3001");
  return `${marketingBase.replace(/\/$/, "")}/agency/request-access`;
}


// POST /api/auth/password-reset — deliver Firebase password-reset action links
// through Pholio SMTP instead of Firebase's stock email sender. Always returns
// success for syntactically valid email so account existence is not exposed.
//
// Firebase refuses to generate a reset link for an account with no `password`
// entry in its `providerData` — a Google- or Instagram-only account has
// nothing to reset. Asking anyway is what produced "Failed to send reset
// email" for those users: `generatePasswordResetLink` threw, and the only
// response the client had was a generic failure. So the account's actual
// sign-in methods are checked here first, and an account with no password
// provider gets an email naming how it *does* sign in instead of a reset link
// Firebase was never going to issue.
router.post("/api/auth/password-reset", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_EMAIL",
        message: "Enter a valid email address.",
      });
    }

    const user = await knex("users").whereRaw("LOWER(email) = ?", [email]).first();
    if (user?.email) {
      const firebaseUser = await getUserByEmail(user.email);
      const providerIds = firebaseUser
        ? firebaseUser.providerData.map((provider) => provider.providerId)
        : [];
      const hasPasswordProvider = providerIds.includes("password");

      if (!firebaseUser) {
        // DB row with no matching Firebase identity (data drift, a
        // dev-seeded row, …). Nothing we can email a link for — and saying so
        // would confirm the DB row exists, so this falls through to the same
        // generic success response as everything else.
      } else if (hasPasswordProvider) {
        await sendPasswordResetViaSmtp({
          email: user.email,
          firstName: user.first_name,
        });
      } else {
        await sendSignInMethodNoticeViaSmtp({
          email: user.email,
          firstName: user.first_name,
          providerIds,
        });
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("[Password Reset] SMTP reset delivery failed");
    return next(error);
  }
});

// Dev-only email/password login. Verifies the seeded bcrypt password_hash
// (see seeds/seed.js) and creates a session without Firebase, so the /login
// page works locally with credentials like agency@example.com / password123.
// Gated behind AUTH_PASSTHROUGH_ENABLED=1 and never active in production.
function isDevLoginEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_PASSTHROUGH_ENABLED === "1"
  );
}

// POST /api/dev/login
router.post("/api/dev/login", async (req, res, next) => {
  if (!isDevLoginEnabled()) {
    return res.status(404).json({ success: false, error: "Not found" });
  }

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required.",
      });
    }

    const user = await knex("users")
      .whereRaw("LOWER(email) = ?", [email])
      .first();
    if (!user || !user.password_hash) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password." });
    }

    // Regenerate the session id before establishing the authenticated session
    // (SEC-0.7: session-fixation gap). Must happen before any identity fields
    // are assigned — regenerate() replaces req.session with a brand-new,
    // empty session, so fields have to be (re-)assigned after this point.
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    if (user.role === "AGENCY") {
      const agencyContext = await resolveAgencyContextForMemberUser(user.id);
      if (!agencyContext || !agencyContext.agency) {
        return res.status(403).json({
          success: false,
          error: "No agency workspace is linked to this account.",
        });
      }

      req.session.userId = agencyContext.agency.id;
      req.session.memberUserId = user.id;
      req.session.agencyId = agencyContext.agency.id;
      req.session.agencyMembershipId = agencyContext.membership?.id || null;
      req.session.agencyMembershipRole =
        agencyContext.membership?.membership_role || null;
      req.session.agencyOnboardingCompletedAt =
        agencyContext.agency.onboarding_completed_at || null;
      req.session.role = "AGENCY";
    } else {
      req.session.userId = user.id;
      req.session.role = user.role;
      delete req.session.memberUserId;
      delete req.session.agencyId;
      delete req.session.agencyMembershipId;
      delete req.session.agencyMembershipRole;
      delete req.session.agencyOnboardingCompletedAt;
    }

    const deviceStamp = stampSessionDevice(req);

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    await registerSession(knex, {
      userId: req.session.userId,
      sid: req.sessionID,
      fingerprint: deviceStamp?.fingerprint,
    });

    const nextPath = safeNext(req.body?.next);
    const sessionRedirect = redirectForSession(req.session);
    let redirectUrl = nextPath || sessionRedirect;
    if (
      req.session.role === "AGENCY" &&
      !req.session.agencyOnboardingCompletedAt
    ) {
      redirectUrl = sessionRedirect;
    }

    console.log("[DevLogin] Session established");
    return res.json({ success: true, redirect: redirectUrl });
  } catch (error) {
    return next(error);
  }
});

// POST /api/dev/bootstrap — SessionGates call this to establish the seeded
// principal for a dashboard role (client: shared/lib/dev-seed-session.js).
// Hard-gated inside establishDevSeedSession (404 unless dev passthrough).
router.post("/api/dev/bootstrap", async (req, res, next) => {
  try {
    const {
      establishDevSeedSession,
    } = require("../../../shared/lib/dev-seed-session");
    const result = await establishDevSeedSession(req, req.body?.role);
    if (!result.ok) {
      return res
        .status(result.status || 404)
        .json({ success: false, error: result.error || "Not found" });
    }
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.json({ success: true, role: req.session.role });
  } catch (error) {
    return next(error);
  }
});

// GET /login
router.get("/login", async (req, res) => {
  const forceLogin = req.query.force === "1";

  if (!forceLogin && req.session && req.session.userId) {
    // If user is logged in, redirect to their dashboard
    // Dashboard routes handle empty states internally (no need to check for profile here)
    return res.redirect(await redirectForAuthenticatedSession(req.session));
  }
  // Production: React SPA handles /login (served by app.js). Dev: Vite on :5173.
  if (process.env.NODE_ENV === "production") {
    const appRoot = config.isServerless
      ? process.env.LAMBDA_TASK_ROOT || path.join(__dirname, "../../..")
      : path.join(__dirname, "../../../..");
    return res.sendFile(
      path.join(appRoot, "public", "dashboard-app", "index.html"),
    );
  }

  const nextPath = safeNext(req.query.next);
  const params = new URLSearchParams();
  if (nextPath) {
    params.set("next", nextPath);
  }
  if (forceLogin) {
    params.set("force", "1");
  }
  const queryString = params.toString();
  const loginUrl = "http://localhost:5173/login";
  return res.redirect(queryString ? `${loginUrl}?${queryString}` : loginUrl);
});

// POST /login - Verify Firebase token and create session
router.post(["/login", "/api/login"], async (req, res, next) => {
  // Check body first (for form submissions), then headers/cookies
  // Support both JSON and form-encoded requests
  let idToken = null;
  let nextPath = null;
  const inviteToken =
    typeof req.body?.invite_token === "string"
      ? req.body.invite_token.trim()
      : "";
  // Set by ResetPasswordPage's post-reset sign-in only — conditions the
  // "your password was changed" confirmation email below on an ordinary
  // login never sending it.
  const passwordJustReset = req.body?.password_just_reset === true;

  // Declared at handler scope because several exit paths need it — notably the
  // existing-user "AGENCY login not assigned to an organization" branch, which
  // previously referenced an isJsonRequest that was only declared inside the
  // new-user block and threw a ReferenceError (masking the intended 403).
  const isJsonRequest =
    (req.headers["content-type"] || "").includes("application/json") ||
    (req.headers.accept || "").includes("application/json");

  // Check if request is JSON
  if (
    req.headers["content-type"] &&
    req.headers["content-type"].includes("application/json")
  ) {
    idToken =
      req.body && req.body.firebase_token
        ? req.body.firebase_token.trim()
        : extractIdToken(req);
    nextPath = safeNext(req.body.next);
  } else {
    // Form-encoded request
    idToken =
      req.body && req.body.firebase_token
        ? req.body.firebase_token.trim()
        : extractIdToken(req);
    nextPath = safeNext(req.body.next);
  }

  // If Firebase token is provided, skip email/password validation and proceed with token auth
  if (!idToken) {
    // No Firebase token - this should not happen if client-side auth is working correctly
    // The client should authenticate with Firebase first (either Google or email/password),
    // then send the Firebase token to the backend
    console.warn("[Login] Authentication token missing");

    // If request is JSON or Accept header requests JSON, return JSON error response
    const contentType = req.headers["content-type"] || "";
    const acceptHeader = req.headers.accept || "";
    if (
      contentType.includes("application/json") ||
      acceptHeader.includes("application/json")
    ) {
      return res.status(401).json({
        success: false,
        errors: {
          firebase: [
            "Authentication failed. Please sign in with Google or enter your email and password.",
          ],
        },
      });
    }

    // Show helpful error message - don't require email/password validation
    // The client-side should handle authentication and send the token
    res.locals.currentPage = "login";
    return res.status(401).render("auth/login", {
      title: "Sign in",
      values: safeLoginValues(req.body),
      errors: {
        firebase: [
          "Authentication failed. Please sign in with Google or enter your email and password.",
        ],
      },
      layout: "layout",
      currentPage: "login",
    });
  }

  try {
    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(idToken);
    const providerUser = normalizeOAuthUser(decodedToken);
    const firebaseUid = providerUser.uid;
    const email = providerUser.email;
    const emailVerified = decodedToken.email_verified === true;
    const displayName = providerUser.name || null;

    // Parse name into first_name and last_name
    let firstName = providerUser.first_name || null;
    let lastName = providerUser.last_name || null;
    if (!firstName && displayName) {
      const nameParts = displayName.trim().split(/\s+/);
      firstName = nameParts[0] || null;
      lastName = nameParts.slice(1).join(" ") || null;
    }

    const isInstagramAuth = isInstagramUid(firebaseUid);

    if (!firebaseUid || (!email && !isInstagramAuth)) {
      console.warn("[Login] Authentication token did not contain an identity");

      // If request is JSON or Accept header requests JSON, return JSON error response
      const contentType = req.headers["content-type"] || "";
      const acceptHeader = req.headers.accept || "";
      if (
        contentType.includes("application/json") ||
        acceptHeader.includes("application/json")
      ) {
        return res.status(401).json({
          success: false,
          errors: { email: ["Invalid authentication token."] },
        });
      }

      res.locals.currentPage = "login";
      return res.status(401).render("auth/login", {
        title: "Sign in",
        values: safeLoginValues(req.body),
        errors: { email: ["Invalid authentication token."] },
        layout: "layout",
        currentPage: "login",
      });
    }

    let pendingTeamInvitation = null;
    let teamInvitationAccepted = false;
    if (inviteToken) {
      if (!email || !emailVerified) {
        return res.status(403).json({
          success: false,
          error: "Verify the invited email address before joining the agency workspace.",
        });
      }
      pendingTeamInvitation = await loadTeamInvitation(inviteToken);
      if (
        !pendingTeamInvitation ||
        pendingTeamInvitation.email !== email.toLowerCase().trim()
      ) {
        return res.status(403).json({
          success: false,
          error: "This invitation is invalid, expired, used, or belongs to another email address.",
        });
      }
    }

    // Look up user in database by Firebase UID, falling back to a
    // verified-email match (see account-matching.js for why the order and
    // the emailVerified gate both matter).
    let user = await findUserByFirebaseIdentity(knex, {
      firebaseUid,
      email,
      emailVerified,
    });

    // If user exists but doesn't have firebase_uid, update it and update profile with Google data
    if (user && !user.firebase_uid) {
      const boundIdentity = await knex("users")
        .where({ id: user.id })
        .whereNull("firebase_uid")
        .update({ firebase_uid: firebaseUid });
      if (boundIdentity !== 1) {
        const latestUser = await knex("users").where({ id: user.id }).first();
        if (latestUser?.firebase_uid !== firebaseUid) {
          return res.status(409).json({
            success: false,
            error: "ACCOUNT_IDENTITY_CONFLICT",
            message: "This account is already linked to a different sign-in method.",
          });
        }
      }
      user.firebase_uid = firebaseUid;

      // Update existing profile with Google name/picture and IP geolocation if available
      if (firstName && user.role === "TALENT") {
        const existingProfile = await knex("profiles")
          .where({ user_id: user.id })
          .first();
        if (existingProfile) {
          const updateData = {};
          if (!existingProfile.first_name && firstName) {
            updateData.first_name = firstName;
          }
          if (!existingProfile.last_name && lastName) {
            updateData.last_name = lastName;
          }

          // Capture IP geolocation and store in onboarding_signals (if not already set)
          let geoData = {};
          const existingSignals = await knex("onboarding_signals")
            .where({ profile_id: existingProfile.id })
            .first();

          if (!existingSignals?.ip_address || !existingSignals?.ip_country) {
            const clientIP =
              req.clientIp ||
              req.ip ||
              req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
              null;
            if (clientIP) {
              try {
                const ipGeolocationData = await getIPGeolocation(clientIP);
                if (ipGeolocationData) {
                  if (!existingSignals?.ip_address)
                    geoData.ip_address = ipGeolocationData.ip_address;
                  if (!existingSignals?.ip_country)
                    geoData.ip_country = ipGeolocationData.country;
                  if (!existingSignals?.ip_region)
                    geoData.ip_region = ipGeolocationData.region;
                  if (!existingSignals?.ip_city)
                    geoData.ip_city = ipGeolocationData.city;
                  if (!existingSignals?.ip_timezone)
                    geoData.ip_timezone = ipGeolocationData.timezone;

                  // Update verified location intel
                  const verifiedLocationIntel = createVerifiedLocationIntel(
                    ipGeolocationData,
                    existingProfile.city,
                  );
                  if (verifiedLocationIntel) {
                    geoData.verified_location_intel = JSON.stringify(
                      verifiedLocationIntel,
                    );
                  }
                }
              } catch {
                // Non-critical - continue without geolocation
                console.warn("[Login] Geolocation lookup unavailable");
              }
            }
          }

          if (Object.keys(updateData).length > 0) {
            await knex("profiles")
              .where({ id: existingProfile.id })
              .update(updateData);
          }

          // Store geo/OAuth data in onboarding_signals
          if (Object.keys(geoData).length > 0) {
            if (existingSignals) {
              await knex("onboarding_signals")
                .where({ profile_id: existingProfile.id })
                .update({
                  ...geoData,
                  updated_at: knex.fn.now(),
                });
            } else {
              // Create new onboarding_signals row
              const { v4: uuidv4 } = require("uuid");
              const isPostgres =
                knex.client.config.client === "pg" ||
                knex.client.config.client === "postgresql";
              const insertData = {
                profile_id: existingProfile.id,
                user_edits_count: 0,
                ...geoData,
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
              };
              if (isPostgres) {
                insertData.id = knex.raw("gen_random_uuid()");
              } else {
                insertData.id = uuidv4();
              }
              await knex("onboarding_signals").insert(insertData);
            }
          }
        }
      }
    }

    // No Pholio account yet. Talent must complete /onboarding — login never
    // auto-provisions talent. Agency invites still provision into the workspace.
    if (!user) {
      if (!pendingTeamInvitation) {
        const onboardingRedirect = "/onboarding";
        return isJsonRequest
          ? res.status(404).json({
              success: false,
              error: "NEEDS_ONBOARDING",
              message: "Finish creating your Pholio account to continue.",
              redirect: onboardingRedirect,
            })
          : res.redirect(onboardingRedirect);
      }

      try {
        const safeFirstName = firstName || "User";
        const safeLastName = lastName || null;
        const safeEmail = email
          ? email.toLowerCase().trim()
          : `instagram_${firebaseUid.replace(":", "_")}@pholio.me`;

        await knex.transaction(async (trx) => {
          const userId = uuidv4();

          await trx("users").insert({
            id: userId,
            email: safeEmail,
            firebase_uid: firebaseUid,
            role: "AGENCY",
            first_name: safeFirstName,
            last_name: safeLastName,
          });

          await acceptTeamInvitation({
            db: trx,
            rawToken: inviteToken,
            userId,
            email: safeEmail,
            emailVerified,
          });
          teamInvitationAccepted = true;

          user = await trx("users").where({ id: userId }).first();
        });

        console.log("[Login] Agency invitee provisioned");
      } catch (createError) {
        console.error("[Login] Agency invitation provisioning failed", {
          code: createError.code || "unknown",
        });

        // Race condition: another request created the user between our lookup and insert
        if (
          createError.code === "23505" ||
          createError.constraint ||
          createError.message?.includes("duplicate") ||
          createError.message?.includes("unique") ||
          createError.message?.includes("UNIQUE")
        ) {
          user = await knex("users")
            .where({ firebase_uid: firebaseUid })
            .first();

          if (!user && email) {
            user = await knex("users")
              .whereRaw("LOWER(email) = ?", [email.toLowerCase().trim()])
              .first();
          }

          if (!user) {
            const msg =
              "An account with this email already exists. Please try logging in.";
            return isJsonRequest
              ? res.status(409).json({ success: false, error: msg })
              : res.status(409).render("auth/login", {
                  title: "Sign in",
                  values: safeLoginValues(req.body),
                  errors: { email: [msg] },
                  layout: "layout",
                  currentPage: "login",
                });
          }
          // user found — fall through to session creation below
        } else {
          const msg =
            "We could not create your account. Please try again or contact support.";
          return isJsonRequest
            ? res.status(500).json({ success: false, error: msg })
            : res.status(500).render("auth/login", {
                title: "Sign in",
                values: safeLoginValues(req.body),
                errors: { email: [msg] },
                layout: "layout",
                currentPage: "login",
              });
        }
      }
    }

    if (pendingTeamInvitation && !teamInvitationAccepted) {
      if (user.role !== "AGENCY") {
        return res.status(409).json({
          success: false,
          error: "This email is already used by a talent account. Use a separate work email.",
        });
      }
      try {
        await knex.transaction(async (trx) => {
          await acceptTeamInvitation({
            db: trx,
            rawToken: inviteToken,
            userId: user.id,
            email,
            emailVerified,
          });
        });
        teamInvitationAccepted = true;
      } catch (invitationError) {
        return res.status(403).json({
          success: false,
          error: invitationError.message,
        });
      }
    }

    // Login may refresh names on an existing profile, but it must never create
    // a profile or mark onboarding complete. Those writes belong exclusively
    // to the onboarding state machine and its adult-eligibility checks.
    if (user && user.role === "TALENT") {
      try {
        const existingProfile = await knex("profiles")
          .where({ user_id: user.id })
          .first();
        if (existingProfile) {
          const profileNameBackfill = {};
          const resolvedFirst =
            firstName || user.first_name || null;
          const resolvedLast = lastName || user.last_name || null;
          if (
            (!existingProfile.first_name ||
              existingProfile.first_name === "User") &&
            resolvedFirst &&
            resolvedFirst !== "User"
          ) {
            profileNameBackfill.first_name = resolvedFirst;
          }
          if (!existingProfile.last_name && resolvedLast) {
            profileNameBackfill.last_name = resolvedLast;
          }
          if (Object.keys(profileNameBackfill).length > 0) {
            profileNameBackfill.updated_at = knex.fn.now();
            await knex("profiles")
              .where({ id: existingProfile.id })
              .update(profileNameBackfill);
          }
        }

        // Keep users.name aligned with the best-known provider/account name.
        const userNameBackfill = {};
        if (
          (!user.first_name || user.first_name === "User") &&
          firstName &&
          firstName !== "User"
        ) {
          userNameBackfill.first_name = firstName;
        }
        if (!user.last_name && lastName) {
          userNameBackfill.last_name = lastName;
        }
        if (Object.keys(userNameBackfill).length > 0) {
          await knex("users").where({ id: user.id }).update(userNameBackfill);
          Object.assign(user, userNameBackfill);
        }
      } catch {
        // Non-critical — log but continue
        console.warn("[Login] Account name synchronization unavailable");
      }
    }

    // Keep users.email_verified in sync with Firebase's verified claim, so a
    // user who clicks the verification link after abandoning onboarding is
    // recorded as verified the next time they sign in.
    if (decodedToken.email_verified === true && !user.email_verified) {
      await knex("users")
        .where({ id: user.id })
        .update({ email_verified: true });
      user.email_verified = true;
    }

    // Record how this account actually signs in. Settings represents sign-in
    // identity from this column (Google branding vs. an email/password account),
    // and it decides whether offering a password reset is honest at all.
    try {
      const authProvider = resolveAuthProvider(decodedToken);
      if (authProvider && user.auth_provider !== authProvider) {
        if (await knex.schema.hasColumn("users", "auth_provider")) {
          await knex("users")
            .where({ id: user.id })
            .update({ auth_provider: authProvider });
          user.auth_provider = authProvider;
        }
      }
    } catch {
      // Non-critical — settings falls back to the neutral representation.
      console.warn("[Login] Auth-provider synchronization unavailable");
    }

    // Account avatar layer only — never write provider pictures into images/book.
    if (user.role === "TALENT" && providerUser.picture) {
      try {
        await syncProviderAccountAvatar(knex, user.id, providerUser.picture);
      } catch {
        console.warn("[Login] Account avatar synchronization unavailable");
      }
    }

    console.log("[Login] Identity authenticated");

    // Regenerate the session id before establishing the authenticated session
    // (SEC-0.7: session-fixation gap). Must happen before any identity fields
    // are assigned — regenerate() replaces req.session with a brand-new,
    // empty session, so fields have to be (re-)assigned after this point.
    // Preserve any pre-auth onboarding prefill if present.
    const preAuthOnboardingData = req.session.onboardingData;
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    if (preAuthOnboardingData) {
      req.session.onboardingData = preAuthOnboardingData;
    }
    if (user.role === "AGENCY") {
      const agencyContext = await resolveAgencyContextForMemberUser(user.id);
      if (!agencyContext || !agencyContext.agency) {
        const msg =
          "This agency login is not assigned to an organization yet. Contact support.";
        if (isJsonRequest) {
          return res.status(403).json({ success: false, error: msg });
        }
        res.locals.currentPage = "login";
        return res.status(403).render("auth/login", {
          title: "Sign in",
          values: safeLoginValues(req.body),
          errors: { email: [msg] },
          layout: "layout",
          currentPage: "login",
        });
      }

      req.session.userId = agencyContext.agency.id;
      req.session.memberUserId = user.id;
      req.session.agencyId = agencyContext.agency.id;
      req.session.agencyMembershipId = agencyContext.membership?.id || null;
      req.session.agencyMembershipRole =
        agencyContext.membership?.membership_role || null;
      req.session.agencyOnboardingCompletedAt =
        agencyContext.agency.onboarding_completed_at || null;
      req.session.role = "AGENCY";
    } else {
      req.session.userId = user.id;
      req.session.role = user.role;
      delete req.session.memberUserId;
      delete req.session.agencyId;
      delete req.session.agencyMembershipId;
      delete req.session.agencyMembershipRole;
      delete req.session.agencyOnboardingCompletedAt;
    }

    // Describe the device on the session before saving, so the row carries what
    // the settings device list renders instead of a hardcoded label.
    const deviceStamp = stampSessionDevice(req);

    // Save session before redirect
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error("[Login] Session persistence failed");
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // `regenerate()` above only destroys the sid this request presented. A client
    // that couldn't present its cookie leaves its previous authenticated row
    // behind, and PholioAuthBridge re-checks on every focus/visibility change —
    // which is how a single phone accumulated hundreds of "sessions". Collapse
    // this user onto one live row per device now that the new row exists.
    await registerSession(knex, {
      userId: req.session.userId,
      sid: req.sessionID,
      fingerprint: deviceStamp?.fingerprint,
    });

    const sessionRedirect =
      req.session.role === "TALENT"
        ? await talentPostLoginRedirect(user.id, Boolean(user.email_verified))
        : redirectForSession(req.session);
    const talentEligibilityRequired =
      req.session.role === "TALENT" && sessionRedirect !== "/dashboard/talent";
    let redirectUrl = talentEligibilityRequired
      ? sessionRedirect
      : nextPath || sessionRedirect;
    if (req.session.role === "AGENCY" && !req.session.agencyOnboardingCompletedAt) {
      if (nextPath && !isAllowedAgencySetupNext(nextPath)) {
        req.session.agencySetupReturnTo = nextPath;
        try {
          await knex("agencies")
            .where({ id: req.session.agencyId })
            .update({ setup_return_to: nextPath, updated_at: knex.fn.now() });
        } catch {
          console.warn("[Login] Failed to persist agency setup return path");
        }
      }
      redirectUrl = sessionRedirect;
    }

    // The session above is now fully established — this really was a
    // successful re-authentication, not just a completed Firebase action —
    // so this is the right place to confirm the change, not ResetPasswordPage
    // itself (which only knows Firebase accepted a new password, not that
    // Pholio verified the caller and logged them in on it). Never blocks the
    // response: a stalled SMTP send must not turn a real, successful login
    // into a failure.
    if (passwordJustReset) {
      try {
        await sendPasswordChangedEmail({
          to: user.email,
          firstName: user.first_name,
          supportUrl: "mailto:support@pholio.studio",
        });
      } catch {
        console.warn("[Login] Password-changed confirmation email failed");
      }
    }

    // If request is JSON or Accept header requests JSON, return JSON response with redirect URL
    const contentType = req.headers["content-type"] || "";
    const acceptHeader = req.headers.accept || "";
    if (
      contentType.includes("application/json") ||
      acceptHeader.includes("application/json")
    ) {
      return res.json({
        success: true,
        redirect: redirectUrl,
      });
    }

    // Otherwise, redirect normally
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("[Login Route] Authentication failed", {
      code: error.code || "unknown",
      name: error.name || "Error",
    });

    // Handle Firebase-specific errors
    const contentType = req.headers["content-type"] || "";
    const acceptHeader = req.headers.accept || "";
    const isJsonRequest =
      contentType.includes("application/json") ||
      acceptHeader.includes("application/json");

    if (
      error.message.includes("Token expired") ||
      error.message.includes("expired")
    ) {
      if (isJsonRequest) {
        return res.status(401).json({
          success: false,
          errors: {
            email: ["Your session has expired. Please sign in again."],
          },
        });
      }

      res.locals.currentPage = "login";
      return res.status(401).render("auth/login", {
        title: "Sign in",
        values: safeLoginValues(req.body),
        errors: { email: ["Your session has expired. Please sign in again."] },
        layout: "layout",
        currentPage: "login",
      });
    }

    if (
      error.message.includes("Invalid token") ||
      error.message.includes("verification failed")
    ) {
      if (isJsonRequest) {
        return res.status(401).json({
          success: false,
          errors: {
            email: ["Invalid authentication token. Please try again."],
          },
        });
      }

      res.locals.currentPage = "login";
      return res.status(401).render("auth/login", {
        title: "Sign in",
        values: safeLoginValues(req.body),
        errors: { email: ["Invalid authentication token. Please try again."] },
        layout: "layout",
        currentPage: "login",
      });
    }

    // For other errors, pass to error handler
    return next(error);
  }
});

// GET /signup - Redirect to /onboarding for talent
router.get("/signup", async (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(await redirectForAuthenticatedSession(req.session));
  }
  // Redirect talent signups to /onboarding and preserve query parameters (e.g., ?plan=studio)
  const queryString = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  return res.redirect("/onboarding" + queryString);
});

// GET /partners - Compatibility handoff to the landing-owned agency request page
router.get("/partners", (req, res) => {
  if (req.session && req.session.userId) {
    if (req.session.role === "AGENCY") {
      return res.redirect(redirectForSession(req.session));
    }
    return res.redirect("/");
  }
  return res.redirect(agencyRequestAccessUrl());
});

// POST /partners - Retired app-side agency signup; the public request form lives in pholio-landing.
router.post("/partners", async (req, res) => {
  const isJson =
    (req.headers["content-type"] || "").includes("application/json") ||
    (req.headers.accept || "").includes("application/json");
  const redirect = agencyRequestAccessUrl();
  if (isJson) {
    return res.status(410).json({
      success: false,
      error: "AGENCY_ACCESS_REQUEST_MOVED",
      message: "Agency access requests are reviewed through the Pholio request page.",
      redirect,
    });
  }
  return res.redirect(303, redirect);
});

// POST /signup - Redirect to /onboarding (legacy route, kept for backward compatibility)
router.post("/signup", (req, res) => {
  const queryString = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  return res.redirect("/onboarding" + queryString);
});

/**
 * Revoke the signed-out user's Firebase refresh tokens.
 *
 * Destroying the Express session is not enough on its own. The React SPA's
 * PholioAuthBridge re-posts a cached Firebase ID token to /api/login whenever it
 * finds no Express session, so a logout that leaves the Firebase identity intact
 * gets silently undone on the next visit or tab focus.
 *
 * This matters most for logout initiated from the marketing site: Firebase Web
 * SDK persistence is per-origin, so www.pholio.studio cannot clear
 * app.pholio.studio's Firebase state from the client at all. Revoking
 * server-side is the only thing that makes "log out" mean logged out on both
 * surfaces, and it does not depend on either client having a Firebase config.
 *
 * Best-effort: never blocks or fails the logout.
 */
async function revokeFirebaseForSession(session) {
  try {
    const accountUserId = session?.memberUserId || session?.userId;
    if (!accountUserId) return;

    const user = await knex("users")
      .where({ id: accountUserId })
      .select("firebase_uid")
      .first();

    await revokeRefreshTokens(user?.firebase_uid);
  } catch {
    console.warn("[Logout] Firebase revocation skipped");
  }
}

// POST /logout
router.post(["/logout", "/api/logout"], async (req, res) => {
  const isJson =
    req.headers.accept && req.headers.accept.includes("application/json");
  const redirectUrl =
    process.env.MARKETING_SITE_URL || "https://www.pholio.studio";

  if (!req.session) {
    if (isJson) {
      return res.json({ success: true, redirect: redirectUrl });
    }
    return res.redirect(redirectUrl);
  }

  // Must run before destroy() — the session is where the account id lives.
  await revokeFirebaseForSession(req.session);

  req.session.destroy((err) => {
    if (err) {
      console.error("[Logout] Failed to destroy session");
    }

    // Clear with the same attribute set the session cookie was created with
    // (src/app.js) — shared helper so the two can't drift apart again.
    res.clearCookie("connect.sid", {
      ...clearCookieOptions(),
      httpOnly: true,
    });

    if (isJson) {
      return res.json({ success: true, redirect: redirectUrl });
    }

    res.redirect(redirectUrl);
  });
});

router.get("/api/session", async (req, res) => {
  // Session-scoped response — same no-store requirement as /api/public/session.
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Cookie");

  if (!req.session || !req.session.role || !req.session.userId) {
    return res.json({ authenticated: false });
  }

  const payload = {
    authenticated: true,
    role: req.session.role,
    agencyId: req.session.agencyId || null,
    memberUserId: req.session.memberUserId || null,
    agencyMembershipId: req.session.agencyMembershipId || null,
    agencyMembershipRole: req.session.agencyMembershipRole || null,
    presetRole: req.session.agencyMembershipRole
      ? normalizePresetRole(req.session.agencyMembershipRole)
      : null,
    agencyOnboardingCompletedAt:
      req.session.agencyOnboardingCompletedAt || null,
    redirect: await redirectForAuthenticatedSession(req.session),
  };

  if (req.session.role === "AGENCY") {
    try {
      payload.permissions = await loadPermissionsArrayForSession(req.session);
    } catch {
      console.error("[Session] Failed to load agency permissions");
      payload.permissions = [];
    }
  }

  return res.json(payload);
});

module.exports = router;
