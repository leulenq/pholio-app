"use strict";

/**
 * Lane C — the photo-description step inside the PITS classification job
 * (tasks/discover-semantic-2026-09.md §3.5).
 *
 * An uploaded image is described and the profile reindexed in the SAME job
 * that classifies it, so a new photograph is searchable by how it looks
 * without a second queue. Two gates apply, not one: describing a photograph
 * is a vision call whose only purpose is the embedding corpus, so both
 * PHOLIO_ENABLE_IMAGE_ANALYSIS and PHOLIO_ENABLE_PROFILE_EMBEDDINGS must be
 * on. And neither step may ever throw into the classification result — a
 * provider outage must not undo a classification that already committed.
 *
 * Both AI modules are mocked; CI never calls a provider.
 */

const knexFactory = require("knex");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/domains/ai/describe-photo", () => ({
  describeAndStore: jest.fn(async () => ({
    status: "described",
    text: "Studio beauty portrait, soft frontal light, plain backdrop.",
  })),
  clearPhotoDescriptions: jest.fn(async () => {}),
}));
jest.mock("../../src/domains/ai/discover-index", () => ({
  markProfileStale: jest.fn(async () => {}),
  reindexProfile: jest.fn(async () => ({
    status: "indexed",
    chunks: 3,
    embedded: 1,
  })),
  findStaleProfileIds: jest.fn(async () => []),
  purgeDiscoverChunks: jest.fn(async () => {}),
}));
jest.mock("../../src/shared/lib/fetch-image-buffer", () => ({
  fetchImageBuffer: jest.fn(async () => Buffer.from("fake-image-bytes")),
}));
jest.mock("../../src/domains/ai/classify-portfolio-image", () => ({
  classifyPortfolioImage: jest.fn(async () => ({
    shot_type: "headshot",
    style_type: "editorial",
    image_type: "portfolio",
    signals: {},
    model: "test-model",
    analyzed_at: new Date().toISOString(),
  })),
  persistImageSignals: jest.fn(async () => true),
}));

const { describeAndStore } = require("../../src/domains/ai/describe-photo");
const { reindexProfile } = require("../../src/domains/ai/discover-index");
const {
  runImageClassification,
  describeAndReindex,
} = require("../../src/domains/talent/services/run-image-classification");

const PROFILE_ID = uuidv4();
const IMAGE_ID = uuidv4();

describe("discover semantic — description step in the classification job", () => {
  let db;
  const previous = {
    image: process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS,
    embeddings: process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS,
  };

  beforeAll(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("profiles", (table) => {
      table.string("id").primary();
      table.string("date_of_birth").nullable();
      table.timestamp("guardian_consent_at").nullable();
      table.boolean("ai_processing_consent").notNullable().defaultTo(false);
      table
        .boolean("embedding_processing_consent")
        .notNullable()
        .defaultTo(false);
    });
    await db.schema.createTable("images", (table) => {
      table.string("id").primary();
      table.string("profile_id").notNullable();
      table.string("path").nullable();
      table.string("shot_type").nullable();
      table.string("style_type").nullable();
      table.string("image_type").nullable();
      table.string("status").nullable();
      table.boolean("exclude_from_agency").notNullable().defaultTo(false);
      table.boolean("exclude_from_public").notNullable().defaultTo(false);
      table.text("metadata").nullable();
    });
  });

  afterAll(async () => {
    for (const [key, value] of [
      ["PHOLIO_ENABLE_IMAGE_ANALYSIS", previous.image],
      ["PHOLIO_ENABLE_PROFILE_EMBEDDINGS", previous.embeddings],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "true";
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
    await db("images").del();
    await db("profiles").del();
    await db("profiles").insert({
      id: PROFILE_ID,
      date_of_birth: "1993-04-04",
      ai_processing_consent: true,
      embedding_processing_consent: true,
    });
    await db("images").insert({
      id: IMAGE_ID,
      profile_id: PROFILE_ID,
      path: `/uploads/${IMAGE_ID}.webp`,
      image_type: "portfolio",
      status: "active",
      metadata: JSON.stringify({ width: 1200, height: 1600 }),
    });
  });

  test("describes the image and then reindexes the profile when both flags are on", async () => {
    await describeAndReindex(db, IMAGE_ID, PROFILE_ID);

    expect(describeAndStore).toHaveBeenCalledWith(db, IMAGE_ID);
    expect(reindexProfile).toHaveBeenCalledWith(db, PROFILE_ID);
    // Order matters: the reindex has to see the description it just wrote.
    expect(describeAndStore.mock.invocationCallOrder[0]).toBeLessThan(
      reindexProfile.mock.invocationCallOrder[0],
    );
  });

  test("does nothing when image analysis is off", async () => {
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "false";

    await describeAndReindex(db, IMAGE_ID, PROFILE_ID);

    expect(describeAndStore).not.toHaveBeenCalled();
    expect(reindexProfile).not.toHaveBeenCalled();
  });

  test("does nothing when profile embeddings are off", async () => {
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";

    await describeAndReindex(db, IMAGE_ID, PROFILE_ID);

    expect(describeAndStore).not.toHaveBeenCalled();
    expect(reindexProfile).not.toHaveBeenCalled();
  });

  test("still reindexes when the description call fails, and never throws", async () => {
    describeAndStore.mockRejectedValueOnce(new Error("vision provider down"));

    await expect(
      describeAndReindex(db, IMAGE_ID, PROFILE_ID),
    ).resolves.toBeUndefined();
    expect(reindexProfile).toHaveBeenCalledWith(db, PROFILE_ID);
  });

  test("swallows a failing reindex", async () => {
    reindexProfile.mockRejectedValueOnce(new Error("embedding provider down"));

    await expect(
      describeAndReindex(db, IMAGE_ID, PROFILE_ID),
    ).resolves.toBeUndefined();
  });

  test("the classification job runs the description step after classifying", async () => {
    await runImageClassification(db, IMAGE_ID);

    expect(describeAndStore).toHaveBeenCalledWith(db, IMAGE_ID);
    expect(reindexProfile).toHaveBeenCalledWith(db, PROFILE_ID);
  });

  test("the classification job leaves the description step alone when consent is withdrawn mid-flight", async () => {
    // The classifier's own consent re-check drops the result; the description
    // step must not run afterwards either.
    await db("profiles")
      .where({ id: PROFILE_ID })
      .update({ ai_processing_consent: false });

    await runImageClassification(db, IMAGE_ID);

    expect(describeAndStore).not.toHaveBeenCalled();
    expect(reindexProfile).not.toHaveBeenCalled();
  });
});
