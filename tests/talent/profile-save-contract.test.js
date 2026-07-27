/**
 * Profile SAVE remediation contract (audit P0-6 / P0-7 / P1-1 / P1-2).
 *
 * Proves the new, secure PUT /api/talent/profile contract:
 *  (a) an adult bio-only save preserves is_public (no consent-driven unpublish);
 *  (b) a DOB change clears is_public + is_discoverable (exposure re-verification);
 *  (c) stored `age` is never written (age is derived from DOB);
 *  (d) measurements_updated_at only changes when a canonical measurement changes;
 *  (e) a stale `expected_updated_at` version token yields 409 (optimistic locking).
 */

const request = require("supertest");
const app = require("../../src/app");
const knex = require("../../src/shared/db/knex");
const { v4: uuidv4 } = require("uuid");

const SESSION_SECRET = require("../../src/config").sessionSecret;

jest.mock("../../src/domains/auth/middleware/require-auth", () => {
  const actual = jest.requireActual(
    "../../src/domains/auth/middleware/require-auth",
  );
  return { ...actual, requireOnboarding: (req, res, next) => next() };
});
jest.mock("../../src/shared/middleware/onboarding-redirect", () => ({
  requireOnboardingComplete: (req, res, next) => next(),
}));
jest.mock("../../src/shared/middleware/require-legal-acceptance", () => ({
  requireTalentLegalAcceptance: () => (req, res, next) => next(),
  requireAgencyLegalAcceptance: () => (req, res, next) => next(),
}));

async function hasColumn(name) {
  return knex.schema.hasColumn("profiles", name);
}

describe("Profile save remediation contract", () => {
  let userId;
  let profileId;
  let authCookie;

  beforeAll(async () => {
    await knex.migrate.latest();

    userId = uuidv4();
    profileId = uuidv4();

    await knex("users").insert({
      id: userId,
      email: `save-contract-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });

    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `save-contract-${userId}`,
      first_name: "Ada",
      last_name: "Adult",
      city: "London",
      phone: "0000000000",
      // Adult DOB already on file so public exposure is legitimately allowed.
      date_of_birth: "1990-01-01",
      is_public: true,
      is_discoverable: true,
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    const sessionId = `test-session-${userId}`;
    const sessData = {
      cookie: { originalMaxAge: 86400000, httpOnly: true, path: "/" },
      userId,
      role: "TALENT",
    };
    await knex("sessions").insert({
      sid: sessionId,
      sess:
        knex.client.config.client === "sqlite3"
          ? JSON.stringify(sessData)
          : sessData,
      expired: new Date(Date.now() + 86400000).toISOString(),
    });

    const signature = require("cookie-signature");
    const signed =
      "s:" +
      signature.sign(sessionId, SESSION_SECRET);
    authCookie = [`connect.sid=${encodeURIComponent(signed)}; Path=/; HttpOnly`];
  });

  afterAll(async () => {
    await knex("profiles").where({ id: profileId }).del();
    if (knex.client.config.client === "sqlite3") {
      await knex("sessions").where("sess", "like", `%${userId}%`).del();
    } else {
      await knex("sessions").whereRaw(`sess::text LIKE '%${userId}%'`).del();
    }
    await knex("users").where({ id: userId }).del();
    await knex.destroy();
  });

  const put = (body) =>
    request(app).put("/api/talent/profile").set("Cookie", authCookie).send(body);
  const get = () =>
    request(app).get("/api/talent/profile").set("Cookie", authCookie);

  test("(a) adult bio-only save preserves is_public", async () => {
    await knex("profiles").where({ id: profileId }).update({ is_public: true });

    const bio = "A fresh professional bio for the ledger.";
    const res = await put({ bio });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.bio_raw).toBe(bio);

    const row = await knex("profiles").where({ id: profileId }).first();
    expect(!!row.is_public).toBe(true);
    expect(row.bio_raw).toBe(bio);

    const reloaded = await get();
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.data.profile.bio_raw).toBe(bio);
  });

  test("(c) stored age is never written on save", async () => {
    if (!(await hasColumn("age"))) return; // column may not exist in all schemas
    await knex("profiles").where({ id: profileId }).update({ age: null });

    // Even if a client tries to smuggle `age`, it is stripped + never persisted.
    const res = await put({ city: "Paris", age: 99 });
    expect(res.status).toBe(200);

    const row = await knex("profiles").where({ id: profileId }).first();
    expect(row.age == null).toBe(true);
    // And the response never surfaces a stored age column.
    const profile = res.body.data?.profile || res.body.profile;
    expect(profile.age).toBeUndefined();
  });

  test("(d) measurements_updated_at only changes when a measurement changes", async () => {
    // Seed a known measurement + timestamp.
    await put({ height_cm: 170 });
    let row = await knex("profiles").where({ id: profileId }).first();
    const stamp1 = row.measurements_updated_at;
    expect(stamp1).toBeTruthy();

    // Non-measurement edit: stamp must NOT move.
    await new Promise((r) => setTimeout(r, 1100));
    await put({ bio: "Only the bio moved this time." });
    row = await knex("profiles").where({ id: profileId }).first();
    expect(new Date(row.measurements_updated_at).getTime()).toBe(
      new Date(stamp1).getTime(),
    );

    // Same measurement value re-sent: still no change.
    await put({ height_cm: 170 });
    row = await knex("profiles").where({ id: profileId }).first();
    expect(new Date(row.measurements_updated_at).getTime()).toBe(
      new Date(stamp1).getTime(),
    );

    // Real measurement change: stamp advances.
    await put({ height_cm: 172 });
    row = await knex("profiles").where({ id: profileId }).first();
    expect(new Date(row.measurements_updated_at).getTime()).toBeGreaterThan(
      new Date(stamp1).getTime(),
    );
  });

  test("(e) a stale expected_updated_at yields 409", async () => {
    const stale = await put({
      bio: "Written from a stale tab.",
      expected_updated_at: "1999-01-01T00:00:00.000Z",
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_PROFILE_VERSION");

    // With no token (safe fallback) the save proceeds.
    const ok = await put({ bio: "Written after reloading." });
    expect(ok.status).toBe(200);
  });

  test("(b) DOB change clears is_public and is_discoverable", async () => {
    await knex("profiles")
      .where({ id: profileId })
      .update({ is_public: true, is_discoverable: true });

    const res = await put({ date_of_birth: "1992-06-15" });
    expect(res.status).toBe(200);

    const row = await knex("profiles").where({ id: profileId }).first();
    expect(!!row.is_public).toBe(false);
    expect(!!row.is_discoverable).toBe(false);
  });

  test("identity name save persists on profile and users, and GET falls back", async () => {
    const hasUserFirst = await knex.schema.hasColumn("users", "first_name");
    const hasUserLast = await knex.schema.hasColumn("users", "last_name");

    // Clear book identity (empty string — SQLite profiles.first_name is NOT NULL).
    await knex("profiles").where({ id: profileId }).update({
      first_name: "",
      last_name: "",
    });
    if (hasUserFirst || hasUserLast) {
      const userPatch = {};
      if (hasUserFirst) userPatch.first_name = "Account";
      if (hasUserLast) userPatch.last_name = "Only";
      await knex("users").where({ id: userId }).update(userPatch);
    }

    const before = await get();
    expect(before.status).toBe(200);
    // GET should surface account-layer names when the profile row is blank.
    if (hasUserFirst) {
      expect(before.body.data.profile.first_name).toBe("Account");
    }
    if (hasUserLast) {
      expect(before.body.data.profile.last_name).toBe("Only");
    }

    const res = await put({ first_name: "Nova", last_name: "Lane" });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.first_name).toBe("Nova");
    expect(res.body.data.profile.last_name).toBe("Lane");

    const profileRow = await knex("profiles").where({ id: profileId }).first();
    expect(profileRow.first_name).toBe("Nova");
    expect(profileRow.last_name).toBe("Lane");

    if (hasUserFirst || hasUserLast) {
      const userRow = await knex("users").where({ id: userId }).first();
      if (hasUserFirst) expect(userRow.first_name).toBe("Nova");
      if (hasUserLast) expect(userRow.last_name).toBe("Lane");
    }

    const reloaded = await get();
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.data.profile.first_name).toBe("Nova");
    expect(reloaded.body.data.profile.last_name).toBe("Lane");
  });
});
