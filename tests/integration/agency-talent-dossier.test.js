// tests/integration/agency-talent-dossier.test.js
"use strict";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-agency-dossier.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";

const fs = require("fs");
const path = require("path");
const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;
const TEST_DB_PATH = path.resolve(__dirname, "../../test-agency-dossier.sqlite3");

const AGENCY_ID = uuidv4();
const OTHER_AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PEER_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const PEER_PROFILE_ID = uuidv4();
const APPLICATION_ID = uuidv4();
const BOARD_ID = uuidv4();

const iso = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString();
const day = (offsetDays = 0) => iso(offsetDays).slice(0, 10);

async function createSchema() {
  const create = async (name, build) => {
    if (!(await knex.schema.hasTable(name))) await knex.schema.createTable(name, build);
  };

  await create("users", (t) => {
    t.string("id", 36).primary();
    t.string("email").notNullable().unique();
    t.string("role").notNullable();
    t.string("account_status").notNullable().defaultTo("ACTIVE");
    t.string("first_name", 100).nullable();
    t.string("last_name", 100).nullable();
    t.string("avatar_url", 2048).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("sessions", (t) => {
    t.string("sid", 255).primary();
    t.json("sess").notNullable();
    t.timestamp("expired").notNullable();
  });

  await create("agencies", (t) => {
    t.string("id", 36).primary();
    t.string("name").notNullable();
    t.string("status").notNullable().defaultTo("ACTIVE");
    t.timestamp("onboarding_completed_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("agency_memberships", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("user_id", 36).notNullable();
    t.string("membership_role").notNullable();
    t.string("status").notNullable().defaultTo("ACTIVE");
    t.timestamp("invited_at").nullable();
    t.timestamp("joined_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("agency_membership_permissions", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("membership_id", 36).notNullable();
    t.string("permission_key", 80).notNullable();
    t.string("effect", 5).notNullable();
    t.text("reason").nullable();
    t.string("granted_by_membership_id", 36).nullable();
    t.timestamp("expires_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("agency_audit_events", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("event_type", 60).notNullable();
    t.text("summary").notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("profiles", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).nullable();
    t.string("slug", 200).nullable();
    t.string("first_name", 100).nullable();
    t.string("last_name", 100).nullable();
    t.string("city", 100).nullable();
    t.string("city_secondary", 100).nullable();
    t.string("gender", 30).nullable();
    t.string("archetype", 60).nullable();
    t.string("stats_track", 30).nullable();
    t.integer("height_cm").nullable();
    t.integer("bust_cm").nullable();
    t.integer("chest_cm").nullable();
    t.integer("waist_cm").nullable();
    t.integer("hips_cm").nullable();
    t.integer("inseam_cm").nullable();
    t.string("shoe_size", 20).nullable();
    t.string("dress_size", 20).nullable();
    t.string("suit_size", 20).nullable();
    t.string("hair_color", 40).nullable();
    t.string("hair_length", 40).nullable();
    t.string("hair_type", 40).nullable();
    t.string("eye_color", 40).nullable();
    t.timestamp("measurements_updated_at").nullable();
    t.timestamp("measured_in_person_at").nullable();
    t.string("measured_by_agency_id", 36).nullable();
    t.string("availability_status", 40).nullable();
    t.string("market", 32).nullable();
    t.string("nationality", 80).nullable();
    t.string("date_of_birth", 40).nullable();
    t.timestamp("guardian_consent_at").nullable();
    t.text("languages").nullable();
    t.text("bio_curated").nullable();
    t.text("bio_raw").nullable();
    t.string("phone", 40).nullable();
    t.integer("weight_kg").nullable();
    t.integer("weight_lbs").nullable();
    t.string("weight_unit", 10).nullable();
    t.boolean("is_discoverable").defaultTo(false);
    t.string("discipline", 40).nullable();
    t.string("experience_level", 40).nullable();
    t.text("specialties").nullable();
    t.text("specializations").nullable();
    t.text("training").nullable();
    t.string("union_membership", 60).nullable();
    t.integer("playing_age_min").nullable();
    t.integer("playing_age_max").nullable();
    t.string("availability_travel", 60).nullable();
    t.string("tattoos", 60).nullable();
    t.string("piercings", 60).nullable();
    t.boolean("seeking_representation").defaultTo(false);
    t.string("current_agency", 160).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("applications", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("status").notNullable().defaultTo("submitted");
    t.float("match_score").nullable();
    t.timestamp("match_calculated_at").nullable();
    t.string("board_id", 36).nullable();
    t.string("invited_by_agency_id", 36).nullable();
    t.timestamp("viewed_at").nullable();
    t.timestamp("accepted_at").nullable();
    t.timestamp("declined_at").nullable();
    t.boolean("minor_at_submission").defaultTo(false);
    t.string("guardian_consent_grant_id", 36).nullable();
    t.timestamp("guardian_consent_expires_at").nullable();
    t.timestamp("minor_access_revoked_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  await create("minor_agency_consents", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.timestamp("verified_at").nullable();
    t.timestamp("revoked_at").nullable();
    t.timestamp("authorization_expires_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("images", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("path").nullable();
    t.string("public_url").nullable();
    t.boolean("is_primary").defaultTo(false);
    t.string("shot_type", 50).nullable();
    t.string("image_type", 50).nullable();
    t.string("style_type", 50).nullable();
    t.string("set_id", 36).nullable();
    t.timestamp("captured_at").nullable();
    t.integer("sort").defaultTo(0);
    t.string("status", 20).nullable();
    t.string("moderation_status", 20).nullable();
    t.boolean("exclude_from_public").defaultTo(false);
    t.boolean("exclude_from_agency").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("application_notes", (t) => {
    t.string("id", 36).primary();
    t.string("application_id", 36).notNullable();
    t.string("agency_id", 36).nullable();
    t.text("note").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("application_tags", (t) => {
    t.string("id", 36).primary();
    t.string("application_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("tag", 100).notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("application_activities", (t) => {
    t.string("id", 36).primary();
    t.string("application_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("user_id", 36).nullable();
    t.string("activity_type", 100).notNullable();
    t.text("description").nullable();
    t.text("metadata").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("boards", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("name").notNullable();
    t.string("kind", 20).defaultTo("division");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("roster_memberships", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).notNullable();
    t.string("profile_id", 36).nullable();
    t.string("board_id", 36).nullable();
    t.string("status", 20).notNullable().defaultTo("active");
    t.string("source_application_id", 36).nullable();
    t.timestamp("joined_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("talent_commitments", (t) => {
    t.string("id", 36).primary();
    t.string("agency_id", 36).nullable();
    t.string("profile_id", 36).nullable();
    t.string("roster_membership_id", 36).nullable();
    t.string("kind", 40).nullable();
    t.integer("option_tier").nullable();
    t.string("start_date", 40).nullable();
    t.string("end_date", 40).nullable();
    t.string("market", 80).nullable();
    t.string("client_ref", 120).nullable();
    t.boolean("exclusivity").defaultTo(false);
    t.string("exclusivity_until", 40).nullable();
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("bookouts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("starts_on", 40).notNullable();
    t.string("ends_on", 40).notNullable();
    t.text("note").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("talent_representations", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).notNullable();
    t.string("agency_id", 36).nullable();
    t.string("external_agency_name", 160).nullable();
    t.string("external_agency_key", 160).nullable();
    t.string("relationship_type", 20).notNullable();
    t.string("market", 120).nullable();
    t.string("territory", 120).nullable();
    t.string("division", 100).nullable();
    t.boolean("is_exclusive").defaultTo(false);
    t.boolean("disclose_agency_name").defaultTo(false);
    t.string("status", 20).notNullable().defaultTo("active");
    t.string("started_on", 40).nullable();
    t.string("ended_on", 40).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("social_accounts", (t) => {
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
  });

  await create("interviews", (t) => {
    t.string("id", 36).primary();
    t.string("application_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("talent_id", 36).nullable();
    t.timestamp("proposed_datetime").notNullable();
    t.integer("duration_minutes").defaultTo(30);
    t.string("interview_type", 20).notNullable();
    t.string("status", 20).notNullable().defaultTo("pending");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("reminders", (t) => {
    t.string("id", 36).primary();
    t.string("application_id", 36).notNullable();
    t.string("agency_id", 36).notNullable();
    t.string("reminder_type", 50).notNullable();
    t.timestamp("reminder_date").notNullable();
    t.string("title", 200).notNullable();
    t.string("status", 20).notNullable().defaultTo("pending");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await create("messages", (t) => {
    t.string("id", 36).primary();
    t.string("application_id", 36).notNullable();
    t.string("sender_id", 36).notNullable();
    t.string("sender_type", 20).notNullable();
    t.text("message").notNullable();
    t.boolean("is_read").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

async function seed() {
  await knex("users").insert([
    { id: OWNER_USER_ID, email: "owner@dossier.test", role: "AGENCY", first_name: "Odette", last_name: "Owner" },
    { id: TALENT_USER_ID, email: "nadia@dossier.test", role: "TALENT", first_name: "Nadia", last_name: "Kovač" },
    { id: PEER_USER_ID, email: "peer@dossier.test", role: "TALENT", first_name: "Peer", last_name: "Model" },
  ]);

  await knex("agencies").insert([
    { id: AGENCY_ID, name: "Dossier Test Agency", status: "ACTIVE", onboarding_completed_at: iso(-30) },
    { id: OTHER_AGENCY_ID, name: "Elysian Paris", status: "ACTIVE", onboarding_completed_at: iso(-90) },
  ]);

  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: OWNER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
    joined_at: iso(-30),
  });

  await knex("profiles").insert([
    {
      id: PROFILE_ID,
      user_id: TALENT_USER_ID,
      slug: "nadia-kovac",
      first_name: "Nadia",
      last_name: "Kovač",
      city: "New York",
      city_secondary: "Milan",
      market: "new-york",
      gender: "female",
      stats_track: "womenswear",
      height_cm: 178,
      bust_cm: 84,
      waist_cm: 61,
      hips_cm: 89,
      shoe_size: "39",
      dress_size: "4",
      hair_color: "brown",
      hair_length: "long",
      eye_color: "green",
      nationality: "Croatian",
      date_of_birth: "1999-04-12",
      languages: JSON.stringify(["English", "Croatian", "Italian"]),
      bio_curated: "Editorial-leaning new face with runway experience in Milan.",
      phone: "+1 555 0100",
      measurements_updated_at: iso(-20),
      availability_status: "available",
      discipline: "model",
      experience_level: "developing",
      specialties: JSON.stringify(["Runway", "Editorial"]),
      training: JSON.stringify(["Runway coaching"]),
      availability_travel: "worldwide",
      seeking_representation: true,
    },
    {
      id: PEER_PROFILE_ID,
      user_id: PEER_USER_ID,
      first_name: "Peer",
      last_name: "Model",
      stats_track: "womenswear",
      height_cm: 174,
      market: "new-york",
    },
  ]);

  await knex("social_accounts").insert({
    id: uuidv4(),
    profile_id: PROFILE_ID,
    platform: "instagram",
    handle: "nadiakovac",
    url: "https://instagram.com/nadiakovac",
    is_oauth_connected: true,
  });

  await knex("boards").insert({
    id: BOARD_ID,
    agency_id: AGENCY_ID,
    name: "Women",
    kind: "division",
  });

  await knex("applications").insert({
    id: APPLICATION_ID,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status: "shortlisted",
    match_score: 82,
    board_id: BOARD_ID,
    created_at: iso(-11),
  });

  await knex("images").insert([
    {
      id: uuidv4(), profile_id: PROFILE_ID, path: "/u/head.jpg", is_primary: true,
      shot_type: "headshot", image_type: "digital", captured_at: iso(-25), sort: 0,
    },
    {
      id: uuidv4(), profile_id: PROFILE_ID, path: "/u/profile.jpg",
      shot_type: "profile", image_type: "digital", captured_at: iso(-25), sort: 1,
    },
    {
      id: uuidv4(), profile_id: PROFILE_ID, path: "/u/full.jpg",
      shot_type: "full_length", image_type: "digital", captured_at: iso(-25), sort: 2,
    },
    {
      id: uuidv4(), profile_id: PROFILE_ID, path: "/u/editorial.jpg",
      shot_type: "half_body", image_type: "portfolio", style_type: "editorial", sort: 3,
    },
    {
      id: uuidv4(), profile_id: PROFILE_ID, path: "/u/hidden.jpg",
      shot_type: "back", image_type: "digital", sort: 4, exclude_from_agency: true,
    },
  ]);

  await knex("talent_representations").insert([
    {
      id: uuidv4(),
      profile_id: PROFILE_ID,
      agency_id: null,
      external_agency_name: "Adriatic Model Management",
      external_agency_key: "adriatic-model-management",
      relationship_type: "mother",
      market: "zagreb",
      is_exclusive: false,
      disclose_agency_name: true,
      status: "active",
      started_on: "2023-02-01",
    },
    {
      id: uuidv4(),
      profile_id: PROFILE_ID,
      agency_id: OTHER_AGENCY_ID,
      relationship_type: "placement",
      market: "paris",
      is_exclusive: false,
      disclose_agency_name: false,
      status: "active",
      started_on: "2024-06-01",
    },
  ]);

  await knex("bookouts").insert({
    id: uuidv4(),
    profile_id: PROFILE_ID,
    starts_on: day(10),
    ends_on: day(17),
    note: "Family travel",
  });

  await knex("talent_commitments").insert([
    {
      id: uuidv4(), agency_id: AGENCY_ID, profile_id: PROFILE_ID, kind: "option",
      option_tier: 1, start_date: day(3), end_date: day(4), client_ref: "Vogue IT",
      status: "active",
    },
    {
      id: uuidv4(), agency_id: AGENCY_ID, profile_id: PROFILE_ID, kind: "booked",
      start_date: day(-40), end_date: day(-38), client_ref: "Past job", status: "active",
    },
  ]);

  await knex("roster_memberships").insert([
    { id: uuidv4(), agency_id: AGENCY_ID, profile_id: PEER_PROFILE_ID, board_id: BOARD_ID, status: "active" },
  ]);

  await knex("application_tags").insert({
    id: uuidv4(), application_id: APPLICATION_ID, agency_id: AGENCY_ID, tag: "milan-ready",
  });

  await knex("application_activities").insert({
    id: uuidv4(),
    application_id: APPLICATION_ID,
    agency_id: AGENCY_ID,
    activity_type: "status_change",
    description: "Shortlisted",
    metadata: JSON.stringify({ old_status: "submitted", new_status: "shortlisted" }),
    created_at: iso(-2),
  });

  await knex("reminders").insert({
    id: uuidv4(),
    application_id: APPLICATION_ID,
    agency_id: AGENCY_ID,
    reminder_type: "follow_up",
    reminder_date: iso(-1),
    title: "Chase second set of digitals",
    status: "pending",
  });

  await knex("messages").insert({
    id: uuidv4(),
    application_id: APPLICATION_ID,
    sender_id: TALENT_USER_ID,
    sender_type: "TALENT",
    message: "Thank you for looking!",
    is_read: false,
  });
}

async function agencySession() {
  const sid = uuidv4();
  await knex("sessions").insert({
    sid,
    sess: JSON.stringify({
      cookie: { originalMaxAge: null, expires: null, secure: false, httpOnly: true, path: "/" },
      userId: AGENCY_ID,
      memberUserId: OWNER_USER_ID,
      agencyId: AGENCY_ID,
      agencyMembershipId: MEMBERSHIP_ID,
      agencyMembershipRole: "OWNER",
      role: "AGENCY",
      agencyOnboardingCompletedAt: iso(-30),
    }),
    expired: iso(1),
  });
  const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
  return `connect.sid=${encodeURIComponent(signed)}`;
}

let cookie;

beforeAll(async () => {
  await createSchema();
  await seed();
  cookie = await agencySession();
}, 30000);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("GET /api/agency/applications/:id/dossier", () => {
  let body;

  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/agency/applications/${APPLICATION_ID}/dossier`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    body = res.body.data;
  });

  test("carries the submission's identity and canonical, track-aware stats", () => {
    expect(body.talent.first_name).toBe("Nadia");
    expect(body.talent.stats.track).toBe("womenswear");
    expect(body.talent.stats.height.cm).toBe(178);
    // Dual-unit is non-negotiable for an international agency audience.
    expect(body.talent.stats.height.dual).toMatch(/178 cm \/ 5'10"/);
    const keys = body.talent.stats.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["height", "bust", "waist", "hips"]));
    // Womenswear must not be handed the menswear set.
    expect(keys).not.toContain("suit");
  });

  test("never leaks date of birth, and bands the age", () => {
    expect(body.talent.date_of_birth).toBeUndefined();
    expect(body.talent.age_band).toBe("18_or_older");
    expect(body.compliance.is_minor).toBe(false);
  });

  test("honours the talent's per-row agency disclosure choice", () => {
    const lines = body.representation.lines;
    expect(lines).toHaveLength(2);
    const mother = lines.find((l) => l.relationship_type === "mother");
    const placement = lines.find((l) => l.relationship_type === "placement");
    expect(mother.agency_name).toBe("Adriatic Model Management");
    expect(mother.market).toBe("zagreb");
    // Undisclosed placement keeps its shape but loses its name.
    expect(placement.agency_name).toBeNull();
    expect(placement.market).toBe("paris");
    expect(body.representation.status).toBe("represented");
  });

  test("returns only agency-visible frames, with capture dates", () => {
    expect(body.images).toHaveLength(4);
    expect(body.images.some((i) => i.path === "/u/hidden.jpg")).toBe(false);
    const headshot = body.images.find((i) => i.shot_type === "headshot");
    expect(headshot.captured_at).toBeTruthy();
    expect(headshot.image_type).toBe("digital");
    // The allowlist must not carry storage internals.
    expect(headshot.absolute_path).toBeUndefined();
    expect(headshot.moderation_status).toBeUndefined();
  });

  test("carries availability: declared status, bookouts, and our own commitments", () => {
    expect(body.availability.status).toBe("available");
    expect(body.availability.bookouts).toHaveLength(1);
    expect(body.availability.bookouts[0].note).toBe("Family travel");
    // The past booking falls outside the forward window; the option stays.
    expect(body.availability.commitments).toHaveLength(1);
    expect(body.availability.commitments[0].kind).toBe("option");
    expect(body.availability.commitments[0].option_tier).toBe(1);
  });

  test("carries standing with this agency: ladder dates, board, tags", () => {
    expect(body.application.status).toBe("shortlisted");
    expect(body.standing.board.name).toBe("Women");
    expect(body.standing.days_since_submitted).toBeGreaterThanOrEqual(10);
    expect(body.standing.tags.map((t) => t.tag)).toContain("milan-ready");
    expect(body.standing.timeline[0].metadata.new_status).toBe("shortlisted");
    expect(body.standing.messages.unread_from_talent).toBe(1);
    expect(body.standing.invited).toBe(false);
  });

  test("carries the professional record an agency casts from", () => {
    expect(body.talent.professional.discipline).toBe("model");
    expect(body.talent.professional.specialties).toEqual(["Runway", "Editorial"]);
    expect(body.talent.languages).toEqual(["English", "Croatian", "Italian"]);
    expect(body.talent.social[0].handle).toBe("nadiakovac");
  });

  test("marks the submission as read", async () => {
    const row = await knex("applications").where({ id: APPLICATION_ID }).first("viewed_at");
    expect(row.viewed_at).toBeTruthy();
  });
});

describe("dossier field containment", () => {
  const {
    DOSSIER_PROFESSIONAL_FIELDS,
  } = require("../../src/domains/agency/services/talent-dossier");
  const {
    AGENCY_DISCOVERY_FIELDS,
  } = require("../../src/shared/lib/audience-dto");

  test("the professional record never exceeds the Discover allowlist", () => {
    // An agency reading a submission is more entitled than generic Discover,
    // so this is a floor, not a ceiling: nothing may appear here that Discover
    // would withhold. Widening the dossier is a deliberate act that must start
    // in audience-dto.js.
    const allowed = new Set(AGENCY_DISCOVERY_FIELDS);
    const extra = DOSSIER_PROFESSIONAL_FIELDS.filter((f) => !allowed.has(f));
    expect(extra).toEqual([]);
  });

  test("no forbidden identity or compliance column reaches the client", async () => {
    const res = await request(app)
      .get(`/api/agency/applications/${APPLICATION_ID}/dossier`)
      .set("Cookie", cookie);
    const seen = new Set();
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          seen.add(k);
          walk(v);
        }
      }
      return undefined;
    })(res.body.data);

    for (const forbidden of [
      "date_of_birth",
      "dob",
      "guardian_email",
      "emergency_contact_name",
      "emergency_contact_phone",
      "embedding",
      "search_document",
      "measured_by_agency_id",
      "current_agency",
    ]) {
      expect(seen.has(forbidden)).toBe(false);
    }
  });
});

describe("dossier access boundaries", () => {
  test("404s for an application belonging to another agency", async () => {
    const strangerApplication = uuidv4();
    await knex("applications").insert({
      id: strangerApplication,
      profile_id: PROFILE_ID,
      agency_id: OTHER_AGENCY_ID,
      status: "submitted",
    });
    const res = await request(app)
      .get(`/api/agency/applications/${strangerApplication}/dossier`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  test("410s once the talent withdraws the submission", async () => {
    const withdrawn = uuidv4();
    await knex("applications").insert({
      id: withdrawn,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: "withdrawn",
    });
    const res = await request(app)
      .get(`/api/agency/applications/${withdrawn}/dossier`)
      .set("Cookie", cookie);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("application_withdrawn");
  });

  test("401s without an agency session", async () => {
    const res = await request(app).get(
      `/api/agency/applications/${APPLICATION_ID}/dossier`,
    );
    expect([401, 403]).toContain(res.status);
  });
});

/**
 * Digitals freshness reaches the reviewer, and reaches them honestly.
 *
 * The client used to compute this itself and was wrong in two directions at
 * once: it aged from `created_at` when `captured_at` was absent, so an undated
 * frame reported its upload date as if that were a capture date, and it read the
 * NEWEST digital, so one recent frame made a whole stale set look fresh. Both
 * errors told a booker the digitals were current when they were not, which is
 * the one thing this readout exists to prevent.
 */
describe("dossier digitals freshness", () => {
  async function fetchFreshness() {
    const res = await request(app)
      .get(`/api/agency/applications/${APPLICATION_ID}/dossier`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    return res.body.data.digitalsFreshness;
  }

  test("a set shot 25 days ago reads as current", async () => {
    const freshness = await fetchFreshness();
    expect(freshness).not.toBeNull();
    expect(freshness.state).toBe("current");
    expect(freshness.hasDigitals).toBe(true);
  });

  test("the OLDEST frame in a set decides it, not the newest", async () => {
    // Bind the three digitals into one set, then backdate a single frame past
    // the stale threshold. Two frames stay recent, so a "newest wins" reading —
    // the bug this replaces — would still call the set current.
    await knex("images")
      .whereIn("shot_type", ["headshot", "profile", "full_length"])
      .update({ set_id: "set-one" });
    await knex("images")
      .where({ shot_type: "headshot" })
      .update({ captured_at: iso(-200) });

    const freshness = await fetchFreshness();
    expect(freshness.state).toBe("stale");
    expect(freshness.currentSet.ageDays).toBeGreaterThanOrEqual(200);

    await knex("images")
      .where({ shot_type: "headshot" })
      .update({ captured_at: iso(-25) });
  });

  test("an undated frame stops the set claiming to be current", async () => {
    await knex("images")
      .whereIn("shot_type", ["headshot", "profile", "full_length"])
      .update({ set_id: "set-one" });
    await knex("images")
      .where({ shot_type: "profile" })
      .update({ captured_at: null });

    const freshness = await fetchFreshness();
    // Not "current" — nobody knows how old that frame is, and a dossier must
    // not answer a question it cannot answer.
    expect(freshness.state).not.toBe("current");
    expect(freshness.undatedCount).toBeGreaterThan(0);

    await knex("images")
      .where({ shot_type: "profile" })
      .update({ captured_at: iso(-25) });
  });
});
