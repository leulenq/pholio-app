"use strict";

/**
 * Lane E — the indexer (src/domains/ai/discover-index.js).
 *
 * The corpus rule (tasks/discover-semantic-2026-09.md §3.1) is that only the
 * talent's own words and attribute-neutral photo descriptions are ever
 * embedded: never a measurement, a name, heritage, skin tone or age. These
 * tests hold that rule, the incremental-embed contract (only changed text
 * costs a provider call), stale deletion, the consent purge, and the
 * `discover_indexed_at` stamp that drives the hourly sweep.
 *
 * Every embedding call is an injected spy — no provider is reachable.
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const DB_FILE = path.join(
  __dirname,
  "..",
  "..",
  `test-discover-semantic-index-${process.pid}.sqlite3`,
);
process.env.DATABASE_URL = `sqlite://${DB_FILE}`;
process.env.DB_CLIENT = "sqlite3";
process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";

const knex = require("../../src/shared/db/knex");
const {
  buildChunks,
  splitBio,
  profileProse,
  reindexProfile,
  markProfileStale,
  purgeDiscoverChunks,
  findStaleProfileIds,
  hashText,
  BIO_CHUNK_WORDS,
} = require("../../src/domains/ai/discover-index");

const ADULT_DOB = "1996-05-04";

/** A deterministic stand-in for the provider: one vector per input, spied. */
function spyEmbedder() {
  const fn = jest.fn(async (texts) =>
    texts.map((text, i) => [text.length % 7, i, text.length]),
  );
  return fn;
}

async function insertTalent({
  first = "Index",
  bio = "Fresh-faced and natural.",
  consent = true,
  dob = ADULT_DOB,
  lanes = [],
  extra = {},
} = {}) {
  const userId = randomUUID();
  const profileId = randomUUID();
  await knex("users").insert({
    id: userId,
    email: `index.${profileId.slice(0, 8)}@example.com`,
    role: "TALENT",
    first_name: first,
    last_name: "Fixture",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `${first.toLowerCase()}-${profileId.slice(0, 8)}`,
    first_name: first,
    last_name: "Fixture",
    city: "New York",
    market: "new-york",
    height_cm: 178,
    bio_raw: bio,
    bio_curated: bio,
    date_of_birth: dob,
    is_discoverable: true,
    is_public: true,
    profile_status: "active",
    ai_processing_consent: true,
    embedding_processing_consent: consent,
    ...extra,
  });
  if (lanes.length) {
    await knex("profile_booking_lanes").insert(
      lanes.map((lane_slug, i) => ({
        profile_id: profileId,
        lane_slug,
        priority: i + 1,
        source: "talent_selected",
      })),
    );
  }
  return profileId;
}

async function insertImage(profileId, description, overrides = {}) {
  const imageId = randomUUID();
  await knex("images").insert({
    id: imageId,
    profile_id: profileId,
    path: `/uploads/${imageId}.webp`,
    label: "Headshot",
    sort: overrides.sort ?? 1,
    status: "active",
    ...overrides,
  });
  if (description) {
    await knex("image_signals").insert({
      id: randomUUID(),
      image_id: imageId,
      description,
      description_model: "test",
      described_at: new Date().toISOString(),
    });
  }
  return imageId;
}

beforeAll(async () => {
  await knex.migrate.latest();
}, 180000);

afterAll(async () => {
  await knex.destroy();
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(`${DB_FILE}${suffix}`);
    } catch {
      // ignore
    }
  }
}, 60000);

// ── splitBio ────────────────────────────────────────────────────────────────

describe("splitBio", () => {
  test("keeps a short bio as one chunk", () => {
    expect(splitBio("Fresh-faced and natural. Approachable on camera.")).toEqual([
      "Fresh-faced and natural. Approachable on camera.",
    ]);
  });

  test("groups sentences to roughly BIO_CHUNK_WORDS words", () => {
    // Ten sentences of ten words each: groups land at or just under 60.
    const sentence = (n) => `Sentence ${n} carries exactly ten plain ordinary words here.`;
    const bio = Array.from({ length: 10 }, (_, i) => sentence(i)).join(" ");

    const chunks = splitBio(bio);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.split(/\s+/).length).toBeLessThanOrEqual(BIO_CHUNK_WORDS);
    }
    // Nothing is lost or duplicated: the pieces rejoin into the original.
    expect(chunks.join(" ")).toBe(bio);
  });

  test("a single sentence longer than the budget is not split mid-sentence", () => {
    const long = `${Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ")}.`;
    const chunks = splitBio(long);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].split(/\s+/).length).toBe(90);
  });

  test("caps at six chunks however long the bio is", () => {
    const sentence = "This sentence carries exactly ten plain ordinary simple words.";
    const bio = Array.from({ length: 120 }, () => sentence).join(" ");
    expect(splitBio(bio)).toHaveLength(6);
  });

  test("empty, blank and placeholder bios produce nothing", () => {
    expect(splitBio("")).toEqual([]);
    expect(splitBio(null)).toEqual([]);
    expect(splitBio("   ")).toEqual([]);
    expect(splitBio("Demo talent profile.")).toEqual([]);
    expect(splitBio("demo talent profile")).toEqual([]);
  });
});

// ── profileProse ────────────────────────────────────────────────────────────

describe("profileProse", () => {
  test("renders lanes, specialties, experience, market and languages", () => {
    const prose = profileProse(
      {
        specialties: JSON.stringify(["Beauty", "Swim"]),
        experience_level: "New face",
        market: "paris",
        languages: JSON.stringify(["English", "French"]),
      },
      ["editorial", "runway"],
    );
    expect(prose).toBe(
      "Editorial and Runway boards. Specialties: Beauty, Swim. New face. Based in Paris. Languages: English, French.",
    );
  });

  test("a single lane reads 'board', not 'boards'", () => {
    expect(profileProse({}, ["commercial"])).toBe("Commercial board.");
  });

  test("accepts comma-separated lists as well as JSON", () => {
    const prose = profileProse(
      { specialties: "Beauty, Swim", languages: "English, Italian" },
      [],
    );
    expect(prose).toBe("Specialties: Beauty, Swim. Languages: English, Italian.");
  });

  test("maps every experience synonym to the talent's own vocabulary", () => {
    expect(profileProse({ experience_level: "fresh face" }, [])).toBe("New face.");
    expect(profileProse({ experience_level: "Emerging" }, [])).toBe("Developing.");
    expect(profileProse({ experience_level: "professional" }, [])).toBe("Experienced.");
    expect(profileProse({ experience_level: "signed" }, [])).toBe("Established.");
    expect(profileProse({ experience_level: "nonsense" }, [])).toBe("");
  });

  test("never renders a number, a name, heritage or skin tone", () => {
    const prose = profileProse(
      {
        first_name: "Amara",
        last_name: "Okafor",
        display_name: "Amara Okafor",
        height_cm: 178,
        bust_cm: 86,
        waist_cm: 61,
        hips_cm: 90,
        weight_kg: 55,
        dress_size: "4",
        shoe_size: "9 US",
        date_of_birth: "1996-05-04",
        playing_age_min: 18,
        playing_age_max: 26,
        ethnicity: JSON.stringify(["Black/African Descent", "Mixed Heritage"]),
        skin_tone: "Deep brown",
        hair_color: "Black",
        eye_color: "Brown",
        gender: "Female",
        specialties: JSON.stringify(["Beauty"]),
        experience_level: "New face",
        market: "new-york",
        languages: JSON.stringify(["English"]),
      },
      ["editorial", "beauty"],
    );

    expect(prose).toBe(
      "Editorial and Beauty boards. Specialties: Beauty. New face. Based in New York. Languages: English.",
    );
    expect(prose).not.toMatch(/\d/);
    for (const forbidden of [
      "Amara",
      "Okafor",
      "Black/African Descent",
      "Mixed Heritage",
      "Deep brown",
      "Female",
      "1996",
    ]) {
      expect(prose).not.toContain(forbidden);
    }
    // The one heritage-adjacent word that may legitimately appear is a board
    // name the talent chose ("Beauty"), never a described attribute.
    expect(prose).not.toMatch(/heritage|skin|complexion|ethnic/i);
  });

  test("an empty profile renders nothing at all", () => {
    expect(profileProse({}, [])).toBe("");
  });
});

// ── buildChunks ─────────────────────────────────────────────────────────────

describe("buildChunks", () => {
  const profile = {
    bio_curated: "Fresh-faced and natural. Approachable warmth on camera.",
    specialties: JSON.stringify(["Lifestyle"]),
    experience_level: "New face",
    market: "new-york",
  };

  test("falls back to bio_raw when there is no curated bio", () => {
    const chunks = buildChunks({ bio_raw: "Raw words only." }, [], []);
    expect(chunks.find((c) => c.kind === "bio").text).toBe("Raw words only.");
  });

  test("photo chunk keys are stable across rebuilds and keyed by image id", () => {
    const images = [
      { id: "img-a", description: "Studio headshot, soft light." },
      { id: "img-b", description: "Daylight three-quarter, park setting." },
    ];
    const first = buildChunks(profile, ["commercial"], images);
    const second = buildChunks(profile, ["commercial"], images);

    expect(first.map((c) => c.chunk_key)).toEqual(second.map((c) => c.chunk_key));
    expect(first.map((c) => c.chunk_key)).toEqual([
      "bio:0",
      "profile:0",
      "photo:img-a",
      "photo:img-b",
    ]);
    // Reordering the book does not rename anyone's chunk.
    const reversed = buildChunks(profile, ["commercial"], images.slice().reverse());
    expect(new Set(reversed.map((c) => c.chunk_key))).toEqual(
      new Set(first.map((c) => c.chunk_key)),
    );
    expect(first.find((c) => c.chunk_key === "photo:img-a").image_id).toBe("img-a");
  });

  test("images without a description contribute nothing", () => {
    const chunks = buildChunks(profile, [], [
      { id: "img-a", description: null },
      { id: "img-b", description: "   " },
      { id: "img-c", description: "Studio headshot, soft light." },
    ]);
    expect(chunks.filter((c) => c.kind === "photo").map((c) => c.chunk_key)).toEqual([
      "photo:img-c",
    ]);
  });

  test("caps photo chunks at thirty", () => {
    const images = Array.from({ length: 45 }, (_, i) => ({
      id: `img-${i}`,
      description: `Studio frame ${i}, soft light.`,
    }));
    const chunks = buildChunks(profile, [], images);
    const photos = chunks.filter((c) => c.kind === "photo");
    expect(photos).toHaveLength(30);
    expect(photos[0].chunk_key).toBe("photo:img-0");
    expect(photos[29].chunk_key).toBe("photo:img-29");
  });

  test("a profile with nothing to say produces no chunks", () => {
    expect(buildChunks({ bio_curated: "" }, [], [])).toEqual([]);
  });

  test("hashText is whitespace- and case-insensitive", () => {
    expect(hashText("  Soft  Light. ")).toBe(hashText("soft light."));
    expect(hashText("soft light")).not.toBe(hashText("hard light"));
  });
});

// ── reindexProfile ──────────────────────────────────────────────────────────

describe("reindexProfile", () => {
  test("stores chunks, stamps discover_indexed_at, and embeds each chunk once", async () => {
    const profileId = await insertTalent({
      bio: "Fresh-faced and natural. Girl next door warmth for lifestyle campaigns.",
      lanes: ["commercial", "lifestyle"],
    });
    await insertImage(profileId, "Daylight three-quarter portrait, soft light, casual knit.");
    const embedTexts = spyEmbedder();

    const result = await reindexProfile(knex, profileId, { embedTexts });

    expect(result.status).toBe("indexed");
    expect(result.chunks).toBe(3);
    expect(result.embedded).toBe(3);
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts.mock.calls[0][1]).toMatchObject({ kind: "document" });

    const rows = await knex("discover_chunks")
      .where({ profile_id: profileId })
      .orderBy("chunk_key");
    expect(rows.map((r) => r.kind).sort()).toEqual(["bio", "photo", "profile"]);
    expect(rows.every((r) => JSON.parse(r.embedding_json).length === 3)).toBe(true);

    const stamped = await knex("profiles").where({ id: profileId }).first();
    expect(stamped.discover_indexed_at).toBeTruthy();
  });

  test("a second run with one changed bio re-embeds only the changed chunk", async () => {
    const profileId = await insertTalent({
      bio: "Fresh-faced and natural. Warm commercial energy.",
      lanes: ["commercial"],
    });
    await insertImage(profileId, "Studio headshot, soft light, minimal makeup.");
    const embedTexts = spyEmbedder();

    const first = await reindexProfile(knex, profileId, { embedTexts });
    expect(first.embedded).toBe(3);
    expect(embedTexts.mock.calls[0][0]).toHaveLength(3);

    // Nothing changed: no provider call at all.
    const unchanged = await reindexProfile(knex, profileId, { embedTexts });
    expect(unchanged.status).toBe("indexed");
    expect(unchanged.chunks).toBe(3);
    expect(unchanged.embedded).toBe(0);
    expect(embedTexts).toHaveBeenCalledTimes(1);

    // One changed bio: exactly one text goes to the provider.
    await knex("profiles")
      .where({ id: profileId })
      .update({ bio_curated: "Rewritten bio: sharp, angular, avant-garde presence." });
    const changed = await reindexProfile(knex, profileId, { embedTexts });

    expect(changed.embedded).toBe(1);
    expect(embedTexts).toHaveBeenCalledTimes(2);
    expect(embedTexts.mock.calls[1][0]).toEqual([
      "Rewritten bio: sharp, angular, avant-garde presence.",
    ]);
    const bioRow = await knex("discover_chunks")
      .where({ profile_id: profileId, chunk_key: "bio:0" })
      .first();
    expect(bioRow.text).toBe("Rewritten bio: sharp, angular, avant-garde presence.");
    expect(await knex("discover_chunks").where({ profile_id: profileId })).toHaveLength(3);
  });

  test("deletes the stale chunk when an image is removed from the book", async () => {
    const profileId = await insertTalent({ bio: "Editorial presence.", lanes: ["editorial"] });
    const keep = await insertImage(profileId, "Studio headshot, hard light.", { sort: 1 });
    const drop = await insertImage(profileId, "Daylight full length, park setting.", {
      sort: 2,
    });
    const embedTexts = spyEmbedder();

    await reindexProfile(knex, profileId, { embedTexts });
    expect(
      await knex("discover_chunks").where({ profile_id: profileId, kind: "photo" }),
    ).toHaveLength(2);

    await knex("images").where({ id: drop }).del();
    const after = await reindexProfile(knex, profileId, { embedTexts });

    expect(after.status).toBe("indexed");
    const photos = await knex("discover_chunks").where({
      profile_id: profileId,
      kind: "photo",
    });
    expect(photos.map((p) => p.chunk_key)).toEqual([`photo:${keep}`]);
    // Nothing was re-embedded to delete a row.
    expect(after.embedded).toBe(0);
  });

  test("an image excluded from agencies drops out of the corpus", async () => {
    const profileId = await insertTalent({ bio: "Editorial presence." });
    const imageId = await insertImage(profileId, "Studio headshot, hard light.");
    const embedTexts = spyEmbedder();

    await reindexProfile(knex, profileId, { embedTexts });
    expect(
      await knex("discover_chunks").where({ profile_id: profileId, kind: "photo" }),
    ).toHaveLength(1);

    await knex("images").where({ id: imageId }).update({ exclude_from_agency: true });
    await reindexProfile(knex, profileId, { embedTexts });

    expect(
      await knex("discover_chunks").where({ profile_id: profileId, kind: "photo" }),
    ).toHaveLength(0);
  });

  test("purges instead of building when consent is absent", async () => {
    const profileId = await insertTalent({ bio: "Warm commercial energy." });
    const embedTexts = spyEmbedder();
    await reindexProfile(knex, profileId, { embedTexts });
    expect(
      (await knex("discover_chunks").where({ profile_id: profileId })).length,
    ).toBeGreaterThan(0);

    await knex("profiles")
      .where({ id: profileId })
      .update({ embedding_processing_consent: false });
    const result = await reindexProfile(knex, profileId, { embedTexts });

    expect(result).toEqual({ status: "purged", chunks: 0, embedded: 0 });
    expect(await knex("discover_chunks").where({ profile_id: profileId })).toHaveLength(0);
  });

  test("purges when the global embedding flag is off", async () => {
    const profileId = await insertTalent({ bio: "Warm commercial energy." });
    const embedTexts = spyEmbedder();
    await reindexProfile(knex, profileId, { embedTexts });

    const result = await reindexProfile(knex, profileId, {
      embedTexts,
      env: { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "false" },
    });

    expect(result.status).toBe("purged");
    expect(await knex("discover_chunks").where({ profile_id: profileId })).toHaveLength(0);
  });

  test("a minor is never indexed", async () => {
    const profileId = await insertTalent({ bio: "Warm energy.", dob: "2014-01-01" });
    const embedTexts = spyEmbedder();

    const result = await reindexProfile(knex, profileId, { embedTexts });

    expect(result.status).toBe("purged");
    expect(embedTexts).not.toHaveBeenCalled();
  });

  test("consent withdrawn while the provider call is in flight purges the write", async () => {
    const profileId = await insertTalent({ bio: "Warm commercial energy." });
    const embedTexts = jest.fn(async (texts) => {
      await knex("profiles")
        .where({ id: profileId })
        .update({ embedding_processing_consent: false });
      return texts.map(() => [0.1, 0.2, 0.3]);
    });

    const result = await reindexProfile(knex, profileId, { embedTexts });

    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "purged", chunks: 0, embedded: 0 });
    expect(await knex("discover_chunks").where({ profile_id: profileId })).toHaveLength(0);
  });

  test("a missing profile purges rather than throwing", async () => {
    const result = await reindexProfile(knex, randomUUID(), { embedTexts: spyEmbedder() });
    expect(result.status).toBe("purged");
  });

  test("purgeDiscoverChunks can drop a single kind", async () => {
    const profileId = await insertTalent({ bio: "Warm commercial energy." });
    await insertImage(profileId, "Studio headshot, soft light.");
    await reindexProfile(knex, profileId, { embedTexts: spyEmbedder() });

    await purgeDiscoverChunks(knex, profileId, { kinds: ["photo"] });

    const kinds = (
      await knex("discover_chunks").where({ profile_id: profileId }).select("kind")
    ).map((r) => r.kind);
    expect(kinds).not.toContain("photo");
    expect(kinds).toContain("bio");
  });
});

// ── staleness ───────────────────────────────────────────────────────────────

describe("markProfileStale / findStaleProfileIds", () => {
  test("markProfileStale nulls the stamp", async () => {
    const profileId = await insertTalent({ bio: "Warm commercial energy." });
    await reindexProfile(knex, profileId, { embedTexts: spyEmbedder() });
    expect((await knex("profiles").where({ id: profileId }).first()).discover_indexed_at)
      .toBeTruthy();

    await markProfileStale(knex, profileId);

    expect(
      (await knex("profiles").where({ id: profileId }).first()).discover_indexed_at,
    ).toBeNull();
  });

  test("returns never-indexed and touched profiles, and nothing fresh", async () => {
    // Isolate this assertion from every other fixture in the suite.
    await knex("discover_chunks").del();
    await knex("profiles").update({
      is_discoverable: false,
      discover_indexed_at: "2030-01-01T00:00:00.000Z",
    });

    const neverIndexed = await insertTalent({ first: "Never", bio: "Warm energy." });
    const touched = await insertTalent({ first: "Touched", bio: "Warm energy." });
    const fresh = await insertTalent({ first: "Fresh", bio: "Warm energy." });
    const unconsented = await insertTalent({
      first: "Unconsented",
      bio: "Warm energy.",
      consent: false,
    });
    const hidden = await insertTalent({ first: "Hidden", bio: "Warm energy." });

    await knex("profiles").where({ id: neverIndexed }).update({
      discover_indexed_at: null,
      updated_at: "2026-01-03T00:00:00.000Z",
    });
    await knex("profiles").where({ id: touched }).update({
      discover_indexed_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
    await knex("profiles").where({ id: fresh }).update({
      discover_indexed_at: "2026-01-05T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z",
    });
    await knex("profiles").where({ id: unconsented }).update({
      discover_indexed_at: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await knex("profiles").where({ id: hidden }).update({
      is_discoverable: false,
      discover_indexed_at: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const ids = await findStaleProfileIds(knex);

    expect(ids).toEqual([touched, neverIndexed]); // oldest updated_at first
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(unconsented);
    expect(ids).not.toContain(hidden);
  });

  test("honours the batch limit", async () => {
    const ids = await findStaleProfileIds(knex, { limit: 1 });
    expect(ids).toHaveLength(1);
  });
});
