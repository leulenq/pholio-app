"use strict";

/**
 * Anonymous uploads, scoped to one draft
 * (`docs/open-call-applicant-flow-design-2026-08.md` §2.2, §7, §7.1).
 *
 * Two camera-roll picks are the highest value-per-second ask in the whole
 * intake (§2.2), and they are also the reason this flow changes Pholio's risk
 * profile: until now every uploaded image belonged to a verified, onboarded
 * account. §7's abuse controls and §7.1's hard gate are therefore not
 * decoration around this file, they are the file's purpose.
 *
 * WHAT GUARDS AN UPLOAD HERE
 *
 *  - **The email step.** `POST …/draft/media/:fieldKey` refuses without an
 *    identity attached (the route's job), so every stored byte already has an
 *    accountable address (§7).
 *  - **The spec.** A field key must be in the closed media vocabulary AND be
 *    something this call actually asks for at apply. An organizer who did not
 *    ask for a profile shot does not receive one.
 *  - **Size and type: multer's, not ours.** `upload` in
 *    `src/shared/lib/uploader.js` already enforces `config.maxUploadBytes`
 *    (8 MB by default) and an `image/jpeg|png|webp` allowlist at the request
 *    boundary. Restating either number here would be two places to change one
 *    limit; the mime is re-checked defensively only because it costs nothing
 *    and this is a public endpoint. HEIC is deliberately NOT accepted — the
 *    shared filter does not accept it, and widening it is `uploader.js`'s
 *    decision, not this module's.
 *  - **Count.** A per-draft ceiling, because the vocabulary has three media
 *    keys and a public endpoint should not be a free object store.
 *  - **Moderation.** The exact processed bytes are analyzed before the row
 *    exists, exactly as the account-backed upload paths do.
 *
 * WHY `review` REFUSES HERE AND KEEPS THE IMAGE THERE
 *
 * `src/domains/talent/routes/media.js` stores a review-flagged image and hides
 * it from viewers through `images.moderation_status`, which
 * `open_call_submission_media` has no equivalent of: its states are
 * pending | approved | rejected, `pending` is what a *good* anonymous upload
 * looks like, and the frozen snapshot the organizer reads carries every
 * non-rejected row. So a flagged upload stored as `pending` would travel
 * straight to the organizer — the one outcome §7.1 exists to prevent. It is
 * therefore refused at the boundary and the applicant is told to send a
 * different photo, which is the same answer media.js gives its *rejected*
 * branch. Stored anonymous media is consequently only ever `pending`, never
 * flagged-and-kept.
 *
 * §7.1'S GATE IS NOT CLOSED BY THIS FILE. A refusal writes a `moderation_queue`
 * row (every column it needs is nullable) with `image_id` NULL — it is a
 * foreign key into `images`, and an anonymous upload has no `images` row until
 * claim — and a `flags.source` marker that survives to review, so refusals are
 * measurable rather than invisible. What it is not is actionable: the moderator
 * API writes verdicts back to `images` only. `csam_escalations` cannot hold one
 * of these at all (`image_id` and `profile_id` are both NOT NULL with foreign
 * keys), so an escalation-worthy anonymous upload is refused and logged rather
 * than escalated through that table. Closing both loops, and re-reading
 * `tasks/csam-escalation-runbook.md` against an anonymous uploader, belongs to
 * the moderation lane and is a prerequisite for enabling this path in any
 * environment. NEITHER TABLE'S SCHEMA IS RELAXED HERE.
 */

const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const {
  INTAKE_FIELDS,
  INTAKE_REQUIREMENTS,
  MEDIA_FIELD_KEYS,
  applyStageFields,
} = require("../../../shared/constants/open-call-intake");
const {
  MODERATION_QUEUE_STATUS,
  MODERATION_STATUS,
  analyzeImageBuffer,
} = require("../../../shared/lib/content-moderation");
const { screenImageForCsam } = require("../../../shared/lib/csam-moderation");
const { processImage } = require("../../../shared/lib/uploader");
const { s3 } = require("../../../shared/lib/uploader");
const config = require("../../../config");

const SUBMISSION_MEDIA_TABLE = "open_call_submission_media";

/** Three media keys exist in the vocabulary; five rows is already generous. */
const MAX_MEDIA_PER_DRAFT = 5;

/** Mirrors `uploader.js`'s fileFilter. Defence in depth, not a second policy. */
const ACCEPTED_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function codedError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  return Object.assign(error, extra);
}

/** Best-effort removal of bytes we decided not to keep. Never throws. */
async function removeStoredArtifacts({ storageKey, absolutePath }) {
  if (absolutePath) {
    try {
      fs.unlinkSync(absolutePath);
    } catch {
      /* already gone */
    }
  }
  if (storageKey && config.r2?.bucket) {
    try {
      const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
      await s3.send(
        new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: storageKey }),
      );
    } catch (error) {
      console.error(
        "[OpenCall Media] Could not remove stored object:",
        error?.message || "unknown",
      );
    }
  }
}

/**
 * The storage key to persist.
 *
 * `processImage` returns an R2 key in production and a `/uploads/...` path
 * locally (where `storageKey` is null). `publicUrlForStorageKey` in claim.js
 * reads both shapes back, so the local path is stored verbatim rather than
 * invented into a fake key.
 */
function storageKeyFromProcessed(processed) {
  return (
    processed?.storageKey ||
    processed?.storage_key ||
    processed?.publicUrl ||
    processed?.path ||
    null
  );
}

/** Is this key something the call asks for at apply, and is it a media key? */
function assertFieldKeyAllowed(spec, fieldKey) {
  if (!MEDIA_FIELD_KEYS.includes(fieldKey)) {
    throw codedError(`Unknown media field: ${fieldKey}`, "UNKNOWN_MEDIA_FIELD");
  }
  const entry = applyStageFields(spec).find((item) => item.key === fieldKey);
  if (!entry || entry.requirement === INTAKE_REQUIREMENTS.HIDDEN) {
    throw codedError(
      `This call does not ask for ${INTAKE_FIELDS[fieldKey]?.label || fieldKey}`,
      "MEDIA_FIELD_NOT_REQUESTED",
    );
  }
  return entry;
}

/**
 * Store (or replace) one upload against one spec key.
 *
 * `UNIQUE(submission_id, field_key)` is the shape of the table: re-uploading a
 * headshot REPLACES it rather than leaving the organizer to guess which of two
 * is current. The old row goes first, then its bytes, best-effort.
 *
 * Coded failures: UNKNOWN_MEDIA_FIELD, MEDIA_FIELD_NOT_REQUESTED,
 * MEDIA_FILE_REQUIRED, UNSUPPORTED_MEDIA_TYPE, MEDIA_LIMIT_REACHED,
 * MEDIA_REJECTED, MEDIA_PROCESSING_FAILED.
 *
 * @returns {Promise<{media: object, replaced: boolean, moderationState: string}>}
 */
async function storeSubmissionMedia(db, { submission, spec, fieldKey, file } = {}) {
  assertFieldKeyAllowed(spec, fieldKey);

  if (!file) {
    throw codedError("A file is required", "MEDIA_FILE_REQUIRED");
  }
  if (!ACCEPTED_MIME_TYPES.includes(String(file.mimetype || "").toLowerCase())) {
    throw codedError(
      "Only JPG, PNG or WEBP images are accepted",
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }

  const existing = await db(SUBMISSION_MEDIA_TABLE)
    .where({ submission_id: submission.id })
    .select("id", "field_key", "storage_key");
  const replacing = existing.find((row) => row.field_key === fieldKey) || null;
  if (!replacing && existing.length >= MAX_MEDIA_PER_DRAFT) {
    throw codedError(
      "This application already has as many photos as it can carry",
      "MEDIA_LIMIT_REACHED",
    );
  }

  const processed = await processImage(file, `oc-${submission.id}`);
  const storageKey = storageKeyFromProcessed(processed);
  if (!storageKey) {
    throw codedError("The image could not be processed", "MEDIA_PROCESSING_FAILED");
  }
  const artifacts = {
    storageKey: processed?.storageKey || processed?.storage_key || null,
    absolutePath: processed?.absolutePath || processed?.absolute_path || null,
  };

  // --- Content moderation, on the exact bytes we persisted ------------------
  // Fails toward review; never auto-approves uncertain content.
  let moderation;
  try {
    moderation = await analyzeImageBuffer(processed.processedBuffer);
  } catch (error) {
    moderation = {
      status: MODERATION_STATUS.REVIEW,
      reason: "moderation_error",
      flags: { error: error.message },
    };
  }
  const csamScreen = await screenImageForCsam(processed.processedBuffer, {
    moderationFlags: moderation.flags,
    moderationReason: moderation.reason,
  });

  const blocked =
    moderation.status === MODERATION_STATUS.REJECTED || csamScreen.shouldBlock;
  // See the module header: an anonymous upload has no state that means
  // "flagged, held back from the organizer", so `review` refuses too.
  const flagged =
    moderation.status === MODERATION_STATUS.REVIEW || csamScreen.shouldEscalate;

  if (blocked || flagged) {
    await removeStoredArtifacts(artifacts);
    await recordRefusedUpload(db, {
      submission,
      fieldKey,
      blocked,
      flags: {
        ...(moderation.flags || {}),
        ...(csamScreen.flags || {}),
        ...(csamScreen.shouldEscalate ? { csam_escalation: true } : {}),
        reason: moderation.reason || null,
      },
    });
    throw codedError(
      blocked
        ? "That image was blocked by automated content moderation and was not saved."
        : "That image could not be accepted automatically. Please send a different photo.",
      "MEDIA_REJECTED",
    );
  }

  const id = uuidv4();
  await db.transaction(async (trx) => {
    if (replacing) {
      await trx(SUBMISSION_MEDIA_TABLE).where({ id: replacing.id }).del();
    }
    await trx(SUBMISSION_MEDIA_TABLE).insert({
      id,
      submission_id: submission.id,
      field_key: fieldKey,
      storage_key: storageKey,
      content_type: processed.deliveryMimeType || file.mimetype || null,
      bytes: processed.deliverySizeBytes ?? file.size ?? null,
      // Never `approved` from an upload. Claim promotes `pending` into
      // `images` with `moderation_status = pending`, so the state carries
      // over instead of being laundered.
      moderation_state: "pending",
      created_at: trx.fn.now(),
    });
  });

  if (replacing) {
    await removeStoredArtifacts({
      storageKey: replacing.storage_key,
      absolutePath: null,
    });
  }

  const media = await db(SUBMISSION_MEDIA_TABLE).where({ id }).first();
  return { media, replaced: Boolean(replacing), moderationState: "pending" };
}

/**
 * Leave a trace of a refused anonymous upload.
 *
 * Guarded by the same `hasTable` check the account-backed upload paths use.
 * `image_id` stays NULL — it is a foreign key into `images`, and the bytes are
 * gone by the time this runs anyway — and the flags carry a `source` marker so
 * refusal rates on this path are measurable instead of invisible, and so the
 * moderation lane has real data to size its work against. Best-effort: an
 * upload is never failed by the bookkeeping about it, and it runs OUTSIDE the
 * media transaction so a queue write can never roll one back.
 */
async function recordRefusedUpload(db, { submission, fieldKey, blocked, flags }) {
  console.warn("[OpenCall Media] Upload refused by moderation:", {
    submissionId: submission.id,
    fieldKey,
    blocked,
    reason: flags?.reason || null,
  });
  try {
    if (!(await db.schema.hasTable("moderation_queue"))) return null;
    const id = uuidv4();
    await db("moderation_queue").insert({
      id,
      image_id: null,
      profile_id: null,
      status: MODERATION_QUEUE_STATUS.PENDING,
      flags: JSON.stringify({
        ...(flags || {}),
        source: "open_call_submission_media",
        refused: true,
        blocked: Boolean(blocked),
        submission_id: submission.id,
        open_call_link_id: submission.open_call_link_id,
        field_key: fieldKey,
      }),
      created_at: db.fn.now(),
    });
    return id;
  } catch (error) {
    console.error(
      "[OpenCall Media] Could not record a refused upload:",
      error?.message || "unknown",
    );
    return null;
  }
}

/** Remove one upload from a draft. Bytes are best-effort; the row is not. */
async function deleteSubmissionMedia(db, { submission, fieldKey } = {}) {
  const row = await db(SUBMISSION_MEDIA_TABLE)
    .where({ submission_id: submission.id, field_key: fieldKey })
    .first();
  if (!row) return { deleted: false };
  await db(SUBMISSION_MEDIA_TABLE).where({ id: row.id }).del();
  await removeStoredArtifacts({ storageKey: row.storage_key, absolutePath: null });
  return { deleted: true };
}

module.exports = {
  ACCEPTED_MIME_TYPES,
  MAX_MEDIA_PER_DRAFT,
  SUBMISSION_MEDIA_TABLE,
  deleteSubmissionMedia,
  storeSubmissionMedia,
};
