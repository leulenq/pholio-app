const express = require("express");
const { v4: uuidv4 } = require("uuid");
const knex = require("../shared/db/knex");
const { loginSchema, agencySignupSchema } = require("../lib/validation");
const { addMessage } = require("../shared/middleware/context");
const { ensureUniqueSlug } = require("../shared/lib/slugify");
const {
  verifyIdToken,
  createUser: createFirebaseUser,
  getUserByEmail,
} = require("../lib/firebase-admin");
const { extractIdToken } = require("../middleware/firebase-auth");
const {
  createUser: createUserHelper,
  determineRole,
} = require("../shared/lib/user-helpers");
const {
  resolveAgencyContextForMemberUser,
} = require("../lib/agency-context");
const {
  getIPGeolocation,
  createVerifiedLocationIntel,
} = require("../shared/lib/geolocation");

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

  if (session.role === "AGENCY" && !session.agencyOnboardingCompletedAt) {
    return "/dashboard/agency/onboarding";
  }

  return redirectForRole(session.role);
}

function safeNext(input) {
  if (!input || typeof input !== "string") return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  return input;
}

// GET /login
router.get("/login", async (req, res) => {
  const forceLogin = req.query.force === "1";

  if (!forceLogin && req.session && req.session.userId) {
    // If user is logged in, redirect to their dashboard
    // Dashboard routes handle empty states internally (no need to check for profile here)
    return res.redirect(redirectForSession(req.session));
  }
  const nextPath = safeNext(req.query.next);
  // Redirect to Client Login (Port 5173 in dev, /login in prod)
  // This deprecates the EJS login page for browser users
  const loginUrl =
    process.env.NODE_ENV === "production"
      ? "/login"
      : "http://localhost:5173/login";
  const params = new URLSearchParams();
  if (nextPath) {
    params.set("next", nextPath);
  }
  if (forceLogin) {
    params.set("force", "1");
  }

  const queryString = params.toString();
  return res.redirect(queryString ? `${loginUrl}?${queryString}` : loginUrl);
});

// POST /login - Verify Firebase token and create session
router.post(["/login", "/api/login"], async (req, res, next) => {
  // Check body first (for form submissions), then headers/cookies
  // Support both JSON and form-encoded requests
  let idToken = null;
  let nextPath = null;

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

  console.log("[Login] ===== POST /login route hit =====");
  console.log("[Login] Checking for Firebase token:", {
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body).slice(0, 10) : [],
    hasBodyToken: !!(req.body && req.body.firebase_token),
    bodyTokenLength:
      req.body && req.body.firebase_token ? req.body.firebase_token.length : 0,
    extractedToken: !!extractIdToken(req),
    idToken: !!idToken,
    idTokenLength: idToken ? idToken.length : 0,
    requestUrl: req.url,
    requestMethod: req.method,
    hasEmail: !!(req.body && req.body.email),
    hasPassword: !!(req.body && req.body.password),
  });

  // If Firebase token is provided, skip email/password validation and proceed with token auth
  if (!idToken) {
    // No Firebase token - this should not happen if client-side auth is working correctly
    // The client should authenticate with Firebase first (either Google or email/password),
    // then send the Firebase token to the backend
    console.log("[Login] ⚠️ No Firebase token provided");
    console.log("[Login] Request body contents:", {
      hasEmail: !!(req.body && req.body.email),
      hasPassword: !!(req.body && req.body.password),
      hasNext: !!(req.body && req.body.next),
      bodyKeys: req.body ? Object.keys(req.body) : [],
      contentType: req.headers["content-type"],
      fullBody: req.body ? JSON.stringify(req.body, null, 2) : "no body",
    });

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
      values: req.body || {},
      errors: {
        firebase: [
          "Authentication failed. Please sign in with Google or enter your email and password.",
        ],
      },
      layout: "layout",
      currentPage: "login",
    });
  }

  console.log(
    "[Login] ✅ Firebase token found, proceeding with token authentication",
  );

  try {
    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;
    const displayName = decodedToken.name || null; // Extract display name
    const photoURL = decodedToken.picture || null; // Extract photo URL

    // Parse name into first_name and last_name
    let firstName = null;
    let lastName = null;
    if (displayName) {
      const nameParts = displayName.trim().split(/\s+/);
      firstName = nameParts[0] || null;
      lastName = nameParts.slice(1).join(" ") || null;
    }

    if (!firebaseUid || !email) {
      console.log("[Login] Invalid token data:", { firebaseUid, email });

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
        values: req.body,
        errors: { email: ["Invalid authentication token."] },
        layout: "layout",
        currentPage: "login",
      });
    }

    console.log("[Login] Firebase token verified for:", { firebaseUid, email });

    // Look up user in database by Firebase UID
    let user = await knex("users").where({ firebase_uid: firebaseUid }).first();

    // Fallback: Try to find user by email (for migration period)
    if (!user) {
      const normalizedEmail = email.toLowerCase().trim();
      user = await knex("users").where({ email: normalizedEmail }).first();

      // If user exists but doesn't have firebase_uid, update it and update profile with Google data
      if (user && !user.firebase_uid) {
        await knex("users")
          .where({ id: user.id })
          .update({ firebase_uid: firebaseUid });
        console.log("[Login] Updated user with Firebase UID:", {
          userId: user.id,
          firebaseUid,
        });

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
                } catch (geoError) {
                  // Non-critical - continue without geolocation
                  console.warn(
                    "[Login] Error fetching IP geolocation for existing profile:",
                    geoError.message,
                  );
                }
              }
            }

            if (Object.keys(updateData).length > 0) {
              await knex("profiles")
                .where({ id: existingProfile.id })
                .update(updateData);
              console.log(
                "[Login] Updated existing profile with Google data:",
                updateData,
              );
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
              console.log(
                "[Login] Stored geolocation data in onboarding_signals:",
                geoData,
              );
            }
          }
        }
      }
    }

    // Auto-create user if they don't exist but have valid Firebase token
    if (!user) {
      console.log(
        "[Login] User not found in database, auto-creating user for Firebase UID:",
        firebaseUid,
      );

      // Fetch IP geolocation (non-blocking, best-effort)
      let ipGeolocationData = null;
      let verifiedLocationIntel = null;
      try {
        const clientIP =
          req.ip ||
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          null;
        if (clientIP) {
          ipGeolocationData = await getIPGeolocation(clientIP);
          if (ipGeolocationData) {
            verifiedLocationIntel = createVerifiedLocationIntel(
              ipGeolocationData,
              null,
            );
          }
        }
      } catch (geoError) {
        console.warn(
          "[Login] Error fetching IP geolocation:",
          geoError.message,
        );
      }

      const isJsonRequest =
        (req.headers["content-type"] || "").includes("application/json") ||
        (req.headers.accept || "").includes("application/json");

      try {
        const role = determineRole(null, req.path || req.url);
        console.log("[Login] Creating new user with role:", role);

        if (role === "AGENCY") {
          const msg =
            "Agency accounts are provisioned by Pholio. Contact support if you need access.";
          return isJsonRequest
            ? res.status(403).json({ success: false, error: msg })
            : res
                .status(403)
                .render("auth/login", {
                  title: "Sign in",
                  values: req.body,
                  errors: { email: [msg] },
                  layout: "layout",
                  currentPage: "login",
                });
        }

        // Safe fallbacks for all required DB fields so INSERT never fails
        const safeFirstName = firstName || "User";
        const safeLastName = lastName || null;
        const safeCity = ipGeolocationData?.city || "TBD";

        await knex.transaction(async (trx) => {
          const userId = uuidv4();

          await trx("users").insert({
            id: userId,
            email: email.toLowerCase().trim(),
            firebase_uid: firebaseUid,
            role,
            first_name: safeFirstName,
            last_name: safeLastName,
          });

          // Create a profile row for TALENT users so the dashboard loads immediately
          if (role === "TALENT") {
            const slug = await ensureUniqueSlug(
              trx,
              "profiles",
              `${safeFirstName}-${safeLastName}`,
            );
            const {
              initialState,
            } = require("../lib/onboarding/casting-machine");
            const startState = initialState("entry", trx);

            await trx("profiles").insert({
              id: uuidv4(),
              user_id: userId,
              slug,
              first_name: safeFirstName,
              last_name: safeLastName,
              bio_raw: "",
              bio_curated: "",
              city: safeCity,
              phone: null,
              height_cm: 0,
              is_pro: false,
              // Setup correct state machine baseline
              ...startState,
              // Mark onboarding done so the gate lets them into the dashboard.
              // The incomplete-profile banner will prompt them to fill in the rest.
              onboarding_completed_at: knex.fn.now(),
              created_at: knex.fn.now(),
              updated_at: knex.fn.now(),
            });
          }

          user = await trx("users").where({ id: userId }).first();
        });

        console.log("[Login] User auto-created successfully:", {
          id: user.id,
          email: user.email,
          role: user.role,
        });

        // Store data in session for onboarding prefill
        req.session.onboardingData = {
          firstName: safeFirstName,
          lastName: safeLastName,
          email,
          googleProfileSynced: !!displayName,
          googlePhotoURL: photoURL || null,
          ...(ipGeolocationData
            ? {
                ipGeolocation: {
                  country: ipGeolocationData.country,
                  region: ipGeolocationData.region,
                  city: ipGeolocationData.city,
                  timezone: ipGeolocationData.timezone,
                },
              }
            : {}),
          ...(verifiedLocationIntel ? { verifiedLocationIntel } : {}),
        };

        addMessage(
          req,
          "success",
          "Welcome to Pholio! Your account has been created. Complete your profile to get started.",
        );
      } catch (createError) {
        console.error("[Login] Error auto-creating user:", createError);

        // Race condition: another request created the user between our lookup and insert
        if (
          createError.code === "23505" ||
          createError.constraint ||
          createError.message?.includes("duplicate") ||
          createError.message?.includes("unique") ||
          createError.message?.includes("UNIQUE")
        ) {
          console.log(
            "[Login] Unique constraint hit — looking up existing user...",
          );
          user =
            (await knex("users")
              .where({ firebase_uid: firebaseUid })
              .first()) ||
            (await knex("users")
              .where({ email: email.toLowerCase().trim() })
              .first());

          if (!user) {
            const msg =
              "An account with this email already exists. Please try logging in.";
            return isJsonRequest
              ? res.status(409).json({ success: false, error: msg })
              : res
                  .status(409)
                  .render("auth/login", {
                    title: "Sign in",
                    values: req.body,
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
            : res
                .status(500)
                .render("auth/login", {
                  title: "Sign in",
                  values: req.body,
                  errors: { email: [msg] },
                  layout: "layout",
                  currentPage: "login",
                });
        }
      }
    }

    // Ensure TALENT users always have a profile row and onboarding_completed_at stamp.
    // This covers: new auto-created users, accounts from outside the onboarding flow,
    // and (critically) existing users whose profiles pre-date this fix.
    if (user && user.role === "TALENT") {
      try {
        const existingProfile = await knex("profiles")
          .where({ user_id: user.id })
          .first();
        if (!existingProfile) {
          console.log(
            "[Login] Existing TALENT user has no profile — creating one now...",
          );
          const safeFirst = firstName || "User";
          const safeLast = lastName || null;
          const slug = await ensureUniqueSlug(
            knex,
            "profiles",
            `${safeFirst}-${safeLast}`,
          );
          await knex("profiles").insert({
            id: uuidv4(),
            user_id: user.id,
            slug,
            first_name: safeFirst,
            last_name: safeLast,
            bio_raw: "",
            bio_curated: "",
            city: "TBD",
            height_cm: 0,
            is_pro: false,
            onboarding_completed_at: knex.fn.now(),
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
          });
          console.log("[Login] Profile created for existing user");
        } else if (!existingProfile.onboarding_completed_at) {
          // Profile exists but onboarding gate was never cleared — stamp it now.
          // This backfills accounts created before the Firebase-only auth fix.
          await knex("profiles")
            .where({ id: existingProfile.id })
            .update({ onboarding_completed_at: knex.fn.now() });
          console.log(
            "[Login] Backfilled onboarding_completed_at for existing profile:",
            existingProfile.id,
          );
        }
      } catch (profileError) {
        // Non-critical — log but continue
        console.warn(
          "[Login] Error ensuring profile for existing user:",
          profileError.message,
        );
      }
    }

    console.log("[Login] Login successful for user:", {
      id: user.id,
      email: user.email,
      role: user.role,
    });

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
          values: req.body,
          errors: { email: [msg] },
          layout: "layout",
          currentPage: "login",
        });
      }

      req.session.userId = agencyContext.agency.id;
      req.session.memberUserId = user.id;
      req.session.agencyId = agencyContext.agency.id;
      req.session.agencyMembershipRole = agencyContext.membership?.membership_role || null;
      req.session.agencyOnboardingCompletedAt = agencyContext.agency.onboarding_completed_at || null;
      req.session.role = "AGENCY";
    } else {
      req.session.userId = user.id;
      req.session.role = user.role;
      delete req.session.memberUserId;
      delete req.session.agencyId;
      delete req.session.agencyMembershipRole;
      delete req.session.agencyOnboardingCompletedAt;
    }

    // Save session before redirect
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error("[Login] Error saving session:", err);
          reject(err);
        } else {
          console.log("[Login] Session saved successfully");
          resolve();
        }
      });
    });

    const sessionRedirect = redirectForSession(req.session);
    const redirectUrl =
      req.session.role === "AGENCY" && !req.session.agencyOnboardingCompletedAt
        ? sessionRedirect
        : (nextPath || sessionRedirect);
    console.log("[Login] Redirecting to:", redirectUrl);

    // If request is JSON or Accept header requests JSON, return JSON response with redirect URL
    const contentType = req.headers["content-type"] || "";
    const acceptHeader = req.headers.accept || "";
    if (
      contentType.includes("application/json") ||
      acceptHeader.includes("application/json")
    ) {
      console.log(
        "[Login] Returning JSON response with redirect:",
        redirectUrl,
      );
      return res.json({
        success: true,
        redirect: redirectUrl,
      });
    }

    // Otherwise, redirect normally
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("[Login Route] Error:", {
      message: error.message,
      code: error.code,
      name: error.name,
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
        values: req.body,
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
        values: req.body,
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
router.get("/signup", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(redirectForRole(req.session.role));
  }
  // Redirect talent signups to /onboarding and preserve query parameters (e.g., ?plan=studio)
  const queryString = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  return res.redirect("/onboarding" + queryString);
});

// GET /partners - Agency signup page
router.get("/partners", (req, res, next) => {
  try {
    if (req.session && req.session.userId) {
      if (req.session.role === "AGENCY") {
        return res.redirect("/dashboard/agency");
      }
      return res.redirect("/");
    }
    res.locals.currentPage = "partners";
    return res.render("auth/partners", {
      title: "Partner with Pholio",
      values: {},
      errors: {},
      layout: "layout",
      currentPage: "partners",
    });
  } catch (error) {
    return next(error);
  }
});

// POST /partners - Agency signup (Firebase user should be created client-side first)
router.post("/partners", async (req, res, next) => {
  const parsed = agencySignupSchema.safeParse(req.body);
  const values = parsed.success ? parsed.data : (req.body || {});
  const emailError = "Agency accounts are provisioned manually by Pholio. Contact support to request access.";
  res.locals.currentPage = "partners";
  return res.status(403).render("auth/partners", {
    title: "Partner with Pholio",
    values,
    errors: { email: [emailError] },
    layout: "layout",
    currentPage: "partners",
  });
});

// POST /signup - Redirect to /onboarding (legacy route, kept for backward compatibility)
router.post("/signup", (req, res) => {
  const queryString = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  return res.redirect("/onboarding" + queryString);
});

// POST /logout
router.post(["/logout", "/api/logout"], (req, res) => {
  const isJson =
    req.headers.accept && req.headers.accept.includes("application/json");
  const redirectUrl = process.env.MARKETING_SITE_URL || "https://www.pholio.studio";
  const appLoginUrl =
    process.env.NODE_ENV === "production" ? "/login" : "http://localhost:5173/login";

  if (!req.session) {
    if (isJson) {
      return res.json({ success: true, redirect: appLoginUrl });
    }
    return res.redirect(redirectUrl);
  }

  req.session.destroy((err) => {
    if (err) {
      console.error("[Logout] Error destroying session:", err);
    }

    res.clearCookie("connect.sid");

    if (isJson) {
      return res.json({ success: true, redirect: appLoginUrl });
    }

    res.redirect(redirectUrl);
  });
});

router.get("/api/session", async (req, res) => {
  if (!req.session || !req.session.role || !req.session.userId) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    role: req.session.role,
    agencyId: req.session.agencyId || null,
    memberUserId: req.session.memberUserId || null,
    agencyOnboardingCompletedAt: req.session.agencyOnboardingCompletedAt || null,
    redirect: redirectForSession(req.session),
  });
});

module.exports = router;
