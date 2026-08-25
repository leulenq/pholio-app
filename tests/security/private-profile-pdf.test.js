"use strict";

/**
 * A private profile's comp card must not be readable by a stranger.
 *
 * `/pdf/view/:slug`, `/pdf/:slug`, `/pdf/digitals/:slug` and
 * `/pdf/digitals/view/:slug` carry no authentication, and `loadProfile`
 * filtered IMAGES by visibility while never checking whether the PROFILE was
 * public. Slugs are `firstname-lastname`, so this was guessable rather than
 * merely leakable, and the documents disclose name, height, bust, waist and
 * hips — including for minors.
 *
 * The check lives in `loadProfile` rather than on each route so a fifth route
 * cannot reintroduce it.
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

describe("loadProfile refuses a private profile", () => {
  test("a private profile yields nothing to render", async () => {
    expect(await loadProfile("ada-private")).toBeNull();
  });

  test("a public profile still loads", async () => {
    const data = await loadProfile("ada-public");
    expect(data).not.toBeNull();
    expect(data.profile.slug).toBe("ada-public");
  });

  test("a legacy row with no is_public value is not treated as private", async () => {
    // NULL means "never made private" — treating it as private would silently
    // break every existing public card.
    const data = await loadProfile("ada-legacy");
    expect(data).not.toBeNull();
  });

  test("an unknown slug is still null, not an error", async () => {
    expect(await loadProfile("nobody-here")).toBeNull();
  });
});

describe("the private override has to be asked for by name", () => {
  test("an internal caller may opt in explicitly", async () => {
    // freezePresetPlan composes the owner's own stored preset and is not
    // serving a request.
    const data = await loadProfile("ada-private", { allowPrivate: true });
    expect(data).not.toBeNull();
    expect(data.profile.slug).toBe("ada-private");
  });

  test("anything short of an explicit true still refuses", async () => {
    expect(await loadProfile("ada-private", {})).toBeNull();
    expect(await loadProfile("ada-private", { allowPrivate: false })).toBeNull();
    // Truthy-but-not-true must not open it either.
    expect(await loadProfile("ada-private", { allowPrivate: "yes" })).toBeNull();
  });
});
