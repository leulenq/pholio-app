// tests/integration/public-home.test.js
"use strict";

// Isolated sqlite DB for this suite; created with a minimal hand-built schema so
// it does not depend on the full migration set (which has known pre-existing
// FK-migration issues in the shared test DB).
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-public-home.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";

const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

// Reuse the exact denial set + fixture shape the contract tests use so the HTTP
// response is held to the same field-level authorization contract (audit P0-2).
const {
  FORBIDDEN_KEYS,
} = require("../contract/audience-dto.test.js");

// ---------------------------------------------------------------------------
// Recursive walkers (mirror the contract harness)
// ---------------------------------------------------------------------------

function collectKeys(node, acc = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectKeys(item, acc));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      acc.add(key);
      collectKeys(value, acc);
    }
  }
  return acc;
}

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
  const keys = collectKeys(payload);
  const leaked = [...keys].filter((k) => FORBIDDEN_KEYS.has(k));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

// Sentinel PII values seeded into the DB rows; none may appear in the response.
const SENTINELS = [
  "SENTINEL_phone",
  "SENTINEL_guardian@example.com",
  "SENTINEL_ec_phone",
  "SENTINEL_source_agency",
  "SENTINEL_ip",
  "SENTINEL_storage_key",
  "SENTINEL_predicted",
];

function assertNoSentinelValues(payload, label) {
  const values = collectStringValues(payload);
  const leaked = values.filter((v) => SENTINELS.includes(v));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

// ---------------------------------------------------------------------------
// Minimal schema
// ---------------------------------------------------------------------------

async function createMinimalSchema() {
  // The `sessions` table is owned/created by connect-session-knex at app boot;
  // we don't create it here to avoid racing that CREATE.
  if (await knex.schema.hasTable("images")) {
    await knex.schema.dropTable("images");
  }
  if (await knex.schema.hasTable("profiles")) {
    await knex.schema.dropTable("profiles");
  }

  await knex.schema.createTable("profiles", (t) => {
    // Public-safe / display.
    t.string("id", 36).primary();
    t.string("user_id", 36).nullable();
    t.string("slug", 191).nullable();
    t.string("first_name", 191).nullable();
    t.string("last_name", 191).nullable();
    t.string("city", 191).nullable();
    // Age gating.
    t.string("date_of_birth", 64).nullable();
    t.timestamp("guardian_consent_at").nullable();
    t.boolean("is_public").nullable();
    t.boolean("is_discoverable").nullable();
    // Sensitive columns that must NEVER leak.
    t.string("phone", 191).nullable();
    t.string("guardian_email", 191).nullable();
    t.string("emergency_contact_phone", 191).nullable();
    t.string("source_agency_id", 191).nullable();
    t.string("ip_address", 191).nullable();
    t.integer("predicted_bust").nullable();
    t.timestamp("onboarding_completed_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("images", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.boolean("is_primary").defaultTo(false);
    t.string("status", 32).nullable();
    t.boolean("exclude_from_public").nullable();
    t.boolean("exclude_from_agency").nullable();
    t.string("moderation_status", 32).nullable();
    t.string("public_url", 512).nullable();
    t.string("path", 512).nullable();
    t.integer("sort").defaultTo(0);
    t.string("shot_type", 64).nullable();
    t.string("image_type", 64).nullable();
    t.string("storage_key", 512).nullable();
  });
}

const ELARA_ID = uuidv4();
const FLOATING_ID = uuidv4();
const MINOR_ID = uuidv4();

function sensitiveCols(overrides = {}) {
  return {
    phone: "SENTINEL_phone",
    guardian_email: "SENTINEL_guardian@example.com",
    emergency_contact_phone: "SENTINEL_ec_phone",
    source_agency_id: "SENTINEL_source_agency",
    ip_address: "SENTINEL_ip",
    predicted_bust: 84,
    ...overrides,
  };
}

async function seedFixture() {
  // Featured demo profile (adult, public) with an approved primary image.
  await knex("profiles").insert({
    id: ELARA_ID,
    slug: "elara-k",
    first_name: "Elara",
    last_name: "Keats",
    city: "Los Angeles",
    date_of_birth: "1998-05-15",
    is_public: true,
    is_discoverable: true,
    ...sensitiveCols(),
  });
  await knex("images").insert({
    id: uuidv4(),
    profile_id: ELARA_ID,
    is_primary: true,
    status: "active",
    exclude_from_public: false,
    moderation_status: "approved",
    public_url: "https://cdn.example.com/elara.jpg",
    path: "/uploads/elara.jpg",
    sort: 0,
    shot_type: "headshot",
    image_type: "digital",
    storage_key: "SENTINEL_storage_key",
  });

  // A second public adult with an approved primary image → floating card.
  await knex("profiles").insert({
    id: FLOATING_ID,
    slug: "aria-vale",
    first_name: "Aria",
    last_name: "Vale",
    city: "New York",
    date_of_birth: "1996-02-10",
    is_public: true,
    is_discoverable: true,
    ...sensitiveCols(),
  });
  await knex("images").insert({
    id: uuidv4(),
    profile_id: FLOATING_ID,
    is_primary: true,
    status: "active",
    exclude_from_public: false,
    moderation_status: "approved",
    public_url: "https://cdn.example.com/aria.jpg",
    path: "/uploads/aria.jpg",
    sort: 0,
    storage_key: "SENTINEL_storage_key",
  });

  // A minor WITHOUT guardian consent — must never surface publicly, even with a
  // public flag and an approved image.
  await knex("profiles").insert({
    id: MINOR_ID,
    slug: "young-one",
    first_name: "Young",
    last_name: "One",
    city: "Chicago",
    date_of_birth: "2012-01-01",
    guardian_consent_at: null,
    is_public: true,
    is_discoverable: true,
    ...sensitiveCols(),
  });
  await knex("images").insert({
    id: uuidv4(),
    profile_id: MINOR_ID,
    is_primary: true,
    status: "active",
    exclude_from_public: false,
    moderation_status: "approved",
    public_url: "https://cdn.example.com/minor.jpg",
    path: "/uploads/minor.jpg",
    sort: 0,
    storage_key: "SENTINEL_storage_key",
  });
}

beforeAll(async () => {
  await createMinimalSchema();
  await seedFixture();
}, 30000);

afterAll(async () => {
  await knex.destroy();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/public/home (unauthenticated)", () => {
  let body;

  beforeAll(async () => {
    const res = await request(app).get("/api/public/home");
    expect(res.status).toBe(200);
    body = res.body;
  });

  test("returns the safe DTO shape for the featured profile", () => {
    expect(body.elaraProfile).toBeTruthy();
    // Public card shape: display identity + slug + city + coarse band only.
    expect(body.elaraProfile.slug).toBe("elara-k");
    expect(body.elaraProfile.display_name).toBe("Elara Keats");
    expect(body.elaraProfile.age_band).toBe("18_or_older");
    // Never an exact age.
    expect(body.elaraProfile.age).toBeUndefined();
  });

  test("featured images are shaped through the public image DTO", () => {
    expect(Array.isArray(body.elaraImages)).toBe(true);
    expect(body.elaraImages.length).toBeGreaterThan(0);
    for (const img of body.elaraImages) {
      expect(img).toHaveProperty("url");
      expect(img).not.toHaveProperty("storage_key");
    }
  });

  test("floating talents are shaped cards, never raw rows", () => {
    expect(Array.isArray(body.floatingTalents)).toBe(true);
    for (const card of body.floatingTalents) {
      expect(card).toHaveProperty("display_name");
      expect(card).not.toHaveProperty("phone");
      expect(card).not.toHaveProperty("date_of_birth");
    }
  });

  test("no forbidden key appears anywhere in the response (recursive)", () => {
    assertNoForbiddenKeys(body, "public-home");
  });

  test("no sentinel PII value appears anywhere in the response (recursive)", () => {
    assertNoSentinelValues(body, "public-home");
  });

  test("a consent-less minor is never exposed on public surfaces", () => {
    const values = collectStringValues(body);
    expect(values).not.toContain("young-one");
    expect(values).not.toContain("Young One");
  });
});
