"use strict";

/**
 * WS4.2 — parse orchestrator. No live GROQ key required: the Groq client is
 * mocked via the __setGroqClient seam. Covers request shape (strict json_schema
 * present), fallback on model failure, and the Postgres-style cache path via an
 * in-memory SQLite knex.
 */

const knexLib = require("knex");
const {
  parseBrief,
  hashText,
  __setGroqClient,
} = require("../../src/domains/agency/services/discover/parse");
const {
  CONTRACT_SCHEMA,
} = require("../../src/domains/agency/services/discover/contract-schema");

const REF = new Date("2026-07-01T00:00:00.000Z");

function mockGroq(response, impl) {
  const create = jest.fn(
    impl ||
      (async () => ({
        choices: [{ message: { content: JSON.stringify(response) } }],
      })),
  );
  __setGroqClient({ chat: { completions: { create } } });
  return create;
}

const CANNED = {
  roles: [
    {
      label: "editorial woman",
      count: 1,
      hard: {
        gender_presentation: ["female"],
        height_cm: { op: "min", a: 175, b: null, span: '5\'9"', confidence: 0.96 },
        boards: ["editorial"],
      },
      soft_query: "editorial",
    },
  ],
  set_aside: [],
  unparsed_remainder: "",
};

afterEach(() => {
  __setGroqClient(null);
});

describe("Groq request shape", () => {
  test("sends strict json_schema (contract-schema) and the configured model", async () => {
    const create = mockGroq(CANNED);
    const out = await parseBrief('editorial women 5\'9" and up', { now: REF });

    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0][0];
    expect(req.response_format).toEqual({
      type: "json_schema",
      json_schema: CONTRACT_SCHEMA,
    });
    expect(req.response_format.json_schema.strict).toBe(true);
    expect(req.messages).toHaveLength(2);
    expect(req.messages[0].role).toBe("system");

    expect(out.source).toBe("groq");
    expect(out.contract.roles[0].hard.height_cm.value).toBe(175);
    expect(out.contract.roles[0].hard.height_cm.needs_confirmation).toBe(false);
  });

  test("validates + normalizes model output (reconcile applied)", async () => {
    mockGroq({
      roles: [
        {
          label: "role 1",
          count: 1,
          hard: {
            height_cm: { op: "min", a: 165, b: null, span: '5\'9"', confidence: 0.9 },
          },
          soft_query: "",
        },
      ],
      set_aside: [],
      unparsed_remainder: "",
    });
    const out = await parseBrief('at least 5\'9"', { now: REF });
    expect(out.needs_confirmation_fields.map((x) => x.field)).toContain("height_cm");
  });
});

describe("fallback on model failure", () => {
  test("maps intent-parser output into a single-role contract, numbers unconfirmed", async () => {
    mockGroq(null, async () => {
      throw new Error("model unavailable");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const out = await parseBrief("tall editorial female", { now: REF });

    expect(out.source).toBe("fallback");
    expect(out.contract.roles).toHaveLength(1);
    const hard = out.contract.roles[0].hard;
    expect(hard.gender_presentation).toEqual(["female"]);
    // Board words map to the talent's own booking lanes (read from
    // profile_booking_lanes since the archetype column was dropped).
    expect(hard.boards).toEqual(["editorial"]);
    // A bare "tall" is the one word the deterministic layer reads on its own:
    // it becomes a visible 5'9" chip whose span is just that word, so the chip
    // can be removed without cutting the rest of the brief. Nothing to confirm.
    expect(hard.height_cm.value).toBe(175);
    expect(hard.height_cm.span).toBe("tall");
    expect(hard.height_cm.needs_confirmation).toBe(false);
    expect(out.needs_confirmation_fields).toEqual([]);
    warn.mockRestore();
  });

  test("empty brief short-circuits without a model call", async () => {
    const create = mockGroq(CANNED);
    const out = await parseBrief("   ", { now: REF });
    expect(out.source).toBe("empty");
    expect(out.contract.roles).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("discover_parse_cache path (in-memory sqlite)", () => {
  let db;

  beforeAll(async () => {
    db = knexLib({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("discover_parse_cache", (t) => {
      t.string("query_hash", 64).primary();
      t.json("contract").nullable();
      t.string("model", 120).nullable();
      t.timestamp("created_at").defaultTo(db.fn.now());
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("writes on miss and serves the second call from cache (no 2nd model call)", async () => {
    const create = mockGroq(CANNED);
    const brief = 'editorial women 5\'9" and up';

    const first = await parseBrief(brief, { knex: db, now: REF });
    expect(first.source).toBe("groq");

    const row = await db("discover_parse_cache")
      .where({ query_hash: hashText(brief) })
      .first();
    expect(row).toBeTruthy();
    expect(row.model).toBeTruthy();

    const second = await parseBrief(brief, { knex: db, now: REF });
    expect(second.source).toBe("cache");
    expect(second.contract.roles[0].hard.height_cm.value).toBe(175);
    // model called only once — second served from DB
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("tolerates a missing cache table", async () => {
    const bare = knexLib({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    mockGroq(CANNED);
    const out = await parseBrief("editorial women", { knex: bare, now: REF });
    expect(out.source).toBe("groq"); // no throw despite absent table
    await bare.destroy();
  });
});
