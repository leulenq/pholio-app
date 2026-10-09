"use strict";

/**
 * Agency arrival — the first-run experience after an agency is approved.
 *
 * Two endpoints replace the six per-step setup PATCHes for the new client:
 *
 *   GET  /api/agency/setup/arrival  everything Pholio already holds about the
 *                                   agency, composed into one introduction
 *   POST /api/agency/setup/arrival  every answer committed in one transaction,
 *                                   then the agency opens (status ACTIVE)
 *
 * The answers are few on purpose. The access request already told Pholio the
 * agency's market, boards, type, team size, and timezone; review confirmed
 * them. Arrival only asks what changes how the agency appears to talent and
 * what Pholio may hold for it: the name and city talent read, the boards open
 * to new faces, whether the agency represents minors, and how long an
 * unanswered application stays open.
 *
 * The legacy setup step rows are still written (complete) so every reader of
 * `agency_setup_steps` keeps an accurate picture.
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const {
  requireRole,
  requireAgencyMembershipRole,
} = require("../../auth/middleware/require-auth");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");
const { mountAgencyApiGuard } = require("./agency-api-guard");

const router = express.Router();
mountAgencyApiGuard(router);

const SETUP_STEPS = ["profile", "boards", "team", "open_call", "defaults", "privacy"];

/**
 * Reply windows: the presets arrival offers, and the range a typed value may
 * take (the same 1-365 Settings allows). 0, which turns auto-close off, is
 * not offered at arrival.
 */
const REVIEW_WINDOWS = [14, 21, 30, 45, 60];
const REVIEW_WINDOW_RANGE = { min: 1, max: 365 };
const DEFAULT_REVIEW_WINDOW = 30;

function isReviewWindow(days) {
  return Number.isInteger(days) && days >= REVIEW_WINDOW_RANGE.min && days <= REVIEW_WINDOW_RANGE.max;
}

/** Board names Pholio suggests when the access request named none. */
const SUGGESTED_BOARDS = ["Women", "Men", "New Faces", "Commercial", "Curve", "Runway"];

const US_MARKERS = /\b(usa|us|united states|america)\b/i;

function isPostgres() {
  const client = String(knex.client.config.client || "").toLowerCase();
  return client === "pg" || client === "postgresql";
}

function parseMaybeJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function cleanString(value, max = 500) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function cleanList(value, maxItems = 16, maxLength = 60) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanString(item, maxLength))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
}

function hasColumnCached() {
  const cache = new Map();
  return (table, column) => {
    const key = `${table}.${column}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        knex.schema.hasColumn(table, column).catch(() => {
          cache.delete(key);
          return false;
        }),
      );
    }
    return cache.get(key);
  };
}
const hasColumn = hasColumnCached();

async function loadApprovedRequest(agencyId) {
  if (!(await knex.schema.hasTable("agency_access_requests"))) return null;
  return knex("agency_access_requests")
    .where({ provisioned_agency_id: agencyId, status: "approved" })
    .orderBy("approved_at", "desc")
    .first();
}

async function loadVerification(agencyId) {
  if (!(await knex.schema.hasTable("agency_verifications"))) return null;
  const row = await knex("agency_verifications")
    .where({ agency_id: agencyId, registry_status: "active" })
    .orderBy("expires_on", "desc")
    .first();
  if (!row) return null;
  return {
    registry: row.registry,
    legalName: row.legal_name,
    certificateNumber: row.certificate_number,
  };
}

async function loadIntroduction(req) {
  const agencyId = getSessionAgencyId(req);
  const actorUserId = getSessionActorUserId(req);
  const [agency, request, verification, actor, memberCount, boards, hasWindow] =
    await Promise.all([
      knex("agencies").where({ id: agencyId }).first(),
      loadApprovedRequest(agencyId),
      loadVerification(agencyId),
      actorUserId
        ? knex("users").where({ id: actorUserId }).first("first_name", "last_name", "email")
        : null,
      knex("agency_memberships")
        .where({ agency_id: agencyId, status: "ACTIVE" })
        .count({ n: "id" })
        .first(),
      knex("boards")
        .where({ agency_id: agencyId })
        .orderBy("sort_order", "asc")
        .select("name", "kind", "is_active"),
      hasColumn("agencies", "application_review_window_days"),
    ]);

  const requestBoards = request ? parseMaybeJson(request.primary_boards, []) || [] : [];
  const openBoards = parseMaybeJson(agency.open_boards, []) || [];
  // Only divisions answer "which boards are open"; casting boards are per brief.
  const existingBoards = boards
    .filter((b) => (b.is_active == null || Boolean(b.is_active)) && (b.kind || "division") === "division")
    .map((b) => b.name);
  let boardSource = "none";
  let chosen = [];
  if (openBoards.length) [boardSource, chosen] = ["listing", openBoards];
  else if (existingBoards.length) [boardSource, chosen] = ["workspace", existingBoards];
  else if (requestBoards.length) [boardSource, chosen] = ["request", requestBoards];
  chosen = cleanList(chosen);
  const offered = cleanList([...chosen, ...requestBoards, ...SUGGESTED_BOARDS]);

  const city = request?.primary_market_city || agency.location?.split(",")[0] || null;
  const country = request?.primary_market_country || null;
  const location =
    agency.location || [request?.primary_market_city, country].filter(Boolean).join(", ") || null;
  const windowDays = hasWindow ? Number(agency.application_review_window_days) : null;

  return {
    agency: {
      name: agency.name,
      location,
      city,
      website: agency.website || request?.website_url || null,
      description: agency.description || null,
      logoPath: agency.logo_path || null,
      brandColor: agency.brand_color || null,
      instagram: agency.instagram_handle || null,
      agencyType: agency.agency_type || request?.agency_type || null,
      completedAt: agency.onboarding_completed_at || null,
    },
    approval: request
      ? {
          approvedAt: request.approved_at,
          requestedAt: request.created_at,
          contactName: request.contact_name,
          contactRole: request.contact_role,
          additionalLocations: parseMaybeJson(request.additional_locations, []) || [],
          // What the agency wrote on the request, as it wrote it.
          agencyName: request.agency_name,
          city: request.primary_market_city,
          country: request.primary_market_country || null,
          agencyType: request.agency_type,
          boards: requestBoards,
          rosterSize: request.roster_size_range,
          teamSize: request.team_size_range,
          timezone: request.timezone || null,
        }
      : null,
    verification,
    viewer: {
      firstName: actor?.first_name || null,
      email: actor?.email || null,
      role: req.session.agencyMembershipRole || null,
    },
    memberCount: Number(memberCount?.n || 0),
    boards: { chosen, offered, source: boardSource },
    reviewWindow: {
      days: isReviewWindow(windowDays) ? windowDays : DEFAULT_REVIEW_WINDOW,
      options: REVIEW_WINDOWS,
      ...REVIEW_WINDOW_RANGE,
    },
    units: US_MARKERS.test(`${country || ""} ${location || ""}`) ? "imperial_metric" : "metric",
  };
}

router.get("/api/agency/setup/arrival", requireRole("AGENCY"), async (req, res, next) => {
  try {
    return res.json({ success: true, data: await loadIntroduction(req) });
  } catch (error) {
    return next(error);
  }
});

async function completeStep(trx, agencyId, stepKey, actorUserId, data) {
  const payload = isPostgres() ? data : JSON.stringify(data ?? null);
  const existing = await trx("agency_setup_steps")
    .where({ agency_id: agencyId, step_key: stepKey })
    .first("id");
  const row = {
    status: "complete",
    completed_by_user_id: actorUserId,
    completed_at: trx.fn.now(),
    data: payload,
    updated_at: trx.fn.now(),
  };
  if (existing) {
    await trx("agency_setup_steps").where({ id: existing.id }).update(row);
  } else {
    await trx("agency_setup_steps").insert({
      id: uuidv4(),
      agency_id: agencyId,
      step_key: stepKey,
      created_at: trx.fn.now(),
      ...row,
    });
  }
}

function fail(res, code, message) {
  return res.status(400).json({ success: false, error: code, message });
}

router.post(
  "/api/agency/setup/arrival",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const body = req.body || {};

      const name = cleanString(body.name, 180);
      const location = cleanString(body.location, 160);
      const openBoards = cleanList(body.openBoards);
      const acceptsMinors = body.acceptsMinors === true;
      const minorCustodyAccepted = body.minorCustodyAccepted === true;
      const reviewWindowDays = Number(body.reviewWindowDays);
      const timezone = cleanString(body.timezone, 80);
      const units = ["metric", "imperial", "imperial_metric"].includes(body.units)
        ? body.units
        : "metric";
      const invited = cleanList(body.invited, 24, 254);

      if (!name) return fail(res, "NAME_REQUIRED", "Enter the agency name talent will see.");
      if (openBoards.length === 0) {
        return fail(res, "BOARDS_REQUIRED", "Choose at least one board talent can apply to.");
      }
      if (typeof body.acceptsMinors !== "boolean") {
        return fail(res, "MINORS_ANSWER_REQUIRED", "Answer whether the agency represents talent under 18.");
      }
      if (acceptsMinors && !minorCustodyAccepted) {
        return fail(
          res,
          "MINOR_PRIVACY_ACK_REQUIRED",
          "Accept the terms for holding records of talent under 18, or answer no.",
        );
      }
      if (!isReviewWindow(reviewWindowDays)) {
        return fail(
          res,
          "REVIEW_WINDOW_INVALID",
          `Enter a whole number of days from ${REVIEW_WINDOW_RANGE.min} to ${REVIEW_WINDOW_RANGE.max}.`,
        );
      }

      const agency = await knex("agencies").where({ id: agencyId }).first();
      const request = await loadApprovedRequest(agencyId);
      const hasWindow = await hasColumn("agencies", "application_review_window_days");

      await knex.transaction(async (trx) => {
        const update = {
          name,
          location,
          open_boards: JSON.stringify(openBoards),
          agency_type: agency.agency_type || request?.agency_type || null,
          status: "ACTIVE",
          onboarding_completed_at: trx.fn.now(),
          onboarding_completed_by_user_id: actorUserId,
          updated_at: trx.fn.now(),
        };
        if (!agency.onboarding_started_at) update.onboarding_started_at = trx.fn.now();
        if (hasWindow) update.application_review_window_days = reviewWindowDays;
        if (acceptsMinors) update.minor_data_acknowledged_at = trx.fn.now();
        await trx("agencies").where({ id: agencyId }).update(update);

        // Open boards become agency divisions. Boards not chosen are left as
        // they are: arrival adds structure, it never retires a board.
        const existing = await trx("boards").where({ agency_id: agencyId }).select("id", "name", "kind");
        const byName = new Map(existing.map((b) => [b.name.toLowerCase(), b]));
        for (const [index, boardName] of openBoards.entries()) {
          const found = byName.get(boardName.toLowerCase());
          if (found) {
            await trx("boards")
              .where({ id: found.id })
              .update({ kind: found.kind || "division", is_active: true, updated_at: trx.fn.now() });
          } else {
            await trx("boards").insert({
              id: uuidv4(),
              agency_id: agencyId,
              name: boardName,
              kind: "division",
              is_active: true,
              sort_order: index,
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });
          }
        }

        const stepData = {
          profile: { agencyName: name, via: "arrival" },
          boards: { boards: openBoards, acceptsMinors },
          team: { invited: invited.length, skipped: invited.length === 0 },
          open_call: { enabled: true, acceptsMinors, guardianConsentRequired: acceptsMinors },
          defaults: { timezone: timezone || request?.timezone || null, units, reviewWindowDays },
          privacy: { includesMinorData: acceptsMinors, acknowledgesMinorData: acceptsMinors },
        };
        for (const step of SETUP_STEPS) {
          await completeStep(trx, agencyId, step, actorUserId, stepData[step]);
        }
      });

      req.session.agencyOnboardingCompletedAt = new Date().toISOString();
      const redirect = agency.setup_return_to || "/dashboard/agency";
      delete req.session.agencySetupReturnTo;
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      return res.json({ success: true, data: { completed: true, redirect } });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
