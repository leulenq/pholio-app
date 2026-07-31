"use strict";

const express = require("express");
const { z } = require("zod");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  getApplicationAccessDecision,
} = require("../services/minor-submission-access");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");
const {
  AUDIENCE,
  buildAgencySubmissionDTO,
} = require("../../../shared/lib/audience-dto");
const {
  applyImageVisibility,
} = require("../../../shared/lib/profile-visibility");
const {
  ensureModerationColumnChecked,
} = require("../../../shared/lib/content-moderation");
const {
  loadSocialAccountsForProfiles,
} = require("../../../shared/lib/social-accounts");

const router = express.Router();
mountAgencyApiGuard(router);

/* ============================================================
   Divisions vs casting boards

   `boards` is dual-purpose: it holds standing DIVISIONS (Women, Editorial)
   and CASTING/PACKAGE boards ("Nike SS26"), discriminated by `board_type`.
   Without this filter the division mark confidently labels a casting board
   as a division.

   `board_type` is NULLABLE, and every board created before that column
   existed — including all standing divisions created by agency setup — is
   NULL. So only an explicit 'package' is a casting board.

   The SQL matters: `whereNot('board_type', 'package')` would also drop every
   NULL row, because `NULL <> 'package'` evaluates to NULL, not true. That
   would hide almost every real division.
   ============================================================ */
const CASTING_BOARD_TYPE = "package";

const isDivisionBoard = (boardType) => boardType !== CASTING_BOARD_TYPE;

/** Restrict a query to division boards, keeping NULL-typed legacy boards. */
function onlyDivisionBoards(query, alias) {
  return query.where((scope) =>
    scope.whereNull(`${alias}.board_type`).orWhereNot(`${alias}.board_type`, CASTING_BOARD_TYPE),
  );
}

/* `roster_board_standings` is newer than some deployments. Checked once per
   process rather than per request so a pre-migration environment degrades to
   the single-board shape instead of throwing. */
let standingsTableChecked = null;
async function hasStandingsTable(db) {
  if (standingsTableChecked === null) {
    standingsTableChecked = await db.schema.hasTable("roster_board_standings");
  }
  return standingsTableChecked;
}

/**
 * Every division a set of memberships sits on, with its standing.
 * Returns Map<membershipId, Array<{ board, standing, isPrimary }>>.
 */
async function loadBoardStandings(db, membershipIds) {
  const byMembership = new Map();
  if (membershipIds.length === 0 || !(await hasStandingsTable(db))) return byMembership;

  const rows = await onlyDivisionBoards(
    db("roster_board_standings as rbs")
      .join("boards as sb", "sb.id", "rbs.board_id")
      .whereIn("rbs.membership_id", membershipIds),
    "sb",
  )
    .select(
      "rbs.membership_id",
      "rbs.board_id",
      "rbs.standing",
      "rbs.is_primary",
      "sb.name as board_name",
    )
    .orderBy(["rbs.membership_id", { column: "rbs.is_primary", order: "desc" }, "sb.name"]);

  rows.forEach((row) => {
    const list = byMembership.get(row.membership_id) || [];
    list.push({
      board: { id: row.board_id, name: row.board_name },
      standing: row.standing,
      isPrimary: Boolean(row.is_primary),
    });
    byMembership.set(row.membership_id, list);
  });
  return byMembership;
}

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).optional(),
  boardId: z.string().uuid().optional(),
  stage: z.enum(["new_face", "development", "main"]).optional(),
  status: z.enum(["active", "inactive", "left", "ended"]).default("active"),
});

const measurementsSchema = z
  .object({
    bust_cm: z.number().min(20).max(250).optional(),
    chest_cm: z.number().min(20).max(250).optional(),
    waist_cm: z.number().min(20).max(250).optional(),
    hips_cm: z.number().min(20).max(250).optional(),
    inseam_cm: z.number().min(20).max(180).optional(),
    shoe_size: z.union([z.string().max(30), z.number().min(1).max(60)]).optional(),
  })
  .strict()
  .optional();

const talentRecordSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  gender: z.string().trim().max(80).optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  heightCm: z.number().int().min(50).max(260).optional().nullable(),
  measurements: measurementsSchema,
  boardId: z.string().uuid().optional().nullable(),
  boardHint: z.string().trim().max(160).optional().nullable(),
  market: z.string().trim().max(160).optional().nullable(),
  stage: z.enum(["new_face", "development", "main"]).default("main"),
  isMinor: z.boolean().optional(),
});

const talentRecordUpdateSchema = talentRecordSchema
  .omit({ boardId: true, stage: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const membershipUpdateSchema = z
  .object({
    boardId: z.string().uuid().nullable().optional(),
    stage: z.enum(["new_face", "development", "main"]).optional(),
    status: z.enum(["active", "inactive", "left", "ended"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const PROFILE_COLUMNS = [
  "id",
  "slug",
  "first_name",
  "last_name",
  "city",
  "gender",
  "archetype",
  "stats_track",
  "height_cm",
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "suit_size",
  "hair_color",
  "eye_color",
  "measurements_updated_at",
  "measured_in_person_at",
  "nationality",
  "languages",
  "bio_curated",
  "date_of_birth",
  "availability_status",
];

function parseJson(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function calculateMinor(dateOfBirth) {
  if (!dateOfBirth) return false;
  const dob = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return false;
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);
  return dob > eighteenYearsAgo;
}

function resolveAvailability({ membershipStatus, availabilityStatus, commitments = [] }) {
  if (membershipStatus !== "active") return "Inactive";
  const kinds = new Set(commitments.map((item) => item.kind));
  if (kinds.has("bookout")) return "Booked out";
  if (kinds.has("booked")) return "On booking";
  if (kinds.has("option") || kinds.has("hold")) return "On option";
  if (availabilityStatus === "unavailable") return "Booked out";
  if (availabilityStatus === "limited") return "Limited";
  if (availabilityStatus === "available") return "Available";
  return "Unknown";
}

function pagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
  };
}

router.get("/api/agency/roster", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid roster filters", details: parsed.error.flatten() });
    }
    const { page, limit, search, boardId, stage, status } = parsed.data;
    const agencyId = getSessionAgencyId(req.session);

    const base = knex("roster_memberships as rm")
      .leftJoin("profiles as p", "p.id", "rm.profile_id")
      .leftJoin("talent_records as tr", "tr.id", "rm.talent_record_id")
      .leftJoin("boards as b", "b.id", "rm.board_id")
      .leftJoin("applications as source_application", "source_application.id", "rm.source_application_id")
      .where({ "rm.agency_id": agencyId, "rm.status": status });

    if (req.allowMinorSubmissions) {
      base.where((scope) => {
        scope
          .where((platform) => {
            platform.whereNull("source_application.id").orWhere((authorized) => {
              authorized
                .whereNull("source_application.minor_access_revoked_at")
                .where((adultOrCurrentMinor) => {
                  adultOrCurrentMinor
                    .where("source_application.minor_at_submission", false)
                    .orWhere(
                      "source_application.guardian_consent_expires_at",
                      ">",
                      new Date(),
                    );
                });
            });
          })
          .andWhere((privateRecord) => {
            privateRecord
              .whereNull("tr.id")
              .orWhere("tr.is_minor", false)
              .orWhere((authorizedMinor) => {
                authorizedMinor
                  .where("tr.minor_consent_status", "verified")
                  .where("tr.minor_consent_expires_at", ">", new Date());
              });
          });
      });
    } else {
      base
        .where((scope) => {
          scope
            .whereNull("source_application.id")
            .orWhere("source_application.minor_at_submission", false);
        })
        .where((scope) => {
          scope.whereNull("tr.id").orWhere("tr.is_minor", false);
        });
    }

    if (boardId) base.where("rm.board_id", boardId);
    if (stage) base.where("rm.stage", stage);
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      base.where((query) => {
        query
          .whereRaw("LOWER(COALESCE(p.first_name, tr.first_name, '')) LIKE ?", [term])
          .orWhereRaw("LOWER(COALESCE(p.last_name, tr.last_name, '')) LIKE ?", [term])
          .orWhereRaw("LOWER(COALESCE(p.city, tr.market, '')) LIKE ?", [term]);
      });
    }

    const countRow = await base.clone().clearSelect().clearOrder().countDistinct("rm.id as count").first();
    const total = Number(countRow?.count || 0);
    const rows = await base
      .clone()
      .select(
        "rm.id as membership_id",
        "rm.profile_id",
        "rm.talent_record_id",
        "rm.board_id",
        "rm.stage",
        "rm.status as membership_status",
        "rm.joined_at",
        "rm.left_at",
        "b.name as board_name",
        "b.board_type as board_type",
        ...PROFILE_COLUMNS.map((column) => `p.${column} as profile_${column}`),
        "tr.first_name as record_first_name",
        "tr.last_name as record_last_name",
        "tr.market as record_market",
        "tr.height_cm as record_height_cm",
        "tr.measurements as record_measurements",
        "tr.photo_path as record_photo_path",
        "tr.is_minor as record_is_minor",
        "tr.minor_consent_status as record_minor_consent_status",
      )
      .orderBy("rm.joined_at", "desc")
      .limit(limit)
      .offset((page - 1) * limit);

    const profileIds = rows.map((row) => row.profile_id).filter(Boolean);
    await ensureModerationColumnChecked(knex);
    const images = profileIds.length
      ? await knex("images")
          .whereIn("profile_id", profileIds)
          .modify((query) => applyImageVisibility(query, AUDIENCE.AGENCY_DISCOVERY))
          .select("profile_id", "public_url", "path", "is_primary", "sort")
          .orderBy(["profile_id", "is_primary", "sort"])
      : [];
    const imageByProfile = new Map();
    images.forEach((image) => {
      if (!imageByProfile.has(image.profile_id) || image.is_primary) {
        imageByProfile.set(image.profile_id, image.public_url || image.path || null);
      }
    });

    const today = new Date().toISOString().slice(0, 10);
    const commitmentRows = profileIds.length
      ? await knex("talent_commitments")
          .where({ agency_id: agencyId, status: "active" })
          .whereIn("profile_id", profileIds)
          .where("start_date", "<=", today)
          .where("end_date", ">=", today)
          .select("profile_id", "kind", "option_tier", "start_date", "end_date")
      : [];
    const commitmentsByProfile = new Map();
    commitmentRows.forEach((commitment) => {
      const current = commitmentsByProfile.get(commitment.profile_id) || [];
      current.push(commitment);
      commitmentsByProfile.set(commitment.profile_id, current);
    });

    const boardStandings = await loadBoardStandings(
      knex,
      rows.map((row) => row.membership_id),
    );

    const items = rows.map((row) => {
      const platform = Boolean(row.profile_id);
      const measurements = platform
        ? {
            bust_cm: row.profile_bust_cm,
            chest_cm: row.profile_chest_cm,
            waist_cm: row.profile_waist_cm,
            hips_cm: row.profile_hips_cm,
            inseam_cm: row.profile_inseam_cm,
            shoe_size: row.profile_shoe_size,
          }
        : parseJson(row.record_measurements, {});
      return {
        id: row.membership_id,
        profileId: row.profile_id,
        talentRecordId: row.talent_record_id,
        source: platform ? "pholio" : "agency_private",
        name:
          [
            platform ? row.profile_first_name : row.record_first_name,
            platform ? row.profile_last_name : row.record_last_name,
          ]
            .filter(Boolean)
            .join(" ") || "Roster talent",
        location: platform ? row.profile_city : row.record_market,
        // Singular primary board, kept for callers that predate multi-board.
        board:
          row.board_id && isDivisionBoard(row.board_type)
            ? { id: row.board_id, name: row.board_name }
            : null,
        // Every division this talent sits on, strongest standing first.
        boards: boardStandings.get(row.membership_id) || [],
        stage: row.stage,
        membershipStatus: row.membership_status,
        availability: resolveAvailability({
          membershipStatus: row.membership_status,
          availabilityStatus: platform ? row.profile_availability_status : null,
          commitments: commitmentsByProfile.get(row.profile_id) || [],
        }),
        heightCm: platform ? row.profile_height_cm : row.record_height_cm,
        measurements,
        measurementsUpdatedAt: platform ? row.profile_measurements_updated_at : null,
        measuredInPersonAt: platform ? row.profile_measured_in_person_at : null,
        imageUrl: platform ? imageByProfile.get(row.profile_id) || null : row.record_photo_path,
        isMinor: platform ? calculateMinor(row.profile_date_of_birth) : Boolean(row.record_is_minor),
        joinedAt: row.joined_at,
      };
    });

    return res.json({ success: true, data: { items, pagination: pagination(page, limit, total) } });
  } catch (error) {
    return next(error);
  }
});

router.get("/api/agency/roster/:membershipOrProfileId", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const agencyId = getSessionAgencyId(req.session);
    const membership = await knex("roster_memberships")
      .where({ agency_id: agencyId })
      .andWhere((query) => {
        query
          .where("id", req.params.membershipOrProfileId)
          .orWhere("profile_id", req.params.membershipOrProfileId);
      })
      .first();
    if (!membership) return res.status(404).json({ error: "Roster membership not found" });

    if (membership.source_application_id) {
      const access = await getApplicationAccessDecision(knex, {
        agencyId,
        applicationId: membership.source_application_id,
        allowMinor: req.allowMinorSubmissions,
      });
      if (!access.allowed) {
        return res.status(403).json({
          error: "MINOR_SUBMISSION_ACCESS_DENIED",
          reason: access.reason,
        });
      }
    }

    if (membership.talent_record_id) {
      const record = await knex("talent_records")
        .where({ id: membership.talent_record_id, agency_id: agencyId })
        .select(
          "id",
          "first_name",
          "last_name",
          "email",
          "phone",
          "gender",
          "date_of_birth",
          "height_cm",
          "measurements",
          "board_hint",
          "market",
          "photo_path",
          "is_minor",
          "minor_consent_status",
          "minor_consent_expires_at",
          "created_at",
          "updated_at",
        )
        .first();
      if (
        record?.is_minor &&
        (!req.allowMinorSubmissions ||
          record.minor_consent_status !== "verified" ||
          new Date(record.minor_consent_expires_at).getTime() <= Date.now())
      ) {
        return res.status(403).json({
          error: "MINOR_SUBMISSION_ACCESS_DENIED",
          reason: "guardian_authorization_required",
        });
      }
      const commitments = await knex("talent_commitments")
        .where({
          agency_id: agencyId,
          roster_membership_id: membership.id,
          status: "active",
        })
        .select("id", "kind", "option_tier", "start_date", "end_date", "market", "client_ref", "category", "notes")
        .orderBy("start_date", "desc");
      return res.json({
        success: true,
        data: {
          membership,
          talent: record ? { ...record, measurements: parseJson(record.measurements, {}) } : null,
          commitments,
          source: "agency_private",
        },
      });
    }

    const profile = await knex("profiles")
      .where({ id: membership.profile_id })
      .select(...PROFILE_COLUMNS)
      .first();
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    await ensureModerationColumnChecked(knex);
    const images = await knex("images")
      .where({ profile_id: profile.id })
      .modify((query) => applyImageVisibility(query, AUDIENCE.AGENCY_DISCOVERY))
      .orderBy(["sort", "created_at"]);
    const socialByProfile = await loadSocialAccountsForProfiles([profile.id]);
    const commitments = await knex("talent_commitments")
      .where({ profile_id: profile.id, agency_id: agencyId, status: "active" })
      .select("id", "kind", "option_tier", "start_date", "end_date", "market", "client_ref", "category", "notes")
      .orderBy("start_date", "desc");

    return res.json({
      success: true,
      data: {
        membership,
        talent: buildAgencySubmissionDTO(profile, {
          images,
          social: socialByProfile[profile.id] || [],
        }),
        commitments,
        source: "pholio",
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/api/agency/talent-records", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const parsed = talentRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid talent record", details: parsed.error.flatten() });
    }
    const value = parsed.data;
    const agencyId = getSessionAgencyId(req.session);
    const actorUserId = getSessionActorUserId(req.session);
    const isMinor = value.isMinor ?? calculateMinor(value.dateOfBirth);
    const recordId = uuidv4();
    const membershipId = uuidv4();

    await knex.transaction(async (trx) => {
      await trx("talent_records").insert({
        id: recordId,
        agency_id: agencyId,
        first_name: value.firstName,
        last_name: value.lastName,
        email: value.email || null,
        phone: value.phone || null,
        gender: value.gender || null,
        date_of_birth: value.dateOfBirth || null,
        height_cm: value.heightCm || null,
        measurements: value.measurements ? JSON.stringify(value.measurements) : null,
        board_hint: value.boardHint || null,
        market: value.market || null,
        is_minor: isMinor,
        minor_consent_status: isMinor ? "pending" : "not_required",
        created_by_user_id: actorUserId,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
      await trx("roster_memberships").insert({
        id: membershipId,
        agency_id: agencyId,
        talent_record_id: recordId,
        board_id: value.boardId || null,
        stage: value.stage,
        status: "active",
        joined_at: trx.fn.now(),
        created_by_user_id: actorUserId,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    });

    return res.status(201).json({ success: true, data: { id: recordId, membershipId } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/api/agency/talent-records/:recordId", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const parsed = talentRecordUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid talent record update", details: parsed.error.flatten() });
    }
    const value = parsed.data;
    const agencyId = getSessionAgencyId(req.session);
    const current = await knex("talent_records")
      .where({ id: req.params.recordId, agency_id: agencyId })
      .first();
    if (!current) return res.status(404).json({ error: "Talent record not found" });

    const update = { updated_at: knex.fn.now() };
    if (Object.hasOwn(value, "firstName")) update.first_name = value.firstName;
    if (Object.hasOwn(value, "lastName")) update.last_name = value.lastName;
    if (Object.hasOwn(value, "email")) update.email = value.email || null;
    if (Object.hasOwn(value, "phone")) update.phone = value.phone || null;
    if (Object.hasOwn(value, "gender")) update.gender = value.gender || null;
    if (Object.hasOwn(value, "heightCm")) update.height_cm = value.heightCm || null;
    if (Object.hasOwn(value, "measurements")) {
      update.measurements = value.measurements ? JSON.stringify(value.measurements) : null;
    }
    if (Object.hasOwn(value, "boardHint")) update.board_hint = value.boardHint || null;
    if (Object.hasOwn(value, "market")) update.market = value.market || null;
    if (Object.hasOwn(value, "dateOfBirth")) {
      update.date_of_birth = value.dateOfBirth || null;
      const isMinor = value.isMinor ?? calculateMinor(value.dateOfBirth);
      update.is_minor = isMinor;
      update.minor_consent_status = isMinor
        ? (current.minor_consent_status === "verified" ? "verified" : "pending")
        : "not_required";
    } else if (Object.hasOwn(value, "isMinor")) {
      update.is_minor = value.isMinor;
    }

    await knex("talent_records").where({ id: current.id }).update(update);
    return res.json({ success: true, data: { id: current.id } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/api/agency/roster-memberships/:membershipId", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const parsed = membershipUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid roster update", details: parsed.error.flatten() });
    }
    const agencyId = getSessionAgencyId(req.session);
    const current = await knex("roster_memberships")
      .where({ id: req.params.membershipId, agency_id: agencyId })
      .first();
    if (!current) return res.status(404).json({ error: "Roster membership not found" });
    const update = { updated_at: knex.fn.now() };
    if (Object.hasOwn(parsed.data, "boardId")) update.board_id = parsed.data.boardId;
    if (parsed.data.stage) update.stage = parsed.data.stage;
    if (parsed.data.status) {
      update.status = parsed.data.status;
      update.left_at = ["left", "ended"].includes(parsed.data.status) ? knex.fn.now() : null;
    }
    await knex("roster_memberships").where({ id: current.id }).update(update);
    return res.json({ success: true, data: { id: current.id, ...parsed.data } });
  } catch (error) {
    return next(error);
  }
});

/* ============================================================
   Board standings — the write path

   A talent can sit on several boards with a different standing on each
   (see the roster_board_standings migration). This replaces the whole set
   in one transaction rather than exposing add/remove/patch separately:
   standings are a small set that a booker edits as a unit, and a single
   idempotent PUT removes the ordering and partial-failure problems that
   granular endpoints create.
   ============================================================ */

// Mirrors STANDINGS in client/src/domains/agency/components/status/divisions.js
// and the CHECK constraint on roster_board_standings.
const BOARD_STANDINGS = [
  "represented",
  "active",
  "developing",
  "shortlisted",
  "onfile",
  "inactive",
  "ended",
  "passed",
  "unknown",
];

const boardStandingsSchema = z.object({
  boards: z
    .array(
      z.object({
        boardId: z.string().uuid(),
        standing: z.enum(BOARD_STANDINGS),
        isPrimary: z.boolean().optional(),
        notes: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .max(24),
});

router.put(
  "/api/agency/roster-memberships/:membershipId/boards",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      if (!(await hasStandingsTable(knex))) {
        return res.status(503).json({ error: "Board standings are not available yet" });
      }

      const parsed = boardStandingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid board standings", details: parsed.error.flatten() });
      }
      const agencyId = getSessionAgencyId(req.session);

      const membership = await knex("roster_memberships")
        .where({ id: req.params.membershipId, agency_id: agencyId })
        .first();
      if (!membership) return res.status(404).json({ error: "Roster membership not found" });

      const requested = parsed.data.boards;
      const boardIds = [...new Set(requested.map((b) => b.boardId))];
      if (boardIds.length !== requested.length) {
        return res.status(400).json({ error: "A board can appear only once" });
      }
      if (requested.filter((b) => b.isPrimary).length > 1) {
        return res.status(400).json({ error: "Only one board can be the primary board" });
      }

      // Every board must belong to this agency AND be a division, never a
      // casting board. Checked server-side: the client picker filters too, but
      // an ID can be posted directly.
      const valid = boardIds.length
        ? await onlyDivisionBoards(
            knex("boards as sb").whereIn("sb.id", boardIds).where("sb.agency_id", agencyId),
            "sb",
          ).select("sb.id")
        : [];
      const validIds = new Set(valid.map((row) => row.id));
      const rejected = boardIds.filter((id) => !validIds.has(id));
      if (rejected.length > 0) {
        return res
          .status(400)
          .json({ error: "Unknown or non-division board", details: { boardIds: rejected } });
      }

      const primary = requested.find((b) => b.isPrimary) || null;

      await knex.transaction(async (trx) => {
        await trx("roster_board_standings").where({ membership_id: membership.id }).del();
        if (requested.length > 0) {
          await trx("roster_board_standings").insert(
            requested.map((b) => ({
              id: uuidv4(),
              membership_id: membership.id,
              board_id: b.boardId,
              standing: b.standing,
              is_primary: Boolean(b.isPrimary),
              notes: b.notes || null,
            })),
          );
        }
        // Keep the denormalised pointer in step, so callers that still read
        // the singular `board_id` do not go stale.
        await trx("roster_memberships")
          .where({ id: membership.id })
          .update({ board_id: primary ? primary.boardId : null, updated_at: trx.fn.now() });
      });

      const boards = await loadBoardStandings(knex, [membership.id]);
      return res.json({
        success: true,
        data: { id: membership.id, boards: boards.get(membership.id) || [] },
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
