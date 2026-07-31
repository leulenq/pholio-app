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
const {
  canCollectSensitiveProfileFields,
} = require("../../src/shared/lib/talent-age");

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
/* M5 has TWO layers, and only one of them is reachable over HTTP today.
 *
 * Layer 1 — the adults-only launch gate. POST /casting/entry rejects any minor
 * with ADULT_ELIGIBILITY_REQUIRED, and requireAdultLaunchEligibility re-checks
 * the profile's DOB on every /casting and /onboarding request. So a minor can
 * neither create an account nor reach the upload handler at all. That is what
 * these route tests assert: a legacy under-18 record — the only way a minor
 * session can exist now — is turned away from the upload surface itself, not
 * just from signup. (Signup rejection is covered in adult-launch-eligibility.)
 *
 * Layer 2 — canCollectSensitiveProfileFields, the original M5 finding: a minor
 * without recorded guardian consent may not have a full_body shot COLLECTED,
 * independent of any launch policy. The route can no longer exercise it,
 * because layer 1 answers first and returns a different error. It is asserted
 * directly instead. The launch gate is explicitly described in the code as
 * "Pholio's CURRENT launch"; when it lifts, layer 2 is what still stands
 * between a minor and a full-length photo, so it stays pinned.
 *
 * The earlier version of this block drove entry with a 15-year-old DOB and
 * then asserted SENSITIVE_SHOT_BLOCKED. Since the launch gate landed, that
 * created no user at all and failed on `user.id` of undefined. */
describe("M5 — minors cannot upload full_body at collection", () => {
  /** Adult account, then the DOB rewritten to a minor's — the legacy shape. */
  async function legacyMinorSession(email, uid) {
    await purgeUserByEmail(email);
    const agent = request.agent(app);
    const res = await entry(agent, {
      uid,
      email,
      email_verified: true,
      name: "Legacy Minor",
    });
    expect(res.status).toBe(200);

    const cookie = cookieFrom(res);
    const user = await knex("users").where({ email }).first();
    const profile = await getProfileByUser(user.id);
    await setProfileState(profile.id, "scout", ["entry", "birthdate", "gender"], {
      date_of_birth: dobYearsAgo(15),
    });
    return { agent, cookie, profile };
  }

  it("turns a minor session away from the scout upload before any image is stored", async () => {
    const email = track("m5.minor@example.test");
    const { agent, cookie, profile } = await legacyMinorSession(
      email,
      "m5-minor-uid",
    );

    const uploadRes = await agent
      .post("/casting/scout")
      .set("Cookie", cookie)
      .field("shot_type", "full_body")
      .attach("digi", FIXTURE);

    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.error).toBe("ADULT_ELIGIBILITY_REQUIRED");
    const imgs = await knex("images").where({ profile_id: profile.id });
    expect(imgs.length).toBe(0);
  });

  it("blocks a minor's headshot too — the launch gate is not shot-type aware", async () => {
    const email = track("m5.minor.headshot@example.test");
    const { agent, cookie, profile } = await legacyMinorSession(
      email,
      "m5-minor-hs-uid",
    );

    const uploadRes = await agent
      .post("/casting/scout")
      .set("Cookie", cookie)
      .field("shot_type", "headshot")
      .attach("digi", FIXTURE);

    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.error).toBe("ADULT_ELIGIBILITY_REQUIRED");
    const imgs = await knex("images").where({ profile_id: profile.id });
    expect(imgs.length).toBe(0);
  });

  it("keeps the collection guard itself denying minors and unknown ages", () => {
    // The predicate the upload handler calls once a request gets that far.
    const minor = { date_of_birth: dobYearsAgo(15) };
    const minorWithGuardian = {
      date_of_birth: dobYearsAgo(15),
      guardian_consent_at: new Date().toISOString(),
    };
    const adult = { date_of_birth: dobYearsAgo(28) };

    expect(canCollectSensitiveProfileFields(minor)).toBe(false);
    // Fails closed with no verifiable age on file.
    expect(canCollectSensitiveProfileFields({})).toBe(false);
    expect(canCollectSensitiveProfileFields({ date_of_birth: null })).toBe(false);
    expect(canCollectSensitiveProfileFields(adult)).toBe(true);
    // Guardian consent is what unlocks it — recorded, not assumed.
    expect(canCollectSensitiveProfileFields(minorWithGuardian)).toBe(true);
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
