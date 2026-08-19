"use strict";

/**
 * Shortlist-stage fulfilment — the applicant's half of "request materials"
 * (`docs/open-call-applicant-flow-design-2026-08.md` §2 Law 2, §5.4, ruling Q8).
 *
 * What is load-bearing here, and therefore what these tests pin:
 *
 *  - **No account, ever.** Q8: fulfilment requires no session and no claim. The
 *    claim is offered *after* the send, and only to an identity that has not
 *    already got an account — a page that made the claim a precondition would be
 *    the abandonment the whole flow exists to remove.
 *  - **Viewing does not consume.** A materials link is opened more than once
 *    before it is answered — on the train, then at home with a tape measure, and
 *    once more by the mail client's link previewer. A GET that spent the token
 *    would lock the applicant out of the ask they were sent.
 *  - **The write lands where the organizer reads.** `payload.answers` is what
 *    §4's resolver reads for measurements; top-level `availability` /
 *    `walkVideoUrl` are what the designer pick page reads. A fulfilment that
 *    wrote only one of the two would pass a naive test and be invisible on the
 *    surface that matters.
 *  - **Only the requested keys.** `answers` is projected onto profile columns at
 *    claim (§5.2), so a key nobody asked for is a value that silently reaches a
 *    profile.
 *  - **Single use at fulfilment.** A second send answers the same `{valid:false}`
 *    shape as an unknown token.
 *
 * Isolated database, schema only; every fixture is inserted directly so the
 * assertions are about the fulfilment and not about seed data.
 */

const request = require("supertest");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("opencall-materials-fulfilment");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const {
  CLAIM_TOKEN_PURPOSES,
  hashToken,
  mintClaimToken,
} = require("../../src/domains/opencall/services/claim-tokens");
const {
  resetApplicantIdentitySchemaCache,
} = require("../../src/domains/opencall/services/schema");
const {
  resolveApplicantIdentity,
} = require("../../src/domains/agency/services/applicant-identity");
const {
  EVENT_CASTING_DISCLOSURE_CONTENT,
} = require("../../src/shared/lib/submission-disclosure-content");

const AGENCY_ID = uuidv4();
const LINK_ID = uuidv4();
/** A SECOND, unrelated organizer — the whole point of the binding tests. */
const OTHER_AGENCY_ID = uuidv4();
const OTHER_LINK_ID = uuidv4();

const SHORTLIST_KEYS = ["walk_video_url", "availability_window", "core_measurements"];

/**
 * A distinct client IP per request. `authLimiter` is mounted on
 * `/api/public/opencall/materials` in src/app.js and left ON here — this is a
 * credential-shaped endpoint and a suite that only passes with the limiter
 * stubbed out would not be testing the shipped route.
 */
let ipCounter = 0;
function hit(agent) {
  ipCounter += 1;
  const octet = 1 + (ipCounter % 250);
  const block = 10 + Math.floor(ipCounter / 250);
  return agent.set("X-Forwarded-For", `203.0.${block}.${octet}`);
}

async function insertIdentity({ email, claimedAt = null, profileId = null }) {
  const id = uuidv4();
  await knex("applicant_identities").insert({
    id,
    email_normalized: email,
    phone_normalized: null,
    profile_id: profileId,
    claimed_at: claimedAt,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

/** An identity-only application plus the frozen snapshot §4's resolver reads. */
async function insertApplication(
  identityId,
  { answers = {}, agencyId = AGENCY_ID, linkId = LINK_ID } = {},
) {
  const applicationId = uuidv4();
  await knex("applications").insert({
    id: applicationId,
    profile_id: null,
    applicant_identity_id: identityId,
    agency_id: agencyId,
    open_call_link_id: linkId,
    call_purpose: "event_casting",
    status: "pending",
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  await knex("talent_submission_packages").insert({
    id: uuidv4(),
    application_id: applicationId,
    applicant_identity_id: identityId,
    user_id: null,
    profile_id: null,
    label: "Open call application",
    payload: JSON.stringify({
      packageSchemaVersion: 2,
      applicationId,
      agencyId: AGENCY_ID,
      openCallLinkId: LINK_ID,
      availability: null,
      walkVideoUrl: null,
      identity: {
        source: "open_call_submission",
        applicantIdentityId: identityId,
        firstName: "Nia",
        lastName: "Okonkwo",
        displayName: "Nia Okonkwo",
        email: "nia@example.com",
      },
      images: [],
      answers: { legal_name: "Nia Okonkwo", city: "Brooklyn", ...answers },
      customAnswers: {},
    }),
    created_at: new Date().toISOString(),
  });

  return applicationId;
}

/** The submitted `open_call_submissions` row the application came from. */
async function insertSubmission(identityId, answers = {}) {
  const id = uuidv4();
  await knex("open_call_submissions").insert({
    id,
    open_call_link_id: LINK_ID,
    agency_id: AGENCY_ID,
    applicant_identity_id: identityId,
    answers: JSON.stringify({ legal_name: "Nia Okonkwo", ...answers }),
    custom_answers: "{}",
    intake_spec_version: 1,
    status: "submitted",
    submitted_at: knex.fn.now(),
    expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

async function insertSubmissionFor(identityId, linkId, agencyId) {
  const id = uuidv4();
  await knex("open_call_submissions").insert({
    id,
    open_call_link_id: linkId,
    agency_id: agencyId,
    applicant_identity_id: identityId,
    answers: JSON.stringify({ legal_name: "Nia Okonkwo" }),
    custom_answers: "{}",
    intake_spec_version: 1,
    status: "submitted",
    submitted_at: knex.fn.now(),
    expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

async function insertRequest(applicationId, { requestedKeys = SHORTLIST_KEYS, dueAt = null } = {}) {
  const id = uuidv4();
  await knex("open_call_material_requests").insert({
    id,
    application_id: applicationId,
    requested_keys: JSON.stringify(requestedKeys),
    due_at: dueAt,
    requested_by_user_id: null,
    fulfilled_at: null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

/**
 * One applicant, ready to be asked: identity + submission + application +
 * snapshot + the organizer's request + the emailed materials token.
 *
 * The token is BOUND to the request by default, because that is what the
 * organizer's route now mints (`20260819140000`). `bound: false` reproduces a
 * token from before the binding existed — the links already sitting in people's
 * inboxes, which must keep working through the legacy identity-join fallback.
 */
async function buildApplicant({
  email = `${crypto.randomBytes(6).toString("hex")}@example.com`,
  claimedAt = null,
  requestedKeys = SHORTLIST_KEYS,
  dueAt = "2026-09-01T00:00:00.000Z",
  bound = true,
} = {}) {
  const identityId = await insertIdentity({ email, claimedAt });
  const submissionId = await insertSubmission(identityId);
  const applicationId = await insertApplication(identityId);
  const requestId = await insertRequest(applicationId, { requestedKeys, dueAt });
  const token = await mintClaimToken(knex, {
    identityId,
    purpose: CLAIM_TOKEN_PURPOSES.MATERIALS,
    materialRequestId: bound ? requestId : null,
  });
  return { identityId, submissionId, applicationId, requestId, token };
}

function goodAnswers(overrides = {}) {
  return {
    answers: {
      walk_video_url: "https://vimeo.com/1234567",
      availability_window: { from: "2026-10-04", to: "2026-10-10" },
      core_measurements: "Bust 82, Waist 61, Hips 89",
      measurementsConfirmed: true,
      ...overrides,
    },
  };
}

async function payloadFor(applicationId) {
  const row = await knex("talent_submission_packages")
    .where({ application_id: applicationId })
    .orderBy("created_at", "desc")
    .first("payload");
  return JSON.parse(row.payload);
}

beforeAll(async () => {
  await migrate(knex);
  resetApplicantIdentitySchemaCache();

  await knex("agencies").insert([
    {
      id: AGENCY_ID,
      name: "Fashion Week Brooklyn",
      location: "Brooklyn, NY",
      status: "ACTIVE",
    },
    {
      id: OTHER_AGENCY_ID,
      name: "Harbour Management",
      location: "Manhattan, NY",
      status: "ACTIVE",
    },
  ]);

  await knex("agency_open_call_links").insert([
    {
      id: LINK_ID,
      agency_id: AGENCY_ID,
      code: "fwbkmaterial",
      label: "FWBK Queens",
      status: "active",
      call_kind: "event_casting",
      identity_policy: "account_optional",
      intake_spec: null,
      intake_spec_version: 1,
      event_name: "Fashion Week Brooklyn",
      event_starts_on: "2026-10-04",
      event_ends_on: "2026-10-10",
      event_location: "Brooklyn, NY",
      compensation_type: "unpaid",
      compensation_details: "Unpaid. Travel is not reimbursed.",
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: OTHER_LINK_ID,
      agency_id: OTHER_AGENCY_ID,
      code: "harbourmater",
      label: "Harbour open call",
      status: "active",
      call_kind: "event_casting",
      identity_policy: "account_optional",
      intake_spec: null,
      intake_spec_version: 1,
      event_name: "Harbour Season",
      event_starts_on: "2026-11-02",
      event_ends_on: "2026-11-06",
      event_location: "Manhattan, NY",
      compensation_type: "unpaid",
      compensation_details: "Unpaid. Travel is not reimbursed.",
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
}, 180000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

/* --------------------------------------------------------------- the page */

describe("GET /api/public/opencall/materials/:token", () => {
  test("serves the ask: organizer, event, field defs, due date and the disclosure", async () => {
    const { token } = await buildApplicant();

    const res = await hit(
      request(app).get(`/api/public/opencall/materials/${token.rawToken}`),
    ).expect(200);

    const { data } = res.body;
    expect(data.valid).toBe(true);
    expect(data.fulfilled).toBe(false);
    expect(data.organizer).toEqual({
      name: "Fashion Week Brooklyn",
      logo: null,
      location: "Brooklyn, NY",
    });
    expect(data.event).toEqual({
      name: "Fashion Week Brooklyn",
      startsOn: "2026-10-04",
      endsOn: "2026-10-10",
      location: "Brooklyn, NY",
    });
    expect(data.requestedKeys).toEqual(SHORTLIST_KEYS);
    // The vocabulary's own kinds and labels — the page renders a URL input, two
    // date fields and a text field from these and nothing else.
    expect(data.fieldDefs).toEqual([
      { key: "walk_video_url", kind: "url", label: "Walk video" },
      { key: "availability_window", kind: "date_range", label: "Availability" },
      { key: "core_measurements", kind: "text", label: "Measurements" },
    ]);
    expect(new Date(data.dueAt).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(data.values).toEqual({});
    // Restated VERBATIM. §5.4's materials are exactly the fields designers see,
    // so the sentence the applicant consented to at submit is shown again here.
    expect(data.disclosure.thirdPartyAccess).toBe(
      EVENT_CASTING_DISCLOSURE_CONTENT.thirdPartyAccess,
    );
  });

  test("viewing does not consume the token — the link survives being opened twice", async () => {
    const { token } = await buildApplicant();
    const url = `/api/public/opencall/materials/${token.rawToken}`;

    await hit(request(app).get(url)).expect(200);
    await hit(request(app).get(url)).expect(200);

    const row = await knex("applicant_claim_tokens")
      .where({ token_hash: hashToken(token.rawToken) })
      .first("consumed_at");
    expect(row.consumed_at).toBeFalsy();

    const third = await hit(request(app).get(url)).expect(200);
    expect(third.body.data.valid).toBe(true);
  });

  test("an unknown token and a wrong-purpose token answer identically", async () => {
    const { identityId } = await buildApplicant();
    const claimToken = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });

    const unknown = await hit(
      request(app).get(
        `/api/public/opencall/materials/${crypto.randomBytes(32).toString("base64url")}`,
      ),
    ).expect(200);
    const wrongPurpose = await hit(
      request(app).get(`/api/public/opencall/materials/${claimToken.rawToken}`),
    ).expect(200);

    expect(unknown.body).toEqual({ success: true, data: { valid: false } });
    expect(wrongPurpose.body).toEqual(unknown.body);
  });

  test("a request the organizer already recorded as fulfilled says so", async () => {
    const { token, requestId } = await buildApplicant();
    await knex("open_call_material_requests")
      .where({ id: requestId })
      .update({ fulfilled_at: new Date().toISOString() });

    const res = await hit(
      request(app).get(`/api/public/opencall/materials/${token.rawToken}`),
    ).expect(200);

    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.fulfilled).toBe(true);
    expect(res.body.data.organizer.name).toBe("Fashion Week Brooklyn");
  });
});

/* ------------------------------------------------------------- fulfilment */

describe("POST /api/public/opencall/materials/:token", () => {
  test("writes the answers where the organizer and the designers read them", async () => {
    const { token, applicationId, submissionId, requestId } = await buildApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send(goodAnswers())
      .expect(200);

    expect(res.body.data.fulfilled).toBe(true);

    const payload = await payloadFor(applicationId);
    // Top level — the designer pick page reads these two straight off the
    // frozen snapshot.
    expect(payload.walkVideoUrl).toBe("https://vimeo.com/1234567");
    expect(payload.availability).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    // `payload.answers` — where §4's resolver reads measurements from.
    expect(payload.answers.core_measurements).toBe("Bust 82, Waist 61, Hips 89");
    expect(payload.answers.walk_video_url).toBe("https://vimeo.com/1234567");
    // Merged, never replaced: what was answered at apply survives.
    expect(payload.answers.legal_name).toBe("Nia Okonkwo");
    expect(payload.materials.measurementsConfirmed).toBe(true);

    // The submission row the application came from carries the same answers.
    const submission = await knex("open_call_submissions")
      .where({ id: submissionId })
      .first("answers");
    const submissionAnswers = JSON.parse(submission.answers);
    expect(submissionAnswers.walk_video_url).toBe("https://vimeo.com/1234567");
    expect(submissionAnswers.legal_name).toBe("Nia Okonkwo");

    const requestRow = await knex("open_call_material_requests")
      .where({ id: requestId })
      .first("fulfilled_at");
    expect(requestRow.fulfilled_at).toBeTruthy();

    const tokenRow = await knex("applicant_claim_tokens")
      .where({ token_hash: hashToken(token.rawToken) })
      .first("consumed_at");
    expect(tokenRow.consumed_at).toBeTruthy();
  });

  test("§4's resolver sees the new walk video and measurements", async () => {
    const { token, applicationId } = await buildApplicant();

    await hit(request(app).post(`/api/public/opencall/materials/${token.rawToken}`))
      .send(goodAnswers())
      .expect(200);

    const application = await knex("applications").where({ id: applicationId }).first();
    const dto = await resolveApplicantIdentity(knex, application);
    expect(dto.measurements.text).toBe("Bust 82, Waist 61, Hips 89");
    expect(dto.displayName).toBe("Nia Okonkwo");

    const payload = await payloadFor(applicationId);
    expect(payload.walkVideoUrl).toBe("https://vimeo.com/1234567");
  });

  test("an unclaimed applicant is offered the claim AFTER sending (Q8)", async () => {
    const { token, identityId } = await buildApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send(goodAnswers())
      .expect(200);

    expect(res.body.data.claimUrl).toMatch(/\/opencall\/claim\//);

    const minted = await knex("applicant_claim_tokens")
      .where({ applicant_identity_id: identityId, purpose: CLAIM_TOKEN_PURPOSES.CLAIM })
      .count({ count: "*" })
      .first();
    expect(Number(minted.count)).toBe(1);
  });

  test("a claimed applicant is offered nothing — they already have the profile", async () => {
    const { token } = await buildApplicant({ claimedAt: new Date().toISOString() });

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send(goodAnswers())
      .expect(200);

    expect(res.body.data.fulfilled).toBe(true);
    expect(res.body.data.claimUrl).toBeNull();
  });

  test("a second send answers exactly what an unknown token answers", async () => {
    const { token } = await buildApplicant();
    const url = `/api/public/opencall/materials/${token.rawToken}`;

    await hit(request(app).post(url)).send(goodAnswers()).expect(200);
    const second = await hit(request(app).post(url)).send(goodAnswers()).expect(200);

    expect(second.body).toEqual({ success: true, data: { valid: false } });
  });

  test("a spent link, re-opened, says it was already sent instead of dying", async () => {
    const { token } = await buildApplicant();
    const url = `/api/public/opencall/materials/${token.rawToken}`;

    await hit(request(app).post(url)).send(goodAnswers()).expect(200);
    const reopened = await hit(request(app).get(url)).expect(200);

    expect(reopened.body.data.valid).toBe(false);
    expect(reopened.body.data.alreadySent).toBe(true);
  });

  test("a walk video that is not a URL is refused, and nothing is fulfilled", async () => {
    const { token, requestId, applicationId } = await buildApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send(goodAnswers({ walk_video_url: "not a link" }))
      .expect(400);

    expect(res.body.error).toBe("VALIDATION");
    expect(res.body.errors).toContainEqual({ key: "walk_video_url", code: "invalid_url" });

    const requestRow = await knex("open_call_material_requests")
      .where({ id: requestId })
      .first("fulfilled_at");
    expect(requestRow.fulfilled_at).toBeNull();
    expect((await payloadFor(applicationId)).walkVideoUrl).toBeNull();
  });

  test("a backwards availability window is refused", async () => {
    const { token } = await buildApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send(goodAnswers({ availability_window: { from: "2026-10-10", to: "2026-10-04" } }))
      .expect(400);

    expect(res.body.errors).toContainEqual({
      key: "availability_window",
      code: "invalid_date_range",
    });
  });

  test("measurements without the confirmation are not stored as confirmed", async () => {
    const { token } = await buildApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send(goodAnswers({ measurementsConfirmed: false }))
      .expect(400);

    expect(res.body.errors).toContainEqual({
      key: "core_measurements",
      code: "confirmation_required",
    });
  });

  test("only the requested keys are accepted — anything else is refused", async () => {
    // This organizer asked for one thing. `answers` is projected onto profile
    // columns at claim, so a key nobody asked for is a value that would silently
    // reach a profile.
    const { token, applicationId } = await buildApplicant({
      requestedKeys: ["walk_video_url"],
    });

    const refused = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send({
        answers: {
          walk_video_url: "https://vimeo.com/999",
          city: "Paris",
          core_measurements: "Bust 82",
        },
      })
      .expect(400);

    expect(refused.body.errors).toContainEqual({ key: "city", code: "not_requested" });
    expect(refused.body.errors).toContainEqual({
      key: "core_measurements",
      code: "not_requested",
    });

    const accepted = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send({ answers: { walk_video_url: "https://vimeo.com/999" } })
      .expect(200);
    expect(accepted.body.data.fulfilled).toBe(true);

    const payload = await payloadFor(applicationId);
    expect(payload.walkVideoUrl).toBe("https://vimeo.com/999");
    expect(payload.answers.city).toBe("Brooklyn");
    expect(payload.answers.core_measurements).toBeUndefined();
  });

  test("a missing requested answer is a per-field VALIDATION error", async () => {
    const { token } = await buildApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${token.rawToken}`),
    )
      .send({ answers: { walk_video_url: "https://vimeo.com/1" } })
      .expect(400);

    expect(res.body.errors).toContainEqual({ key: "availability_window", code: "required" });
    expect(res.body.errors).toContainEqual({ key: "core_measurements", code: "required" });
  });

  test("the funnel records the fulfilment", async () => {
    const { token } = await buildApplicant();

    await hit(request(app).post(`/api/public/opencall/materials/${token.rawToken}`))
      .send(goodAnswers())
      .expect(200);

    // Fire-and-forget after the commit; give the microtask a turn.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await knex("event_casting_funnel_events")
      .where({ open_call_link_id: LINK_ID, event_type: "materials_fulfilled" })
      .select("id");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

/* -------------------------------------------- the token names its own request */

/**
 * TWO ORGANIZERS, TWO OUTSTANDING ASKS, ONE APPLICANT.
 *
 * The identity join alone cannot tell the two links apart — it returns both
 * requests and picks by due date — so Agency A's emailed link rendered Agency
 * B's asks and, on send, marked B's request fulfilled. That is a cross-tenant
 * write authorized by a credential that was never scoped to it, and it is
 * invisible: both organizers see a plausible row.
 *
 * `applicant_claim_tokens.material_request_id` (`20260819140000`) is what makes
 * the link name its own ask.
 */
describe("a materials token is bound to the request it was emailed for", () => {
  test("the binding column exists", async () => {
    expect(
      await knex.schema.hasColumn("applicant_claim_tokens", "material_request_id"),
    ).toBe(true);
  });

  /** One applicant with a live ask from each of two organizers. */
  async function buildTwoOrganizerApplicant() {
    const identityId = await insertIdentity({
      email: `${crypto.randomBytes(6).toString("hex")}@example.com`,
    });
    await insertSubmission(identityId);
    await insertSubmissionFor(identityId, OTHER_LINK_ID, OTHER_AGENCY_ID);

    const applicationA = await insertApplication(identityId);
    const applicationB = await insertApplication(identityId, {
      agencyId: OTHER_AGENCY_ID,
      linkId: OTHER_LINK_ID,
    });

    // A asks for one thing and is due FIRST; B asks for everything and is due
    // LAST — so the legacy "newest due date wins" heuristic would hand A's link
    // B's request. The ordering is deliberate.
    const requestA = await insertRequest(applicationA, {
      requestedKeys: ["core_measurements"],
      dueAt: "2026-09-01T00:00:00.000Z",
    });
    const requestB = await insertRequest(applicationB, {
      requestedKeys: SHORTLIST_KEYS,
      dueAt: "2026-12-01T00:00:00.000Z",
    });

    const tokenA = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.MATERIALS,
      materialRequestId: requestA,
    });
    const tokenB = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.MATERIALS,
      materialRequestId: requestB,
    });

    return { identityId, applicationA, applicationB, requestA, requestB, tokenA, tokenB };
  }

  test("each link renders its own organizer and its own asks", async () => {
    const { tokenA, tokenB } = await buildTwoOrganizerApplicant();

    const a = await hit(
      request(app).get(`/api/public/opencall/materials/${tokenA.rawToken}`),
    ).expect(200);
    expect(a.body.data.organizer.name).toBe("Fashion Week Brooklyn");
    expect(a.body.data.requestedKeys).toEqual(["core_measurements"]);
    expect(a.body.data.event.name).toBe("Fashion Week Brooklyn");

    const b = await hit(
      request(app).get(`/api/public/opencall/materials/${tokenB.rawToken}`),
    ).expect(200);
    expect(b.body.data.organizer.name).toBe("Harbour Management");
    expect(b.body.data.requestedKeys).toEqual(SHORTLIST_KEYS);
    expect(b.body.data.event.name).toBe("Harbour Season");
  });

  test("fulfilling through A's link leaves B's request untouched", async () => {
    const { applicationA, applicationB, requestA, requestB, tokenA } =
      await buildTwoOrganizerApplicant();

    const res = await hit(
      request(app).post(`/api/public/opencall/materials/${tokenA.rawToken}`),
    )
      .send({
        answers: {
          core_measurements: "Bust 82, Waist 61, Hips 89",
          measurementsConfirmed: true,
        },
      })
      .expect(200);
    expect(res.body.data.fulfilled).toBe(true);
    expect(res.body.data.organizer.name).toBe("Fashion Week Brooklyn");

    const rowA = await knex("open_call_material_requests")
      .where({ id: requestA })
      .first("fulfilled_at");
    const rowB = await knex("open_call_material_requests")
      .where({ id: requestB })
      .first("fulfilled_at");
    expect(rowA.fulfilled_at).toBeTruthy();
    // The cross-tenant write this binding exists to stop.
    expect(rowB.fulfilled_at).toBeNull();

    // …and only A's snapshot was written into.
    const payloadA = await payloadFor(applicationA);
    const payloadB = await payloadFor(applicationB);
    expect(payloadA.answers.core_measurements).toBe("Bust 82, Waist 61, Hips 89");
    expect(payloadB.answers.core_measurements).toBeUndefined();
    expect(payloadB.materials).toBeUndefined();
  });

  test("a token bound to another applicant's request resolves to nothing", async () => {
    const mine = await buildTwoOrganizerApplicant();
    const theirs = await buildTwoOrganizerApplicant();

    // Hand-mint the mistake the binding must refuse: my identity, their request.
    const crossed = await mintClaimToken(knex, {
      identityId: mine.identityId,
      purpose: CLAIM_TOKEN_PURPOSES.MATERIALS,
      materialRequestId: theirs.requestA,
    });

    const res = await hit(
      request(app).get(`/api/public/opencall/materials/${crossed.rawToken}`),
    ).expect(200);
    // The identity join is the tenancy check: their request is not among my
    // rows, so there is nothing to show — in the one INVALID shape.
    expect(res.body).toEqual({ success: true, data: { valid: false } });

    const stillOpen = await knex("open_call_material_requests")
      .where({ id: theirs.requestA })
      .first("fulfilled_at");
    expect(stillOpen.fulfilled_at).toBeNull();
  });

  test("a legacy token with no binding still resolves through the identity join", async () => {
    // The links already in people's inboxes when the migration lands.
    const { token, requestId, applicationId } = await buildApplicant({ bound: false });

    const tokenRow = await knex("applicant_claim_tokens")
      .where({ token_hash: hashToken(token.rawToken) })
      .first("material_request_id");
    expect(tokenRow.material_request_id).toBeNull();

    const view = await hit(
      request(app).get(`/api/public/opencall/materials/${token.rawToken}`),
    ).expect(200);
    expect(view.body.data.valid).toBe(true);
    expect(view.body.data.requestedKeys).toEqual(SHORTLIST_KEYS);

    await hit(request(app).post(`/api/public/opencall/materials/${token.rawToken}`))
      .send(goodAnswers())
      .expect(200);

    const row = await knex("open_call_material_requests")
      .where({ id: requestId })
      .first("fulfilled_at");
    expect(row.fulfilled_at).toBeTruthy();
    expect((await payloadFor(applicationId)).walkVideoUrl).toBe(
      "https://vimeo.com/1234567",
    );
  });
});
