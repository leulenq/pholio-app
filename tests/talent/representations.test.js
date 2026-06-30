"use strict";

jest.mock("../../src/shared/middleware/require-legal-acceptance", () => ({
  requireTalentLegalAcceptance: () => (req, res, next) => next(),
  requireAgencyLegalAcceptance: () => (req, res, next) => next(),
}));

const request = require("supertest");
const signature = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");
const app = require("../../src/app");
const knex = require("../../src/shared/db/knex");

function signedCookie(sessionId) {
  const value = `s:${signature.sign(
    sessionId,
    process.env.SESSION_SECRET || "pholio-secret",
  )}`;
  return [`connect.sid=${encodeURIComponent(value)}; Path=/; HttpOnly`];
}

async function createTalent(label) {
  const userId = uuidv4();
  const profileId = uuidv4();
  const sessionId = `representation-${label}-${userId}`;
  await knex("users").insert({
    id: userId,
    email: `${label}-${userId}@example.com`,
    password_hash: "test-only",
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `representation-${label}-${profileId}`,
    first_name: label,
    last_name: "Talent",
    city: "New York",
    height_cm: 175,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  });
  await knex("sessions").insert({
    sid: sessionId,
    sess:
      knex.client.config.client === "sqlite3"
        ? JSON.stringify({
            cookie: {
              path: "/",
              httpOnly: true,
              originalMaxAge: 86400000,
              expires: new Date(Date.now() + 86400000).toISOString(),
            },
            userId,
            role: "TALENT",
          })
        : {
            cookie: {
              path: "/",
              httpOnly: true,
              originalMaxAge: 86400000,
              expires: new Date(Date.now() + 86400000).toISOString(),
            },
            userId,
            role: "TALENT",
          },
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  return { userId, profileId, cookie: signedCookie(sessionId) };
}

describe("talent representation API", () => {
  let owner;
  let other;
  let agencyId;

  beforeAll(async () => {
    owner = await createTalent("owner");
    other = await createTalent("other");
    agencyId = uuidv4();
    await knex("agencies").insert({
      id: agencyId,
      name: "Paris Placement",
      status: "ACTIVE",
    });
  });

  afterAll(async () => {
    const profiles = [owner?.profileId, other?.profileId].filter(Boolean);
    const users = [owner?.userId, other?.userId].filter(Boolean);
    if (profiles.length) {
      await knex("talent_representations")
        .whereIn("profile_id", profiles)
        .delete();
    }
    await knex("sessions")
      .whereIn(
        "sid",
        await knex("sessions")
          .where((builder) => {
            builder
              .where("sid", "like", "representation-owner-%")
              .orWhere("sid", "like", "representation-other-%");
          })
          .pluck("sid"),
      )
      .delete();
    if (profiles.length) {
      await knex("profiles").whereIn("id", profiles).delete();
    }
    if (users.length) await knex("users").whereIn("id", users).delete();
    if (agencyId) await knex("agencies").where({ id: agencyId }).delete();
    await knex.destroy();
  });

  test("creates mother and market relationships and projects the mother agency to current_agency", async () => {
    const mother = await request(app)
      .post("/api/talent/profile/representations")
      .set("Cookie", owner.cookie)
      .send({
        external_agency_name: "North Star Management",
        relationship_type: "mother",
        market: null,
        territory: "Worldwide",
        division: "Main",
        is_exclusive: true,
        started_on: "2025-04-01",
      })
      .expect(201);
    expect(mother.body.data.representation).toMatchObject({
      agency_name: "North Star Management",
      relationship_type: "mother",
      territory: "Worldwide",
      is_exclusive: true,
    });

    await request(app)
      .post("/api/talent/profile/representations")
      .set("Cookie", owner.cookie)
      .send({
        agency_id: agencyId,
        relationship_type: "placement",
        market: "Paris",
        territory: "France",
        division: "Women",
        is_exclusive: false,
      })
      .expect(201);

    const list = await request(app)
      .get("/api/talent/profile/representations")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(list.body.data.active).toHaveLength(2);
    expect(list.body.data.active[0].relationship_type).toBe("mother");
    expect(
      await knex("profiles")
        .where({ id: owner.profileId })
        .first("current_agency"),
    ).toMatchObject({ current_agency: "North Star Management" });
  });

  test("rejects duplicate active market relationships and cross-profile mutation", async () => {
    await request(app)
      .post("/api/talent/profile/representations")
      .set("Cookie", owner.cookie)
      .send({
        agency_id: agencyId,
        relationship_type: "placement",
        market: "Paris",
        territory: "France",
      })
      .expect(409);

    const row = await knex("talent_representations")
      .where({ profile_id: owner.profileId, agency_id: agencyId })
      .first();
    await request(app)
      .patch(`/api/talent/profile/representations/${row.id}`)
      .set("Cookie", other.cookie)
      .send({ division: "Men" })
      .expect(404);
  });

  test("bulk replacement records omitted relationships as history and keeps legacy projection compatible", async () => {
    const activeRows = await knex("talent_representations")
      .where({ profile_id: owner.profileId, status: "active" })
      .select("*");
    const placement = activeRows.find((row) => row.agency_id === agencyId);

    const response = await request(app)
      .put("/api/talent/profile/representations")
      .set("Cookie", owner.cookie)
      .send({
        representations: [
          {
            id: placement.id,
            agency_id: agencyId,
            external_agency_name: null,
            relationship_type: "placement",
            market: "Paris",
            territory: "France",
            division: "Women",
            is_exclusive: true,
            started_on: null,
          },
        ],
      })
      .expect(200);

    expect(response.body.data.active).toHaveLength(1);
    expect(response.body.data.history).toHaveLength(1);
    expect(response.body.data.current_agency).toBe("Paris Placement");
    const ended = await knex("talent_representations")
      .where({ profile_id: owner.profileId, status: "ended" })
      .first();
    expect(ended.ended_on).toBeTruthy();

    await request(app)
      .put("/api/talent/profile")
      .set("Cookie", owner.cookie)
      .send({ current_agency: "Ignored Legacy Override" })
      .expect(200);
    const ownerProfile = await knex("profiles")
      .where({ id: owner.profileId })
      .first("current_agency");
    expect(ownerProfile.current_agency).toBe("Paris Placement");

    await request(app)
      .put("/api/talent/profile")
      .set("Cookie", other.cookie)
      .send({ current_agency: "Legacy Only Management" })
      .expect(200);
    const legacy = await knex("talent_representations")
      .where({ profile_id: other.profileId, status: "active" })
      .first();
    expect(legacy).toMatchObject({
      external_agency_name: "Legacy Only Management",
      source: "legacy",
    });
  });

  test("ending the last active relationship clears the compatibility projection", async () => {
    const active = await knex("talent_representations")
      .where({ profile_id: owner.profileId, status: "active" })
      .first();
    await request(app)
      .delete(`/api/talent/profile/representations/${active.id}`)
      .set("Cookie", owner.cookie)
      .send({ ended_on: "2026-06-29" })
      .expect(200);

    const profile = await knex("profiles")
      .where({ id: owner.profileId })
      .first("current_agency");
    expect(profile.current_agency).toBeNull();
  });
});
