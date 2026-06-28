const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole, requireActiveAccount } = require("../../auth/middleware/require-auth");
const {
  getBlockedAgencyIds,
  isAgencyBlockedForTalent,
} = require("../../../shared/lib/blocked-agencies");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const {
  notifyTalentApplicationSubmitted,
} = require("../../../shared/services/notifications");
const {
  notifyAgencyNewApplication,
  notifyAgencyApplicationWithdrawn,
  notifyAgencyNewMessage,
} = require("../../../shared/services/agency-notifications");
const {
  validateSubmissionPackage,
} = require("../services/validate-submission-package");
const { loadImageRightsMap } = require("../../../shared/lib/image-rights");
const logActivity = require("../../agency/routes/agency-log-activity");
const { v4: uuidv4 } = require("uuid");
const {
  CURRENT_SUBMISSION_PROGRAM_VERSION,
  recordSubmissionProgramAcknowledgment,
  requireSubmissionProgramAcknowledgment,
} = require("../../../shared/lib/submission-program");
const {
  SUBMISSION_PROGRAM_CONTENT,
} = require("../../../shared/lib/submission-program-content");
const {
  DRAFT_LIFECYCLE_STATES,
  DRAFT_SCHEMA_VERSION,
  expiryTimestamp,
  expireInactiveDrafts,
  isEligibleAgencyImage,
  mapDraftRow,
  normalizeClientId,
  normalizeClientUpdatedAt,
  normalizeDraftPayloadWithRepairs,
  normalizeStepId,
  parseDraftPayload,
  recordDraftEvent,
  recoveryTimestamp,
  scrubUnrecoverableDrafts,
} = require("../services/application-drafts");

// Statuses a talent may withdraw from (still in process). Terminal states stay put.
const WITHDRAWABLE_STATUSES = new Set([
  "pending",
  "submitted",
  "reviewing",
  "shortlisted",
]);

async function getProfileBySessionUserId(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function submissionRequestHash(body) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(body || {}))
    .digest("hex");
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Verify an agency-invitation token for the /redirect-apply flow.
 *
 * Fail-closed HMAC verification. The invite link that lands a talent on a
 * portfolio (`?ref=agency&agencyId=<id>&token=<token>`) MUST carry a token
 * minted by the agency-invite issuance side using the SAME secret/scheme:
 *
 *   token = HMAC_SHA256(process.env.AGENCY_INVITE_SECRET, `${agencyId}`)
 *           encoded as lowercase hex
 *
 * Optionally the token may be bound to a specific profile by signing
 * `${agencyId}:${profileId}` instead; we accept either binding so issuance can
 * choose. There is currently NO issuance code in the repo that mints this
 * token — until that is built, this endpoint correctly rejects every request.
 *
 * Security notes:
 * - If AGENCY_INVITE_SECRET is unset, we reject (never accept arbitrary tokens).
 * - Comparison uses crypto.timingSafeEqual to avoid timing oracles.
 *
 * @param {string} token - hex-encoded HMAC from the invite link
 * @param {string} agencyId - agency the invite is for
 * @param {string} profileId - the authenticated talent's profile id
 * @returns {boolean} true only if the token is a valid signature
 */
function verifyAgencyInviteToken(token, agencyId, profileId) {
  const secret = process.env.AGENCY_INVITE_SECRET;
  if (!secret || typeof token !== "string" || !agencyId) {
    return false;
  }

  // Token must be lowercase hex of the right length for an SHA-256 HMAC (64 chars).
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return false;
  }

  const providedBuf = Buffer.from(token, "hex");

  // Accept either an agency-only binding or an agency+profile binding so the
  // issuance side can pick the stricter form without breaking verification.
  const payloads = [`${agencyId}`, `${agencyId}:${profileId}`];
  for (const payload of payloads) {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest();
    if (
      providedBuf.length === expected.length &&
      crypto.timingSafeEqual(providedBuf, expected)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * GET /api/talent/applications/submission-program-status
 * Whether the talent must acknowledge the submission program notice.
 */
router.get(
  "/submission-program-status",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const user = await knex("users").where({ id: req.session.userId }).first();
    const acknowledged = requireSubmissionProgramAcknowledgment(user, {
      throwOnMissing: false,
    });

    return res.json({
      success: true,
      data: {
        needsAcknowledgment: !acknowledged,
        currentVersion: CURRENT_SUBMISSION_PROGRAM_VERSION,
        content: SUBMISSION_PROGRAM_CONTENT,
      },
    });
  }),
);

/**
 * POST /api/talent/applications/submission-program-acknowledgment
 * Record one-time (per version) acknowledgment of the submission program notice.
 */
router.post(
  "/submission-program-acknowledgment",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    if (req.body?.acknowledged !== true) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        message: "acknowledged: true is required.",
      });
    }

    await recordSubmissionProgramAcknowledgment(knex, req.session.userId);

    return res.json({
      success: true,
      data: {
        acknowledged: true,
        version: CURRENT_SUBMISSION_PROGRAM_VERSION,
      },
    });
  }),
);

/**
 * GET /api/talent/applications
 * List all applications for the current talent
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    // Fetch applications with organization-backed agency info
    const applications = await knex("applications")
      .leftJoin("agencies", "applications.agency_id", "agencies.id")
      .leftJoin("agency_memberships as am", function () {
        this.on("am.agency_id", "=", "agencies.id")
          .andOn("am.membership_role", "=", knex.raw("?", ["OWNER"]))
          .andOn("am.status", "=", knex.raw("?", ["ACTIVE"]));
      })
      .leftJoin("users", "am.user_id", "users.id")
      .where({ profile_id: profile.id })
      .select(
        "applications.id",
        "applications.agency_id",
        "applications.status",
        "applications.created_at",
        "applications.updated_at",
        "agencies.name as agency_name",
        "agencies.location as agency_location",
        "agencies.website as agency_website",
        "agencies.logo_path as agency_logo",
        "agencies.open_boards as agency_open_boards",
        // The talent's submitted note lives in the messages table as the first
        // TALENT-authored message for the application (see POST "/" below).
        knex("messages as note_msg")
          .select("note_msg.message")
          .whereRaw("note_msg.application_id = applications.id")
          .where("note_msg.sender_type", "TALENT")
          .orderBy("note_msg.created_at", "asc")
          .limit(1)
          .as("note"),
      )
      .orderBy("applications.created_at", "desc");

    res.json({ success: true, data: applications });
  }),
);

/**
 * GET /api/talent/applications/prompt-context
 * Determine if talent should see a targeted agency apply prompt
 */
router.get(
  "/prompt-context",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    // Redirect/invite source-of-truth: latest app rows with invited_by_agency_id.
    // redirect-apply writes invited_by_agency_id below, so both flows are normalized.
    const latestRedirectSignal = await knex("applications as a")
      .leftJoin("agencies as ag", "ag.id", "a.invited_by_agency_id")
      .where("a.profile_id", profile.id)
      .whereNotNull("a.invited_by_agency_id")
      .select(
        "a.invited_by_agency_id",
        "a.created_at",
        "ag.id as agency_id",
        "ag.name as agency_name",
        "ag.location as agency_location",
        "ag.logo_path as agency_logo",
        "ag.website as agency_website",
      )
      .orderBy("a.created_at", "desc")
      .first();

    const targetAgencyId = latestRedirectSignal?.invited_by_agency_id || null;
    let alreadyAppliedToTarget = false;

    if (targetAgencyId) {
      const existing = await knex("applications")
        .where({ profile_id: profile.id, agency_id: targetAgencyId })
        .first();
      alreadyAppliedToTarget = !!existing;
    }

    return res.json({
      success: true,
      data: {
        hasRedirectSignal: !!latestRedirectSignal,
        targetAgency: latestRedirectSignal
          ? {
              id: latestRedirectSignal.agency_id,
              name: latestRedirectSignal.agency_name,
              location: latestRedirectSignal.agency_location,
              logo: latestRedirectSignal.agency_logo,
              website: latestRedirectSignal.agency_website,
            }
          : null,
        alreadyAppliedToTarget,
      },
    });
  }),
);

/**
 * POST /api/talent/applications
 * Create a new application (direct apply)
 */
router.post(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const {
      agencyId,
      note,
      submissionPackage,
      draftVersion,
      draftGeneration,
    } = req.body;
    if (!agencyId) {
      return res.status(400).json({
        success: false,
        error: "Agency ID required",
        message: "Agency ID required",
      });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const user = await knex("users").where({ id: req.session.userId }).first();
    // Contact email is owned by users, while the rest of submission readiness
    // lives on profiles. Validate the same combined shape the client receives.
    const submissionProfile = {
      ...profile,
      email: profile.email || user?.email || null,
    };
    if (
      !requireSubmissionProgramAcknowledgment(user, { throwOnMissing: false })
    ) {
      return res.status(403).json({
        success: false,
        error: "SUBMISSION_PROGRAM_ACKNOWLEDGMENT_REQUIRED",
        message:
          "Please acknowledge how agency submissions work on Pholio before submitting.",
      });
    }

    const idempotencyKey = String(
      req.get("Idempotency-Key") || req.body?.idempotencyKey || "",
    ).trim();
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        error: "invalid_idempotency_key",
        message:
          "A valid Idempotency-Key header or idempotencyKey value is required.",
      });
    }
    const expectedDraftVersion = parseNonNegativeInteger(draftVersion);
    const expectedDraftGeneration = parseNonNegativeInteger(draftGeneration);
    if (expectedDraftVersion === null || expectedDraftGeneration === null) {
      return res.status(428).json({
        success: false,
        error: "draft_precondition_required",
        message: "draftVersion and draftGeneration are required.",
      });
    }
    const requestHash = submissionRequestHash(req.body);
    const priorRequest = await knex("application_submission_requests")
      .where({ profile_id: profile.id, idempotency_key: idempotencyKey })
      .first();
    if (priorRequest) {
      if (priorRequest.request_hash !== requestHash) {
        return res.status(409).json({
          success: false,
          error: "idempotency_conflict",
          message: "This idempotency key was already used for another submission.",
        });
      }
      if (priorRequest.status === "completed" && priorRequest.application_id) {
        return res.json({
          success: true,
          id: priorRequest.application_id,
          idempotent: true,
        });
      }
      return res.status(409).json({
        success: false,
        error: "submission_in_progress",
        message: "This application submission is already being processed.",
      });
    }

    if (submissionPackage?.consentConfirmed !== true) {
      return res.status(400).json({
        success: false,
        error: "submission_consent_required",
        message: "Confirm the application package before submitting.",
      });
    }

    await expireInactiveDrafts(knex);
    await scrubUnrecoverableDrafts(knex);

    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }

    // 1. Check if already applied. A previously withdrawn application can be
    //    resubmitted (we revive that row below to preserve its history).
    const existingparams = { profile_id: profile.id, agency_id: agencyId };
    const existing = await knex("applications").where(existingparams).first();
    if (existing && existing.status !== "withdrawn") {
      return res.status(409).json({
        success: false,
        error: "application_already_submitted",
        message: "You've already applied to this agency.",
      });
    }
    const reapplying = !!existing;

    const profileImages = (await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc"))
      .filter(isEligibleAgencyImage);
    let packageImages = profileImages;
    const submittedImageIds = submissionPackage?.imageIds;
    if (Array.isArray(submittedImageIds) && submittedImageIds.length > 0) {
      const idSet = new Set(submittedImageIds);
      packageImages = profileImages.filter((img) => idSet.has(img.id));
    }
    const rightsMap = await loadImageRightsMap(
      knex,
      packageImages.map((img) => img.id),
    );
    const packageValidation = validateSubmissionPackage(submissionProfile, packageImages, {
      rightsMap,
    });
    if (!packageValidation.ok) {
      return res.status(400).json({
        success: false,
        error: "submission_package_incomplete",
        message:
          packageValidation.errors[0]?.message ||
          "Your submission package is not ready to send.",
        errors: packageValidation.errors,
      });
    }

    // 2. Check limits for Free Tier
    if (!profile.is_pro) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const count = await knex("applications")
        .where({ profile_id: profile.id })
        .where("created_at", ">=", startOfMonth)
        .count("id as c")
        .first();

      if (Number(count.c) >= 5) {
        return res.status(403).json({
          success: false,
          error: "Monthly application limit reached",
          message: "Monthly application limit reached",
          limit: 5,
          current: Number(count.c),
          upgradeRequired: true,
        });
      }
    }

    const agency = await knex("agencies")
      .where({ id: agencyId })
      .select("id", "name", "open_boards", "status")
      .first();
    if (!agency) {
      return res.status(404).json({
        success: false,
        error: "Agency not found",
        message: "Agency not found",
      });
    }
    if (String(agency.status || "").toUpperCase() !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "agency_unavailable",
        message: "This agency is not currently accepting applications.",
      });
    }
    let normalizedSubmissionResult;
    try {
      normalizedSubmissionResult = await normalizeDraftPayloadWithRepairs(knex, {
        profileId: profile.id,
        agency,
        payload: {
          schemaVersion: submissionPackage?.schemaVersion,
          boards: submissionPackage?.boards,
          mediaSetId: submissionPackage?.mediaSetId,
          digitalSlotPicks: submissionPackage?.digitalSlotPicks,
          compCardPresetId: submissionPackage?.compCardPresetId,
        },
      });
    } catch (error) {
      if (error.code === "UNSUPPORTED_DRAFT_SCHEMA") {
        return res.status(422).json({
          success: false,
          error: "unsupported_draft_schema",
          message: "This draft was created by a newer version of Pholio.",
          supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
        });
      }
      throw error;
    }
    const normalizedSubmissionReferences = normalizedSubmissionResult.payload;
    if (normalizedSubmissionResult.repairWarnings.length > 0) {
      return res.status(409).json({
        success: false,
        error: "submission_references_changed",
        message:
          "Some saved selections are no longer available. Review the repaired draft before submitting.",
        repairWarnings: normalizedSubmissionResult.repairWarnings,
      });
    }
    if (normalizedSubmissionReferences.mediaSetId !== "current") {
      packageImages = packageImages.filter(
        (image) =>
          String(image.image_type || "").toLowerCase() === "digital" ||
          image.set_id === normalizedSubmissionReferences.mediaSetId,
      );
    }
    const packageImageIdSet = new Set(packageImages.map((image) => image.id));
    for (const [slot, imageId] of Object.entries(
      normalizedSubmissionReferences.digitalSlotPicks,
    )) {
      if (!packageImageIdSet.has(imageId)) {
        delete normalizedSubmissionReferences.digitalSlotPicks[slot];
      }
    }
    const canonicalRightsMap = await loadImageRightsMap(
      knex,
      packageImages.map((image) => image.id),
    );
    const canonicalPackageValidation = validateSubmissionPackage(
      submissionProfile,
      packageImages,
      { rightsMap: canonicalRightsMap },
    );
    if (!canonicalPackageValidation.ok) {
      return res.status(400).json({
        success: false,
        error: "submission_package_incomplete",
        message:
          canonicalPackageValidation.errors[0]?.message ||
          "Your submission package is not ready to send.",
        errors: canonicalPackageValidation.errors,
      });
    }

    // 3. Create (or revive a withdrawn) application, snapshot the exact
    // submission, write its first message, and retire the draft atomically.
    let applicationId;
    const applicationNote = typeof note === "string" ? note.trim() : "";
    const hasSubmissionPackagesTable = await knex.schema.hasTable(
      "talent_submission_packages",
    );
    try {
      await knex.transaction(async (trx) => {
        let agencyGuardQuery = trx("agencies")
          .where({ id: agencyId })
          .select("id", "status");
        if (trx.client.config.client === "pg") {
          agencyGuardQuery = agencyGuardQuery.forUpdate();
        }
        const agencyGuard = await agencyGuardQuery.first();
        if (
          !agencyGuard ||
          String(agencyGuard.status || "").toUpperCase() !== "ACTIVE"
        ) {
          const error = new Error("Agency unavailable");
          error.code = "AGENCY_UNAVAILABLE";
          throw error;
        }

        const draft = await trx("application_drafts")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .first();
        const isActiveDraft =
          draft?.lifecycle_state === DRAFT_LIFECYCLE_STATES.ACTIVE ||
          (draft && !draft.lifecycle_state);
        const currentDraftVersion = isActiveDraft ? Number(draft.version) : 0;
        const currentDraftGeneration = isActiveDraft
          ? Number(draft.generation || 1)
          : 0;
        if (
          (draft && !isActiveDraft) ||
          currentDraftVersion !== expectedDraftVersion ||
          currentDraftGeneration !== expectedDraftGeneration
        ) {
          const error = new Error("Draft version conflict");
          error.code = "DRAFT_CONFLICT";
          throw error;
        }
        if (
          draft &&
          parseDraftPayload(draft.payload).consent !== true
        ) {
          const error = new Error("Draft consent required");
          error.code = "DRAFT_CONSENT_REQUIRED";
          throw error;
        }

        await trx("application_submission_requests").insert({
          id: uuidv4(),
          profile_id: profile.id,
          agency_id: agencyId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          status: "processing",
          created_at: trx.fn.now(),
        });

        if (reapplying) {
          const revived = await trx("applications")
            .where({ id: existing.id, status: "withdrawn" })
            .update({ status: "pending", updated_at: trx.fn.now() });
          if (revived !== 1) {
            const error = new Error("Application already submitted");
            error.code = "APPLICATION_ALREADY_SUBMITTED";
            throw error;
          }
          applicationId = existing.id;
          await logActivity(
            req,
            trx,
            applicationId,
            agencyId,
            "status_change",
            "Application resubmitted",
            { old_status: "withdrawn", new_status: "pending" },
          );
        } else {
          applicationId = uuidv4();
          await trx("applications").insert({
            id: applicationId,
            profile_id: profile.id,
            agency_id: agencyId,
            status: "pending",
          });
        }

        if (
          hasSubmissionPackagesTable &&
          submissionPackage &&
          typeof submissionPackage === "object"
        ) {
          await trx("talent_submission_packages").insert({
            id: uuidv4(),
            user_id: req.session.userId,
            profile_id: profile.id,
            label: `Application to ${agencyId}`,
            payload: {
              applicationId,
              agencyId,
              agencyName: agency.name || null,
              boards: normalizedSubmissionReferences.boards,
              boardLabels: normalizedSubmissionReferences.boards,
              mediaSetId: normalizedSubmissionReferences.mediaSetId,
              mediaSetName: submissionPackage.mediaSetName || null,
              compCardId: submissionPackage.compCardId || null,
              compCardName:
                normalizedSubmissionReferences.compCardPreset?.name ||
                submissionPackage.compCardName ||
                null,
              compCardPresetId:
                normalizedSubmissionReferences.compCardPreset?.id || null,
              compCardPresetName:
                normalizedSubmissionReferences.compCardPreset?.name || null,
              compCardSeed:
                normalizedSubmissionReferences.compCardPreset?.seed || null,
              digitalSlotPicks:
                normalizedSubmissionReferences.digitalSlotPicks,
              imageIds: packageImages.map((image) => image.id),
              readiness: submissionPackage.readiness || null,
              digitalsGaps: Array.isArray(submissionPackage.digitalsGaps)
                ? submissionPackage.digitalsGaps
                : [],
              untypedImageCount:
                Number(submissionPackage.untypedImageCount) || 0,
              consentConfirmed: !!submissionPackage.consentConfirmed,
              submittedAt: new Date().toISOString(),
            },
          });
        }

        if (applicationNote) {
          await trx("messages").insert({
            application_id: applicationId,
            sender_id: req.session.userId,
            sender_type: "TALENT",
            message: applicationNote.slice(0, 1200),
            is_read: false,
          });
        }

        if (draft) {
          const deleted = await trx("application_drafts")
            .where({
              id: draft.id,
              version: currentDraftVersion,
              generation: currentDraftGeneration,
              lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
            })
            .del();
          if (deleted !== 1) {
            const error = new Error("Draft changed during submission");
            error.code = "DRAFT_CONFLICT";
            throw error;
          }
          await recordDraftEvent(trx, {
            ...draft,
            eventType: "submitted",
            lifecycleState: "submitted",
            metadata: { hadDraft: true },
          });
        }

        await trx("application_submission_requests")
          .where({ profile_id: profile.id, idempotency_key: idempotencyKey })
          .update({
            status: "completed",
            application_id: applicationId,
            completed_at: trx.fn.now(),
          });
      });
    } catch (error) {
      if (error.code === "DRAFT_CONFLICT") {
        const latestRow = await knex("application_drafts")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .first();
        const latest = await loadDraftRepresentation(
          knex,
          latestRow,
          profile.id,
          agency,
        );
        return sendDraftConflict(res, latest);
      }
      if (error.code === "DRAFT_CONSENT_REQUIRED") {
        return res.status(409).json({
          success: false,
          error: "draft_consent_required",
          message: "Review and confirm the latest saved draft before submitting.",
        });
      }
      if (error.code === "AGENCY_UNAVAILABLE") {
        return res.status(409).json({
          success: false,
          error: "agency_unavailable",
          message: "This agency is not currently accepting applications.",
        });
      }
      if (error.code === "APPLICATION_ALREADY_SUBMITTED") {
        return res.status(409).json({
          success: false,
          error: "application_already_submitted",
          message: "This application has already been submitted.",
        });
      }
      if (
        error.code === "SQLITE_CONSTRAINT" ||
        error.code === "23505"
      ) {
        const completed = await knex("application_submission_requests")
          .where({ profile_id: profile.id, idempotency_key: idempotencyKey })
          .first();
        if (
          completed?.request_hash === requestHash &&
          completed?.status === "completed" &&
          completed?.application_id
        ) {
          return res.json({
            success: true,
            id: completed.application_id,
            idempotent: true,
          });
        }
        const racedApplication = await knex("applications")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .whereNot("status", "withdrawn")
          .first("id");
        if (racedApplication) {
          return res.status(409).json({
            success: false,
            error: "application_already_submitted",
            message: "This application has already been submitted.",
          });
        }
      }
      throw error;
    }

    try {
      await notifyTalentApplicationSubmitted({
        userId: req.session.userId,
        applicationId,
        agencyId,
        agencyName: agency?.name,
      });
    } catch (notifyErr) {
      console.error(
        "[Applications] Submission notification failed:",
        notifyErr,
      );
    }

    const talentName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    try {
      await notifyAgencyNewApplication({
        agencyId,
        applicationId,
        talentName: talentName || profile.name || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Applications] Agency notification failed:", notifyErr);
    }

    res.json({ success: true, id: applicationId });
  }),
);

/* ── Application drafts ──────────────────────────────────────────────────────
   An in-progress submission, one per (talent, agency). Kept off the
   `applications` table so it can never surface in the agency's inbox until the
   talent actually sends. */

router.use("/drafts", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  next();
});

async function loadDraftRepresentation(db, row, profileId, agency) {
  if (!row) return null;
  const storedPayload = parseDraftPayload(row.payload);
  if (
    Number(row.schema_version) > DRAFT_SCHEMA_VERSION ||
    Number(storedPayload.schemaVersion) > DRAFT_SCHEMA_VERSION
  ) {
    return mapDraftRow(row, {}, Date.now(), {
      agency: agency
        ? {
            id: agency.id,
            name: agency.name || null,
            location: agency.location || null,
            logo: agency.logo_path || null,
            website: agency.website || null,
            status: agency.status || null,
            isBlocked: agency.isBlocked === true,
          }
        : null,
      repairWarnings: [
        {
          code: "unsupported_schema",
          field: "schemaVersion",
          message:
            "This draft was created by a newer version of Pholio and cannot be resumed here.",
        },
      ],
    });
  }
  const normalized = await normalizeDraftPayloadWithRepairs(db, {
    profileId,
    agency,
    payload: storedPayload,
  });
  return mapDraftRow(row, normalized.payload, Date.now(), {
    agency: agency
      ? {
          id: agency.id,
          name: agency.name || null,
          location: agency.location || null,
          logo: agency.logo_path || null,
          website: agency.website || null,
          status: agency.status || null,
          isBlocked: agency.isBlocked === true,
        }
      : null,
    repairWarnings: normalized.repairWarnings,
  });
}

async function getDraftAgency(db, agencyId) {
  return db("agencies")
    .where({ id: agencyId })
    .first(
      "id",
      "name",
      "location",
      "logo_path",
      "website",
      "open_boards",
      "status",
    );
}

function unavailableDraftAgency(agencyId) {
  return {
    id: agencyId,
    name: null,
    location: null,
    logo_path: null,
    website: null,
    open_boards: "[]",
    status: "unavailable",
  };
}

function sendDraftConflict(res, latest) {
  return res.status(409).json({
    success: false,
    error: "draft_conflict",
    message:
      "This draft was updated elsewhere. Choose which version to continue with.",
    latest,
  });
}

function sendDraftLifecycleConflict(res, latest) {
  const state = latest?.lifecycleState;
  const error =
    state === DRAFT_LIFECYCLE_STATES.DELETED
      ? "draft_deleted"
      : state === DRAFT_LIFECYCLE_STATES.EXPIRED
        ? "draft_expired"
        : "draft_conflict";
  const message =
    error === "draft_deleted"
      ? "This draft was deleted. Recover it before making changes."
      : error === "draft_expired"
        ? "This draft expired. Recover it before making changes."
        : "This draft was updated elsewhere.";
  return res.status(409).json({
    success: false,
    error,
    message,
    latest,
  });
}

async function maintainDraftLifecycle() {
  await expireInactiveDrafts(knex);
  await scrubUnrecoverableDrafts(knex);
}

function validateDraftPreconditions(body, { allowZero = true } = {}) {
  const expectedVersion = parseNonNegativeInteger(body?.expectedVersion);
  const expectedGeneration = parseNonNegativeInteger(body?.expectedGeneration);
  if (
    expectedVersion === null ||
    expectedGeneration === null ||
    (!allowZero && (expectedVersion < 1 || expectedGeneration < 1))
  ) {
    return null;
  }
  return { expectedVersion, expectedGeneration };
}

// GET /api/talent/applications/drafts — all drafts the talent can resume,
// recover, or intentionally discard. Submitted applications are never mixed in.
router.get(
  "/drafts",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }
    await maintainDraftLifecycle();
    const blockedAgencyIds = await getBlockedAgencyIds(
      knex,
      req.session.userId,
    );
    const rows = await knex("application_drafts")
      .where({ profile_id: profile.id })
      .whereIn("lifecycle_state", [
        DRAFT_LIFECYCLE_STATES.ACTIVE,
        DRAFT_LIFECYCLE_STATES.DELETED,
        DRAFT_LIFECYCLE_STATES.EXPIRED,
      ])
      .orderBy("updated_at", "desc");
    const data = [];
    for (const row of rows) {
      const agency =
        (await getDraftAgency(knex, row.agency_id)) ||
        unavailableDraftAgency(row.agency_id);
      agency.isBlocked = blockedAgencyIds.has(row.agency_id);
      data.push(
        await loadDraftRepresentation(knex, row, profile.id, agency),
      );
    }
    return res.json({ success: true, data });
  }),
);

// GET /api/talent/applications/drafts/latest — route-level resume when /apply
// is opened without an agency query parameter.
router.get(
  "/drafts/latest",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const blockedAgencyIds = await getBlockedAgencyIds(
      knex,
      req.session.userId,
    );
    const latestQuery = knex("application_drafts as draft")
      .join("agencies as agency", "agency.id", "draft.agency_id")
      .where({
        "draft.profile_id": profile.id,
        "draft.lifecycle_state": DRAFT_LIFECYCLE_STATES.ACTIVE,
      })
      .whereRaw("UPPER(agency.status) = ?", ["ACTIVE"])
      .select("draft.*")
      .orderBy("draft.updated_at", "desc");
    if (blockedAgencyIds.size > 0) {
      latestQuery.whereNotIn("draft.agency_id", [...blockedAgencyIds]);
    }
    const draft = await latestQuery
      .first();
    if (!draft) {
      return res.json({ success: true, data: null });
    }
    const agency = await getDraftAgency(knex, draft.agency_id);
    if (!agency) {
      return res.json({ success: true, data: null });
    }
    return res.json({
      success: true,
      data: await loadDraftRepresentation(knex, draft, profile.id, agency),
    });
  }),
);

// GET /api/talent/applications/drafts/:agencyId — resume a saved draft.
router.get(
  "/drafts/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const agency =
      (await getDraftAgency(knex, req.params.agencyId)) ||
      unavailableDraftAgency(req.params.agencyId);
    agency.isBlocked = await isAgencyBlockedForTalent(
      knex,
      req.session.userId,
      req.params.agencyId,
    );
    const draft = await knex("application_drafts")
      .where({ profile_id: profile.id, agency_id: req.params.agencyId })
      .first();
    res.json({
      success: true,
      data: await loadDraftRepresentation(knex, draft, profile.id, agency),
    });
  }),
);

// PUT /api/talent/applications/drafts/:agencyId — upsert the in-progress dossier.
router.put(
  "/drafts/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const agency = await getDraftAgency(knex, agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        error: "Agency not found",
        message: "Agency not found",
      });
    }
    if (String(agency.status || "").toUpperCase() !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "agency_unavailable",
        message: "This agency is not currently accepting applications.",
      });
    }
    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }
    const submittedApplication = await knex("applications")
      .where({ profile_id: profile.id, agency_id: agencyId })
      .whereNot("status", "withdrawn")
      .first("id");
    if (submittedApplication) {
      return res.status(409).json({
        success: false,
        error: "application_already_submitted",
        message: "This application has already been submitted.",
      });
    }

    const preconditions = validateDraftPreconditions(req.body);
    if (!preconditions) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_precondition",
        message: "Valid expectedVersion and expectedGeneration values are required.",
      });
    }
    const { expectedVersion, expectedGeneration } = preconditions;

    let normalized;
    try {
      normalized = await normalizeDraftPayloadWithRepairs(knex, {
        profileId: profile.id,
        agency,
        payload: req.body?.payload,
      });
    } catch (error) {
      if (error.code === "UNSUPPORTED_DRAFT_SCHEMA") {
        return res.status(422).json({
          success: false,
          error: "unsupported_draft_schema",
          message: "This draft was created by a newer version of Pholio.",
          supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
        });
      }
      throw error;
    }
    const normalizedPayload = normalized.payload;
    const serializedPayload = JSON.stringify(normalizedPayload);
    const clientId = normalizeClientId(req.body?.clientId);
    const clientUpdatedAt = normalizeClientUpdatedAt(req.body?.clientUpdatedAt);
    const currentStepId = normalizeStepId(req.body?.currentStepId);
    let savedRow = null;

    let inactiveRow = null;
    try {
      await knex.transaction(async (trx) => {
        const existing = await trx("application_drafts")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .first();

        if (!existing) {
          if (expectedVersion !== 0 || expectedGeneration !== 0) return;
          const id = uuidv4();
          await trx("application_drafts").insert({
            id,
            profile_id: profile.id,
            agency_id: agencyId,
            payload: serializedPayload,
            schema_version: DRAFT_SCHEMA_VERSION,
            current_step_id: currentStepId,
            version: 1,
            generation: 1,
            lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
            expires_at: expiryTimestamp(),
            repair_warnings: JSON.stringify(normalized.repairWarnings),
            last_saved_by_client_id: clientId,
            client_updated_at: clientUpdatedAt,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
          savedRow = await trx("application_drafts").where({ id }).first();
          await recordDraftEvent(trx, {
            ...savedRow,
            eventType: "created",
            lifecycleState: DRAFT_LIFECYCLE_STATES.ACTIVE,
            metadata: {
              repairCount: normalized.repairWarnings.length,
              repairCodes: normalized.repairWarnings.map((item) => item.code),
            },
          });
          return;
        }

        if (existing.lifecycle_state !== DRAFT_LIFECYCLE_STATES.ACTIVE) {
          inactiveRow = existing;
          return;
        }
        if (
          Number(existing.version) !== expectedVersion ||
          Number(existing.generation || 1) !== expectedGeneration
        ) {
          return;
        }
        const nextVersion = expectedVersion + 1;
        const updated = await trx("application_drafts")
          .where({
            id: existing.id,
            version: expectedVersion,
            generation: expectedGeneration,
            lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
          })
          .update({
            payload: serializedPayload,
            schema_version: DRAFT_SCHEMA_VERSION,
            current_step_id: currentStepId,
            version: nextVersion,
            expires_at: expiryTimestamp(),
            repair_warnings: JSON.stringify(normalized.repairWarnings),
            last_saved_by_client_id: clientId,
            client_updated_at: clientUpdatedAt,
            updated_at: trx.fn.now(),
          });
        if (updated) {
          savedRow = await trx("application_drafts")
            .where({ id: existing.id })
            .first();
          await recordDraftEvent(trx, {
            ...savedRow,
            eventType: "saved",
            lifecycleState: DRAFT_LIFECYCLE_STATES.ACTIVE,
            metadata: {
              repairCount: normalized.repairWarnings.length,
              repairCodes: normalized.repairWarnings.map((item) => item.code),
            },
          });
        }
      });
    } catch (error) {
      if (error.code !== "SQLITE_CONSTRAINT" && error.code !== "23505") {
        throw error;
      }
    }

    if (!savedRow) {
      const latestRow = inactiveRow || await knex("application_drafts")
        .where({ profile_id: profile.id, agency_id: agencyId })
        .first();
      const latest = await loadDraftRepresentation(
        knex,
        latestRow,
        profile.id,
        agency,
      );
      await recordDraftEvent(knex, {
        ...(latestRow || {}),
        profileId: profile.id,
        agencyId,
        eventType: "save_conflict",
        lifecycleState: latest?.lifecycleState || null,
      });
      return sendDraftLifecycleConflict(res, latest);
    }

    return res.json({
      success: true,
      data: await loadDraftRepresentation(
        knex,
        savedRow,
        profile.id,
        agency,
      ),
    });
  }),
);

// DELETE /api/talent/applications/drafts/:agencyId — discard a draft.
router.delete(
  "/drafts/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const agency =
      (await getDraftAgency(knex, req.params.agencyId)) ||
      unavailableDraftAgency(req.params.agencyId);
    const preconditions = validateDraftPreconditions(req.body, {
      allowZero: false,
    });
    if (!preconditions) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_precondition",
        message: "Valid expectedVersion and expectedGeneration values are required.",
      });
    }
    const existing = await knex("application_drafts")
      .where({
        profile_id: profile.id,
        agency_id: req.params.agencyId,
      })
      .first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "draft_not_found",
        message: "Draft not found.",
      });
    }
    const latest = await loadDraftRepresentation(
      knex,
      existing,
      profile.id,
      agency,
    );
    const canDelete = [
      DRAFT_LIFECYCLE_STATES.ACTIVE,
      DRAFT_LIFECYCLE_STATES.EXPIRED,
    ].includes(existing.lifecycle_state);
    if (
      !canDelete ||
      Number(existing.version) !== preconditions.expectedVersion ||
      Number(existing.generation || 1) !== preconditions.expectedGeneration
    ) {
      await recordDraftEvent(knex, {
        ...existing,
        eventType: "delete_conflict",
        lifecycleState: existing.lifecycle_state,
      });
      return sendDraftLifecycleConflict(res, latest);
    }
    const nextVersion = Number(existing.version) + 1;
    const now = new Date();
    const updated = await knex("application_drafts")
      .where({
        id: existing.id,
        version: preconditions.expectedVersion,
        generation: preconditions.expectedGeneration,
        lifecycle_state: existing.lifecycle_state,
      })
      .update({
        lifecycle_state: DRAFT_LIFECYCLE_STATES.DELETED,
        deleted_at: now.toISOString(),
        recoverable_until: recoveryTimestamp(now),
        expires_at: null,
        version: nextVersion,
        updated_at: knex.fn.now(),
      });
    if (updated !== 1) {
      const conflicting = await knex("application_drafts")
        .where({ id: existing.id })
        .first();
      return sendDraftLifecycleConflict(
        res,
        await loadDraftRepresentation(knex, conflicting, profile.id, agency),
      );
    }
    const deleted = await knex("application_drafts")
      .where({ id: existing.id })
      .first();
    await recordDraftEvent(knex, {
      ...deleted,
      eventType: "deleted",
      lifecycleState: DRAFT_LIFECYCLE_STATES.DELETED,
    });
    return res.json({
      success: true,
      data: await loadDraftRepresentation(knex, deleted, profile.id, agency),
    });
  }),
);

// POST /api/talent/applications/drafts/:agencyId/recover
router.post(
  "/drafts/:agencyId/recover",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }
    await maintainDraftLifecycle();
    const agency = await getDraftAgency(knex, req.params.agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        error: "Agency not found",
        message: "Agency not found",
      });
    }
    if (String(agency.status || "").toUpperCase() !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "agency_unavailable",
        message: "This agency is not currently accepting applications.",
      });
    }
    if (
      await isAgencyBlockedForTalent(
        knex,
        req.session.userId,
        req.params.agencyId,
      )
    ) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }
    const expectedGeneration = parseNonNegativeInteger(
      req.body?.expectedGeneration,
    );
    if (expectedGeneration === null || expectedGeneration < 1) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_generation",
        message: "A valid expectedGeneration is required.",
      });
    }
    const existing = await knex("application_drafts")
      .where({
        profile_id: profile.id,
        agency_id: req.params.agencyId,
      })
      .first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "draft_not_found",
        message: "Draft not found or its recovery window has ended.",
      });
    }
    const recoverableUntil = existing.recoverable_until
      ? new Date(existing.recoverable_until)
      : null;
    const isRecoverableState = [
      DRAFT_LIFECYCLE_STATES.DELETED,
      DRAFT_LIFECYCLE_STATES.EXPIRED,
    ].includes(existing.lifecycle_state);
    if (
      !isRecoverableState ||
      Number(existing.generation || 1) !== expectedGeneration ||
      !recoverableUntil ||
      Number.isNaN(recoverableUntil.getTime()) ||
      recoverableUntil.getTime() <= Date.now()
    ) {
      const latest = await loadDraftRepresentation(
        knex,
        existing,
        profile.id,
        agency,
      );
      await recordDraftEvent(knex, {
        ...existing,
        eventType: "recovery_failed",
        lifecycleState: existing.lifecycle_state,
      });
      return sendDraftLifecycleConflict(res, latest);
    }
    const nextGeneration = expectedGeneration + 1;
    const updated = await knex("application_drafts")
      .where({
        id: existing.id,
        generation: expectedGeneration,
        lifecycle_state: existing.lifecycle_state,
      })
      .update({
        lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
        generation: nextGeneration,
        version: 1,
        expires_at: expiryTimestamp(),
        deleted_at: null,
        expired_at: null,
        recoverable_until: null,
        updated_at: knex.fn.now(),
      });
    if (updated !== 1) {
      const conflicting = await knex("application_drafts")
        .where({ id: existing.id })
        .first();
      return sendDraftLifecycleConflict(
        res,
        await loadDraftRepresentation(knex, conflicting, profile.id, agency),
      );
    }
    const recovered = await knex("application_drafts")
      .where({ id: existing.id })
      .first();
    await recordDraftEvent(knex, {
      ...recovered,
      eventType: "recovered",
      lifecycleState: DRAFT_LIFECYCLE_STATES.ACTIVE,
    });
    return res.json({
      success: true,
      data: await loadDraftRepresentation(
        knex,
        recovered,
        profile.id,
        agency,
      ),
    });
  }),
);

/**
 * POST /api/talent/applications/:id/withdraw
 * Withdraw an application
 */
router.post(
  "/:id/withdraw",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();

    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    if (!WITHDRAWABLE_STATUSES.has(application.status)) {
      return res.status(400).json({
        success: false,
        error: "Cannot withdraw",
        message: "This application can no longer be withdrawn.",
      });
    }

    const previousStatus = application.status;

    await knex("applications")
      .where({ id, profile_id: profile.id })
      .update({ status: "withdrawn", updated_at: knex.fn.now() });

    // Preserve the journey: record the withdrawal in application history.
    await logActivity(
      req,
      knex,
      id,
      application.agency_id,
      "status_change",
      "Application withdrawn",
      { old_status: previousStatus, new_status: "withdrawn" },
    );

    // Let the agency know the talent stepped back.
    try {
      const talentName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      await notifyAgencyApplicationWithdrawn({
        agencyId: application.agency_id,
        applicationId: id,
        talentName: talentName || profile.name || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Applications] Withdrawal notification failed:", notifyErr);
    }

    res.json({ success: true });
  }),
);

/**
 * GET /api/talent/applications/:id/activity
 * Status-change history (the lifecycle timeline) for one of the talent's
 * applications. Read-only; scoped to the requesting talent's own profile.
 */
router.get(
  "/:id/activity",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const rows = await knex("application_activities")
      .where({ application_id: id, activity_type: "status_change" })
      .orderBy("created_at", "asc")
      .select("id", "activity_type", "description", "metadata", "created_at");

    const data = rows.map((row) => {
      let metadata = row.metadata;
      if (typeof metadata === "string") {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }
      return {
        id: row.id,
        type: row.activity_type,
        description: row.description,
        metadata: metadata || {},
        created_at: row.created_at,
      };
    });

    res.json({ success: true, data });
  }),
);

/**
 * GET /api/talent/applications/:id/messages
 * Conversation thread for one of the talent's applications. Marks the agency's
 * messages as read on view.
 */
router.get(
  "/:id/messages",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const messages = await knex("messages")
      .where({ application_id: id })
      .orderBy("created_at", "asc")
      .select("id", "sender_type", "message", "attachment_url", "is_read", "created_at");

    await knex("messages")
      .where({ application_id: id, sender_type: "AGENCY", is_read: false })
      .update({ is_read: true, read_at: knex.fn.now() });

    res.json({ success: true, data: messages });
  }),
);

/**
 * POST /api/talent/applications/:id/messages
 * Talent sends a message to the agency from inside the dashboard.
 */
router.post(
  "/:id/messages",
  requireRole("TALENT"),
  requireActiveAccount(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const trimmed = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!trimmed) {
      return res
        .status(400)
        .json({ success: false, error: "Message required", message: "Message is required." });
    }
    if (trimmed.length > 4000) {
      return res
        .status(400)
        .json({ success: false, error: "Too long", message: "Message is too long." });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const messageId = uuidv4();
    await knex("messages").insert({
      id: messageId,
      application_id: id,
      sender_id: req.session.userId,
      sender_type: "TALENT",
      message: trimmed,
      is_read: false,
      created_at: knex.fn.now(),
    });

    await logActivity(
      req,
      knex,
      id,
      application.agency_id,
      "message_sent",
      "Talent sent a message",
      { message_preview: trimmed.substring(0, 100), via: "dashboard" },
    );

    try {
      const talentName =
        [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.name ||
        "A talent";
      await notifyAgencyNewMessage({
        agencyId: application.agency_id,
        applicationId: id,
        talentName,
        preview: trimmed.substring(0, 80),
      });
    } catch (notifyErr) {
      console.error("[Applications] Message notification failed:", notifyErr);
    }

    const newMessage = await knex("messages").where({ id: messageId }).first();
    res.json({ success: true, data: newMessage });
  }),
);

/**
 * POST /api/talent/redirect-apply
 * Handle agency-initiated application via redirect (bypasses limits)
 */
router.post(
  "/redirect-apply",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId, token } = req.body;
    if (!agencyId || !token) {
      return res.status(400).json({
        success: false,
        error: "Agency ID and token required",
        message: "Agency ID and token required",
      });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }

    // Verify the agency-invite token before bypassing the application limit.
    // Fail-closed: forged/missing tokens (and an unset secret) are rejected.
    // See verifyAgencyInviteToken() for the expected token format that the
    // invite-issuance side must produce.
    if (!verifyAgencyInviteToken(token, agencyId, profile.id)) {
      return res.status(403).json({
        success: false,
        error: "Invalid invitation token",
        message: "Invalid invitation token",
      });
    }

    // Check if already applied
    const existingparams = { profile_id: profile.id, agency_id: agencyId };
    const existing = await knex("applications").where(existingparams).first();

    if (existing) {
      return res
        .status(200)
        .json({ success: true, message: "Already applied" });
    }

    // Create Application (No limit check)
    const [appId] = await knex("applications")
      .insert({
        id: knex.raw("gen_random_uuid()"),
        profile_id: profile.id,
        agency_id: agencyId,
        invited_by_agency_id: agencyId,
        status: "pending", // or 'reviewing' immediately since they asked for it?
        // Let's set to 'pending'
      })
      .returning("id");

    const applicationId = typeof appId === "object" ? appId.id : appId;

    const agency = await knex("agencies")
      .where({ id: agencyId })
      .select("name")
      .first();
    const talentName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    try {
      await notifyTalentApplicationSubmitted({
        userId: req.session.userId,
        applicationId,
        agencyId,
        agencyName: agency?.name,
      });
      await notifyAgencyNewApplication({
        agencyId,
        applicationId,
        talentName: talentName || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Redirect Apply] Notification failed:", notifyErr);
    }

    res.json({ success: true, id: applicationId });
  }),
);

module.exports = router;
