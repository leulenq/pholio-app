// tests/talent/intel.test.js
// Intel (Placement) backend, plus capture v2 integrity and share links.
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

describe("GET /api/talent/intel (Placement)", () => {
  let saved;
  let apps;

  beforeAll(async () => {
    saved = await knex("profiles").where({ id: PROFILE.id }).first();
    apps = await knex("applications").where({ profile_id: PROFILE.id }).select("*");
  });

  afterEach(async () => {
    await knex("profiles").where({ id: PROFILE.id }).update({
      height_cm: saved.height_cm,
      gender: saved.gender,
      date_of_birth: saved.date_of_birth,
    });
    await knex("profile_booking_lanes").where({ profile_id: PROFILE.id }).delete();
    for (const app of apps) {
      await knex("applications").where({ id: app.id }).update({
        status: app.status,
        decline_reason: app.decline_reason ?? null,
        status_changed_at: app.status_changed_at ?? null,
        updated_at: app.updated_at,
      });
    }
  });

  async function read() {
    const res = await withTalentSession(request(app).get("/api/talent/intel"));
    expect(res.status).toBe(200);
    return res.body.data;
  }

  test("returns filing, shots, agencies and calendar", async () => {
    const data = await read();
    for (const key of ["meta", "filing", "digitals", "shots", "agencies", "calendar"]) {
      expect(data).toHaveProperty(key);
    }
    expect(data.meta.restricted).toBeNull();
    expect(data.calendar.days).toBe(182);
  });

  test("files on stats against typical board ranges, and says when a declared board sits outside", async () => {
    await knex("profiles").where({ id: PROFILE.id }).update({ height_cm: 168, gender: "Female" });
    await knex("profile_booking_lanes").insert({ profile_id: PROFILE.id, lane_slug: "runway" });
    const { filing } = await read();
    expect(filing.facts.heightCm).toBe(168);
    expect(filing.filed).toContain("petite");
    expect(filing.filed).not.toContain("editorial");
    expect(filing.declaredOutside).toEqual(["runway"]);
    expect(filing.fashionOutside).toEqual(["editorial"]);
    const runway = filing.boards.find((b) => b.slug === "runway");
    expect(runway).toEqual(expect.objectContaining({ state: "below", range: [175, 183], declared: true }));
  });

  test("open boards are only filed when the talent declares them", async () => {
    await knex("profile_booking_lanes").insert({ profile_id: PROFILE.id, lane_slug: "commercial" });
    const { filing } = await read();
    expect(filing.filed).toContain("commercial");
    expect(filing.filed).not.toContain("lifestyle");
  });

  test("a pass for a board-full reason comes back later, with a date", async () => {
    const target = apps[0];
    const decided = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await knex("applications").where({ id: target.id }).update({
      status: "passed",
      decline_reason: "board_full",
      status_changed_at: decided,
      updated_at: decided,
    });
    const { agencies } = await read();
    const entry = agencies.find((a) => a.history?.applicationId === target.id);
    expect(entry.group).toBe("later");
    expect(entry.history.again).toBe("later");
    expect(new Date(entry.history.againOn).getTime()).toBeGreaterThan(Date.now() + 100 * 86_400_000);
  });

  test("an agency that said another market suits the talent is not suggested again", async () => {
    const target = apps[0];
    await knex("applications").where({ id: target.id }).update({ status: "passed", decline_reason: "market" });
    const { agencies } = await read();
    const entry = agencies.find((a) => a.history?.applicationId === target.id);
    expect(entry.group).toBe("not_now");
    expect(entry.history.again).toBe("never");
  });

  test("an open submission is waiting, with its closing date", async () => {
    const target = apps[0];
    await knex("applications").where({ id: target.id }).update({ status: "submitted", status_changed_at: new Date().toISOString() });
    const { agencies } = await read();
    const entry = agencies.find((a) => a.history?.applicationId === target.id);
    expect(entry.group).toBe("waiting");
    expect(entry.history.closesAt).toBeTruthy();
  });

  test("no scores, percentages or odds anywhere in the payload", async () => {
    const json = JSON.stringify(await read());
    expect(json).not.toMatch(/"score"|"percent|"odds"|"chance"/i);
  });

  test("under-18 profiles get no placement plan", async () => {
    const dob = new Date(Date.now() - 16 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    await knex("profiles").where({ id: PROFILE.id }).update({ date_of_birth: dob });
    const data = await read();
    expect(data.meta.restricted).toBe("minor");
    expect(data).not.toHaveProperty("agencies");
    expect(data).not.toHaveProperty("filing");
  });

  test("requires auth", async () => {
    const res = await request(app)
      .get("/api/talent/intel")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
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

  test("image beacon validates image ownership and records an observed open", async () => {
    const image = await knex("images")
      .where({ profile_id: PROFILE.id })
      .first();
    const bad = await request(app)
      .post(`/portfolio/${PROFILE.slug}/event`)
      .send({ eventType: "image_open", imageId: uuidv4() });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post(`/portfolio/${PROFILE.slug}/event`)
      .send({ eventType: "image_open", imageId: image.id });
    expect(ok.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const row = await knex("profile_events")
      .where({ profile_id: PROFILE.id, action: "image_open" })
      .first();
    expect(row).toBeTruthy();
    expect(row.image_id).toBe(image.id);
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

    // Anonymous open through a share link proves only shared-link provenance.
    const open = await request(app).get(
      `/portfolio/${PROFILE.slug}?st=${token.token}`,
    );
    expect(open.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));

    const events = await knex("profile_events")
      .where({ profile_id: PROFILE.id, share_token_id: token.id })
      .select("action", "viewer_class");
    expect(events.some((e) => e.action === "link_open")).toBe(true);
    expect(events.every((e) => e.viewer_class === "shared")).toBe(true);

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
