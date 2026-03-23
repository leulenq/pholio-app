// tests/agency-overview.test.js
"use strict";

// Point to an isolated test database BEFORE any db-touching modules load.
// This avoids the dev.sqlite3 migration state issues and uses a clean slate.
process.env.DATABASE_URL = "sqlite://./test-agency-overview.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const request = require("supertest");
const cookieSig = require("cookie-signature"); // transitive dep of express-session
const { v4: uuidv4 } = require("uuid");

// Loaded after env vars are set so they pick up the test database
const knex = require("../src/db/knex");
const app = require("../src/app");
const queries = require("../src/lib/agency-overview-queries");

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";
const TEST_DB_PATH = path.resolve(__dirname, "../test-agency-overview.sqlite3");

// ─── Schema setup ─────────────────────────────────────────────────────────────

async function createSchema() {
  // users
  if (!(await knex.schema.hasTable("users"))) {
    await knex.schema.createTable("users", (t) => {
      t.string("id", 36).primary();
      t.string("email").notNullable().unique();
      t.string("role").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  // sessions
  if (!(await knex.schema.hasTable("sessions"))) {
    await knex.schema.createTable("sessions", (t) => {
      t.string("sid", 255).primary();
      t.json("sess").notNullable();
      t.timestamp("expired").notNullable();
    });
  }

  // profiles
  if (!(await knex.schema.hasTable("profiles"))) {
    await knex.schema.createTable("profiles", (t) => {
      t.string("id", 36).primary();
      t.string("user_id", 36)
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("archetype", 50).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else {
    if (!(await knex.schema.hasColumn("profiles", "archetype"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.string("archetype", 50).nullable();
      });
    }
    if (!(await knex.schema.hasColumn("profiles", "created_at"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.timestamp("created_at").defaultTo(knex.fn.now());
      });
    }
  }

  // applications
  if (!(await knex.schema.hasTable("applications"))) {
    await knex.schema.createTable("applications", (t) => {
      t.string("id", 36)
        .primary()
        .defaultTo(
          knex.raw(
            "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))",
          ),
        );
      t.string("profile_id", 36).references("id").inTable("profiles");
      t.string("agency_id", 36).references("id").inTable("users");
      t.string("status").notNullable();
      t.timestamp("accepted_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  // boards
  if (!(await knex.schema.hasTable("boards"))) {
    await knex.schema.createTable("boards", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).references("id").inTable("users");
      t.boolean("is_active").defaultTo(true);
      t.timestamp("closes_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else if (!(await knex.schema.hasColumn("boards", "closes_at"))) {
    await knex.schema.alterTable("boards", (t) => {
      t.timestamp("closes_at").nullable();
    });
  }

  // board_applications — links board_applications.application_id → applications.id
  // No profile_id column here; profile is reached via applications.profile_id
  if (!(await knex.schema.hasTable("board_applications"))) {
    await knex.schema.createTable("board_applications", (t) => {
      t.string("id", 36).primary();
      t.string("application_id", 36).references("id").inTable("applications");
      t.float("match_score").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  // subscriptions — queried by attachLocals for TALENT role users
  if (!(await knex.schema.hasTable("subscriptions"))) {
    await knex.schema.createTable("subscriptions", (t) => {
      t.string("id", 36).primary();
      t.string("user_id", 36)
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("stripe_customer_id").notNullable().unique();
      t.string("stripe_subscription_id").nullable().unique();
      t.string("stripe_price_id").notNullable();
      t.enu("status", ["trialing", "active", "past_due", "canceled", "unpaid"])
        .notNullable()
        .defaultTo("trialing");
      t.timestamp("trial_start").nullable();
      t.timestamp("trial_end").nullable();
      t.timestamp("current_period_start").nullable();
      t.timestamp("current_period_end").nullable();
      t.boolean("cancel_at_period_end").notNullable().defaultTo(false);
      t.timestamp("canceled_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  // is_discoverable on profiles
  if (!(await knex.schema.hasColumn("profiles", "is_discoverable"))) {
    await knex.schema.alterTable("profiles", (t) => {
      t.boolean("is_discoverable").defaultTo(false);
    });
  }
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const AGENCY_USER_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();

async function seedData() {
  await knex("users").delete();
  await knex("users").insert([
    { id: AGENCY_USER_ID, email: "agency@example.com", role: "AGENCY" },
    { id: TALENT_USER_ID, email: "talent@example.com", role: "TALENT" },
  ]);
  await knex("profiles").delete();
  await knex("profiles").insert({ id: PROFILE_ID, user_id: TALENT_USER_ID });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await createSchema();
  await seedData();
}, 30000);

afterAll(async () => {
  await knex.destroy();
  // Clean up the temp test database file
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a supertest agent with an injected session.
 * Inserts a session row and sets a signed connect.sid cookie on the agent.
 */
async function agentWithSession(userId, role) {
  const sid = uuidv4();

  // Agency sessions need agencyOnboardingCompletedAt set so the
  // requireAgencyOnboardingComplete middleware doesn't block requests.
  const sessionData = {
    cookie: {
      originalMaxAge: null,
      expires: null,
      secure: false,
      httpOnly: true,
      path: "/",
    },
    userId,
    role,
    ...(role === "AGENCY" && {
      agencyOnboardingCompletedAt: new Date().toISOString(),
    }),
  };

  await knex("sessions").insert({
    sid,
    sess: JSON.stringify(sessionData),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });

  const signed = "s:" + cookieSig.sign(sid, SESSION_SECRET);
  const encoded = encodeURIComponent(signed);

  return function agentReq(req) {
    return req.set("Cookie", `connect.sid=${encoded}`);
  };
}

// ─── Auth enforcement ─────────────────────────────────────────────────────────

describe("GET /api/agency/overview — auth", () => {
  test("returns 401 when not logged in", async () => {
    const res = await request(app).get("/api/agency/overview");
    expect(res.status).toBe(401);
  });

  test("returns 403 when logged in as TALENT", async () => {
    const withCookie = await agentWithSession(TALENT_USER_ID, "TALENT");
    const res = await withCookie(request(app).get("/api/agency/overview"));
    expect(res.status).toBe(403);
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe("GET /api/agency/overview — response shape", () => {
  let res;

  beforeAll(async () => {
    const withCookie = await agentWithSession(AGENCY_USER_ID, "AGENCY");
    res = await withCookie(request(app).get("/api/agency/overview"));
  });

  test("returns 200", () => {
    expect(res.status).toBe(200);
  });

  test("top-level shape: success + data", () => {
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  test("kpis shape", () => {
    const { kpis } = res.body.data;
    expect(kpis).toBeDefined();

    expect(typeof kpis.pendingReview.count).toBe("number");
    expect(
      kpis.pendingReview.oldestDaysAgo === null ||
        typeof kpis.pendingReview.oldestDaysAgo === "number",
    ).toBe(true);

    expect(typeof kpis.activeCastings.count).toBe("number");
    expect(typeof kpis.activeCastings.closingToday).toBe("number");

    expect(typeof kpis.rosterSize.count).toBe("number");
    expect(Array.isArray(kpis.rosterSize.trend)).toBe(true);
    expect(kpis.rosterSize.trend).toHaveLength(7);
    expect(typeof kpis.rosterSize.changeThisMonth).toBe("number");

    expect(typeof kpis.placementRate.current).toBe("number");
    expect(typeof kpis.placementRate.lastSeason).toBe("number");
  });

  test("pipeline is an array; each entry has label/count/sharePct", () => {
    const { pipeline } = res.body.data;
    expect(Array.isArray(pipeline)).toBe(true);
    for (const entry of pipeline) {
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(typeof entry.sharePct).toBe("number");
    }
  });

  test("talentMix is an array; each entry has name/count/pct", () => {
    const { talentMix } = res.body.data;
    expect(Array.isArray(talentMix)).toBe(true);
    for (const entry of talentMix) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(typeof entry.pct).toBe("number");
    }
  });

  test("alerts is an array; each entry has type/message/count/link", () => {
    const { alerts } = res.body.data;
    expect(Array.isArray(alerts)).toBe(true);
    for (const alert of alerts) {
      expect(["critical", "warning", "positive"]).toContain(alert.type);
      expect(typeof alert.message).toBe("string");
      expect(typeof alert.count).toBe("number");
      expect(typeof alert.link).toBe("string");
    }
  });

  test("pulse object present with correct shape", () => {
    const { pulse } = res.body.data;
    expect(pulse).toBeDefined();
    expect(typeof pulse.newToday).toBe("number");
    expect(typeof pulse.closingWeek).toBe("number");
    expect(typeof pulse.idleTalent).toBe("number");
    expect(typeof pulse.discoverableCount).toBe("number");
    expect(typeof pulse.newTalentWeek).toBe("number");
    // avgMatchScore may be null when no submitted apps exist
    expect(
      pulse.avgMatchScore === null || typeof pulse.avgMatchScore === "number",
    ).toBe(true);
  });

  test("kpis.utilization present with correct shape", () => {
    const { utilization } = res.body.data.kpis;
    expect(utilization).toBeDefined();
    expect(typeof utilization.active).toBe("number");
    expect(typeof utilization.total).toBe("number");
    expect(typeof utilization.pct).toBe("number");
  });

  test("no field is null except oldestDaysAgo when pendingReview.count is 0", () => {
    const { kpis, pipeline, talentMix, alerts } = res.body.data;

    expect(kpis.activeCastings.count).not.toBeNull();
    expect(kpis.activeCastings.closingToday).not.toBeNull();
    expect(kpis.rosterSize.count).not.toBeNull();
    expect(kpis.rosterSize.trend).not.toBeNull();
    expect(kpis.rosterSize.changeThisMonth).not.toBeNull();
    expect(kpis.placementRate.current).not.toBeNull();
    expect(kpis.placementRate.lastSeason).not.toBeNull();

    if (kpis.pendingReview.count === 0) {
      expect(kpis.pendingReview.oldestDaysAgo).toBeNull();
    } else {
      expect(kpis.pendingReview.oldestDaysAgo).not.toBeNull();
    }

    expect(pipeline).not.toBeNull();
    expect(talentMix).not.toBeNull();
    expect(alerts).not.toBeNull();
  });
});

// ─── Zero-state ───────────────────────────────────────────────────────────────

describe("query functions — zero state (fresh agency with no data)", () => {
  let freshAgencyId;

  beforeAll(async () => {
    freshAgencyId = uuidv4();
    await knex("users").insert({
      id: freshAgencyId,
      email: `fresh-${Date.now()}@test.local`,
      role: "AGENCY",
    });
  });

  test("getPendingReview returns { count: 0, oldestDaysAgo: null }", async () => {
    expect(await queries.getPendingReview(knex, freshAgencyId)).toEqual({
      count: 0,
      oldestDaysAgo: null,
    });
  });

  test("getActiveCastings returns { count: 0, closingToday: 0 }", async () => {
    expect(await queries.getActiveCastings(knex, freshAgencyId)).toEqual({
      count: 0,
      closingToday: 0,
    });
  });

  test("getRosterSize returns count:0, 7-zero trend, changeThisMonth:0", async () => {
    const result = await queries.getRosterSize(knex, freshAgencyId);
    expect(result.count).toBe(0);
    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((v) => v === 0)).toBe(true);
    expect(result.changeThisMonth).toBe(0);
  });

  test("getPlacementRate returns { current: 0, lastSeason: 0 }", async () => {
    expect(await queries.getPlacementRate(knex, freshAgencyId)).toEqual({
      current: 0,
      lastSeason: 0,
    });
  });

  test("getPipeline returns []", async () => {
    expect(await queries.getPipeline(knex, freshAgencyId)).toEqual([]);
  });

  test("getTalentMix returns []", async () => {
    expect(await queries.getTalentMix(knex, freshAgencyId)).toEqual([]);
  });

  test("getAlerts returns []", async () => {
    expect(await queries.getAlerts(knex, freshAgencyId)).toEqual([]);
  });
});

// ─── Data correctness ─────────────────────────────────────────────────────────

describe("query functions — data correctness", () => {
  // Insert known data and verify query results match

  beforeAll(async () => {
    // Clear and repopulate applications + boards for the seeded agency
    await knex("applications").where("agency_id", AGENCY_USER_ID).delete();
    await knex("boards").where("agency_id", AGENCY_USER_ID).delete();

    const now = new Date();
    const fiveDaysAgo = new Date(now - 5 * 86400000);
    const twentyDaysAgo = new Date(now - 20 * 86400000);
    const fourWeeksAgo = new Date(now - 28 * 86400000);

    // 3 submitted applications (2 recent, 1 overdue at 20 days)
    await knex("applications").insert([
      {
        id: uuidv4(),
        profile_id: PROFILE_ID,
        agency_id: AGENCY_USER_ID,
        status: "submitted",
        created_at: now,
      },
      {
        id: uuidv4(),
        profile_id: PROFILE_ID,
        agency_id: AGENCY_USER_ID,
        status: "submitted",
        created_at: fiveDaysAgo,
      },
      {
        id: uuidv4(),
        profile_id: PROFILE_ID,
        agency_id: AGENCY_USER_ID,
        status: "submitted",
        created_at: twentyDaysAgo,
      },
    ]);

    // 2 accepted applications with accepted_at set
    await knex("applications").insert([
      {
        id: uuidv4(),
        profile_id: PROFILE_ID,
        agency_id: AGENCY_USER_ID,
        status: "accepted",
        accepted_at: now,
        created_at: now,
      },
      {
        id: uuidv4(),
        profile_id: PROFILE_ID,
        agency_id: AGENCY_USER_ID,
        status: "accepted",
        accepted_at: fourWeeksAgo,
        created_at: fourWeeksAgo,
      },
    ]);

    // 1 declined application
    await knex("applications").insert({
      id: uuidv4(),
      profile_id: PROFILE_ID,
      agency_id: AGENCY_USER_ID,
      status: "declined",
      created_at: fiveDaysAgo,
    });

    // 2 active boards (1 closing today)
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayMid = new Date(todayStart.getTime() + 43200000); // noon UTC today
    await knex("boards").insert([
      {
        id: uuidv4(),
        agency_id: AGENCY_USER_ID,
        is_active: true,
        closes_at: null,
      },
      {
        id: uuidv4(),
        agency_id: AGENCY_USER_ID,
        is_active: true,
        closes_at: todayMid,
      },
    ]);
  });

  test("pendingReview.count matches submitted applications in DB", async () => {
    const [row] = await knex("applications")
      .where({ agency_id: AGENCY_USER_ID, status: "submitted" })
      .count("* as count");
    const expected = parseInt(row.count, 10);
    const result = await queries.getPendingReview(knex, AGENCY_USER_ID);
    expect(result.count).toBe(expected); // 3
    expect(result.oldestDaysAgo).toBeGreaterThanOrEqual(19); // 20-day-old application
  });

  test("activeCastings: count=2, closingToday=1", async () => {
    const result = await queries.getActiveCastings(knex, AGENCY_USER_ID);
    expect(result.count).toBe(2);
    expect(result.closingToday).toBe(1);
  });

  test("rosterSize count matches accepted+non-null-accepted_at in DB", async () => {
    const [row] = await knex("applications")
      .where({ agency_id: AGENCY_USER_ID, status: "accepted" })
      .whereNotNull("accepted_at")
      .count("* as count");
    const expected = parseInt(row.count, 10); // 2
    const result = await queries.getRosterSize(knex, AGENCY_USER_ID);
    expect(result.count).toBe(expected);
  });

  test("rosterSize trend[6] equals rosterSize.count", async () => {
    const result = await queries.getRosterSize(knex, AGENCY_USER_ID);
    expect(result.trend[6]).toBe(result.count);
  });

  test("rosterSize trend has exactly 7 elements, all non-negative", async () => {
    const result = await queries.getRosterSize(knex, AGENCY_USER_ID);
    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((v) => v >= 0)).toBe(true);
  });

  test("pipeline contains submitted and declined stages", async () => {
    const pipeline = await queries.getPipeline(knex, AGENCY_USER_ID);
    expect(pipeline.length).toBeGreaterThan(0);
    const labels = pipeline.map((s) => s.label);
    expect(labels).toContain("Submitted");
    expect(labels).toContain("Declined");
  });

  test("pipeline sharePct values sum to approximately 100 (±2)", async () => {
    const pipeline = await queries.getPipeline(knex, AGENCY_USER_ID);
    const sum = pipeline.reduce((acc, s) => acc + s.sharePct, 0);
    expect(sum).toBeGreaterThanOrEqual(98);
    expect(sum).toBeLessThanOrEqual(102);
  });

  test("alerts includes critical alert for overdue application", async () => {
    const alerts = await queries.getAlerts(knex, AGENCY_USER_ID);
    const critical = alerts.find((a) => a.type === "critical");
    expect(critical).toBeDefined();
    expect(critical.count).toBeGreaterThanOrEqual(1);
    expect(critical.link).toBe("/dashboard/agency/applicants");
  });

  test("alerts includes warning for casting closing today", async () => {
    const alerts = await queries.getAlerts(knex, AGENCY_USER_ID);
    const warning = alerts.find((a) => a.type === "warning");
    expect(warning).toBeDefined();
    expect(warning.count).toBe(1);
    expect(warning.link).toBe("/dashboard/agency/casting");
  });

  test("placementRate values are integers in range 0–100", async () => {
    const result = await queries.getPlacementRate(knex, AGENCY_USER_ID);
    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
    expect(result.lastSeason).toBeGreaterThanOrEqual(0);
    expect(result.lastSeason).toBeLessThanOrEqual(100);
    expect(Number.isInteger(result.current)).toBe(true);
    expect(Number.isInteger(result.lastSeason)).toBe(true);
  });
});

// ─── getPulse — zero state ────────────────────────────────────────────────────

describe("getPulse — zero state", () => {
  let freshPulseAgencyId;

  beforeAll(async () => {
    freshPulseAgencyId = uuidv4();
    await knex("users").insert({
      id: freshPulseAgencyId,
      email: `fresh-pulse-${Date.now()}@test.local`,
      role: "AGENCY",
    });
  });

  test("returns all-zero pulse for fresh agency", async () => {
    const result = await queries.getPulse(knex, freshPulseAgencyId);
    expect(result.newToday).toBe(0);
    expect(result.closingWeek).toBe(0);
    expect(result.idleTalent).toBe(0);
    expect(result.avgMatchScore).toBeNull();
    expect(result.discoverableCount).toBeGreaterThanOrEqual(0);
    expect(result.newTalentWeek).toBeGreaterThanOrEqual(0);
  });
});

// ─── getPulse — data correctness ─────────────────────────────────────────────

describe("getPulse — data correctness", () => {
  // Use a dedicated agency + talent user to avoid corrupting the shared
  // AGENCY_USER_ID data used by "query functions — data correctness".
  const PULSE_AGENCY_ID = uuidv4();
  const PULSE_TALENT_ID = uuidv4();
  const PULSE_PROFILE_ID = uuidv4();
  const TODAY_APP_ID = uuidv4();
  const ACCEPTED_APP_ID = uuidv4();
  const IDLE_PROFILE_ID = uuidv4();
  const BOARD_ID = uuidv4();

  beforeAll(async () => {
    // Insert dedicated users and profile for this describe block
    await knex("users").insert([
      {
        id: PULSE_AGENCY_ID,
        email: `pulse-agency-${Date.now()}@test.local`,
        role: "AGENCY",
      },
      {
        id: PULSE_TALENT_ID,
        email: `pulse-talent-${Date.now()}@test.local`,
        role: "TALENT",
      },
    ]);
    await knex("profiles").insert({
      id: PULSE_PROFILE_ID,
      user_id: PULSE_TALENT_ID,
      is_discoverable: false,
    });

    // idle talent profile
    await knex("profiles").insert({
      id: IDLE_PROFILE_ID,
      user_id: PULSE_TALENT_ID,
      is_discoverable: false,
    });
    // application submitted today
    await knex("applications").insert({
      id: TODAY_APP_ID,
      profile_id: PULSE_PROFILE_ID,
      agency_id: PULSE_AGENCY_ID,
      status: "submitted",
      created_at: new Date().toISOString(),
    });
    // accepted application with no recent board activity = idle
    await knex("applications").insert({
      id: ACCEPTED_APP_ID,
      profile_id: IDLE_PROFILE_ID,
      agency_id: PULSE_AGENCY_ID,
      status: "accepted",
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    });
    // board closing in 3 days
    await knex("boards").insert({
      id: BOARD_ID,
      agency_id: PULSE_AGENCY_ID,
      is_active: true,
      closes_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    });
  });

  afterAll(async () => {
    await knex("boards").where({ id: BOARD_ID }).delete();
    await knex("applications")
      .whereIn("id", [TODAY_APP_ID, ACCEPTED_APP_ID])
      .delete();
    await knex("profiles")
      .whereIn("id", [PULSE_PROFILE_ID, IDLE_PROFILE_ID])
      .delete();
    await knex("users")
      .whereIn("id", [PULSE_AGENCY_ID, PULSE_TALENT_ID])
      .delete();
  });

  test("newToday counts application submitted today", async () => {
    const result = await queries.getPulse(knex, PULSE_AGENCY_ID);
    expect(result.newToday).toBeGreaterThanOrEqual(1);
  });

  test("closingWeek counts board closing in 3 days", async () => {
    const result = await queries.getPulse(knex, PULSE_AGENCY_ID);
    expect(result.closingWeek).toBeGreaterThanOrEqual(1);
  });

  test("idleTalent counts accepted talent with no recent board activity", async () => {
    const result = await queries.getPulse(knex, PULSE_AGENCY_ID);
    expect(result.idleTalent).toBeGreaterThanOrEqual(1);
  });
});

// ─── getActiveUtilization — zero state ───────────────────────────────────────

describe("getActiveUtilization — zero state", () => {
  let freshUtilAgencyId;

  beforeAll(async () => {
    freshUtilAgencyId = uuidv4();
    await knex("users").insert({
      id: freshUtilAgencyId,
      email: `fresh-util-${Date.now()}@test.local`,
      role: "AGENCY",
    });
  });

  test("returns { active: 0, total: 0, pct: 0 } for fresh agency", async () => {
    const result = await queries.getActiveUtilization(knex, freshUtilAgencyId);
    expect(result).toEqual({ active: 0, total: 0, pct: 0 });
  });
});
