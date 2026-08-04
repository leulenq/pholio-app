"use strict";

const knexFactory = require("knex");
const {
  upsertTextEmbedding,
  loadEmbeddingCacheMap,
  cachedEmbed,
  buildProfileText,
} = require("../../src/domains/ai/embeddings");

describe("profile embedding consent boundaries", () => {
  let db;
  const previousFlag = process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;

  beforeAll(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("profiles", (table) => {
      table.string("id").primary();
      table.string("date_of_birth").nullable();
      table.boolean("embedding_processing_consent")
        .notNullable()
        .defaultTo(false);
      table.string("experience_level").nullable();
      table.text("modeling_categories").nullable();
      table.text("booking_lanes").nullable();
    });
    await db.schema.createTable("talent_embedding_cache", (table) => {
      table.string("profile_id").notNullable();
      table.string("source").notNullable();
      table.text("embedding_json").notNullable();
      table.text("source_text").nullable();
      table.timestamp("embedded_at").nullable();
      table.timestamp("updated_at").nullable();
      table.primary(["profile_id", "source"]);
    });
    await db.schema.createTable("discover_embed_cache", (table) => {
      table.string("text_hash").primary();
      table.text("embedding").nullable();
      table.timestamp("created_at").nullable();
    });
  });

  afterAll(async () => {
    if (previousFlag === undefined) {
      delete process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
    } else {
      process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = previousFlag;
    }
    await db.destroy();
  });

  beforeEach(async () => {
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
    await db("talent_embedding_cache").del();
    await db("discover_embed_cache").del();
    await db("profiles").del();
  });

  test("ignores a consenting caller snapshot when authoritative consent is off", async () => {
    await db("profiles").insert({
      id: "withdrawn",
      date_of_birth: "1990-01-01",
      embedding_processing_consent: false,
      experience_level: "Professional",
    });
    const embedFn = jest.fn(async () => [1, 0]);

    const result = await upsertTextEmbedding(
      db,
      "withdrawn",
      "full_profile",
      "caller supplied text",
      {
        profile: {
          id: "withdrawn",
          date_of_birth: "1990-01-01",
          embedding_processing_consent: true,
          experience_level: "Professional",
        },
        embedFn,
      },
    );

    expect(result).toBe(false);
    expect(embedFn).not.toHaveBeenCalled();
    expect(await db("talent_embedding_cache")).toEqual([]);
  });

  test("discards a provider result when consent is withdrawn before persistence", async () => {
    await db("profiles").insert({
      id: "racing-withdrawal",
      date_of_birth: "1990-01-01",
      embedding_processing_consent: true,
      experience_level: "Established",
      modeling_categories: JSON.stringify(["editorial"]),
    });
    const embedFn = jest.fn(async () => {
      await db("profiles")
        .where({ id: "racing-withdrawal" })
        .update({ embedding_processing_consent: false });
      return [1, 0];
    });

    const result = await upsertTextEmbedding(
      db,
      "racing-withdrawal",
      "discover_index",
      "ignored caller text",
      { embedFn },
    );

    expect(embedFn).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
    expect(await db("talent_embedding_cache")).toEqual([]);
  });

  test("rebuilds a bounded corpus and rejects free-form experience text", async () => {
    await db("profiles").insert({
      id: "bounded-corpus",
      date_of_birth: "1990-01-01",
      embedding_processing_consent: true,
      experience_level: "My name and protected traits should never be sent",
      modeling_categories: JSON.stringify(["editorial", "curve", "fitness"]),
    });
    const embedFn = jest.fn(async () => [1, 0]);

    const result = await upsertTextEmbedding(
      db,
      "bounded-corpus",
      "full_profile",
      "arbitrary caller-controlled biography",
      { embedFn },
    );

    expect(result).toBe(true);
    expect(embedFn).toHaveBeenCalledWith("Booking lanes: Editorial");
    expect(buildProfileText({
      experience_level: "arbitrary biography",
      modeling_categories: ["editorial"],
    })).toBe("Booking lanes: Editorial");
    const row = await db("talent_embedding_cache")
      .where({
        profile_id: "bounded-corpus",
        source: "consented_v1_full_profile",
      })
      .first();
    expect(row.source_text).toBe("Booking lanes: Editorial");
  });

  test("cache readers expose derivatives only for currently consenting adults", async () => {
    await db("profiles").insert([
      {
        id: "allowed",
        date_of_birth: "1990-01-01",
        embedding_processing_consent: true,
      },
      {
        id: "refused",
        date_of_birth: "1990-01-01",
        embedding_processing_consent: false,
      },
      {
        id: "minor",
        date_of_birth: "2015-01-01",
        embedding_processing_consent: true,
      },
      {
        id: "unknown-age",
        date_of_birth: null,
        embedding_processing_consent: true,
      },
    ]);
    await db("talent_embedding_cache").insert(
      ["allowed", "refused", "minor", "unknown-age"].map((profileId) => ({
        profile_id: profileId,
        source: "consented_v1_discover_index",
        embedding_json: JSON.stringify([1, 0]),
        source_text: "Experience: Professional",
      })),
    );

    const enabled = await loadEmbeddingCacheMap(db, [
      "allowed",
      "refused",
      "minor",
      "unknown-age",
    ]);
    expect([...enabled.keys()]).toEqual(["allowed"]);

    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";
    expect(await loadEmbeddingCacheMap(db, ["allowed"])).toEqual(new Map());
  });

  test("legacy unversioned derivatives are never consumed", async () => {
    await db("profiles").insert({
      id: "legacy-corpus",
      date_of_birth: "1990-01-01",
      embedding_processing_consent: true,
    });
    await db("talent_embedding_cache").insert({
      profile_id: "legacy-corpus",
      source: "discover_index",
      embedding_json: JSON.stringify([1, 0]),
      source_text: "old rich profile and appearance corpus",
    });

    expect(
      await loadEmbeddingCacheMap(db, ["legacy-corpus"]),
    ).toEqual(new Map());
  });

  test("feature-off neither consumes query cache nor calls its provider", async () => {
    const embedFn = jest.fn(async () => [1, 0]);
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";

    expect(await cachedEmbed(db, "editorial", { embedFn })).toBeNull();
    expect(embedFn).not.toHaveBeenCalled();
    expect(await db("discover_embed_cache")).toEqual([]);
  });
});
