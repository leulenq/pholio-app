// tests/talent/intel.test.js
// Intel page backend: composed payload, tier gating, capture v2 integrity.
"use strict";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

// This suite exercises real application queries, so it needs the real
// schema and the seeded talent. It gets its own database: the shared run
// database is hand-built by other suites and cannot be migrated safely.
// Must run before knex loads.
const {
  useIsolatedDatabase,
  migrateAndSeed,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("talent-intel");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;

let TALENT_USER_ID;
let PROFILE;
const SESSION_IDS = [];

beforeAll(async () => {
  await migrateAndSeed(knex);

  const user = await knex("users")
    .where({ email: "talent@example.com" })
    .first();
  if (!user) {
    throw new Error(
      "talent@example.com not found in DB — run `npm run seed` first",
    );
  }
  TALENT_USER_ID = user.id;
  PROFILE = await knex("profiles").where({ user_id: user.id }).first();
}, 30000);

afterAll(async () => {
  if (SESSION_IDS.length > 0) {
    await knex("sessions").whereIn("sid", SESSION_IDS).delete();
  }
  await knex("profile_events").where({ profile_id: PROFILE.id }).delete();
  await knex("share_tokens").where({ profile_id: PROFILE.id }).delete();
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

async function withTalentSession(req) {
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
    userId: TALENT_USER_ID,
    role: "TALENT",
  };
  await knex("sessions").insert({
    sid,
    sess: sessData,
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  const signed = "s:" + cookieSig.sign(sid, SESSION_SECRET);
  return req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
}

describe("GET /api/talent/intel", () => {
  test("returns the composed payload with every zone key", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    for (const key of [
      "meta",
      "pulse",
      "seismograph",
      "rhythm",
      "markets",
      "sources",
      "pipeline",
      "book",
      "lens",
      "trajectory",
    ]) {
      expect(data).toHaveProperty(key);
    }
    expect(data.meta.tier).toBe("studio");
    expect(data.meta.days).toBe(30);
    expect(data.meta.maxDays).toBe(90);
  });

  test("Signal Spectrum has the five tiers in signal-hierarchy order", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { spectrum } = res.body.data.pulse;
    expect(spectrum).toHaveLength(5);
    expect(spectrum.map((s) => s.tier)).toEqual([1, 2, 3, 4, 5]);
    for (const seg of spectrum) {
      expect(Number.isFinite(seg.count)).toBe(true);
      expect(seg.count).toBeGreaterThanOrEqual(0);
    }
  });

  test("seismograph covers the full requested window, one entry per day", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { days } = res.body.data.seismograph;
    expect(days).toHaveLength(30);
    for (const d of days) {
      expect(d).toHaveProperty("qualified");
      expect(d).toHaveProperty("pulls");
      expect(d).toHaveProperty("opens");
      expect(d).toHaveProperty("annotations");
    }
  });

  test("pipeline reads the real submissions ledger with kept-on-file framing", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=90"),
    );
    const { pipeline } = res.body.data;
    expect(pipeline.lifetime.entered).toBeGreaterThan(0);
    expect(pipeline).toHaveProperty("keptOnFile.count");
    expect(pipeline).toHaveProperty("keptOnFile.agencies");
    expect(pipeline).toHaveProperty("stageClock");
  });

  test("trajectory band never fakes benchmarks — calibrating until honest", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { trajectory } = res.body.data;
    expect(trajectory.band).toBeNull();
    expect(trajectory.bandState).toBe("calibrating");
    expect(trajectory.weeks.length).toBeGreaterThan(0);
    // Composition is inspectable, never a hidden formula.
    expect(trajectory.weights).toEqual(
      expect.objectContaining({ t1: expect.any(Number) }),
    );
    expect(trajectory.weeks[0]).toHaveProperty("components");
  });

  test("day clamp: requesting more than the tier maximum clamps to it", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=400"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.meta.days).toBe(90);
  });

  test("requires auth", async () => {
    const res = await request(app)
      .get("/api/talent/intel")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/talent/intel/day/:date", () => {
  test("rejects malformed dates", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel/day/not-a-date"),
    );
    expect(res.status).toBe(400);
  });

  test("returns an aggregate micro-ledger with no identities", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await withTalentSession(
      request(app).get(`/api/talent/intel/day/${today}`),
    );
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toHaveProperty("viewerClasses");
    expect(data.viewerClasses).toEqual(
      expect.objectContaining({ agency: expect.any(Number) }),
    );
    // Aggregate only: no per-viewer or per-agency identifiers.
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/user_id|agency_id|ip_address/);
  });
});

describe("Capture v2 — profile_events integrity", () => {
  test("public portfolio view writes a viewer-classed event", async () => {
    await knex("profile_events").where({ profile_id: PROFILE.id }).delete();
    const res = await request(app).get(`/portfolio/${PROFILE.slug}`);
    expect(res.status).toBe(200);
    // Capture is fire-and-forget; give it a beat.
    await new Promise((r) => setTimeout(r, 300));
    const rows = await knex("profile_events")
      .where({ profile_id: PROFILE.id, action: "view" })
      .select("viewer_class", "referrer");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].viewer_class).toBe("public");
  });

  test("owner views are excluded everywhere (self never recorded)", async () => {
    await knex("profile_events").where({ profile_id: PROFILE.id }).delete();
    const res = await withTalentSession(
      request(app).get(`/portfolio/${PROFILE.slug}`),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const rows = await knex("profile_events").where({
      profile_id: PROFILE.id,
    });
    expect(rows).toHaveLength(0);
  });

  test("image beacon validates image ownership and records dwell", async () => {
    const image = await knex("images")
      .where({ profile_id: PROFILE.id })
      .first();
    const bad = await request(app)
      .post(`/portfolio/${PROFILE.slug}/event`)
      .send({ eventType: "image_dwell", imageId: uuidv4(), dwellMs: 4000 });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post(`/portfolio/${PROFILE.slug}/event`)
      .send({ eventType: "image_dwell", imageId: image.id, dwellMs: 4000 });
    expect(ok.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const row = await knex("profile_events")
      .where({ profile_id: PROFILE.id, action: "image_dwell" })
      .first();
    expect(row).toBeTruthy();
    expect(row.image_id).toBe(image.id);
    expect(row.dwell_ms).toBe(4000);
  });
});

describe("Share tokens", () => {
  test("create, open via portfolio, list shows open count, revoke", async () => {
    const created = await withTalentSession(
      request(app)
        .post("/api/talent/intel/share-tokens")
        .send({ label: "Test casting", kind: "portfolio" }),
    );
    expect(created.status).toBe(201);
    const token = created.body.data.token;
    expect(token.url).toContain(`?st=${token.token}`);

    // Anonymous open through the share link classifies as client attention.
    const open = await request(app).get(
      `/portfolio/${PROFILE.slug}?st=${token.token}`,
    );
    expect(open.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));

    const events = await knex("profile_events")
      .where({ profile_id: PROFILE.id, share_token_id: token.id })
      .select("action", "viewer_class");
    expect(events.some((e) => e.action === "link_open")).toBe(true);
    expect(events.every((e) => e.viewer_class === "client")).toBe(true);

    const list = await withTalentSession(
      request(app).get("/api/talent/intel/share-tokens"),
    );
    const listed = list.body.data.tokens.find((t) => t.id === token.id);
    expect(listed.open_count).toBe(1);

    const revoked = await withTalentSession(
      request(app).delete(`/api/talent/intel/share-tokens/${token.id}`),
    );
    expect(revoked.status).toBe(200);
  });
});

describe("Legacy endpoint kills (intel spec §6)", () => {
  test("GET /api/talent/insights is gone", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/insights").set("Accept", "application/json"),
    );
    expect(res.status).toBe(404);
  });

  test("GET /api/talent/cohorts is gone", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/cohorts").set("Accept", "application/json"),
    );
    expect(res.status).toBe(404);
  });

  test("GET /api/talent/analytics no longer fabricates an engagement score", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/analytics"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.engagement).not.toHaveProperty("score");
  });
});
