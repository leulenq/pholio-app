"use strict";

/**
 * Discover semantic layer — end-to-end plumbing on SQLite with an injected
 * deterministic embedder (no provider is ever called).
 *
 * Proves: chunks are built from the talent's own bio, declared facts and
 * photo descriptions; consent gates the corpus; a look-only brief orders the
 * pool by fused similarity; the why-line quotes the talent's own words or the
 * book's description; requirements still decide the groups; shadow mode
 * changes nothing visible.
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const DB_FILE = path.join(__dirname, "..", "..", `test-discover-semantic-${process.pid}.sqlite3`);
process.env.DATABASE_URL = `sqlite://${DB_FILE}`;
process.env.DB_CLIENT = "sqlite3";
process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
process.env.DISCOVER_SEMANTIC = "on";
process.env.DISCOVER_SEMANTIC_MIN_SIM = "0.2";

const knex = require("../../src/shared/db/knex");
const provider = require("../../src/domains/ai/embedding-provider");
const { reindexProfile, buildChunks } = require("../../src/domains/ai/discover-index");
const { searchDiscoverableTalent } = require("../../src/domains/agency/services/discover-search");
const { purgeProfileEmbeddingDerivatives } = require("../../src/domains/ai/embeddings");

const AGENCY_ID = randomUUID();
const ADULT_DOB = "1996-05-04";

async function insertTalent({ first, bio, gender = "Female", consent = true, height = 175, photoDescription = null }) {
  const userId = randomUUID();
  const profileId = randomUUID();
  await knex("users").insert({
    id: userId,
    email: `${first.toLowerCase()}.${profileId.slice(0, 6)}@example.com`,
    role: "TALENT",
    first_name: first,
    last_name: "Semantic",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `${first.toLowerCase()}-${profileId.slice(0, 6)}`,
    first_name: first,
    last_name: "Semantic",
    city: "New York",
    market: "new-york",
    height_cm: height,
    gender,
    date_of_birth: ADULT_DOB,
    bio_raw: bio,
    bio_curated: bio,
    is_discoverable: true,
    is_public: true,
    profile_status: "active",
    embedding_processing_consent: consent,
    ai_processing_consent: consent,
  });
  if (photoDescription) {
    const imageId = randomUUID();
    await knex("images").insert({
      id: imageId,
      profile_id: profileId,
      path: `/uploads/${imageId}.webp`,
      label: "Headshot",
      sort: 1,
      status: "active",
    });
    await knex("image_signals").insert({
      id: randomUUID(),
      image_id: imageId,
      description: photoDescription,
      description_model: "test",
      described_at: new Date().toISOString(),
    });
  }
  return profileId;
}

beforeAll(async () => {
  await knex.migrate.latest();
  provider.__setEmbedder(provider.hashEmbedder());
  await knex("users").insert({
    id: AGENCY_ID,
    email: `agency.${AGENCY_ID.slice(0, 6)}@example.com`,
    role: "AGENCY",
    first_name: "Scout",
    last_name: "Agency",
  });
}, 180000);

afterAll(async () => {
  provider.__setEmbedder(null);
  await knex.destroy();
  try {
    fs.unlinkSync(DB_FILE);
  } catch {
    // ignore
  }
}, 60000);

describe("buildChunks", () => {
  test("renders bio sentences, declared prose and photo descriptions, nothing numeric", () => {
    const chunks = buildChunks(
      {
        bio_curated: "Fresh-faced and natural. Approachable warmth on camera. Loves commercial work.",
        specialties: JSON.stringify(["Lifestyle"]),
        experience_level: "New face",
        market: "new-york",
        languages: JSON.stringify(["English", "Spanish"]),
        height_cm: 175,
        waist_cm: 61,
      },
      ["commercial", "lifestyle"],
      [{ id: "img-1", description: "Daylight portrait, soft light, minimal makeup." }],
    );
    const kinds = chunks.map((c) => c.kind);
    expect(kinds).toContain("bio");
    expect(kinds).toContain("profile");
    expect(kinds).toContain("photo");
    const profile = chunks.find((c) => c.kind === "profile").text;
    expect(profile).toBe(
      "Commercial and Lifestyle boards. Specialties: Lifestyle. New face. Based in New York. Languages: English, Spanish.",
    );
    expect(chunks.every((c) => !/175|61|cm|waist/.test(c.text))).toBe(true);
  });
});

describe("semantic Discover end to end (SQLite, injected embedder)", () => {
  let warm;
  let edgy;
  let noConsent;

  beforeAll(async () => {
    warm = await insertTalent({
      first: "Warm",
      bio: "Fresh-faced, natural and approachable. Girl next door energy with commercial warmth for lifestyle campaigns.",
      photoDescription: "Daylight three-quarter portrait, soft natural light, minimal makeup, relaxed smile, casual knit, park setting, commercial register.",
    });
    edgy = await insertTalent({
      first: "Edgy",
      bio: "Sharp, angular, avant-garde. Strong bone structure and a severe editorial presence for high fashion shows.",
      photoDescription: "Studio headshot, hard directional light, dramatic dark makeup, sculptural black wardrobe, intense stare, editorial register.",
    });
    noConsent = await insertTalent({
      first: "Quiet",
      bio: "Fresh-faced, natural and approachable. Girl next door energy with commercial warmth.",
      consent: false,
    });
    for (const id of [warm, edgy, noConsent]) {
      // eslint-disable-next-line no-await-in-loop
      await reindexProfile(knex, id);
    }
  });

  test("indexing respects consent and builds chunks per profile", async () => {
    const counts = await knex("discover_chunks")
      .select("profile_id")
      .count("* as n")
      .groupBy("profile_id");
    const byId = new Map(counts.map((r) => [r.profile_id, Number(r.n)]));
    expect(byId.get(warm)).toBeGreaterThanOrEqual(3); // bio + profile + photo
    expect(byId.get(edgy)).toBeGreaterThanOrEqual(3);
    expect(byId.has(noConsent)).toBe(false);
    const stamped = await knex("profiles").where({ id: warm }).first();
    expect(stamped.discover_indexed_at).not.toBeNull();
  });

  test("a look-only brief orders by meaning and explains with the talent's own words", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "girl next door commercial warmth, approachable and natural",
      limit: "10",
    });
    const v2 = result.discover_v2;
    expect(v2.semantic).toBe(true);
    expect(v2.look_only).toBe(true);
    expect(result.meta.semantic_search).toBe(true);
    const ids = result.profiles.map((p) => p.id);
    expect(ids.indexOf(warm)).toBeLessThan(ids.indexOf(edgy));
    // The unconsented profile is still searchable by requirements, just not
    // by meaning: it appears, with no why-line.
    expect(ids).toContain(noConsent);
    const warmDto = result.profiles.find((p) => p.id === warm);
    expect(warmDto.why).toMatch(/^From their (bio|book): /);
    const quietDto = result.profiles.find((p) => p.id === noConsent);
    expect(quietDto.why).toBeNull();
    expect(result._launch.timings.semantic_ms).toBeGreaterThanOrEqual(0);
    expect(result._launch.semantic.scored).toBe(2);
  });

  test("the book's description can carry the match", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "hard directional light, dramatic dark makeup, sculptural wardrobe",
      limit: "10",
    });
    const ids = result.profiles.map((p) => p.id);
    expect(ids[0]).toBe(edgy);
    const edgyDto = result.profiles.find((p) => p.id === edgy);
    expect(edgyDto.why).toMatch(/^From their book: /);
  });

  test("requirements still decide the groups; meaning orders inside them", async () => {
    const tall = await insertTalent({
      first: "Tall",
      bio: "Severe editorial presence, avant-garde, strong bone structure.",
      height: 185,
    });
    await reindexProfile(knex, tall);
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "women 6'0\" and up, severe editorial avant-garde",
      limit: "10",
    });
    const v2 = result.discover_v2;
    expect(v2.look_only).toBe(false);
    const match = v2.groups.find((g) => g.kind === "match");
    const partial = v2.groups.find((g) => g.kind === "partial");
    expect(match.results.map((p) => p.id)).toEqual([tall]);
    const partialIds = partial.results.map((p) => p.id);
    expect(partialIds).toContain(edgy);
    expect(partialIds).toContain(warm);
    expect(partialIds.indexOf(edgy)).toBeLessThan(partialIds.indexOf(warm));
  });

  test("shadow mode scores and logs but changes nothing visible", async () => {
    process.env.DISCOVER_SEMANTIC = "shadow";
    try {
      const result = await searchDiscoverableTalent(knex, {
        agencyId: AGENCY_ID,
        q: "girl next door commercial warmth",
        limit: "10",
      });
      expect(result.discover_v2.semantic).toBe(false);
      expect(result.meta.semantic_search).toBe(false);
      expect(result.profiles.every((p) => p.why === null)).toBe(true);
      expect(result._launch.semantic.mode).toBe("shadow");
      expect(result._launch.semantic.scored).toBeGreaterThan(0);
    } finally {
      process.env.DISCOVER_SEMANTIC = "on";
    }
  });

  test("an injected reranker re-orders the head of the match group", async () => {
    const semantic = require("../../src/domains/agency/services/discover/semantic");
    const entries = [warm, edgy].map((id) => ({ profile: { id } }));
    const reversed = await semantic.rerankTop(knex, "anything", entries, {
      rerankFn: async (q, docs) => docs.map((_, i) => ({ index: docs.length - 1 - i, score: 1 })),
    });
    expect(reversed.map((e) => e.profile.id)).toEqual([edgy, warm]);
    const untouched = await semantic.rerankTop(knex, "anything", entries, {});
    expect(untouched.map((e) => e.profile.id)).toEqual([warm, edgy]);
  });

  test("withdrawal purges the corpus", async () => {
    await purgeProfileEmbeddingDerivatives(knex, warm);
    const left = await knex("discover_chunks").where({ profile_id: warm }).count("* as n");
    expect(Number(left[0].n)).toBe(0);
  });
});
