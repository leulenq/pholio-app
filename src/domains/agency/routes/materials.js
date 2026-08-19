"use strict";

/**
 * Request materials — the one verb design §6 adds to the organizer's workflow.
 *
 *   > On any shortlisted application (single or bulk), one action sends the
 *   > shortlist-stage asks from the call's intake spec, with a due date. The
 *   > system chases; fulfilment lands in the snapshot; the row shows requested /
 *   > fulfilled / overdue as plain text. This is the moment the organizer
 *   > understands the product is not a form — their current version of this step
 *   > is DMing people one at a time.
 *
 * WHAT THIS EXTENDS RATHER THAN FORKS (ruling R10)
 *
 * - The ask itself is `open_call_material_requests`, keyed to the `applications`
 *   row the inbox already runs on. UNIQUE(application_id): re-requesting updates
 *   the live request rather than stacking deadlines the applicant cannot tell
 *   apart.
 * - Which keys may be asked for is NOT a parameter of this endpoint. It is the
 *   call's own `intake_spec` at `stage: "shortlist"`, read through
 *   `normalizeIntakeSpec` + `shortlistStageFields`. An organizer who wants to
 *   ask for something else edits their spec; this route will not invent a
 *   vocabulary (design §3.1's closed-vocabulary constraint).
 * - The account-backed applicant is notified through the machinery that already
 *   exists for "asked for more": `notifyTalentForApplicationStatus` with the
 *   `requested_more` treatment (`shared/services/notifications.js`) plus
 *   `sendMaterialsRequestedEmail`. No new notification category.
 * - The unclaimed applicant gets a `materials`-purpose claim token and a
 *   tokenized fulfilment link (ruling Q8: no account required).
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * 1. Move the application's status. Requesting materials is not a decision, and
 *    the status machinery has exactly one owner (`inbox.js`). The organizer
 *    shortlists, then asks; those are two acts and the second must not silently
 *    perform the first.
 * 2. Serve the applicant's fulfilment page. That endpoint belongs to the submit
 *    lane, which owns writing into the frozen snapshot.
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const asyncHandler = require("express-async-handler");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  getSessionAgencyId,
  getSessionActorUserId,
} = require("../services/context");
const { recordAuditEvent } = require("../services/audit");
const {
  loadMaterialRequests,
  resolveApplicantIdentity,
  serializeMaterialRequest,
} = require("../services/applicant-identity");
const {
  INTAKE_FIELDS,
  normalizeIntakeSpec,
  shortlistStageFields,
} = require("../../../shared/constants/open-call-intake");
const {
  notifyTalentForApplicationStatus,
} = require("../../../shared/services/notify-talent-application");
const {
  sendEmail,
  sendMaterialsRequestedEmail,
} = require("../../../shared/lib/email");
const {
  buildApplicantMaterialsRequestEmailHtml,
  buildApplicantMaterialsRequestEmailText,
} = require("../../../shared/lib/pholio-email/templates-materials");

const router = express.Router();
mountAgencyApiGuard(router);

/** The status treatment this verb reuses. Never written to the row. */
const REQUESTED_MORE_STATUS = "requested_more";

/** How long a materials token lives. The design's chasing window, in days. */
const MATERIALS_TOKEN_TTL_DAYS = 21;

const TABLE = "open_call_material_requests";

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({
    success: false,
    error: code,
    message,
    ...extra,
  });
}

/** Human labels for the ask band in the email — the vocabulary's own labels. */
function labelsFor(keys) {
  return keys.map((key) => INTAKE_FIELDS[key]?.label || key);
}

/**
 * The application, plus the call it came in through. Scoped to the session
 * agency in the query, not checked afterwards.
 */
async function loadOwnedApplication(agencyId, applicationId) {
  const application = await knex("applications")
    .where({ id: applicationId, agency_id: agencyId })
    .first();
  if (!application) return { application: null, link: null };

  let link = null;
  if (
    application.open_call_link_id &&
    (await knex.schema.hasTable("agency_open_call_links"))
  ) {
    link = await knex("agency_open_call_links")
      .where({ id: application.open_call_link_id, agency_id: agencyId })
      .first();
  }
  return { application, link };
}

/**
 * The keys this call may ask for at the shortlist stage.
 *
 * `intake_spec` NULL means "use the platform default for this call kind" — the
 * deliberate reading `20260819110000` chose so that revising the platform
 * recommendation does not require a data migration over links whose owners never
 * chose those keys.
 */
function allowedShortlistKeys(link) {
  let rawSpec = link?.intake_spec ?? null;
  if (typeof rawSpec === "string") {
    try {
      rawSpec = JSON.parse(rawSpec);
    } catch {
      rawSpec = null;
    }
  }
  const spec = normalizeIntakeSpec(rawSpec, link?.call_kind);
  return shortlistStageFields(spec).map((entry) => entry.key);
}

function parseDueAt(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined; // signals "invalid"
  return date;
}

// ---------------------------------------------------------------------------
// GET the current request
// ---------------------------------------------------------------------------

router.get(
  "/api/agency/applications/:applicationId/material-request",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    const agencyId = getSessionAgencyId(req.session) || req.session?.userId;
    const { applicationId } = req.params;

    const { application } = await loadOwnedApplication(agencyId, applicationId);
    if (!application) {
      return fail(res, 404, "application_not_found", "Application not found");
    }

    const request =
      (await loadMaterialRequests(knex, [applicationId])).get(applicationId) ||
      null;

    return res.json({ success: true, data: { materialRequest: request } });
  }),
);

// ---------------------------------------------------------------------------
// POST the ask
// ---------------------------------------------------------------------------

router.post(
  "/api/agency/applications/:applicationId/request-materials",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    const agencyId = getSessionAgencyId(req.session) || req.session?.userId;
    const { applicationId } = req.params;

    if (!(await knex.schema.hasTable(TABLE))) {
      return fail(
        res,
        503,
        "materials_requests_unavailable",
        "Material requests are not available on this deployment yet.",
      );
    }

    const { application, link } = await loadOwnedApplication(
      agencyId,
      applicationId,
    );
    if (!application) {
      return fail(res, 404, "application_not_found", "Application not found");
    }
    if (application.status === "withdrawn") {
      return fail(
        res,
        409,
        "application_withdrawn",
        "This applicant withdrew their submission.",
      );
    }

    const requestedKeys = Array.isArray(req.body?.requestedKeys)
      ? [
          ...new Set(
            req.body.requestedKeys.filter(
              (key) => typeof key === "string" && key.trim(),
            ),
          ),
        ]
      : null;
    if (!requestedKeys || requestedKeys.length === 0) {
      return fail(
        res,
        400,
        "requested_keys_required",
        "Name at least one thing to ask for.",
      );
    }

    let allowedKeys;
    try {
      allowedKeys = allowedShortlistKeys(link);
    } catch (error) {
      // A call whose stored spec no longer validates is an organizer-visible
      // problem, not a 500.
      return fail(
        res,
        409,
        error.code === "INVALID_INTAKE_SPEC"
          ? "invalid_intake_spec"
          : "intake_spec_unreadable",
        error.message || "This call's intake spec could not be read.",
      );
    }

    /* The load-bearing validation. An organizer may only ask for what their own
       call declared as a shortlist-stage field: anything else is a question the
       applicant never consented to and a key that would never reach a profile
       (design §3.1). */
    const disallowed = requestedKeys.filter((key) => !allowedKeys.includes(key));
    if (disallowed.length > 0) {
      return fail(
        res,
        400,
        "requested_keys_not_in_shortlist_stage",
        "Those fields are not shortlist-stage asks on this call.",
        { disallowedKeys: disallowed, allowedKeys },
      );
    }

    const dueAt = parseDueAt(req.body?.dueAt);
    if (dueAt === undefined) {
      return fail(res, 400, "due_at_invalid", "Due date could not be read.");
    }

    const identity = await resolveApplicantIdentity(knex, application);

    /* An unclaimed applicant is reachable only through a tokenized link, so mint
       BEFORE writing the request: an ask recorded against an applicant who was
       never told about it is worse than no ask at all. */
    let materialsUrl = null;
    if (!application.profile_id) {
      if (!application.applicant_identity_id) {
        return fail(
          res,
          409,
          "applicant_unreachable",
          "This application has no profile and no applicant identity to contact.",
        );
      }
      let mintClaimToken;
      try {
        // Required lazily: a sibling lane owns this module, so module load here
        // must not depend on its presence.
        ({
          mintClaimToken,
        } = require("../../opencall/services/claim-tokens"));
      } catch {
        mintClaimToken = null;
      }
      if (typeof mintClaimToken !== "function") {
        return fail(
          res,
          503,
          "materials_link_unavailable",
          "Materials requests to applicants without a Pholio account need the " +
            "open-call claim-token service, which is not deployed in this " +
            "environment yet. Ask a Pholio operator to complete the open-call " +
            "applicant rollout, then try again.",
        );
      }
      try {
        const token = await mintClaimToken(knex, {
          identityId: application.applicant_identity_id,
          purpose: "materials",
          ttlDays: MATERIALS_TOKEN_TTL_DAYS,
        });
        materialsUrl = token?.url || null;
      } catch (error) {
        console.error("[Request Materials] Token mint failed:", error);
        return fail(
          res,
          503,
          "materials_link_unavailable",
          "Could not create the applicant's materials link. Nothing was sent.",
        );
      }
      if (!materialsUrl) {
        return fail(
          res,
          503,
          "materials_link_unavailable",
          "Could not create the applicant's materials link. Nothing was sent.",
        );
      }
    }

    // Upsert against UNIQUE(application_id): a re-request replaces the keys and
    // the deadline, and clears `fulfilled_at` because what was asked changed.
    const now = knex.fn.now();
    const existing = await knex(TABLE)
      .where({ application_id: applicationId })
      .first("id");
    const requestedKeysJson = JSON.stringify(requestedKeys);
    if (existing) {
      await knex(TABLE).where({ id: existing.id }).update({
        requested_keys: requestedKeysJson,
        due_at: dueAt ? dueAt.toISOString() : null,
        requested_by_user_id: getSessionActorUserId(req) || null,
        fulfilled_at: null,
        updated_at: now,
      });
    } else {
      await knex(TABLE).insert({
        id: uuidv4(),
        application_id: applicationId,
        requested_keys: requestedKeysJson,
        due_at: dueAt ? dueAt.toISOString() : null,
        requested_by_user_id: getSessionActorUserId(req) || null,
        fulfilled_at: null,
        created_at: now,
        updated_at: now,
      });
    }

    const stored =
      (await loadMaterialRequests(knex, [applicationId])).get(applicationId) ||
      null;

    const agency = await knex("agencies")
      .where({ id: agencyId })
      .first("name")
      .catch(() => null);
    const agencyName = agency?.name || "An agency";
    const items = labelsFor(requestedKeys);

    // Delivery is best-effort and never fails the recorded ask — the organizer
    // must not be told nothing happened when the row was written.
    let notified = false;
    try {
      if (application.profile_id) {
        // The existing "asked for more" treatment, unchanged. This is a
        // notification, not a status write.
        await notifyTalentForApplicationStatus({
          application,
          agencyId,
          newStatus: REQUESTED_MORE_STATUS,
          previousStatus: null,
        });
        if (identity.email) {
          await sendMaterialsRequestedEmail({
            to: identity.email,
            agencyName,
            items,
          });
        }
        notified = Boolean(identity.email);
      } else if (identity.email) {
        await sendEmail({
          to: identity.email,
          subject: `${agencyName} shortlisted you — a few more things`,
          html: buildApplicantMaterialsRequestEmailHtml({
            agencyName,
            items,
            fulfilUrl: materialsUrl,
            dueAt,
            eventName: link?.event_name || null,
          }),
          text: buildApplicantMaterialsRequestEmailText({
            agencyName,
            items,
            fulfilUrl: materialsUrl,
            dueAt,
          }),
        });
        notified = true;
      }
    } catch (error) {
      console.error("[Request Materials] Notification failed:", error);
    }

    await recordAuditEvent({
      agencyId,
      actorMembershipId: req.session?.agencyMembershipId || null,
      actorUserId: getSessionActorUserId(req),
      eventType: "application.materials_requested",
      targetType: "application",
      targetId: applicationId,
      summary: `Requested ${items.join(", ")} from ${
        identity.displayName || "an applicant"
      }`,
      afterState: {
        requested_keys: requestedKeys,
        due_at: dueAt ? dueAt.toISOString() : null,
        identity_source: identity.identitySource,
        notified,
      },
      req,
    }).catch((error) => {
      console.error("[Request Materials] Audit write failed:", error);
    });

    return res.json({
      success: true,
      data: {
        materialRequest: stored || serializeMaterialRequest(null),
        notified,
        // Never the raw token or the URL: it is the applicant's, delivered to
        // the applicant's address, and an organizer holding it would be an
        // impersonation path.
        deliveredTo: notified ? "email" : null,
      },
    });
  }),
);

module.exports = router;
