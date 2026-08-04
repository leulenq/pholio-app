"use strict";

process.env.NODE_ENV = "test";
process.env.GROQ_API_KEY = "test-image-provider-key";

const mockGroqCreate = jest.fn();
const mockReindexDiscoverProfile = jest.fn().mockResolvedValue(undefined);

jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreate } },
  })),
);
jest.mock("../../src/domains/ai/embeddings", () => ({
  reindexDiscoverProfile: mockReindexDiscoverProfile,
}));
jest.mock("../../src/shared/lib/fetch-image-buffer", () => ({
  fetchImageBuffer: jest.fn().mockResolvedValue(Buffer.from("image")),
}));
jest.mock("../../src/domains/pdf/composition/perception/faces", () => ({
  detectFaces: jest.fn().mockResolvedValue([]),
}));

const knexFactory = require("knex");
const {
  runImageClassification,
} = require("../../src/domains/talent/services/run-image-classification");
const {
  masterVisionAnalysis,
} = require("../../src/domains/ai/analyzeProfileImage");

const PROFILE_ID = "profile-image-race";
const IMAGE_ID = "image-race";
const ADULT_DOB = "1990-06-01";

function providerResponse(payload) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
  };
}

function pendingMetadata() {
  return JSON.stringify({
    width: 1200,
    height: 1600,
    ai: {
      classification: {
        band: "pending",
        source: "pending",
        confirmed: false,
      },
    },
  });
}

function classificationResponse() {
  return providerResponse({
    shot_type: "headshot",
    style_type: "commercial",
    image_type: "portfolio",
    confidence: { shot_type: 0.95, style_type: 0.95, image_type: 0.95 },
    signals: { body_visibility: "face_only" },
    reasoning: "Clear commercial headshot.",
    uncertainty_factors: [],
  });
}

describe("image provider consent and feature-flag races", () => {
  let db;
  let originalFlag;

  beforeAll(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("profiles", (table) => {
      table.string("id").primary();
      table.string("date_of_birth");
      table.timestamp("guardian_consent_at");
      table.boolean("ai_processing_consent").notNullable().defaultTo(false);
      table.text("image_analysis");
      table.timestamp("image_analyzed_at");
      table.string("image_analysis_model");
      table.text("look_descriptor");
      table.timestamp("look_descriptor_generated_at");
      table.timestamp("updated_at");
    });
    await db.schema.createTable("images", (table) => {
      table.string("id").primary();
      table.string("profile_id").notNullable();
      table.text("metadata");
      table.string("shot_type");
      table.string("style_type");
      table.string("image_type");
      table.boolean("exclude_from_public").defaultTo(false);
      table.boolean("exclude_from_agency").defaultTo(false);
    });
    await db.schema.createTable("image_signals", (table) => {
      table.string("id").primary();
      table.string("image_id").notNullable().unique();
      table.string("shot_type");
      table.string("style_type");
      table.string("image_type");
      table.string("expression");
      table.string("pose_yaw");
      table.string("body_visibility");
      table.string("background");
      table.string("styling_register");
      table.string("retouch_likelihood");
      table.string("makeup_level");
      table.timestamp("analyzed_at");
      table.string("model");
      table.timestamp("updated_at");
    });
  });

  beforeEach(async () => {
    originalFlag = process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS;
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "true";
    mockGroqCreate.mockReset();
    mockReindexDiscoverProfile.mockClear();
    await db("image_signals").delete();
    await db("images").delete();
    await db("profiles").delete();
    await db("profiles").insert({
      id: PROFILE_ID,
      date_of_birth: ADULT_DOB,
      ai_processing_consent: true,
    });
    await db("images").insert({
      id: IMAGE_ID,
      profile_id: PROFILE_ID,
      metadata: pendingMetadata(),
    });
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS;
    } else {
      process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = originalFlag;
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("classification drops provider output when consent is withdrawn during the call", async () => {
    mockGroqCreate.mockImplementationOnce(async () => {
      await db("profiles")
        .where({ id: PROFILE_ID })
        .update({ ai_processing_consent: false });
      return classificationResponse();
    });

    await runImageClassification(db, IMAGE_ID);

    const image = await db("images").where({ id: IMAGE_ID }).first();
    const metadata = JSON.parse(image.metadata);
    expect(mockGroqCreate).toHaveBeenCalledTimes(1);
    expect(metadata.ai.classification).toMatchObject({
      band: "disabled",
      source: "disabled",
      reason: "image_processing_disabled",
    });
    expect(image.style_type).toBeNull();
    expect(await db("image_signals").where({ image_id: IMAGE_ID })).toEqual([]);
    expect(mockReindexDiscoverProfile).not.toHaveBeenCalled();
  });

  test("classification re-reads the feature flag before invoking the provider", async () => {
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "false";

    await runImageClassification(db, IMAGE_ID);

    const image = await db("images").where({ id: IMAGE_ID }).first();
    expect(mockGroqCreate).not.toHaveBeenCalled();
    expect(JSON.parse(image.metadata).ai.classification.band).toBe("disabled");
  });

  test("eligible classification persists image tags and structured signals", async () => {
    mockGroqCreate.mockResolvedValueOnce(classificationResponse());

    await runImageClassification(db, IMAGE_ID);

    const image = await db("images").where({ id: IMAGE_ID }).first();
    expect(JSON.parse(image.metadata).ai.classification.band).not.toBe("pending");
    expect(image.style_type).toBe("commercial");
    expect(await db("image_signals").where({ image_id: IMAGE_ID }).first()).toMatchObject({
      style_type: "commercial",
      image_type: "portfolio",
    });
  });

  test("master vision does not persist output withdrawn during its provider call", async () => {
    mockGroqCreate.mockImplementationOnce(async () => {
      await db("profiles")
        .where({ id: PROFILE_ID })
        .update({ ai_processing_consent: false });
      return providerResponse({
        castingAnalysis: {
          boneStructure: "Angular",
          lookType: "Editorial",
        },
      });
    });

    const result = await masterVisionAnalysis(db, Buffer.from("image"), PROFILE_ID);
    const profile = await db("profiles").where({ id: PROFILE_ID }).first();

    expect(result).toBeNull();
    expect(mockGroqCreate).toHaveBeenCalledTimes(1);
    expect(profile.image_analysis).toBeNull();
    expect(profile.look_descriptor).toBeNull();
  });

  test("eligible master vision persists analysis and descriptor", async () => {
    mockGroqCreate
      .mockResolvedValueOnce(
        providerResponse({
          castingAnalysis: {
            boneStructure: "Angular",
            lookType: "Editorial",
          },
        }),
      )
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Editorial with commercial range" } }],
      });

    const result = await masterVisionAnalysis(db, Buffer.from("image"), PROFILE_ID);
    const profile = await db("profiles").where({ id: PROFILE_ID }).first();

    expect(result).toMatchObject({
      boneStructure: "Angular",
      lookType: "Editorial",
    });
    expect(mockGroqCreate).toHaveBeenCalledTimes(2);
    expect(JSON.parse(profile.image_analysis)).toMatchObject({
      lookType: "Editorial",
    });
    expect(profile.look_descriptor).toBe("Editorial with commercial range");
  });

  test("master vision fails closed before provider invocation when the flag is off", async () => {
    process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "false";

    const result = await masterVisionAnalysis(db, Buffer.from("image"), PROFILE_ID);

    expect(result).toBeNull();
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });
});
