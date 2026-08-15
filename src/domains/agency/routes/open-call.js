const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { v4: uuidv4 } = require("uuid");
const asyncHandler = require("express-async-handler");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  getSessionAgencyId,
  getSessionActorUserId,
} = require("../services/context");
const {
  hasOpenCallSchema,
  generateOpenCallCode,
  LINK_STATUSES,
  CLAIM_STATUSES,
} = require("../../talent/services/open-call-claims");
const {
  OpenCallBriefError,
  briefColumns,
  briefDTO,
  hasBrief,
  isClosedByDeadline,
  normalizeBrief,
} = require("../services/open-call-brief");

const router = express.Router();
mountAgencyApiGuard(router);

const MAX_LINKS_PER_AGENCY = 20;

// Deploy-before-migrate guard for the brief columns specifically: link
// management keeps working on an older schema, only the brief is withheld.
let briefSchemaPromise = null;
function hasBriefSchema(db) {
  if (!briefSchemaPromise) {
    briefSchemaPromise = db.schema
      .hasColumn("agency_open_call_links", "brief_completed_at")
      .catch(() => {
        briefSchemaPromise = null;
        return false;
      });
  }
  return briefSchemaPromise;
}

function briefErrorResponse(error, res) {
  return res.status(error.status || 400).json({
    success: false,
    error: error.code,
    message: error.message,
    field: error.field || null,
  });
}

function serializeLink(link, stats = null) {
  return {
    id: link.id,
    code: link.code,
    label: link.label,
    status: link.status,
    createdAt: link.created_at,
    revokedAt: link.revoked_at || null,
    brief: briefDTO(link),
    // Links published before the brief existed keep working. They are reported
    // as needing one rather than silently treated as complete.
    needsBrief: !hasBrief(link),
    closedByDeadline: isClosedByDeadline(link),
    ...(stats
      ? {
          arrivals: Number(stats.arrivals || 0),
          claims: Number(stats.claims || 0),
          submissions: Number(stats.submissions || 0),
        }
      : {}),
  };
}

async function loadOwnedLink(agencyId, linkId) {
  return knex("agency_open_call_links")
    .where({ id: linkId, agency_id: agencyId })
    .first();
}

/**
 * GET /api/agency/open-call/links
 * The agency's open call links with their arrivals → claims → submissions
 * funnel counts.
 */
router.get(
  "/api/agency/open-call/links",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    if (!(await hasOpenCallSchema(knex))) {
      return res.json({ success: true, data: [] });
    }
    const agencyId = getSessionAgencyId(req);
    const links = await knex("agency_open_call_links")
      .where({ agency_id: agencyId })
      .whereNot({ status: LINK_STATUSES.REVOKED })
      .orderBy("created_at", "desc");

    const linkIds = links.map((link) => link.id);
    const statsByLink = new Map();
    if (linkIds.length > 0) {
      const [arrivalRows, claimRows, submissionRows] = await Promise.all([
        knex("agency_open_call_arrivals")
          .whereIn("link_id", linkIds)
          .groupBy("link_id")
          .select("link_id")
          .count({ count: "*" }),
        knex("agency_open_call_claims")
          .whereIn("link_id", linkIds)
          .groupBy("link_id")
          .select("link_id")
          .count({ count: "*" }),
        knex("agency_open_call_claims")
          .whereIn("link_id", linkIds)
          .where({ status: CLAIM_STATUSES.CONSUMED })
          .groupBy("link_id")
          .select("link_id")
          .count({ count: "*" }),
      ]);
      for (const row of arrivalRows) {
        statsByLink.set(row.link_id, { arrivals: row.count });
      }
      for (const row of claimRows) {
        statsByLink.set(row.link_id, {
          ...(statsByLink.get(row.link_id) || {}),
          claims: row.count,
        });
      }
      for (const row of submissionRows) {
        statsByLink.set(row.link_id, {
          ...(statsByLink.get(row.link_id) || {}),
          submissions: row.count,
        });
      }
    }

    return res.json({
      success: true,
      data: links.map((link) =>
        serializeLink(link, statsByLink.get(link.id) || {}),
      ),
    });
  }),
);

/**
 * POST /api/agency/open-call/links
 * Mint a new open call link. The code is server-generated and unguessable.
 */
router.post(
  "/api/agency/open-call/links",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    if (!(await hasOpenCallSchema(knex))) {
      return res.status(503).json({
        success: false,
        error: "open_call_unavailable",
        message: "Open call links are not available yet.",
      });
    }
    const agencyId = getSessionAgencyId(req);
    const label = String(req.body?.label || "").trim();
    if (!label || label.length > 120) {
      return res.status(400).json({
        success: false,
        error: "invalid_label",
        message: "A label up to 120 characters is required.",
      });
    }

    const existingCount = await knex("agency_open_call_links")
      .where({ agency_id: agencyId })
      .whereNot({ status: LINK_STATUSES.REVOKED })
      .count({ count: "*" })
      .first();
    if (Number(existingCount?.count || 0) >= MAX_LINKS_PER_AGENCY) {
      return res.status(409).json({
        success: false,
        error: "link_limit_reached",
        message: "Revoke an existing link before creating another.",
      });
    }

    // The brief is mandatory on every new link. An open call that cannot tell
    // an applicant who it is for, what to send, or what happens next is the
    // silence this feature exists to remove.
    const briefRequired = await hasBriefSchema(knex);
    let brief = null;
    if (briefRequired) {
      try {
        brief = normalizeBrief(req.body?.brief);
      } catch (error) {
        if (error instanceof OpenCallBriefError) return briefErrorResponse(error, res);
        throw error;
      }
    }

    const id = uuidv4();
    await knex("agency_open_call_links").insert({
      id,
      agency_id: agencyId,
      code: generateOpenCallCode(),
      label,
      status: LINK_STATUSES.ACTIVE,
      created_by_user_id: getSessionActorUserId(req),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
      ...(brief ? briefColumns(brief, knex.fn.now()) : {}),
    });
    const link = await knex("agency_open_call_links").where({ id }).first();
    return res.json({ success: true, data: serializeLink(link) });
  }),
);

/**
 * PATCH /api/agency/open-call/links/:id
 * Pause, resume, relabel, or revoke a link. Revocation is terminal and
 * cascades to any unconsumed claims minted through the link.
 */
router.patch(
  "/api/agency/open-call/links/:id",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    if (!(await hasOpenCallSchema(knex))) {
      return res.status(503).json({
        success: false,
        error: "open_call_unavailable",
        message: "Open call links are not available yet.",
      });
    }
    const agencyId = getSessionAgencyId(req);
    const link = await loadOwnedLink(agencyId, req.params.id);
    if (!link) {
      return res.status(404).json({
        success: false,
        error: "link_not_found",
        message: "Open call link not found.",
      });
    }
    if (link.status === LINK_STATUSES.REVOKED) {
      return res.status(409).json({
        success: false,
        error: "link_revoked",
        message: "A revoked link cannot be changed.",
      });
    }

    const updates = {};
    if (req.body?.label !== undefined) {
      const label = String(req.body.label || "").trim();
      if (!label || label.length > 120) {
        return res.status(400).json({
          success: false,
          error: "invalid_label",
          message: "A label up to 120 characters is required.",
        });
      }
      updates.label = label;
    }
    if (req.body?.status !== undefined) {
      const status = String(req.body.status || "").trim();
      if (
        ![
          LINK_STATUSES.ACTIVE,
          LINK_STATUSES.PAUSED,
          LINK_STATUSES.REVOKED,
        ].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          error: "invalid_status",
          message: "Status must be active, paused, or revoked.",
        });
      }
      updates.status = status;
      if (status === LINK_STATUSES.REVOKED) {
        updates.revoked_at = knex.fn.now();
      }
    }
    // Editing the brief is how a grandfathered link gets one, and how a live
    // call corrects itself without being revoked and republished elsewhere.
    if (req.body?.brief !== undefined) {
      if (!(await hasBriefSchema(knex))) {
        return res.status(503).json({
          success: false,
          error: "brief_unavailable",
          message: "Open call briefs are not available yet.",
        });
      }
      try {
        Object.assign(updates, briefColumns(normalizeBrief(req.body.brief), knex.fn.now()));
      } catch (error) {
        if (error instanceof OpenCallBriefError) return briefErrorResponse(error, res);
        throw error;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "no_changes",
        message: "Provide a label, status, or brief to update.",
      });
    }

    await knex.transaction(async (trx) => {
      await trx("agency_open_call_links")
        .where({ id: link.id })
        .update({ ...updates, updated_at: trx.fn.now() });
      if (updates.status === LINK_STATUSES.REVOKED) {
        await trx("agency_open_call_claims")
          .where({ link_id: link.id, status: CLAIM_STATUSES.ACTIVE })
          .update({
            status: CLAIM_STATUSES.REVOKED,
            revoked_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
      }
    });

    const updated = await knex("agency_open_call_links")
      .where({ id: link.id })
      .first();
    return res.json({ success: true, data: serializeLink(updated) });
  }),
);

module.exports = router;
