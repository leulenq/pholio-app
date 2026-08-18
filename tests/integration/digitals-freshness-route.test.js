"use strict";

/**
 * Digitals freshness — the talent-facing surface.
 *
 * The engine itself is covered by its own unit tests. This covers the part that
 * was missing until now: that a talent can *see* the four states, and can answer
 * the only question `undated` asks — when were these taken.
 *
 * Covers:
 *  - the four states reaching the client, including the honesty rule that a set
 *    containing an undated image is never reported "current";
 *  - dating a set, and the freshness state moving as a result;
 *  - a future shoot date being refused rather than clamped, because clamping
 *    would let a stale set be dated forward into "current";
 *  - ownership and eligibility being checked against the database, not the body.
 *
 * The router is mounted on a bare app with a stub session: this exercises the
 * route contract without dragging in the whole middleware chain.
 */

process.env.DATABASE_URL = "sqlite://./test-digitals-freshness.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const digitalsRouter = require("../../src/domains/talent/routes/digitals");

const TEST_DB_PATH = path.resolve(__dirname, "../../test-digitals-freshness.sqlite3");
const USER_ID = uuidv4();
const OTHER_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const OTHER_PROFILE_ID = uuidv4();

let sessionUserId = USER_ID;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = { userId: sessionUserId, role: "TALENT" };
  next();
});
app.use("/api/talent/digitals", digitalsRouter);

/** ISO strings, never Date objects — knex under jest's VM realm mis-stores those. */
function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function createSchema() {
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).nullable();
  });
  await knex.schema.createTable("image_sets", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("name").nullable();
    table.timestamp("created_at").nullable();
  });
  await knex.schema.createTable("images", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("image_type").nullable();
    table.string("shot_type").nullable();
    table.timestamp("captured_at").nullable();
    table.string("set_id", 36).nullable();
    table.text("metadata").nullable();
    // `path`, as the real table names it — an invented column name here would
    // hide a 500 from a bad select, which is exactly what it did once.
    table.string("path").nullable();
  });
}

async function resetImages(rows) {
  await knex("images").del();
  if (rows.length) await knex("images").insert(rows);
}

function digital(overrides = {}) {
  return {
    id: uuidv4(),
    profile_id: PROFILE_ID,
    image_type: "digital",
    shot_type: "headshot",
    captured_at: null,
    set_id: null,
    path: "/uploads/x.jpg",
    ...overrides,
  };
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await knex("profiles").insert([
    { id: PROFILE_ID, user_id: USER_ID },
    { id: OTHER_PROFILE_ID, user_id: OTHER_USER_ID },
  ]);
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

beforeEach(() => {
  sessionUserId = USER_ID;
});

describe("GET /freshness", () => {
  test("a recently dated set reads as current", async () => {
    await resetImages([digital({ captured_at: daysAgoIso(10) })]);

    const res = await request(app).get("/api/talent/digitals/freshness");

    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe("current");
    expect(res.body.data.hasDigitals).toBe(true);
    // The windows travel with the payload so the surface does not hardcode them.
    expect(res.body.data.windows.currentMaxDays).toBeGreaterThan(0);
  });

  test("an old set reads as stale, with the age that made it so", async () => {
    await resetImages([digital({ captured_at: daysAgoIso(400) })]);

    const res = await request(app).get("/api/talent/digitals/freshness");

    expect(res.body.data.state).toBe("stale");
    expect(res.body.data.currentSet.ageDays).toBeGreaterThan(365);
    expect(res.body.data.guidance).toMatch(/reshoot/i);
  });

  test("one undated image stops a whole set being called current", async () => {
    // The honesty rule the engine exists for: "current" is a claim about the
    // set, and one unknown makes it unsupportable.
    const setId = uuidv4();
    await knex("image_sets").del();
    await knex("image_sets").insert({ id: setId, profile_id: PROFILE_ID, name: "June test" });
    await resetImages([
      digital({ captured_at: daysAgoIso(5), set_id: setId }),
      digital({ captured_at: null, set_id: setId }),
    ]);

    const res = await request(app).get("/api/talent/digitals/freshness");

    expect(res.body.data.state).toBe("undated");
    expect(res.body.data.sets[0].undatedCount).toBe(1);
    // and the set is named, so the talent knows which one to fix
    expect(res.body.data.sets[0].name).toBe("June test");
  });

  test("no digitals at all is said plainly rather than reported as a state", async () => {
    await resetImages([digital({ image_type: "portfolio", captured_at: daysAgoIso(5) })]);

    const res = await request(app).get("/api/talent/digitals/freshness");

    expect(res.body.data.hasDigitals).toBe(false);
    expect(res.body.data.guidance).toMatch(/no digitals/i);
  });
});

describe("PUT /capture-date", () => {
  test("dating an undated set moves it out of undated", async () => {
    const image = digital({ captured_at: null });
    await resetImages([image]);

    const before = await request(app).get("/api/talent/digitals/freshness");
    expect(before.body.data.state).toBe("undated");

    const capturedOn = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .put("/api/talent/digitals/capture-date")
      .send({ imageIds: [image.id], capturedOn });

    expect(res.status).toBe(200);
    expect(res.body.data.dated).toEqual([image.id]);
    // The updated reading comes back with the write, so the surface does not
    // have to refetch to tell the truth.
    expect(res.body.data.freshness.state).toBe("current");

    const stored = await knex("images").where({ id: image.id }).first("captured_at");
    expect(String(stored.captured_at)).toContain(capturedOn);
  });

  test("a future shoot date is refused, not clamped", async () => {
    // Clamping would let a stale set be dated forward into "current".
    const image = digital({ captured_at: null });
    await resetImages([image]);

    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .put("/api/talent/digitals/capture-date")
      .send({ imageIds: [image.id], capturedOn: tomorrow });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe("FUTURE_DATE");

    const stored = await knex("images").where({ id: image.id }).first("captured_at");
    expect(stored.captured_at).toBeNull();
  });

  test.each([
    [{ imageIds: [], capturedOn: "2026-01-01" }, "NO_IMAGES"],
    [{ imageIds: ["x"], capturedOn: "01/01/2026" }, "BAD_DATE"],
    [{ imageIds: ["x"] }, "BAD_DATE"],
  ])("malformed input %# is rejected", async (body, code) => {
    const res = await request(app).put("/api/talent/digitals/capture-date").send(body);
    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe(code);
  });

  test("another talent's image cannot be dated", async () => {
    const mine = digital({ captured_at: null });
    const theirs = digital({ profile_id: OTHER_PROFILE_ID, captured_at: null });
    await resetImages([mine, theirs]);

    const res = await request(app)
      .put("/api/talent/digitals/capture-date")
      .send({ imageIds: [theirs.id], capturedOn: "2026-01-01" });

    expect(res.status).toBe(400);
    const stored = await knex("images").where({ id: theirs.id }).first("captured_at");
    expect(stored.captured_at).toBeNull();
  });

  test("a non-digital is skipped rather than silently dated", async () => {
    const book = digital({ image_type: "portfolio", captured_at: null });
    const shot = digital({ captured_at: null });
    await resetImages([book, shot]);

    const res = await request(app)
      .put("/api/talent/digitals/capture-date")
      .send({ imageIds: [book.id, shot.id], capturedOn: "2026-01-01" });

    expect(res.status).toBe(200);
    expect(res.body.data.dated).toEqual([shot.id]);
    expect(res.body.data.skipped).toEqual([book.id]);

    const stored = await knex("images").where({ id: book.id }).first("captured_at");
    expect(stored.captured_at).toBeNull();
  });
});
