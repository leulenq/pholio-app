// tests/integration/agency-profile.test.js
"use strict";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-agency-profile.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();

async function ensureAgencyIdentityColumns() {
  if (!(await knex.schema.hasTable("users"))) {
    await knex.schema.createTable("users", (t) => {
      t.string("id", 36).primary();
      t.string("email").notNullable().unique();
      t.string("role").notNullable();
      t.string("first_name", 100).nullable();
      t.string("last_name", 100).nullable();
      t.string("account_status", 50).notNullable().defaultTo("active");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else {
    if (!(await knex.schema.hasColumn("users", "account_status"))) {
      await knex.schema.alterTable("users", (t) => {
        t.string("account_status", 50).notNullable().defaultTo("active");
      });
    }
  }

  if (!(await knex.schema.hasTable("sessions"))) {
    await knex.schema.createTable("sessions", (t) => {
      t.string("sid", 255).primary();
      t.json("sess").notNullable();
      t.timestamp("expired").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("agencies"))) {
    await knex.schema.createTable("agencies", (t) => {
      t.string("id", 36).primary();
      t.string("name").notNullable();
      t.string("location").nullable();
      t.string("website").nullable();
      t.text("description").nullable();
      t.string("instagram_handle", 255).nullable();
      t.string("tiktok_handle", 255).nullable();
      t.string("twitter_handle", 255).nullable();
      t.string("youtube_handle", 255).nullable();
      t.string("video_reel_url", 500).nullable();
      t.string("status").notNullable().defaultTo("ACTIVE");
      t.timestamp("onboarding_completed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  } else {
    const columns = [
      ["location", (t) => t.string("location").nullable()],
      ["website", (t) => t.string("website").nullable()],
      ["description", (t) => t.text("description").nullable()],
      ["instagram_handle", (t) => t.string("instagram_handle", 255).nullable()],
      ["tiktok_handle", (t) => t.string("tiktok_handle", 255).nullable()],
      ["twitter_handle", (t) => t.string("twitter_handle", 255).nullable()],
      ["youtube_handle", (t) => t.string("youtube_handle", 255).nullable()],
      ["video_reel_url", (t) => t.string("video_reel_url", 500).nullable()],
    ];
    for (const [name, add] of columns) {
      if (!(await knex.schema.hasColumn("agencies", name))) {
        await knex.schema.alterTable("agencies", add);
      }
    }
  }

  if (!(await knex.schema.hasTable("agency_memberships"))) {
    await knex.schema.createTable("agency_memberships", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("user_id", 36).notNullable();
      t.string("membership_role").notNullable();
      t.string("status").notNullable().defaultTo("ACTIVE");
      t.timestamp("joined_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("social_accounts"))) {
    await knex.schema.createTable("social_accounts", (t) => {
      t.uuid("id").primary();
      t.uuid("profile_id").nullable();
      t.uuid("agency_id").nullable();
      t.string("platform", 50).notNullable();
      t.string("handle", 255).nullable();
      t.string("url", 500).nullable();
      t.integer("follower_count").nullable();
      t.decimal("engagement_rate", 5, 2).nullable();
      t.boolean("is_oauth_connected").defaultTo(false);
      t.text("oauth_token_encrypted").nullable();
      t.jsonb("metrics_data").nullable();
      t.timestamp("metrics_updated_at").nullable();
      t.timestamps(true, true);
    });
  }
}

async function seedFixture() {
  for (const table of ["agency_memberships", "sessions", "agencies", "users", "social_accounts"]) {
    if (await knex.schema.hasTable(table)) await knex(table).del();
  }

  await knex("users").insert({
    id: OWNER_USER_ID,
    email: "owner@profile.test",
    role: "AGENCY",
    first_name: "Before",
    last_name: "Owner",
  });

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Before Agency",
    location: "London",
    description: "Old description",
    status: "ACTIVE",
    onboarding_completed_at: new Date().toISOString(),
  });

  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: OWNER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
    joined_at: knex.fn.now(),
  });
}

async function withOwnerSession(req) {
  const sid = uuidv4();
  const sessionData = {
    cookie: { path: "/", httpOnly: true, secure: false },
    userId: AGENCY_ID,
    memberUserId: OWNER_USER_ID,
    agencyId: AGENCY_ID,
    agencyMembershipId: MEMBERSHIP_ID,
    agencyMembershipRole: "OWNER",
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };

  await knex("sessions").insert({
    sid,
    sess: JSON.stringify(sessionData),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });

  const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
  return req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
}

beforeAll(async () => {
  await ensureAgencyIdentityColumns();
  await seedFixture();
}, 30000);

afterAll(async () => {
  await knex.destroy();
});

describe("agency identity profile persistence", () => {
  const payload = {
    first_name: "Sarah",
    last_name: "Chen",
    agency_name: "Sterling Model Management",
    agency_location: "New York, NY",
    agency_description: "Editorial and commercial representation.",
    agency_instagram_handle: "https://instagram.com/sterlingmgmt",
    agency_tiktok_handle: "https://tiktok.com/@sterlingmgmt",
    agency_twitter_handle: "https://x.com/sterlingmgmt",
    agency_youtube_handle: "https://youtube.com/c/sterlingmgmt",
  };

  test("PUT /api/agency/profile persists all identity fields to users + agencies", async () => {
    const putRes = await withOwnerSession(
      request(app).put("/api/agency/profile").send(payload),
    );

    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);

    const user = await knex("users").where({ id: OWNER_USER_ID }).first();
    expect(user.first_name).toBe("Sarah");
    expect(user.last_name).toBe("Chen");

    const agency = await knex("agencies").where({ id: AGENCY_ID }).first();
    expect(agency.name).toBe("Sterling Model Management");
    expect(agency.location).toBe("New York, NY");
    expect(agency.description).toBe("Editorial and commercial representation.");

    const socials = await knex("social_accounts").where({ agency_id: AGENCY_ID });
    const getSocial = (platform) => socials.find(s => s.platform === platform);

    expect(getSocial("instagram").url).toBe("https://instagram.com/sterlingmgmt");
    expect(getSocial("tiktok").url).toBe("https://tiktok.com/@sterlingmgmt");
    expect(getSocial("twitter").url).toBe("https://x.com/sterlingmgmt");
    expect(getSocial("youtube").url).toBe("https://youtube.com/c/sterlingmgmt");
  });

  test("GET /api/agency/me returns saved identity fields to the frontend", async () => {
    const getRes = await withOwnerSession(request(app).get("/api/agency/me"));

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);

    const data = getRes.body.data;
    expect(data.first_name).toBe("Sarah");
    expect(data.last_name).toBe("Chen");
    expect(data.agency_name).toBe("Sterling Model Management");
    expect(data.agency_location).toBe("New York, NY");
    expect(data.agency_description).toBe(
      "Editorial and commercial representation.",
    );
    expect(data.agency_instagram_handle).toBe(
      "https://instagram.com/sterlingmgmt",
    );
    expect(data.agency_tiktok_handle).toBe("https://tiktok.com/@sterlingmgmt");
    expect(data.agency_twitter_handle).toBe("https://x.com/sterlingmgmt");
    expect(data.agency_youtube_handle).toBe(
      "https://youtube.com/c/sterlingmgmt",
    );
  });

  test("PUT /api/agency/profile clears social handles when null is sent", async () => {
    const clearRes = await withOwnerSession(
      request(app)
        .put("/api/agency/profile")
        .send({
          ...payload,
          agency_instagram_handle: null,
          agency_tiktok_handle: null,
        }),
    );

    expect(clearRes.status).toBe(200);

    const socials = await knex("social_accounts").where({ agency_id: AGENCY_ID });
    const getSocial = (platform) => socials.find(s => s.platform === platform);

    expect(getSocial("instagram")).toBeUndefined();
    expect(getSocial("tiktok")).toBeUndefined();
    expect(getSocial("twitter").url).toBe("https://x.com/sterlingmgmt");
  });
});
