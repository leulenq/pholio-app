const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  requireTalentProfile,
} = require("../services/writer-shared/writer-profile");
const {
  buildSubmissionContext,
} = require("../services/submission-note-writer/context-builder");
const {
  draftNote,
  sharpenNote,
  shortenNote,
} = require("../services/submission-note-writer/note-writer");
const {
  validateSubmissionNoteInput,
} = require("../services/submission-note-writer/input-validator");

async function resolveAgency({ agencyId, agencyName }) {
  if (agencyId) {
    const row = await knex("agencies")
      .where({ id: agencyId })
      .select("name", "location", "description", "open_boards")
      .first();
    if (row) {
      return {
        name: row.name,
        location: row.location || null,
        description: row.description || null,
        openBoards: row.open_boards || [],
      };
    }
  }
  if (agencyName && String(agencyName).trim()) {
    return {
      name: String(agencyName).trim(),
      location: null,
      description: null,
      openBoards: [],
    };
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
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const { agencyId, agencyName, targetBoards, note } = req.body || {};
    const noteInput = validateSubmissionNoteInput(note);
    if (!noteInput.valid) {
      return apiResponse.error(res, noteInput.error, 400);
    }
    const trimmedNote = noteInput.note;
    const agency = await resolveAgency({ agencyId, agencyName });

    const context = buildSubmissionContext(profile, {
      agency,
      targetBoards,
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
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const { agencyId, agencyName, targetBoards, note } = req.body || {};
    const noteInput = validateSubmissionNoteInput(note, {
      minLength: 10,
      minLengthMessage: "Note must be at least 10 characters to sharpen",
    });
    if (!noteInput.valid) {
      return apiResponse.error(res, noteInput.error, 400);
    }

    const trimmedNote = noteInput.note;
    const agency = await resolveAgency({ agencyId, agencyName });
    const context = buildSubmissionContext(profile, {
      agency,
      targetBoards,
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
    const profile = await requireTalentProfile(req, res);
    if (!profile) return;

    const { note } = req.body || {};
    const noteInput = validateSubmissionNoteInput(note, {
      minLength: 50,
      minLengthMessage: "Note must be at least 50 characters to shorten",
    });
    if (!noteInput.valid) {
      return apiResponse.error(res, noteInput.error, 400);
    }

    const trimmedNote = noteInput.note;
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
