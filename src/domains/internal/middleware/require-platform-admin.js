"use strict";

const knex = require("../../../shared/db/knex");

function createRequirePlatformAdmin({ db = knex } = {}) {
  return async function requirePlatformAdmin(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({
        success: false,
        error: "AUTHENTICATION_REQUIRED",
        message: "Sign in to continue.",
      });
    }

    try {
      const platformAdmin = await db("platform_admins")
        .where({ user_id: req.session.userId, status: "ACTIVE" })
        .whereNull("revoked_at")
        .select("id", "user_id", "display_name", "granted_at")
        .first();

      if (!platformAdmin) {
        return res.status(403).json({
          success: false,
          error: "PLATFORM_ADMIN_REQUIRED",
          message: "Platform staff access is required.",
        });
      }

      req.platformAdmin = platformAdmin;
      return next();
    } catch (error) {
      // A deploy before the authorization migration must fail closed.
      if (
        error.code === "42P01" ||
        error.code === "SQLITE_ERROR" ||
        /platform_admins/.test(error.message || "")
      ) {
        return res.status(403).json({
          success: false,
          error: "PLATFORM_ADMIN_REQUIRED",
          message: "Platform staff access is required.",
        });
      }
      return next(error);
    }
  };
}

module.exports = {
  createRequirePlatformAdmin,
  requirePlatformAdmin: createRequirePlatformAdmin(),
};
