"use strict";

/**
 * Scout — the expanded talent view, backend contract
 * (tasks/discover-expanded-view-2026-09.md §2.3, §4.3, §5).
 *
 * What this suite holds in place:
 *
 * 1. REPRESENTATION IS THE GATE, AND IT MUST BE RIGHT. The preview built its
 *    DTO without `talent_representations`, so `deriveRepresentationStatus` saw
 *    only `seeking_representation` and could never return `represented` or
 *    `exclusive_elsewhere` — the one fact that would stop a scout approaching
 *    someone with a mother agency. All four values are asserted end to end.
 * 2. FRESHNESS. `profile_updated_at` is on the response and is NOT in
 *    `AGENCY_DISCOVERY_FIELDS`.
 * 3. PRIOR CONTACT, SCOPED TO ONE AGENCY. What this agency did, never what
 *    another agency did.
 * 4. "NOT FOR US" IS PRIVATE. It hides the lead from this agency's Scout
 *    results and from nobody else's, and the talent is never told: no
 *    notification, and nothing in their data inventory.
 * 5. THE PREVIEW READ DOES NOT NOTIFY. A scout flipping through results is not
 *    a viewing event; the invitation is the deliberate act that is.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-discover-preview.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/shared/lib/email", () => ({
  sendApplicationStatusEmail: jest.fn(async () => ({ ok: true })),
  sendAgencyInviteEmail: jest.fn(async () => ({ ok: true })),
  sendTeamInviteEmail: jest.fn(async () => ({ ok: true })),
}));

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  AGENCY_DISCOVERY_FIELDS,
} = require("../../src/shared/lib/audience-dto");
const {
  TALENT_DATA_INVENTORY,
} = require("../../src/shared/lib/talent-data-inventory");
const {
  resetDismissalsSchemaCache,
} = require("../../src/domains/agency/services/agency-dismissals");
const {
  resetInvitationsSchemaCache,
} = require("../../src/domains/agency/services/agency-invitations");
const {
  searchDiscoverableTalent,
} = require("../../src/domains/agency/services/discover-search");

const SESSION_SECRET = require("../../src/config").sessionSecret;
const {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
} = require("../../src/shared/middleware/same-origin-mutation");

const AGENCY_A = uuidv4();
const AGENCY_B = uuidv4();
const USER_A = uuidv4();
const USER_B = uuidv4();
const MEMBERSHIP_A = uuidv4();
const MEMBERSHIP_B = uuidv4();

// One profile per representation state, plus the two used for prior contact.
const FREE = uuidv4(); // unrepresented
const SEEKING = uuidv4(); // seeking representation
const REPRESENTED = uuidv4(); // represented, agency undisclosed
const EXCLUSIVE = uuidv4(); // exclusive elsewhere
const INVITED = uuidv4(); // agency A invited them
const APPLIED = uuidv4(); // applied to agency A

const PROFILE_UPDATED_AT = "2026-08-01T09:30:00.000Z";

async function createSchema() {
  const drop = [
    "sessions",
    "agency_dismissed_profiles",
    "agency_invitations",
    "talent_representations",
    "notifications",
    "talent_user_settings",
    "profile_booking_lanes",
    "social_accounts",
    "applications",
    "images",
    "profiles",
    "agency_memberships",
    "agencies",
    "users",
  ];
  for (const table of drop) {
    if (await knex.schema.hasTable(table)) await knex.schema.dropTable(table);
  }

  /* The session store's own `createtable` is disabled under NODE_ENV=test
     (src/app.js), so this suite owns the `sessions` table too. */
  await knex.schema.createTable("sessions", (t) => {
    t.string("sid", 255).primary();
    t.json("sess").notNullable();
    t.timestamp("expired").notNullable().index();
  });

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
    t.string("slug").nullable();
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
    t.string("profile_status", 20).notNullable().defaultTo("active");
    t.boolean("is_public").defaultTo(true);
    t.boolean("is_discoverable").defaultTo(true);
    t.text("bio_curated").nullable();
    t.integer("height_cm").nullable();
    t.boolean("seeking_representation").defaultTo(false);
    t.string("current_agency", 255).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").nullable();
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
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("applications", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("agency_id", 36).notNullable();
    t.string("status").notNullable().defaultTo("pending");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("social_accounts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("platform", 50).notNullable();
    t.string("handle", 255).nullable();
    t.string("url", 500).nullable();
    t.boolean("is_oauth_connected").defaultTo(false);
    t.integer("follower_count").nullable();
    t.decimal("engagement_rate").nullable();
    t.timestamp("metrics_updated_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("profile_booking_lanes", (t) => {
    t.string("profile_id", 36).notNullable();
    t.string("lane_slug", 80).notNullable();
    t.integer("priority").defaultTo(2);
    t.string("source", 40).defaultTo("talent_selected");
  });

  await knex.schema.createTable("talent_representations", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("agency_id", 36).nullable();
    t.string("external_agency_name", 160).nullable();
    t.string("external_agency_key", 160).nullable();
    t.string("relationship_type", 20).notNullable();
    t.string("scope_key", 245).notNullable().defaultTo("|");
    t.boolean("is_exclusive").notNullable().defaultTo(false);
    t.boolean("disclose_agency_name").notNullable().defaultTo(false);
    t.string("status", 20).notNullable().defaultTo("active");
    t.string("source", 20).notNullable().defaultTo("profile");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("agency_invitations", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("profile_id", 36).notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    t.unique(["agency_id", "profile_id"]);
  });

  await knex.schema.createTable("agency_dismissed_profiles", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("profile_id", 36).notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.unique(["agency_id", "profile_id"]);
  });

  await knex.schema.createTable("notifications", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).notNullable();
    t.string("type", 64).notNullable();
    t.string("title", 255).notNullable();
    t.text("body").nullable();
    t.string("route_target", 512).notNullable();
    t.string("priority", 16).notNullable().defaultTo("normal");
    t.string("group_key", 191).nullable();
    t.string("source_type", 64).nullable();
    t.string("source_id", 36).nullable();
    t.json("metadata").nullable();
    t.integer("occurrence_count").notNullable().defaultTo(1);
    t.timestamp("read_at").nullable();
    t.timestamp("last_occurred_at").defaultTo(knex.fn.now());
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    t.unique(["user_id", "group_key"]);
  });

  await knex.schema.createTable("talent_user_settings", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).notNullable();
    t.text("notification_preferences").nullable();
    t.text("privacy_preferences").nullable();
  });
}

function profileRow(id, overrides = {}) {
  return {
    id,
    user_id: uuidv4(),
    slug: `talent-${id.slice(0, 8)}`,
    first_name: "Talent",
    last_name: id.slice(0, 4),
    city: "Milan",
    date_of_birth: "1998-04-04",
    profile_status: "active",
    is_public: true,
    is_discoverable: true,
    bio_curated: "Editorial and commercial work across Europe.",
    height_cm: 178,
    seeking_representation: false,
    current_agency: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: PROFILE_UPDATED_AT,
    ...overrides,
  };
}

async function seedData() {
  await knex("agencies").insert([
    {
      id: AGENCY_A,
      name: "North Star Models",
      slug: "north-star-models",
      status: "ACTIVE",
      onboarding_completed_at: knex.fn.now(),
    },
    {
      id: AGENCY_B,
      name: "Second Look",
      slug: "second-look",
      status: "ACTIVE",
      onboarding_completed_at: knex.fn.now(),
    },
  ]);

  await knex("users").insert([
    { id: USER_A, email: "a@test.agency", role: "AGENCY" },
    { id: USER_B, email: "b@test.agency", role: "AGENCY" },
  ]);

  await knex("agency_memberships").insert([
    {
      id: MEMBERSHIP_A,
      agency_id: AGENCY_A,
      user_id: USER_A,
      membership_role: "OWNER",
    },
    {
      id: MEMBERSHIP_B,
      agency_id: AGENCY_B,
      user_id: USER_B,
      membership_role: "OWNER",
    },
  ]);

  await knex("profiles").insert([
    profileRow(FREE, { slug: "free-agent", first_name: "Free" }),
    profileRow(SEEKING, {
      slug: "seeking-rep",
      first_name: "Seeking",
      seeking_representation: true,
    }),
    profileRow(REPRESENTED, { slug: "represented", first_name: "Represented" }),
    profileRow(EXCLUSIVE, { slug: "exclusive", first_name: "Exclusive" }),
    profileRow(INVITED, { slug: "invited-one", first_name: "Invited" }),
    profileRow(APPLIED, { slug: "applied-one", first_name: "Applied" }),
  ]);

  await knex("talent_representations").insert([
    {
      id: uuidv4(),
      profile_id: REPRESENTED,
      agency_id: null,
      external_agency_name: "Elite Milan",
      external_agency_key: "elite milan",
      relationship_type: "mother",
      is_exclusive: false,
      disclose_agency_name: false,
      status: "active",
    },
    {
      id: uuidv4(),
      profile_id: EXCLUSIVE,
      agency_id: null,
      external_agency_name: "Storm London",
      external_agency_key: "storm london",
      relationship_type: "mother",
      is_exclusive: true,
      disclose_agency_name: true,
      status: "active",
    },
  ]);

  await knex("images").insert([
    {
      id: uuidv4(),
      profile_id: FREE,
      is_primary: true,
      path: "/free-1.jpg",
      sort: 0,
    },
    {
      id: uuidv4(),
      profile_id: FREE,
      is_primary: false,
      path: "/free-2.jpg",
      sort: 1,
    },
  ]);
}

async function agencyCookie(agencyId, userId, membershipId) {
  const sid = uuidv4();
  await knex("sessions").insert({
    sid,
    sess: JSON.stringify({
      cookie: { originalMaxAge: null, expires: null, path: "/" },
      userId: agencyId,
      memberUserId: userId,
      agencyId,
      agencyMembershipId: membershipId,
      agencyMembershipRole: "OWNER",
      role: "AGENCY",
      agencyOnboardingCompletedAt: new Date().toISOString(),
    }),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  return `connect.sid=${encodeURIComponent(`s:${cookieSig.sign(sid, SESSION_SECRET)}`)}`;
}

/** Mutations go through the same-origin guard the SPA satisfies. */
function mutate(method, path, cookie) {
  return request(app)
    [method](path)
    .set("Cookie", cookie)
    .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
    .set("Origin", "http://localhost:5173");
}

const preview = (profileId, cookie) =>
  request(app)
    .get(`/api/agency/discover/${profileId}/preview`)
    .set("Cookie", cookie);

let cookieA;
let cookieB;

beforeAll(async () => {
  await createSchema();
  await seedData();
  resetDismissalsSchemaCache();
  resetInvitationsSchemaCache();
  cookieA = await agencyCookie(AGENCY_A, USER_A, MEMBERSHIP_A);
  cookieB = await agencyCookie(AGENCY_B, USER_B, MEMBERSHIP_B);
});

afterAll(async () => {
  await knex.destroy();
});

beforeEach(async () => {
  await knex("agency_dismissed_profiles").del();
  await knex("agency_invitations").del();
  await knex("applications").del();
  await knex("notifications").del();
});

describe("representation status through the preview", () => {
  test("an unrepresented talent reads unrepresented", async () => {
    const res = await preview(FREE, cookieA);
    expect(res.status).toBe(200);
    expect(res.body.profile.representation_status).toBe("unrepresented");
    expect(res.body.profile.represented_by).toBeNull();
  });

  test("a talent seeking representation reads seeking", async () => {
    const res = await preview(SEEKING, cookieA);
    expect(res.status).toBe(200);
    expect(res.body.profile.representation_status).toBe("seeking");
  });

  test("an active representation reads represented, undisclosed by default", async () => {
    const res = await preview(REPRESENTED, cookieA);
    expect(res.status).toBe(200);
    expect(res.body.profile.representation_status).toBe("represented");
    expect(res.body.profile.represented_by).toBe("undisclosed");
  });

  /* The regression this suite exists for: the preview built its DTO without
     representations, so this profile reported `unrepresented` and the surface
     could not state the one fact that stops an approach. */
  test("an exclusive representation reads exclusive_elsewhere", async () => {
    const res = await preview(EXCLUSIVE, cookieA);
    expect(res.status).toBe(200);
    expect(res.body.profile.representation_status).toBe("exclusive_elsewhere");
  });
});

describe("freshness", () => {
  test("profile_updated_at is on the response as an ISO instant", async () => {
    const res = await preview(FREE, cookieA);
    expect(res.body.profile.profile_updated_at).toBe(PROFILE_UPDATED_AT);
  });

  test("it is not an allowlisted profile field", () => {
    expect(AGENCY_DISCOVERY_FIELDS).not.toContain("profile_updated_at");
    expect(AGENCY_DISCOVERY_FIELDS).not.toContain("updated_at");
  });

  test("a profile that has never been updated reports null, not a guess", async () => {
    await knex("profiles").where({ id: SEEKING }).update({ updated_at: null });
    const res = await preview(SEEKING, cookieA);
    expect(res.body.profile.profile_updated_at).toBeNull();
    await knex("profiles")
      .where({ id: SEEKING })
      .update({ updated_at: PROFILE_UPDATED_AT });
  });
});

describe("the slug travels with the preview", () => {
  test("it is present, and it is the profile's own", async () => {
    const res = await preview(FREE, cookieA);
    expect(res.body.profile.slug).toBe("free-agent");
  });
});

describe("prior contact", () => {
  test("a stranger reports nothing on every field", async () => {
    const res = await preview(FREE, cookieA);
    expect(res.body.profile.contact).toEqual({
      invited_at: null,
      applied_at: null,
      application_status: null,
    });
  });

  test("an invited talent reports when this agency invited them", async () => {
    await knex("agency_invitations").insert({
      id: uuidv4(),
      agency_id: AGENCY_A,
      profile_id: INVITED,
      created_at: "2026-08-20 10:00:00",
      updated_at: "2026-08-20 10:00:00",
    });

    const res = await preview(INVITED, cookieA);
    expect(res.body.profile.contact.invited_at).toBe(
      "2026-08-20T10:00:00.000Z",
    );
    expect(res.body.profile.contact.applied_at).toBeNull();
  });

  test("an applicant reports the application and its current status", async () => {
    await knex("applications").insert({
      id: uuidv4(),
      profile_id: APPLIED,
      agency_id: AGENCY_A,
      status: "development",
      created_at: "2026-07-14 12:00:00",
    });

    const res = await preview(APPLIED, cookieA);
    expect(res.body.profile.contact.applied_at).toBe(
      "2026-07-14T12:00:00.000Z",
    );
    expect(res.body.profile.contact.application_status).toBe("development");
  });

  test("the most recent application is the one reported", async () => {
    await knex("applications").insert([
      {
        id: uuidv4(),
        profile_id: APPLIED,
        agency_id: AGENCY_A,
        status: "declined",
        created_at: "2026-02-01 09:00:00",
      },
      {
        id: uuidv4(),
        profile_id: APPLIED,
        agency_id: AGENCY_A,
        status: "pending",
        created_at: "2026-08-01 09:00:00",
      },
    ]);

    const res = await preview(APPLIED, cookieA);
    expect(res.body.profile.contact.application_status).toBe("pending");
  });

  test("another agency's invitation and application are invisible", async () => {
    await knex("agency_invitations").insert({
      id: uuidv4(),
      agency_id: AGENCY_A,
      profile_id: INVITED,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    await knex("applications").insert({
      id: uuidv4(),
      profile_id: INVITED,
      agency_id: AGENCY_A,
      status: "accepted",
      created_at: knex.fn.now(),
    });

    // Agency B has done nothing, and learns nothing about what A did.
    const res = await preview(INVITED, cookieB);
    expect(res.body.profile.contact).toEqual({
      invited_at: null,
      applied_at: null,
      application_status: null,
    });
    expect(JSON.stringify(res.body)).not.toContain("accepted");
  });
});

describe("not for us", () => {
  const dismissPath = (id) => `/api/agency/discover/${id}/dismiss`;

  test("dismissing is idempotent and reported by the preview", async () => {
    const first = await mutate("post", dismissPath(FREE), cookieA);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ success: true, dismissed: true });

    const second = await mutate("post", dismissPath(FREE), cookieA);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ success: true, dismissed: true });

    expect(await knex("agency_dismissed_profiles").count("* as c").first()).toEqual(
      expect.objectContaining({ c: 1 }),
    );

    const res = await preview(FREE, cookieA);
    expect(res.body.profile.dismissed).toBe(true);
  });

  test("undismissing restores the lead, and is idempotent too", async () => {
    await mutate("post", dismissPath(FREE), cookieA);

    const first = await mutate("delete", dismissPath(FREE), cookieA);
    expect(first.body).toEqual({ success: true, dismissed: false });
    const second = await mutate("delete", dismissPath(FREE), cookieA);
    expect(second.body).toEqual({ success: true, dismissed: false });

    const res = await preview(FREE, cookieA);
    expect(res.body.profile.dismissed).toBe(false);
  });

  test("a dismissed lead leaves this agency's search and no one else's", async () => {
    await mutate("post", dismissPath(FREE), cookieA);

    const mine = await searchDiscoverableTalent(knex, { agencyId: AGENCY_A });
    expect(mine.profiles.map((p) => p.id)).not.toContain(FREE);
    expect(mine.pagination.total).toBe(5);

    const theirs = await searchDiscoverableTalent(knex, { agencyId: AGENCY_B });
    expect(theirs.profiles.map((p) => p.id)).toContain(FREE);
    expect(theirs.pagination.total).toBe(6);

    await mutate("delete", dismissPath(FREE), cookieA);
    const restored = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_A,
    });
    expect(restored.profiles.map((p) => p.id)).toContain(FREE);
  });

  test("dismissing tells the talent nothing", async () => {
    await mutate("post", dismissPath(FREE), cookieA);
    const notifications = await knex("notifications").select("*");
    expect(notifications).toEqual([]);
  });

  test("a dismissal is not talent data, so it is not in their inventory", () => {
    const tables = TALENT_DATA_INVENTORY.map((entry) => entry.table);
    expect(tables).not.toContain("agency_dismissed_profiles");
  });

  test("a talent who blocked this agency cannot be dismissed by it", async () => {
    const blocked = await knex("profiles").where({ id: APPLIED }).first();
    await knex("talent_user_settings").insert({
      id: uuidv4(),
      user_id: blocked.user_id,
      privacy_preferences: JSON.stringify({ blockedAgencies: [AGENCY_A] }),
    });

    const res = await mutate("post", dismissPath(APPLIED), cookieA);
    expect(res.status).toBe(404);
    expect(await knex("agency_dismissed_profiles").select("*")).toEqual([]);

    await knex("talent_user_settings").where({ user_id: blocked.user_id }).del();
  });

  test("a profile this agency may not see cannot be dismissed", async () => {
    await knex("profiles")
      .where({ id: SEEKING })
      .update({ is_discoverable: false });
    const res = await mutate("post", dismissPath(SEEKING), cookieA);
    expect(res.status).toBe(404);
    await knex("profiles")
      .where({ id: SEEKING })
      .update({ is_discoverable: true });
  });
});

describe("a read is not a viewing event", () => {
  test("opening a preview notifies nobody", async () => {
    await preview(FREE, cookieA);
    await preview(EXCLUSIVE, cookieA);
    expect(await knex("notifications").select("*")).toEqual([]);
  });

  test("an invitation does notify — that is the deliberate act", async () => {
    const res = await mutate(
      "post",
      `/api/agency/discover/${FREE}/invite`,
      cookieA,
    );
    expect(res.status).toBe(200);

    const rows = await knex("notifications").select("*");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("agency_invitation");
    expect(rows[0].title).toBe("North Star Models invited you to apply");
    // The copy names the act, not the glance. A talent who reads "viewed your
    // profile" alongside an invitation email is being told two different
    // stories about one event.
    expect(rows[0].title).not.toMatch(/viewed/i);
  });
});
