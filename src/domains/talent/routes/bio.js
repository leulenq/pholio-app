const express = require("express");
const router = express.Router();
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  requireTalentProfile,
} = require("../services/writer-shared/writer-profile");
const { buildBioContext } = require("../services/bio-writer/context-builder");
const { refineBio, generateBio } = require("../services/bio-writer/bio-writer");

function parseBioOptions(body = {}) {
  return {
    length: body.length === "tight" ? "tight" : "standard",
    person: body.person === "first" ? "first" : "third",
  };
}

router.post(
  "/refine",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const { bio } = req.body;
    if (!bio || typeof bio !== "string" || bio.trim().length < 10) {
      return apiResponse.error(
        res,
        "Bio must be at least 10 characters to refine",
        400,
      );
    }

    const trimmedBio = bio.trim();
    const options = parseBioOptions(req.body);
    const context = buildBioContext(profile, { existingBio: trimmedBio });

    let result;
    try {
      result = await refineBio({ context, bio: trimmedBio, options });
    } catch (err) {
      console.error("[Bio Writer] Refine error:", err);
      const status = err.message?.includes("GROQ") ? 503 : 500;
      return apiResponse.error(
        res,
        status === 503
          ? "AI service unavailable"
          : "Failed to refine bio. Please try again.",
        status,
      );
    }

    return apiResponse.success(res, {
      mode: result.mode,
      length: result.length,
      person: result.person,
      original: trimmedBio,
      bio: result.bio,
      refined: result.bio,
      wordCount: result.wordCount,
      contextSignalsUsed: context.signalCount,
    });
  }),
);

router.post(
  "/generate",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const context = buildBioContext(profile);
    const options = parseBioOptions(req.body);

    if (!context.hasMinimumForGenerate) {
      return apiResponse.error(
        res,
        "Add more profile details (experience, categories, training, or credits) before generating a bio",
        400,
        { code: "INSUFFICIENT_CONTEXT" },
      );
    }

    let result;
    try {
      result = await generateBio({ context, options });
    } catch (err) {
      console.error("[Bio Writer] Generate error:", err);
      const status = err.message?.includes("GROQ") ? 503 : 500;
      return apiResponse.error(
        res,
        status === 503
          ? "AI service unavailable"
          : "Failed to generate bio. Please try again.",
        status,
      );
    }

    return apiResponse.success(res, {
      mode: result.mode,
      length: result.length,
      person: result.person,
      bio: result.bio,
      refined: result.bio,
      wordCount: result.wordCount,
      contextSignalsUsed: context.signalCount,
    });
  }),
);

module.exports = router;
