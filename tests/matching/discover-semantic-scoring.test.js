"use strict";

/**
 * Lane E — query-time scoring, fusion and the why-line
 * (src/domains/agency/services/discover/semantic.js).
 *
 * The look part of a brief scores each candidate against its own chunks; the
 * fused order applies inside the requirement groups; and the card explains the
 * match with the talent's own words. Nothing numeric may reach the card, and a
 * profile without embedding consent is never scored.
 *
 * The embedder is injected everywhere: no provider is reachable.
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const DB_FILE = path.join(
  __dirname,
  "..",
  "..",
  `test-discover-semantic-scoring-${process.pid}.sqlite3`,
);
process.env.DATABASE_URL = `sqlite://${DB_FILE}`;
process.env.DB_CLIENT = "sqlite3";
process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";

const knex = require("../../src/shared/db/knex");
const config = require("../../src/config");
const {
  semanticMode,
  minSim,
  scoreCandidates,
  fuseRanks,
  buildWhy,
  RRF_K,
} = require("../../src/domains/agency/services/discover/semantic");

const ADULT_DOB = "1996-05-04";
const FLOOR_ENV = { DISCOVER_SEMANTIC_MIN_SIM: "0.32" };

async function insertTalent({ first, consent = true } = {}) {
  const userId = randomUUID();
  const profileId = randomUUID();
  await knex("users").insert({
    id: userId,
    email: `score.${profileId.slice(0, 8)}@example.com`,
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
    bio_raw: "Fixture bio.",
    bio_curated: "Fixture bio.",
    date_of_birth: ADULT_DOB,
    is_discoverable: true,
    is_public: true,
    profile_status: "active",
    ai_processing_consent: true,
    embedding_processing_consent: consent,
  });
  return profileId;
}

async function insertChunk(profileId, { kind, key, text, vector }) {
  await knex("discover_chunks").insert({
    id: randomUUID(),
    profile_id: profileId,
    image_id: null,
    kind,
    chunk_key: key,
    text,
    text_hash: randomUUID().replace(/-/g, ""),
    model: "test",
    embedding_json: JSON.stringify(vector),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

/** An embedder that always answers with the same vector, and counts calls. */
function fixedEmbedder(vector) {
  return jest.fn(async (texts) => texts.map(() => vector));
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

// ── the mode gate ───────────────────────────────────────────────────────────

describe("semanticMode", () => {
  const saved = config.embedding.semanticMode;
  afterEach(() => {
    config.embedding.semanticMode = saved;
  });

  test("is off without the global embedding flag, whatever DISCOVER_SEMANTIC says", () => {
    expect(semanticMode({ DISCOVER_SEMANTIC: "on" })).toBe("off");
    expect(semanticMode({ DISCOVER_SEMANTIC: "shadow" })).toBe("off");
    expect(
      semanticMode({
        PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "false",
        DISCOVER_SEMANTIC: "on",
      }),
    ).toBe("off");
  });

  test("reads 'on' and 'shadow' with the flag set", () => {
    const on = { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "true", DISCOVER_SEMANTIC: "on" };
    expect(semanticMode(on)).toBe("on");
    expect(semanticMode({ ...on, DISCOVER_SEMANTIC: "ON" })).toBe("on");
    expect(semanticMode({ ...on, DISCOVER_SEMANTIC: " shadow " })).toBe("shadow");
  });

  test("any other value is off", () => {
    const base = { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "true" };
    expect(semanticMode({ ...base, DISCOVER_SEMANTIC: "off" })).toBe("off");
    expect(semanticMode({ ...base, DISCOVER_SEMANTIC: "true" })).toBe("off");
    expect(semanticMode({ ...base, DISCOVER_SEMANTIC: "yes" })).toBe("off");
  });

  test("falls back to config when the env var is unset", () => {
    const base = { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "true" };
    config.embedding.semanticMode = "shadow";
    expect(semanticMode(base)).toBe("shadow");
    config.embedding.semanticMode = "off";
    expect(semanticMode(base)).toBe("off");
  });
});

describe("minSim", () => {
  test("reads DISCOVER_SEMANTIC_MIN_SIM, else the configured default", () => {
    expect(minSim({ DISCOVER_SEMANTIC_MIN_SIM: "0.5" })).toBe(0.5);
    expect(minSim({ DISCOVER_SEMANTIC_MIN_SIM: "not a number" })).toBe(
      config.embedding.minSim,
    );
    expect(minSim({})).toBe(config.embedding.minSim);
  });
});

// ── fusion ──────────────────────────────────────────────────────────────────

describe("fuseRanks (Reciprocal Rank Fusion, k = 60)", () => {
  test("RRF_K is 60", () => {
    expect(RRF_K).toBe(60);
  });

  test("matches the hand-computed scores for a four-way example", () => {
    // semantic order: a (0.9), b (0.5), d (0.1) — c has no similarity at all.
    // lexical order:  c (5 mentions), b (3). a and d have none.
    const scores = fuseRanks([
      { id: "a", sim: 0.9, lexical: 0 },
      { id: "b", sim: 0.5, lexical: 3 },
      { id: "c", sim: null, lexical: 5 },
      { id: "d", sim: 0.1, lexical: 0 },
    ]);

    expect(scores.get("a")).toBeCloseTo(1 / 61, 12); // semantic rank 1 only
    expect(scores.get("b")).toBeCloseTo(1 / 62 + 1 / 62, 12); // 2nd in both lists
    expect(scores.get("c")).toBeCloseTo(1 / 61, 12); // lexical rank 1 only
    expect(scores.get("d")).toBeCloseTo(1 / 63, 12); // semantic rank 3 only

    const order = [...scores.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([id]) => id);
    // b wins on agreement across both signals even though a is the top vector.
    expect(order[0]).toBe("b");
    expect(order[order.length - 1]).toBe("d");
  });

  test("every entry gets a score, including one with no evidence at all", () => {
    const scores = fuseRanks([
      { id: "a", sim: 0.4, lexical: 1 },
      { id: "b", sim: null, lexical: 0 },
    ]);
    expect(scores.get("b")).toBe(0);
    expect(scores.get("a")).toBeCloseTo(1 / 61 + 1 / 61, 12);
  });

  test("a semantic-only pool ranks purely by similarity", () => {
    const scores = fuseRanks([
      { id: "low", sim: 0.2, lexical: 0 },
      { id: "high", sim: 0.8, lexical: 0 },
      { id: "mid", sim: 0.5, lexical: 0 },
    ]);
    expect([...scores.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  test("an empty list fuses to an empty map", () => {
    expect(fuseRanks([]).size).toBe(0);
  });
});

// ── the why-line ────────────────────────────────────────────────────────────

describe("buildWhy", () => {
  test("returns null under the similarity floor", () => {
    const best = { sim: 0.31, kind: "bio", text: "Fresh-faced and natural." };
    expect(buildWhy(best, FLOOR_ENV)).toBeNull();
    expect(buildWhy({ ...best, sim: 0.32 }, FLOOR_ENV)).not.toBeNull();
    expect(buildWhy({ ...best, sim: 0.9 }, FLOOR_ENV)).not.toBeNull();
  });

  test("returns null for a missing, unscored or empty best chunk", () => {
    expect(buildWhy(null, FLOOR_ENV)).toBeNull();
    expect(buildWhy(undefined, FLOOR_ENV)).toBeNull();
    expect(buildWhy({ sim: null, kind: "bio", text: "x" }, FLOOR_ENV)).toBeNull();
    expect(buildWhy({ sim: NaN, kind: "bio", text: "x" }, FLOOR_ENV)).toBeNull();
    expect(buildWhy({ sim: 0.9, kind: "bio", text: "   " }, FLOOR_ENV)).toBeNull();
  });

  test("a bio chunk is quoted as the talent's own sentence", () => {
    expect(
      buildWhy(
        { sim: 0.7, kind: "bio", text: "Fresh-faced, natural, approachable." },
        FLOOR_ENV,
      ),
    ).toBe("From their bio: “Fresh-faced, natural, approachable.”");
  });

  test("a photo chunk reads as the book, with the trailing full stop dropped", () => {
    expect(
      buildWhy(
        {
          sim: 0.7,
          kind: "photo",
          text: "Studio beauty portrait, minimal makeup, soft light.",
        },
        FLOOR_ENV,
      ),
    ).toBe("From their book: Studio beauty portrait, minimal makeup, soft light");
  });

  test("a profile chunk is shown plain, with no prefix and no quotes", () => {
    expect(
      buildWhy(
        { sim: 0.7, kind: "profile", text: "Editorial and Runway boards. Based in Paris." },
        FLOOR_ENV,
      ),
    ).toBe("Editorial and Runway boards. Based in Paris.");
  });

  test("no number ever reaches the line", () => {
    for (const kind of ["bio", "photo", "profile"]) {
      const why = buildWhy(
        { sim: 0.87654321, kind, text: "Soft daylight beauty, minimal makeup" },
        FLOOR_ENV,
      );
      expect(why).not.toMatch(/0\.8|87|%/);
    }
  });

  test("whitespace is collapsed", () => {
    expect(
      buildWhy({ sim: 0.9, kind: "profile", text: " Editorial\n  boards.  " }, FLOOR_ENV),
    ).toBe("Editorial boards.");
  });

  describe("trimming at 120 characters", () => {
    test("a text at or under the limit is untouched", () => {
      const exact = "a".repeat(120);
      expect(buildWhy({ sim: 0.9, kind: "profile", text: exact }, FLOOR_ENV)).toBe(exact);
    });

    test("a longer text is cut on a word boundary and ellipsised", () => {
      const long =
        "Paris-based editorial new face with sharp cheekbones and luminous skin, a strong runway walk, and a versatile range across avant-garde and luxury campaigns.";
      expect(long.length).toBeGreaterThan(120);

      const why = buildWhy({ sim: 0.9, kind: "profile", text: long }, FLOOR_ENV);

      expect(why.endsWith("…")).toBe(true);
      expect(why.length).toBeLessThanOrEqual(121);
      const body = why.slice(0, -1);
      expect(long.startsWith(body)).toBe(true);
      // The cut lands on a space in the source, so no word is severed.
      expect(long[body.length]).toBe(" ");
    });

    test("the bio form keeps its quotes around the trimmed text", () => {
      const long = `${"editorial ".repeat(30)}face`;
      const why = buildWhy({ sim: 0.9, kind: "bio", text: long }, FLOOR_ENV);
      expect(why.startsWith("From their bio: “")).toBe(true);
      expect(why.endsWith("…”")).toBe(true);
    });

    test("a single unbroken 200-character token is cut at the hard limit", () => {
      const why = buildWhy({ sim: 0.9, kind: "profile", text: "x".repeat(200) }, FLOOR_ENV);
      expect(why).toBe(`${"x".repeat(120)}…`);
    });
  });
});

// ── scoreCandidates ─────────────────────────────────────────────────────────

describe("scoreCandidates (SQLite path)", () => {
  let strong;
  let weak;
  let unconsented;

  beforeAll(async () => {
    strong = await insertTalent({ first: "Strong" });
    weak = await insertTalent({ first: "Weak" });
    unconsented = await insertTalent({ first: "Unconsented", consent: false });

    // Query vector is [1, 0, 0]; cosine similarity is the first coordinate.
    await insertChunk(strong, {
      kind: "photo",
      key: "photo:1",
      text: "Studio headshot, hard light.",
      vector: [0.6, 0.8, 0],
    });
    await insertChunk(strong, {
      kind: "bio",
      key: "bio:0",
      text: "Fresh-faced, natural, approachable.",
      vector: [1, 0, 0],
    });
    await insertChunk(strong, {
      kind: "profile",
      key: "profile:0",
      text: "Commercial board.",
      vector: [0, 1, 0],
    });
    await insertChunk(weak, {
      kind: "bio",
      key: "bio:0",
      text: "Sharp, angular, avant-garde.",
      vector: [0.5, Math.sqrt(0.75), 0],
    });
    await insertChunk(unconsented, {
      kind: "bio",
      key: "bio:0",
      text: "Fresh-faced, natural, approachable.",
      vector: [1, 0, 0],
    });
  });

  test("keeps the best chunk per profile and excludes the unconsented", async () => {
    const embedTexts = fixedEmbedder([1, 0, 0]);

    const scores = await scoreCandidates(
      knex,
      "girl next door commercial warmth",
      [strong, weak, unconsented],
      { embedTexts },
    );

    expect([...scores.keys()].sort()).toEqual([strong, weak].sort());
    expect(scores.has(unconsented)).toBe(false);

    const best = scores.get(strong);
    expect(best.sim).toBeCloseTo(1, 10);
    expect(best.kind).toBe("bio");
    expect(best.text).toBe("Fresh-faced, natural, approachable.");
    expect(scores.get(weak).sim).toBeCloseTo(0.5, 10);
    // The query is embedded as a query, not as a document.
    expect(embedTexts.mock.calls[0][1]).toMatchObject({ kind: "query" });
  });

  test("only scores the candidates it is given", async () => {
    const scores = await scoreCandidates(knex, "another distinct brief here", [weak], {
      embedTexts: fixedEmbedder([1, 0, 0]),
    });
    expect([...scores.keys()]).toEqual([weak]);
  });

  test("the same brief embeds once and then hits discover_embed_cache", async () => {
    const embedTexts = fixedEmbedder([1, 0, 0]);
    const brief = `a cache probe brief ${randomUUID()}`;

    const first = await scoreCandidates(knex, brief, [strong], { embedTexts });
    const second = await scoreCandidates(knex, brief, [strong], { embedTexts });

    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(second.get(strong).sim).toBeCloseTo(first.get(strong).sim, 10);

    const cached = await knex("discover_embed_cache").select("text_hash");
    expect(cached.length).toBeGreaterThan(0);

    // A different brief is a different cache key.
    await scoreCandidates(knex, `${brief} extended`, [strong], { embedTexts });
    expect(embedTexts).toHaveBeenCalledTimes(2);
  });

  test("an empty brief or an empty candidate list never embeds", async () => {
    const embedTexts = fixedEmbedder([1, 0, 0]);
    expect((await scoreCandidates(knex, "", [strong], { embedTexts })).size).toBe(0);
    expect((await scoreCandidates(knex, "   ", [strong], { embedTexts })).size).toBe(0);
    expect((await scoreCandidates(knex, "a brief", [], { embedTexts })).size).toBe(0);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  test("an embedder that returns nothing yields no scores rather than throwing", async () => {
    const scores = await scoreCandidates(knex, `empty vector ${randomUUID()}`, [strong], {
      embedTexts: async () => [[]],
    });
    expect(scores.size).toBe(0);
  });

  test("a corrupt stored vector is skipped, not fatal", async () => {
    const broken = await insertTalent({ first: "Broken" });
    await insertChunk(broken, {
      kind: "bio",
      key: "bio:0",
      text: "Unreadable.",
      vector: [1, 0, 0],
    });
    await knex("discover_chunks")
      .where({ profile_id: broken })
      .update({ embedding_json: "{not json" });

    const scores = await scoreCandidates(knex, `corrupt probe ${randomUUID()}`, [broken], {
      embedTexts: fixedEmbedder([1, 0, 0]),
    });

    expect(scores.size).toBe(0);
  });
});
