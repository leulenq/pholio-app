const express = require("express");
const asyncHandler = require("express-async-handler");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const logActivity = require("./agency-log-activity");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");
const {
  notifyTalentForApplicationStatus,
} = require("../../../shared/services/notify-talent-application");
const {
  OFFERED_APPLICATION_STATUSES,
} = require("../../../shared/constants/application-status");
const { ORG_KINDS } = require("../../../shared/constants/event-casting");
const {
  EventPickListError,
  addPickListItems,
  buildLineup,
  createPickList,
  hasEventCastingSchema,
  listEventCalls,
  listPickLists,
  listPool,
  listSelections,
  loadEventCall,
  recordOffers,
  reissuePickList,
  removePickListItems,
  revokePickList,
  serializeEventCall,
  updatePickList,
} = require("../services/event-pick-lists");

/**
 * Organizer surfaces for event casting (design §f).
 *
 * Ruling R10 is the shape of this file: an event organizer is an `agencies`
 * row served by the SAME dashboard, so nothing here forks the inbox, the RBAC
 * model or the export. These routes add what a representation call has no use
 * for — designer pick lists and a lineup — and reuse `open_call.view/manage`
 * for permissions because an event call IS an open call link.
 */

const router = express.Router();
mountAgencyApiGuard(router);

const OFFERED_STATUS = OFFERED_APPLICATION_STATUSES[0];

/**
 * Deploy-before-migrate: the whole surface reports itself unavailable rather
 * than 500-ing on a missing table, matching `hasOpenCallSchema` in
 * `routes/open-call.js`.
 */
function requireEventSchema() {
  return asyncHandler(async (req, res, next) => {
    if (await hasEventCastingSchema(knex)) return next();
    return res.status(503).json({
      success: false,
      error: "event_casting_unavailable",
      message: "Event casting is not available yet.",
    });
  });
}

/** Service errors carry their own status/code; anything else is a real 500. */
function handleServiceError(error, res, next) {
  if (error instanceof EventPickListError) {
    return res.status(error.status).json({
      success: false,
      error: error.code,
      message: error.message,
      field: error.field || null,
    });
  }
  return next(error);
}

function wrap(handler) {
  return asyncHandler(async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleServiceError(error, res, next);
    }
  });
}

const guard = [requireRole("AGENCY"), requireEventSchema()];

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * GET /api/agency/events
 * Every event call this agency runs. Also the signal the sidebar reads: per
 * R10 the Events entry appears for an event organizer or for any agency that
 * has created at least one event call, and this is where "at least one" is
 * answered without a second endpoint.
 */
router.get(
  "/api/agency/events",
  ...guard,
  wrap(async (req, res) => {
    const agencyId = getSessionAgencyId(req);
    const [calls, agency] = await Promise.all([
      listEventCalls(knex, { agencyId }),
      knex("agencies").where({ id: agencyId }).first("org_kind"),
    ]);
    const orgKind = agency?.org_kind || null;
    return res.json({
      success: true,
      data: {
        orgKind,
        // R10 as a server-computed boolean. The rule lives here rather than in
        // the sidebar so the nav and the page can never disagree, and so the
        // SPA needs no copy of the org-kind vocabulary to evaluate it.
        eventsEnabled: orgKind === ORG_KINDS.EVENT_ORGANIZER || calls.length > 0,
        calls,
      },
    });
  }),
);

/** GET /api/agency/events/pick-lists/:pickListId/selections — designer's answer. */
router.get(
  "/api/agency/events/pick-lists/:pickListId/selections",
  ...guard,
  wrap(async (req, res) => {
    const data = await listSelections(knex, {
      agencyId: getSessionAgencyId(req),
      pickListId: req.params.pickListId,
    });
    return res.json({ success: true, data });
  }),
);

/** PATCH /api/agency/events/pick-lists/:pickListId */
router.patch(
  "/api/agency/events/pick-lists/:pickListId",
  ...guard,
  wrap(async (req, res) => {
    const pickList = await updatePickList(knex, {
      agencyId: getSessionAgencyId(req),
      pickListId: req.params.pickListId,
      patch: req.body || {},
    });
    return res.json({ success: true, data: pickList });
  }),
);

/**
 * POST /api/agency/events/pick-lists/:pickListId/reissue
 * Rotates the token. The new URL is returned once; the old one stops working.
 */
router.post(
  "/api/agency/events/pick-lists/:pickListId/reissue",
  ...guard,
  wrap(async (req, res) => {
    const data = await reissuePickList(knex, {
      agencyId: getSessionAgencyId(req),
      pickListId: req.params.pickListId,
    });
    return res.json({ success: true, data });
  }),
);

/** POST /api/agency/events/pick-lists/:pickListId/revoke */
router.post(
  "/api/agency/events/pick-lists/:pickListId/revoke",
  ...guard,
  wrap(async (req, res) => {
    const pickList = await revokePickList(knex, {
      agencyId: getSessionAgencyId(req),
      pickListId: req.params.pickListId,
    });
    return res.json({ success: true, data: pickList });
  }),
);

/** POST /api/agency/events/pick-lists/:pickListId/items — bulk add. */
router.post(
  "/api/agency/events/pick-lists/:pickListId/items",
  ...guard,
  wrap(async (req, res) => {
    const data = await addPickListItems(knex, {
      agencyId: getSessionAgencyId(req),
      pickListId: req.params.pickListId,
      applicationIds: req.body?.applicationIds,
      actorUserId: getSessionActorUserId(req),
    });
    return res.json({ success: true, data });
  }),
);

/**
 * DELETE /api/agency/events/pick-lists/:pickListId/items — bulk remove.
 * The ids arrive in the body: this is a bulk operation on a collection, not a
 * DELETE of one addressable item.
 */
router.delete(
  "/api/agency/events/pick-lists/:pickListId/items",
  ...guard,
  wrap(async (req, res) => {
    const data = await removePickListItems(knex, {
      agencyId: getSessionAgencyId(req),
      pickListId: req.params.pickListId,
      applicationIds: req.body?.applicationIds,
    });
    return res.json({ success: true, data });
  }),
);

/** GET /api/agency/events/:linkId — one call. */
router.get(
  "/api/agency/events/:linkId",
  ...guard,
  wrap(async (req, res) => {
    const link = await loadEventCall(knex, {
      agencyId: getSessionAgencyId(req),
      linkId: req.params.linkId,
    });
    return res.json({ success: true, data: serializeEventCall(link) });
  }),
);

/**
 * GET /api/agency/events/:linkId/pool?stage=&search=&limit=&offset=
 * Paginated — see the R7 note in `services/event-pick-lists.js`.
 */
router.get(
  "/api/agency/events/:linkId/pool",
  ...guard,
  wrap(async (req, res) => {
    const data = await listPool(knex, {
      agencyId: getSessionAgencyId(req),
      linkId: req.params.linkId,
      stage: req.query.stage,
      search: req.query.search,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ success: true, data });
  }),
);

/** GET /api/agency/events/:linkId/pick-lists */
router.get(
  "/api/agency/events/:linkId/pick-lists",
  ...guard,
  wrap(async (req, res) => {
    const data = await listPickLists(knex, {
      agencyId: getSessionAgencyId(req),
      linkId: req.params.linkId,
    });
    return res.json({ success: true, data });
  }),
);

/**
 * POST /api/agency/events/:linkId/pick-lists
 * The raw designer URL is in this response and nowhere else, ever again.
 */
router.post(
  "/api/agency/events/:linkId/pick-lists",
  ...guard,
  wrap(async (req, res) => {
    const body = req.body || {};
    const data = await createPickList(knex, {
      agencyId: getSessionAgencyId(req),
      linkId: req.params.linkId,
      actorUserId: getSessionActorUserId(req),
      designerName: body.designerName,
      designerEmail: body.designerEmail,
      label: body.label,
      organizerNote: body.organizerNote,
      slotsRequested: body.slotsRequested,
      applicationIds: body.applicationIds,
    });
    return res.status(201).json({ success: true, data });
  }),
);

/** GET /api/agency/events/:linkId/lineup */
router.get(
  "/api/agency/events/:linkId/lineup",
  ...guard,
  wrap(async (req, res) => {
    const data = await buildLineup(knex, {
      agencyId: getSessionAgencyId(req),
      linkId: req.params.linkId,
    });
    return res.json({ success: true, data });
  }),
);

/**
 * POST /api/agency/events/:linkId/offers { applicationIds[], pickListId }
 *
 * The one place in the organizer surface that moves an application. A designer
 * marking `pick` does not reach this route; an organizer clicking "Offer slot"
 * does. The write itself is the ordinary agency-writable `accepted` status and
 * the ordinary notification path, so an event offer lands in the applicant's
 * dashboard through exactly the machinery a representation offer uses.
 */
router.post(
  "/api/agency/events/:linkId/offers",
  ...guard,
  wrap(async (req, res) => {
    const agencyId = getSessionAgencyId(req);
    const actorUserId = getSessionActorUserId(req);
    const { offered, skipped, applicationsById } = await recordOffers(knex, {
      agencyId,
      linkId: req.params.linkId,
      applicationIds: req.body?.applicationIds,
      pickListId: req.body?.pickListId || null,
      actorUserId,
    });

    for (const applicationId of offered) {
      const application = applicationsById.get(applicationId);
      await logActivity(
        req,
        knex,
        applicationId,
        agencyId,
        "status_change",
        "Slot offered",
        { old_status: application?.status, new_status: OFFERED_STATUS },
      );
      await notifyTalentForApplicationStatus({
        application,
        agencyId,
        newStatus: OFFERED_STATUS,
        previousStatus: application?.status,
      });
    }

    return res.json({
      success: true,
      data: { offered, skipped, offeredCount: offered.length },
    });
  }),
);

module.exports = router;
