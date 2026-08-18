"use strict";

/*
 * Digitals freshness — the talent-facing surface.
 *
 * `services/digitals-freshness.js` has computed four honest states for a while,
 * but only ever inside `package-intelligence`, `send-readiness` and
 * `profile-strength`. The talent could not see it. That is the wrong way round:
 * freshness is the plan's retention spine, and a state nobody can see cannot
 * prompt anybody to act.
 *
 *   GET /api/talent/digitals/freshness   the four states, per set
 *   PUT /api/talent/digitals/capture-date  date a set that has no shoot date
 *
 * The second route is the whole point of the first. `undated` is not a warning
 * to live with, it is a question with an answer the talent already knows — when
 * the pictures were taken — and this is where they answer it.
 *
 * Two honesty rules are enforced here rather than assumed:
 *
 *  - **A shoot date is never inferred.** The upload path refuses to stamp
 *    `captured_at` from upload time, and comp card import writes no capture date
 *    at all, so a set is undated until a human says otherwise. This route is the
 *    only way a date arrives, and it comes from the talent.
 *  - **A future date is rejected, not clamped.** The freshness service treats a
 *    future capture as age zero so it cannot report a negative age, but silently
 *    accepting one would let a stale set be dated forward into "current". A date
 *    after today is a mistake and is refused as one.
 */

const express = require("express");
const router = express.Router();

const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  CURRENT_MAX_DAYS,
  AGING_MAX_DAYS,
  STATES,
  digitalsFreshness,
} = require("../services/digitals-freshness");
const { isDigitalSlot } = require("../services/profile-readiness-images");

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function loadProfile(userId) {
  return knex("profiles").where({ user_id: userId }).first("id");
}

/**
 * Every image on the profile, with the columns freshness reasons about — and
 * only those. Freshness is a question about dates and slots, not about files,
 * so no path column is read here.
 */
async function loadImages(profileId) {
  return knex("images")
    .where({ profile_id: profileId })
    .select("id", "image_type", "shot_type", "captured_at", "set_id", "metadata");
}

/**
 * Name the sets, so the talent recognises which one they are dating.
 *
 * `groupSets` keys a set by `set:<id>`, `date:<day>` or `undated`. Only the
 * first has a row with a name on it; the other two are named by what they are.
 */
async function nameSets(profileId, freshness, images) {
  const byImage = new Map((images || []).map((image) => [image.id, image]));
  const setIds = new Set();
  for (const set of freshness.sets || []) {
    for (const id of set.imageIds || []) {
      const image = byImage.get(id);
      if (image?.set_id) setIds.add(image.set_id);
    }
  }

  const rows = setIds.size
    ? await knex("image_sets")
        .where({ profile_id: profileId })
        .whereIn("id", [...setIds])
        .select("id", "name", "created_at")
    : [];
  const names = new Map(rows.map((row) => [row.id, row.name]));

  return (freshness.sets || []).map((set, index) => {
    const first = byImage.get(set.imageIds?.[0]);
    const named = first?.set_id ? names.get(first.set_id) : null;
    return {
      ...set,
      setId: first?.set_id || null,
      name:
        named ||
        (set.capturedOn ? `Shot ${set.capturedOn}` : `Undated set ${index + 1}`),
    };
  });
}

router.get(
  "/freshness",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.session.userId);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const images = await loadImages(profile.id);
    const freshness = digitalsFreshness(images);

    return apiResponse.success(res, {
      ...freshness,
      sets: await nameSets(profile.id, freshness, images),
      // The windows the states are measured against, so the surface can say
      // "agencies expect a set from the last N days" without hardcoding it.
      windows: { currentMaxDays: CURRENT_MAX_DAYS, agingMaxDays: AGING_MAX_DAYS },
      states: STATES,
    });
  }),
);

router.put(
  "/capture-date",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.session.userId);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const { imageIds, capturedOn } = req.body || {};

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return apiResponse.error(res, "Choose which pictures this date applies to.", 400, {
        code: "NO_IMAGES",
      });
    }
    if (typeof capturedOn !== "string" || !ISO_DAY.test(capturedOn)) {
      return apiResponse.error(res, "Give the shoot date as YYYY-MM-DD.", 400, {
        code: "BAD_DATE",
      });
    }

    const captured = new Date(`${capturedOn}T00:00:00.000Z`);
    if (Number.isNaN(captured.getTime())) {
      return apiResponse.error(res, "That is not a real date.", 400, { code: "BAD_DATE" });
    }
    // Refused, not clamped — see the module header.
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    if (captured.getTime() > today.getTime()) {
      return apiResponse.error(res, "A shoot date cannot be in the future.", 400, {
        code: "FUTURE_DATE",
      });
    }

    // Ownership and eligibility are checked against the database, not the body.
    const owned = await knex("images")
      .where({ profile_id: profile.id })
      .whereIn("id", imageIds)
      .select("id", "image_type", "shot_type", "metadata");

    const datable = owned.filter(isDigitalSlot);
    if (!datable.length) {
      return apiResponse.error(res, "None of those are digitals.", 400, {
        code: "NOT_DIGITALS",
      });
    }

    await knex("images")
      .where({ profile_id: profile.id })
      .whereIn(
        "id",
        datable.map((image) => image.id),
      )
      // ISO string rather than a Date: knex under jest's VM realm fails its
      // `instanceof Date` check and stores the literal "[object Object]".
      //
      // `images` has no `updated_at` column — only `created_at`. Writing one
      // here threw in the running app while passing in tests, because the test
      // schema had invented the column. See `tests/schema/test-schema-drift`.
      .update({ captured_at: captured.toISOString() });

    const images = await loadImages(profile.id);
    const freshness = digitalsFreshness(images);

    return apiResponse.success(res, {
      dated: datable.map((image) => image.id),
      // Skipped rather than silently included, so the client can say which.
      skipped: imageIds.filter((id) => !datable.some((image) => image.id === id)),
      freshness: {
        ...freshness,
        sets: await nameSets(profile.id, freshness, images),
      },
    });
  }),
);

module.exports = router;
