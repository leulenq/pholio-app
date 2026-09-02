"use strict";

/**
 * Lane C — the Discover backfill script
 * (tasks/discover-semantic-2026-09.md §3.5).
 *
 * The backfill describes and embeds an existing book, so the one thing it
 * must never do is surprise anyone: it is dry-run by default, and it refuses
 * to run at all unless both feature flags are on. A dry run reports what it
 * would call and calls nothing.
 *
 * Both AI modules are mocked; CI never calls a provider. `dotenv` is mocked
 * too — the script loads it at import time, and a developer's `.env` must not
 * leak into the test process.
 */

const { v4: uuidv4 } = require("uuid");

jest.mock("dotenv", () => ({ config: jest.fn(), parse: jest.fn(() => ({})) }));
jest.mock("../../src/domains/ai/describe-photo", () => ({
  describeAndStore: jest.fn(async () => ({ status: "described", text: "x" })),
  clearPhotoDescriptions: jest.fn(async () => {}),
}));
jest.mock("../../src/domains/ai/discover-index", () => ({
  reindexProfile: jest.fn(async () => ({
    status: "indexed",
    chunks: 2,
    embedded: 2,
  })),
  markProfileStale: jest.fn(async () => {}),
  findStaleProfileIds: jest.fn(async () => []),
  purgeDiscoverChunks: jest.fn(async () => {}),
}));

const knex = require("../../src/shared/db/knex");
const { describeAndStore } = require("../../src/domains/ai/describe-photo");
const { reindexProfile } = require("../../src/domains/ai/discover-index");
const {
  main,
  parseArgs,
  loadEligibleProfiles,
  loadImagesNeedingDescription,
} = require("../../scripts/backfill-discover-semantic");

jest.setTimeout(60000);

describe("discover semantic — backfill script", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const minorUserId = uuidv4();
  const minorProfileId = uuidv4();
  const imageId = uuidv4();
  const excludedImageId = uuidv4();

  const previous = {
    image: process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS,
    embeddings: process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS,
    argv: process.argv,
  };

  beforeAll(async () => {
    await knex.migrate.latest();
    await knex("users").insert([
      {
        id: userId,
        email: `discover-backfill-${userId}@example.com`,
        password_hash: "x",
        role: "TALENT",
        email_verified: true,
      },
      {
        id: minorUserId,
        email: `discover-backfill-${minorUserId}@example.com`,
        password_hash: "x",
        role: "TALENT",
        email_verified: true,
      },
    ]);
    await knex("profiles").insert([
      {
        id: profileId,
        user_id: userId,
        slug: `discover-backfill-${profileId}`,
        first_name: "Eligible",
        last_name: "Talent",
        city: "Paris",
        date_of_birth: "1992-02-02",
        gender: "Female",
        height_cm: 177,
        onboarding_completed_at: new Date().toISOString(),
        bio_raw: "Editorial new face.",
        bio_curated: "Editorial new face.",
        is_discoverable: true,
        ai_processing_consent: true,
        embedding_processing_consent: true,
      },
      {
        // A minor stays out of every path, consent or not (§6).
        id: minorProfileId,
        user_id: minorUserId,
        slug: `discover-backfill-${minorProfileId}`,
        first_name: "Minor",
        last_name: "Talent",
        city: "Paris",
        date_of_birth: "2014-02-02",
        gender: "Female",
        height_cm: 150,
        onboarding_completed_at: new Date().toISOString(),
        bio_raw: "",
        bio_curated: "",
        is_discoverable: true,
        ai_processing_consent: true,
        embedding_processing_consent: true,
      },
    ]);
    await knex("images").insert([
      {
        id: imageId,
        profile_id: profileId,
        path: `/uploads/${imageId}.webp`,
        public_url: `/uploads/${imageId}.webp`,
        image_type: "portfolio",
        shot_type: "headshot",
        status: "active",
        sort: 1,
        is_primary: true,
        exclude_from_agency: false,
        exclude_from_public: false,
      },
      {
        id: excludedImageId,
        profile_id: profileId,
        path: `/uploads/${excludedImageId}.webp`,
        public_url: `/uploads/${excludedImageId}.webp`,
        image_type: "portfolio",
        shot_type: "headshot",
        status: "active",
        sort: 2,
        is_primary: false,
        exclude_from_agency: true,
        exclude_from_public: true,
      },
    ]);
  });

  afterAll(async () => {
    process.argv = previous.argv;
    for (const [key, value] of [
      ["PHOLIO_ENABLE_IMAGE_ANALYSIS", previous.image],
      ["PHOLIO_ENABLE_PROFILE_EMBEDDINGS", previous.embeddings],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await knex("images").where({ profile_id: profileId }).delete();
    await knex("profiles")
      .whereIn("id", [profileId, minorProfileId])
      .delete();
    await knex("users").whereIn("id", [userId, minorUserId]).delete();
    await knex.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = 0;
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "true";
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
    process.argv = ["node", "scripts/backfill-discover-semantic.js"];
  });

  test("defaults to a dry run", () => {
    expect(parseArgs([])).toMatchObject({ apply: false, concurrency: 2 });
    expect(parseArgs(["--apply", "--limit", "5", "--concurrency", "3"])).toMatchObject(
      { apply: true, limit: 5, concurrency: 3 },
    );
    expect(parseArgs(["--apply", "--limit=7", "--profile=abc"])).toMatchObject({
      apply: true,
      limit: 7,
      profileId: "abc",
    });
  });

  test("selects only discoverable, consenting adults", async () => {
    const eligible = await loadEligibleProfiles({});
    const ids = eligible.map((row) => row.id);

    expect(ids).toContain(profileId);
    expect(ids).not.toContain(minorProfileId);
  });

  test("only considers images an agency can actually see", async () => {
    const imageIds = await loadImagesNeedingDescription(profileId);

    expect(imageIds).toContain(imageId);
    expect(imageIds).not.toContain(excludedImageId);
  });

  test("a dry run calls no provider and writes nothing", async () => {
    const chunksBefore = await knex("discover_chunks").count({ n: "*" }).first();
    const signalsBefore = await knex("image_signals").count({ n: "*" }).first();

    await main();

    expect(describeAndStore).not.toHaveBeenCalled();
    expect(reindexProfile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(await knex("discover_chunks").count({ n: "*" }).first()).toEqual(
      chunksBefore,
    );
    expect(await knex("image_signals").count({ n: "*" }).first()).toEqual(
      signalsBefore,
    );
    expect(
      await knex("profiles").where({ id: profileId }).first("discover_indexed_at"),
    ).toMatchObject({ discover_indexed_at: null });
  });

  test("refuses to run when the embedding flag is off", async () => {
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";
    process.argv = ["node", "scripts/backfill-discover-semantic.js", "--apply"];

    await main();

    expect(process.exitCode).toBe(1);
    expect(describeAndStore).not.toHaveBeenCalled();
    expect(reindexProfile).not.toHaveBeenCalled();
  });

  test("refuses to run when the image-analysis flag is off", async () => {
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "false";
    process.argv = ["node", "scripts/backfill-discover-semantic.js", "--apply"];

    await main();

    expect(process.exitCode).toBe(1);
    expect(describeAndStore).not.toHaveBeenCalled();
    expect(reindexProfile).not.toHaveBeenCalled();
  });

  test("--apply describes each visible image and then reindexes the profile", async () => {
    process.argv = [
      "node",
      "scripts/backfill-discover-semantic.js",
      "--apply",
      "--profile",
      profileId,
    ];

    await main();

    expect(describeAndStore).toHaveBeenCalledWith(knex, imageId);
    expect(describeAndStore).not.toHaveBeenCalledWith(knex, excludedImageId);
    expect(reindexProfile).toHaveBeenCalledWith(knex, profileId);
    expect(describeAndStore.mock.invocationCallOrder[0]).toBeLessThan(
      reindexProfile.mock.invocationCallOrder[0],
    );
  });
});
