/**
 * Adult-only pilot boundary for talent onboarding.
 *
 * Entry must reject ineligible DOB evidence before creating a Pholio user,
 * profile, session, signal, image, or verification-email path. Firebase token
 * verification is mocked; no Firebase account is created by these API tests.
 */

const TEST_DB_PATH = `/tmp/pholio-adult-launch-eligibility-${process.pid}.sqlite3`;
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = `sqlite://${TEST_DB_PATH}`;
process.env.PHOLIO_SAFE_TEST_RUNNER = "1";
process.env.PHOLIO_SAFE_DEFAULT_DATABASE = TEST_DB_PATH;
// Keep empty values defined so src/config.js's dotenv load cannot restore the
// developer SMTP settings after this test has selected its isolated database.
process.env.SMTP_HOST = "";
process.env.SMTP_PORT = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.EMAIL_FROM = "";

const fs = require("fs");
const path = require("path");

function removeTestDatabase() {
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
}

removeTestDatabase();

const request = require("supertest");
const knex = require("../../src/shared/db/knex");

const mockAuth = { token: null };
jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(() => Promise.resolve(mockAuth.token)),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

const app = require("../../src/app");

const createdEmails = new Set();
let sequence = 0;

function uniqueEmail(label) {
  sequence += 1;
  const email = `adult-launch.${label}.${Date.now()}.${sequence}@example.test`;
  createdEmails.add(email);
  return email;
}

function tokenFor(email, uid) {
  return { uid, email, email_verified: true, name: "Adult Launch Test" };
}

function onboardingStep(profile) {
  const state = typeof profile.onboarding_state_json === "string"
    ? JSON.parse(profile.onboarding_state_json)
    : profile.onboarding_state_json;
  return state.current_step;
}

async function postEntry(agent, { email, uid, dob } = {}) {
  mockAuth.token = tokenFor(email, uid);
  return agent.post("/casting/entry").send({
    firebase_token: "token",
    name: "Adult Launch Test",
    terms_accepted: true,
    privacy_accepted: true,
    ...(dob !== undefined ? { date_of_birth: dob } : {}),
  });
}

async function purgeUserByEmail(email) {
  const user = await knex("users").where({ email }).first();
  if (!user) return;
  const profile = await knex("profiles").where({ user_id: user.id }).first();
  if (profile) {
    await knex("images").where({ profile_id: profile.id }).del().catch(() => {});
    await knex("onboarding_signals").where({ profile_id: profile.id }).del().catch(() => {});
    await knex("onboarding_analytics").where({ profile_id: profile.id }).del().catch(() => {});
    await knex("profiles").where({ id: profile.id }).del();
  }
  await knex("legal_acceptances").where({ user_id: user.id }).del().catch(() => {});
  await knex("sessions").where("sess", "like", `%${user.id}%`).del().catch(() => {});
  await knex("users").where({ id: user.id }).del();
}

describe("adult-only talent onboarding launch boundary", () => {
  test("rejects missing, malformed, and 17-year-old DOB evidence before any account or profile write", async () => {
    const today = new Date();
    const seventeenDob = `${today.getUTCFullYear() - 17}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const cases = [
      { label: "missing", dob: undefined, status: 400, error: "DOB_REQUIRED" },
      { label: "invalid", dob: "not-a-date", status: 400, error: "DOB_INVALID" },
      { label: "seventeen", dob: seventeenDob, status: 403, error: "ADULT_ELIGIBILITY_REQUIRED" },
    ];

    for (const candidate of cases) {
      const email = uniqueEmail(candidate.label);
      const uid = `adult-launch-${candidate.label}-${sequence}`;
      const agent = request.agent(app);

      const response = await postEntry(agent, { email, uid, dob: candidate.dob });

      expect(response.status).toBe(candidate.status);
      expect(response.body.error).toBe(candidate.error);
      expect(await knex("users").where({ email }).first()).toBeUndefined();
    }
  });

  test("accepts the exact 18th-birthday boundary and records the canonical DOB once", async () => {
    const email = uniqueEmail("eighteen");
    const uid = `adult-launch-eighteen-${sequence}`;
    const agent = request.agent(app);
    const today = new Date();
    const dob = `${today.getUTCFullYear() - 18}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

    const response = await postEntry(agent, { email, uid, dob });

    expect(response.status).toBe(200);
    expect(response.body.next_step).toBe("gender");
    const user = await knex("users").where({ email }).first();
    const profile = await knex("profiles").where({ user_id: user.id }).first();
    expect(profile.date_of_birth).toBe(dob);
    expect(onboardingStep(profile)).toBe("gender");
  });

  test("keeps an established adult DOB immutable across entry replay and legacy birthdate calls", async () => {
    const email = uniqueEmail("immutable");
    const uid = `adult-launch-immutable-${sequence}`;
    const agent = request.agent(app);
    const dob = "1990-07-18";
    const first = await postEntry(agent, { email, uid, dob });
    expect(first.status).toBe(200);

    // A proven adult may safely resume without re-sending DOB evidence.
    const resume = await postEntry(agent, { email, uid });
    expect(resume.status).toBe(200);

    const replay = await postEntry(agent, { email, uid, dob: "1991-07-18" });
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe("DOB_IMMUTABLE");

    const cookie = (first.headers["set-cookie"] || []).map((item) => item.split(";")[0]);
    const backButtonReplay = await agent
      .post("/casting/birthdate")
      .set("Cookie", cookie)
      .send({ date_of_birth: "1991-07-18" });
    expect(backButtonReplay.status).toBe(409);
    expect(backButtonReplay.body.error).toBe("DOB_IMMUTABLE");

    const user = await knex("users").where({ email }).first();
    const profile = await knex("profiles").where({ user_id: user.id }).first();
    expect(profile.date_of_birth).toBe(dob);
    expect(onboardingStep(profile)).toBe("gender");
  });

  test("blocks a legacy under-18 session from skipping directly to later onboarding writes", async () => {
    const email = uniqueEmail("legacy-minor");
    const uid = `adult-launch-legacy-minor-${sequence}`;
    const agent = request.agent(app);
    const first = await postEntry(agent, { email, uid, dob: "1990-07-18" });
    expect(first.status).toBe(200);

    const user = await knex("users").where({ email }).first();
    const today = new Date();
    const minorDob = `${today.getUTCFullYear() - 17}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    await knex("profiles")
      .where({ user_id: user.id })
      .update({ date_of_birth: minorDob });

    const blocked = await agent.post("/casting/gender").send({ gender: "Female" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("ADULT_ELIGIBILITY_REQUIRED");
  });

  test("scopes adult DOB middleware to casting paths and skips non-talent roles", () => {
    const castingSource = fs.readFileSync(
      path.join(__dirname, "../../src/domains/onboarding/routes/casting.js"),
      "utf8",
    );
    // Casting is mounted at `/`; without path/role guards, agency sessions
    // hitting /api/agency/* would fail closed with DOB_REQUIRED.
    expect(castingSource).toContain("onlyCastingPaths(requireActiveAccount())");
    expect(castingSource).toContain('path.startsWith("/onboarding")');
    expect(castingSource).toContain('path.startsWith("/casting")');
    expect(castingSource).toContain('req.session.role !== "TALENT"');
  });

  test("gates every production account/OAuth path and disables production Instagram redirect", () => {
    const entrySource = fs.readFileSync(
      path.join(__dirname, "../../client/src/domains/onboarding/pages/CastingEntry.jsx"),
      "utf8",
    );
    const functionBody = (name, nextName) => {
      const start = entrySource.indexOf(`const ${name}`);
      const end = nextName ? entrySource.indexOf(`const ${nextName}`, start) : entrySource.length;
      expect(start).toBeGreaterThan(-1);
      return entrySource.slice(start, end);
    };

    const google = functionBody("handleGoogleSignIn", "handleInstagramSignIn");
    const instagram = functionBody("handleInstagramSignIn", "handleNextManual");
    const email = functionBody("handleManualSignup");

    expect(google.indexOf("if (!validateAdultEligibility()) return;")).toBeLessThan(
      google.indexOf("new GoogleAuthProvider"),
    );
    expect(email.indexOf("if (!validateAdultEligibility()) return;")).toBeLessThan(
      email.indexOf("createUserWithEmailAndPassword"),
    );
    expect(instagram).toContain("if (!validateAdultEligibility()) return;");
    expect(instagram).toContain("Instagram sign-up is unavailable during this adults-only launch.");
    expect(entrySource).not.toContain("startInstagramAuth");
    expect(entrySource).not.toContain("isInstagramAuthConfigured");
  });

  test("uses America/New_York as the explicit pilot eligibility calendar", () => {
    const entrySource = fs.readFileSync(
      path.join(__dirname, "../../client/src/domains/onboarding/pages/CastingEntry.jsx"),
      "utf8",
    );
    const routeSource = fs.readFileSync(
      path.join(__dirname, "../../src/domains/onboarding/routes/casting.js"),
      "utf8",
    );

    expect(entrySource).toContain("const LAUNCH_TIME_ZONE = 'America/New_York'");
    expect(entrySource).toContain("max={launchCalendarDateString()}");
    expect(routeSource).toContain('const LAUNCH_TIME_ZONE = "America/New_York"');
    expect(routeSource).toContain("function computeLaunchAge");
  });
});

beforeAll(async () => {
  await knex.migrate.latest();
});

afterAll(async () => {
  for (const email of createdEmails) {
    await purgeUserByEmail(email);
  }
  await knex.destroy();
  removeTestDatabase();
});
