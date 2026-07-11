// tests/integration/roster-measured-in-person.test.js
"use strict";

/**
 * WS6.4 — POST/DELETE /api/agency/roster/:profileId/measured
 * (src/domains/agency/routes/roster.js).
 *
 * Council review "copy honesty": self-reported `measurements_updated_at`
 * only ever renders "last updated"; `measured_in_person_at` +
 * `measured_by_agency_id` are the ONLY state allowed to render "measured in
 * person / confirmed", and this endpoint is the only write path for them.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-roster-measured.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";

const AGENCY_A_ID = uuidv4();
const AGENCY_B_ID = uuidv4();
const ROSTER_PROFILE_ID = uuidv4();
const NON_ROSTER_PROFILE_ID = uuidv4();

// `src/app.js` constructs a `connect-session-knex` store at require time,
// which immediately (and asynchronously) bootstraps its own `sessions` table
// on this same shared knex connection/pool — racing our explicit schema
// setup below (observed as SQLITE_IOERR / "table already exists" depending
// on interleaving). `ensureTable` makes table creation idempotent and
// retry-safe against that race without touching any shared app/knex config.
async function ensureTable(tableName, builder, { retries = 5, delayMs = 40 } = {}) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      if (await knex.schema.hasTable(tableName)) return;
      await knex.schema.createTable(tableName, builder);
      return;
    } catch (error) {
      const message = String((error && error.message) || "");
      if (/already exists/i.test(message)) return;
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}

async function ensureColumn(tableName, columnName, builder, opts) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (await knex.schema.hasColumn(tableName, columnName)) return;
      await knex.schema.alterTable(tableName, builder);
      return;
    } catch (error) {
      const message = String((error && error.message) || "");
      if (/duplicate column/i.test(message)) return;
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}

async function createSchema() {
  await ensureTable("users", (t) => {
    t.string("id", 36).primary();
    t.string("email").notNullable().unique();
    t.string("role").notNullable();
    t.string("account_status").notNullable().defaultTo("ACTIVE");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await ensureColumn("users", "account_status", (t) => {
    t.string("account_status").notNullable().defaultTo("ACTIVE");
  });

  await ensureTable("sessions", (t) => {
    t.string("sid", 255).primary();
    t.json("sess").notNullable();
    t.timestamp("expired").notNullable();
  });

  await ensureTable("profiles", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).nullable();
    t.string("first_name", 100).nullable();
    t.string("last_name", 100).nullable();
    t.text("bio_curated").nullable();
    t.timestamp("measured_in_person_at").nullable();
    t.string("measured_by_agency_id", 36).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await ensureColumn("profiles", "measured_in_person_at", (t) => {
    t.timestamp("measured_in_person_at").nullable();
  });
  await ensureColumn("profiles", "measured_by_agency_id", (t) => {
    t.string("measured_by_agency_id", 36).nullable();
  });

  await ensureTable("applications", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("status").notNullable().defaultTo("submitted");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

async function seedFixture() {
  await knex("applications").del();
  await knex("profiles").del();
  await knex("sessions").del();
  await knex("users").del();

  await knex("users").insert([
    { id: AGENCY_A_ID, email: "agency-a@measured.test", role: "AGENCY" },
    { id: AGENCY_B_ID, email: "agency-b@measured.test", role: "AGENCY" },
  ]);

  await knex("profiles").insert([
    {
      id: ROSTER_PROFILE_ID,
      first_name: "Rosa",
      last_name: "Roster",
      bio_curated: "On agency A's roster",
    },
    {
      id: NON_ROSTER_PROFILE_ID,
      first_name: "Not",
      last_name: "Roster",
      bio_curated: "Discoverable but never signed",
    },
  ]);

  // Only ROSTER_PROFILE_ID has an accepted application to agency A.
  await knex("applications").insert({
    id: uuidv4(),
    profile_id: ROSTER_PROFILE_ID,
    agency_id: AGENCY_A_ID,
    status: "accepted",
  });
}

async function agencySession(agencyId) {
  const sid = uuidv4();
  const sessionData = {
    cookie: {
      originalMaxAge: null,
      expires: null,
      secure: false,
      httpOnly: true,
      path: "/",
    },
    userId: agencyId,
    agencyId,
    role: "AGENCY",
  };

  await knex("sessions").insert({
    sid,
    sess: JSON.stringify(sessionData),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });

  const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
  const encoded = encodeURIComponent(signed);
  return (req) => req.set("Cookie", `connect.sid=${encoded}`);
}

beforeAll(async () => {
  // Deliberately do NOT unlink/reset the sqlite file here: `src/app.js`
  // (required above) already opened a connection to it via
  // connect-session-knex's own auto-bootstrapped `sessions` table, and
  // deleting the file out from under that open connection is what produces
  // spurious SQLITE_IOERR. `ensureTable`/`ensureColumn` make setup idempotent
  // across repeat runs instead (mirrors tests/integration/agency-rbac.test.js).
  await createSchema();
}, 30000);

afterAll(async () => {
  await knex.destroy();
});

beforeEach(async () => {
  await seedFixture();
});

describe("POST /api/agency/roster/:profileId/measured", () => {
  test("confirms in-person measurement for a talent on this agency's roster", async () => {
    const withCookie = await agencySession(AGENCY_A_ID);
    const res = await withCookie(
      request(app).post(`/api/agency/roster/${ROSTER_PROFILE_ID}/measured`),
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.measured_by_agency_id).toBe(AGENCY_A_ID);
    expect(res.body.measured_in_person_at).toBeTruthy();

    const profile = await knex("profiles")
      .where({ id: ROSTER_PROFILE_ID })
      .first();
    expect(profile.measured_by_agency_id).toBe(AGENCY_A_ID);
    expect(profile.measured_in_person_at).toBeTruthy();
  });

  test("rejects a profile not on this agency's roster (no accepted application)", async () => {
    const withCookie = await agencySession(AGENCY_A_ID);
    const res = await withCookie(
      request(app).post(
        `/api/agency/roster/${NON_ROSTER_PROFILE_ID}/measured`,
      ),
    );

    expect(res.status).toBe(403);
    const profile = await knex("profiles")
      .where({ id: NON_ROSTER_PROFILE_ID })
      .first();
    expect(profile.measured_in_person_at).toBeNull();
  });

  test("rejects a different agency's roster claim (cross-tenant isolation)", async () => {
    const withCookie = await agencySession(AGENCY_B_ID);
    const res = await withCookie(
      request(app).post(`/api/agency/roster/${ROSTER_PROFILE_ID}/measured`),
    );

    expect(res.status).toBe(403);
  });

  test("rejects unauthenticated / non-agency callers", async () => {
    const res = await request(app).post(
      `/api/agency/roster/${ROSTER_PROFILE_ID}/measured`,
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/agency/roster/:profileId/measured", () => {
  test("clears the measurement recorded by this same agency", async () => {
    const withCookie = await agencySession(AGENCY_A_ID);
    await withCookie(
      request(app).post(`/api/agency/roster/${ROSTER_PROFILE_ID}/measured`),
    );

    const res = await withCookie(
      request(app).delete(`/api/agency/roster/${ROSTER_PROFILE_ID}/measured`),
    );

    expect(res.status).toBe(200);
    expect(res.body.measured_in_person_at).toBeNull();
    expect(res.body.measured_by_agency_id).toBeNull();

    const profile = await knex("profiles")
      .where({ id: ROSTER_PROFILE_ID })
      .first();
    expect(profile.measured_in_person_at).toBeNull();
    expect(profile.measured_by_agency_id).toBeNull();
  });

  test("refuses to clear a measurement recorded by a different agency", async () => {
    // Agency A confirms the measurement.
    const agencyACookie = await agencySession(AGENCY_A_ID);
    await agencyACookie(
      request(app).post(`/api/agency/roster/${ROSTER_PROFILE_ID}/measured`),
    );

    // Give agency B its own accepted application to the same talent (shared
    // roster edge case), then try to clear agency A's confirmation.
    await knex("applications").insert({
      id: uuidv4(),
      profile_id: ROSTER_PROFILE_ID,
      agency_id: AGENCY_B_ID,
      status: "accepted",
    });

    const agencyBCookie = await agencySession(AGENCY_B_ID);
    const res = await agencyBCookie(
      request(app).delete(`/api/agency/roster/${ROSTER_PROFILE_ID}/measured`),
    );

    expect(res.status).toBe(403);

    const profile = await knex("profiles")
      .where({ id: ROSTER_PROFILE_ID })
      .first();
    expect(profile.measured_by_agency_id).toBe(AGENCY_A_ID);
    expect(profile.measured_in_person_at).toBeTruthy();
  });
});
