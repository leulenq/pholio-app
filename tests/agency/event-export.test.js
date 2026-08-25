"use strict";

/**
 * Lane C — the event call sheet, exported.
 *
 * The export is an EXTENSION of `/api/agency/export`, not a second endpoint
 * (design §f): same route, same `org.export_data` permission, same
 * `org.data_exported` audit event, same `escapeCsvValue`. These tests exist to
 * hold that line — a representation export must come back byte-identical to
 * what it was before event casting existed, and the six event columns must
 * appear only when the export is scoped to a call.
 *
 * The companion suite `tests/integration/agency-inbox-export.test.js` covers
 * the representation export against a schema with no event columns at all;
 * this one covers a fully migrated shape.
 */

process.env.DATABASE_URL = "sqlite://./test-event-export.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/domains/agency/services/discover-search", () => ({
  searchDiscoverableTalent: jest.fn(),
}));

const knex = require("../../src/shared/db/knex");
const agencyInboxRouter = require("../../src/domains/agency/routes/inbox");
const {
  CALL_KINDS,
  COMPENSATION_TYPES,
  PICK_MARKS,
} = require("../../src/shared/constants/event-casting");
const {
  CONFIRMED_APPLICATION_STATUS,
} = require("../../src/shared/constants/application-status");

const TEST_DB_PATH = path.resolve(__dirname, "../../test-event-export.sqlite3");

const AGENCY_ID = uuidv4();
const OTHER_AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const VIEWER_USER_ID = uuidv4();
const MEMBERSHIP = { owner: uuidv4(), viewer: uuidv4() };
const EVENT_LINK_ID = uuidv4();
const OTHER_LINK_ID = uuidv4();
const PICK_LIST_ID = uuidv4();
const SECOND_PICK_LIST_ID = uuidv4();
const FOREIGN_PICK_LIST_ID = uuidv4();

const ADA = { profileId: uuidv4(), applicationId: uuidv4(), packageId: uuidv4() };
const BO = { profileId: uuidv4(), applicationId: uuidv4(), packageId: uuidv4() };
/** Applied to a different call — must not appear in an event-scoped export. */
const CY = { profileId: uuidv4(), applicationId: uuidv4() };

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
app.use(agencyInboxRouter);

/** Header → cell, so an assertion names the column instead of an index. */
function parseCsv(text) {
  const [headerLine, ...rows] = text.split("\n");
  const headers = splitCsvLine(headerLine);
  return {
    headers,
    rows: rows.filter(Boolean).map((line) => {
      const cells = splitCsvLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    }),
  };
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

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
  await knex.schema.createTable("agency_audit_events", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("actor_membership_id", 36).nullable();
    table.string("actor_user_id", 36).nullable();
    table.string("event_type", 60).notNullable();
    table.string("target_type", 40).nullable();
    table.string("target_id", 36).nullable();
    table.text("summary").notNullable();
    table.text("before_state").nullable();
    table.text("after_state").nullable();
    table.string("ip_address", 45).nullable();
    table.text("user_agent").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
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
    table.date("event_ends_on").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).nullable();
    table.string("first_name", 100).nullable();
    table.string("last_name", 100).nullable();
    table.string("city", 100).nullable();
    table.integer("height_cm").nullable();
    table.integer("bust_cm").nullable();
    table.integer("waist_cm").nullable();
    table.integer("hips_cm").nullable();
    table.string("date_of_birth", 40).nullable();
    table.text("bio_curated").nullable();
    // The rest of the AGENCY_SUBMISSION audience projection, so the
    // submissions list (not just the export) can run against this fixture.
    table.string("slug", 120).nullable();
    table.string("gender", 30).nullable();
    table.string("stats_track", 30).nullable();
    table.integer("chest_cm").nullable();
    table.integer("inseam_cm").nullable();
    table.string("shoe_size", 20).nullable();
    table.string("dress_size", 20).nullable();
    table.string("suit_size", 20).nullable();
    table.string("hair_color", 40).nullable();
    table.string("eye_color", 40).nullable();
    table.timestamp("measurements_updated_at").nullable();
    table.string("nationality", 60).nullable();
    table.timestamp("guardian_consent_at").nullable();
    table.text("languages").nullable();
    table.text("bio_raw").nullable();
    table.string("phone", 40).nullable();
    table.integer("weight_kg").nullable();
    table.integer("weight_lbs").nullable();
    table.string("weight_unit", 10).nullable();
    table.boolean("is_discoverable").nullable().defaultTo(true);
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
  });
  await knex.schema.createTable("application_notes", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.text("note").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("application_tags", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("tag", 100).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("talent_submission_packages", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).nullable();
    table.string("profile_id", 36).nullable();
    table.text("payload").nullable();
    table.timestamp("revoked_at").nullable();
    table.timestamp("redacted_at").nullable();
    // The submissions list sweeps expired packages before reading them.
    table.timestamp("retention_expires_at").nullable();
    table.text("redaction_reason").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  // Only reached by an applicant with no frozen package (the legacy
  // live-profile fallback) — Cy, in this fixture.
  await knex.schema.createTable("images", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("path", 400).nullable();
    table.string("public_url", 400).nullable();
    table.boolean("is_primary").nullable();
    table.integer("sort").nullable();
    table.string("status", 20).nullable();
    table.boolean("exclude_from_agency").nullable();
    table.string("moderation_status", 20).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("social_accounts", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("platform", 40).nullable();
    table.string("handle", 120).nullable();
    table.string("url", 400).nullable();
    table.integer("follower_count").nullable();
    table.float("engagement_rate").nullable();
    table.boolean("is_oauth_connected").nullable();
    table.timestamp("metrics_updated_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
  await knex.schema.createTable("event_pick_lists", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("open_call_link_id", 36).notNullable();
    table.string("designer_name", 160).notNullable();
    table.string("status", 16).notNullable().defaultTo("open");
    table.string("token_hash", 64).notNullable().unique();
    table.timestamp("expires_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("event_pick_list_items", (table) => {
    table.string("id", 36).primary();
    table.string("pick_list_id", 36).notNullable();
    table.string("application_id", 36).notNullable();
    table.integer("sort").notNullable().defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("event_pick_selections", (table) => {
    table.string("id", 36).primary();
    table.string("pick_list_id", 36).notNullable();
    table.string("application_id", 36).notNullable();
    table.string("mark", 8).notNullable();
    table.string("note", 300).nullable();
    table.timestamp("offered_at").nullable();
  });
}

async function seedFixture() {
  for (const table of [
    "social_accounts",
    "images",
    "event_pick_selections",
    "event_pick_list_items",
    "event_pick_lists",
    "talent_submission_packages",
    "application_tags",
    "application_notes",
    "applications",
    "profiles",
    "agency_open_call_links",
    "agency_audit_events",
    "agency_membership_permissions",
    "agency_memberships",
    "agencies",
    "users",
  ]) {
    await knex(table).del();
  }

  await knex("users").insert([
    { id: OWNER_USER_ID, email: "owner@export.test", role: "AGENCY" },
    { id: VIEWER_USER_ID, email: "viewer@export.test", role: "AGENCY" },
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
      id: EVENT_LINK_ID,
      agency_id: AGENCY_ID,
      code: "brooklyn",
      label: "Brooklyn edition",
      call_kind: CALL_KINDS.EVENT_CASTING,
      compensation_type: COMPENSATION_TYPES.STIPEND,
      compensation_details: "$150 per show day, paid within 30 days",
      event_name: "FWB SS27",
      event_ends_on: "2026-09-07",
    },
    {
      id: OTHER_LINK_ID,
      agency_id: AGENCY_ID,
      code: "standing",
      label: "Standing open call",
      call_kind: CALL_KINDS.REPRESENTATION,
    },
  ]);

  await knex("profiles").insert([
    {
      id: ADA.profileId,
      first_name: "Ada",
      last_name: "Ames",
      city: "Brooklyn",
      height_cm: 178,
      date_of_birth: "1999-04-12",
      bio_curated: "Runway and editorial.",
    },
    {
      id: BO.profileId,
      first_name: "Bo",
      last_name: "Baptiste",
      city: "Queens",
      height_cm: 181,
      date_of_birth: "1998-02-02",
      bio_curated: "Runway.",
    },
    {
      id: CY.profileId,
      first_name: "Cy",
      last_name: "Carter",
      city: "Bronx",
      height_cm: 175,
      date_of_birth: "1997-06-06",
      bio_curated: "Commercial.",
    },
  ]);
  await knex("applications").insert([
    {
      id: ADA.applicationId,
      profile_id: ADA.profileId,
      agency_id: AGENCY_ID,
      status: CONFIRMED_APPLICATION_STATUS,
      open_call_link_id: EVENT_LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      status_changed_at: "2026-08-20T09:30:00.000Z",
      created_at: "2026-08-01T10:00:00.000Z",
    },
    {
      id: BO.applicationId,
      profile_id: BO.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      open_call_link_id: EVENT_LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: "2026-08-02T10:00:00.000Z",
    },
    {
      id: CY.applicationId,
      profile_id: CY.profileId,
      agency_id: AGENCY_ID,
      status: "pending",
      open_call_link_id: OTHER_LINK_ID,
      call_purpose: CALL_KINDS.REPRESENTATION,
      created_at: "2026-08-03T10:00:00.000Z",
    },
  ]);

  await knex("talent_submission_packages").insert([
    {
      id: ADA.packageId,
      application_id: ADA.applicationId,
      profile_id: ADA.profileId,
      payload: JSON.stringify({
        availability: { from: "2026-09-04", to: "2026-09-07" },
        walkVideoUrl: "https://vimeo.com/ada-walk",
      }),
    },
    {
      id: BO.packageId,
      application_id: BO.applicationId,
      profile_id: BO.profileId,
      // The nested shape the intake writes when it carries an event context.
      payload: JSON.stringify({
        eventContext: {
          availability: { from: "2026-09-05", to: "2026-09-06", note: "Evenings only" },
          walkVideoUrl: "https://youtu.be/bo-walk",
        },
      }),
    },
  ]);

  await knex("event_pick_lists").insert([
    {
      id: PICK_LIST_ID,
      agency_id: AGENCY_ID,
      open_call_link_id: EVENT_LINK_ID,
      // A comma in the designer name proves the CSV escaping still applies.
      designer_name: "Nomi, Studio",
      token_hash: "hash-1",
      created_at: "2026-08-10T10:00:00.000Z",
    },
    {
      id: SECOND_PICK_LIST_ID,
      agency_id: AGENCY_ID,
      open_call_link_id: EVENT_LINK_ID,
      designer_name: "Atelier Kade",
      token_hash: "hash-2",
      created_at: "2026-08-11T10:00:00.000Z",
    },
    {
      id: FOREIGN_PICK_LIST_ID,
      agency_id: OTHER_AGENCY_ID,
      open_call_link_id: EVENT_LINK_ID,
      designer_name: "Not Yours",
      token_hash: "hash-3",
      created_at: "2026-08-12T10:00:00.000Z",
    },
  ]);
  await knex("event_pick_list_items").insert([
    { id: uuidv4(), pick_list_id: PICK_LIST_ID, application_id: ADA.applicationId },
    { id: uuidv4(), pick_list_id: PICK_LIST_ID, application_id: BO.applicationId },
    {
      id: uuidv4(),
      pick_list_id: SECOND_PICK_LIST_ID,
      application_id: ADA.applicationId,
    },
  ]);
  await knex("event_pick_selections").insert([
    {
      id: uuidv4(),
      pick_list_id: PICK_LIST_ID,
      application_id: ADA.applicationId,
      mark: PICK_MARKS.PICK,
      offered_at: "2026-08-15T10:00:00.000Z",
    },
    {
      id: uuidv4(),
      pick_list_id: SECOND_PICK_LIST_ID,
      application_id: ADA.applicationId,
      mark: PICK_MARKS.MAYBE,
    },
    // Bo is on Nomi's list but Nomi has not answered for him yet.
  ]);
}

beforeAll(createSchema, 30000);
beforeEach(seedFixture);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("representation export is untouched", () => {
  test("an unscoped export carries no event columns and every application", async () => {
    const response = await request(app).get("/api/agency/export");

    expect(response.status).toBe(200);
    const csv = parseCsv(response.text);
    expect(csv.headers).not.toContain("Designer");
    expect(csv.headers).not.toContain("Walk Video URL");
    expect(csv.rows).toHaveLength(3);
  });

  test("its audit record keeps exactly the shape it always had", async () => {
    await request(app).get("/api/agency/export?format=json");

    const event = await knex("agency_audit_events")
      .where({ event_type: "org.data_exported" })
      .first();
    expect(JSON.parse(event.after_state)).toEqual({
      format: "json",
      application_count: 3,
      include_notes: false,
    });
  });
});

describe("?openCallLinkId=", () => {
  test("scopes to the call and appends the six event columns", async () => {
    const response = await request(app).get(
      `/api/agency/export?openCallLinkId=${EVENT_LINK_ID}`,
    );

    expect(response.status).toBe(200);
    const csv = parseCsv(response.text);
    expect(csv.headers.slice(-6)).toEqual([
      "Designer",
      "Mark",
      "Availability",
      "Walk Video URL",
      "Compensation",
      "Confirmed Date",
    ]);
    expect(csv.rows.map((row) => row.Name)).toEqual(["Ada Ames", "Bo Baptiste"]);
  });

  test("Designer and Mark line up positionally, including a silent designer", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}`,
    );

    const [ada, bo] = response.body.applications;
    expect(ada.designer).toBe("Nomi, Studio, Atelier Kade");
    expect(ada.mark).toBe(`${PICK_MARKS.PICK}, ${PICK_MARKS.MAYBE}`);
    // On a list, no answer yet — an em dash, not an empty cell.
    expect(bo.designer).toBe("Nomi, Studio");
    expect(bo.mark).toBe("—");
  });

  test("a designer name containing a comma is still escaped by escapeCsvValue", async () => {
    const response = await request(app).get(
      `/api/agency/export?openCallLinkId=${EVENT_LINK_ID}`,
    );
    expect(response.text).toContain('"Nomi, Studio, Atelier Kade"');
    // And the parsed cell survives the round trip as one value.
    expect(parseCsv(response.text).rows[0].Designer).toBe(
      "Nomi, Studio, Atelier Kade",
    );
  });

  test("availability and walk video come off the frozen package, both shapes", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}`,
    );

    const [ada, bo] = response.body.applications;
    expect(ada.availability).toBe("2026-09-04 to 2026-09-07");
    expect(ada.walk_video_url).toBe("https://vimeo.com/ada-walk");
    expect(bo.availability).toBe("2026-09-05 to 2026-09-06 — Evenings only");
    expect(bo.walk_video_url).toBe("https://youtu.be/bo-walk");
  });

  test("a redacted package exports nothing rather than its contents", async () => {
    await knex("talent_submission_packages")
      .where({ id: ADA.packageId })
      .update({ redacted_at: "2026-08-21T00:00:00.000Z" });

    const response = await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}`,
    );
    expect(response.body.applications[0]).toMatchObject({
      availability: "",
      walk_video_url: "",
    });
  });

  test("compensation is restated verbatim from the call", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}`,
    );
    expect(response.body.applications[0].compensation).toBe(
      "STIPEND — $150 per show day, paid within 30 days",
    );
  });

  test("only a confirmed applicant carries a confirmed date", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}`,
    );
    const [ada, bo] = response.body.applications;
    expect(ada.confirmed_date).toBe("2026-08-20T09:30:00.000Z");
    expect(bo.confirmed_date).toBe("");
  });

  test("combines with the existing status filter", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}&status=${CONFIRMED_APPLICATION_STATUS}`,
    );
    expect(response.body.applications.map((a) => a.name)).toEqual(["Ada Ames"]);
  });

  test("an unknown call is a 404, not an empty export", async () => {
    const response = await request(app).get(
      `/api/agency/export?openCallLinkId=${uuidv4()}`,
    );
    expect(response.status).toBe(404);
  });
});

describe("?pickListId=", () => {
  test("narrows to that designer's slice and still carries event columns", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&pickListId=${SECOND_PICK_LIST_ID}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.applications.map((a) => a.name)).toEqual(["Ada Ames"]);
    expect(response.body.applications[0].compensation).toBe(
      "STIPEND — $150 per show day, paid within 30 days",
    );
  });

  test("another agency's pick list is a 404", async () => {
    const response = await request(app).get(
      `/api/agency/export?format=json&pickListId=${FOREIGN_PICK_LIST_ID}`,
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/agency/applications?openCallLinkId=", () => {
  /* The organizer's pool triage is this endpoint with a link filter — ruling
     R10's "no second inbox", enforced at the data layer. */
  test("scopes the desk to one call", async () => {
    const response = await request(app).get(
      `/api/agency/applications?openCallLinkId=${EVENT_LINK_ID}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.profiles.map((p) => p.first_name).sort()).toEqual([
      "Ada",
      "Bo",
    ]);
  });

  test("unscoped, it still returns every application", async () => {
    const response = await request(app).get("/api/agency/applications");
    expect(response.body.profiles).toHaveLength(3);
  });

  test("another agency's call id returns nothing rather than their rows", async () => {
    const foreignLink = uuidv4();
    await knex("agency_open_call_links").insert({
      id: foreignLink,
      agency_id: OTHER_AGENCY_ID,
      code: "theirs",
      call_kind: CALL_KINDS.EVENT_CASTING,
    });

    const response = await request(app).get(
      `/api/agency/applications?openCallLinkId=${foreignLink}`,
    );
    expect(response.body.profiles).toEqual([]);
  });
});

describe("the export's own guarantees still hold when it is event-scoped", () => {
  test("the audit event records the scope", async () => {
    await request(app).get(
      `/api/agency/export?format=json&openCallLinkId=${EVENT_LINK_ID}&pickListId=${PICK_LIST_ID}`,
    );

    const event = await knex("agency_audit_events")
      .where({ event_type: "org.data_exported" })
      .first();
    expect(event).toMatchObject({ target_type: "applications" });
    expect(JSON.parse(event.after_state)).toEqual({
      format: "json",
      application_count: 2,
      include_notes: false,
      open_call_link_id: EVENT_LINK_ID,
      pick_list_id: PICK_LIST_ID,
    });
  });

  test("a VIEWER is denied by RBAC, and by the role floor even if granted", async () => {
    const unGranted = await request(app)
      .get(`/api/agency/export?openCallLinkId=${EVENT_LINK_ID}`)
      .set("x-test-member", "viewer");
    expect(unGranted.status).toBe(403);

    // Export sits behind BOTH `org.export_data` and an OWNER/ADMIN floor.
    // Granting the permission must still not open an event export to a viewer.
    await knex("agency_membership_permissions").insert({
      id: uuidv4(),
      agency_id: AGENCY_ID,
      membership_id: MEMBERSHIP.viewer,
      permission_key: "org.export_data",
      effect: "ALLOW",
    });

    const granted = await request(app)
      .get(`/api/agency/export?openCallLinkId=${EVENT_LINK_ID}`)
      .set("x-test-member", "viewer");
    expect(granted.status).toBe(403);
    expect(granted.body.requiredMembershipRoles).toEqual(["OWNER", "ADMIN"]);
  });
});
