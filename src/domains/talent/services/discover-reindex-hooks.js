"use strict";

/**
 * Discover semantic layer — the write hooks
 * (tasks/discover-semantic-2026-09.md §3.5).
 *
 * A talent's `discover_chunks` corpus is rebuilt whenever the source of a
 * chunk changes: their bio, their declared facts, their booking lanes, or
 * which photographs an agency can see. Every write path that touches one of
 * those calls `scheduleDiscoverReindex`, which does two things:
 *
 *   1. `markProfileStale` — a cheap `discover_indexed_at = null` stamp, so
 *      the hourly sweep picks the profile up even if step 2 never runs.
 *   2. an enqueued reindex on the existing PITS queue, so the common case is
 *      indexed within seconds instead of within the hour.
 *
 * This is fire-and-forget from the caller's point of view: the returned
 * promise never rejects, and no route awaits it. Indexing must never be able
 * to fail a talent's save.
 *
 * The flag gate is only `PHOLIO_ENABLE_PROFILE_EMBEDDINGS`. Consent is NOT
 * checked here — `reindexProfile` re-reads it at the provider boundary and
 * purges the profile's chunks when it is absent, which is exactly what has to
 * happen when a talent withdraws.
 */

const defaultKnex = require("../../../shared/db/knex");
const { enqueuePitsJob } = require("./pits-queue");
const {
  markProfileStale,
  reindexProfile,
} = require("../../ai/discover-index");

/** Profile columns whose value is rendered into a `bio` or `profile` chunk. */
const DISCOVER_INDEXED_PROFILE_FIELDS = new Set([
  "bio_raw",
  "bio_curated",
  "specialties",
  "specializations",
  "experience_level",
  "languages",
  "market",
  "city",
  "discipline",
  "modeling_categories", // legacy mirror of the booking lanes
  "is_discoverable",
]);

function embeddingsEnabled(env = process.env) {
  return env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true";
}

/**
 * True when an update touches anything the corpus is built from.
 * @param {object} updateData — the column patch about to be (or just) written
 */
function touchesDiscoverIndex(updateData) {
  if (!updateData || typeof updateData !== "object") return false;
  return Object.keys(updateData).some((key) =>
    DISCOVER_INDEXED_PROFILE_FIELDS.has(key),
  );
}

/**
 * Mark a profile stale and enqueue its reindex. Never throws, never rejects.
 * @param {string} profileId
 * @param {{ knex?: import('knex').Knex, env?: object, reason?: string }} [opts]
 * @returns {Promise<boolean>} whether a reindex was enqueued
 */
function scheduleDiscoverReindex(profileId, opts = {}) {
  const env = opts.env || process.env;
  if (!profileId || !embeddingsEnabled(env)) return Promise.resolve(false);
  const knex = opts.knex || defaultKnex;

  return Promise.resolve()
    .then(() => markProfileStale(knex, profileId))
    .then(() => enqueuePitsJob(profileId, () => reindexProfile(knex, profileId)))
    .then(() => true)
    .catch((err) => {
      console.warn(
        "[discover] reindex hook failed:",
        profileId,
        opts.reason || "",
        err?.message || String(err),
      );
      return false;
    });
}

module.exports = {
  scheduleDiscoverReindex,
  touchesDiscoverIndex,
  DISCOVER_INDEXED_PROFILE_FIELDS,
};
