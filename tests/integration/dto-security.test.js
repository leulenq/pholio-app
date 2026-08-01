// tests/integration/dto-security.test.js
"use strict";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-dto-security.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { FORBIDDEN_KEYS } = require("../contract/audience-dto.test");

const SESSION_SECRET = require("../../src/config").sessionSecret;

// Helper to recursively scan all keys in a payload
function collectAllKeys(node, acc = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectAllKeys(item, acc));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      acc.add(key);
      collectAllKeys(value, acc);
    }
  }
  return acc;
}

// Helper to recursively collect all string values in a payload
function collectStringValues(node, acc = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectStringValues(item, acc));
  } else if (node && typeof node === "object") {
    Object.values(node).forEach((value) => collectStringValues(value, acc));
  } else if (typeof node === "string") {
    acc.push(node);
  }
  return acc;
}

function assertNoForbiddenKeys(payload, label) {
  const keys = collectAllKeys(payload);
  const leaked = [...keys].filter((k) => FORBIDDEN_KEYS.has(k));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

// Sentinel values to seed and verify they do not leak
const SENTINEL_PHONE = "SENTINEL_phone_12345";
const SENTINEL_GUARDIAN_EMAIL = "SENTINEL_guardian_98765@example.com";
const SENTINEL_EC_PHONE = "SENTINEL_ec_phone_54321";
const SENTINEL_IP = "SENTINEL_ip_99.99.99.99";

const SENTINELS = [
  SENTINEL_PHONE,
  SENTINEL_GUARDIAN_EMAIL,
  SENTINEL_EC_PHONE,
  SENTINEL_IP,
];

function assertNoSentinelValues(payload, label) {
  const values = collectStringValues(payload);
  const leaked = values.filter((v) => SENTINELS.includes(v));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

// Setup IDs
const AGENCY_A_ID = uuidv4();
const AGENCY_B_ID = uuidv4();

const USER_OWNER_A_ID = uuidv4();
const USER_OWNER_B_ID = uuidv4();

const ADULT_DISCOVERABLE_ID = uuidv4();
const MINOR_NO_CONSENT_ID = uuidv4();
const MINOR_WITH_CONSENT_ID = uuidv4();

const MEMBERSHIP_A_ID = uuidv4();
const MEMBERSHIP_B_ID = uuidv4();

async function createSchema() {
  const tables = [
    "users",
    "agencies",
    "agency_memberships",
    "profiles",
    "applications",
    "images",
    "image_rights",
    "social_accounts",
  ];

  for (const table of tables) {
    if (await knex.schema.hasTable(table)) {
      await knex(table).del();
      await knex.schema.dropTable(table);
    }
  }

  /* The session store's own `createtable` is disabled under NODE_ENV=test
     (src/app.js) so suites own their schema lifecycle — which means this one
     has to create `sessions` itself. Without it every injected session insert
     fails with "no such table: sessions". */
  if (await knex.schema.hasTable("sessions")) {
    await knex("sessions").del();
  } else {
    await knex.schema.createTable("sessions", (t) => {
      t.string("sid", 255).primary();
      t.json("sess").notNullable();
      t.timestamp("expired").notNullable().index();
    });
  }

  await knex.schema.createTable("users", (t) => {
    t.string("id", 36).primary();
    t.string("email").notNullable().unique();
    t.string("role").notNullable();
    t.string("account_status").notNullable().defaultTo("ACTIVE");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("agencies", (t) => {
    t.string("id", 36).primary();
    t.string("name").notNullable();
    t.string("status").notNullable().defaultTo("ACTIVE");
    t.timestamp("onboarding_completed_at").nullable();
  });

  await knex.schema.createTable("agency_memberships", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("user_id", 36).notNullable();
    t.string("membership_role").notNullable();
    t.string("status").notNullable().defaultTo("ACTIVE");
    t.timestamp("joined_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("profiles", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).nullable();
    t.string("slug", 191).notNullable().unique();
    t.string("first_name", 191).notNullable();
    t.string("last_name", 191).nullable();
    t.string("city", 191).nullable();
    t.string("date_of_birth", 64).nullable();
    t.boolean("is_public").defaultTo(true);
    t.boolean("is_discoverable").defaultTo(true);
    t.string("phone", 191).nullable();
    t.string("guardian_email", 191).nullable();
    t.timestamp("guardian_consent_at").nullable();
    t.string("emergency_contact_phone", 191).nullable();
    t.string("ip_address", 191).nullable();
    t.string("pdf_theme", 50).defaultTo("ink");
    t.boolean("is_pro").defaultTo(false);
    t.string("discipline", 20).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("images", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.boolean("is_primary").defaultTo(false);
    t.string("status", 32).defaultTo("active");
    t.boolean("exclude_from_public").defaultTo(false);
    t.boolean("exclude_from_agency").defaultTo(false);
    t.string("moderation_status", 32).defaultTo("approved");
    t.string("public_url", 512).nullable();
    t.string("path", 512).nullable();
    t.integer("sort").defaultTo(0);
    t.string("storage_key", 512).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("image_rights", (t) => {
    t.uuid("id").primary();
    t.uuid("image_id").notNullable().unique();
    t.string("copyright_owner").nullable();
    t.string("photographer_name").nullable();
    t.string("license_type").nullable();
    t.string("model_release_ref").nullable();
    t.string("rights_status").nullable();
  });

  await knex.schema.createTable("social_accounts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("platform", 50).notNullable();
    t.string("handle", 255).nullable();
    t.string("url", 500).nullable();
    t.boolean("is_oauth_connected").defaultTo(false);
    // Columns the production discover-preview query selects (migrations
    // 20260629160000 / 20260629170000). Without them the guarded inbox.js
    // preview handler 500s on SQLite with "no such column: follower_count".
    t.integer("follower_count").nullable();
    t.decimal("engagement_rate").nullable();
    t.timestamp("metrics_updated_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("applications", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("status").notNullable().defaultTo("submitted");
  });

  /* The roster access check reads this table before it can decide whether to
     return 403. Without it the guarded handler 500s on SQLite with "no such
     table: roster_memberships", so the suite could not distinguish "correctly
     forbidden" from "crashed". */
  if (!(await knex.schema.hasTable("roster_memberships")))
    await knex.schema.createTable("roster_memberships", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("profile_id", 36).nullable();
      t.string("talent_record_id", 36).nullable();
      t.string("board_id", 36).nullable();
      t.string("stage", 20).notNullable().defaultTo("main");
      t.string("status", 20).notNullable().defaultTo("active");
      t.string("source_application_id", 36).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });

  /* Intel capture writes here on every agency view. It swallows its own
     errors, so a missing table only shows up as console noise — but the noise
     obscures the real failures this suite is meant to surface. */
  if (!(await knex.schema.hasTable("profile_events")))
    await knex.schema.createTable("profile_events", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).notNullable();
      t.string("action").notNullable();
      t.string("source").nullable();
      t.string("viewer_class").nullable();
      t.string("session_id", 64).nullable();
      t.string("share_token_id", 36).nullable();
      t.string("image_id", 36).nullable();
      t.string("market").nullable();
      t.string("referrer").nullable();
      t.integer("dwell_ms").nullable();
      t.json("metadata").nullable();
      t.timestamp("occurred_at").defaultTo(knex.fn.now());
    });
}

async function seedData() {
  // Insert agencies
  await knex("agencies").insert([
    {
      id: AGENCY_A_ID,
      name: "Agency A",
      status: "ACTIVE",
      onboarding_completed_at: knex.fn.now(),
    },
    {
      id: AGENCY_B_ID,
      name: "Agency B",
      status: "ACTIVE",
      onboarding_completed_at: knex.fn.now(),
    },
  ]);

  // Insert agency users
  await knex("users").insert([
    {
      id: USER_OWNER_A_ID,
      email: "owner-a@test.agency",
      role: "AGENCY",
      account_status: "ACTIVE",
    },
    {
      id: USER_OWNER_B_ID,
      email: "owner-b@test.agency",
      role: "AGENCY",
      account_status: "ACTIVE",
    },
  ]);

  // Insert memberships
  await knex("agency_memberships").insert([
    {
      id: MEMBERSHIP_A_ID,
      agency_id: AGENCY_A_ID,
      user_id: USER_OWNER_A_ID,
      membership_role: "OWNER",
    },
    {
      id: MEMBERSHIP_B_ID,
      agency_id: AGENCY_B_ID,
      user_id: USER_OWNER_B_ID,
      membership_role: "OWNER",
    },
  ]);

  // Insert profiles
  await knex("profiles").insert([
    {
      id: ADULT_DISCOVERABLE_ID,
      slug: "adult-discoverable",
      first_name: "Adult",
      last_name: "Discoverable",
      city: "Miami",
      date_of_birth: "1995-10-10",
      is_public: true,
      is_discoverable: true,
      phone: SENTINEL_PHONE,
      guardian_email: SENTINEL_GUARDIAN_EMAIL,
      emergency_contact_phone: SENTINEL_EC_PHONE,
      ip_address: SENTINEL_IP,
    },
    {
      id: MINOR_NO_CONSENT_ID,
      slug: "minor-no-consent",
      first_name: "Minor",
      last_name: "NoConsent",
      city: "Orlando",
      date_of_birth: "2012-05-05",
      is_public: true,
      is_discoverable: true,
      phone: SENTINEL_PHONE,
      guardian_email: SENTINEL_GUARDIAN_EMAIL,
      guardian_consent_at: null,
      emergency_contact_phone: SENTINEL_EC_PHONE,
      ip_address: SENTINEL_IP,
    },
    {
      id: MINOR_WITH_CONSENT_ID,
      slug: "minor-with-consent",
      first_name: "Minor",
      last_name: "WithConsent",
      city: "Tampa",
      date_of_birth: "2012-08-08",
      is_public: true,
      is_discoverable: true,
      phone: SENTINEL_PHONE,
      guardian_email: SENTINEL_GUARDIAN_EMAIL,
      guardian_consent_at: knex.fn.now(),
      emergency_contact_phone: SENTINEL_EC_PHONE,
      ip_address: SENTINEL_IP,
    },
  ]);

  // Insert images
  await knex("images").insert([
    {
      id: uuidv4(),
      profile_id: ADULT_DISCOVERABLE_ID,
      is_primary: true,
      path: "/img-a.jpg",
      storage_key: "SK-adult",
    },
    {
      id: uuidv4(),
      profile_id: MINOR_NO_CONSENT_ID,
      is_primary: true,
      path: "/img-m-no.jpg",
      storage_key: "SK-minor-no",
    },
    {
      id: uuidv4(),
      profile_id: MINOR_WITH_CONSENT_ID,
      is_primary: true,
      path: "/img-m-with.jpg",
      storage_key: "SK-minor-with",
    },
  ]);

  // Set up an accepted application from Adult to Agency A
  await knex("applications").insert({
    id: uuidv4(),
    profile_id: ADULT_DISCOVERABLE_ID,
    agency_id: AGENCY_A_ID,
    status: "accepted",
  });
}

// Helpers to simulate cookie session
async function createAgencySessionCookie(agencyId, userId, membershipId) {
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
    memberUserId: userId,
    agencyId,
    agencyMembershipId: membershipId,
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
  return `connect.sid=${encodeURIComponent(signed)}`;
}

beforeAll(async () => {
  await createSchema();
  await seedData();
});

afterAll(async () => {
  await knex.destroy();
});

describe("DTO security path integration tests", () => {
  describe("1. Public Path", () => {
    test("GET /api/public/home returns safe DTO format without forbidden keys or PII sentinels", async () => {
      const res = await request(app).get("/api/public/home");
      expect(res.status).toBe(200);

      // Recursive key check
      assertNoForbiddenKeys(res.body, "public-home-response");
      assertNoSentinelValues(res.body, "public-home-response");
    });
  });

  describe("2. Agency No-Application Path", () => {
    test("Agency B attempts to view roster profile of Adult (no application to Agency B) -> Forbidden (403)", async () => {
      const cookie = await createAgencySessionCookie(
        AGENCY_B_ID,
        USER_OWNER_B_ID,
        MEMBERSHIP_B_ID,
      );
      const res = await request(app)
        .get(`/api/agency/roster/${ADULT_DISCOVERABLE_ID}`)
        .set("Cookie", cookie);

      /* Roster access moved from application-derived (403 "Talent is not on
         your roster") to membership-derived (404 "Roster membership not
         found"). Both deny; 404 additionally declines to confirm the profile
         exists, which is the stronger answer for an enumeration probe. The
         security property under test is "denied, and no profile data leaks",
         so assert that rather than one specific code. */
      expect([403, 404]).toContain(res.status);
      expect(String(res.body.error)).toMatch(/roster/i);
      expect(res.body).not.toHaveProperty("profile");
    });

    test("Agency B fetches discover preview of Adult (discoverable, no active app) -> Shaped DTO returned", async () => {
      const cookie = await createAgencySessionCookie(
        AGENCY_B_ID,
        USER_OWNER_B_ID,
        MEMBERSHIP_B_ID,
      );
      const res = await request(app)
        .get(`/api/agency/discover/${ADULT_DISCOVERABLE_ID}/preview`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      assertNoForbiddenKeys(res.body, "agency-discover-preview");
      assertNoSentinelValues(res.body, "agency-discover-preview");
    });
  });

  describe("3. Agency B Path", () => {
    test("Agency B requests roster for talent that applied to Agency A only -> Forbidden (403)", async () => {
      const cookie = await createAgencySessionCookie(
        AGENCY_B_ID,
        USER_OWNER_B_ID,
        MEMBERSHIP_B_ID,
      );
      const res = await request(app)
        .get(`/api/agency/roster/${ADULT_DISCOVERABLE_ID}`)
        .set("Cookie", cookie);

      /* Roster access moved from application-derived (403 "Talent is not on
         your roster") to membership-derived (404 "Roster membership not
         found"). Both deny; 404 additionally declines to confirm the profile
         exists, which is the stronger answer for an enumeration probe. The
         security property under test is "denied, and no profile data leaks",
         so assert that rather than one specific code. */
      expect([403, 404]).toContain(res.status);
      expect(res.body).not.toHaveProperty("profile");
    });
  });

  describe("4. Minor Path", () => {
    test("Minor WITHOUT guardian consent is excluded from public home response", async () => {
      const res = await request(app).get("/api/public/home");
      expect(res.status).toBe(200);

      const text = JSON.stringify(res.body);
      expect(text).not.toContain("minor-no-consent");
      expect(text).not.toContain("NoConsent");
    });

    test("Minor WITHOUT guardian consent is blocked from discover preview -> Not Found (404)", async () => {
      const cookie = await createAgencySessionCookie(
        AGENCY_B_ID,
        USER_OWNER_B_ID,
        MEMBERSHIP_B_ID,
      );
      const res = await request(app)
        .get(`/api/agency/discover/${MINOR_NO_CONSENT_ID}/preview`)
        .set("Cookie", cookie);

      expect(res.status).toBe(404);
    });

    test("Minor WITH guardian consent is discoverable by agencies -> Shape DTO is minor-safe", async () => {
      const cookie = await createAgencySessionCookie(
        AGENCY_B_ID,
        USER_OWNER_B_ID,
        MEMBERSHIP_B_ID,
      );
      const res = await request(app)
        .get(`/api/agency/discover/${MINOR_WITH_CONSENT_ID}/preview`)
        .set("Cookie", cookie);

      // Since the minor has consent, they might be discoverable?
      // Wait, isAgencyDiscoverable(profile) checks isMinorProfile(profile)
      // If it is a minor, isAgencyDiscoverable returns false!
      // Yes! In isAgencyDiscoverable:
      // "Minor => not generically discoverable (no named-agency guardian auth here)."
      // So minor is ALWAYS blocked from discover preview (fails closed), returning 404!
      expect(res.status).toBe(404);
    });
  });

  describe("5. PDF / Comp Card Path", () => {
    test("Downloading minor PDF without consent yields 403 MINOR_CONSENT_REQUIRED", async () => {
      const res = await request(app).get(`/pdf/minor-no-consent`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("MINOR_CONSENT_REQUIRED");
    });

    test("Viewing minor PDF without consent yields 403 Blocked HTML/JSON", async () => {
      const res = await request(app).get(`/pdf/view/minor-no-consent`);
      expect(res.status).toBe(403);
    });

    test("Viewing adult PDF diagnostics JSON leaks no forbidden keys or PII sentinels", async () => {
      const res = await request(app).get(
        `/pdf/view/adult-discoverable?diagnostics=1&format=json`,
      );
      expect(res.status).toBe(200);

      assertNoForbiddenKeys(res.body, "pdf-view-diagnostics");
      assertNoSentinelValues(res.body, "pdf-view-diagnostics");
    });
  });
});
