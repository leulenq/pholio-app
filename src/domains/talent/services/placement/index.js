"use strict";

/**
 * Intel — Placement (tasks/intel-placement.md).
 *
 * What a mother agent would tell an unrepresented talent: how they would be
 * filed, what their book is missing for the agencies they would approach,
 * which agencies to approach now and which later, and the dated week ahead.
 *
 *   filing    stats against typical board ranges, declared lanes
 *   shots     the shots agencies publish, against the talent's current photos
 *   agencies  every agency, grouped: represented, waiting, go, later, not_now
 *   calendar  open calls, try-again dates, closing dates, digitals due
 *
 * Under-18 profiles get none of it: Pholio's launch is adults only, and a
 * placement plan for a minor belongs with their guardian and a licensed agent.
 */

const knex = require("../../../../shared/db/knex");
const { isMinorProfile } = require("../../../../shared/lib/talent-age");
const { digitalsFreshness } = require("../digitals-freshness");
const { buildFiling } = require("./filing");
const { buildAgencies } = require("./agencies");
const { buildCalendar } = require("./calendar");

async function loadLanes(profileId) {
  try {
    if (!(await knex.schema.hasTable("profile_booking_lanes"))) return [];
    const rows = await knex("profile_booking_lanes").where({ profile_id: profileId }).select("lane_slug");
    return rows.map((r) => r.lane_slug);
  } catch {
    return [];
  }
}

async function loadImages(profileId) {
  return knex("images")
    .where({ profile_id: profileId })
    .where((q) => q.whereNull("status").orWhere("status", "active"))
    .select("id", "image_type", "label", "captured_at", "created_at");
}

async function buildPlacement(profile, { userId, now = new Date() } = {}) {
  if (isMinorProfile(profile, now)) {
    return { meta: { generatedAt: now.toISOString(), restricted: "minor" } };
  }

  const [lanes, images] = await Promise.all([loadLanes(profile.id), loadImages(profile.id)]);
  const fresh = digitalsFreshness(images, now);
  const digitals = {
    has: fresh.hasDigitals,
    state: fresh.state,
    label: fresh.label || null,
    capturedOn: fresh.currentSet?.capturedOn || null,
    dueOn: fresh.refreshDueOn || null,
  };

  const filing = buildFiling(profile, { lanes, now });
  const { agencies, shots, registryAgencies, registryAvailable } = await buildAgencies(profile, {
    userId,
    now,
    digitalsCapturedOn: digitals.capturedOn,
  });
  const calendar = await buildCalendar({ agencies, digitalsDueOn: digitals.dueOn, now });

  return {
    meta: {
      generatedAt: now.toISOString(),
      restricted: null,
      city: profile.city || null,
      registryAgencies,
      registryAvailable,
    },
    filing,
    digitals,
    shots,
    agencies,
    calendar,
  };
}

module.exports = { buildPlacement };
