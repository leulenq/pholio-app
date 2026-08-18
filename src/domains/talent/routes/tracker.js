"use strict";

// Off-platform submission tracker — the talent's own record of submissions made
// outside Pholio (agency's own form, email, walk-in). Talent-owned data entirely;
// no agency ever reads these rows. Implemented per docs/talent-trust-loop-design-2026-08.md.
//
// Lapse is never stored (ruling R1): every row read here gets `isLapsed`,
// `lapseDate` and `reapplyOpensOn` computed fresh from `submitted_on` +
// `review_window_days` via `src/shared/lib/submission-lapse.js`.

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  DEFAULT_TRACKER_CHANNEL,
  DEFAULT_TRACKER_STATUS,
  DEFAULT_TRACKER_WINDOW_DAYS,
  isTrackerChannel,
  isTrackerStatus,
} = require("../../../shared/constants/submission-tracker");
const {
  isLapsed,
  lapseDate,
  reapplyOpensOn,
  parseDateOnly,
  toDateOnlyString,
} = require("../../../shared/lib/submission-lapse");

const MAX_AGENCY_NAME = 160;
const MAX_DESTINATION_URL = 500;
const MAX_NOTE = 500;
const MAX_OUTCOME_NOTE = 300;
const MAX_SERIES_ID = 180;

/*
 * `sent_summary` is `jsonb` on Postgres and `text` on SQLite (see the
 * `jsonColumn` helper in the M1 migration) — Postgres accepts a plain object,
 * SQLite needs a string written and parsed back out by hand.
 */
function isPostgres() {
  const client = String(knex.client.config.client || "").toLowerCase();
  return client === "pg" || client === "postgresql";
}

function jsonForDb(value) {
  if (value == null) return null;
  return isPostgres() ? value : JSON.stringify(value);
}

function parseJsonColumn(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function loadOwnProfile(req) {
  return knex("profiles").where({ user_id: req.session.userId }).first("id");
}

function todayDateOnly() {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Row → wire shape, with the three display-time-computed lapse fields. */
function serializeRow(row, now = new Date()) {
  return {
    id: row.id,
    agencyName: row.agency_name,
    seriesId: row.series_id || null,
    channel: row.channel,
    destinationUrl: row.destination_url || null,
    submittedOn: toDateOnlyString(parseDateOnly(row.submitted_on)) || row.submitted_on,
    sentSummary: parseJsonColumn(row.sent_summary),
    note: row.note || null,
    status: row.status,
    outcomeNote: row.outcome_note || null,
    reviewWindowDays: row.review_window_days,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isLapsed: isLapsed(row, now),
    lapseDate: toDateOnlyString(lapseDate(row)),
    reapplyOpensOn: toDateOnlyString(reapplyOpensOn(row)),
  };
}

/** Trim a required string field; throws a validation message via return value. */
function trimmedOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function validateAgencyName(value) {
  const name = trimmedOrNull(value);
  if (!name) return { error: "agencyName is required." };
  if (name.length > MAX_AGENCY_NAME) {
    return { error: `agencyName must be ${MAX_AGENCY_NAME} characters or fewer.` };
  }
  return { value: name };
}

function validateChannel(value) {
  if (value == null || value === "") return { value: DEFAULT_TRACKER_CHANNEL };
  const channel = String(value).trim().toLowerCase();
  if (!isTrackerChannel(channel)) {
    return { error: "channel is not a recognized submission channel." };
  }
  return { value: channel };
}

function validateDestinationUrl(value) {
  const url = trimmedOrNull(value);
  if (!url) return { value: null };
  if (url.length > MAX_DESTINATION_URL) {
    return { error: `destinationUrl must be ${MAX_DESTINATION_URL} characters or fewer.` };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "destinationUrl must be a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "destinationUrl must be an http or https URL." };
  }
  return { value: url };
}

function validateSubmittedOn(value) {
  const raw = trimmedOrNull(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: "submittedOn is required as YYYY-MM-DD." };
  }
  const parsed = parseDateOnly(raw);
  if (!parsed) {
    return { error: "submittedOn is not a real date." };
  }
  if (parsed.getTime() > todayDateOnly().getTime()) {
    return { error: "submittedOn cannot be in the future." };
  }
  return { value: raw };
}

function validateNote(value, { max, field }) {
  const note = trimmedOrNull(value);
  if (!note) return { value: null };
  if (note.length > max) {
    return { error: `${field} must be ${max} characters or fewer.` };
  }
  return { value: note };
}

/**
 * `sentSummary` is an honest, optional note of what left the building (ruling
 * R2), not a schema Pholio enforces beyond shape: `{revisionId?, fileCount?,
 * exportEventId?}`, all optional, no unknown keys.
 */
function validateSentSummary(value) {
  if (value == null) return { value: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "sentSummary must be an object." };
  }
  const allowedKeys = new Set(["revisionId", "fileCount", "exportEventId"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return { error: `sentSummary.${key} is not a recognized field.` };
    }
  }
  const summary = {};
  if (value.revisionId != null) {
    if (typeof value.revisionId !== "string" || !value.revisionId.trim()) {
      return { error: "sentSummary.revisionId must be a string." };
    }
    summary.revisionId = value.revisionId.trim();
  }
  if (value.fileCount != null) {
    const fileCount = Number(value.fileCount);
    if (!Number.isInteger(fileCount) || fileCount < 0) {
      return { error: "sentSummary.fileCount must be a non-negative integer." };
    }
    summary.fileCount = fileCount;
  }
  if (value.exportEventId != null) {
    if (typeof value.exportEventId !== "string" || !value.exportEventId.trim()) {
      return { error: "sentSummary.exportEventId must be a string." };
    }
    summary.exportEventId = value.exportEventId.trim();
  }
  return { value: summary };
}

async function validateSeriesId(value) {
  const seriesId = trimmedOrNull(value);
  if (!seriesId) return { value: null };
  if (seriesId.length > MAX_SERIES_ID) {
    return { error: `seriesId must be ${MAX_SERIES_ID} characters or fewer.` };
  }
  // "404-free": an unrecognized seriesId is a validation failure on this
  // create call, never a 404 for the tracker resource itself.
  const exists = await knex("spec_registry_series").where({ series_id: seriesId }).first("series_id");
  if (!exists) {
    return { error: "seriesId does not match a known spec." };
  }
  return { value: seriesId };
}

router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const rows = await knex("off_platform_submissions")
      .where({ profile_id: profile.id })
      .orderBy("submitted_on", "desc")
      .orderBy("created_at", "desc");

    const now = new Date();
    return apiResponse.success(res, {
      submissions: rows.map((row) => serializeRow(row, now)),
    });
  }),
);

router.post(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const body = req.body || {};

    const agencyName = validateAgencyName(body.agencyName);
    if (agencyName.error) return apiResponse.error(res, agencyName.error, 422);

    const channel = validateChannel(body.channel);
    if (channel.error) return apiResponse.error(res, channel.error, 422);

    const destinationUrl = validateDestinationUrl(body.destinationUrl);
    if (destinationUrl.error) return apiResponse.error(res, destinationUrl.error, 422);

    const submittedOn = validateSubmittedOn(body.submittedOn);
    if (submittedOn.error) return apiResponse.error(res, submittedOn.error, 422);

    const note = validateNote(body.note, { max: MAX_NOTE, field: "note" });
    if (note.error) return apiResponse.error(res, note.error, 422);

    const sentSummary = validateSentSummary(body.sentSummary);
    if (sentSummary.error) return apiResponse.error(res, sentSummary.error, 422);

    const seriesId = await validateSeriesId(body.seriesId);
    if (seriesId.error) return apiResponse.error(res, seriesId.error, 422);

    const id = uuidv4();
    const now = knex.fn.now();
    await knex("off_platform_submissions").insert({
      id,
      profile_id: profile.id,
      series_id: seriesId.value,
      agency_name: agencyName.value,
      channel: channel.value,
      destination_url: destinationUrl.value,
      submitted_on: submittedOn.value,
      sent_summary: jsonForDb(sentSummary.value),
      note: note.value,
      status: DEFAULT_TRACKER_STATUS,
      outcome_note: null,
      review_window_days: DEFAULT_TRACKER_WINDOW_DAYS,
      status_changed_at: now,
      created_at: now,
      updated_at: now,
    });

    const created = await knex("off_platform_submissions").where({ id }).first();
    return apiResponse.success(res, { submission: serializeRow(created) }, 201);
  }),
);

router.patch(
  "/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const existing = await knex("off_platform_submissions")
      .where({ id: req.params.id, profile_id: profile.id })
      .first();
    // No oracle: a row that belongs to someone else looks identical to one
    // that never existed.
    if (!existing) return apiResponse.notFound(res, "Submission not found");

    const body = req.body || {};
    const updates = { updated_at: knex.fn.now() };
    let statusChanged = false;

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = String(body.status || "").trim().toLowerCase();
      if (!isTrackerStatus(status)) {
        return apiResponse.error(res, "status is not a recognized tracker status.", 422);
      }
      if (status !== existing.status) {
        updates.status = status;
        statusChanged = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "outcomeNote")) {
      const outcomeNote = validateNote(body.outcomeNote, {
        max: MAX_OUTCOME_NOTE,
        field: "outcomeNote",
      });
      if (outcomeNote.error) return apiResponse.error(res, outcomeNote.error, 422);
      updates.outcome_note = outcomeNote.value;
    }

    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      const note = validateNote(body.note, { max: MAX_NOTE, field: "note" });
      if (note.error) return apiResponse.error(res, note.error, 422);
      updates.note = note.value;
    }

    if (statusChanged) {
      updates.status_changed_at = knex.fn.now();
    }

    if (Object.keys(updates).length === 1) {
      // Only `updated_at` — nothing writable was actually sent.
      return apiResponse.error(res, "No editable fields were provided.", 422);
    }

    await knex("off_platform_submissions")
      .where({ id: existing.id, profile_id: profile.id })
      .update(updates);

    const updated = await knex("off_platform_submissions").where({ id: existing.id }).first();
    return apiResponse.success(res, { submission: serializeRow(updated) });
  }),
);

router.delete(
  "/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    // Hard delete (ruling R9) — this is the talent's own private record, with
    // no agency counterparty, unlike an on-Pholio application.
    const deleted = await knex("off_platform_submissions")
      .where({ id: req.params.id, profile_id: profile.id })
      .del();
    if (!deleted) return apiResponse.notFound(res, "Submission not found");

    return apiResponse.success(res, { deleted: true });
  }),
);

module.exports = router;
