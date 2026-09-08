"use strict";

/**
 * Comp cards and digitals sheets are casting assets and dashboard tools,
 * not public web portfolios. They must not be gated by `is_public` (the web portfolio toggle).
 * Non-existent slugs must still return null.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("private-profile-pdf");
const knex = require("../../src/shared/db/knex");
const { loadProfile } = require("../../src/domains/pdf/generator");
const { v4: uuidv4 } = require("uuid");

const PUBLIC_ID = uuidv4();
const PRIVATE_ID = uuidv4();
const LEGACY_ID = uuidv4();

async function seedProfile(id, slug, isPublic) {
  const userId = uuidv4();
  await knex("users").insert({ id: userId, email: `${slug}@example.com`, role: "TALENT" });
  await knex("profiles").insert({
    id,
    user_id: userId,
    slug,
    first_name: "Ada",
    last_name: "Editorial",
    city: "New York",
    height_cm: 178,
    bust_cm: 82,
    waist_cm: 61,
    hips_cm: 89,
    bio_raw: "x",
    bio_curated: "x",
    ...(isPublic === null ? {} : { is_public: isPublic }),
  });
}

beforeAll(async () => {
  await migrate(knex);
  await seedProfile(PUBLIC_ID, "ada-public", true);
  await seedProfile(PRIVATE_ID, "ada-private", false);
  await seedProfile(LEGACY_ID, "ada-legacy", null);
}, 60000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("loadProfile is not gated by is_public", () => {
  test("a private profile still loads for comp card / digitals", async () => {
    const data = await loadProfile("ada-private");
    expect(data).not.toBeNull();
    expect(data.profile.slug).toBe("ada-private");
  });

  test("a public profile still loads", async () => {
    const data = await loadProfile("ada-public");
    expect(data).not.toBeNull();
    expect(data.profile.slug).toBe("ada-public");
  });

  test("a legacy row with no is_public value still loads", async () => {
    const data = await loadProfile("ada-legacy");
    expect(data).not.toBeNull();
    expect(data.profile.slug).toBe("ada-legacy");
  });

  test("an unknown slug is still null, not an error", async () => {
    expect(await loadProfile("nobody-here")).toBeNull();
  });
});

