const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const { requireStudioPlus } = require("../services/writer-shared/studio-plus");
const {
  buildSubmissionContext,
} = require("../services/submission-note-writer/context-builder");
const {
  draftNote,
  sharpenNote,
  shortenNote,
} = require("../services/submission-note-writer/note-writer");

async function resolveAgency({ agencyId, agencyName }) {
  if (agencyId) {
    const row = await knex("agencies")
      .where({ id: agencyId })
      .select("name", "location")
      .first();
    if (row) {
      return { name: row.name, location: row.location || null };
    }
  }
  if (agencyName && String(agencyName).trim()) {
    return { name: String(agencyName).trim(), location: null };
  }
  return null;
}

function handleWriterError(res, err, verb) {
  console.error(`[Submission Note] ${verb} error:`, err);
  const status = err.message?.includes("GROQ") ? 503 : 500;
  return apiResponse.error(
    res,
    status === 503
      ? "AI service unavailable"
      : `Failed to ${verb} note. Please try again.`,
    status,
  );
}

function serialize(result, context) {
  return {
    mode: result.mode,
    note: result.note,
    wordCount: result.wordCount,
    charCount: result.charCount,
    contextSignalsUsed: context.signalCount,
  };
}

router.post(
  "/draft",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireStudioPlus(req, res);
    if (!profile) return;

    const { agencyId, agencyName, note } = req.body || {};
    const agency = await resolveAgency({ agencyId, agencyName });
    const trimmedNote =
      note && typeof note === "string" ? note.trim() : "";

    const context = buildSubmissionContext(profile, {
      agency,
      note: trimmedNote || undefined,
    });

    let result;
    try {
      result = await draftNote({ context });
    } catch (err) {
      return handleWriterError(res, err, "draft");
    }

    return apiResponse.success(res, serialize(result, context));
  }),
);

router.post(
  "/sharpen",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireStudioPlus(req, res);
    if (!profile) return;

    const { agencyId, agencyName, note } = req.body || {};
    if (!note || typeof note !== "string" || note.trim().length < 10) {
      return apiResponse.error(
        res,
        "Note must be at least 10 characters to sharpen",
        400,
      );
    }

    const trimmedNote = note.trim();
    const agency = await resolveAgency({ agencyId, agencyName });
    const context = buildSubmissionContext(profile, {
      agency,
      note: trimmedNote,
    });

    let result;
    try {
      result = await sharpenNote({ context, note: trimmedNote });
    } catch (err) {
      return handleWriterError(res, err, "sharpen");
    }

    return apiResponse.success(res, serialize(result, context));
  }),
);

router.post(
  "/shorten",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await requireStudioPlus(req, res);
    if (!profile) return;

    const { note } = req.body || {};
    if (!note || typeof note !== "string" || note.trim().length < 50) {
      return apiResponse.error(
        res,
        "Note must be at least 50 characters to shorten",
        400,
      );
    }

    const trimmedNote = note.trim();
    const context = buildSubmissionContext(profile, { note: trimmedNote });

    let result;
    try {
      result = await shortenNote({ context, note: trimmedNote });
    } catch (err) {
      return handleWriterError(res, err, "shorten");
    }

    return apiResponse.success(res, serialize(result, context));
  }),
);

module.exports = router;
