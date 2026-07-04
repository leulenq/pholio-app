"use strict";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");
const {
  loadFieldVisibility,
  isFieldGroupVisible,
} = require("../../src/shared/lib/field-visibility");

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";

async function createTalent({ dateOfBirth, guardianConsentAt = null }) {
  const userId = uuidv4();
  const profileId = uuidv4();

  await knex("users").insert({
    id: userId,
    email: `field-vis-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });

  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `field-vis-${profileId}`,
    first_name: "Field",
    last_name: "Vis",
    city: "Test City",
    date_of_birth: dateOfBirth,
    guardian_consent_at: guardianConsentAt,
    gender: "Female",
    height_cm: 178,
    is_public: true,
    is_discoverable: true,
    phone: "555-0100",
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: new Date().toISOString(),
  });

  await recordLegalAcceptance(knex, userId, { terms: true, privacy: true });

  return { userId, profileId };
}

async function sessionCookieFor(userId) {
  const sid = uuidv4();
  await knex("sessions").insert({
    sid,
    sess: {
      cookie: { path: "/" },
      userId,
      role: "TALENT",
    },
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  return { sid, cookie: `connect.sid=s:${cookieSig.sign(sid, SESSION_SECRET)}` };
}

describe("per-field audience visibility (public stats opt-in)", () => {
  const cleanupUserIds = [];
  const cleanupProfileIds = [];
  const cleanupSids = [];

  beforeAll(async () => {
    await knex.migrate.latest();
  });

  afterAll(async () => {
    if (cleanupSids.length) {
      await knex("sessions").whereIn("sid", cleanupSids).delete();
    }
    if (cleanupProfileIds.length) {
      await knex("profile_field_visibility")
        .whereIn("profile_id", cleanupProfileIds)
        .delete();
      await knex("profiles").whereIn("id", cleanupProfileIds).delete();
    }
    if (cleanupUserIds.length) {
      await knex("users").whereIn("id", cleanupUserIds).delete();
    }
    await knex.destroy();
  });

  async function setup(opts) {
    const { userId, profileId } = await createTalent(opts);
    cleanupUserIds.push(userId);
    cleanupProfileIds.push(profileId);
    const { sid, cookie } = await sessionCookieFor(userId);
    cleanupSids.push(sid);
    return { userId, profileId, cookie };
  }

  describe("GET /api/talent/field-visibility", () => {
    test("returns the seeded defaults merged map — stats agency-visible, not public", async () => {
      const { cookie } = await setup({ dateOfBirth: "1990-01-01" });

      const res = await request(app)
        .get("/api/talent/field-visibility")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.visibility.stats.agency_discovery).toBe(true);
      expect(res.body.data.visibility.stats.public).toBe(false);
      expect(res.body.data.visibility.compliance.public).toBe(false);
      expect(res.body.data.visibility.protected_traits.public).toBe(false);
    });
  });

  describe("public portfolio stats gating", () => {
    test("default: public portfolio does NOT expose stats", async () => {
      const { profileId } = await setup({ dateOfBirth: "1990-01-01" });
      const profile = await knex("profiles").where({ id: profileId }).first();

      const res = await request(app).get(`/portfolio/${profile.slug}`);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("<span>Height</span>");
    });

    test("opting stats into public via PATCH makes the public portfolio expose stats", async () => {
      const { profileId, cookie } = await setup({ dateOfBirth: "1990-01-01" });
      const profile = await knex("profiles").where({ id: profileId }).first();

      const patchRes = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [{ field_key: "stats", audience: "public", visible: true }] });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.visibility.stats.public).toBe(true);

      const map = await loadFieldVisibility(profileId);
      expect(isFieldGroupVisible(map, "stats", "public")).toBe(true);

      const res = await request(app).get(`/portfolio/${profile.slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain("<span>Height</span>");
    });
  });

  describe("invariant: sensitive groups can never be made public", () => {
    test.each(["compliance", "protected_traits", "adult_content"])(
      "%s -> public is rejected with 403",
      async (fieldKey) => {
        const { cookie } = await setup({ dateOfBirth: "1990-01-01" });

        const res = await request(app)
          .patch("/api/talent/field-visibility")
          .set("Cookie", cookie)
          .send({ updates: [{ field_key: fieldKey, audience: "public", visible: true }] });

        expect(res.status).toBe(403);
        expect(res.body.details?.code).toBe("FIELD_VISIBILITY_LOCKED");
      },
    );

    test("dob -> agency_discovery is rejected (fixed audience exposure)", async () => {
      const { cookie } = await setup({ dateOfBirth: "1990-01-01" });

      const res = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [{ field_key: "dob", audience: "agency_discovery", visible: true }] });

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe("FIELD_VISIBILITY_LOCKED");
    });
  });

  describe("invariant: minor cannot opt into wider exposure without guardian consent", () => {
    test("minor without guardian consent -> stats/public rejected with 403", async () => {
      const minorDob = new Date();
      minorDob.setFullYear(minorDob.getFullYear() - 15);
      const { cookie } = await setup({
        dateOfBirth: minorDob.toISOString().slice(0, 10),
        guardianConsentAt: null,
      });

      const res = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [{ field_key: "stats", audience: "public", visible: true }] });

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe("GUARDIAN_CONSENT_REQUIRED");
    });

    test("minor WITH guardian consent can opt stats into public", async () => {
      const minorDob = new Date();
      minorDob.setFullYear(minorDob.getFullYear() - 15);
      const { cookie } = await setup({
        dateOfBirth: minorDob.toISOString().slice(0, 10),
        guardianConsentAt: new Date().toISOString(),
      });

      const res = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [{ field_key: "stats", audience: "public", visible: true }] });

      expect(res.status).toBe(200);
      expect(res.body.data.visibility.stats.public).toBe(true);
    });
  });

  describe("unknown field_key / audience", () => {
    test("unknown field_key -> 400", async () => {
      const { cookie } = await setup({ dateOfBirth: "1990-01-01" });

      const res = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [{ field_key: "not_a_real_field", audience: "public", visible: true }] });

      expect(res.status).toBe(400);
      expect(res.body.details?.code).toBe("UNKNOWN_FIELD_KEY");
    });

    test("unknown audience -> 400", async () => {
      const { cookie } = await setup({ dateOfBirth: "1990-01-01" });

      const res = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [{ field_key: "stats", audience: "everyone", visible: true }] });

      expect(res.status).toBe(400);
      expect(res.body.details?.code).toBe("UNKNOWN_AUDIENCE");
    });

    test("empty updates body -> 400", async () => {
      const { cookie } = await setup({ dateOfBirth: "1990-01-01" });

      const res = await request(app)
        .patch("/api/talent/field-visibility")
        .set("Cookie", cookie)
        .send({ updates: [] });

      expect(res.status).toBe(400);
    });
  });
});
