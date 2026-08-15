const express = require("express");
const router = express.Router();

const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  requireTalentProfile,
} = require("../services/writer-shared/writer-profile");
const { groqUnavailable } = require("../services/writer-shared/groq-client");
const {
  buildTrainingSummaryContext,
} = require("../services/training-summary-writer/context-builder");
const {
  formatTrainingSummary,
  summarizeTrainingSummary,
  expandTrainingSummary,
  buildInsufficientContextError,
} = require("../services/training-summary-writer/summary-writer");

function parseBodyText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function handleWriterError(res, err, modeLabel) {
  console.error(`[Training Summary Writer] ${modeLabel} error:`, err);
  const status = groqUnavailable(err) ? 503 : 500;
  return apiResponse.error(
    res,
    status === 503
      ? "AI service unavailable"
      : `Failed to ${modeLabel} training summary. Please try again.`,
    status,
  );
}

router.post(
  "/format",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const text = parseBodyText(req.body?.text);
    if (text.length < 10) {
      return apiResponse.error(
        res,
        "Training text must be at least 10 characters to format",
        400,
      );
    }

    const context = buildTrainingSummaryContext(profile);
    try {
      const result = await formatTrainingSummary({ context, text });
      return apiResponse.success(res, {
        mode: result.mode,
        summary: result.summary,
        wordCount: result.wordCount,
      });
    } catch (err) {
      return handleWriterError(res, err, "format");
    }
  }),
);

router.post(
  "/summarize",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const text = parseBodyText(req.body?.text);
    if (text.length < 40) {
      return apiResponse.error(
        res,
        "Training text must be at least 40 characters to summarize",
        400,
      );
    }

    const context = buildTrainingSummaryContext(profile);
    try {
      const result = await summarizeTrainingSummary({ context, text });
      return apiResponse.success(res, {
        mode: result.mode,
        summary: result.summary,
        wordCount: result.wordCount,
      });
    } catch (err) {
      return handleWriterError(res, err, "summarize");
    }
  }),
);

router.post(
  "/expand",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const text = parseBodyText(req.body?.text);
    const context = buildTrainingSummaryContext(profile);
    if (!context.hasSignals) {
      const err = buildInsufficientContextError();
      return apiResponse.error(res, err.message, 400, {
        code: err.code,
      });
    }

    try {
      const result = await expandTrainingSummary({ context, text });
      return apiResponse.success(res, {
        mode: result.mode,
        summary: result.summary,
        wordCount: result.wordCount,
      });
    } catch (err) {
      if (err.code === "INSUFFICIENT_CONTEXT") {
        return apiResponse.error(res, err.message, 400, { code: err.code });
      }
      return handleWriterError(res, err, "expand");
    }
  }),
);

module.exports = router;
