const knex = require("../db/knex");
const {
  resolveAgencyContextForMemberUser,
} = require("../../domains/agency/services/context");

/**
 * Dev Auto-Auth Middleware
 *
 * Automatically signs in a default user in development mode
 * if no active session exists, based on the requested dashboard path.
 */
async function devAutoAuth(req, res, next) {
  // Only run in development
  if (process.env.NODE_ENV !== "development") {
    return next();
  }

  const path = req.originalUrl || req.path || "";
  const referer = (req.get && req.get("referer")) || req.headers?.referer || "";

  // Decide which user to auto-login based on path
  let targetEmail = null;
  let targetRole = null;
  // Special case: SPA session bootstrap hits /api/session first. Use referer to infer role.
  const inferredFromReferer =
    typeof referer === "string" && referer.includes("/dashboard/agency")
      ? "AGENCY"
      : typeof referer === "string" &&
          (referer.includes("/dashboard/talent") ||
            referer.includes("/onboarding"))
        ? "TALENT"
        : null;

  if (
    path.includes("/dashboard/agency") ||
    path.includes("/api/agency") ||
    (path.includes("/api/session") && inferredFromReferer === "AGENCY")
  ) {
    targetEmail = "agency@example.com";
    targetRole = "AGENCY";
  } else if (
    path.includes("/dashboard/talent") ||
    path.includes("/api/talent") ||
    path.includes("/onboarding") ||
    (path.includes("/api/session") && inferredFromReferer === "TALENT")
  ) {
    targetEmail = "talent@example.com";
    targetRole = "TALENT";
  }

  if (!targetEmail) {
    return next();
  }

  try {
    // If already signed in with the correct role, keep the session only if it
    // still points at a valid dev principal. Stale local cookies can otherwise
    // trap the demo on onboarding because no profile exists for the session id.
    if (req.session && req.session.userId && req.session.role === targetRole) {
      if (targetRole === "TALENT") {
        const existingUser = await knex("users")
          .where({ id: req.session.userId, role: "TALENT" })
          .first();
        const existingProfile = existingUser
          ? await knex("profiles").where({ user_id: existingUser.id }).first()
          : null;

        if (existingUser && existingProfile) {
          if (!existingProfile.onboarding_completed_at) {
            await knex("profiles")
              .where({ id: existingProfile.id })
              .update({ onboarding_completed_at: new Date() });
          }
          return next();
        }

        req.session.userId = null;
        req.session.role = null;
      } else {
        return next();
      }
    }

    const user = await knex("users").where({ email: targetEmail }).first();
    if (!user) {
      console.warn(
        `[DevAutoAuth] Target user ${targetEmail} not found in database.`,
      );
      return next();
    }

    if (user.role === "AGENCY") {
      const agencyContext = await resolveAgencyContextForMemberUser(user.id);
      if (agencyContext && agencyContext.agency) {
        req.session.userId = agencyContext.agency.id;
        req.session.memberUserId = user.id;
        req.session.agencyId = agencyContext.agency.id;
        req.session.agencyMembershipRole =
          agencyContext.membership?.membership_role || "OWNER";
        req.session.agencyOnboardingCompletedAt =
          agencyContext.agency.onboarding_completed_at || new Date();
        req.session.role = "AGENCY";
      }
    } else {
      req.session.userId = user.id;
      req.session.role = "TALENT";

      // Ensure talent profile onboarding is "completed" for dev convenience
      const profile = await knex("profiles")
        .where({ user_id: user.id })
        .first();
      if (profile && !profile.onboarding_completed_at) {
        await knex("profiles")
          .where({ id: profile.id })
          .update({ onboarding_completed_at: new Date() });
      }
    }

    if (req.session.userId) {
      console.log(
        `[DevAutoAuth] Automatically signed in as ${targetEmail} for path ${path}`,
      );
      // Save session synchronously to ensure it's available for next middleware
      req.session.save((err) => {
        if (err) console.error("[DevAutoAuth] Session save error:", err);
        next();
      });
    } else {
      next();
    }
  } catch (error) {
    console.error("[DevAutoAuth] Error during auto-login:", error);
    next();
  }
}

module.exports = devAutoAuth;
