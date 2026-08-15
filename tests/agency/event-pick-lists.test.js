"use strict";

/**
 * Lane C — organizer surfaces for event casting.
 *
 * Exercises the routes through the real router so the RBAC mapping in
 * `lib/route-permissions.js` is under test alongside the handlers: a pick-list
 * mutation that is not mapped to `open_call.manage` would pass a service-level
 * test and fail here.
 *
 * Token minting is mocked. Lane D owns `pick-list-tokens.js` and tests its
 * crypto in `tests/security/pick-share-token.test.js`; what matters here is
 * that the organizer surface asks for material, stores only the hash, and
 * hands back the raw URL exactly once.
 */

process.env.DATABASE_URL = "sqlite://./test-event-pick-lists.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/domains/events/services/pick-list-tokens", () => {
  let counter = 0;
  return {
    buildPickListTokenMaterial: jest.fn(() => {
      counter += 1;
      return {
        rawToken: `raw-token-${counter}`,
        tokenHash: `hash-${counter}`,
        url: `https://app.pholio.test/picks/raw-token-${counter}`,
        expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      };
    }),
    mintPickListToken: jest.fn(async ({ pickListId, db, reissue }) => {
      counter += 1;
      const material = {
        rawToken: `raw-token-${counter}`,
        tokenHash: `hash-${counter}`,
        url: `https://app.pholio.test/picks/raw-token-${counter}`,
        expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      };
      const patch = {
        token_hash: material.tokenHash,
        expires_at: material.expiresAt.toISOString(),
      };
      if (reissue) patch.rotated_at = new Date().toISOString();
      await db("event_pick_lists").where({ id: pickListId }).update(patch);
      return material;
    }),
  };
});

jest.mock("../../src/shared/services/notify-talent-application", () => ({
  notifyTalentForApplicationStatus: jest.fn(),
}));
const {
  notifyTalentForApplicationStatus: notifySpy,
} = require("../../src/shared/services/notify-talent-application");

const knex = require("../../src/shared/db/knex");
const eventsRouter = require("../../src/domains/agency/routes/events");
const {
  CALL_KINDS,
  COMPENSATION_TYPES,
  PICK_LIST_STATUSES,
  PICK_MARKS,
} = require("../../src/shared/constants/event-casting");
const {
  CONFIRMED_APPLICATION_STATUS,
  OFFERED_APPLICATION_STATUSES,
} = require("../../src/shared/constants/application-status");
const {
  resetEventCastingSchemaCache,
} = require("../../src/domains/agency/services/event-pick-lists");

const OFFERED_STATUS = OFFERED_APPLICATION_STATUSES[0];
const TEST_DB_PATH = path.resolve(__dirname, "../../test-event-pick-lists.sqlite3");

const AGENCY_ID = uuidv4();
const OTHER_AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const VIEWER_USER_ID = uuidv4();
const MEMBERSHIP = { owner: uuidv4(), viewer: uuidv4() };
const LINK_ID = uuidv4();
const OTHER_LINK_ID = uuidv4();
const REPRESENTATION_LINK_ID = uuidv4();

const APPLICANTS = [
  { profileId: uuidv4(), applicationId: uuidv4(), first: "Ada", last: "Ames" },
  { profileId: uuidv4(), applicationId: uuidv4(), first: "Bo", last: "Baptiste" },
  { profileId: uuidv4(), applicationId: uuidv4(), first: "Cy", last: "Carter" },
];
/** Belongs to the same agency but a different call — must never be assignable. */
const OFF_CALL = {
  profileId: uuidv4(),
  applicationId: uuidv4(),
  first: "Dev",
  last: "Doyle",
};

const SESSION_MEMBERS = {
  owner: {
    userId: OWNER_USER_ID,
    membershipId: MEMBERSHIP.owner,
    membershipRole: "OWNER",
  },
  viewer: {
    userId: VIEWER_USER_ID,
    membershipId: MEMBERSHIP.viewer,
    membershipRole: "VIEWER",
  },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const member = SESSION_MEMBERS[req.get("x-test-member") || "owner"];
  req.session = {
    userId: AGENCY_ID,
    memberUserId: member.userId,
    agencyId: AGENCY_ID,
    agencyMembershipId: member.membershipId,
    agencyMembershipRole: member.membershipRole,
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(eventsRouter);

async function createSchema() {
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable().unique();
    table.string("role").notNullable();
  });
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
    table.string("org_kind", 24).notNullable().defaultTo("agency");
  });
  await knex.schema.createTable("agency_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.string("membership_role", 20).notNullable();
    table.string("status", 20).notNullable();
  });
  await knex.schema.createTable("agency_membership_permissions", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("membership_id", 36).notNullable();
    table.string("permission_key", 80).notNullable();
    table.string("effect", 5).notNullable();
    table.text("reason").nullable();
    table.string("granted_by_membership_id", 36).nullable();
    table.timestamp("expires_at").nullable();
  });
  await knex.schema.createTable("agency_open_call_links", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("code", 40).notNullable();
    table.string("label", 120).nullable();
    table.string("status", 20).notNullable().defaultTo("active");
    table.string("call_kind", 16).notNullable().defaultTo("representation");
    table.string("compensation_type", 16).nullable();
    table.text("compensation_details").nullable();
    table.string("event_name", 180).nullable();
    table.date("event_starts_on").nullable();
    table.date("event_ends_on").nullable();
    table.string("event_location", 200).nullable();
    table.integer("offer_response_window_hours").notNullable().defaultTo(72);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).nullable();
    table.string("first_name", 100).nullable();
    table.string("last_name", 100).nullable();
    table.string("city", 100).nullable();
    table.integer("height_cm").nullable();
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("status", 40).notNullable();
    table.string("open_call_link_id", 36).nullable();
    table.string("call_purpose", 24).notNullable().defaultTo("representation");
    table.timestamp("accepted_at").nullable();
    table.timestamp("declined_at").nullable();
    table.timestamp("status_changed_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
  await knex.schema.createTable("application_activities", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).nullable();
    table.string("activity_type", 40).notNullable();
    table.text("description").nullable();
    table.text("metadata").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("event_pick_lists", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("open_call_link_id", 36).notNullable();
    table.string("designer_name", 160).notNullable();
    table.string("designer_email", 254).nullable();
    table.string("label", 120).nullable();
    table.text("organizer_note").nullable();
    table.integer("slots_requested").nullable();
    table.string("status", 16).notNullable().defaultTo("draft");
    table.string("token_hash", 64).notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.integer("open_count").notNullable().defaultTo(0);
    table.timestamp("first_opened_at").nullable();
    table.timestamp("last_opened_at").nullable();
    table.timestamp("submitted_at").nullable();
    table.timestamp("revoked_at").nullable();
    table.timestamp("rotated_at").nullable();
    table.string("created_by_user_id", 36).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
  await knex.schema.createTable("event_pick_list_items", (table) => {
    table.string("id", 36).primary();
    table.string("pick_list_id", 36).notNullable();
    table.string("application_id", 36).notNullable();
    table.integer("sort").notNullable().defaultTo(0);
    table.string("added_by_user_id", 36).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["pick_list_id", "application_id"]);
  });
  await knex.schema.createTable("event_pick_selections", (table) => {
    table.string("id", 36).primary();
    table.string("pick_list_id", 36).notNullable();
    table.string("application_id", 36).notNullable();
    table.string("mark", 8).notNullable();
    table.string("note", 300).nullable();
    table.timestamp("marked_at").defaultTo(knex.fn.now());
    table.timestamp("offered_at").nullable();
    table.string("offered_by_user_id", 36).nullable();
    table.unique(["pick_list_id", "application_id"]);
  });
  // The production partial unique (design A5) — one live offer per applicant.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_event_pick_selections_offered_application
      ON event_pick_selections (application_id) WHERE offered_at IS NOT NULL
  `);
}

async function seedFixture() {
  for (const table of [
    "event_pick_selections",
    "event_pick_list_items",
    "event_pick_lists",
    "application_activities",
    "applications",
    "profiles",
    "agency_open_call_links",
    "agency_membership_permissions",
    "agency_memberships",
    "agencies",
    "users",
  ]) {
    await knex(table).del();
  }

  await knex("users").insert([
    { id: OWNER_USER_ID, email: "owner@events.test", role: "AGENCY" },
    { id: VIEWER_USER_ID, email: "viewer@events.test", role: "AGENCY" },
  ]);
  await knex("agencies").insert([
    { id: AGENCY_ID, name: "Fashion Week Brooklyn", org_kind: "event_organizer" },
    { id: OTHER_AGENCY_ID, name: "Somebody Else", org_kind: "agency" },
  ]);
  await knex("agency_memberships").insert([
    {
      id: MEMBERSHIP.owner,
      agency_id: AGENCY_ID,
      user_id: OWNER_USER_ID,
      membership_role: "OWNER",
      status: "ACTIVE",
    },
    {
      id: MEMBERSHIP.viewer,
      agency_id: AGENCY_ID,
      user_id: VIEWER_USER_ID,
      membership_role: "VIEWER",
      status: "ACTIVE",
    },
  ]);
  await knex("agency_open_call_links").insert([
    {
      id: LINK_ID,
      agency_id: AGENCY_ID,
      code: "brooklyn",
      label: "Brooklyn edition",
      call_kind: CALL_KINDS.EVENT_CASTING,
      compensation_type: COMPENSATION_TYPES.STIPEND,
      compensation_details: "$150 per show day",
      event_name: "FWB SS27",
      event_starts_on: "2026-09-04",
      event_ends_on: "2026-09-07",
      event_location: "Brooklyn, NY",
    },
    {
      id: OTHER_LINK_ID,
      agency_id: AGENCY_ID,
      code: "queens",
      label: "Queens edition",
      call_kind: CALL_KINDS.EVENT_CASTING,
      compensation_type: COMPENSATION_TYPES.UNPAID,
    },
    {
      id: REPRESENTATION_LINK_ID,
      agency_id: AGENCY_ID,
      code: "standing",
      label: "Standing open call",
      // Explicit: a multi-row insert fills omitted columns with NULL rather
      // than the column default, and `call_kind` is NOT NULL.
      call_kind: CALL_KINDS.REPRESENTATION,
    },
  ]);

  const rows = [...APPLICANTS, OFF_CALL];
  await knex("profiles").insert(
    rows.map((row) => ({
      id: row.profileId,
      first_name: row.first,
      last_name: row.last,
      city: "Brooklyn",
      height_cm: 178,
    })),
  );
  await knex("applications").insert([
    ...APPLICANTS.map((row, index) => ({
      id: row.applicationId,
      profile_id: row.profileId,
      agency_id: AGENCY_ID,
      status: index === 0 ? "shortlisted" : "pending",
      open_call_link_id: LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: `2026-08-0${index + 1}T10:00:00.000Z`,
    })),
    {
      id: OFF_CALL.applicationId,
      profile_id: OFF_CALL.profileId,
      agency_id: AGENCY_ID,
      status: "pending",
      open_call_link_id: OTHER_LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: "2026-08-04T10:00:00.000Z",
    },
  ]);
}

async function createList(overrides = {}) {
  const response = await request(app)
    .post(`/api/agency/events/${LINK_ID}/pick-lists`)
    .send({
      designerName: "Studio Nomi",
      applicationIds: [APPLICANTS[0].applicationId, APPLICANTS[1].applicationId],
      ...overrides,
    });
  return response;
}

beforeAll(async () => {
  await createSchema();
  resetEventCastingSchemaCache();
}, 30000);
beforeEach(async () => {
  notifySpy.mockClear();
  await seedFixture();
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("event calls", () => {
  test("lists only event calls, with stage counts and the org kind", async () => {
    const response = await request(app).get("/api/agency/events");

    expect(response.status).toBe(200);
    expect(response.body.data.orgKind).toBe("event_organizer");
    const codes = response.body.data.calls.map((call) => call.code);
    expect(codes).toContain("brooklyn");
    expect(codes).not.toContain("standing");

    const brooklyn = response.body.data.calls.find((c) => c.code === "brooklyn");
    expect(brooklyn.counts).toMatchObject({ total: 3, to_review: 2, pool: 1 });
    expect(brooklyn.compensation).toEqual({
      type: COMPENSATION_TYPES.STIPEND,
      details: "$150 per show day",
    });
  });

  test("a representation link is not reachable as an event call", async () => {
    const response = await request(app).get(
      `/api/agency/events/${REPRESENTATION_LINK_ID}/pool`,
    );
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("event_call_not_found");
  });

  test("another agency's call is not reachable", async () => {
    await knex("agency_open_call_links").insert({
      id: uuidv4(),
      agency_id: OTHER_AGENCY_ID,
      code: "theirs",
      call_kind: CALL_KINDS.EVENT_CASTING,
    });
    const theirs = await knex("agency_open_call_links")
      .where({ agency_id: OTHER_AGENCY_ID })
      .first();

    const response = await request(app).get(
      `/api/agency/events/${theirs.id}/pick-lists`,
    );
    expect(response.status).toBe(404);
  });
});

describe("pool", () => {
  test("returns only this call's applicants, paginated", async () => {
    const response = await request(app).get(
      `/api/agency/events/${LINK_ID}/pool?limit=2`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.applicants).toHaveLength(2);
    expect(response.body.data.limit).toBe(2);
    const names = response.body.data.applicants.map((a) => a.name);
    expect(names).not.toContain("Dev Doyle");
  });

  test("filters by lifecycle stage and rejects an invented one", async () => {
    const pool = await request(app).get(
      `/api/agency/events/${LINK_ID}/pool?stage=pool`,
    );
    expect(pool.body.data.total).toBe(1);
    expect(pool.body.data.applicants[0].name).toBe("Ada Ames");

    const bogus = await request(app).get(
      `/api/agency/events/${LINK_ID}/pool?stage=vibes`,
    );
    expect(bogus.status).toBe(400);
    expect(bogus.body.error).toBe("invalid_stage");
  });

  test("caps the page size rather than honouring an unbounded limit (R7)", async () => {
    const response = await request(app).get(
      `/api/agency/events/${LINK_ID}/pool?limit=100000`,
    );
    expect(response.body.data.limit).toBe(200);
  });
});

describe("pick list CRUD", () => {
  test("create returns the raw URL once and stores only the hash", async () => {
    const response = await createList();

    expect(response.status).toBe(201);
    expect(response.body.data.url).toMatch(/\/picks\/raw-token-/);
    expect(response.body.data.pickList.itemCount).toBe(2);
    expect(response.body.data.pickList.status).toBe(PICK_LIST_STATUSES.OPEN);

    const row = await knex("event_pick_lists")
      .where({ id: response.body.data.pickList.id })
      .first();
    expect(row.token_hash).toMatch(/^hash-/);
    // The raw token appears nowhere in the stored row.
    expect(JSON.stringify(row)).not.toContain("raw-token-");

    // And it is never served again by a subsequent read.
    const listed = await request(app).get(
      `/api/agency/events/${LINK_ID}/pick-lists`,
    );
    expect(JSON.stringify(listed.body)).not.toContain("raw-token-");
  });

  test("refuses applicants from another call", async () => {
    const response = await createList({
      applicationIds: [APPLICANTS[0].applicationId, OFF_CALL.applicationId],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("applications_not_in_call");
    expect(await knex("event_pick_lists").count({ c: "*" }).first()).toMatchObject({
      c: 0,
    });
  });

  test("requires a designer name", async () => {
    const response = await createList({ designerName: "   " });
    expect(response.status).toBe(400);
    expect(response.body.field).toBe("designerName");
  });

  test("bulk add and remove items, skipping duplicates", async () => {
    const created = await createList();
    const listId = created.body.data.pickList.id;

    const added = await request(app)
      .post(`/api/agency/events/pick-lists/${listId}/items`)
      .send({
        applicationIds: [
          APPLICANTS[1].applicationId,
          APPLICANTS[2].applicationId,
        ],
      });
    expect(added.body.data).toMatchObject({ added: 1, skipped: 1, itemCount: 3 });

    const removed = await request(app)
      .delete(`/api/agency/events/pick-lists/${listId}/items`)
      .send({ applicationIds: [APPLICANTS[0].applicationId] });
    expect(removed.body.data).toMatchObject({ removed: 1, itemCount: 2 });
  });

  test("removing an applicant clears an unanswered mark but never an offer", async () => {
    const created = await createList();
    const listId = created.body.data.pickList.id;
    await knex("event_pick_selections").insert([
      {
        id: uuidv4(),
        pick_list_id: listId,
        application_id: APPLICANTS[0].applicationId,
        mark: PICK_MARKS.PICK,
      },
      {
        id: uuidv4(),
        pick_list_id: listId,
        application_id: APPLICANTS[1].applicationId,
        mark: PICK_MARKS.PICK,
        offered_at: new Date().toISOString(),
      },
    ]);

    await request(app)
      .delete(`/api/agency/events/pick-lists/${listId}/items`)
      .send({
        applicationIds: [
          APPLICANTS[0].applicationId,
          APPLICANTS[1].applicationId,
        ],
      });

    const remaining = await knex("event_pick_selections").select("application_id");
    expect(remaining.map((r) => r.application_id)).toEqual([
      APPLICANTS[1].applicationId,
    ]);
  });

  test("reissue rotates the hash; revoke is terminal", async () => {
    const created = await createList();
    const listId = created.body.data.pickList.id;
    const before = await knex("event_pick_lists").where({ id: listId }).first();

    const reissued = await request(app).post(
      `/api/agency/events/pick-lists/${listId}/reissue`,
    );
    expect(reissued.status).toBe(200);
    expect(reissued.body.data.url).toMatch(/\/picks\/raw-token-/);
    const after = await knex("event_pick_lists").where({ id: listId }).first();
    expect(after.token_hash).not.toBe(before.token_hash);
    expect(after.rotated_at).toBeTruthy();

    const revoked = await request(app).post(
      `/api/agency/events/pick-lists/${listId}/revoke`,
    );
    expect(revoked.body.data.status).toBe(PICK_LIST_STATUSES.REVOKED);

    const reReissue = await request(app).post(
      `/api/agency/events/pick-lists/${listId}/reissue`,
    );
    expect(reReissue.status).toBe(409);
    expect(reReissue.body.error).toBe("pick_list_revoked");
  });
});

describe("rollups and selections", () => {
  test("a pick list reports its items and the marks that came back", async () => {
    const created = await createList();
    const listId = created.body.data.pickList.id;
    await knex("event_pick_selections").insert([
      {
        id: uuidv4(),
        pick_list_id: listId,
        application_id: APPLICANTS[0].applicationId,
        mark: PICK_MARKS.PICK,
        note: "Opening look",
      },
      {
        id: uuidv4(),
        pick_list_id: listId,
        application_id: APPLICANTS[1].applicationId,
        mark: PICK_MARKS.PASS,
      },
    ]);

    const listed = await request(app).get(
      `/api/agency/events/${LINK_ID}/pick-lists`,
    );
    expect(listed.body.data[0]).toMatchObject({
      itemCount: 2,
      markedCount: 2,
      marks: { pick: 1, maybe: 0, pass: 1 },
    });

    const selections = await request(app).get(
      `/api/agency/events/pick-lists/${listId}/selections`,
    );
    expect(selections.body.data.selections).toEqual([
      expect.objectContaining({
        name: "Ada Ames",
        mark: PICK_MARKS.PICK,
        note: "Opening look",
      }),
      expect.objectContaining({ name: "Bo Baptiste", mark: PICK_MARKS.PASS }),
    ]);
  });

  test("a designer's mark never moves the application", async () => {
    const created = await createList();
    await knex("event_pick_selections").insert({
      id: uuidv4(),
      pick_list_id: created.body.data.pickList.id,
      application_id: APPLICANTS[1].applicationId,
      mark: PICK_MARKS.PICK,
    });

    const application = await knex("applications")
      .where({ id: APPLICANTS[1].applicationId })
      .first();
    expect(application.status).toBe("pending");
  });

  test("the lineup groups by designer and by applicant", async () => {
    const nomi = await createList({ designerName: "Studio Nomi" });
    const kade = await createList({
      designerName: "Atelier Kade",
      applicationIds: [APPLICANTS[0].applicationId],
    });
    await knex("event_pick_selections").insert([
      {
        id: uuidv4(),
        pick_list_id: nomi.body.data.pickList.id,
        application_id: APPLICANTS[0].applicationId,
        mark: PICK_MARKS.PICK,
      },
      {
        id: uuidv4(),
        pick_list_id: nomi.body.data.pickList.id,
        application_id: APPLICANTS[1].applicationId,
        mark: PICK_MARKS.MAYBE,
      },
      {
        id: uuidv4(),
        pick_list_id: kade.body.data.pickList.id,
        application_id: APPLICANTS[0].applicationId,
        mark: PICK_MARKS.PICK,
      },
    ]);

    const response = await request(app).get(
      `/api/agency/events/${LINK_ID}/lineup`,
    );
    expect(response.status).toBe(200);
    // Most-wanted first: two designers picked Ada.
    expect(response.body.data.applicants[0]).toMatchObject({
      name: "Ada Ames",
      status: "shortlisted",
    });
    expect(response.body.data.applicants[0].pickedBy).toHaveLength(2);
    expect(response.body.data.applicants[1].maybeBy).toHaveLength(1);
    expect(response.body.data.counts).toMatchObject({ claimed: 2, offered: 0 });
    expect(response.body.data.designers).toHaveLength(2);
  });
});

describe("offers", () => {
  test("an offer writes the ordinary accepted status and notifies the talent", async () => {
    const created = await createList();
    const listId = created.body.data.pickList.id;
    await knex("event_pick_selections").insert({
      id: uuidv4(),
      pick_list_id: listId,
      application_id: APPLICANTS[0].applicationId,
      mark: PICK_MARKS.PICK,
    });

    const response = await request(app)
      .post(`/api/agency/events/${LINK_ID}/offers`)
      .send({
        applicationIds: [APPLICANTS[0].applicationId],
        pickListId: listId,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.offered).toEqual([APPLICANTS[0].applicationId]);

    const application = await knex("applications")
      .where({ id: APPLICANTS[0].applicationId })
      .first();
    expect(application.status).toBe(OFFERED_STATUS);
    expect(application.accepted_at).toBeTruthy();
    // The response window runs from the offer, so the clock restarts here.
    expect(application.status_changed_at).toBeTruthy();

    const selection = await knex("event_pick_selections")
      .where({ pick_list_id: listId, application_id: APPLICANTS[0].applicationId })
      .first();
    expect(selection.offered_at).toBeTruthy();
    expect(selection.offered_by_user_id).toBe(OWNER_USER_ID);

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: OFFERED_STATUS, agencyId: AGENCY_ID }),
    );

    const activity = await knex("application_activities")
      .where({ application_id: APPLICANTS[0].applicationId })
      .first();
    expect(activity.activity_type).toBe("status_change");
  });

  test("one live offer per applicant — a second designer's list is refused", async () => {
    const nomi = await createList();
    const kade = await createList({
      designerName: "Atelier Kade",
      applicationIds: [APPLICANTS[0].applicationId],
    });

    const first = await request(app)
      .post(`/api/agency/events/${LINK_ID}/offers`)
      .send({
        applicationIds: [APPLICANTS[0].applicationId],
        pickListId: nomi.body.data.pickList.id,
      });
    expect(first.body.data.offered).toHaveLength(1);

    const second = await request(app)
      .post(`/api/agency/events/${LINK_ID}/offers`)
      .send({
        applicationIds: [APPLICANTS[0].applicationId],
        pickListId: kade.body.data.pickList.id,
      });
    expect(second.body.data.offered).toEqual([]);
    expect(second.body.data.skipped).toEqual([
      { applicationId: APPLICANTS[0].applicationId, reason: "already_offered" },
    ]);

    const offers = await knex("event_pick_selections").whereNotNull("offered_at");
    expect(offers).toHaveLength(1);
  });

  test("an applicant who already confirmed is left alone", async () => {
    await knex("applications")
      .where({ id: APPLICANTS[2].applicationId })
      .update({ status: CONFIRMED_APPLICATION_STATUS });

    const response = await request(app)
      .post(`/api/agency/events/${LINK_ID}/offers`)
      .send({ applicationIds: [APPLICANTS[2].applicationId] });

    expect(response.body.data.skipped).toEqual([
      {
        applicationId: APPLICANTS[2].applicationId,
        reason: "already_confirmed",
      },
    ]);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  test("an applicant from another call cannot be offered this call's slot", async () => {
    const response = await request(app)
      .post(`/api/agency/events/${LINK_ID}/offers`)
      .send({ applicationIds: [OFF_CALL.applicationId] });

    expect(response.body.data.offered).toEqual([]);
    expect(response.body.data.skipped[0].reason).toBe("not_in_call");
  });
});

describe("permissions", () => {
  test("a VIEWER may read the surface but not create a pick list", async () => {
    const read = await request(app)
      .get(`/api/agency/events/${LINK_ID}/pick-lists`)
      .set("x-test-member", "viewer");
    expect(read.status).toBe(200);

    const write = await request(app)
      .post(`/api/agency/events/${LINK_ID}/pick-lists`)
      .set("x-test-member", "viewer")
      .send({ designerName: "Studio Nomi" });
    expect(write.status).toBe(403);
  });

  test("a VIEWER cannot offer a slot", async () => {
    const response = await request(app)
      .post(`/api/agency/events/${LINK_ID}/offers`)
      .set("x-test-member", "viewer")
      .send({ applicationIds: [APPLICANTS[0].applicationId] });

    expect(response.status).toBe(403);
    const application = await knex("applications")
      .where({ id: APPLICANTS[0].applicationId })
      .first();
    expect(application.status).toBe("shortlisted");
  });

  test("every event route resolves to an open_call permission", () => {
    const {
      resolveRoutePermission,
    } = require("../../src/domains/agency/lib/route-permissions");
    const id = "11111111-1111-4111-8111-111111111111";
    const cases = [
      ["GET", "/api/agency/events", "open_call.view"],
      ["GET", `/api/agency/events/${id}`, "open_call.view"],
      ["GET", `/api/agency/events/${id}/pool`, "open_call.view"],
      ["GET", `/api/agency/events/${id}/lineup`, "open_call.view"],
      ["GET", `/api/agency/events/${id}/pick-lists`, "open_call.view"],
      ["POST", `/api/agency/events/${id}/pick-lists`, "open_call.manage"],
      ["POST", `/api/agency/events/${id}/offers`, "open_call.manage"],
      ["PATCH", `/api/agency/events/pick-lists/${id}`, "open_call.manage"],
      ["POST", `/api/agency/events/pick-lists/${id}/reissue`, "open_call.manage"],
      ["POST", `/api/agency/events/pick-lists/${id}/revoke`, "open_call.manage"],
      ["POST", `/api/agency/events/pick-lists/${id}/items`, "open_call.manage"],
      ["DELETE", `/api/agency/events/pick-lists/${id}/items`, "open_call.manage"],
      [
        "GET",
        `/api/agency/events/pick-lists/${id}/selections`,
        "open_call.view",
      ],
    ];
    for (const [method, routePath, expected] of cases) {
      expect([method, routePath, resolveRoutePermission(method, routePath)]).toEqual([
        method,
        routePath,
        expected,
      ]);
    }
  });
});
