"use strict";

/**
 * Discover search — talent-side availability + bookouts (WS9.1 / WS9.2).
 *
 * `profiles.availability_status` ('available' | 'limited' | 'unavailable',
 * default 'available') + `bookouts` (industry term for a talent-declared
 * unavailability window) are talent-declared inputs the launch-mode search
 * engine treats as "operational" signal (spec §6) — missing data ranks down
 * and is labeled, never silently treated as unavailable.
 *
 * Minor consent gating mirrors the MeasurementsSection `measurementsLocked`
 * pattern: a minor without recorded guardian consent gets no public
 * availability exposure, so writes here are gated the same way the existing
 * PUT /api/talent/profile route gates sensitive measurement fields
 * (`canCollectSensitiveProfileFields`, shared/lib/talent-age.js) — fail-closed
 * when no verifiable DOB is on file at all.
 *
 * Also hosts a small dedicated endpoint for the stats-currency nudge
 * (WS9.2): POST /measurements/still-accurate touches
 * `profiles.measurements_updated_at` to "now" without editing any measurement
 * value. Copy-side this is never "confirmed" — only an agency's in-person
 * measurement (measured_in_person_at, WS3.7) earns that word; this only
 * refreshes "last updated".
 */

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  canCollectSensitiveProfileFields,
} = require("../../../shared/lib/talent-age");

const AVAILABILITY_STATUSES = new Set(["available", "limited", "unavailable"]);
const MAX_NOTE_LENGTH = 200;
const LOCK_MESSAGE =
  "Date of birth and guardian consent are required before availability can be managed.";

async function loadOwnProfile(req) {
  return knex("profiles").where({ user_id: req.session.userId }).first();
}

/**
 * Mirrors the client's `measurementsLocked` derivation (ProfilePage /
 * MeasurementsSection): a minor without recorded guardian consent is locked
 * out, and — fail-closed, same as `canCollectSensitiveProfileFields` — so is
 * any profile with no verifiable DOB on file at all.
 */
function isAvailabilityLocked(profile) {
  return !canCollectSensitiveProfileFields(profile);
}

/** Normalize any date-ish value (Date instance, ISO string, 'YYYY-MM-DD') to a bare date string. */
function formatDateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function serializeBookout(row) {
  return {
    id: row.id,
    starts_on: formatDateOnly(row.starts_on),
    ends_on: formatDateOnly(row.ends_on),
    note: row.note || null,
    created_at: row.created_at,
  };
}

router.get(
  "/availability",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");
    return apiResponse.success(res, {
      status: profile.availability_status || "available",
      locked: isAvailabilityLocked(profile),
    });
  }),
);

router.put(
  "/availability",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");
    if (isAvailabilityLocked(profile)) {
      return apiResponse.forbidden(res, LOCK_MESSAGE);
    }

    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!AVAILABILITY_STATUSES.has(status)) {
      return apiResponse.error(
        res,
        "status must be one of: available, limited, unavailable",
        400,
      );
    }

    await knex("profiles")
      .where({ id: profile.id })
      .update({ availability_status: status, updated_at: knex.fn.now() });

    return apiResponse.success(res, { status, locked: false });
  }),
);

router.get(
  "/bookouts",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const rows = await knex("bookouts")
      .where({ profile_id: profile.id })
      .orderBy("starts_on", "asc");

    return apiResponse.success(res, {
      bookouts: rows.map(serializeBookout),
      locked: isAvailabilityLocked(profile),
    });
  }),
);

router.post(
  "/bookouts",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");
    if (isAvailabilityLocked(profile)) {
      return apiResponse.forbidden(res, LOCK_MESSAGE);
    }

    const startsOn = formatDateOnly(req.body?.starts_on);
    const endsOn = formatDateOnly(req.body?.ends_on);
    if (!startsOn || !endsOn) {
      return apiResponse.error(
        res,
        "starts_on and ends_on are required dates (YYYY-MM-DD)",
        400,
      );
    }
    if (startsOn > endsOn) {
      return apiResponse.error(res, "starts_on must be on or before ends_on", 400);
    }
    // Ranges spanning today (or entirely in the future) are allowed; a range
    // that has already fully elapsed is not a useful bookout to create.
    if (endsOn < todayIsoDate()) {
      return apiResponse.error(
        res,
        "A bookout cannot end entirely in the past",
        400,
      );
    }

    let note = req.body?.note;
    if (note != null && note !== "") {
      note = String(note).trim();
      if (note.length > MAX_NOTE_LENGTH) {
        return apiResponse.error(
          res,
          `note must be ${MAX_NOTE_LENGTH} characters or fewer`,
          400,
        );
      }
      note = note || null;
    } else {
      note = null;
    }

    const row = {
      id: uuidv4(),
      profile_id: profile.id,
      starts_on: startsOn,
      ends_on: endsOn,
      note,
    };
    await knex("bookouts").insert(row);
    const created = await knex("bookouts").where({ id: row.id }).first();

    return apiResponse.success(res, { bookout: serializeBookout(created) }, 201);
  }),
);

router.delete(
  "/bookouts/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    // Scoped to the caller's own profile — deleting another talent's bookout
    // is impossible regardless of the id supplied. Deletion is allowed even
    // when locked (removing a stale bookout only reduces exposure, it never
    // grants it).
    const deleted = await knex("bookouts")
      .where({ id: req.params.id, profile_id: profile.id })
      .del();
    if (!deleted) return apiResponse.notFound(res, "Bookout not found");

    return apiResponse.success(res, { deleted: true });
  }),
);

router.post(
  "/measurements/still-accurate",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");
    if (!canCollectSensitiveProfileFields(profile)) {
      return apiResponse.forbidden(
        res,
        "Date of birth and guardian consent are required before stats can be managed.",
      );
    }
    if (!profile.measurements_updated_at) {
      return apiResponse.error(res, "No measurements on file yet.", 400);
    }

    await knex("profiles")
      .where({ id: profile.id })
      .update({
        measurements_updated_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    const updated = await knex("profiles")
      .where({ id: profile.id })
      .first("measurements_updated_at");

    return apiResponse.success(res, {
      measurements_updated_at: updated.measurements_updated_at,
    });
  }),
);

module.exports = router;
