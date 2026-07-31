/**
 * Integration coverage for the onboarding security-hardening findings from the
 * 2026-07-03 /onboarding audit:
 *
 *   H2 — content moderation / CSAM screening on the scout upload path
 *   H3 — account linking only on a VERIFIED email claim
 *   M2 — AGENCY accounts are rejected from talent onboarding
 *   M4 — server-side truth for the height + real-headshot completion gates
 *   M5 — minors cannot upload full_body shots at collection time
 *
 * Firebase is mocked so we can control the decoded token (uid / email /
 * email_verified) per scenario. Moderation + artifact purge are mocked so the
 * block/escalate branches are deterministic and never hit R2.
 */

// --- Controllable Firebase token ---------------------------------------------
const mockAuth = { token: null };
jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(() => Promise.resolve(mockAuth.token)),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

// Defensive: the upload path may consult these.
jest.mock("../../src/domains/ai/analyzeProfileImage", () => ({
  masterVisionAnalysis: jest.fn().mockResolvedValue({ confidence: "Low" }),
}));
jest.mock("../../src/shared/lib/image-validator", () => ({
  validate: jest.fn().mockResolvedValue({ valid: true }),
}));

// Controllable moderation verdict + spyable artifact purge.
const mockModeration = {
  result: { status: "approved", reason: null, flags: { provider: "heuristic" } },
};
jest.mock("../../src/shared/lib/content-moderation", () => {
  const actual = jest.requireActual("../../src/shared/lib/content-moderation");
  return {
    ...actual,
    analyzeImageBuffer: jest.fn(() => Promise.resolve(mockModeration.result)),
  };
});
jest.mock("../../src/shared/lib/purge-image-artifacts", () => ({
  purgeStoredImageArtifacts: jest.fn(() => Promise.resolve()),
}));

const request = require("supertest");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  MODERATION_STATUS,
} = require("../../src/shared/lib/content-moderation");
const {
  purgeStoredImageArtifacts,
} = require("../../src/shared/lib/purge-image-artifacts");

const FIXTURE = path.join(__dirname, "..", "fixtures", "test-image.jpg");

function cookieFrom(res) {
  return (res.headers["set-cookie"] || []).map((c) => c.split(";")[0]);
}

// Drive entry with a given decoded token; returns the response.
/** A date_of_birth `years` ago, as YYYY-MM-DD. */
function dobYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function entry(agent, token, body = {}) {
  mockAuth.token = token;
  return agent.post("/casting/entry").send({
    firebase_token: "tok",
    terms_accepted: true,
    privacy_accepted: true,
    // Account creation now requires a date of birth up front (DOB_REQUIRED).
    // Callers that care about age pass their own; everyone else gets an adult.
    date_of_birth: dobYearsAgo(28),
    ...body,
  });
}

async function getProfileByUser(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

// Force a profile onto a specific onboarding step without driving every route.
async function setProfileState(profileId, currentStep, completedSteps, extra = {}) {
  const state = {
    version: "v2_casting_call",
    current_step: currentStep,
    completed_steps: completedSteps,
    step_data: {},
    started_at: new Date().toISOString(),
  };
  await knex("profiles")
    .where({ id: profileId })
    .update({
      onboarding_stage: currentStep,
      onboarding_state_json: JSON.stringify(state),
      ...extra,
    });
}

async function purgeUserByEmail(email) {
  const u = await knex("users").where({ email }).first();
  if (!u) return;
  const p = await knex("profiles").where({ user_id: u.id }).first();
  if (p) {
    await knex("images").where({ profile_id: p.id }).del().catch(() => {});
    await knex("onboarding_signals").where({ profile_id: p.id }).del().catch(() => {});
    await knex("onboarding_analytics").where({ profile_id: p.id }).del().catch(() => {});
    await knex("legal_acceptances").where({ user_id: u.id }).del().catch(() => {});
    await knex("profiles").where({ id: p.id }).del();
  }
  await knex("legal_acceptances").where({ user_id: u.id }).del().catch(() => {});
  await knex("sessions").where("sess", "like", `%${u.id}%`).del().catch(() => {});
  await knex("users").where({ id: u.id }).del();
}

const CREATED_EMAILS = new Set();
function track(email) {
  CREATED_EMAILS.add(email);
  return email;
}

beforeAll(async () => {
  if (!fs.existsSync(FIXTURE)) {
    throw new Error("fixture test-image.jpg missing — run the e2e suite first");
  }
  await knex.migrate.latest();
});

afterEach(() => {
  mockModeration.result = {
    status: "approved",
    reason: null,
    flags: { provider: "heuristic" },
  };
  purgeStoredImageArtifacts.mockClear();
});

afterAll(async () => {
  for (const email of CREATED_EMAILS) {
    await purgeUserByEmail(email);
  }
  await knex.destroy();
});

// -----------------------------------------------------------------------------
describe("M2 — AGENCY accounts cannot run talent onboarding", () => {
  it("rejects entry with 409 when the account role is AGENCY", async () => {
    const email = track("m2.agency@example.test");
    const uid = "m2-agency-uid";
    await purgeUserByEmail(email);
    await knex("users").insert({
      id: uuidv4(),
      email,
      firebase_uid: uid,
      role: "AGENCY",
      first_name: "Agency",
      created_at: knex.fn.now(),
    });

    const agent = request.agent(app);
    const res = await entry(agent, { uid, email, email_verified: true, name: "Agency Owner" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("AGENCY_ACCOUNT");
  });
});

// -----------------------------------------------------------------------------
describe("H3 — account linking requires a verified email", () => {
  it("does NOT take over an existing account on an UNVERIFIED email claim", async () => {
    const email = track("h3.victim@example.test");
    const victimUid = "h3-victim-original-uid";
    await purgeUserByEmail(email);
    await knex("users").insert({
      id: uuidv4(),
      email,
      firebase_uid: victimUid,
      role: "TALENT",
      first_name: "Victim",
      created_at: knex.fn.now(),
    });

    const agent = request.agent(app);
    const res = await entry(agent, {
      uid: "h3-attacker-new-uid",
      email,
      email_verified: false,
      name: "Attacker",
    });

    // Fails closed: no session as the victim.
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(409);
    const victim = await knex("users").where({ email }).first();
    expect(victim.firebase_uid).toBe(victimUid); // unchanged — not rebound
  });

  it("links a legacy row (no firebase_uid) when the email IS verified", async () => {
    const email = track("h3.migrate@example.test");
    const existingId = uuidv4();
    await purgeUserByEmail(email);
    await knex("users").insert({
      id: existingId,
      email,
      firebase_uid: null,
      role: "TALENT",
      first_name: "Legacy",
      created_at: knex.fn.now(),
    });

    const agent = request.agent(app);
    const res = await entry(agent, {
      uid: "h3-verified-new-uid",
      email,
      email_verified: true,
      name: "Legacy User",
    });

    // Verified email links to the SAME existing account (no duplicate created).
    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(existingId);
    const rows = await knex("users").where({ email });
    expect(rows.length).toBe(1);
  });
});

// -----------------------------------------------------------------------------
/* NEEDS A PRODUCT DECISION — these two tests currently fail.
 *
 * They cover defence-in-depth: a minor with an account must not be able to
 * upload a full_body shot (SENSITIVE_SHOT_BLOCKED). That premise is no longer
 * reachable through onboarding — POST /casting/entry now rejects any minor
 * outright with ADULT_ELIGIBILITY_REQUIRED ("Pholio's current launch is for
 * adults 18 and over"), so no minor account can be created to exercise the
 * upload guard.
 *
 * Two defensible resolutions, and picking between them is a safeguarding call
 * rather than a test-maintenance one:
 *   a) Adult-only entry is the whole answer: replace these with an assertion
 *      that a minor cannot create an account, and retire the upload coverage.
 *   b) The upload guard stays as a second layer for legacy/grandfathered minor
 *      records: build the minor profile directly in the fixture, bypassing
 *      entry, and keep asserting SENSITIVE_SHOT_BLOCKED.
 *
 * Deliberately left failing rather than quietly rewritten — silently deleting
 * minor-safety coverage is not a call to make in passing. */
describe("M5 — minors cannot upload full_body at collection", () => {
  it("rejects a full_body scout upload for a minor with 403", async () => {
    const email = track("m5.minor@example.test");
    await purgeUserByEmail(email);
    const agent = request.agent(app);
    const res = await entry(
      agent,
      { uid: "m5-minor-uid", email, email_verified: true, name: "Minor Teen" },
      { date_of_birth: dobYearsAgo(15) },
    );
    const cookie = cookieFrom(res);
    const user = await knex("users").where({ email }).first();
    const profile = await getProfileByUser(user.id);
    // 15 years old today → minor, no guardian consent.
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 15);
    await setProfileState(profile.id, "scout", ["entry", "birthdate", "gender"], {
      date_of_birth: dob.toISOString().slice(0, 10),
    });

    const uploadRes = await agent
      .post("/casting/scout")
      .set("Cookie", cookie)
      .field("shot_type", "full_body")
      .attach("digi", FIXTURE);

    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.error).toBe("SENSITIVE_SHOT_BLOCKED");
    const imgs = await knex("images").where({ profile_id: profile.id, shot_type: "full_body" });
    expect(imgs.length).toBe(0);
  });

  it("still allows a minor to upload a headshot", async () => {
    const email = track("m5.minor.headshot@example.test");
    await purgeUserByEmail(email);
    const agent = request.agent(app);
    const res = await entry(
      agent,
      { uid: "m5-minor-hs-uid", email, email_verified: true, name: "Minor Two" },
      { date_of_birth: dobYearsAgo(15) },
    );
    const cookie = cookieFrom(res);
    const user = await knex("users").where({ email }).first();
    const profile = await getProfileByUser(user.id);
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 15);
    await setProfileState(profile.id, "scout", ["entry", "birthdate", "gender"], {
      date_of_birth: dob.toISOString().slice(0, 10),
    });

    const uploadRes = await agent
      .post("/casting/scout")
      .set("Cookie", cookie)
      .field("shot_type", "headshot")
      .attach("digi", FIXTURE);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe("H2 — moderation / CSAM screening on scout upload", () => {
  async function seedScoutReadyAdult(email, uid) {
    await purgeUserByEmail(email);
    const agent = request.agent(app);
    const res = await entry(agent, { uid, email, email_verified: true, name: "Adult Model" });
    const cookie = cookieFrom(res);
    const user = await knex("users").where({ email }).first();
    const profile = await getProfileByUser(user.id);
    await setProfileState(profile.id, "scout", ["entry", "birthdate", "gender"], {
      date_of_birth: "1996-04-01",
    });
    return { agent, cookie, profile };
  }

  it("stores an approved headshot with an approved moderation status", async () => {
    const email = track("h2.ok@example.test");
    const { agent, cookie, profile } = await seedScoutReadyAdult(email, "h2-ok-uid");

    const res = await agent
      .post("/casting/scout")
      .set("Cookie", cookie)
      .field("shot_type", "headshot")
      .attach("digi", FIXTURE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const img = await knex("images")
      .where({ profile_id: profile.id, image_type: "digital" })
      .first();
    expect(img).toBeTruthy();
    expect(img.moderation_status).toBe(MODERATION_STATUS.APPROVED);
    expect(purgeStoredImageArtifacts).not.toHaveBeenCalled();
  });

  it("blocks a rejected image: 422, no row persisted, stored bytes purged", async () => {
    const email = track("h2.reject@example.test");
    const { agent, cookie, profile } = await seedScoutReadyAdult(email, "h2-reject-uid");

    mockModeration.result = {
      status: MODERATION_STATUS.REJECTED,
      reason: "undecodable_image",
      flags: { provider: "heuristic", undecodable: true },
    };

    const res = await agent
      .post("/casting/scout")
      .set("Cookie", cookie)
      .field("shot_type", "headshot")
      .attach("digi", FIXTURE);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("IMAGE_REJECTED");
    // No digital image row was persisted (OAuth avatars never enter images).
    const digitals = await knex("images").where({
      profile_id: profile.id,
      image_type: "digital",
    });
    expect(digitals.length).toBe(0);
    expect(purgeStoredImageArtifacts).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
describe("M4 — server-side height + real-headshot gates", () => {
  it("scout/confirm requires a real uploaded headshot (not the Google avatar)", async () => {
    const email = track("m4.photo@example.test");
    await purgeUserByEmail(email);
    const agent = request.agent(app);
    // entry parks Google picture on users.avatar_url — not as book media.
    const res = await entry(
      agent,
      {
        uid: "m4-photo-uid",
        email,
        email_verified: true,
        name: "Avatar Only",
        picture: "https://example.com/avatar.jpg",
      },
      { date_of_birth: "1996-04-01" },
    );
    const cookie = cookieFrom(res);
    const user = await knex("users").where({ email }).first();
    const profile = await getProfileByUser(user.id);
    await setProfileState(profile.id, "scout", ["entry", "birthdate", "gender"], {
      date_of_birth: "1996-04-01",
    });

    expect(user.avatar_url).toBe("https://example.com/avatar.jpg");
    const bookImages = await knex("images").where({ profile_id: profile.id });
    expect(bookImages).toHaveLength(0);

    const confirm = await agent
      .post("/casting/scout/confirm")
      .set("Cookie", cookie)
      .send({});

    expect(confirm.status).toBe(400);
    expect(confirm.body.error).toBe("HEADSHOT_REQUIRED");
  });

  it("measurements refuses to advance without a usable height", async () => {
    const email = track("m4.height@example.test");
    await purgeUserByEmail(email);
    const agent = request.agent(app);
    const res = await entry(
      agent,
      { uid: "m4-height-uid", email, email_verified: true, name: "No Height" },
      { date_of_birth: "1996-04-01" },
    );
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    const user = await knex("users").where({ email }).first();
    const profile = await getProfileByUser(user.id);
    await setProfileState(
      profile.id,
      "measurements",
      ["entry", "birthdate", "gender", "scout"],
      { date_of_birth: "1996-04-01", height_cm: 0 },
    );

    const noHeight = await agent
      .post("/casting/measurements")
      .set("Cookie", cookie)
      .send({ hair_color: "Brown" });

    expect(noHeight.status).toBe(400);
    expect(noHeight.body.error).toBe("HEIGHT_REQUIRED");
    const after = await knex("profiles").where({ id: profile.id }).first();
    expect(after.onboarding_stage).toBe("measurements"); // did not advance

    // With a usable height it advances.
    const withHeight = await agent
      .post("/casting/measurements")
      .set("Cookie", cookie)
      .send({ height_cm: 178 });
    expect(withHeight.status).toBe(200);
    expect(withHeight.body.next_step).toBe("profile");
  });
});
