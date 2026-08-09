// tests/integration/agency-rbac.test.js
"use strict";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-agency-rbac.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";

const fs = require("fs");
const path = require("path");
const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { FORBIDDEN_KEYS } = require("../contract/audience-dto.test");

// Sign forged session cookies with the SAME secret the app validates against
// (config.sessionSecret). The old hardcoded "pholio-secret" fallback did not
// match the app's actual default, so every forged cookie was rejected and the
// suite saw 401s instead of the intended RBAC 403s.
const SESSION_SECRET = require("../../src/config").sessionSecret;
const TEST_DB_PATH = path.resolve(__dirname, "../../test-agency-rbac.sqlite3");

// Recursively collect every object key that appears anywhere in a payload.
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

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const ADMIN_USER_ID = uuidv4();
const AGENT_USER_ID = uuidv4();
const SCOUT_USER_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const APPLICATION_ID = uuidv4();

const MEMBERSHIP = {
  owner: uuidv4(),
  admin: uuidv4(),
  agent: uuidv4(),
  scout: uuidv4(),
};

async function createMinimalSchema() {
  if (!(await knex.schema.hasTable("users"))) {
    await knex.schema.createTable("users", (t) => {
      t.string("id", 36).primary();
      t.string("email").notNullable().unique();
      t.string("role").notNullable();
      t.string("account_status").notNullable().defaultTo("ACTIVE");
      t.string("first_name", 100).nullable();
      t.string("last_name", 100).nullable();
      t.string("avatar_url", 2048).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else {
    if (!(await knex.schema.hasColumn("users", "account_status"))) {
      await knex.schema.alterTable("users", (t) => {
        t.string("account_status").notNullable().defaultTo("ACTIVE");
      });
    }
    // Team list/add select u.avatar_url (see inbox.js team routes).
    if (!(await knex.schema.hasColumn("users", "avatar_url"))) {
      await knex.schema.alterTable("users", (t) => {
        t.string("avatar_url", 2048).nullable();
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
      t.string("status").notNullable().defaultTo("ACTIVE");
      t.timestamp("onboarding_completed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("agency_memberships"))) {
    await knex.schema.createTable("agency_memberships", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("user_id", 36).notNullable();
      t.string("membership_role").notNullable();
      t.string("status").notNullable().defaultTo("ACTIVE");
      t.timestamp("invited_at").nullable();
      t.timestamp("joined_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  } else if (
    !(await knex.schema.hasColumn("agency_memberships", "invited_at"))
  ) {
    await knex.schema.alterTable("agency_memberships", (t) => {
      t.timestamp("invited_at").nullable();
    });
  }

  if (!(await knex.schema.hasTable("agency_membership_permissions"))) {
    await knex.schema.createTable("agency_membership_permissions", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("membership_id", 36).notNullable();
      t.string("permission_key", 80).notNullable();
      t.string("effect", 5).notNullable();
      t.text("reason").nullable();
      t.string("granted_by_membership_id", 36).nullable();
      t.timestamp("expires_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["membership_id", "permission_key", "effect"]);
    });
  }

  if (!(await knex.schema.hasTable("agency_audit_events"))) {
    await knex.schema.createTable("agency_audit_events", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("actor_membership_id", 36).nullable();
      t.string("actor_user_id", 36).nullable();
      t.string("event_type", 60).notNullable();
      t.string("target_type", 40).nullable();
      t.string("target_id", 36).nullable();
      t.text("summary").notNullable();
      t.text("before_state").nullable();
      t.text("after_state").nullable();
      t.string("ip_address", 45).nullable();
      t.text("user_agent").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else {
    if (!(await knex.schema.hasColumn("agency_audit_events", "ip_address"))) {
      await knex.schema.alterTable("agency_audit_events", (t) => {
        t.string("ip_address", 45).nullable();
      });
    }
    if (!(await knex.schema.hasColumn("agency_audit_events", "user_agent"))) {
      await knex.schema.alterTable("agency_audit_events", (t) => {
        t.text("user_agent").nullable();
      });
    }
  }

  if (!(await knex.schema.hasTable("profiles"))) {
    await knex.schema.createTable("profiles", (t) => {
      t.string("id", 36).primary();
      t.string("user_id", 36).nullable();
      t.string("first_name", 100).nullable();
      t.string("last_name", 100).nullable();
      t.text("bio_curated").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else if (!(await knex.schema.hasColumn("profiles", "bio_curated"))) {
    await knex.schema.alterTable("profiles", (t) => {
      t.text("bio_curated").nullable();
    });
  }

  // The agency-submission audience SELECT (profile-visibility.js) reads every
  // one of these columns; /api/agency/applications 500s if any is missing.
  const PROFILE_AUDIENCE_COLUMNS = [
    ["slug", (t) => t.string("slug", 200).nullable()],
    ["city", (t) => t.string("city", 100).nullable()],
    ["gender", (t) => t.string("gender", 30).nullable()],
    ["archetype", (t) => t.string("archetype", 60).nullable()],
    ["stats_track", (t) => t.string("stats_track", 30).nullable()],
    ["height_cm", (t) => t.integer("height_cm").nullable()],
    ["bust_cm", (t) => t.integer("bust_cm").nullable()],
    ["chest_cm", (t) => t.integer("chest_cm").nullable()],
    ["waist_cm", (t) => t.integer("waist_cm").nullable()],
    ["hips_cm", (t) => t.integer("hips_cm").nullable()],
    ["inseam_cm", (t) => t.integer("inseam_cm").nullable()],
    ["shoe_size", (t) => t.string("shoe_size", 20).nullable()],
    ["dress_size", (t) => t.string("dress_size", 20).nullable()],
    ["suit_size", (t) => t.string("suit_size", 20).nullable()],
    ["hair_color", (t) => t.string("hair_color", 40).nullable()],
    ["eye_color", (t) => t.string("eye_color", 40).nullable()],
    ["measurements_updated_at", (t) => t.timestamp("measurements_updated_at").nullable()],
    ["measured_in_person_at", (t) => t.timestamp("measured_in_person_at").nullable()],
    ["availability_status", (t) => t.string("availability_status", 40).nullable()],
    ["nationality", (t) => t.string("nationality", 80).nullable()],
    ["date_of_birth", (t) => t.string("date_of_birth", 40).nullable()],
    ["guardian_consent_at", (t) => t.timestamp("guardian_consent_at").nullable()],
    ["languages", (t) => t.text("languages").nullable()],
    ["bio_raw", (t) => t.text("bio_raw").nullable()],
    ["phone", (t) => t.string("phone", 40).nullable()],
    ["weight_kg", (t) => t.integer("weight_kg").nullable()],
    ["weight_lbs", (t) => t.integer("weight_lbs").nullable()],
    ["weight_unit", (t) => t.string("weight_unit", 10).nullable()],
    ["is_discoverable", (t) => t.boolean("is_discoverable").defaultTo(false)],
  ];
  for (const [column, addColumn] of PROFILE_AUDIENCE_COLUMNS) {
    if (!(await knex.schema.hasColumn("profiles", column))) {
      await knex.schema.alterTable("profiles", addColumn);
    }
  }

  // Retain the historical membership table in this hand-built schema so tests
  // exercise the same deletion/cascade environment as migrated databases.
  if (!(await knex.schema.hasTable("roster_memberships"))) {
    await knex.schema.createTable("roster_memberships", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("profile_id", 36).nullable();
      t.string("talent_record_id", 36).nullable();
      t.string("board_id", 36).nullable();
      t.string("stage", 20).notNullable().defaultTo("main");
      t.string("status", 20).notNullable().defaultTo("active");
      t.string("source_application_id", 36).nullable();
      t.timestamp("joined_at").nullable();
      t.timestamp("left_at").nullable();
      t.text("notes").nullable();
      t.string("created_by_user_id", 36).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("talent_commitments"))) {
    await knex.schema.createTable("talent_commitments", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("profile_id", 36).nullable();
      t.string("roster_membership_id", 36).nullable();
      t.string("kind", 40).nullable();
      t.string("option_tier", 40).nullable();
      t.string("start_date", 40).nullable();
      t.string("end_date", 40).nullable();
      t.string("market", 80).nullable();
      t.string("client_ref", 120).nullable();
      t.string("category", 80).nullable();
      t.text("notes").nullable();
      t.string("status", 20).notNullable().defaultTo("active");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("social_accounts"))) {
    // Mirrors migrations/20260629160000_create_social_accounts_table.js —
    // shared/lib/social-accounts.js (Wave 2D canonical loader) selects the
    // metrics/verification columns too, not just platform/handle/url.
    await knex.schema.createTable("social_accounts", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).nullable();
      t.string("agency_id", 36).nullable();
      t.string("platform", 50).notNullable();
      t.string("handle", 255).nullable();
      t.string("url", 500).nullable();
      t.integer("follower_count").nullable();
      t.decimal("engagement_rate", 5, 2).nullable();
      t.boolean("is_oauth_connected").defaultTo(false);
      t.timestamp("metrics_updated_at").nullable();
      t.timestamps(true, true);
      t.unique(["profile_id", "platform"]);
      t.unique(["agency_id", "platform"]);
    });
  }

  if (!(await knex.schema.hasTable("applications"))) {
    await knex.schema.createTable("applications", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).notNullable();
      t.string("agency_id", 36).notNullable();
      t.string("status").notNullable().defaultTo("submitted");
      t.float("match_score").nullable();
      t.timestamp("accepted_at").nullable();
      t.timestamp("declined_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  } else {
    if (!(await knex.schema.hasColumn("applications", "match_score"))) {
      await knex.schema.alterTable("applications", (t) => {
        t.float("match_score").nullable();
      });
    }
    if (!(await knex.schema.hasColumn("applications", "declined_at"))) {
      await knex.schema.alterTable("applications", (t) => {
        t.timestamp("declined_at").nullable();
      });
    }
  }

  // Minor-submission gating (minor-submission-access.js) reads these
  // application columns and joins minor_agency_consents.
  const APPLICATION_MINOR_COLUMNS = [
    ["minor_at_submission", (t) => t.boolean("minor_at_submission").defaultTo(false)],
    ["guardian_consent_grant_id", (t) => t.string("guardian_consent_grant_id", 36).nullable()],
    ["guardian_consent_expires_at", (t) => t.timestamp("guardian_consent_expires_at").nullable()],
    ["minor_access_revoked_at", (t) => t.timestamp("minor_access_revoked_at").nullable()],
    ["minor_access_revocation_reason", (t) => t.string("minor_access_revocation_reason", 120).nullable()],
  ];
  for (const [column, addColumn] of APPLICATION_MINOR_COLUMNS) {
    if (!(await knex.schema.hasColumn("applications", column))) {
      await knex.schema.alterTable("applications", addColumn);
    }
  }

  if (!(await knex.schema.hasTable("minor_agency_consents"))) {
    await knex.schema.createTable("minor_agency_consents", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).notNullable();
      t.string("agency_id", 36).notNullable();
      t.string("consent_request_id", 36).nullable();
      t.string("guardian_email").nullable();
      t.timestamp("verified_at").nullable();
      t.timestamp("revoked_at").nullable();
      t.timestamp("authorization_expires_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  // Team add revokes any pending invitation for the email (inbox.js team routes).
  if (!(await knex.schema.hasTable("agency_team_invitations"))) {
    await knex.schema.createTable("agency_team_invitations", (t) => {
      t.string("id", 36).primary();
      t.string("agency_id", 36).notNullable();
      t.string("email", 320).notNullable();
      t.string("membership_role", 32).notNullable();
      t.string("token_hash", 64).nullable();
      t.string("invited_by_user_id", 36).nullable();
      t.string("invited_by_membership_id", 36).nullable();
      t.timestamp("expires_at").nullable();
      t.timestamp("accepted_at").nullable();
      t.timestamp("revoked_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("application_activities"))) {
    await knex.schema.createTable("application_activities", (t) => {
      t.string("id", 36).primary();
      t.string("application_id", 36).notNullable();
      t.string("agency_id", 36).notNullable();
      t.string("user_id", 36).nullable();
      t.string("activity_type", 100).notNullable();
      t.text("description").nullable();
      t.text("metadata").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("images"))) {
    await knex.schema.createTable("images", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).nullable();
      t.string("path").nullable();
      t.string("public_url").nullable();
      t.boolean("is_primary").defaultTo(false);
      t.string("shot_type", 50).nullable();
      t.string("image_type", 50).nullable();
      t.integer("sort").defaultTo(0);
      t.string("status", 20).nullable();
      t.string("moderation_status", 20).nullable();
      t.boolean("exclude_from_public").defaultTo(false);
      t.boolean("exclude_from_agency").defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("application_tags"))) {
    await knex.schema.createTable("application_tags", (t) => {
      t.string("id", 36).primary();
      t.string("application_id", 36).notNullable();
      t.string("agency_id", 36).notNullable();
      t.string("tag", 100).notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }
}

async function seedRbacFixture() {
  const tables = [
    "application_activities",
    "applications",
    "agency_membership_permissions",
    "agency_audit_events",
    "agency_memberships",
    "profiles",
    "sessions",
    "agencies",
    "users",
  ];

  for (const table of tables) {
    if (await knex.schema.hasTable(table)) {
      await knex(table).del();
    }
  }

  await knex("users").insert([
    {
      id: OWNER_USER_ID,
      email: "owner@rbac.test",
      role: "AGENCY",
      first_name: "Olivia",
      last_name: "Owner",
    },
    {
      id: ADMIN_USER_ID,
      email: "admin@rbac.test",
      role: "AGENCY",
      first_name: "Adam",
      last_name: "Admin",
    },
    {
      id: AGENT_USER_ID,
      email: "agent@rbac.test",
      role: "AGENCY",
      first_name: "Ava",
      last_name: "Agent",
    },
    {
      id: SCOUT_USER_ID,
      email: "scout@rbac.test",
      role: "AGENCY",
      first_name: "Sam",
      last_name: "Scout",
    },
    {
      id: TALENT_USER_ID,
      email: "talent@rbac.test",
      role: "TALENT",
      first_name: "Tia",
      last_name: "Talent",
    },
  ]);

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "RBAC Test Agency",
    status: "ACTIVE",
    onboarding_completed_at: new Date().toISOString(),
  });

  await knex("agency_memberships").insert([
    {
      id: MEMBERSHIP.owner,
      agency_id: AGENCY_ID,
      user_id: OWNER_USER_ID,
      membership_role: "OWNER",
      status: "ACTIVE",
      joined_at: knex.fn.now(),
    },
    {
      id: MEMBERSHIP.admin,
      agency_id: AGENCY_ID,
      user_id: ADMIN_USER_ID,
      membership_role: "ADMIN",
      status: "ACTIVE",
      joined_at: knex.fn.now(),
    },
    {
      id: MEMBERSHIP.agent,
      agency_id: AGENCY_ID,
      user_id: AGENT_USER_ID,
      membership_role: "AGENT",
      status: "ACTIVE",
      joined_at: knex.fn.now(),
    },
    {
      id: MEMBERSHIP.scout,
      agency_id: AGENCY_ID,
      user_id: SCOUT_USER_ID,
      membership_role: "SCOUT",
      status: "ACTIVE",
      joined_at: knex.fn.now(),
    },
  ]);

  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    first_name: "Tia",
    last_name: "Talent",
  });

  await knex("applications").insert({
    id: APPLICATION_ID,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status: "submitted",
  });
}

beforeAll(async () => {
  await createMinimalSchema();
  await seedRbacFixture();
}, 30000);

afterAll(async () => {
  await knex.destroy();
});

async function agentWithAgencySession({
  memberUserId,
  membershipId,
  membershipRole,
}) {
  const sid = uuidv4();
  const sessionData = {
    cookie: {
      originalMaxAge: null,
      expires: null,
      secure: false,
      httpOnly: true,
      path: "/",
    },
    userId: AGENCY_ID,
    memberUserId,
    agencyId: AGENCY_ID,
    agencyMembershipId: membershipId,
    agencyMembershipRole: membershipRole,
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };

  await knex("sessions").insert({
    sid,
    sess: JSON.stringify(sessionData),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });

  const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
  const encoded = encodeURIComponent(signed);

  return (req) => req.set("Cookie", `connect.sid=${encoded}`);
}

describe("agency RBAC HTTP enforcement", () => {
  const cases = [
    {
      name: "SCOUT cannot accept applications",
      session: {
        memberUserId: SCOUT_USER_ID,
        membershipId: MEMBERSHIP.scout,
        membershipRole: "SCOUT",
      },
      method: "post",
      path: `/api/agency/applications/${APPLICATION_ID}/accept`,
      expectedStatus: 403,
      missingPermission: "applications.accept",
    },
    {
      name: "AGENT cannot update org settings",
      session: {
        memberUserId: AGENT_USER_ID,
        membershipId: MEMBERSHIP.agent,
        membershipRole: "AGENT",
      },
      method: "put",
      path: "/api/agency/settings",
      body: { notify_new_applications: true },
      expectedStatus: 403,
      missingPermission: "org.edit_settings",
    },
    {
      name: "SCOUT cannot bulk decline",
      session: {
        memberUserId: SCOUT_USER_ID,
        membershipId: MEMBERSHIP.scout,
        membershipRole: "SCOUT",
      },
      method: "post",
      path: "/api/agency/applications/bulk-decline",
      body: { applicationIds: [APPLICATION_ID] },
      expectedStatus: 403,
      missingPermission: "applications.bulk_decline",
    },
    {
      name: "VIEWER cannot send messages",
      session: {
        memberUserId: SCOUT_USER_ID,
        membershipId: MEMBERSHIP.scout,
        membershipRole: "VIEWER",
      },
      method: "post",
      path: `/api/agency/applications/${APPLICATION_ID}/messages`,
      body: { body: "Hello" },
      expectedStatus: 403,
      missingPermission: "messages.send",
    },
    {
      name: "OWNER can list team",
      session: {
        memberUserId: OWNER_USER_ID,
        membershipId: MEMBERSHIP.owner,
        membershipRole: "OWNER",
      },
      method: "get",
      path: "/api/agency/team",
      expectedStatus: 200,
    },
    {
      name: "AGENT cannot invite team members",
      session: {
        memberUserId: AGENT_USER_ID,
        membershipId: MEMBERSHIP.agent,
        membershipRole: "AGENT",
      },
      method: "post",
      path: "/api/agency/team",
      body: { email: "new@rbac.test", membership_role: "SCOUT" },
      expectedStatus: 403,
      missingPermission: "team.invite",
    },
    {
      name: "AGENT can view agency profile",
      session: {
        memberUserId: AGENT_USER_ID,
        membershipId: MEMBERSHIP.agent,
        membershipRole: "AGENT",
      },
      method: "get",
      path: "/api/agency/me",
      expectedStatus: 200,
    },
  ];

  test.each(cases)("$name", async (tc) => {
    const withCookie = await agentWithAgencySession(tc.session);
    let req = request(app)[tc.method](tc.path);
    if (tc.body) req = req.send(tc.body);
    const res = await withCookie(req);

    expect(res.status).toBe(tc.expectedStatus);
    if (tc.missingPermission) {
      expect(res.body.missingPermissions).toContain(tc.missingPermission);
    }
    if (tc.expectedStatus === 200 && tc.path === "/api/agency/team") {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    }
    if (tc.expectedStatus === 200 && tc.path === "/api/agency/me") {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    }
  });
});

describe("agency RBAC custom grants", () => {
  beforeEach(async () => {
    await knex("agency_membership_permissions").del();
    await knex("application_activities").del();
    await knex("applications")
      .where({ id: APPLICATION_ID })
      .update({ status: "submitted", accepted_at: null });
  });

  test("OWNER can grant SCOUT applications.accept and accept succeeds", async () => {
    const ownerCookie = await agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

    const grantRes = await ownerCookie(
      request(app)
        .put(`/api/agency/team/${MEMBERSHIP.scout}/permissions`)
        .send({
          grants: [
            {
              permission_key: "applications.accept",
              effect: "ALLOW",
              reason: "Trusted junior booker",
            },
          ],
        }),
    );

    expect(grantRes.status).toBe(200);
    expect(grantRes.body.success).toBe(true);
    expect(grantRes.body.data.effectivePermissions).toContain(
      "applications.accept",
    );

    const scoutCookie = await agentWithAgencySession({
      memberUserId: SCOUT_USER_ID,
      membershipId: MEMBERSHIP.scout,
      membershipRole: "SCOUT",
    });

    const acceptRes = await scoutCookie(
      request(app).post(`/api/agency/applications/${APPLICATION_ID}/accept`),
    );

    expect(acceptRes.status).toBe(200);

    const activity = await knex("application_activities")
      .where({ application_id: APPLICATION_ID, activity_type: "status_change" })
      .orderBy("created_at", "desc")
      .first();

    expect(activity).toBeDefined();
    expect(activity.user_id).toBe(SCOUT_USER_ID);
    expect(activity.user_id).not.toBe(AGENCY_ID);
  });

  test("OWNER can persist a development status without a signed timestamp", async () => {
    await knex("applications")
      .where({ id: APPLICATION_ID })
      .update({
        status: "accepted",
        accepted_at: knex.fn.now(),
        declined_at: knex.fn.now(),
      });

    const ownerCookie = await agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

    const response = await ownerCookie(
      request(app)
        .patch(`/api/agency/applications/${APPLICATION_ID}/status`)
        .send({ status: "development" }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      applicationId: APPLICATION_ID,
      status: "development",
      stage: "Offered",
    });

    const persisted = await knex("applications")
      .where({ id: APPLICATION_ID })
      .first();
    expect(persisted.status).toBe("development");
    expect(persisted.accepted_at).toBeNull();
    expect(persisted.declined_at).toBeNull();
  });

  test("OWNER can add existing agency user to team", async () => {
    const newUserId = uuidv4();
    await knex("users").insert({
      id: newUserId,
      email: "new@rbac.test",
      role: "AGENCY",
      first_name: "Nina",
      last_name: "New",
    });

    const ownerCookie = await agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

    const addRes = await ownerCookie(
      request(app).post("/api/agency/team").send({
        email: "new@rbac.test",
        membership_role: "SCOUT",
      }),
    );

    expect(addRes.status).toBe(201);
    expect(addRes.body.success).toBe(true);
    expect(addRes.body.data.email).toBe("new@rbac.test");
    expect(addRes.body.data.membership_role).toBe("SCOUT");

    const membership = await knex("agency_memberships")
      .where({ agency_id: AGENCY_ID, user_id: newUserId })
      .first();
    expect(membership).toBeDefined();
    // Team adds are invitation-based (RBAC hardening): the membership is
    // created INVITED and only becomes ACTIVE when the user accepts.
    expect(membership.status).toBe("INVITED");

    await knex("agency_memberships")
      .where({ agency_id: AGENCY_ID, user_id: newUserId })
      .del();
    await knex("users").where({ id: newUserId }).del();
  });

  test("OWNER can manage team roles", async () => {
    const ownerCookie = await agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

    const patchRes = await ownerCookie(
      request(app)
        .patch(`/api/agency/team/${MEMBERSHIP.scout}`)
        .send({ membership_role: "VIEWER" }),
    );

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.membership_role).toBe("VIEWER");

    await knex("agency_memberships")
      .where({ id: MEMBERSHIP.scout })
      .update({ membership_role: "SCOUT" });
  });
});

// ---------------------------------------------------------------------------
// Cross-agency isolation for GET /api/agency/applications (audit P0-3).
// The endpoint must return ONLY real applicants to the SESSION agency — never a
// profile that applied to a different agency, and never a non-applicant.
// ---------------------------------------------------------------------------
describe("agency applications cross-tenant isolation", () => {
  const AGENCY_B_ID = uuidv4();
  const P_APPLIED_A = uuidv4();
  const P_APPLIED_B = uuidv4();
  const P_NO_APP = uuidv4();
  const APP_TO_A = uuidv4();
  const APP_TO_B = uuidv4();

  beforeAll(async () => {
    await knex("profiles").insert([
      {
        id: P_APPLIED_A,
        first_name: "Applied",
        last_name: "ToA",
        bio_curated: "Applicant to agency A",
      },
      {
        id: P_APPLIED_B,
        first_name: "Applied",
        last_name: "ToB",
        bio_curated: "Applicant to agency B only",
      },
      {
        id: P_NO_APP,
        first_name: "Never",
        last_name: "Applied",
        bio_curated: "Discoverable but never submitted to anyone",
      },
    ]);

    await knex("applications").insert([
      {
        id: APP_TO_A,
        profile_id: P_APPLIED_A,
        agency_id: AGENCY_ID,
        status: "submitted",
      },
      {
        id: APP_TO_B,
        profile_id: P_APPLIED_B,
        agency_id: AGENCY_B_ID,
        status: "submitted",
      },
    ]);
  });

  afterAll(async () => {
    await knex("applications")
      .whereIn("id", [APP_TO_A, APP_TO_B])
      .del();
    await knex("profiles")
      .whereIn("id", [P_APPLIED_A, P_APPLIED_B, P_NO_APP])
      .del();
  });

  test("agency A sees only its own applicant, not agency B's or non-applicants", async () => {
    const withCookie = await agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

    const res = await withCookie(
      request(app).get("/api/agency/applications"),
    );

    expect(res.status).toBe(200);
    const returnedIds = res.body.profiles.map((p) => p.id);
    const returnedAppIds = res.body.profiles.map((p) => p.application_id);

    // Only the profile that applied to agency A comes back.
    expect(returnedAppIds).toContain(APP_TO_A);
    expect(returnedIds).toContain(P_APPLIED_A);

    // A profile that applied only to agency B is NOT visible to agency A.
    expect(returnedAppIds).not.toContain(APP_TO_B);
    expect(returnedIds).not.toContain(P_APPLIED_B);

    // A profile with NO application is NOT visible (the old whereNull leak).
    expect(returnedIds).not.toContain(P_NO_APP);
  });

  test("applications response leaks no forbidden key or owner email", async () => {
    const withCookie = await agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

    const res = await withCookie(
      request(app).get("/api/agency/applications"),
    );

    expect(res.status).toBe(200);
    const keys = collectAllKeys(res.body.profiles);

    // /applications is the SUBMISSION audience: an actual application exists, so
    // the minor-safe snapshot intentionally carries more than generic discovery
    // (e.g. a derived `age`). We therefore assert the truly-never set — the same
    // denial contract used by the submission DTO — anchored on the P0-3 leak.
    const SUBMISSION_NEVER = [
      "owner_email",
      "user_email",
      "email",
      "phone",
      "guardian_email",
      "emergency_contact_phone",
      "source_agency_id",
      "partner_agency_id",
      "photo_embedding",
      "fit_score_overall",
      "ip_address",
      "predicted_bust",
      "search_document",
    ];
    expect(SUBMISSION_NEVER.filter((k) => keys.has(k))).toEqual([]);
    // Sanity: the discovery-only forbidden set still catches account identity.
    expect(FORBIDDEN_KEYS.has("owner_email")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Discover-preview DTO isolation (audit P0-3 leak class).
// ---------------------------------------------------------------------------
describe("agency discover-preview DTO isolation", () => {
  const ROSTER_PROFILE = uuidv4();
  const ROSTER_APP = uuidv4();
  const ROSTER_MEMBERSHIP = uuidv4();
  const PREVIEW_ADULT = uuidv4();
  const PREVIEW_MINOR = uuidv4();
  const VISIBLE_IMG = uuidv4();
  const HIDDEN_IMG = uuidv4();

  const isoYearsAgo = (n) =>
    new Date(Date.UTC(new Date().getUTCFullYear() - n, 0, 1))
      .toISOString()
      .slice(0, 10);

  async function ensureColumn(table, col, add) {
    if (!(await knex.schema.hasColumn(table, col))) {
      await knex.schema.alterTable(table, add);
    }
  }

  beforeAll(async () => {
    await ensureColumn("profiles", "is_discoverable", (t) =>
      t.boolean("is_discoverable").defaultTo(false),
    );
    await ensureColumn("profiles", "date_of_birth", (t) =>
      t.string("date_of_birth", 40).nullable(),
    );
    await ensureColumn("profiles", "guardian_consent_at", (t) =>
      t.timestamp("guardian_consent_at").nullable(),
    );
    await ensureColumn("profiles", "slug", (t) => t.string("slug", 200).nullable());
    await ensureColumn("profiles", "city", (t) => t.string("city", 100).nullable());

    if (!(await knex.schema.hasTable("commissions"))) {
      await knex.schema.createTable("commissions", (t) => {
        t.string("id", 36).primary();
        t.string("profile_id", 36).nullable();
        t.string("agency_id", 36).nullable();
        t.integer("amount_cents").nullable();
        t.timestamp("created_at").defaultTo(knex.fn.now());
      });
    }

    // Adult roster talent (accepted application) + one visible + one hidden image.
    await knex("profiles").insert([
      {
        id: ROSTER_PROFILE,
        user_id: null,
        first_name: "Rosa",
        last_name: "Roster",
        slug: "rosa-roster",
        city: "Paris",
        date_of_birth: isoYearsAgo(27),
        bio_curated: "Signed roster talent",
        is_discoverable: false,
      },
      {
        id: PREVIEW_ADULT,
        user_id: null,
        first_name: "Adam",
        last_name: "Adult",
        slug: "adam-adult",
        city: "Milan",
        date_of_birth: isoYearsAgo(24),
        bio_curated: "Discoverable adult",
        is_discoverable: true,
      },
      {
        id: PREVIEW_MINOR,
        user_id: null,
        first_name: "Minnie",
        last_name: "Minor",
        slug: "minnie-minor",
        city: "Berlin",
        date_of_birth: isoYearsAgo(15),
        bio_curated: "Discoverable minor (no guardian consent)",
        is_discoverable: true,
      },
    ]);

    await knex("applications").insert({
      id: ROSTER_APP,
      profile_id: ROSTER_PROFILE,
      agency_id: AGENCY_ID,
      status: "accepted",
    });

    // Historical membership fixture: production no longer creates or reads it.
    await knex("roster_memberships").insert({
      id: ROSTER_MEMBERSHIP,
      agency_id: AGENCY_ID,
      profile_id: ROSTER_PROFILE,
      stage: "main",
      status: "active",
      source_application_id: ROSTER_APP,
      joined_at: new Date(),
    });

    await knex("images").insert([
      {
        id: VISIBLE_IMG,
        profile_id: ROSTER_PROFILE,
        path: "/uploads/visible.webp",
        public_url: "/uploads/visible.webp",
        is_primary: true,
        sort: 0,
        status: "active",
        moderation_status: "approved",
        exclude_from_public: false,
        exclude_from_agency: false,
      },
      {
        id: HIDDEN_IMG,
        profile_id: ROSTER_PROFILE,
        path: "/uploads/hidden.webp",
        public_url: "/uploads/hidden.webp",
        is_primary: false,
        sort: 1,
        status: "active",
        moderation_status: "approved",
        exclude_from_public: false,
        // Talent blocked this image from agencies — must be filtered out.
        exclude_from_agency: true,
      },
    ]);
  });

  afterAll(async () => {
    await knex("images").whereIn("id", [VISIBLE_IMG, HIDDEN_IMG]).del();
    await knex("roster_memberships").where({ id: ROSTER_MEMBERSHIP }).del();
    await knex("applications").where({ id: ROSTER_APP }).del();
    await knex("profiles")
      .whereIn("id", [ROSTER_PROFILE, PREVIEW_ADULT, PREVIEW_MINOR])
      .del();
  });

  const ownerSession = () =>
    agentWithAgencySession({
      memberUserId: OWNER_USER_ID,
      membershipId: MEMBERSHIP.owner,
      membershipRole: "OWNER",
    });

  test("discover preview of an adult returns a discovery DTO with no forbidden keys", async () => {
    const withCookie = await ownerSession();
    const res = await withCookie(
      request(app).get(`/api/agency/discover/${PREVIEW_ADULT}/preview`),
    );

    expect(res.status).toBe(200);
    const keys = collectAllKeys(res.body.profile);
    expect([...keys].filter((k) => FORBIDDEN_KEYS.has(k))).toEqual([]);
    expect(res.body.profile.age).toBeUndefined();
    expect("age_band" in res.body.profile).toBe(true);
  });

  test("discover preview of a minor is denied (fail closed)", async () => {
    const withCookie = await ownerSession();
    const res = await withCookie(
      request(app).get(`/api/agency/discover/${PREVIEW_MINOR}/preview`),
    );

    expect(res.status).toBe(404);
  });
});
