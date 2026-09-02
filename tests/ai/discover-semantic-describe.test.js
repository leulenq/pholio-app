"use strict";

/**
 * Lane E — photo descriptions (src/domains/ai/describe-photo.js).
 *
 * The caption is the only thing a photograph ever contributes to Discover, so
 * two things are proved here: the attribute denylist drops a caption from every
 * forbidden family (race, skin tone, age, body, attractiveness, gender,
 * resemblance, health), and `describeAndStore` never writes without both flags,
 * both consents, an adult DOB, an eligible image, and consent that is still
 * standing after the provider call returns.
 *
 * No provider is called: the Groq client is injected with `__setGroqClient`
 * and the image fetch is mocked.
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const DB_FILE = path.join(
  __dirname,
  "..",
  "..",
  `test-discover-semantic-describe-${process.pid}.sqlite3`,
);
process.env.DATABASE_URL = `sqlite://${DB_FILE}`;
process.env.DB_CLIENT = "sqlite3";
process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS = "true";
process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";

jest.mock("../../src/shared/lib/fetch-image-buffer", () => ({
  fetchImageBuffer: jest.fn(async () => Buffer.from("fake-image-bytes")),
}));

const { fetchImageBuffer } = require("../../src/shared/lib/fetch-image-buffer");
const knex = require("../../src/shared/db/knex");
const config = require("../../src/config");
const {
  describePhotoBuffer,
  describeAndStore,
  descriptionPasses,
  photoDescriptionAllowed,
  imageEligible,
  clearPhotoDescriptions,
  DESCRIBE_PROMPT,
  __setGroqClient,
} = require("../../src/domains/ai/describe-photo");

const CLEAN =
  "Studio headshot, soft directional light, minimal makeup, hair pulled back, neutral expression, charcoal knit, plain grey backdrop, editorial register.";

const BOTH_FLAGS = {
  PHOLIO_ENABLE_IMAGE_ANALYSIS: "true",
  PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "true",
};

const ADULT_DOB = "1996-05-04";

function groqReturning(content) {
  return {
    chat: {
      completions: {
        create: jest.fn(async () => ({
          choices: [{ message: { content } }],
        })),
      },
    },
  };
}

async function insertTalent({ aiConsent = true, embedConsent = true, dob = ADULT_DOB } = {}) {
  const userId = randomUUID();
  const profileId = randomUUID();
  await knex("users").insert({
    id: userId,
    email: `describe.${profileId.slice(0, 8)}@example.com`,
    role: "TALENT",
    first_name: "Describe",
    last_name: "Fixture",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `describe-${profileId.slice(0, 8)}`,
    first_name: "Describe",
    last_name: "Fixture",
    city: "New York",
    market: "new-york",
    height_cm: 175,
    bio_raw: "Clean commercial energy, natural styling.",
    bio_curated: "Clean commercial energy, natural styling.",
    date_of_birth: dob,
    is_discoverable: true,
    is_public: true,
    profile_status: "active",
    ai_processing_consent: aiConsent,
    embedding_processing_consent: embedConsent,
  });
  return profileId;
}

async function insertImage(profileId, overrides = {}) {
  const imageId = randomUUID();
  await knex("images").insert({
    id: imageId,
    profile_id: profileId,
    path: `/uploads/${imageId}.webp`,
    label: "Headshot",
    sort: 1,
    status: "active",
    ...overrides,
  });
  return imageId;
}

beforeAll(async () => {
  await knex.migrate.latest();
}, 180000);

afterAll(async () => {
  __setGroqClient(null);
  await knex.destroy();
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(`${DB_FILE}${suffix}`);
    } catch {
      // ignore
    }
  }
}, 60000);

// ── the denylist ────────────────────────────────────────────────────────────

describe("descriptionPasses — the attribute denylist", () => {
  test("accepts a clean, attribute-neutral caption", () => {
    expect(descriptionPasses(CLEAN)).toBe(true);
    expect(
      descriptionPasses(
        "Full length daylight portrait, relaxed pose, linen suiting, warm afternoon light, park setting, commercial register.",
      ),
    ).toBe(true);
  });

  const families = {
    "race and heritage words": [
      "Studio headshot of a Black model, soft light, plain backdrop.",
      "Editorial portrait, Asian features, hard light, studio.",
      "Daylight portrait, Hispanic model, casual knit.",
      "Studio portrait, mixed-race, soft light.",
      "Portrait showing strong ethnic heritage, studio light.",
    ],
    "skin tone": [
      "Beauty close-up, deep skin tone, soft light, plain backdrop.",
      "Studio portrait, luminous complexion, minimal makeup.",
      "Daylight headshot, fair-skinned, natural styling.",
      "Beach portrait, tanned, golden hour light.",
    ],
    "age words": [
      "Studio headshot of a young model, soft light.",
      "Editorial portrait, twenties, hard directional light.",
      "Commercial portrait, middle-aged, daylight.",
      "Studio portrait, roughly 25 years old, plain backdrop.",
    ],
    "body words": [
      "Full length studio shot, tall and slim, plain backdrop.",
      "Activewear portrait, athletic build, studio light.",
      "Editorial portrait, petite, soft daylight.",
      "Studio full length, 61 cm waist, tailored suiting.",
    ],
    attractiveness: [
      "Beautiful studio portrait, soft light, minimal makeup.",
      "Stunning beauty close-up, plain grey backdrop.",
      "Handsome three-quarter portrait, daylight.",
    ],
    "gender words": [
      "Studio headshot of a woman, soft light, plain backdrop.",
      "Daylight portrait of a male model, casual knit.",
      "Editorial portrait, androgynous styling, hard light.",
      "Commercial portrait, feminine styling, warm light.",
    ],
    resemblance: [
      "Studio portrait; looks like a well-known runway face, hard light.",
      "Beauty close-up, resembles a classic screen actor, soft light.",
      "Editorial portrait, reminiscent of a nineties supermodel.",
    ],
    "health and condition": [
      "Studio portrait, visible acne, soft light, plain backdrop.",
      "Daylight portrait, pregnant, relaxed pose.",
      "Editorial portrait, faint scar, hard directional light.",
    ],
  };

  for (const [family, examples] of Object.entries(families)) {
    test(`rejects ${family}`, () => {
      for (const example of examples) {
        expect({ example, passes: descriptionPasses(example) }).toEqual({
          example,
          passes: false,
        });
      }
    });
  }

  test("rejects empty, blank and over-long captions", () => {
    expect(descriptionPasses("")).toBe(false);
    expect(descriptionPasses("   ")).toBe(false);
    expect(descriptionPasses(null)).toBe(false);
    expect(descriptionPasses(`studio ${"portrait ".repeat(90)}`)).toBe(false);
  });

  test("the prompt itself forbids every family the filter catches", () => {
    for (const word of [
      "race",
      "ethnicity",
      "skin tone",
      "age",
      "body measurements",
      "health",
      "attractiveness",
      "gender",
      "looks like",
    ]) {
      expect(DESCRIBE_PROMPT.toLowerCase()).toContain(word);
    }
  });
});

// ── the vision call ─────────────────────────────────────────────────────────

describe("describePhotoBuffer — injected Groq client", () => {
  afterEach(() => __setGroqClient(null));

  test("returns { text, model } for a clean caption", async () => {
    const groq = groqReturning(`  "${CLEAN}"  `);
    __setGroqClient(groq);

    const result = await describePhotoBuffer(Buffer.from("bytes"), {
      mimeType: "image/webp",
    });

    expect(result).toEqual({ text: CLEAN, model: config.groq.visionModel });
    expect(groq.chat.completions.create).toHaveBeenCalledTimes(1);
    const request = groq.chat.completions.create.mock.calls[0][0];
    expect(request.model).toBe(config.groq.visionModel);
    const [textPart, imagePart] = request.messages[0].content;
    expect(textPart.text).toBe(DESCRIBE_PROMPT);
    expect(imagePart.image_url.url.startsWith("data:image/webp;base64,")).toBe(true);
  });

  test("returns null when the caption trips the filter", async () => {
    __setGroqClient(
      groqReturning("Studio headshot of a beautiful young woman, deep skin tone."),
    );
    expect(await describePhotoBuffer(Buffer.from("bytes"))).toBeNull();
  });

  test("returns null when the provider throws", async () => {
    __setGroqClient({
      chat: {
        completions: {
          create: jest.fn(async () => {
            throw new Error("provider down");
          }),
        },
      },
    });
    expect(await describePhotoBuffer(Buffer.from("bytes"))).toBeNull();
  });

  test("returns null without a buffer", async () => {
    __setGroqClient(groqReturning(CLEAN));
    expect(await describePhotoBuffer(null)).toBeNull();
  });
});

// ── the gates ───────────────────────────────────────────────────────────────

describe("photoDescriptionAllowed / imageEligible", () => {
  const adult = {
    date_of_birth: ADULT_DOB,
    ai_processing_consent: true,
    embedding_processing_consent: true,
  };

  test("needs both flags and both consents", () => {
    expect(photoDescriptionAllowed(adult, BOTH_FLAGS)).toBe(true);
    expect(
      photoDescriptionAllowed(adult, { ...BOTH_FLAGS, PHOLIO_ENABLE_IMAGE_ANALYSIS: "false" }),
    ).toBe(false);
    expect(
      photoDescriptionAllowed(adult, {
        ...BOTH_FLAGS,
        PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "false",
      }),
    ).toBe(false);
    expect(
      photoDescriptionAllowed({ ...adult, ai_processing_consent: false }, BOTH_FLAGS),
    ).toBe(false);
    expect(
      photoDescriptionAllowed(
        { ...adult, embedding_processing_consent: false },
        BOTH_FLAGS,
      ),
    ).toBe(false);
  });

  test("needs a recorded adult date of birth", () => {
    expect(photoDescriptionAllowed({ ...adult, date_of_birth: null }, BOTH_FLAGS)).toBe(
      false,
    );
    expect(
      photoDescriptionAllowed({ ...adult, date_of_birth: "2015-01-01" }, BOTH_FLAGS),
    ).toBe(false);
  });

  test("an excluded, archived or rejected image is not eligible", () => {
    expect(imageEligible({ status: "active" })).toBe(true);
    expect(imageEligible({ status: null })).toBe(true);
    expect(imageEligible({ status: "active", exclude_from_agency: true })).toBe(false);
    expect(imageEligible({ status: "active", exclude_from_agency: 1 })).toBe(false);
    expect(imageEligible({ status: "archived" })).toBe(false);
    expect(imageEligible({ status: "active", moderation_status: "rejected" })).toBe(
      false,
    );
    expect(
      imageEligible({ status: "active", moderation_status: "pending_review" }),
    ).toBe(false);
    expect(imageEligible(null)).toBe(false);
  });
});

// ── describeAndStore against a real (SQLite) database ───────────────────────

describe("describeAndStore", () => {
  afterEach(() => {
    __setGroqClient(null);
    fetchImageBuffer.mockClear();
  });

  async function signalsFor(imageId) {
    return knex("image_signals").where({ image_id: imageId }).first();
  }

  test("stores the description on image_signals when everything is allowed", async () => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId);
    const describe = jest.fn(async () => ({ text: CLEAN, model: "vision-test" }));

    const result = await describeAndStore(knex, imageId, {
      describe,
      env: BOTH_FLAGS,
    });

    expect(result).toEqual({ status: "described", text: CLEAN });
    const row = await signalsFor(imageId);
    expect(row.description).toBe(CLEAN);
    expect(row.description_model).toBe("vision-test");
    expect(row.described_at).toBeTruthy();
  });

  test("updates an existing image_signals row rather than inserting a second", async () => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId);
    await knex("image_signals").insert({
      id: randomUUID(),
      image_id: imageId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await describeAndStore(knex, imageId, {
      describe: async () => ({ text: CLEAN, model: "vision-test" }),
      env: BOTH_FLAGS,
    });

    const rows = await knex("image_signals").where({ image_id: imageId });
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe(CLEAN);
  });

  test.each([
    ["the image-analysis flag", { ...BOTH_FLAGS, PHOLIO_ENABLE_IMAGE_ANALYSIS: "false" }],
    [
      "the embedding flag",
      { ...BOTH_FLAGS, PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "false" },
    ],
  ])("skips when %s is off, without calling the provider", async (_label, env) => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId);
    const describe = jest.fn();

    const result = await describeAndStore(knex, imageId, { describe, env });

    expect(result).toEqual({ status: "skipped" });
    expect(describe).not.toHaveBeenCalled();
    expect(fetchImageBuffer).not.toHaveBeenCalled();
    expect(await signalsFor(imageId)).toBeUndefined();
  });

  test.each([
    ["ai_processing_consent", { aiConsent: false }],
    ["embedding_processing_consent", { embedConsent: false }],
  ])("skips when %s is missing", async (_label, consents) => {
    const profileId = await insertTalent(consents);
    const imageId = await insertImage(profileId);
    const describe = jest.fn();

    const result = await describeAndStore(knex, imageId, {
      describe,
      env: BOTH_FLAGS,
    });

    expect(result).toEqual({ status: "skipped" });
    expect(describe).not.toHaveBeenCalled();
    expect(await signalsFor(imageId)).toBeUndefined();
  });

  test("skips a minor and a profile with no recorded date of birth", async () => {
    const minorId = await insertTalent({ dob: "2015-06-01" });
    const minorImage = await insertImage(minorId);
    const undatedId = await insertTalent({ dob: null });
    const undatedImage = await insertImage(undatedId);
    const describe = jest.fn();

    expect(
      await describeAndStore(knex, minorImage, { describe, env: BOTH_FLAGS }),
    ).toEqual({ status: "skipped" });
    expect(
      await describeAndStore(knex, undatedImage, { describe, env: BOTH_FLAGS }),
    ).toEqual({ status: "skipped" });
    expect(describe).not.toHaveBeenCalled();
  });

  test.each([
    ["excluded from agencies", { exclude_from_agency: true }],
    ["not active", { status: "archived" }],
    ["rejected in moderation", { moderation_status: "rejected" }],
  ])("skips an image that is %s", async (_label, overrides) => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId, overrides);
    const describe = jest.fn();

    const result = await describeAndStore(knex, imageId, {
      describe,
      env: BOTH_FLAGS,
    });

    expect(result).toEqual({ status: "skipped" });
    expect(describe).not.toHaveBeenCalled();
    expect(await signalsFor(imageId)).toBeUndefined();
  });

  test("skips an image that does not exist", async () => {
    expect(
      await describeAndStore(knex, randomUUID(), {
        describe: jest.fn(),
        env: BOTH_FLAGS,
      }),
    ).toEqual({ status: "skipped" });
  });

  test("reports 'filtered' and writes nothing when the caption is dropped", async () => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId);

    const result = await describeAndStore(knex, imageId, {
      describe: async () => null,
      env: BOTH_FLAGS,
    });

    expect(result).toEqual({ status: "filtered" });
    expect(await signalsFor(imageId)).toBeUndefined();
  });

  test("consent withdrawn while the provider call is in flight wins", async () => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId);

    const describe = jest.fn(async () => {
      // The withdrawal lands between the pre-call read and the post-call read.
      await knex("profiles")
        .where({ id: profileId })
        .update({ embedding_processing_consent: false });
      return { text: CLEAN, model: "vision-test" };
    });

    const result = await describeAndStore(knex, imageId, {
      describe,
      env: BOTH_FLAGS,
    });

    expect(describe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "skipped" });
    expect(await signalsFor(imageId)).toBeUndefined();
  });

  test("reports 'failed' when the image bytes cannot be read", async () => {
    const profileId = await insertTalent();
    const imageId = await insertImage(profileId);
    fetchImageBuffer.mockResolvedValueOnce(null);
    const describe = jest.fn();

    const result = await describeAndStore(knex, imageId, {
      describe,
      env: BOTH_FLAGS,
    });

    expect(result).toEqual({ status: "failed" });
    expect(describe).not.toHaveBeenCalled();
  });

  test("clearPhotoDescriptions removes every description for a profile", async () => {
    const profileId = await insertTalent();
    const first = await insertImage(profileId);
    const second = await insertImage(profileId, { sort: 2 });
    for (const imageId of [first, second]) {
      // eslint-disable-next-line no-await-in-loop
      await describeAndStore(knex, imageId, {
        describe: async () => ({ text: CLEAN, model: "vision-test" }),
        env: BOTH_FLAGS,
      });
    }

    await clearPhotoDescriptions(knex, profileId);

    const rows = await knex("image_signals").whereIn("image_id", [first, second]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.description === null)).toBe(true);
    expect(rows.every((r) => r.described_at === null)).toBe(true);
  });
});
