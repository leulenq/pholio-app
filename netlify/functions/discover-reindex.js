"use strict";

/**
 * Hourly Discover reindex sweep (tasks/discover-semantic-2026-09.md §3.5).
 *
 * Reindexes profiles whose `discover_indexed_at` is stale, in a bounded batch
 * inside a time budget well under the function's own limit, then deletes
 * `discover_parse_cache` / `discover_embed_cache` rows older than thirty days.
 *
 * The write hooks make the common case fast; this makes it reliable.
 */

const knex = require("../../src/shared/db/knex");
const {
  runDiscoverReindex,
} = require("../../src/domains/talent/services/discover-reindex-sweep");

// Leaves headroom inside the scheduled-function limit for the cache sweep and
// the cold start that preceded it.
const BUDGET_MS = 20_000;

exports.handler = async function handler() {
  try {
    const summary = await runDiscoverReindex(knex, { budgetMs: BUDGET_MS });
    console.log("[DiscoverReindex]", {
      ...summary,
      completedAt: new Date().toISOString(),
    });
    return { statusCode: 204 };
  } catch (error) {
    console.error("[DiscoverReindex] Failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "discover_reindex_failed" }),
    };
  }
};
