"use strict";

/**
 * What the talent's browser actually receives from the registry endpoints.
 *
 * Two things are checked here that a service-level test cannot prove:
 *
 *  - `GET /api/talent/spec-registry/routes` carries the taxonomy label map, so
 *    the client can name a field or a value in the product's own words instead
 *    of Title-Casing `close_up` into "Close Up";
 *  - every published shot slot reaches the wire with a stable key, including
 *    the compound ones ("close up profile (hair pulled back)") that carry no
 *    single `matchValue` and were therefore dropped by any row keyed on it.
 *
 * It runs against the real app and a real migrated schema because the payload
 * under test is the serialized HTTP body, not a return value.
 */

const request = require("supertest");
const signature = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("spec-registry-labels-endpoint");

const { acceptedLegal } = require("../setup/legal-fixture");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const SESSION_SECRET = require("../../src/config").sessionSecret;
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");

const ELITE_NA_SERIES_ID = "elite-models-na:online-general";

const talent = {
  userId: uuidv4(),
  profileId: uuidv4(),
  sessionId: `spec-registry-labels-${uuidv4()}`,
};

function signedCookie(sessionId) {
  return [
    `connect.sid=${encodeURIComponent(`s:${signature.sign(sessionId, SESSION_SECRET)}`)}; Path=/; HttpOnly`,
  ];
}

async function seedSession() {
  await knex("users").insert({
    id: talent.userId,
    email: `spec-registry-labels-${talent.userId}@example.com`,
    password_hash: "test-only",
    role: "TALENT",
    email_verified: true,
    ...acceptedLegal(),
  });
  await knex("profiles").insert({
    id: talent.profileId,
    user_id: talent.userId,
    slug: `spec-registry-labels-${talent.profileId}`,
    first_name: "Mia",
    last_name: "Voss",
    city: "New York",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  });
  await knex("sessions").insert({
    sid: talent.sessionId,
    sess: JSON.stringify({
      cookie: {
        path: "/",
        httpOnly: true,
        originalMaxAge: 86400000,
        expires: new Date(Date.now() + 86400000).toISOString(),
      },
      userId: talent.userId,
      role: "TALENT",
    }),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe("spec registry endpoints", () => {
  beforeAll(async () => {
    await migrate(knex);
    await seedSession();
    await publishRegistry(knex, validateRegistry());
  }, 180000);

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  test("GET /routes carries the taxonomy labels the surface renders", async () => {
    const response = await request(app)
      .get("/api/talent/spec-registry/routes")
      .set("Cookie", signedCookie(talent.sessionId))
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    const { labels, labelsVersion, routes } = response.body.data;
    expect(routes.length).toBeGreaterThan(0);
    expect(labelsVersion).toBe("1.0.0");
    expect(labels["shot.frame"].label).toBe("Shot frame");
    expect(labels["shot.frame"].values.close_up.label).toBe("Close-up");
    expect(labels["shot.frame"].values.full_length.label).toBe("Full length");
    expect(labels["shot.view"].values.profile.label).toBe("Profile");
    expect(labels["appearance.hair_state"].values.pulled_back.label).toBe("Pulled back");
    // The response says nothing about the talent's own answers, so it stays a
    // plain published-vocabulary document.
    expect(labels["shot.frame"]).not.toHaveProperty("outcome");
  });

  test("POST /preflight sends every Elite shot slot with a stable key", async () => {
    const response = await request(app)
      .post("/api/talent/spec-registry/preflight")
      .set("Cookie", signedCookie(talent.sessionId))
      .set("Accept", "application/json")
      .send({ seriesId: ELITE_NA_SERIES_ID });

    expect(response.status).toBe(200);
    const result = response.body.data.results[0];
    const shots = result.findings.filter((finding) => finding.categoryKey === "shots");

    expect(shots).toHaveLength(6);
    expect(shots.filter((finding) => finding.matchValue).length).toBe(3);
    // The three compound slots are exactly the rows a matchValue-keyed grid
    // used to lose; each still arrives with its own key.
    expect(shots.every((finding) => Boolean(finding.slotKey))).toBe(true);
    expect(new Set(shots.map((finding) => finding.slotKey)).size).toBe(6);
    expect(
      shots.find((finding) => finding.assertionId === "close-up-profile-hair-pulled-back"),
    ).toMatchObject({
      slotKey: `${ELITE_NA_SERIES_ID}#shots:close-up-profile-hair-pulled-back`,
      matchValue: null,
      matchKey:
        "appearance.hair_state:equals:pulled_back&shot.frame:equals:close_up&shot.view:equals:profile",
    });
    expect(response.body.data.labels["shot.purpose"].values.personality.label).toBe(
      "Personality",
    );
  });
});
