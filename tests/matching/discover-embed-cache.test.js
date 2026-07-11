"use strict";

/**
 * WS6.3 — cachedEmbed get-or-compute against discover_embed_cache.
 * Uses a real temp SQLite so onConflict().merge() runs, and an injected
 * embedFn stub so nothing hits the network.
 */

const fs = require("fs");
const path = require("path");
const knexLib = require("knex");
const { cachedEmbed } = require("../../src/domains/ai/embeddings");

const DB_PATH = path.resolve(__dirname, "../../test-embed-cache.sqlite3");

let db;

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  db = knexLib({
    client: "sqlite3",
    connection: { filename: DB_PATH },
    useNullAsDefault: true,
  });
  await db.schema.createTable("discover_embed_cache", (t) => {
    t.string("text_hash", 64).primary();
    t.json("embedding").nullable();
    t.timestamp("created_at").defaultTo(db.fn.now());
  });
});

afterAll(async () => {
  await db.destroy();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

describe("cachedEmbed", () => {
  test("computes once, then serves from cache", async () => {
    const vec = Array.from({ length: 8 }, (_, i) => i / 10);
    const embedFn = jest.fn(async () => [...vec]);

    const first = await cachedEmbed(db, "editorial androgynous", { embedFn });
    const second = await cachedEmbed(db, "  Editorial   Androgynous  ", { embedFn });

    expect(first).toEqual(vec);
    expect(second).toEqual(vec);
    // Normalized identical text → embedFn invoked exactly once.
    expect(embedFn).toHaveBeenCalledTimes(1);

    const rows = await db("discover_embed_cache").select("text_hash");
    expect(rows).toHaveLength(1);
  });

  test("empty text returns null without calling embedFn", async () => {
    const embedFn = jest.fn(async () => [1, 2, 3]);
    expect(await cachedEmbed(db, "   ", { embedFn })).toBeNull();
    expect(embedFn).not.toHaveBeenCalled();
  });

  test("tolerates a missing cache table (best-effort)", async () => {
    const embedFn = jest.fn(async () => [9, 9, 9]);
    const noTableDb = knexLib({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    try {
      const out = await cachedEmbed(noTableDb, "no table here", { embedFn });
      expect(out).toEqual([9, 9, 9]);
      expect(embedFn).toHaveBeenCalledTimes(1);
    } finally {
      await noTableDb.destroy();
    }
  });
});
