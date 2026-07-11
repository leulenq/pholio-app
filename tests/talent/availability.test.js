// tests/talent/availability.test.js
// Discover WS9.1/9.2 — talent-side availability + bookouts CRUD, validation,
// role isolation, minor consent gating, and the stats-currency touch endpoint.
"use strict";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";

const ADULT_DOB = "1995-03-15";
const MINOR_DOB = "2012-03-15"; // clearly under 18

const SESSION_IDS = [];
const FIXTURES = [];

async function makeProfile({
  dob = ADULT_DOB,
  guardianConsentAt = null,
  measurementsUpdatedAt = null,
  role = "TALENT",
} = {}) {
  const userId = uuidv4();
  const profileId = uuidv4();

  await knex("users").insert({
    id: userId,
    email: `avail-${userId}@example.com`,
    password_hash: "x",
    role,
    terms_accepted_at: knex.fn.now(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: knex.fn.now(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  });

  const profileRow = {
    id: profileId,
    user_id: userId,
    slug: `avail-${profileId}`,
    first_name: "Avail",
    last_name: "Tester",
    city: "Test City",
    height_cm: 170,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  };
  if (dob != null) profileRow.date_of_birth = dob;
  if (guardianConsentAt) profileRow.guardian_consent_at = knex.fn.now();
  if (measurementsUpdatedAt) profileRow.measurements_updated_at = measurementsUpdatedAt;

  await knex("profiles").insert(profileRow);

  const fixture = { userId, profileId };
  FIXTURES.push(fixture);
  return fixture;
}

async function withSession(fixture, req) {
  const sid = uuidv4();
  SESSION_IDS.push(sid);
  const sessData = {
    cookie: {
      originalMaxAge: 86400000,
      expires: new Date(Date.now() + 86400000).toISOString(),
      secure: false,
      httpOnly: true,
      path: "/",
    },
    userId: fixture.userId,
    role: fixture.role || "TALENT",
  };
  await knex("sessions").insert({
    sid,
    sess: sessData,
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  const signed = "s:" + cookieSig.sign(sid, SESSION_SECRET);
  return req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
}

async function cleanupProfile({ userId, profileId }) {
  await knex("bookouts").where({ profile_id: profileId }).del();
  await knex("profiles").where({ id: profileId }).del();
  await knex("users").where({ id: userId }).del();
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

afterAll(async () => {
  if (SESSION_IDS.length > 0) {
    await knex("sessions").whereIn("sid", SESSION_IDS).delete();
  }
  for (const fixture of FIXTURES) {
    await cleanupProfile(fixture).catch(() => {});
  }
  await knex.destroy();
});

describe("GET/PUT /api/talent/availability", () => {
  test("requires auth", async () => {
    const res = await request(app)
      .get("/api/talent/availability")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
  });

  test("an AGENCY-role session is forbidden (role isolation)", async () => {
    const fixture = await makeProfile();
    fixture.role = "AGENCY";
    const res = await withSession(
      fixture,
      request(app).get("/api/talent/availability").set("Accept", "application/json"),
    );
    expect(res.status).toBe(403);
  });

  test("defaults to available, unlocked for an adult profile", async () => {
    const fixture = await makeProfile();
    const res = await withSession(fixture, request(app).get("/api/talent/availability"));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "available", locked: false });
  });

  test("PUT updates the status", async () => {
    const fixture = await makeProfile();
    const put = await withSession(
      fixture,
      request(app).put("/api/talent/availability").send({ status: "limited" }),
    );
    expect(put.status).toBe(200);
    expect(put.body.data.status).toBe("limited");

    const get = await withSession(fixture, request(app).get("/api/talent/availability"));
    expect(get.body.data.status).toBe("limited");
  });

  test("PUT rejects an unknown status", async () => {
    const fixture = await makeProfile();
    const res = await withSession(
      fixture,
      request(app).put("/api/talent/availability").send({ status: "on-vacation" }),
    );
    expect(res.status).toBe(400);
  });

  test("a minor without guardian consent is locked", async () => {
    const fixture = await makeProfile({ dob: MINOR_DOB });
    const get = await withSession(fixture, request(app).get("/api/talent/availability"));
    expect(get.status).toBe(200);
    expect(get.body.data.locked).toBe(true);

    const put = await withSession(
      fixture,
      request(app).put("/api/talent/availability").send({ status: "unavailable" }),
    );
    expect(put.status).toBe(403);
  });

  test("a minor WITH guardian consent is unlocked", async () => {
    const fixture = await makeProfile({ dob: MINOR_DOB, guardianConsentAt: true });
    const get = await withSession(fixture, request(app).get("/api/talent/availability"));
    expect(get.body.data.locked).toBe(false);

    const put = await withSession(
      fixture,
      request(app).put("/api/talent/availability").send({ status: "limited" }),
    );
    expect(put.status).toBe(200);
  });

  test("fails closed when no DOB is on file at all", async () => {
    const fixture = await makeProfile({ dob: null });
    const get = await withSession(fixture, request(app).get("/api/talent/availability"));
    expect(get.body.data.locked).toBe(true);
  });
});

describe("GET/POST/DELETE /api/talent/bookouts", () => {
  test("requires auth", async () => {
    const res = await request(app)
      .get("/api/talent/bookouts")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
  });

  test("create, list, and delete a bookout", async () => {
    const fixture = await makeProfile();
    const startsOn = isoDaysFromNow(2);
    const endsOn = isoDaysFromNow(5);

    const created = await withSession(
      fixture,
      request(app)
        .post("/api/talent/bookouts")
        .send({ starts_on: startsOn, ends_on: endsOn, note: "On a shoot" }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.bookout.starts_on).toBe(startsOn);
    expect(created.body.data.bookout.ends_on).toBe(endsOn);
    expect(created.body.data.bookout.note).toBe("On a shoot");
    const bookoutId = created.body.data.bookout.id;

    const list = await withSession(fixture, request(app).get("/api/talent/bookouts"));
    expect(list.status).toBe(200);
    expect(list.body.data.bookouts.some((b) => b.id === bookoutId)).toBe(true);
    expect(list.body.data.locked).toBe(false);

    const del = await withSession(
      fixture,
      request(app).delete(`/api/talent/bookouts/${bookoutId}`),
    );
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const listAfter = await withSession(fixture, request(app).get("/api/talent/bookouts"));
    expect(listAfter.body.data.bookouts.some((b) => b.id === bookoutId)).toBe(false);
  });

  test("a range spanning today (starting in the past) is allowed", async () => {
    const fixture = await makeProfile();
    const startsOn = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const endsOn = isoDaysFromNow(1);

    const res = await withSession(
      fixture,
      request(app).post("/api/talent/bookouts").send({ starts_on: startsOn, ends_on: endsOn }),
    );
    expect(res.status).toBe(201);
  });

  test("rejects a range that has already fully elapsed", async () => {
    const fixture = await makeProfile();
    const startsOn = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const endsOn = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

    const res = await withSession(
      fixture,
      request(app).post("/api/talent/bookouts").send({ starts_on: startsOn, ends_on: endsOn }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects starts_on after ends_on", async () => {
    const fixture = await makeProfile();
    const res = await withSession(
      fixture,
      request(app)
        .post("/api/talent/bookouts")
        .send({ starts_on: isoDaysFromNow(10), ends_on: isoDaysFromNow(2) }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects a note over 200 characters", async () => {
    const fixture = await makeProfile();
    const res = await withSession(
      fixture,
      request(app).post("/api/talent/bookouts").send({
        starts_on: isoDaysFromNow(1),
        ends_on: isoDaysFromNow(2),
        note: "x".repeat(201),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("cannot delete another talent's bookout (scoped by session profile)", async () => {
    const owner = await makeProfile();
    const intruder = await makeProfile();

    const created = await withSession(
      owner,
      request(app)
        .post("/api/talent/bookouts")
        .send({ starts_on: isoDaysFromNow(1), ends_on: isoDaysFromNow(3) }),
    );
    const bookoutId = created.body.data.bookout.id;

    const attempt = await withSession(
      intruder,
      request(app).delete(`/api/talent/bookouts/${bookoutId}`),
    );
    expect(attempt.status).toBe(404);

    // Still there for the real owner.
    const list = await withSession(owner, request(app).get("/api/talent/bookouts"));
    expect(list.body.data.bookouts.some((b) => b.id === bookoutId)).toBe(true);
  });

  test("a locked minor cannot create a bookout", async () => {
    const fixture = await makeProfile({ dob: MINOR_DOB });
    const res = await withSession(
      fixture,
      request(app)
        .post("/api/talent/bookouts")
        .send({ starts_on: isoDaysFromNow(1), ends_on: isoDaysFromNow(2) }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/talent/measurements/still-accurate", () => {
  test("requires auth", async () => {
    const res = await request(app)
      .post("/api/talent/measurements/still-accurate")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
  });

  test("touches measurements_updated_at to now", async () => {
    const stale = isoDaysAgo(120);
    const fixture = await makeProfile({ measurementsUpdatedAt: stale });

    const res = await withSession(
      fixture,
      request(app).post("/api/talent/measurements/still-accurate"),
    );
    expect(res.status).toBe(200);
    const updated = new Date(res.body.data.measurements_updated_at).getTime();
    expect(updated).toBeGreaterThan(Date.now() - 60_000);

    const row = await knex("profiles").where({ id: fixture.profileId }).first();
    expect(new Date(row.measurements_updated_at).getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  test("rejects when no measurements are on file yet", async () => {
    const fixture = await makeProfile();
    const res = await withSession(
      fixture,
      request(app).post("/api/talent/measurements/still-accurate"),
    );
    expect(res.status).toBe(400);
  });

  test("a locked minor is forbidden", async () => {
    const fixture = await makeProfile({ dob: MINOR_DOB, measurementsUpdatedAt: isoDaysAgo(120) });
    const res = await withSession(
      fixture,
      request(app).post("/api/talent/measurements/still-accurate"),
    );
    expect(res.status).toBe(403);
  });
});
