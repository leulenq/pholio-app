"use strict";

const express = require("express");
const { z } = require("zod");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");
const { recordAuditEvent } = require("../services/audit");

const router = express.Router();
mountAgencyApiGuard(router);

const dateString = z.string().date("Use YYYY-MM-DD");
const windowSchema = z
  .object({
    start: dateString,
    end: dateString,
  })
  .refine((value) => value.start <= value.end, {
    message: "The end date must be on or after the start date",
  });

const writeFields = {
  kind: z.enum(["option", "hold", "booked"]),
  optionTier: z.coerce.number().int().min(1).max(9).nullable().optional(),
  startDate: dateString,
  endDate: dateString,
  market: z.string().trim().max(160).nullable().optional(),
  clientRef: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  releaseConflictIds: z.array(z.string().uuid()).max(25).default([]),
};

const createSchema = z
  .object({ membershipId: z.string().uuid(), ...writeFields })
  .refine((value) => value.startDate <= value.endDate, {
    message: "The end date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((value) => value.kind === "option" || value.optionTier == null, {
    message: "Only options have an option position",
    path: ["optionTier"],
  });

const updateSchema = z
  .object({ ...writeFields })
  .partial()
  .extend({ releaseConflictIds: z.array(z.string().uuid()).max(25).default([]) })
  .refine((value) => Object.keys(value).some((key) => key !== "releaseConflictIds"), {
    message: "At least one calendar field is required",
  });

const resolveSchema = z.object({
  releaseConflictIds: z.array(z.string().uuid()).max(25).default([]),
});

function validationError(res, parsed, message = "Invalid commitment") {
  return res.status(400).json({
    success: false,
    error: { message, details: parsed.error.flatten() },
  });
}

function actor(req) {
  return {
    agencyId: getSessionAgencyId(req),
    actorUserId: getSessionActorUserId(req),
    actorMembershipId: req.session?.agencyMembershipId || null,
  };
}

async function loadMembership(db, agencyId, membershipId) {
  return db("roster_memberships as rm")
    .leftJoin("profiles as p", "p.id", "rm.profile_id")
    .leftJoin("talent_records as tr", "tr.id", "rm.talent_record_id")
    .leftJoin("boards as b", function joinBoard() {
      this.on("b.id", "=", "rm.board_id").andOn("b.agency_id", "=", "rm.agency_id");
    })
    .where({ "rm.id": membershipId, "rm.agency_id": agencyId, "rm.status": "active" })
    .select(
      "rm.id",
      "rm.profile_id",
      "rm.talent_record_id",
      "rm.board_id",
      "b.name as board_name",
      "p.first_name as profile_first_name",
      "p.last_name as profile_last_name",
      "tr.first_name as record_first_name",
      "tr.last_name as record_last_name",
    )
    .first();
}

function talentName(row) {
  return [
    row.profile_id ? row.profile_first_name : row.record_first_name,
    row.profile_id ? row.profile_last_name : row.record_last_name,
  ]
    .filter(Boolean)
    .join(" ") || "Roster talent";
}

function serializeCommitment(row, membership, agencyId) {
  return {
    id: row.id,
    source: "agency",
    membershipId: membership.id,
    profileId: membership.profile_id || null,
    talentRecordId: membership.talent_record_id || null,
    talentName: talentName(membership),
    board: membership.board_id
      ? { id: membership.board_id, name: membership.board_name || "Unassigned" }
      : null,
    kind: row.kind,
    optionTier: row.option_tier,
    startDate: row.start_date,
    endDate: row.end_date,
    market: row.market || null,
    clientRef: row.client_ref || null,
    notes: row.notes || null,
    status: row.status || "active",
    canEdit: row.agency_id === agencyId,
    createdByUserId: row.created_by_user_id || null,
    updatedAt: row.updated_at || null,
  };
}

function conflictPayload(row, { agencyId, source = "agency" } = {}) {
  if (source === "talent") {
    return {
      id: row.id,
      source: "talent",
      kind: "bookout",
      label: "Talent bookout",
      startDate: row.starts_on,
      endDate: row.ends_on,
      releasable: false,
    };
  }
  const own = row.agency_id === agencyId;
  return {
    id: row.id,
    source: own ? "agency" : "external",
    kind: row.kind,
    label: own ? row.client_ref || (row.kind === "booked" ? "Confirmed booking" : row.kind) : "External calendar commitment",
    startDate: row.start_date,
    endDate: row.end_date,
    releasable: own && ["option", "hold"].includes(row.kind),
  };
}

async function findOverlaps(db, { agencyId, membership, startDate, endDate, excludeId = null }) {
  let query = db("talent_commitments")
    .where({ status: "active" })
    .where("start_date", "<=", endDate)
    .where("end_date", ">=", startDate);

  if (membership.profile_id) {
    query = query.where({ profile_id: membership.profile_id });
  } else {
    query = query.where({ roster_membership_id: membership.id, agency_id: agencyId });
  }
  if (excludeId) query = query.whereNot({ id: excludeId });

  const commitments = await query.select(
    "id",
    "agency_id",
    "kind",
    "start_date",
    "end_date",
    "client_ref",
  );
  const bookouts = membership.profile_id
    ? await db("bookouts")
        .where({ profile_id: membership.profile_id })
        .where("starts_on", "<=", endDate)
        .where("ends_on", ">=", startDate)
        .select("id", "starts_on", "ends_on")
    : [];

  return [
    ...commitments.map((row) => conflictPayload(row, { agencyId })),
    ...bookouts.map((row) => conflictPayload(row, { source: "talent" })),
  ];
}

function blockingOverlaps(kind, overlaps) {
  if (kind === "booked") return overlaps;
  return overlaps.filter((item) => item.kind === "booked" || item.kind === "bookout");
}

async function releaseResolvedConflicts(
  db,
  { agencyId, actorUserId, actorMembershipId, releaseConflictIds, blockers, reason, req },
) {
  const requested = new Set(releaseConflictIds || []);
  const releasableIds = blockers.filter((item) => item.releasable).map((item) => item.id);
  const unknown = [...requested].filter((id) => !releasableIds.includes(id));
  if (unknown.length) {
    const error = new Error("Only your agency's overlapping options or holds can be released here");
    error.status = 400;
    error.code = "INVALID_CONFLICT_RESOLUTION";
    throw error;
  }

  const unresolved = blockers.filter((item) => !requested.has(item.id));
  if (unresolved.length) return unresolved;

  if (requested.size) {
    const releasedRows = await db("talent_commitments")
      .where({ agency_id: agencyId, status: "active" })
      .whereIn("id", [...requested])
      .whereIn("kind", ["option", "hold"]);
    await db("talent_commitments")
      .where({ agency_id: agencyId, status: "active" })
      .whereIn("id", [...requested])
      .whereIn("kind", ["option", "hold"])
      .update({
        status: "released",
        released_at: db.fn.now(),
        released_by_user_id: actorUserId,
        release_reason: reason,
        updated_by_user_id: actorUserId,
        updated_at: db.fn.now(),
      });
    for (const released of releasedRows) {
      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "calendar.commitment_released",
        targetType: "commitment",
        targetId: released.id,
        summary: `Released ${released.kind} while resolving a Booking Desk conflict`,
        beforeState: released,
        afterState: { status: "released", release_reason: reason },
        req,
        db,
      });
    }
  }
  return [];
}

function sendConflict(res, conflicts) {
  return res.status(409).json({
    success: false,
    error: {
      code: "COMMITMENT_CONFLICT",
      message: "Resolve the overlapping calendar commitments before continuing.",
      conflicts,
    },
  });
}

async function loadOwnedCommitment(db, agencyId, id) {
  return db("talent_commitments")
    .where({ id, agency_id: agencyId, status: "active" })
    .first();
}

router.get("/api/agency/commitments", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const parsed = windowSchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed, "Invalid calendar window");
    const { agencyId } = actor(req);
    const { start, end } = parsed.data;
    const spanDays = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
    if (spanDays > 93) {
      return res.status(400).json({ success: false, error: { message: "Calendar windows are limited to 94 days" } });
    }

    const memberships = await knex("roster_memberships as rm")
      .leftJoin("profiles as p", "p.id", "rm.profile_id")
      .leftJoin("talent_records as tr", "tr.id", "rm.talent_record_id")
      .leftJoin("boards as b", function joinBoard() {
        this.on("b.id", "=", "rm.board_id").andOn("b.agency_id", "=", "rm.agency_id");
      })
      .where({ "rm.agency_id": agencyId, "rm.status": "active" })
      .select(
        "rm.id",
        "rm.profile_id",
        "rm.talent_record_id",
        "rm.board_id",
        "b.name as board_name",
        "p.first_name as profile_first_name",
        "p.last_name as profile_last_name",
        "tr.first_name as record_first_name",
        "tr.last_name as record_last_name",
      )
      .orderBy([{ column: "b.name", order: "asc" }, { column: "p.last_name", order: "asc" }]);
    const membershipById = new Map(memberships.map((row) => [row.id, row]));
    const membershipByProfile = new Map(
      memberships.filter((row) => row.profile_id).map((row) => [row.profile_id, row]),
    );

    const commitmentRows = await knex("talent_commitments")
      .where({ agency_id: agencyId, status: "active" })
      .where("start_date", "<=", end)
      .where("end_date", ">=", start)
      .select(
        "id", "agency_id", "profile_id", "talent_record_id", "roster_membership_id",
        "kind", "option_tier", "start_date", "end_date", "market", "client_ref",
        "notes", "status", "created_by_user_id", "updated_at",
      );
    const events = commitmentRows.flatMap((row) => {
      const membership = membershipById.get(row.roster_membership_id) || membershipByProfile.get(row.profile_id);
      return membership ? [serializeCommitment(row, membership, agencyId)] : [];
    });

    const profileIds = memberships.map((row) => row.profile_id).filter(Boolean);
    if (profileIds.length) {
      const bookoutRows = await knex("bookouts")
        .whereIn("profile_id", profileIds)
        .where("starts_on", "<=", end)
        .where("ends_on", ">=", start)
        .select("id", "profile_id", "starts_on", "ends_on", "note");
      for (const row of bookoutRows) {
        const membership = membershipByProfile.get(row.profile_id);
        if (!membership) continue;
        events.push({
          id: `bookout:${row.id}`,
          source: "talent",
          membershipId: membership.id,
          profileId: membership.profile_id,
          talentRecordId: null,
          talentName: talentName(membership),
          board: membership.board_id
            ? { id: membership.board_id, name: membership.board_name || "Unassigned" }
            : null,
          kind: "bookout",
          optionTier: null,
          startDate: row.starts_on,
          endDate: row.ends_on,
          market: null,
          clientRef: null,
          notes: row.note || null,
          status: "active",
          canEdit: false,
        });
      }
    }

    return res.json({
      success: true,
      data: {
        window: { start, end },
        roster: memberships.map((row) => ({
          membershipId: row.id,
          profileId: row.profile_id || null,
          talentRecordId: row.talent_record_id || null,
          name: talentName(row),
          board: row.board_id ? { id: row.board_id, name: row.board_name || "Unassigned" } : null,
        })),
        events: events.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || a.talentName.localeCompare(b.talentName)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/api/agency/commitments", requireRole("AGENCY"), async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { agencyId, actorUserId, actorMembershipId } = actor(req);
  try {
    const result = await knex.transaction(async (trx) => {
      const membership = await loadMembership(trx, agencyId, parsed.data.membershipId);
      if (!membership) return { notFound: true };
      const overlaps = await findOverlaps(trx, {
        agencyId,
        membership,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
      const blockers = blockingOverlaps(parsed.data.kind, overlaps);
      const unresolved = await releaseResolvedConflicts(trx, {
        agencyId,
        actorUserId,
        actorMembershipId,
        releaseConflictIds: parsed.data.releaseConflictIds,
        blockers,
        reason: "Released while resolving a Booking Desk conflict",
        req,
      });
      if (unresolved.length) return { conflicts: unresolved };

      const id = uuidv4();
      const row = {
        id,
        profile_id: membership.profile_id,
        talent_record_id: membership.talent_record_id,
        roster_membership_id: membership.id,
        agency_id: agencyId,
        kind: parsed.data.kind,
        option_tier: parsed.data.kind === "option" ? parsed.data.optionTier || 1 : null,
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate,
        market: parsed.data.market || null,
        client_ref: parsed.data.clientRef || null,
        notes: parsed.data.notes || null,
        status: "active",
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
        confirmed_at: parsed.data.kind === "booked" ? trx.fn.now() : null,
        confirmed_by_user_id: parsed.data.kind === "booked" ? actorUserId : null,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      };
      await trx("talent_commitments").insert(row);
      const persisted = await trx("talent_commitments").where({ id }).first();
      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "calendar.commitment_created",
        targetType: "commitment",
        targetId: id,
        summary: `Added ${parsed.data.kind} for ${talentName(membership)}`,
        afterState: persisted,
        req,
        db: trx,
      });
      return { commitment: serializeCommitment(persisted, membership, agencyId), warnings: overlaps.filter((item) => !blockers.some((blocker) => blocker.id === item.id)) };
    });
    if (result.notFound) return res.status(404).json({ success: false, error: { message: "Roster membership not found" } });
    if (result.conflicts) return sendConflict(res, result.conflicts);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return next(error);
  }
});

router.patch("/api/agency/commitments/:id", requireRole("AGENCY"), async (req, res, next) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { agencyId, actorUserId, actorMembershipId } = actor(req);
  try {
    const result = await knex.transaction(async (trx) => {
      const current = await loadOwnedCommitment(trx, agencyId, req.params.id);
      if (!current) return { notFound: true };
      const membership = await loadMembership(trx, agencyId, current.roster_membership_id);
      if (!membership) return { notFound: true };
      const kind = parsed.data.kind || current.kind;
      if (current.kind !== "booked" && kind === "booked") {
        return { invalidTransition: true };
      }
      const startDate = parsed.data.startDate || current.start_date;
      const endDate = parsed.data.endDate || current.end_date;
      if (startDate > endDate) return { invalidWindow: true };
      const overlaps = await findOverlaps(trx, { agencyId, membership, startDate, endDate, excludeId: current.id });
      const blockers = blockingOverlaps(kind, overlaps);
      const unresolved = await releaseResolvedConflicts(trx, {
        agencyId,
        actorUserId,
        actorMembershipId,
        releaseConflictIds: parsed.data.releaseConflictIds,
        blockers,
        reason: "Released while resolving a Booking Desk conflict",
        req,
      });
      if (unresolved.length) return { conflicts: unresolved };

      const updates = {
        kind,
        option_tier: kind === "option" ? (parsed.data.optionTier ?? current.option_tier ?? 1) : null,
        start_date: startDate,
        end_date: endDate,
        market: parsed.data.market === undefined ? current.market : parsed.data.market || null,
        client_ref: parsed.data.clientRef === undefined ? current.client_ref : parsed.data.clientRef || null,
        notes: parsed.data.notes === undefined ? current.notes : parsed.data.notes || null,
        updated_by_user_id: actorUserId,
        updated_at: trx.fn.now(),
      };
      await trx("talent_commitments").where({ id: current.id }).update(updates);
      const after = await trx("talent_commitments").where({ id: current.id }).first();
      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "calendar.commitment_updated",
        targetType: "commitment",
        targetId: current.id,
        summary: `Updated ${kind} for ${talentName(membership)}`,
        beforeState: current,
        afterState: after,
        req,
        db: trx,
      });
      return { commitment: serializeCommitment(after, membership, agencyId) };
    });
    if (result.notFound) return res.status(404).json({ success: false, error: { message: "Commitment not found" } });
    if (result.invalidTransition) return res.status(409).json({ success: false, error: { code: "CONFIRM_REQUIRED", message: "Use Confirm booking to move an option or hold to booked" } });
    if (result.invalidWindow) return res.status(400).json({ success: false, error: { message: "The end date must be on or after the start date" } });
    if (result.conflicts) return sendConflict(res, result.conflicts);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return next(error);
  }
});

router.post("/api/agency/commitments/:id/confirm", requireRole("AGENCY"), async (req, res, next) => {
  const parsed = resolveSchema.safeParse(req.body || {});
  if (!parsed.success) return validationError(res, parsed, "Invalid conflict resolution");
  const { agencyId, actorUserId, actorMembershipId } = actor(req);
  try {
    const result = await knex.transaction(async (trx) => {
      const current = await loadOwnedCommitment(trx, agencyId, req.params.id);
      if (!current) return { notFound: true };
      if (current.kind === "booked") return { alreadyConfirmed: true };
      if (!["option", "hold"].includes(current.kind)) return { invalidTransition: true };
      const membership = await loadMembership(trx, agencyId, current.roster_membership_id);
      if (!membership) return { notFound: true };
      const overlaps = await findOverlaps(trx, {
        agencyId,
        membership,
        startDate: current.start_date,
        endDate: current.end_date,
        excludeId: current.id,
      });
      const blockers = blockingOverlaps("booked", overlaps);
      const unresolved = await releaseResolvedConflicts(trx, {
        agencyId,
        actorUserId,
        actorMembershipId,
        releaseConflictIds: parsed.data.releaseConflictIds,
        blockers,
        reason: `Released when ${current.kind} ${current.id} was confirmed`,
        req,
      });
      if (unresolved.length) return { conflicts: unresolved };

      const updates = {
        kind: "booked",
        option_tier: null,
        confirmed_at: trx.fn.now(),
        confirmed_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
        updated_at: trx.fn.now(),
      };
      await trx("talent_commitments").where({ id: current.id }).update(updates);
      const after = await trx("talent_commitments").where({ id: current.id }).first();
      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "calendar.commitment_confirmed",
        targetType: "commitment",
        targetId: current.id,
        summary: `Confirmed booking for ${talentName(membership)}`,
        beforeState: current,
        afterState: after,
        req,
        db: trx,
      });
      return { commitment: serializeCommitment(after, membership, agencyId) };
    });
    if (result.notFound) return res.status(404).json({ success: false, error: { message: "Commitment not found" } });
    if (result.alreadyConfirmed) return res.json({ success: true, data: { alreadyConfirmed: true } });
    if (result.invalidTransition) return res.status(409).json({ success: false, error: { message: "Only an option or hold can be confirmed" } });
    if (result.conflicts) return sendConflict(res, result.conflicts);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return next(error);
  }
});

router.delete("/api/agency/commitments/:id", requireRole("AGENCY"), async (req, res, next) => {
  const { agencyId, actorUserId, actorMembershipId } = actor(req);
  try {
    const result = await knex.transaction(async (trx) => {
      const current = await loadOwnedCommitment(trx, agencyId, req.params.id);
      if (!current) return null;
      const membership = await loadMembership(trx, agencyId, current.roster_membership_id);
      await trx("talent_commitments").where({ id: current.id }).update({
        status: "released",
        released_at: trx.fn.now(),
        released_by_user_id: actorUserId,
        release_reason: typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "Released from Booking Desk",
        updated_by_user_id: actorUserId,
        updated_at: trx.fn.now(),
      });
      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "calendar.commitment_released",
        targetType: "commitment",
        targetId: current.id,
        summary: `Released ${current.kind}${membership ? ` for ${talentName(membership)}` : ""}`,
        beforeState: current,
        afterState: { status: "released" },
        req,
        db: trx,
      });
      return current.id;
    });
    if (!result) return res.status(404).json({ success: false, error: { message: "Commitment not found" } });
    return res.json({ success: true, data: { id: result, status: "released" } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
