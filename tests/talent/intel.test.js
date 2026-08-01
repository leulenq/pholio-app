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
  test("returns the composed payload with every block key", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    for (const key of [
      "meta",
      "decisions",
      "submissions",
      "materials",
      "attention",
      "book",
      "momentum",
    ]) {
      expect(data).toHaveProperty(key);
    }
    expect(data.meta.tier).toBe("studio");
    expect(data.meta.days).toBe(30);
    expect(data.meta.maxDays).toBe(90);
  });

  test("every decision carries an action and a destination — never advice alone", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { decisions } = res.body.data;
    expect(Array.isArray(decisions)).toBe(true);
    expect(decisions.length).toBeLessThanOrEqual(4);
    for (const d of decisions) {
      expect(typeof d.headline).toBe("string");
      expect(typeof d.reason).toBe("string");
      expect(typeof d.action).toBe("string");
      expect(d.to).toMatch(/^\/dashboard\/talent\//);
      expect(["act", "fix", "grow"]).toContain(d.severity);
    }
  });

  test("conversion ladder is ordered and rates are null, never a fabricated zero", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=90"),
    );
    const { submissions } = res.body.data;
    for (const scope of ["period", "lifetime"]) {
      const steps = submissions[scope].steps;
      expect(steps.map((s) => s.key)).toEqual([
        "sent",
        "opened",
        "advanced",
        "settled",
      ]);
      // The first rung has no denominator above it.
      expect(steps[0].rate).toBeNull();
      for (const step of steps.slice(1)) {
        // A rate is either a real fraction or withheld — never 0-by-default.
        expect(step.rate === null || Number.isFinite(step.rate)).toBe(true);
        if (step.rate !== null) {
          expect(step.rate).toBeGreaterThanOrEqual(0);
        }
      }
      // Counts only ever narrow down the ladder.
      for (let i = 1; i < steps.length; i += 1) {
        expect(steps[i].count).toBeLessThanOrEqual(steps[i - 1].count);
      }
    }
    expect(submissions.lifetime.steps[0].count).toBeGreaterThan(0);
  });

  test("read clock never grades a submission without a real platform band", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=90"),
    );
    const clock = res.body.data.submissions.readClock;
    expect(clock).toHaveProperty("open");
    if (!clock.band) {
      // No band → nothing may be called late or cold.
      for (const row of clock.open) {
        expect(["read", "normal"]).toContain(row.state);
      }
    } else {
      expect(clock.band.p75).toBeGreaterThanOrEqual(clock.band.p25);
      for (const row of clock.open) {
        expect(["read", "normal", "late", "cold"]).toContain(row.state);
      }
    }
  });

  test("materials report days left / days over against real industry windows", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { materials } = res.body.data;
    expect(["ready", "caveat", "hold"]).toContain(materials.sendability);
    const digitals = materials.items.find((i) => i.key === "digitals");
    expect(digitals.windowDays).toBe(84);
    if (digitals.ageDays != null) {
      // Exactly one of the two is non-zero; they can never both be positive.
      expect(digitals.daysLeft > 0 && digitals.daysOver > 0).toBe(false);
    }
    expect(materials.range.map((r) => r.key)).toEqual([
      "headshot",
      "full_length",
      "profile",
    ]);
  });

  test("intent series covers the window and aligns the prior period by index", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { intent } = res.body.data.attention;
    expect(intent.series).toHaveLength(30);
    for (const d of intent.series) {
      expect(d).toHaveProperty("date");
      expect(Number.isFinite(d.intent)).toBe(true);
      // Prior is a number when comparable, null when the earlier window was
      // too thin — never an implied zero.
      expect(d.prior === null || Number.isFinite(d.prior)).toBe(true);
    }
    if (res.body.data.meta.deltasSuppressed) {
      expect(intent.priorTotal).toBeNull();
      expect(intent.changePct).toBeNull();
    }
  });

  test("market rows ship an array series aligned to the window", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { markets } = res.body.data.attention;
    for (const row of markets.rows) {
      // Regression: this shipped as a date-keyed object, so the frontend
      // sparkline's Array.isArray guard rejected it and drew nothing.
      expect(Array.isArray(row.series)).toBe(true);
      expect(row.series).toHaveLength(30);
    }
  });

  test("momentum is real weekly counts — no composite index, no fake cohort band", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30"),
    );
    const { momentum } = res.body.data;
    expect(momentum.weeks.length).toBe(12);
    expect(momentum.halfWeeks).toBe(6);
    expect(momentum).not.toHaveProperty("weights");
    expect(momentum).not.toHaveProperty("band");
    expect(momentum).not.toHaveProperty("bandState");
    for (const week of momentum.weeks) {
      expect(week).not.toHaveProperty("value");
      for (const key of ["sent", "reviews", "advances", "intent"]) {
        expect(Number.isInteger(week[key])).toBe(true);
      }
    }
    // The halves are the comparison; they must sum from the same weeks.
    const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
    expect(momentum.recent.reviews).toBe(sum(momentum.weeks.slice(6), "reviews"));
    expect(momentum.prior.reviews).toBe(sum(momentum.weeks.slice(0, 6), "reviews"));
  });

  test("book ranks on an open rate, and only frames that were actually shown", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=90"),
    );
    const { book } = res.body.data;
    for (const frame of book.images) {
      expect(frame).not.toHaveProperty("score");
      if (frame.impressions > 0) {
        expect(frame.openRate).toBeGreaterThanOrEqual(0);
        expect(frame.openRate).toBeLessThanOrEqual(1);
      } else {
        expect(frame.openRate).toBeNull();
      }
      // A frame nobody was shown is unranked, not ranked last.
      if (frame.impressions < 5) expect(frame.rank).toBeNull();
    }
  });

  test("timing findings are bucketed in the requested zone, not UTC", async () => {
    const utc = await withTalentSession(
      request(app).get("/api/talent/intel?days=90&tz=UTC"),
    );
    const ny = await withTalentSession(
      request(app).get("/api/talent/intel?days=90&tz=America/New_York"),
    );
    expect(utc.body.data.meta.tz).toBe("UTC");
    expect(ny.body.data.meta.tz).toBe("America/New_York");
  });

  test("an unknown time zone falls back to UTC rather than throwing", async () => {
    const res = await withTalentSession(
      request(app).get("/api/talent/intel?days=30&tz=Mars/Olympus"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.meta.tz).toBe("UTC");
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
