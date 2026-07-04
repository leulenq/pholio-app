"use strict";

const knex = require("../../../../shared/db/knex");
const apiResponse = require("../../../../shared/lib/api-response");

async function loadTalentProfile(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

async function requireStudioPlus(req, res) {
  const profile = await loadTalentProfile(req.session.userId);
  if (!profile) {
    apiResponse.notFound(res, "Profile not found");
    return null;
  }
  if (!profile.is_pro) {
    apiResponse.error(res, "Studio+ subscription required", 403, {
      code: "STUDIO_PLUS_REQUIRED",
    });
    return null;
  }
  return profile;
}

module.exports = {
  loadTalentProfile,
  requireStudioPlus,
};
