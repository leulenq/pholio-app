"use strict";

/**
 * Lane W3-D — the organizer's surfaces must include the unclaimed applicant.
 *
 * Design §6 requirement 1 says this must be "guaranteed by §4's resolver and its
 * enforcement test, not by review". `tests/unit/agency-applicant-identity-
 * coverage.test.js` is the static half of that guarantee; this is the functional
 * half. It runs against a REAL migrated schema (not a hand-built fixture) because
 * the whole point is that `applications.profile_id` is now nullable and
 * `talent_submission_packages.user_id` / `.profile_id` are too — a hand-built
 * table would let the suite pass on a shape production does not have.
 *
 * The failure mode under test is invisible: an INNER JOIN returns fewer rows and
 * no error. So every assertion here is "the identity-backed row IS present",
 * never "the endpoint returned 200".
 */

const path = require("path");
const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

// MUST run before `src/shared/db/knex` is required anywhere.
const DB_FILE = useIsolatedDatabase("applicant-identity-resolver");
process.env.AGENCY_RBAC_ENFORCE = "true";

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

// The submit lane owns the applicant-facing writes; this suite only reads what
// it leaves behind, so the mail transport is silenced rather than exercised.
jest.mock("../../src/shared/lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
  sendMaterialsRequestedEmail: jest.fn().mockResolvedValue({ ok: true }),
  sendApplicationStatusEmail: jest.fn().mockResolvedValue({ ok: true }),
  sendAgencyInviteEmail: jest.fn().mockResolvedValue({ ok: true }),
  sendTeamInviteEmail: jest.fn().mockResolvedValue({ ok: true }),
  sendNewMessageEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("../../src/domains/agency/services/discover-search", () => ({
  searchDiscoverableTalent: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

const knex = require("../../src/shared/db/knex");
const email = require("../../src/shared/lib/email");
const inboxRouter = require("../../src/domains/agency/routes/inbox");
const materialsRouter = require("../../src/domains/agency/routes/materials");
const {
  resolveApplicantIdentities,
  resolveApplicantIdentity,
  MATERIALS_STATUS,
} = require("../../src/domains/agency/services/applicant-identity");
const {
  CALL_KINDS,
} = require("../../src/shared/constants/event-casting");

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();
const LINK_ID = uuidv4();

/** Account-backed: a claimed Pholio talent with a profile, as today. */
const ADA = {
  userId: uuidv4(),
  profileId: uuidv4(),
  applicationId: uuidv4(),
};
/** Identity-backed: submitted, unclaimed — no `users` row, no `profiles` row. */
const BO = {
  identityId: uuidv4(),
  applicationId: uuidv4(),
  packageId: uuidv4(),
};
/** Identity-backed AND disowned — "that wasn't me" (§5.5). */
const CY = {
  identityId: uuidv4(),
  applicationId: uuidv4(),
  packageId: uuidv4(),
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    userId: AGENCY_ID,
    agencyId: AGENCY_ID,
    memberUserId: OWNER_USER_ID,
    agencyMembershipId: MEMBERSHIP_ID,
    agencyMembershipRole: "OWNER",
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(inboxRouter);
app.use(materialsRouter);

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

/**
 * The snapshot identity contract the submit lane writes (design §4's "Extend the
 * snapshot to carry an identity block and the resolver's unclaimed branch is a
 * field read"). Written here verbatim so a change to the contract breaks this
 * suite rather than an organizer's export.
 */
function submissionPayload({ firstName, lastName, email: address, phone, city }) {
  return {
    submittedAt: "2026-08-15T12:00:00.000Z",
    identity: {
      source: "open_call_submission",
      applicantIdentityId: null, // filled by the caller
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      email: address,
      phone,
      city,
      gender: "female",
      heightCm: 179,
      instagram: "@" + firstName.toLowerCase(),
      adultAttestation: true,
    },
    answers: {
      height: 179,
      core_measurements: "82-61-89",
    },
    customAnswers: { how_did_you_hear: "Instagram" },
    images: [
      {
        id: uuidv4(),
        path: "https://cdn.example.test/headshot.jpg",
        public_url: "https://cdn.example.test/headshot.jpg",
        alt: "headshot",
        image_type: "digital",
        shot_type: "headshot",
        sort: 0,
      },
      {
        id: uuidv4(),
        path: "https://cdn.example.test/full.jpg",
        public_url: "https://cdn.example.test/full.jpg",
        alt: "full length",
        image_type: "digital",
        shot_type: "full_length",
        sort: 1,
      },
    ],
  };
}

async function seedFixtures() {
  await knex("users").insert([
    {
      id: OWNER_USER_ID,
      email: "owner@fwbk.test",
      role: "AGENCY",
      email_verified: true,
    },
    {
      id: ADA.userId,
      email: "ada@talent.test",
      role: "TALENT",
      email_verified: true,
    },
  ]);
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Fashion Week Brooklyn",
    org_kind: "event_organizer",
  });
  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: OWNER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });
  await knex("agency_open_call_links").insert({
    id: LINK_ID,
    agency_id: AGENCY_ID,
    code: "queens",
    label: "Queens edition",
    call_kind: CALL_KINDS.EVENT_CASTING,
    // NULL intake_spec = "use the platform default for this call kind"
    // (20260819110000's deliberate reading). The default event spec defers walk
    // video / availability / measurements to the shortlist stage.
    intake_spec: null,
    identity_policy: "account_optional",
  });

  await knex("profiles").insert({
    id: ADA.profileId,
    user_id: ADA.userId,
    slug: "ada-ames",
    first_name: "Ada",
    last_name: "Ames",
    city: "Brooklyn",
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 62,
    hips_cm: 90,
    gender: "female",
    date_of_birth: "1999-04-12",
    phone: "+1 718 555 0100",
    bio_raw: "Runway.",
    bio_curated: "Runway and editorial.",
  });

  await knex("applicant_identities").insert([
    {
      id: BO.identityId,
      email_normalized: "bo@applicant.test",
      phone_normalized: "+17185550134",
      profile_id: null,
      claimed_at: null,
      disowned_at: null,
    },
    {
      id: CY.identityId,
      email_normalized: "cy@applicant.test",
      phone_normalized: "+17185550199",
      profile_id: null,
      claimed_at: null,
      disowned_at: new Date().toISOString(),
    },
  ]);

  await knex("applications").insert([
    {
      id: ADA.applicationId,
      profile_id: ADA.profileId,
      applicant_identity_id: null,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      open_call_link_id: LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: "2026-08-01T10:00:00.000Z",
    },
    {
      id: BO.applicationId,
      profile_id: null,
      applicant_identity_id: BO.identityId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      open_call_link_id: LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: "2026-08-02T10:00:00.000Z",
    },
    {
      id: CY.applicationId,
      profile_id: null,
      applicant_identity_id: CY.identityId,
      agency_id: AGENCY_ID,
      status: "pending",
      open_call_link_id: LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: "2026-08-03T10:00:00.000Z",
    },
  ]);

  const boPayload = submissionPayload({
    firstName: "Bo",
    lastName: "Baptiste",
    email: "bo@applicant.test",
    phone: "+1 (718) 555-0134",
    city: "Queens",
  });
  boPayload.identity.applicantIdentityId = BO.identityId;

  await knex("talent_submission_packages").insert([
    {
      id: BO.packageId,
      application_id: BO.applicationId,
      user_id: null,
      profile_id: null,
      applicant_identity_id: BO.identityId,
      payload: JSON.stringify(boPayload),
      created_at: "2026-08-02T10:05:00.000Z",
    },
    // CY has NO snapshot at all — the "missing snapshot" branch: fall back to
    // the identity's email with nulls elsewhere, never throw.
  ]);
}

beforeAll(async () => {
  await migrate(knex);
  await seedFixtures();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

// ---------------------------------------------------------------------------

describe("resolveApplicantIdentities", () => {
  test("returns both sources in ONE shape", async () => {
    const applications = await knex("applications")
      .whereIn("id", [ADA.applicationId, BO.applicationId])
      .select("id", "profile_id", "applicant_identity_id");

    const resolved = await resolveApplicantIdentities(knex, applications);
    expect(resolved.size).toBe(2);

    const ada = resolved.get(ADA.applicationId);
    const bo = resolved.get(BO.applicationId);

    // Same keys, whichever source they came from — that is the containment.
    expect(Object.keys(ada).sort()).toEqual(Object.keys(bo).sort());

    expect(ada).toMatchObject({
      displayName: "Ada Ames",
      firstName: "Ada",
      lastName: "Ames",
      email: "ada@talent.test",
      city: "Brooklyn",
      heightCm: 178,
      isClaimed: true,
      isEmailVerified: true,
      isDisowned: false,
      identitySource: "profile",
    });
    expect(ada.measurements.text).toBe("Bust: 84, Waist: 62, Hips: 90");

    expect(bo).toMatchObject({
      displayName: "Bo Baptiste",
      firstName: "Bo",
      lastName: "Baptiste",
      email: "bo@applicant.test",
      phone: "+1 (718) 555-0134",
      city: "Queens",
      heightCm: 179,
      instagram: "@bo",
      isClaimed: false,
      // The claim click IS the verification (ruling Q4); Bo has not clicked.
      isEmailVerified: false,
      isDisowned: false,
      identitySource: "submission",
    });
    expect(bo.images.map((i) => i.shot_type)).toEqual([
      "headshot",
      "full_length",
    ]);
    expect(bo.measurements.text).toBe("82-61-89");
    // Never asserted by an anonymous applicant — the spec asks for 18+, not DOB.
    expect(bo.dateOfBirth).toBeNull();
  });

  test("a missing snapshot falls back to the identity email and never throws", async () => {
    const application = await knex("applications")
      .where({ id: CY.applicationId })
      .first("id", "profile_id", "applicant_identity_id");

    const dto = await resolveApplicantIdentity(knex, application);
    expect(dto.email).toBe("cy@applicant.test");
    // Nothing invented: no name in the snapshot means the email stands in.
    expect(dto.displayName).toBe("cy@applicant.test");
    expect(dto.firstName).toBeNull();
    expect(dto.heightCm).toBeNull();
    expect(dto.images).toEqual([]);
    // …and the dispute is still visible (§5.5).
    expect(dto.isDisowned).toBe(true);
  });

  test("an unknown application resolves to an empty DTO, not undefined", async () => {
    const resolved = await resolveApplicantIdentities(knex, [
      { id: uuidv4(), profile_id: null, applicant_identity_id: null },
    ]);
    expect(resolved.size).toBe(1);
    const [dto] = [...resolved.values()];
    expect(dto.displayName).toBeNull();
    expect(dto.isClaimed).toBe(false);
  });
});

describe("GET /api/agency/applications", () => {
  test("includes the unclaimed applicant, with the truth fields as plain data", async () => {
    const response = await request(app).get("/api/agency/applications");
    expect(response.status).toBe(200);

    const byApplication = new Map(
      response.body.profiles.map((row) => [row.application_id, row]),
    );
    // THE assertion this whole lane exists for.
    expect(byApplication.has(BO.applicationId)).toBe(true);
    expect(byApplication.has(ADA.applicationId)).toBe(true);
    expect(byApplication.has(CY.applicationId)).toBe(true);

    const bo = byApplication.get(BO.applicationId);
    expect(bo.first_name).toBe("Bo");
    expect(bo.last_name).toBe("Baptiste");
    expect(bo.city).toBe("Queens");
    expect(bo.height_cm).toBe(179);
    expect(bo.images).toHaveLength(2);
    expect(bo.emailVerified).toBe(false);
    expect(bo.identityClaimed).toBe(false);
    expect(bo.identityDisputed).toBe(false);
    expect(bo.materialsStatus).toBe(MATERIALS_STATUS.NONE);

    const ada = byApplication.get(ADA.applicationId);
    expect(ada.emailVerified).toBe(true);
    expect(ada.identityClaimed).toBe(true);
    expect(ada.identityDisputed).toBe(false);

    // Identity disputed surfaces as a word-level boolean, never a badge.
    expect(byApplication.get(CY.applicationId).identityDisputed).toBe(true);
  });

  test("a profile-scoped filter is re-applied to the snapshot, not used to drop the row", async () => {
    /* Height, not city or search: knex compiles `whereILike` to `ilike`, which
       SQLite has never had, so the text filters on this endpoint cannot be
       exercised here at all (a pre-existing dialect gap, unrelated to identity).
       Height is the same code path — a `profiles` predicate that keeps
       identity-backed rows in SQL and then re-checks them in JS. */
    const response = await request(app).get(
      "/api/agency/applications?min_height=179",
    );
    expect(response.status).toBe(200);
    const ids = response.body.profiles.map((row) => row.application_id);
    // Bo is 179 in the snapshot and must survive the filter…
    expect(ids).toContain(BO.applicationId);
    // …Ada is 178 in her profile and must not…
    expect(ids).not.toContain(ADA.applicationId);
    // …and Cy has no snapshot height, so an explicit height filter excludes him
    // rather than silently passing him through.
    expect(ids).not.toContain(CY.applicationId);
  });
});

describe("GET /api/agency/applications/:id/details", () => {
  test("opens an identity-backed application instead of 404ing", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${BO.applicationId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body.profile.first_name).toBe("Bo");
    expect(response.body.profile.images).toHaveLength(2);
    expect(response.body.profile.user_email).toBe("bo@applicant.test");
    expect(response.body.emailVerified).toBe(false);
    expect(response.body.identityClaimed).toBe(false);
    expect(response.body.identityDisputed).toBe(false);
    expect(response.body.submissionPackage.contact).toEqual({
      email: "bo@applicant.test",
      phone: "+1 (718) 555-0134",
    });
  });

  test("surfaces identity disputed on a disowned application", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${CY.applicationId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body.identityDisputed).toBe(true);
  });

  test("possibleDuplicateOf names the earlier application on a phone match", async () => {
    /* Same human, second email address, same phone — §5.6's SIGNAL. A second
       identity, deliberately: the system must not merge them. */
    const twinIdentityId = uuidv4();
    const twinApplicationId = uuidv4();
    await knex("applicant_identities").insert({
      id: twinIdentityId,
      // Digits identical to BO's, formatting different — the comparison is on
      // digits, so a match must still be found.
      email_normalized: "bo.baptiste@other.test",
      phone_normalized: "718-555-0134",
    });
    await knex("applications").insert({
      id: twinApplicationId,
      profile_id: null,
      applicant_identity_id: twinIdentityId,
      agency_id: AGENCY_ID,
      status: "pending",
      open_call_link_id: LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
      created_at: "2026-08-04T10:00:00.000Z",
    });

    const response = await request(app).get(
      `/api/agency/applications/${twinApplicationId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body.possibleDuplicateOf).toBe(BO.applicationId);

    // …and it is a signal, not an action: nothing changed on either row.
    const rows = await knex("applications")
      .whereIn("id", [BO.applicationId, twinApplicationId])
      .select("id", "status");
    expect(rows.every((row) => row.status)).toBe(true);

    await knex("applications").where({ id: twinApplicationId }).del();
    await knex("applicant_identities").where({ id: twinIdentityId }).del();
  });

  test("an applicant with no phone match reports no duplicate", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${ADA.applicationId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body.possibleDuplicateOf).toBeNull();
  });
});

describe("GET /api/agency/export", () => {
  test("the CSV contains the unclaimed applicant", async () => {
    const response = await request(app).get("/api/agency/export?format=csv");
    expect(response.status).toBe(200);

    const csv = parseCsv(response.text);
    expect(csv.headers).toContain("Email verified");
    expect(csv.headers).toContain("Materials");
    expect(csv.headers).toContain("Phone");

    const names = csv.rows.map((row) => row.Name);
    // THE failure mode design §6 requirement 3 calls partnership-ending.
    expect(names).toContain("Bo Baptiste");
    expect(names).toContain("Ada Ames");

    const bo = csv.rows.find((row) => row.Name === "Bo Baptiste");
    expect(bo.Email).toBe("bo@applicant.test");
    // `escapeCsvValue` prefixes a leading `+` with an apostrophe — the existing
    // formula-injection guard, which a new column must not opt out of.
    expect(bo.Phone).toBe("'+1 (718) 555-0134");
    expect(bo.City).toBe("Queens");
    expect(bo["Height (cm)"]).toBe("179");
    expect(bo["Email verified"]).toBe("No");

    const ada = csv.rows.find((row) => row.Name === "Ada Ames");
    expect(ada["Email verified"]).toBe("Yes");
    // Nothing requested yet reads as blank, not as a word that implies a state.
    expect(ada.Materials).toBe("");
  });

  test("the JSON export carries the same rows", async () => {
    const response = await request(app).get("/api/agency/export?format=json");
    expect(response.status).toBe(200);
    expect(response.body.applications.map((row) => row.name)).toContain(
      "Bo Baptiste",
    );
  });
});

describe("POST /api/agency/applications/:id/request-materials", () => {
  beforeEach(() => {
    email.sendEmail.mockClear();
    email.sendMaterialsRequestedEmail.mockClear();
  });

  test("rejects keys that are not shortlist-stage asks on this call", async () => {
    const response = await request(app)
      .post(`/api/agency/applications/${ADA.applicationId}/request-materials`)
      .send({ requestedKeys: ["digital_headshot"] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "requested_keys_not_in_shortlist_stage",
    );
    // The default event spec puts the two digitals at APPLY, not shortlist.
    expect(response.body.allowedKeys).toEqual(
      expect.arrayContaining([
        "walk_video_url",
        "availability_window",
        "core_measurements",
      ]),
    );
    expect(await knex("open_call_material_requests").count({ n: "*" })).toEqual([
      { n: 0 },
    ]);
  });

  test("rejects an empty ask", async () => {
    const response = await request(app)
      .post(`/api/agency/applications/${ADA.applicationId}/request-materials`)
      .send({ requestedKeys: [] });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("requested_keys_required");
  });

  test("404s on another agency's application", async () => {
    const response = await request(app)
      .post(`/api/agency/applications/${uuidv4()}/request-materials`)
      .send({ requestedKeys: ["walk_video_url"] });
    expect(response.status).toBe(404);
  });

  test("records the ask for an account-backed applicant and reuses the existing email", async () => {
    const response = await request(app)
      .post(`/api/agency/applications/${ADA.applicationId}/request-materials`)
      .send({
        requestedKeys: ["walk_video_url", "availability_window"],
        dueAt: "2026-10-03T00:00:00.000Z",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.materialRequest).toMatchObject({
      applicationId: ADA.applicationId,
      requestedKeys: ["walk_video_url", "availability_window"],
      status: MATERIALS_STATUS.REQUESTED,
    });
    // The "asked for more" email that already existed — not a new one.
    expect(email.sendMaterialsRequestedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@talent.test",
        items: ["Walk video", "Availability"],
      }),
    );
    // Status machinery untouched (this lane must not move an application).
    const row = await knex("applications")
      .where({ id: ADA.applicationId })
      .first("status");
    expect(row.status).toBe("shortlisted");
  });

  test("re-requesting UPDATES the one live request and clears fulfilment", async () => {
    await knex("open_call_material_requests")
      .where({ application_id: ADA.applicationId })
      .update({ fulfilled_at: new Date().toISOString() });

    const response = await request(app)
      .post(`/api/agency/applications/${ADA.applicationId}/request-materials`)
      .send({ requestedKeys: ["core_measurements"], dueAt: null });

    expect(response.status).toBe(200);
    expect(response.body.data.materialRequest).toMatchObject({
      requestedKeys: ["core_measurements"],
      fulfilledAt: null,
      status: MATERIALS_STATUS.REQUESTED,
    });
    const rows = await knex("open_call_material_requests").where({
      application_id: ADA.applicationId,
    });
    expect(rows).toHaveLength(1);
  });

  test("sends the tokenized link for an unclaimed applicant", async () => {
    const response = await request(app)
      .post(`/api/agency/applications/${BO.applicationId}/request-materials`)
      .send({
        requestedKeys: ["walk_video_url"],
        dueAt: "2026-10-03T00:00:00.000Z",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.notified).toBe(true);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);

    const sent = email.sendEmail.mock.calls[0][0];
    expect(sent.to).toBe("bo@applicant.test");
    expect(sent.text).toContain("No account needed");
    // A `materials`-purpose token was minted for THIS identity.
    const tokens = await knex("applicant_claim_tokens").where({
      applicant_identity_id: BO.identityId,
      purpose: "materials",
    });
    expect(tokens).toHaveLength(1);
    // The raw token is never returned to the organizer.
    expect(JSON.stringify(response.body)).not.toContain(tokens[0].token_hash);

    /* …and the link names THIS ask (`20260819140000`). Without the binding the
       fulfilment page falls back to guessing from the identity's outstanding
       requests, so an applicant shortlisted by two organizers has each
       organizer's link rendering — and fulfilling — whichever request sorts
       first. The binding is written just after the upsert, because the column is
       a foreign key and the mint deliberately runs before the row exists. */
    const requestRow = await knex("open_call_material_requests")
      .where({ application_id: BO.applicationId })
      .first("id");
    expect(tokens[0].material_request_id).toBe(requestRow.id);
  });

  test("the recorded ask shows up as a word on the inbox row and in the CSV", async () => {
    const list = await request(app).get("/api/agency/applications");
    const bo = list.body.profiles.find(
      (row) => row.application_id === BO.applicationId,
    );
    expect(bo.materialsStatus).toBe(MATERIALS_STATUS.REQUESTED);

    const csv = parseCsv(
      (await request(app).get("/api/agency/export?format=csv")).text,
    );
    expect(
      csv.rows.find((row) => row.Name === "Bo Baptiste").Materials,
    ).toBe("requested");
  });

  test("GET material-request returns the live row, or null", async () => {
    const present = await request(app).get(
      `/api/agency/applications/${BO.applicationId}/material-request`,
    );
    expect(present.status).toBe(200);
    expect(present.body.data.materialRequest.requestedKeys).toEqual([
      "walk_video_url",
    ]);

    const absent = await request(app).get(
      `/api/agency/applications/${CY.applicationId}/material-request`,
    );
    expect(absent.status).toBe(200);
    expect(absent.body.data.materialRequest).toBeNull();
  });

  test("an overdue request reads as overdue, not as requested", async () => {
    await knex("open_call_material_requests")
      .where({ application_id: BO.applicationId })
      .update({
        fulfilled_at: null,
        due_at: new Date(Date.now() - 86400000).toISOString(),
      });

    const list = await request(app).get("/api/agency/applications");
    const bo = list.body.profiles.find(
      (row) => row.application_id === BO.applicationId,
    );
    expect(bo.materialsStatus).toBe(MATERIALS_STATUS.OVERDUE);
  });
});
