"use strict";

/**
 * Lane C — the hourly Discover sweep
 * (tasks/discover-semantic-2026-09.md §3.5).
 *
 * The write hooks are the fast path; this is the guarantee. A dropped queue
 * job must not leave a talent unsearchable for longer than an hour, so stale
 * profiles are reindexed in bounded batches inside a time budget. The same
 * run performs the thirty-day cache sweep the 2026-07 caches migration
 * promised and never got.
 *
 * SQLite in memory, an injected reindexer, no provider (the CI rule in §3.7).
 */

const knexFactory = require("knex");
const { v4: uuidv4 } = require("uuid");

const {
  runDiscoverReindex,
  sweepDiscoverCaches,
  CACHE_TTL_DAYS,
} = require("../../src/domains/talent/services/discover-reindex-sweep");

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-02T12:00:00.000Z");

/**
 * Rows in these tables are stamped with `knex.fn.now()`, which on SQLite is
 * CURRENT_TIMESTAMP — the text `YYYY-MM-DD HH:MM:SS` in UTC. The fixtures
 * write the same shape the application writes, so the sweep is tested against
 * real stored values rather than a JS Date SQLite would never hold.
 */
function daysAgo(days) {
  return new Date(NOW.getTime() - days * DAY_MS)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

const NOW_TS = NOW.toISOString().slice(0, 19).replace("T", " ");

describe("discover semantic — hourly reindex sweep", () => {
  let db;
  const previousFlag = process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
  const previousBatch = process.env.DISCOVER_REINDEX_BATCH;

  beforeAll(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("profiles", (table) => {
      table.string("id").primary();
      table.boolean("is_discoverable").notNullable().defaultTo(false);
      table
        .boolean("embedding_processing_consent")
        .notNullable()
        .defaultTo(false);
      table.timestamp("discover_indexed_at").nullable();
      table.timestamp("updated_at").nullable();
    });
    await db.schema.createTable("discover_parse_cache", (table) => {
      table.string("query_hash", 64).primary();
      table.text("contract").nullable();
      table.timestamp("created_at").nullable();
    });
    await db.schema.createTable("discover_embed_cache", (table) => {
      table.string("text_hash", 64).primary();
      table.text("embedding").nullable();
      table.timestamp("created_at").nullable();
    });
  });

  afterAll(async () => {
    for (const [key, value] of [
      ["PHOLIO_ENABLE_PROFILE_EMBEDDINGS", previousFlag],
      ["DISCOVER_REINDEX_BATCH", previousBatch],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.destroy();
  });

  beforeEach(async () => {
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
    delete process.env.DISCOVER_REINDEX_BATCH;
    await db("profiles").del();
    await db("discover_parse_cache").del();
    await db("discover_embed_cache").del();
  });

  async function seedProfile({ indexedAt, updatedAt, discoverable = true, consent = true }) {
    const id = uuidv4();
    await db("profiles").insert({
      id,
      is_discoverable: discoverable,
      embedding_processing_consent: consent,
      discover_indexed_at: indexedAt,
      updated_at: updatedAt,
    });
    return id;
  }

  test("reindexes never-indexed and since-touched profiles, and leaves fresh ones alone", async () => {
    const neverIndexed = await seedProfile({
      indexedAt: null,
      updatedAt: daysAgo(2),
    });
    const touchedSince = await seedProfile({
      indexedAt: daysAgo(3),
      updatedAt: daysAgo(1),
    });
    await seedProfile({ indexedAt: NOW_TS, updatedAt: daysAgo(1) }); // fresh

    const reindex = jest.fn(async () => ({ status: "indexed", chunks: 4 }));
    const summary = await runDiscoverReindex(db, { now: NOW, reindex });

    expect(summary.enabled).toBe(true);
    expect(summary.candidates).toBe(2);
    expect(summary.reindexed).toBe(2);
    const seen = reindex.mock.calls.map((call) => call[1]).sort();
    expect(seen).toEqual([neverIndexed, touchedSince].sort());
  });

  test("skips profiles that are not discoverable or have not consented", async () => {
    await seedProfile({
      indexedAt: null,
      updatedAt: daysAgo(1),
      discoverable: false,
    });
    await seedProfile({
      indexedAt: null,
      updatedAt: daysAgo(1),
      consent: false,
    });

    const reindex = jest.fn(async () => ({ status: "indexed" }));
    const summary = await runDiscoverReindex(db, { now: NOW, reindex });

    expect(summary.candidates).toBe(0);
    expect(reindex).not.toHaveBeenCalled();
  });

  test("honours DISCOVER_REINDEX_BATCH", async () => {
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await seedProfile({ indexedAt: null, updatedAt: daysAgo(i + 1) });
    }
    process.env.DISCOVER_REINDEX_BATCH = "2";

    const reindex = jest.fn(async () => ({ status: "indexed" }));
    const summary = await runDiscoverReindex(db, { now: NOW, reindex });

    expect(summary.candidates).toBe(2);
    expect(reindex).toHaveBeenCalledTimes(2);
  });

  test("stops at the time budget instead of running past the function's limit", async () => {
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await seedProfile({ indexedAt: null, updatedAt: daysAgo(i + 1) });
    }

    const reindex = jest.fn(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: "indexed" }), 30)),
    );
    const summary = await runDiscoverReindex(db, {
      now: NOW,
      reindex,
      budgetMs: 40,
    });

    expect(summary.budgetExhausted).toBe(true);
    expect(reindex.mock.calls.length).toBeLessThan(4);
  });

  test("counts a purge separately and survives a failing profile", async () => {
    await seedProfile({ indexedAt: null, updatedAt: daysAgo(3) });
    await seedProfile({ indexedAt: null, updatedAt: daysAgo(2) });
    await seedProfile({ indexedAt: null, updatedAt: daysAgo(1) });

    const reindex = jest
      .fn()
      .mockResolvedValueOnce({ status: "indexed" })
      // A withdrawal since the profile went stale: reindexProfile purges.
      .mockResolvedValueOnce({ status: "purged" })
      .mockRejectedValueOnce(new Error("provider down"));

    const summary = await runDiscoverReindex(db, { now: NOW, reindex });

    expect(summary).toMatchObject({ reindexed: 1, purged: 1, failed: 1 });
  });

  test("deletes cache rows older than thirty days and keeps the rest", async () => {
    await db("discover_parse_cache").insert([
      { query_hash: "old-parse", created_at: daysAgo(CACHE_TTL_DAYS + 1) },
      { query_hash: "fresh-parse", created_at: daysAgo(1) },
    ]);
    await db("discover_embed_cache").insert([
      { text_hash: "old-embed", created_at: daysAgo(CACHE_TTL_DAYS + 5) },
      { text_hash: "fresh-embed", created_at: daysAgo(2) },
    ]);

    const summary = await runDiscoverReindex(db, {
      now: NOW,
      reindex: jest.fn(),
    });

    expect(summary.cacheDeleted).toEqual({
      discover_parse_cache: 1,
      discover_embed_cache: 1,
    });
    expect(await db("discover_parse_cache").pluck("query_hash")).toEqual([
      "fresh-parse",
    ]);
    expect(await db("discover_embed_cache").pluck("text_hash")).toEqual([
      "fresh-embed",
    ]);
  });

  test("sweeps the caches but reindexes nothing when the feature flag is off", async () => {
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";
    await seedProfile({ indexedAt: null, updatedAt: daysAgo(1) });
    await db("discover_embed_cache").insert({
      text_hash: "old-embed",
      created_at: daysAgo(CACHE_TTL_DAYS + 1),
    });

    const reindex = jest.fn();
    const summary = await runDiscoverReindex(db, { now: NOW, reindex });

    expect(summary.enabled).toBe(false);
    expect(reindex).not.toHaveBeenCalled();
    expect(summary.cacheDeleted.discover_embed_cache).toBe(1);
  });

  test("tolerates missing cache tables", async () => {
    const bare = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    try {
      await expect(sweepDiscoverCaches(bare, { now: NOW })).resolves.toEqual({});
    } finally {
      await bare.destroy();
    }
  });
});
