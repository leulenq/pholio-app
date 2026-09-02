"use strict";

/**
 * Discover semantic layer — the scheduled sweep
 * (tasks/discover-semantic-2026-09.md §3.5).
 *
 * The write hooks are the fast path; this is the guarantee. A dropped queue
 * job, a serverless container that died mid-request, or a profile edited by a
 * path nobody remembered to hook cannot leave a talent unsearchable for
 * longer than an hour: `profiles.discover_indexed_at` is the stale marker, and
 * this reindexes stale profiles in bounded batches inside a time budget.
 *
 * It also performs the thirty-day cache sweep the 2026-07 caches migration
 * promised and never got: `discover_parse_cache` and `discover_embed_cache`
 * are memoization only, keyed by hash, and grow forever without it.
 *
 * Everything here tolerates a missing table, so it is safe to schedule before
 * the migration has run everywhere.
 */

const {
  reindexProfile,
  findStaleProfileIds,
} = require("../../ai/discover-index");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH = 25;
const DEFAULT_BUDGET_MS = 20_000;
const CACHE_TTL_DAYS = 30;
const CACHE_TABLES = ["discover_parse_cache", "discover_embed_cache"];

function batchSizeFrom(env) {
  const raw = parseInt(env.DISCOVER_REINDEX_BATCH, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BATCH;
}

/**
 * Both cache tables stamp `created_at` with `knex.fn.now()`, which is a
 * timestamp on Postgres but the text `YYYY-MM-DD HH:MM:SS` (UTC) that
 * CURRENT_TIMESTAMP produces on SQLite. Binding a JS Date against the SQLite
 * form compares a number to text and silently matches nothing, so render the
 * cutoff in the same shape the rows were written in.
 */
function cutoffFor(knex, cutoff) {
  const client = knex.client?.config?.client || "";
  if (client === "pg" || client === "postgresql") return cutoff;
  return cutoff.toISOString().slice(0, 19).replace("T", " ");
}

async function hasTableSafe(knex, table) {
  try {
    return await knex.schema.hasTable(table);
  } catch {
    return false;
  }
}

/**
 * Delete cache rows older than the TTL. Both tables may be absent.
 * @returns {Promise<Record<string, number>>} rows deleted per table
 */
async function sweepDiscoverCaches(knex, { now = new Date() } = {}) {
  const cutoff = cutoffFor(knex, new Date(now.getTime() - CACHE_TTL_DAYS * DAY_MS));
  const deleted = {};
  for (const table of CACHE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await hasTableSafe(knex, table))) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      deleted[table] = await knex(table).where("created_at", "<", cutoff).del();
    } catch (err) {
      console.warn(
        `[discover-reindex] cache sweep failed for ${table}:`,
        err?.message || String(err),
      );
    }
  }
  return deleted;
}

/**
 * Reindex stale profiles, then sweep the caches.
 *
 * @param {import('knex').Knex} knex
 * @param {{ now?: Date, budgetMs?: number, batch?: number, env?: object,
 *           reindex?: typeof reindexProfile }} [opts]
 * @returns {Promise<{ enabled: boolean, candidates: number, reindexed: number,
 *                     purged: number, failed: number, budgetExhausted: boolean,
 *                     cacheDeleted: Record<string, number>, durationMs: number }>}
 */
async function runDiscoverReindex(knex, opts = {}) {
  const env = opts.env || process.env;
  const now = opts.now || new Date();
  const budgetMs = Number.isFinite(opts.budgetMs)
    ? opts.budgetMs
    : DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const summary = {
    enabled: false,
    candidates: 0,
    reindexed: 0,
    purged: 0,
    failed: 0,
    budgetExhausted: false,
    cacheDeleted: {},
    durationMs: 0,
  };

  // The cache sweep is pure housekeeping on Pholio's own tables and calls no
  // provider, so it runs whether or not the embedding feature is on.
  if (env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS !== "true") {
    summary.cacheDeleted = await sweepDiscoverCaches(knex, { now });
    summary.durationMs = Date.now() - startedAt;
    return summary;
  }
  summary.enabled = true;

  const limit = Number.isFinite(opts.batch) ? opts.batch : batchSizeFrom(env);
  const reindex = opts.reindex || reindexProfile;

  let profileIds = [];
  try {
    profileIds = await findStaleProfileIds(knex, { limit });
  } catch (err) {
    console.warn(
      "[discover-reindex] could not list stale profiles:",
      err?.message || String(err),
    );
    profileIds = [];
  }
  summary.candidates = profileIds.length;

  for (const profileId of profileIds) {
    if (Date.now() - startedAt >= budgetMs) {
      summary.budgetExhausted = true;
      break;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await reindex(knex, profileId);
      if (result && result.status === "purged") summary.purged += 1;
      else summary.reindexed += 1;
    } catch (err) {
      summary.failed += 1;
      console.warn(
        "[discover-reindex] profile failed:",
        profileId,
        err?.message || String(err),
      );
    }
  }

  summary.cacheDeleted = await sweepDiscoverCaches(knex, { now });
  summary.durationMs = Date.now() - startedAt;
  return summary;
}

module.exports = {
  runDiscoverReindex,
  sweepDiscoverCaches,
  DEFAULT_BATCH,
  DEFAULT_BUDGET_MS,
  CACHE_TTL_DAYS,
};
