"use strict";

/**
 * The anonymous open-call apply flow — draft, email step, uploads, submit
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.1–§3.4, §5.1–§5.3, §7).
 *
 * What is load-bearing here, and therefore what these tests pin:
 *
 *  - **The submit produces a real application.** §3.4's whole argument is that
 *    an unclaimed applicant must land in `applications`, or the organizer needs
 *    a parallel review surface — the fork ruling R10 forbids. A submit that
 *    wrote only an `open_call_submissions` row would pass a naive test and fail
 *    the design.
 *  - **The frozen snapshot's identity block and images.** §4's resolver reads
 *    that payload for every unclaimed applicant, so its shape is a contract
 *    between this lane and the agency surfaces. It is deep-checked.
 *  - **The consent audit row exists without a user or a profile.** The rows
 *    those columns used to require do not exist at state 2 of the identity
 *    ladder, and the compensation sentence must be frozen beside the consent.
 *  - **The email step is not an oracle** (§5.3). A known and an unknown address
 *    must produce byte-identical responses.
 *  - **Uploads are gated behind the email step** (§7) — every stored asset has
 *    an accountable address attached before it exists.
 *  - **One application per (call, human)**, enforced by the partial unique and
 *    answered with one sentence that never says which key collided.
 *
 * Isolated database, schema only; every fixture is inserted directly. The real
 * `processImage` runs against real bytes — sharp, the uploads directory and the
 * moderation heuristic included — because a mocked uploader would test the mock
 * and not the path §7.1 is worried about.
 */

const request = require("supertest");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("opencall-apply-flow");

// The receipt is fire-and-forget and its transport is not what this suite is
// about; the spy proves which of the two §5.3 emails was composed.
jest.mock("../../src/domains/opencall/services/emails", () => ({
  sendOpenCallReceiptEmail: jest.fn(async () => ({ messageId: "test" })),
  sendOpenCallReceiptEmailQuietly: jest.fn(async () => ({ sent: true })),
}));

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const config = require("../../src/config");
const {
  sendOpenCallReceiptEmailQuietly,
} = require("../../src/domains/opencall/services/emails");
const {
  resetApplicantIdentitySchemaCache,
} = require("../../src/domains/opencall/services/schema");
const {
  DRAFT_COOKIE_NAME,
} = require("../../src/domains/opencall/services/submissions");

const AGENCY_ID = uuidv4();

/** One organizer, several links — each test that submits needs its own call. */
const LINKS = {
  queens: { id: uuidv4(), code: "fwbkqueens01", identityPolicy: "account_optional" },
  brooklyn: { id: uuidv4(), code: "fwbkbklyn001", identityPolicy: "account_optional" },
  resume: { id: uuidv4(), code: "fwbkresume01", identityPolicy: "account_optional" },
  known: { id: uuidv4(), code: "fwbkknown001", identityPolicy: "account_optional" },
  talent: { id: uuidv4(), code: "fwbktalent01", identityPolicy: "account_optional" },
  deadline: { id: uuidv4(), code: "fwbkdeadln01", identityPolicy: "account_optional" },
  gated: { id: uuidv4(), code: "fwbkgated001", identityPolicy: "account_required" },
};

/**
 * A distinct client IP per request.
 *
 * `authLimiter` (10/min per IP outside serverless) is mounted on
 * `/api/public/opencall` in src/app.js and left ON here — this is exactly the
 * surface where §7's per-IP ceiling matters, and a suite that only passes with
 * the limiter stubbed out would not be testing the shipped route. Each fixture
 * applicant is a different person on a different phone.
 */
let ipCounter = 0;
function hit(agent) {
  ipCounter += 1;
  const octet = 1 + (ipCounter % 250);
  const block = 100 + Math.floor(ipCounter / 250);
  return agent.set("X-Forwarded-For", `198.51.${block}.${octet}`);
}

let uploadsBefore = new Set();

/** A real, flat image: no texture, so the skin heuristic counts no pixels. */
async function testImage() {
  const sharp = require("sharp");
  return sharp({
    create: {
      width: 400,
      height: 600,
      channels: 3,
      background: { r: 120, g: 128, b: 136 },
    },
  })
    .png()
    .toBuffer();
}

async function insertLink({ id, code, identityPolicy }) {
  await knex("agency_open_call_links").insert({
    id,
    agency_id: AGENCY_ID,
    code,
    label: "FWBK",
    status: "active",
    call_kind: "event_casting",
    identity_policy: identityPolicy,
    // NULL intake_spec = "use the platform default for this call kind", which
    // is the FWBK apply stage from §3.1: ten asks, two of them photos.
    intake_spec: null,
    intake_spec_version: 1,
    event_name: "Fashion Week Brooklyn",
    event_starts_on: "2026-10-04",
    event_ends_on: "2026-10-10",
    event_location: "Brooklyn, NY",
    compensation_type: "unpaid",
    compensation_details: "Unpaid. Travel is not reimbursed.",
    brief_who: "Runway models for the October season.",
    brief_what: "Two digitals and your stats.",
    brief_next_steps: "We reply within two weeks.",
    brief_ongoing: true,
    brief_completed_at: knex.fn.now(),
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

const TYPED_ANSWERS = Object.freeze({
  legal_name: "Nia Okonkwo",
  gender: "female",
  city: "Brooklyn",
  height: 178,
  adult_attestation: true,
  instagram: "niaokonkwo",
});

/** The whole apply stage, up to but not including submit. */
async function fillDraft(agent, code, { email, answers = TYPED_ANSWERS } = {}) {
  const saved = await hit(agent.post(`/api/public/opencall/call/${code}/draft`))
    .send({ answers })
    .expect(200);

  await hit(agent.post(`/api/public/opencall/call/${code}/draft/email`))
    .send({ email, phone: "(347) 555-0134" })
    .expect(200);

  const image = await testImage();
  for (const fieldKey of ["digital_headshot", "digital_full_length"]) {
    await hit(agent.post(`/api/public/opencall/call/${code}/draft/media/${fieldKey}`))
      .attach("media", image, { filename: `${fieldKey}.png`, contentType: "image/png" })
      .expect(200);
  }

  return saved.body.data;
}

async function currentFingerprint(agent, code) {
  const res = await hit(agent.get(`/api/public/opencall/call/${code}/draft`)).expect(200);
  return res.body.data;
}

function consentBody(packageFingerprint) {
  return {
    consent: {
      confirmed: true,
      accuracyConfirmed: true,
      adultAuthorityConfirmed: true,
      packageFingerprint,
    },
  };
}

beforeAll(async () => {
  await migrate(knex);
  resetApplicantIdentitySchemaCache();

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Fashion Week Brooklyn",
    status: "ACTIVE",
  });
  for (const link of Object.values(LINKS)) await insertLink(link);

  try {
    uploadsBefore = new Set(fs.readdirSync(config.uploadsDir));
  } catch {
    uploadsBefore = new Set();
  }
}, 180000);

afterAll(async () => {
  // Leave the uploads directory as we found it — the real uploader wrote real
  // files into it.
  try {
    for (const name of fs.readdirSync(config.uploadsDir)) {
      if (!uploadsBefore.has(name)) {
        fs.unlinkSync(path.join(config.uploadsDir, name));
      }
    }
  } catch {
    /* nothing to clean */
  }
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

beforeEach(() => {
  sendOpenCallReceiptEmailQuietly.mockClear();
});

/* --------------------------------------------------------------- the call */

describe("GET /api/public/opencall/call/:code", () => {
  test("serves the call, the apply-stage spec and an empty resume", async () => {
    const res = await hit(
      request(app).get(`/api/public/opencall/call/${LINKS.queens.code}`),
    ).expect(200);

    const { data } = res.body;
    expect(data.valid).toBe(true);
    expect(data.accountRequired).toBe(false);
    expect(data.closed).toBe(false);
    expect(data.agency.name).toBe("Fashion Week Brooklyn");
    // Compensation is stated verbatim before a minute is invested (§2.5).
    expect(data.compensation).toEqual({
      type: "unpaid",
      details: "Unpaid. Travel is not reimbursed.",
    });

    const keys = data.spec.fields.map((field) => field.key);
    expect(keys).toEqual([
      "legal_name",
      "email",
      "phone",
      "adult_attestation",
      "gender",
      "city",
      "height",
      "digital_headshot",
      "digital_full_length",
      "instagram",
    ]);
    // The heavy asks are advertised, never asked here (§2.3).
    expect(data.spec.shortlistFields.map((field) => field.key)).toEqual([
      "walk_video_url",
      "availability_window",
      "core_measurements",
    ]);
    expect(data.spec.customQuestionLimits.maxQuestions).toBe(5);
    expect(data.resume.hasDraft).toBe(false);
    expect(data.resume.blockers).toContain("intake_missing:digital_headshot");
  });

  test("an `account_required` call refuses this surface and says so in one flag", async () => {
    const res = await hit(
      request(app).get(`/api/public/opencall/call/${LINKS.gated.code}`),
    ).expect(200);
    expect(res.body.data.accountRequired).toBe(true);
    // The client falls back to today's arrival flow; nothing is deleted (§7).
    expect(res.body.data.spec).toBeUndefined();
  });

  test("an unknown code never confirms whether it maps to a real agency", async () => {
    const res = await hit(
      request(app).get("/api/public/opencall/call/notarealcode1"),
    ).expect(200);
    expect(res.body).toEqual({ success: true, data: { valid: false } });
  });
});

/* --------------------------------------------------------- the happy path */

describe("the apply stage end to end", () => {
  const agent = request.agent(app);
  const code = LINKS.queens.code;
  const email = "Nia.Okonkwo+queens@example.com";
  let applicationId = null;

  test(
    "an anonymous applicant reaches a real application row with no account",
    async () => {
      /* ---- answers first: photos come last, so every typed answer is banked
         in the draft before the highest-abandonment step (ruling Q7) ------- */
      const draftRes = await hit(
        agent.post(`/api/public/opencall/call/${code}/draft`),
      )
        .send({ answers: TYPED_ANSWERS })
        .expect(200);
      expect(draftRes.body.data.savedKeys.sort()).toEqual(
        Object.keys(TYPED_ANSWERS).sort(),
      );
      expect(draftRes.body.data.identityAttached).toBe(false);
      // The draft cookie is httpOnly and carries no readable state.
      const cookie = draftRes.headers["set-cookie"].find((value) =>
        value.startsWith(`${DRAFT_COOKIE_NAME}=`),
      );
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);

      /* ---- uploads are gated behind the email step (§7) ------------------ */
      const image = await testImage();
      const tooEarly = await hit(
        agent.post(`/api/public/opencall/call/${code}/draft/media/digital_headshot`),
      )
        .attach("media", image, { filename: "h.png", contentType: "image/png" })
        .expect(403);
      expect(tooEarly.body.error).toBe("EMAIL_REQUIRED");

      /* ---- the email step ------------------------------------------------ */
      const emailRes = await hit(
        agent.post(`/api/public/opencall/call/${code}/draft/email`),
      )
        .send({ email, phone: "(347) 555-0134" })
        .expect(200);
      expect(emailRes.body).toEqual({ success: true, data: { attached: true } });

      /* ---- a key this call never asked for is refused -------------------- */
      const unknownKey = await hit(
        agent.post(`/api/public/opencall/call/${code}/draft/media/digital_profile`),
      )
        .attach("media", image, { filename: "p.png", contentType: "image/png" })
        .expect(400);
      expect(unknownKey.body.error).toBe("MEDIA_FIELD_NOT_REQUESTED");

      const nonsenseKey = await hit(
        agent.post(`/api/public/opencall/call/${code}/draft/media/passport_scan`),
      )
        .attach("media", image, { filename: "p.png", contentType: "image/png" })
        .expect(400);
      expect(nonsenseKey.body.error).toBe("UNKNOWN_MEDIA_FIELD");

      /* ---- the two digitals ---------------------------------------------- */
      for (const fieldKey of ["digital_headshot", "digital_full_length"]) {
        const res = await hit(
          agent.post(`/api/public/opencall/call/${code}/draft/media/${fieldKey}`),
        )
          .attach("media", image, { filename: `${fieldKey}.png`, contentType: "image/png" })
          .expect(200);
        expect(res.body.data.stored).toBe(true);
      }

      /* ---- the consent screen reads the package it is binding to --------- */
      const state = await currentFingerprint(agent, code);
      expect(state.blockers).toEqual([]);
      expect(state.mediaPresent.sort()).toEqual([
        "digital_full_length",
        "digital_headshot",
      ]);
      expect(state.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);

      /* ---- a fingerprint from before the photos is refused --------------- */
      const stale = await hit(agent.post(`/api/public/opencall/call/${code}/submit`))
        .send(consentBody(draftRes.body.data.packageFingerprint))
        .expect(409);
      expect(stale.body.error).toBe("CONSENT_PACKAGE_CHANGED");

      /* ---- send ----------------------------------------------------------- */
      const submitted = await hit(
        agent.post(`/api/public/opencall/call/${code}/submit`),
      )
        .send(consentBody(state.packageFingerprint))
        .expect(200);
      expect(submitted.body.data).toEqual({
        submitted: true,
        receiptEmailQueued: true,
      });
      // The internal application id never reaches an anonymous caller.
      expect(submitted.body.data.applicationId).toBeUndefined();
    },
    120000,
  );

  test("the application row carries an identity and no profile", async () => {
    const application = await knex("applications")
      .where({ open_call_link_id: LINKS.queens.id })
      .first();
    expect(application).toBeTruthy();
    applicationId = application.id;

    expect(application.profile_id).toBeNull();
    expect(application.applicant_identity_id).toBeTruthy();
    expect(application.agency_id).toBe(AGENCY_ID);
    expect(application.call_purpose).toBe("event_casting");
    expect(application.status).toBe("pending");
    expect(application.status_changed_at).toBeTruthy();

    // No `users` row and no `profiles` row were written (§3.2, state 2).
    const identity = await knex("applicant_identities")
      .where({ id: application.applicant_identity_id })
      .first();
    expect(identity.email_normalized).toBe("nia.okonkwo@example.com");
    expect(identity.phone_normalized).toBe("+13475550134");
    expect(identity.claimed_at).toBeNull();
    expect(identity.profile_id).toBeNull();
    const user = await knex("users")
      .whereRaw("LOWER(email) LIKE ?", ["nia.okonkwo%"])
      .first();
    expect(user).toBeUndefined();
  });

  test("the frozen snapshot matches the contract §4's resolver reads", async () => {
    const row = await knex("talent_submission_packages")
      .where({ application_id: applicationId })
      .first();
    expect(row).toBeTruthy();
    expect(row.user_id).toBeNull();
    expect(row.profile_id).toBeNull();
    expect(row.applicant_identity_id).toBeTruthy();
    // Ruling R4: an event package is deleted 90 days after the event ends.
    expect(String(row.retention_expires_at)).toContain("2027-01-08");

    const payload =
      typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    expect(payload.packageSchemaVersion).toBe(2);
    expect(payload.applicationId).toBe(applicationId);
    expect(payload.agencyId).toBe(AGENCY_ID);
    expect(payload.agencyName).toBe("Fashion Week Brooklyn");
    expect(payload.callPurpose).toBe("event_casting");
    expect(payload.openCallLinkId).toBe(LINKS.queens.id);
    // Shortlist-stage asks, so both are empty at apply (§2.3).
    expect(payload.availability).toBeNull();
    expect(payload.walkVideoUrl).toBeNull();

    expect(payload.identity).toEqual({
      source: "open_call_submission",
      applicantIdentityId: expect.any(String),
      firstName: "Nia",
      lastName: "Okonkwo",
      displayName: "Nia Okonkwo",
      // As typed, plus tag intact — the plus-stripped form is the identity
      // key, not the address a human reads.
      email: "Nia.Okonkwo+queens@example.com",
      phone: "(347) 555-0134",
      city: "Brooklyn",
      gender: "female",
      heightCm: 178,
      instagram: "niaokonkwo",
      adultAttestation: true,
    });

    expect(payload.images).toHaveLength(2);
    expect(payload.images[0]).toEqual({
      id: expect.any(String),
      path: expect.stringContaining("/uploads/"),
      public_url: expect.stringContaining("/uploads/"),
      alt: "",
      image_type: "digital",
      shot_type: "headshot",
      sort: 1,
      is_primary: false,
    });
    expect(payload.images[1].shot_type).toBe("full_length");
    expect(payload.answers.legal_name).toBe("Nia Okonkwo");
    expect(payload.customAnswers).toEqual({});
  });

  test("the consent audit row exists without a user or a profile", async () => {
    const consent = await knex("application_submission_consent_events")
      .where({ application_id: applicationId })
      .first();
    expect(consent).toBeTruthy();
    expect(consent.user_id).toBeNull();
    expect(consent.profile_id).toBeNull();
    expect(consent.applicant_identity_id).toBeTruthy();
    expect(consent.purpose).toBe("event_casting");
    expect(consent.open_call_link_id).toBe(LINKS.queens.id);
    expect(consent.package_fingerprint).toMatch(/^[a-f0-9]{64}$/);

    // The compensation sentence the applicant read, frozen verbatim.
    const compensation =
      typeof consent.compensation_disclosure === "string"
        ? JSON.parse(consent.compensation_disclosure)
        : consent.compensation_disclosure;
    expect(compensation.type).toBe("unpaid");
    expect(compensation.details).toBe("Unpaid. Travel is not reimbursed.");
    expect(compensation.statement).toContain("Unpaid. Travel is not reimbursed.");
  });

  test("the submission is submitted, and its TTL became the stated retention", async () => {
    const submission = await knex("open_call_submissions")
      .where({ open_call_link_id: LINKS.queens.id })
      .first();
    expect(submission.status).toBe("submitted");
    expect(submission.submitted_at).toBeTruthy();
    expect(submission.applicant_identity_id).toBeTruthy();
    expect(String(submission.expires_at)).toContain("2027-01-08");
    expect(submission.ip_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("the receipt is the claim, and both tokens exist", async () => {
    expect(sendOpenCallReceiptEmailQuietly).not.toHaveBeenCalled(); // cleared per test
    const identity = await knex("applicant_identities")
      .where({ email_normalized: "nia.okonkwo@example.com" })
      .first();
    const tokens = await knex("applicant_claim_tokens")
      .where({ applicant_identity_id: identity.id })
      .select("purpose");
    expect(tokens.map((row) => row.purpose).sort()).toEqual(["claim", "disown"]);
  });

  test("the pre-account funnel steps are recorded (design C2)", async () => {
    const rows = await knex("event_casting_funnel_events")
      .where({ open_call_link_id: LINKS.queens.id })
      .select("event_type");
    const types = rows.map((row) => row.event_type);
    expect(types).toContain("application_started");
    expect(types).toContain("application_completed");
    expect(types).toContain("claim_sent");
  });

  test("a second send is one sentence that never says which key collided", async () => {
    // The draft cookie was cleared on submit, so this is the honest retry: a
    // fresh draft under the same address on the same call.
    const second = request.agent(app);
    await fillDraft(second, code, { email });
    const state = await currentFingerprint(second, code);
    const res = await hit(second.post(`/api/public/opencall/call/${code}/submit`))
      .send(consentBody(state.packageFingerprint))
      .expect(409);
    expect(res.body.error).toBe("ALREADY_APPLIED");
    expect(res.body.message).toBe("You have already applied to this call.");
  }, 120000);
});

/* ------------------------------------------------------------- the edges */

describe("the apply stage's edges", () => {
  test("send is blocked, by name, until the required media exists (ruling Q7)", async () => {
    const agent = request.agent(app);
    const code = LINKS.brooklyn.code;

    await hit(agent.post(`/api/public/opencall/call/${code}/draft`))
      .send({ answers: TYPED_ANSWERS })
      .expect(200);
    await hit(agent.post(`/api/public/opencall/call/${code}/draft/email`))
      .send({ email: "blocked@example.com", phone: "3475550199" })
      .expect(200);

    const state = await currentFingerprint(agent, code);
    expect(state.blockers.sort()).toEqual([
      "intake_missing:digital_full_length",
      "intake_missing:digital_headshot",
    ]);

    const res = await hit(agent.post(`/api/public/opencall/call/${code}/submit`))
      .send(consentBody(state.packageFingerprint))
      .expect(400);
    expect(res.body.error).toBe("INTAKE_INCOMPLETE");
    expect(res.body.blockers).toContain("intake_missing:digital_headshot");

    // Nothing was written for an unfinished application.
    const application = await knex("applications")
      .where({ open_call_link_id: LINKS.brooklyn.id })
      .first();
    expect(application).toBeUndefined();
  }, 60000);

  test("a closed tab resumes from the same device with its answers intact", async () => {
    const agent = request.agent(app);
    const code = LINKS.resume.code;

    await hit(agent.post(`/api/public/opencall/call/${code}/draft`))
      .send({
        answers: { legal_name: "Marisol Vega", city: "Queens" },
        customAnswers: { "How did you hear about us?": "A friend walked last year" },
      })
      .expect(200);

    const res = await hit(agent.get(`/api/public/opencall/call/${code}`)).expect(200);
    expect(res.body.data.resume.hasDraft).toBe(true);
    expect(res.body.data.resume.answersPresentKeys).toEqual(["city", "legal_name"]);
    expect(res.body.data.resume.answers.legal_name).toBe("Marisol Vega");
    expect(res.body.data.resume.customAnswers).toEqual({
      "How did you hear about us?": "A friend walked last year",
    });
    expect(res.body.data.resume.identityAttached).toBe(false);
    expect(res.body.data.resume.mediaPresent).toEqual([]);
  });

  test("a key the call did not ask for cannot be written into the draft", async () => {
    const agent = request.agent(app);
    const code = LINKS.resume.code;
    const res = await hit(agent.post(`/api/public/opencall/call/${code}/draft`))
      .send({ answers: { walk_video_url: "https://example.com/walk.mp4" } })
      .expect(400);
    expect(res.body.error).toBe("INTAKE_VALIDATION_FAILED");
    expect(res.body.errors).toEqual([
      { key: "walk_video_url", code: "not_asked_at_apply" },
    ]);
  });

  test("the email step answers identically for a known and an unknown address", async () => {
    // A full Pholio account, and an address nobody has ever seen.
    const userId = uuidv4();
    await knex("users").insert({
      id: userId,
      email: "known.talent@example.com",
      role: "TALENT",
      first_name: "Known",
      last_name: "Talent",
      email_verified: true,
      created_at: knex.fn.now(),
    });

    const responses = [];
    for (const address of ["known.talent@example.com", "stranger@example.com"]) {
      const agent = request.agent(app);
      const res = await hit(
        agent.post(`/api/public/opencall/call/${LINKS.known.code}/draft/email`),
      )
        .send({ email: address })
        .expect(200);
      responses.push(res.body);
    }
    // §5.3: "does this email have a Pholio account?" is never answered to an
    // anonymous visitor. The branch lives in the email.
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[0]).toEqual({ success: true, data: { attached: true } });
  });

  test("an address with a claimed profile attaches to it and is sent no claim link", async () => {
    const userId = uuidv4();
    const profileId = uuidv4();
    await knex("users").insert({
      id: userId,
      email: "claimed.talent@example.com",
      role: "TALENT",
      first_name: "Claimed",
      last_name: "Talent",
      email_verified: true,
      created_at: knex.fn.now(),
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `claimed-talent-${profileId.slice(0, 6)}`,
      first_name: "Claimed",
      last_name: "Talent",
      city: "Brooklyn",
      height_cm: 180,
      bio_raw: "",
      bio_curated: "",
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    const agent = request.agent(app);
    const code = LINKS.talent.code;
    await fillDraft(agent, code, { email: "claimed.talent@example.com" });
    const state = await currentFingerprint(agent, code);
    await hit(agent.post(`/api/public/opencall/call/${code}/submit`))
      .send(consentBody(state.packageFingerprint))
      .expect(200);

    const application = await knex("applications")
      .where({ open_call_link_id: LINKS.talent.id })
      .first();
    // §5.3 row 1: the application attaches to that profile. Not a duplicate.
    expect(application.profile_id).toBe(profileId);
    // Provenance is kept: this application arrived without an account.
    expect(application.applicant_identity_id).toBeTruthy();

    const identity = await knex("applicant_identities")
      .where({ email_normalized: "claimed.talent@example.com" })
      .first();
    const tokens = await knex("applicant_claim_tokens")
      .where({ applicant_identity_id: identity.id })
      .select("purpose");
    // No claim link for an address that already has an account — the receipt
    // says "sign in to see it". Disown is still minted (§5.5).
    expect(tokens.map((row) => row.purpose)).toEqual(["disown"]);

    const [receipt] = sendOpenCallReceiptEmailQuietly.mock.calls.slice(-1);
    expect(receipt[0].alreadyHadAccount).toBe(true);
    expect(receipt[0].claimUrl).toBeNull();
    expect(receipt[0].disownUrl).toContain("/opencall/disown/");
    expect(receipt[0].eventDatesLabel).toBe("October 4–10");

    // The snapshot carries both pointers, so the resolver's claimed branch and
    // the identity provenance agree.
    const pkg = await knex("talent_submission_packages")
      .where({ application_id: application.id })
      .first();
    expect(pkg.profile_id).toBe(profileId);
    expect(pkg.user_id).toBe(userId);
    expect(pkg.applicant_identity_id).toBeTruthy();
  }, 120000);

  test("a call that closes while the form is open refuses the send", async () => {
    const agent = request.agent(app);
    const code = LINKS.deadline.code;
    await fillDraft(agent, code, { email: "late@example.com" });
    const state = await currentFingerprint(agent, code);

    // The published closing date passes between filling in and sending.
    await knex("agency_open_call_links")
      .where({ id: LINKS.deadline.id })
      .update({ brief_deadline: "2020-01-01", brief_ongoing: false });

    const res = await hit(agent.post(`/api/public/opencall/call/${code}/submit`))
      .send(consentBody(state.packageFingerprint))
      .expect(409);
    expect(res.body.error).toBe("CALL_CLOSED");

    const application = await knex("applications")
      .where({ open_call_link_id: LINKS.deadline.id })
      .first();
    expect(application).toBeUndefined();
  }, 120000);
});
