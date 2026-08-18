const express = require("express");
const router = express.Router();
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  requireTalentProfile,
} = require("../services/writer-shared/writer-profile");
const { validateInput } = require("../services/message-polish/output-validator");
const { polishMessage } = require("../services/message-polish/polish-writer");

router.post(
  "/polish",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const { message, agencyName } = req.body;

    const inputValidation = validateInput(message);
    if (!inputValidation.valid) {
      return apiResponse.error(res, inputValidation.error, 400);
    }

    const trimmedMessage = message.trim();

    let result;
    try {
      result = await polishMessage({
        message: trimmedMessage,
        agencyName: agencyName || undefined,
      });
    } catch (err) {
      console.error("[Message Polish] Error:", err);
      const status =
        err.message?.includes("GROQ") || err.message?.includes("API key")
          ? 503
          : 500;
      return apiResponse.error(
        res,
        status === 503
          ? "AI service unavailable"
          : "Failed to polish message. Please try again.",
        status,
      );
    }

    return apiResponse.success(res, {
      message: result.message,
      wordCount: result.wordCount,
      charCount: result.charCount,
    });
  }),
);

module.exports = router;
