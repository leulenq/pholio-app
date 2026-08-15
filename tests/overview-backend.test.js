// tests/overview-backend.test.js
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
} = require("./setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("overview-backend");

const knex = require("../src/shared/db/knex");
const app = require("../src/app");

const SESSION_SECRET = require("../src/config").sessionSecret;

let TALENT_USER_ID;
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
}, 30000);

afterAll(async () => {
  // Clean up injected test sessions
  if (SESSION_IDS.length > 0) {
    await knex("sessions").whereIn("sid", SESSION_IDS).delete();
  }
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

/**
 * Creates a supertest request with an injected session cookie for a TALENT user.
 * Inserts a session row directly in the DB and sets a signed connect.sid cookie.
 */
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
  const encoded = encodeURIComponent(signed);
  return req.set("Cookie", `connect.sid=${encoded}`);
}

describe("GET /api/talent/summary", () => {
  test("returns changePct as a finite number on views", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/summary"),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { views } = res.body.data;
    expect(typeof views.changePct).toBe("number");
    expect(Number.isFinite(views.changePct)).toBe(true);
  });

  test("returns changePct as a finite number on downloads", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/summary"),
    );
    expect(res.status).toBe(200);
    const { downloads } = res.body.data;
    expect(typeof downloads.changePct).toBe("number");
    expect(Number.isFinite(downloads.changePct)).toBe(true);
  });
});

describe("GET /api/talent/overview", () => {
  test("returns activityStream as an array", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/overview"),
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activityStream)).toBe(true);
  });

  test("overview response has expected shape", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/overview"),
    );
    expect(res.body).toHaveProperty("nextPriority");
    expect(res.body).toHaveProperty("activityStream");
    expect(res.body).not.toHaveProperty("profileStrength");
    expect(res.body).not.toHaveProperty("recommendedAgencies");
  });
});

describe("Demo seed: talent@example.com profile", () => {
  test("profile is Mia Voss with is_pro=true", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/profile"),
    );
    expect(res.status).toBe(200);
    const { profile } = res.body.data;
    expect(profile.first_name).toBe("Mia");
    expect(profile.last_name).toBe("Voss");
    expect(profile.slug).toBe("mia-voss");
    expect(Boolean(profile.is_pro)).toBe(true); // SQLite stores booleans as 1
  });

  test("profile has 6 images", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/profile"),
    );
    expect(res.body.data.images.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Demo seed: applications", () => {
  test("talent@example.com has 7 applications", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/applications"),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(7);
  });

  test("applications include accepted and declined statuses", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/applications"),
    );
    const statuses = res.body.data.map((a) => a.status);
    expect(statuses).toContain("accepted");
    expect(statuses).toContain("declined");
  });
});

describe("Demo seed: analytics", () => {
  test("summary reports > 100 views total for talent@example.com", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/summary"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.views.total).toBeGreaterThan(100);
  });

  test("timeseries returns ~30 data points", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/timeseries?days=30"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(28);
  });

  test("analytics endpoint returns engagement counts with bio_read > 0", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/analytics?days=30"),
    );
    expect(res.status).toBe(200);
    const { engagement } = res.body.data;
    expect(engagement.counts.bio_read).toBeGreaterThan(0);
  });

  test("analytics endpoint returns measured website traffic without comp-card metrics", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/analytics?days=30"),
    );
    expect(res.status).toBe(200);

    const { website } = res.body.data;
    expect(website.status).toBe("connected");
    expect(website.source).toBe("first_party");
    expect(website.period.days).toBe(30);
    expect(website.series).toHaveLength(30);
    expect(website.metrics.visits).toBeGreaterThanOrEqual(0);
    expect(website.metrics.uniqueVisitors).toBeGreaterThanOrEqual(0);
    expect(website.metrics.uniqueVisitors).toBeLessThanOrEqual(
      website.metrics.visits,
    );
    expect(website.metrics.pageViews).toBeGreaterThanOrEqual(0);
    expect(website.metrics.outboundClicks).toBeGreaterThanOrEqual(0);
    expect(
      website.series.reduce((total, point) => total + point.visits, 0),
    ).toBe(website.metrics.visits);
    expect(website.metrics).not.toHaveProperty("downloads");
    expect(["complete", "partial"]).toContain(
      website.measurement.uniqueVisitors,
    );
  });

  test("website analytics counts ISO timestamps in SQLite", async () => {
    const profile = await knex("profiles")
      .where({ user_id: TALENT_USER_ID })
      .first();
    const sessionId = uuidv4();
    const visitorId = uuidv4();
    const viewId = uuidv4();
    const clickId = uuidv4();
    const now = new Date().toISOString();
    const before = await withTalentSession(
      request(app).get("/api/talent/analytics?days=30"),
    );

    try {
      await knex("visitor_sessions").insert({
        id: sessionId,
        profile_id: profile.id,
        visitor_id: visitorId,
        started_at: now,
        last_activity_at: now,
        is_returning: false,
      });
      await knex("analytics").insert([
        {
          id: viewId,
          profile_id: profile.id,
          event_type: "view",
          event_source: "web",
          metadata: JSON.stringify({ slug: profile.slug }),
          created_at: now,
        },
        {
          id: clickId,
          profile_id: profile.id,
          event_type: "social_click",
          event_source: "web",
          metadata: JSON.stringify({ platform: "instagram" }),
          created_at: now,
        },
      ]);

      const after = await withTalentSession(
        request(app).get("/api/talent/analytics?days=30"),
      );

      expect(after.body.data.website.metrics.visits).toBe(
        before.body.data.website.metrics.visits + 1,
      );
      expect(after.body.data.website.metrics.pageViews).toBe(
        before.body.data.website.metrics.pageViews + 1,
      );
      expect(after.body.data.website.metrics.outboundClicks).toBe(
        before.body.data.website.metrics.outboundClicks + 1,
      );
    } finally {
      await knex("analytics").whereIn("id", [viewId, clickId]).delete();
      await knex("visitor_sessions").where({ id: sessionId }).delete();
    }
  });
});

describe("Public portfolio analytics integrity", () => {
  test("signed-in owner engagement is acknowledged but not recorded", async () => {
    const profile = await knex("profiles")
      .where({ user_id: TALENT_USER_ID })
      .first();
    const before = await knex("analytics")
      .where({ profile_id: profile.id, event_type: "social_click" })
      .count({ total: "*" })
      .first();

    const res = await withTalentSession(
      request(app)
        .post(`/portfolio/${profile.slug}/event`)
        .send({ eventType: "social_click", metadata: { platform: "instagram" } }),
    );

    const after = await knex("analytics")
      .where({ profile_id: profile.id, event_type: "social_click" })
      .count({ total: "*" })
      .first();

    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(false);
    expect(Number(after.total)).toBe(Number(before.total));
  });

  test("rejects arbitrary public analytics event names", async () => {
    const profile = await knex("profiles")
      .where({ user_id: TALENT_USER_ID })
      .first();
    const res = await request(app)
      .post(`/portfolio/${profile.slug}/event`)
      .send({ eventType: "download", metadata: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unsupported analytics event");
  });

  test("rejects retired image-attention events", async () => {
    const profile = await knex("profiles")
      .where({ user_id: TALENT_USER_ID })
      .first();
    const res = await request(app)
      .post(`/portfolio/${profile.slug}/event`)
      .send({ eventType: "image_dwell", imageId: "retired", dwellMs: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unsupported analytics event");
  });
});

describe("Demo seed: activities", () => {
  test("activity feed has at least 10 entries", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/activity"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
  });

  test("activities contain multiple types", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/activity"),
    );
    const types = [...new Set(res.body.data.map((a) => a.type))];
    expect(types.length).toBeGreaterThanOrEqual(3);
  });
});
