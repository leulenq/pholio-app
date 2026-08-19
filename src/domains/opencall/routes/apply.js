"use strict";

/**
 * The anonymous apply surface
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.1–§5.3, §7).
 *
 * Mounted under `/api/public/opencall`. Six endpoints, one shape: resolve the
 * link by code, resolve the draft from the httpOnly cookie, do one thing, and
 * never let the response body answer a question the applicant did not ask.
 *
 * FIVE POSTURES
 *
 * 1. **`identity_policy` decides whether this surface exists for a call** (§7).
 *    Anything other than `account_optional` answers `{accountRequired: true}`
 *    and the client falls back to today's arrival → signup flow. Nothing about
 *    the current behaviour is deleted; it became a setting.
 * 2. **Deploy-before-migrate.** Every handler is guarded by
 *    `hasApplicantIdentitySchema`, mirroring `claim.js` and `hasOpenCallSchema`
 *    in `src/routes/api/public.js`: no schema, no-op JSON, never a 500.
 * 3. **No oracle at the email step** (§5.3). `POST /draft/email` returns the
 *    same body for a new address, an unclaimed identity and a full Pholio
 *    account. The branch lives in the email, which requires the mailbox.
 * 4. **The upload gate is not an oracle either.** `EMAIL_REQUIRED` fires for
 *    every applicant who has not completed the email step, regardless of who
 *    they are. It is §7's abuse control: every stored asset has an accountable
 *    address attached before it exists.
 * 5. **No same-origin requirement**, matching `claim.js` and
 *    `POST /api/public/open-call/:code/arrival`. What stands in for CSRF here
 *    is the draft cookie's `sameSite: lax` — a cross-site POST arrives without
 *    it, so a third-party page has no draft to write to — plus the fact that
 *    submit requires a fingerprint only a same-origin reader can obtain.
 *
 * A NOTE ON ECHOING SAVED ANSWERS. `GET /call/:code` and `GET /call/:code/draft`
 * return the stored answer VALUES to the holder of the draft cookie, not just
 * the keys. That cookie is a 256-bit httpOnly bearer token which already stands
 * for the entire draft — it can add answers, upload photos and submit the
 * application — so withholding the values from it protects nothing and would
 * make a resumed form come back blank, which is the abandonment §5.1's autosave
 * exists to prevent. Both endpoints echo values; neither ever echoes anything
 * about a *different* draft.
 */

const express = require("express");

const knex = require("../../../shared/db/knex");
const {
  CUSTOM_QUESTION_LIMITS,
  IDENTITY_POLICIES,
  INTAKE_FIELDS,
} = require("../../../shared/constants/open-call-intake");
const {
  FUNNEL_EVENT_TYPES,
} = require("../../../shared/constants/event-casting");
const {
  anonIdFromRequest,
  recordEventFunnelEvent,
} = require("../../../shared/services/event-funnel");
const {
  findActiveLinkByCode,
} = require("../../talent/services/open-call-claims");
const { briefDTO } = require("../../agency/services/open-call-brief");
const { upload } = require("../../../shared/lib/uploader");
const { hasApplicantIdentitySchema } = require("../services/schema");
const { storeSubmissionMedia } = require("../services/media");
const {
  SUBMISSION_STATUSES,
  attachIdentity,
  clearDraftToken,
  evaluateApplySpec,
  getOrCreateDraft,
  hashDraftToken,
  issueDraftToken,
  loadCallContext,
  loadDraftMedia,
  packageFingerprint,
  parseJsonColumn,
  readDraftToken,
  submitDraft,
  updateDraftAnswers,
} = require("../services/submissions");

const router = express.Router();

/** The one shape an unusable code ever produces — `claim.js`'s INVALID. */
const INVALID = { success: true, data: { valid: false } };

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({
    success: false,
    error: code,
    message,
    ...extra,
  });
}

/** Safe agency fields only, exactly as the arrival endpoint projects them. */
function agencyDTO(link) {
  return {
    id: link.agency_id,
    name: link.agency_name,
    location: link.agency_location,
    logo: link.agency_logo,
    website: link.agency_website,
  };
}

/** The spec as a form: what to ask, in what order, and how hard. */
function specDTO(call) {
  return {
    version: call.specVersion,
    fields: call.applyFields.map((entry) => ({
      key: entry.key,
      kind: INTAKE_FIELDS[entry.key]?.kind || null,
      label: INTAKE_FIELDS[entry.key]?.label || entry.key,
      requirement: entry.requirement,
      stage: entry.stage,
    })),
    // Shown to the applicant as "what happens if they shortlist you", never
    // asked at this stage (§2.3).
    shortlistFields: call.spec
      .filter((entry) => entry.stage === "shortlist" && entry.requirement !== "hidden")
      .map((entry) => ({
        key: entry.key,
        label: INTAKE_FIELDS[entry.key]?.label || entry.key,
        requirement: entry.requirement,
      })),
    customQuestionLimits: CUSTOM_QUESTION_LIMITS,
  };
}

/**
 * Resolve link + call + (optionally) the draft this cookie points at.
 *
 * Returns null after writing the response when the call cannot serve this
 * surface, so every handler can `if (!ctx) return;`.
 */
async function resolveContext(req, res, { requireDraft = false } = {}) {
  if (!(await hasApplicantIdentitySchema(knex))) {
    res.json(INVALID);
    return null;
  }

  const link = await findActiveLinkByCode(knex, req.params.code);
  if (!link) {
    // Never confirms whether an unknown code maps to a real agency.
    res.json(INVALID);
    return null;
  }

  let call;
  try {
    call = await loadCallContext(knex, link);
  } catch (error) {
    if (error.code === "INVALID_INTAKE_SPEC") {
      console.error(
        "[OpenCall Apply] Stored intake_spec is not usable:",
        link.id,
        error.message,
      );
      fail(
        res,
        503,
        "CALL_UNAVAILABLE",
        "This call is not accepting applications right now.",
      );
      return null;
    }
    throw error;
  }
  if (!call) {
    res.json(INVALID);
    return null;
  }

  if (call.identityPolicy !== IDENTITY_POLICIES.ACCOUNT_OPTIONAL) {
    // Today's behaviour, preserved exactly (§7). The client falls back to the
    // arrival page and the account-backed flow.
    ok(res, {
      valid: true,
      accountRequired: true,
      agency: agencyDTO(link),
      brief: briefDTO(link),
      closed: call.closed,
    });
    return null;
  }

  const rawToken = readDraftToken(req);
  let draft = null;
  if (rawToken) {
    draft = await knex("open_call_submissions")
      .where({
        draft_token_hash: hashDraftToken(rawToken),
        open_call_link_id: call.linkId,
      })
      .first();
  }

  if (requireDraft && (!draft || draft.status !== SUBMISSION_STATUSES.DRAFT)) {
    if (draft && draft.status === SUBMISSION_STATUSES.SUBMITTED) {
      fail(res, 409, "ALREADY_APPLIED", "You have already applied to this call.");
      return null;
    }
    fail(
      res,
      404,
      "DRAFT_NOT_FOUND",
      "Start the application again — this one is no longer open.",
    );
    return null;
  }

  return { link, call, draft, rawToken };
}

/** The state a resume screen needs, and the fingerprint a consent screen binds to. */
async function draftStateDTO(call, draft) {
  if (!draft) {
    return {
      hasDraft: false,
      answers: {},
      customAnswers: {},
      mediaPresent: [],
      identityAttached: false,
      blockers: evaluateApplySpec(call.spec, {}, []),
      packageFingerprint: null,
    };
  }

  const answers = parseJsonColumn(draft.answers);
  const customAnswers = parseJsonColumn(draft.custom_answers);
  const mediaRows = await loadDraftMedia(knex, draft.id);

  return {
    hasDraft: true,
    submitted: draft.status === SUBMISSION_STATUSES.SUBMITTED,
    answers,
    customAnswers,
    answersPresentKeys: Object.keys(answers).sort(),
    mediaPresent: mediaRows
      .filter((row) => row.moderation_state !== "rejected")
      .map((row) => row.field_key),
    identityAttached: Boolean(draft.applicant_identity_id),
    blockers: evaluateApplySpec(call.spec, answers, mediaRows),
    packageFingerprint: packageFingerprint({
      answers,
      customAnswers,
      mediaRows,
      specVersion: draft.intake_spec_version,
    }),
  };
}

/** Fire-and-forget funnel write. Observability never changes behaviour. */
function recordFunnel(req, call, eventType) {
  recordEventFunnelEvent({
    openCallLinkId: call.linkId,
    agencyId: call.agencyId,
    anonId: anonIdFromRequest(req),
    eventType,
  }).catch(() => {});
}

/**
 * GET /api/public/opencall/call/:code
 *
 * Screen one of the form (§5.1): the call, the compensation stated verbatim,
 * the deadline, the questions to ask — and whether there is a draft to resume.
 */
router.get("/call/:code", async (req, res) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { link, call, draft } = ctx;

    return ok(res, {
      valid: true,
      accountRequired: false,
      agency: agencyDTO(link),
      brief: briefDTO(link),
      callKind: call.callKind,
      event: call.eventCall?.event || null,
      compensation: call.eventCall?.compensation || null,
      closed: call.closed,
      identityPolicy: call.identityPolicy,
      spec: specDTO(call),
      // A signed-in talent is offered their dashboard, never forced into it,
      // and this flow does not prefill from their profile (§5.3's fast path is
      // the existing arrival flow, not a second implementation).
      authenticated: Boolean(req.session?.userId && req.session.role === "TALENT"),
      resume: await draftStateDTO(call, draft),
    });
  } catch (error) {
    console.error("[OpenCall Apply] GET /call/:code failed:", error.message);
    return fail(res, 500, "CALL_LOAD_FAILED", "Failed to load this call.");
  }
});

/**
 * GET /api/public/opencall/call/:code/draft — the current draft, for resume.
 */
router.get("/call/:code/draft", async (req, res) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    return ok(res, await draftStateDTO(ctx.call, ctx.draft));
  } catch (error) {
    console.error("[OpenCall Apply] GET /call/:code/draft failed:", error.message);
    return fail(res, 500, "DRAFT_LOAD_FAILED", "Failed to load your application.");
  }
});

/**
 * POST /api/public/opencall/call/:code/draft
 * Body: { answers?: object, customAnswers?: object }
 *
 * The autosave (§5.1). Creates the draft and sets the cookie on first write —
 * a visitor who reads the call and leaves is never given one.
 */
router.post("/call/:code/draft", async (req, res) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { call, rawToken } = ctx;

    if (call.closed) {
      return fail(res, 409, "CALL_CLOSED", "This call has closed.");
    }
    if (ctx.draft && ctx.draft.status === SUBMISSION_STATUSES.SUBMITTED) {
      return fail(res, 409, "ALREADY_APPLIED", "You have already applied to this call.");
    }

    const { draft, rawToken: token, created } = await getOrCreateDraft(knex, {
      link: { id: call.linkId, agency_id: call.agencyId },
      rawToken,
      ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      userAgent: req.get("user-agent"),
      specVersion: call.specVersion,
    });

    if (created) {
      issueDraftToken(res, token);
      // Design C2: `application_started` was previously unreachable before an
      // account existed, which is exactly why the funnel could prove the leak
      // and not locate it. Here it fires at the first keystroke banked.
      recordFunnel(req, call, FUNNEL_EVENT_TYPES.APPLICATION_STARTED);
    }

    const saved = await updateDraftAnswers(knex, {
      draft,
      spec: call.spec,
      answers: req.body?.answers,
      customAnswers: req.body?.customAnswers,
    });

    const mediaRows = await loadDraftMedia(knex, draft.id);
    return ok(res, {
      savedKeys: saved.savedKeys,
      // Advisory here: an autosave reports what is still missing, it does not
      // refuse a partial answer set (§5.1 — nothing is required to save).
      blockers: evaluateApplySpec(call.spec, saved.answers, mediaRows),
      identityAttached: Boolean(saved.draft.applicant_identity_id),
      mediaPresent: mediaRows
        .filter((row) => row.moderation_state !== "rejected")
        .map((row) => row.field_key),
      packageFingerprint: packageFingerprint({
        answers: saved.answers,
        customAnswers: saved.customAnswers,
        mediaRows,
        specVersion: saved.draft.intake_spec_version,
      }),
    });
  } catch (error) {
    if (error.code === "INTAKE_VALIDATION_FAILED") {
      return fail(res, 400, error.code, error.message, { errors: error.errors });
    }
    console.error("[OpenCall Apply] POST /call/:code/draft failed:", error.message);
    return fail(res, 500, "DRAFT_SAVE_FAILED", "Failed to save your answers.");
  }
});

/**
 * POST /api/public/opencall/call/:code/draft/email
 * Body: { email: string, phone?: string }
 *
 * THE RESPONSE NEVER DIFFERS BY WHETHER THE ADDRESS HAS AN ACCOUNT (§5.3).
 */
router.post("/call/:code/draft/email", async (req, res) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { call, rawToken } = ctx;

    if (call.closed) {
      return fail(res, 409, "CALL_CLOSED", "This call has closed.");
    }
    if (ctx.draft && ctx.draft.status === SUBMISSION_STATUSES.SUBMITTED) {
      return fail(res, 409, "ALREADY_APPLIED", "You have already applied to this call.");
    }

    // The email step may be the first write of all — the applicant who opens
    // the link and types their address before anything else still gets a draft.
    const { draft, rawToken: token, created } = await getOrCreateDraft(knex, {
      link: { id: call.linkId, agency_id: call.agencyId },
      rawToken,
      ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      userAgent: req.get("user-agent"),
      specVersion: call.specVersion,
    });
    if (created) {
      issueDraftToken(res, token);
      recordFunnel(req, call, FUNNEL_EVENT_TYPES.APPLICATION_STARTED);
    }

    await attachIdentity(knex, {
      draft,
      spec: call.spec,
      email: req.body?.email,
      phone: req.body?.phone,
    });

    // One body, every case. `ensureIdentityForEmail` knows whether this
    // identity is new and whether it was disowned; neither fact leaves here.
    return ok(res, { attached: true });
  } catch (error) {
    if (error.code === "INTAKE_VALIDATION_FAILED") {
      return fail(res, 400, error.code, "Enter a valid email address.", {
        errors: error.errors,
      });
    }
    if (error.code === "IDENTITY_EMAIL_INVALID") {
      return fail(res, 400, "INTAKE_VALIDATION_FAILED", "Enter a valid email address.", {
        errors: [{ key: "email", code: "invalid_email" }],
      });
    }
    console.error("[OpenCall Apply] POST /call/:code/draft/email failed:", error.message);
    return fail(res, 500, "EMAIL_STEP_FAILED", "Failed to save your email.");
  }
});

/**
 * POST /api/public/opencall/call/:code/draft/media/:fieldKey
 * multipart/form-data, field name `media`.
 *
 * Photos come last (ruling Q7) and behind the email step (§7): every stored
 * asset has an accountable address attached before it exists.
 */
router.post(
  "/call/:code/draft/media/:fieldKey",
  (req, res, next) => {
    upload.single("media")(req, res, (error) => {
      if (!error) return next();
      // Multer's own ceilings — `config.maxUploadBytes` and the JPG/PNG/WEBP
      // filter — surface as coded 400s rather than a 500.
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return fail(
        res,
        400,
        tooLarge ? "MEDIA_TOO_LARGE" : "UNSUPPORTED_MEDIA_TYPE",
        tooLarge
          ? "That photo is too large. Try one under 8 MB."
          : "Only JPG, PNG or WEBP images are accepted.",
      );
    });
  },
  async (req, res) => {
    try {
      const ctx = await resolveContext(req, res, { requireDraft: true });
      if (!ctx) return;
      const { call, draft } = ctx;

      if (call.closed) {
        return fail(res, 409, "CALL_CLOSED", "This call has closed.");
      }
      if (!draft.applicant_identity_id) {
        // The design gate, not an oracle: it fires for everyone who has not
        // done the email step.
        return fail(
          res,
          403,
          "EMAIL_REQUIRED",
          "Add your email address before sending photos.",
        );
      }

      const stored = await storeSubmissionMedia(knex, {
        submission: draft,
        spec: call.spec,
        fieldKey: req.params.fieldKey,
        file: req.file,
      });

      const answers = parseJsonColumn(draft.answers);
      const customAnswers = parseJsonColumn(draft.custom_answers);
      const mediaRows = await loadDraftMedia(knex, draft.id);
      return ok(res, {
        stored: true,
        fieldKey: req.params.fieldKey,
        replaced: stored.replaced,
        mediaPresent: mediaRows
          .filter((row) => row.moderation_state !== "rejected")
          .map((row) => row.field_key),
        blockers: evaluateApplySpec(call.spec, answers, mediaRows),
        packageFingerprint: packageFingerprint({
          answers,
          customAnswers,
          mediaRows,
          specVersion: draft.intake_spec_version,
        }),
      });
    } catch (error) {
      switch (error.code) {
        case "UNKNOWN_MEDIA_FIELD":
        case "MEDIA_FIELD_NOT_REQUESTED":
        case "MEDIA_FILE_REQUIRED":
        case "UNSUPPORTED_MEDIA_TYPE":
        case "MEDIA_REJECTED":
          return fail(res, 400, error.code, error.message);
        case "MEDIA_LIMIT_REACHED":
          return fail(res, 409, error.code, error.message);
        default:
          console.error(
            "[OpenCall Apply] POST /call/:code/draft/media failed:",
            error.message,
          );
          return fail(res, 500, "MEDIA_UPLOAD_FAILED", "Failed to save that photo.");
      }
    }
  },
);

/**
 * POST /api/public/opencall/call/:code/submit
 * Body: { consent: { confirmed, accuracyConfirmed, adultAuthorityConfirmed, packageFingerprint } }
 *
 * Never returns the application id: an anonymous caller has no use for an
 * internal identifier, and handing one out makes it a thing to guess at.
 */
router.post("/call/:code/submit", async (req, res) => {
  try {
    const ctx = await resolveContext(req, res, { requireDraft: true });
    if (!ctx) return;
    const { call, draft } = ctx;

    const result = await submitDraft(knex, {
      call,
      draft,
      consent: req.body?.consent,
      req,
    });

    clearDraftToken(res);
    return ok(res, {
      submitted: true,
      receiptEmailQueued: result.receiptEmailQueued,
    });
  } catch (error) {
    switch (error.code) {
      case "ALREADY_APPLIED":
        return fail(res, 409, error.code, error.message);
      case "CONSENT_PACKAGE_CHANGED":
        return fail(
          res,
          409,
          error.code,
          "Your application changed after you confirmed it. Review it and confirm again.",
        );
      case "CALL_CLOSED":
        return fail(res, 409, error.code, "This call has closed.");
      case "INTAKE_INCOMPLETE":
        return fail(res, 400, error.code, "This application is not finished yet.", {
          blockers: error.blockers,
        });
      case "IDENTITY_REQUIRED":
        return fail(
          res,
          400,
          "EMAIL_REQUIRED",
          "Add your email address before sending.",
        );
      case "CONSENT_REQUIRED":
        return fail(
          res,
          400,
          error.code,
          "Confirm the disclosure before sending your application.",
        );
      default:
        console.error("[OpenCall Apply] POST /call/:code/submit failed:", error.message);
        return fail(res, 500, "SUBMIT_FAILED", "Failed to send your application.");
    }
  }
});

module.exports = router;
