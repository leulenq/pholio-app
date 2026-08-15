"use strict";

/*
 * Comp card import routes.
 *
 * POST   /api/talent/comp-card-import              upload a card, get a proposal
 * GET    /api/talent/comp-card-import/:id          re-read a proposal
 * POST   /api/talent/comp-card-import/:id/confirm  apply the fields the talent accepted
 * POST   /api/talent/comp-card-import/:id/discard  throw the proposal away
 *
 * Two properties this file is responsible for:
 *
 * 1. **The upload is never stored.** Multer holds the card in memory, it is read,
 *    and the buffer goes out of scope. Nothing is written to disk or to R2.
 *    Persisting the card is the *attachment* feature, which the plan separates
 *    from import deliberately and which this change does not build.
 *
 * 2. **No payment gate.** Not on upload, not on extraction, not on the pre-fill.
 *    Import improves what an agency receives, and A1 invariants 2 and 3 make that
 *    identical for every talent regardless of what they pay. There is deliberately
 *    no `is_pro` check anywhere in this file — compare `bio.js`, where the gate is
 *    correct because a refined bio is something the talent keeps for themselves.
 */

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const knex = require("../../../shared/db/knex");
const config = require("../../../config");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  buildProfileUpdate,
  importCompCard,
  isSupportedMime,
} = require("../services/comp-card-import");

/**
 * In-memory only. A comp card is read and dropped; there is no storage engine
 * here on purpose, so there is no code path that could persist one by accident.
 */
const uploadCard = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (isSupportedMime(file.mimetype)) return cb(null, true);
    cb(new Error("Upload a PDF, JPEG, PNG or WebP comp card."));
  },
});

/** Multer rejects (size, type) are user-facing 400s, not 500s. */
function handleUploadErrors(req, res, next) {
  uploadCard.single("card")(req, res, (err) => {
    if (!err) return next();
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    return apiResponse.error(
      res,
      tooLarge
        ? `That file is larger than ${Math.round(config.maxUploadBytes / (1024 * 1024))}MB.`
        : err.message || "That file could not be uploaded.",
      400,
      { code: tooLarge ? "FILE_TOO_LARGE" : "UNSUPPORTED_FILE" },
    );
  });
}

async function loadImport(id, userId) {
  if (!id || typeof id !== "string") return null;
  return knex("comp_card_imports").where({ id, user_id: userId }).first();
}

function parseStored(row) {
  try {
    return JSON.parse(row.proposal_json);
  } catch {
    return null;
  }
}

/** The client never needs the raw row; it needs the proposal plus its id and state. */
function serialise(row, proposal) {
  return {
    id: row.id,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at || null,
    discardedAt: row.discarded_at || null,
    ...proposal,
  };
}

router.post(
  "/",
  requireRole("TALENT"),
  handleUploadErrors,
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer?.length) {
      return apiResponse.error(res, "Choose a comp card to upload.", 400, {
        code: "NO_FILE",
      });
    }

    // Registry agencies, so a card naming one can be linked rather than guessed.
    const knownAgencies = await knex("agencies").select("id", "name").limit(2000);

    const proposal = await importCompCard(
      req.file.buffer,
      { mimeType: req.file.mimetype, filename: req.file.originalname },
      { knownAgencies },
    );

    const row = {
      id: uuidv4(),
      user_id: req.session.userId,
      extraction_method: proposal.source.method || "none",
      extraction_reason: proposal.source.reason || null,
      source_filename: proposal.source.filename ? String(proposal.source.filename).slice(0, 255) : null,
      source_mime_type: proposal.source.mimeType || null,
      proposal_json: JSON.stringify(proposal),
      created_at: new Date().toISOString(),
    };
    await knex("comp_card_imports").insert(row);

    // 201 even when nothing was read. An empty proposal is a working manual-entry
    // screen, not a failure — the flow must never dead-end.
    return apiResponse.success(res, serialise(row, proposal), 201);
  }),
);

router.get(
  "/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const row = await loadImport(req.params.id, req.session.userId);
    if (!row) return apiResponse.notFound(res, "Import not found");
    const proposal = parseStored(row);
    if (!proposal) return apiResponse.error(res, "That import could not be read.", 500);
    return apiResponse.success(res, serialise(row, proposal));
  }),
);

router.post(
  "/:id/confirm",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const row = await loadImport(req.params.id, req.session.userId);
    if (!row) return apiResponse.notFound(res, "Import not found");
    if (row.confirmed_at) {
      return apiResponse.error(res, "That import was already applied.", 409, {
        code: "ALREADY_CONFIRMED",
      });
    }
    if (row.discarded_at) {
      return apiResponse.error(res, "That import was discarded.", 409, { code: "DISCARDED" });
    }

    const proposal = parseStored(row);
    if (!proposal) return apiResponse.error(res, "That import could not be read.", 500);

    const accepted = req.body?.accepted;
    if (!accepted || typeof accepted !== "object" || Array.isArray(accepted)) {
      return apiResponse.error(res, "Nothing was selected to apply.", 400, {
        code: "NOTHING_ACCEPTED",
      });
    }

    // The proposal is the authority on what may be written, not the request body.
    const { update, applied, rejected } = buildProfileUpdate(proposal, accepted);

    if (!applied.length) {
      return apiResponse.error(res, "None of those fields could be applied.", 400, {
        code: "NOTHING_APPLIED",
        rejected,
      });
    }

    const profile = await knex("profiles").where({ user_id: req.session.userId }).first("id");
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    // The `row.confirmed_at` check above was a read; two confirms racing both
    // pass it and both write the profile. The claim is what decides, so it goes
    // first and is conditional on the proposal still being unclaimed — the
    // loser's update matches zero rows and it rolls back without touching the
    // profile. Same shape as the withdrawn→pending revival in `applications.js`.
    let claimed = true;
    await knex.transaction(async (trx) => {
      const rows = await trx("comp_card_imports")
        .where({ id: row.id })
        .whereNull("confirmed_at")
        .whereNull("discarded_at")
        .update({
          accepted_json: JSON.stringify(applied),
          confirmed_at: new Date().toISOString(),
        });
      if (rows !== 1) {
        claimed = false;
        return;
      }
      await trx("profiles")
        .where({ user_id: req.session.userId })
        .update({ ...update, updated_at: new Date().toISOString() });
    });

    if (!claimed) {
      return apiResponse.error(res, "That import was already applied.", 409, {
        code: "ALREADY_CONFIRMED",
      });
    }

    return apiResponse.success(res, {
      id: row.id,
      applied,
      rejected,
      // Named plainly so the client can say "declared on import" rather than
      // letting the profile read as freshly measured.
      measurementsSource: update.measurements_source || null,
    });
  }),
);

router.post(
  "/:id/discard",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const row = await loadImport(req.params.id, req.session.userId);
    if (!row) return apiResponse.notFound(res, "Import not found");
    if (!row.confirmed_at && !row.discarded_at) {
      await knex("comp_card_imports")
        .where({ id: row.id })
        .update({ discarded_at: new Date().toISOString() });
    }
    return apiResponse.success(res, { id: row.id, discarded: true });
  }),
);

module.exports = router;
