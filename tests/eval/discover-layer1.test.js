"use strict";

/**
 * WS8.2 — Layer-1 CI gate over the golden brief set (the merge gate).
 *
 * For EVERY fixture in tests/fixtures/discover-golden/*.json this suite:
 *
 *   (a) runs the REAL parse pipeline (parse.js with the fixture's mocked LLM
 *       output injected via the __setGroqClient seam, through
 *       validate-contract + extract-values reconcile) and asserts the canonical
 *       expected contract — the LB-4 intended-vs-parsed assertion;
 *   (b) asserts every needs_confirmation expectation holds AND that flagged
 *       constraints are NOT applied (never filter, never key a near group);
 *   (c) runs launchModeSearch against one shared seeded SQLite pool (same
 *       harness pattern as tests/matching/discover-launch-engine.test.js) and
 *       asserts NO result in any group violates that group's constraint-truth
 *       semantics per spec §6:
 *         exact        — every applied constraint passes (constraint_truth
 *                        carries only non-pass entries, so it must be empty);
 *         near         — zero client-gate misses; the group's `missed` field is
 *                        the most-severe operational miss of every member;
 *         outside_spec — absent unless include_outside_spec was requested.
 *
 * Target: 100%. Runtime: one schema + seed shared across all fixtures.
 *
 * KNOWN ENGINE GAP (documented, self-alerting): constraint-eval pushes
 * measurement evals with dotted field names ("measurements.waist_cm",
 * "measurements.dress_size", "measurements.suit_size") but engine.classify()
 * resolves tiers via tierFor(field), which only knows the ROOT field
 * ("measurements"). Those evals therefore carry tier:null and are INVISIBLE to
 * grouping — a profile failing an exact waist/dress/suit ask still lands in
 * the "exact" group, violating spec §6 (measurements are client gates). The
 * fixtures that deterministically trigger this are listed in
 * KNOWN_ENGINE_GAPS and their engine checks run as `test.failing`: the suite
 * stays green today and flips red the moment the engine bug is fixed (remove
 * the entry then). Fixing it is a src/ change out of PR8's scope.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-discover-layer1.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";
process.env.DISCOVER_ENGINE = "launch";
process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";
delete process.env.OPENAI_API_KEY; // no soft scoring — grouping asserted alone

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const { isPostgresKnex } = require("../../src/domains/ai/embeddings");
const {
  parseBrief,
  __setGroqClient,
} = require("../../src/domains/agency/services/discover/parse");
const {
  launchModeSearch,
} = require("../../src/domains/agency/services/discover/engine");
const {
  tierFor,
} = require("../../src/domains/agency/services/discover/field-whitelist");

// ── fixtures ─────────────────────────────────────────────────────────────────

const FIX_DIR = path.join(__dirname, "..", "fixtures", "discover-golden");
const fixtures = fs
  .readdirSync(FIX_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf8")));

// Engine grouping gaps discovered by this gate get listed here with
// test.failing until fixed (green while broken, red once fixed). Currently
// empty: the measurements-tier gap (dotted sub-fields carrying tier:null)
// was fixed in field-whitelist.js rootField resolution.
const KNOWN_ENGINE_GAPS = {};

// Fixtures that must produce a non-empty exact group against the seeded pool
// (guards against the integrity checks passing vacuously on empty results).
const EXPECT_NONEMPTY_EXACT = new Set([
  "height-min-nyc-editorial",
  "height-metric-meters",
  "height-word-form",
  "height-approx-around-59",
  "playing-age-range",
  "playing-age-overlap-28-45",
  "playing-age-minors-adjacent-18-play-15",
  "hair-or-set-blue-eyes",
  "eye-color-or-set-green-hazel",
  "boards-or-set-editorial-commercial",
  "boards-ecomm-experience",
  "boards-commercial-no-alias-bleed",
  "region-shoe-us",
  "union-either-ok",
  "union-must-be-union",
  "locality-local-no-travel",
  "representation-freelance-only",
  "representation-seeking-mother-agency",
  "representation-unrepresented-newface",
  "soft-only-vibe",
  "multi-role-women-and-man",
  "availability-single-shoot-window",
  "availability-multi-window",
  "availability-multi-window-three-windows",
  "unknown-board-dropped",
  "set-aside-ethnicity-skin",
  "set-aside-european-look",
  "set-aside-fair-skinned",
]);

// ── mocked LLM (the __setGroqClient seam) ────────────────────────────────────

function mockGroqWith(llmJson) {
  const create = jest.fn(async () => ({
    // deep clone — validate-contract mutates the contract in place and each
    // fixture is parsed twice (contract test + engine test)
    choices: [
      { message: { content: JSON.stringify(llmJson) } },
    ],
  }));
  __setGroqClient({ chat: { completions: { create } } });
  return create;
}

afterEach(() => __setGroqClient(null));

// ── spec §6 constraint-truth semantics (recomputed independently) ────────────

const OPERATIONAL_PRIORITY = ["availability", "location", "union", "experience_level"];

/** Tier by ROOT field so dotted measurement fields resolve (spec intent). */
function specTier(field) {
  return tierFor(field) || tierFor(String(field).split(".")[0]) || null;
}

/**
 * Re-derive the group a result BELONGS in from its constraint_truth (which
 * carries every non-pass applied constraint), per spec §6.
 */
function specClassify(constraintTruth) {
  const misses = Array.isArray(constraintTruth) ? constraintTruth : [];
  if (misses.some((e) => specTier(e.field) === "client_gate")) {
    return { kind: "outside_spec", missed: null };
  }
  const op = misses.filter((e) => specTier(e.field) === "operational");
  if (!op.length) return { kind: "exact", missed: null };
  const sorted = [...op].sort((a, b) => {
    const sev = (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1);
    if (sev !== 0) return sev;
    return (
      OPERATIONAL_PRIORITY.indexOf(a.field) - OPERATIONAL_PRIORITY.indexOf(b.field)
    );
  });
  return { kind: "near", missed: sorted[0].field };
}

/** Resolve "height_cm" | "measurements.dress_size" | "availability[0]" in a hard block. */
function resolveConstraint(hard, fieldPath) {
  const m = String(fieldPath).match(/^availability\[(\d+)\]$/);
  if (m) return (hard.availability || [])[Number(m[1])] || null;
  if (fieldPath.startsWith("measurements.")) {
    return hard.measurements ? hard.measurements[fieldPath.split(".")[1]] : null;
  }
  return hard[fieldPath];
}

/** "availability[0]" → "availability"; dotted fields stay dotted. */
function evalFieldName(fieldPath) {
  return String(fieldPath).replace(/\[\d+\]$/, "");
}

// ── shared seeded pool ───────────────────────────────────────────────────────

const isPostgres = isPostgresKnex(knex);
const TEST_DB_PATH = path.resolve(__dirname, "../../test-discover-layer1.sqlite3");
const AGENCY_ID = uuidv4();
const NAMES = {}; // first_name → profile id

async function createSchema() {
  for (const t of [
    "bookouts",
    "images",
    "social_accounts",
    "applications",
    "profiles",
    "users",
  ]) {
    await knex.schema.dropTableIfExists(t);
  }

  await knex.schema.createTable("users", (t) => {
    t.string("id", 36).primary();
    t.string("email").notNullable().unique();
    t.string("role").notNullable();
  });
  await knex.schema.createTable("profiles", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).nullable();
    t.string("first_name", 100).nullable();
    t.string("last_name", 100).nullable();
    t.string("slug", 200).nullable();
    t.string("city", 100).nullable();
    t.string("market", 100).nullable();
    t.string("gender", 50).nullable();
    t.integer("height_cm").nullable();
    t.integer("bust_cm").nullable();
    t.integer("chest_cm").nullable();
    t.integer("waist_cm").nullable();
    t.integer("hips_cm").nullable();
    t.integer("inseam_cm").nullable();
    t.string("dress_size", 20).nullable();
    t.string("suit_size", 20).nullable();
    t.string("shoe_size", 20).nullable();
    t.string("hair_color", 50).nullable();
    t.string("eye_color", 50).nullable();
    t.string("archetype", 50).nullable();
    t.text("modeling_categories").nullable();
    t.string("experience_level", 50).nullable();
    t.string("union_membership", 100).nullable();
    t.text("tattoos").nullable();
    t.string("availability_status", 20).nullable();
    t.integer("playing_age_min").nullable();
    t.integer("playing_age_max").nullable();
    t.string("date_of_birth", 40).nullable();
    t.timestamp("guardian_consent_at").nullable();
    t.boolean("seeking_representation").nullable();
    t.string("current_agency", 200).nullable();
    t.timestamp("measurements_updated_at").nullable();
    t.text("bio_curated").nullable();
    t.boolean("is_discoverable").defaultTo(false);
    t.string("profile_status", 50).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("applications", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("agency_id", 36).nullable();
    t.string("invited_by_agency_id", 36).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("images", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("path").nullable();
    t.string("public_url").nullable();
    t.boolean("is_primary").defaultTo(false);
    t.integer("sort").defaultTo(0);
    t.string("status", 20).nullable();
    t.string("moderation_status", 20).nullable();
    t.boolean("exclude_from_public").defaultTo(false);
    t.boolean("exclude_from_agency").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("social_accounts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("agency_id", 36).nullable();
    t.string("platform", 50).notNullable();
    t.string("handle", 255).nullable();
    t.string("url", 500).nullable();
    t.integer("follower_count").nullable();
    t.decimal("engagement_rate", 5, 2).nullable();
    t.boolean("is_oauth_connected").defaultTo(false);
    t.timestamp("metrics_updated_at").nullable();
    t.timestamps(true, true);
    t.unique(["profile_id", "platform"]);
  });
  await knex.schema.createTable("bookouts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("starts_on", 20).notNullable();
    t.string("ends_on", 20).notNullable();
    t.text("note").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

/**
 * One diverse adult pool shared by every fixture. Coverage notes:
 *  - Ada/Joy: NYC editorial ≥175 (exact-group fodder for height/board briefs)
 *  - Hana: editorial in LA with a Jul 10-12 bookout (near: location/availability)
 *  - Fay: editorial 168 + new_face (height client-gate fail; rep=unrepresented)
 *  - Bea: commercial, non-union, tattoos text, dress '8', legacy agency
 *    (represented), shoe '8'
 *  - Gus: commercial male, union, Chicago, suit '44'
 *  - Cyd: fit board waist 61 / hips 89 (matches the fit fixture) — seeking
 *  - Kai: fit board waist 66 / hips 94 (deterministic trigger for the
 *    measurements-tier gap)
 *  - Dre: runway male, Milan, suit '42'
 *  - Eve: ecomm-only (alias-bleed check)
 *  - Ivo: curve, hazel eyes
 *  - Bookouts (Ada/Cyd/Dre/Joy non-overlapping) = positive availability data.
 */
async function seed() {
  await knex("bookouts").del();
  await knex("images").del();
  await knex("applications").del();
  await knex("profiles").del();
  await knex("users").del();

  await knex("users").insert({
    id: AGENCY_ID,
    email: `layer1-${AGENCY_ID}@test.pholio`,
    role: "AGENCY",
  });

  const base = {
    is_discoverable: true,
    profile_status: "active",
    bio_curated: "Layer-1 golden fixture",
    date_of_birth: "1996-01-01",
    availability_status: "available",
  };

  const rows = [
    { first_name: "Ada", gender: "Female", modeling_categories: '["editorial"]', height_cm: 178, market: "new-york", hair_color: "blonde", eye_color: "blue", playing_age_min: 22, playing_age_max: 30, dress_size: "6", shoe_size: "9", union_membership: "SAG-AFTRA", experience_level: "experienced" },
    { first_name: "Bea", gender: "Female", modeling_categories: '["commercial"]', height_cm: 165, market: "los-angeles", hair_color: "brown", eye_color: "brown", playing_age_min: 25, playing_age_max: 35, dress_size: "8", shoe_size: "8", union_membership: "Non-union", tattoos: "sleeve left arm", current_agency: "Elsewhere Mgmt" },
    { first_name: "Cyd", gender: "Female", modeling_categories: '["fit"]', height_cm: 175, market: "new-york", hair_color: "black", eye_color: "brown", playing_age_min: 20, playing_age_max: 28, dress_size: "4", shoe_size: "9", waist_cm: 61, hips_cm: 89, seeking_representation: true },
    { first_name: "Dre", gender: "Male", modeling_categories: '["runway"]', height_cm: 188, market: "milan", hair_color: "black", eye_color: "brown", playing_age_min: 20, playing_age_max: 30, suit_size: "42", shoe_size: "11" },
    { first_name: "Eve", gender: "Female", modeling_categories: '["ecomm"]', height_cm: 170, market: "chicago", hair_color: "brown", eye_color: "green", playing_age_min: 22, playing_age_max: 32, dress_size: "6", shoe_size: "7", union_membership: "Non-union" },
    { first_name: "Fay", gender: "Female", modeling_categories: '["editorial"]', height_cm: 168, market: "new-york", hair_color: "red", eye_color: "green", playing_age_min: 18, playing_age_max: 24, dress_size: "2", shoe_size: "8", experience_level: "new_face" },
    { first_name: "Gus", gender: "Male", modeling_categories: '["commercial"]', height_cm: 180, market: "chicago", hair_color: "gray", eye_color: "blue", playing_age_min: 38, playing_age_max: 50, suit_size: "44", shoe_size: "10", union_membership: "SAG-AFTRA" },
    { first_name: "Hana", gender: "Female", modeling_categories: '["editorial"]', height_cm: 176, market: "los-angeles", hair_color: "blonde", eye_color: "blue", playing_age_min: 22, playing_age_max: 30, dress_size: "6", shoe_size: "9", union_membership: "Non-union" },
    { first_name: "Ivo", gender: "Female", modeling_categories: '["curve"]', height_cm: 172, market: "new-york", hair_color: "brown", eye_color: "hazel", playing_age_min: 25, playing_age_max: 38, dress_size: "12", shoe_size: "9" },
    { first_name: "Joy", gender: "Female", modeling_categories: '["editorial","commercial"]', height_cm: 175, market: "new-york", hair_color: "blonde", eye_color: "blue", playing_age_min: 15, playing_age_max: 19, dress_size: "6", shoe_size: "8", seeking_representation: true },
    { first_name: "Kai", gender: "Female", modeling_categories: '["fit"]', height_cm: 174, market: "new-york", hair_color: "brown", eye_color: "brown", playing_age_min: 21, playing_age_max: 29, dress_size: "6", shoe_size: "8", waist_cm: 66, hips_cm: 94 },
  ];

  for (const r of rows) {
    const id = uuidv4();
    NAMES[r.first_name] = id;
    await knex("profiles").insert({
      id,
      user_id: uuidv4(),
      last_name: "Golden",
      slug: `${r.first_name.toLowerCase()}-golden`,
      ...base,
      ...r,
    });
  }

  await knex("bookouts").insert([
    { id: uuidv4(), profile_id: NAMES.Ada, starts_on: "2026-08-01", ends_on: "2026-08-05" },
    { id: uuidv4(), profile_id: NAMES.Cyd, starts_on: "2026-01-05", ends_on: "2026-01-07" },
    { id: uuidv4(), profile_id: NAMES.Dre, starts_on: "2026-09-01", ends_on: "2026-09-02" },
    { id: uuidv4(), profile_id: NAMES.Joy, starts_on: "2026-12-01", ends_on: "2026-12-02" },
    // Hana overlaps the July 9-14 shoot windows → availability fail (near)
    { id: uuidv4(), profile_id: NAMES.Hana, starts_on: "2026-07-10", ends_on: "2026-07-12" },
  ]);
}

beforeAll(async () => {
  if (!isPostgres && fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await seed();
}, 60000);

afterAll(async () => {
  await knex.destroy();
});

// ── helpers ──────────────────────────────────────────────────────────────────

function fixtureNow(fx) {
  return new Date(`${fx.now}T00:00:00.000Z`);
}

async function runEngine(fx, opts = {}) {
  mockGroqWith(fx.llm);
  return launchModeSearch({
    knex,
    briefText: fx.brief,
    limit: 30,
    includeOutsideSpec: !!opts.includeOutsideSpec,
    agencyUserId: AGENCY_ID,
    now: fixtureNow(fx),
  });
}

function allResults(res) {
  const out = [];
  for (const g of res.discover_v2.groups) {
    for (const r of g.results) out.push({ group: g, result: r });
  }
  return out;
}

// ── (a) + (b): intended-vs-parsed through the REAL parse pipeline ────────────

describe("Layer-1 (a/b) — parse pipeline produces the canonical contract", () => {
  test("golden set is at the WS8 target size (45-60)", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(45);
    expect(fixtures.length).toBeLessThanOrEqual(60);
  });

  describe.each(fixtures.map((fx) => [fx.name, fx]))("%s", (_name, fx) => {
    let out;
    beforeAll(async () => {
      mockGroqWith(fx.llm);
      out = await parseBrief(fx.brief, { now: fixtureNow(fx) });
    });

    test("parsed via the mocked model, not the regex fallback", () => {
      expect(out.source).toBe("groq");
    });

    test("intended-vs-parsed: canonical expected contract matches", () => {
      const e = fx.expect;
      const role = out.contract.roles[0];

      if (e.roles_length != null) expect(out.contract.roles.length).toBe(e.roles_length);
      if (e.multi_role != null) expect(out.multi_role).toBe(e.multi_role);
      if (e.credential_gate != null) {
        expect(out.credential_gate).toBe(e.credential_gate);
      }
      if (e.counts) expect(out.contract.roles.map((r) => r.count)).toEqual(e.counts);
      if (e.height_value != null) {
        expect(role.hard.height_cm.value).toBe(e.height_value);
        expect(role.hard.height_cm.needs_confirmation).toBe(false);
      }
      if (e.playing_age_value != null) {
        expect(role.hard.playing_age.value).toBe(e.playing_age_value);
        expect(role.hard.playing_age.needs_confirmation).toBe(false);
      }
      if (e.visible_tattoos != null) expect(role.hard.visible_tattoos).toBe(e.visible_tattoos);
      if (e.hair_color) expect(role.hard.hair_color).toEqual(e.hair_color);
      if (e.eye_color) expect(role.hard.eye_color).toEqual(e.eye_color);
      if (e.boards) expect(role.hard.boards).toEqual(e.boards);
      if (e.union) expect(role.hard.union).toBe(e.union);
      if (e.experience_level) expect(role.hard.experience_level).toBe(e.experience_level);
      if (e.representation_status) {
        expect(role.hard.representation_status).toEqual(e.representation_status);
      }
      if (e.all_hard_null) {
        expect(Object.values(role.hard).every((v) => v === null)).toBe(true);
      }
      if (e.set_aside) expect(out.contract.set_aside).toEqual(e.set_aside);
      if (e.set_aside_contains) {
        const texts = out.contract.set_aside.map((s) => s.text.toLowerCase());
        for (const t of e.set_aside_contains) expect(texts).toContain(t.toLowerCase());
      }
      if (e.soft_query_excludes) {
        const lower = role.soft_query.toLowerCase();
        for (const t of e.soft_query_excludes) {
          expect(lower.includes(t.toLowerCase())).toBe(false);
        }
      }
      if (e.dropped_contains) {
        const values = out.dropped.map((d) => String(d.value));
        for (const v of e.dropped_contains) expect(values).toContain(v);
      }
      if (e.dropped_fields_contain) {
        const fields = out.dropped.map((d) => String(d.field));
        for (const v of e.dropped_fields_contain) expect(fields).toContain(v);
      }
    });

    test("needs_confirmation expectations hold exactly (LB-4)", () => {
      const expected = [...(fx.expect.needs_confirmation || [])].sort();
      const actual = out.needs_confirmation_fields.map((x) => x.field).sort();
      expect(actual).toEqual(expected);

      // Flagged constraints carry the flag on the contract object itself, so
      // the engine (and the chip rack) can never apply them silently.
      for (const fieldPath of expected) {
        const c = resolveConstraint(out.contract.roles[0].hard, fieldPath);
        expect(c).toBeTruthy();
        expect(c.needs_confirmation).toBe(true);
      }
    });
  });
});

// ── (c): engine group integrity against the shared seeded pool ──────────────

describe("Layer-1 (c) — no result violates its group's constraint truth", () => {
  describe.each(fixtures.map((fx) => [fx.name, fx]))("%s", (name, fx) => {
    const gapReason = KNOWN_ENGINE_GAPS[name];
    const engineTest = gapReason ? test.failing : test;

    engineTest(
      gapReason
        ? `group integrity [KNOWN ENGINE GAP: ${gapReason}]`
        : "group integrity (exact / near / outside_spec semantics)",
      async () => {
        const res = await runEngine(fx);
        expect(res.meta.engine).toBe("launch");

        // outside_spec must be absent — it was not requested.
        expect(
          res.discover_v2.groups.some((g) => g.kind === "outside_spec"),
        ).toBe(false);

        // Every shown result must sit in the group its constraint_truth demands.
        for (const { group, result } of allResults(res)) {
          const derived = specClassify(result.constraint_truth);
          expect({
            profile: result.first_name,
            kind: derived.kind,
            missed: derived.missed,
          }).toEqual({
            profile: result.first_name,
            kind: group.kind,
            missed: group.missed,
          });
        }

        // Empty payload ⇒ the engine must say so honestly.
        if (!res.discover_v2.groups.length) {
          expect(res.discover_v2.honest_zero).toBeTruthy();
        }
      },
    );

    test("needs_confirmation constraints are never applied by the engine", async () => {
      const expected = fx.expect.needs_confirmation || [];
      if (!expected.length) return;
      const res = await runEngine(fx);

      const hard = res._launch.contract.roles[0].hard;
      for (const fieldPath of expected) {
        const evalField = evalFieldName(fieldPath);

        // A flagged availability window only suppresses the availability eval
        // when EVERY window is flagged; single-field constraints always do.
        const isAvail = evalField === "availability";
        const allWindowsFlagged =
          isAvail &&
          (hard.availability || []).every((w) => w.needs_confirmation === true);
        if (isAvail && !allWindowsFlagged) continue;

        for (const { result } of allResults(res)) {
          const fields = result.constraint_truth.map((c) => c.field);
          expect(fields).not.toContain(evalField);
        }
        for (const g of res.discover_v2.groups) {
          expect(g.missed).not.toBe(evalField);
        }
      }
    });
  });
});

// ── fixture-specific engine outcomes ─────────────────────────────────────────

describe("Layer-1 (c) — expected engine outcomes", () => {
  const nonEmpty = fixtures.filter((fx) => EXPECT_NONEMPTY_EXACT.has(fx.name));
  test.each(nonEmpty.map((fx) => [fx.name, fx]))(
    "%s → non-empty exact group (integrity is not vacuous)",
    async (_n, fx) => {
      const res = await runEngine(fx);
      const exact = res.discover_v2.groups.find((g) => g.kind === "exact");
      expect(exact).toBeDefined();
      expect(exact.results.length).toBeGreaterThan(0);
    },
  );

  const honestZero = fixtures.filter(
    (fx) => fx.expect.engine_honest_zero || fx.expect.credential_gate,
  );
  test.each(honestZero.map((fx) => [fx.name, fx]))(
    "%s → honest zero, no groups",
    async (_n, fx) => {
      const res = await runEngine(fx);
      expect(res.discover_v2.groups).toHaveLength(0);
      expect(res.profiles).toHaveLength(0);
      expect(res.discover_v2.honest_zero).toBeTruthy();
      if (fx.expect.credential_gate) {
        expect(res.discover_v2.honest_zero.removable_chip).toBe("credentials");
      }
    },
  );

  const multiRole = fixtures.filter((fx) => fx.expect.multi_role === true);
  test.each(multiRole.map((fx) => [fx.name, fx]))(
    "%s → multi_role_notice, only roles[0] searched",
    async (_n, fx) => {
      const res = await runEngine(fx);
      expect(res.discover_v2.understanding.multi_role_notice).toBeTruthy();
      expect(
        res.discover_v2.understanding.multi_role_notice.role_count,
      ).toBe(fx.expect.roles_length);
    },
  );

  test("board alias never bleeds: commercial ask excludes ecomm-only talent", async () => {
    const fx = fixtures.find((f) => f.name === "boards-commercial-no-alias-bleed");
    const res = await runEngine(fx);
    const shown = res.profiles.map((p) => p.first_name);
    expect(shown).not.toContain("Eve"); // ecomm-only → boards client-gate fail
    const exact = res.discover_v2.groups.find((g) => g.kind === "exact");
    expect(exact.results.map((r) => r.first_name)).toEqual(
      expect.arrayContaining(["Bea", "Joy"]),
    );
  });

  test("board alias never bleeds: ecomm ask matches only the ecomm board", async () => {
    const fx = fixtures.find((f) => f.name === "boards-ecomm-experience");
    const res = await runEngine(fx);
    const exact = res.discover_v2.groups.find((g) => g.kind === "exact");
    expect(exact.results.map((r) => r.first_name)).toEqual(["Eve"]);
    const shown = res.profiles.map((p) => p.first_name);
    expect(shown).not.toContain("Bea");
    expect(shown).not.toContain("Gus");
  });

  test("outside_spec appears only behind the explicit opt-in", async () => {
    const fx = fixtures.find((f) => f.name === "height-min-nyc-editorial");
    const res = await runEngine(fx, { includeOutsideSpec: true });
    const outside = res.discover_v2.groups.find((g) => g.kind === "outside_spec");
    expect(outside).toBeDefined();
    // Fay (168 < 175, editorial NYC) is the canonical outside-spec member.
    expect(outside.results.map((r) => r.first_name)).toContain("Fay");
    for (const r of outside.results) {
      expect(specClassify(r.constraint_truth).kind).toBe("outside_spec");
      expect(r.tier_band).toBe("low");
    }
  });
});
