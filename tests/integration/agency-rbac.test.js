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

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";
const TEST_DB_PATH = path.resolve(__dirname, "../../test-agency-rbac.sqlite3");

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
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else if (!(await knex.schema.hasColumn("users", "account_status"))) {
    await knex.schema.alterTable("users", (t) => {
      t.string("account_status").notNullable().defaultTo("ACTIVE");
    });
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

  if (!(await knex.schema.hasTable("social_accounts"))) {
    await knex.schema.createTable("social_accounts", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).nullable();
      t.string("agency_id", 36).nullable();
      t.string("platform", 50).notNullable();
      t.string("handle", 255).nullable();
      t.string("url", 500).nullable();
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
    expect(membership.status).toBe("ACTIVE");

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
