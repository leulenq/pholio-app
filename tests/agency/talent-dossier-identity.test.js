"use strict";

/**
 * Lane W3-D2 — the expanded talent view must open for an unclaimed applicant.
 *
 * `docs/open-call-applicant-flow-design-2026-08.md` §4 / §6 requirement 1:
 * "Every organizer surface must include unclaimed applicants." The dossier was
 * the last one that did not — `buildTalentDossier` loaded
 * `db("profiles").where({ id: application.profile_id })`, got undefined for an
 * identity-backed row, returned null, and the route answered 404 for an
 * application the same organizer can see in their inbox and open in `/details`.
 *
 * Run against a REAL migrated schema, like the resolver suite next door: the
 * whole point is that `applications.profile_id` and
 * `talent_submission_packages.user_id`/`.profile_id` are nullable now, and a
 * hand-built fixture would let this pass on a shape production does not have.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

// MUST run before `src/shared/db/knex` is required anywhere.
const DB_FILE = useIsolatedDatabase("talent-dossier-identity");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const dossierRouter = require("../../src/domains/agency/routes/talent-dossier");
const {
  buildTalentDossier,
} = require("../../src/domains/agency/services/talent-dossier");
const { CALL_KINDS } = require("../../src/shared/constants/event-casting");

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
  headshotId: uuidv4(),
  fullLengthId: uuidv4(),
};
/** Identity-backed, disowned, and with NO snapshot at all (§5.5 + the
 *  "package written before the submit lane snapshotted identities" case). */
const CY = {
  identityId: uuidv4(),
  applicationId: uuidv4(),
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
app.use(dossierRouter);

/**
 * The snapshot contract the submit lane writes (design §4). Written out here
 * verbatim so a change to it breaks this suite rather than an organizer's
 * expanded view.
 */
function submissionPayload() {
  return {
    submittedAt: "2026-08-15T12:00:00.000Z",
    identity: {
      source: "open_call_submission",
      applicantIdentityId: BO.identityId,
      firstName: "Bo",
      lastName: "Baptiste",
      displayName: "Bo Baptiste",
      email: "bo@applicant.test",
      phone: "+1 (718) 555-0134",
      city: "Queens",
      gender: "female",
      heightCm: 179,
      instagram: "@bo",
      adultAttestation: true,
    },
    answers: {
      height: 179,
      core_measurements: "82-61-89",
    },
    images: [
      {
        id: BO.headshotId,
        path: "https://cdn.example.test/headshot.jpg",
        public_url: "https://cdn.example.test/headshot.jpg",
        alt: "headshot",
        image_type: "digital",
        shot_type: "headshot",
        sort: 0,
      },
      {
        id: BO.fullLengthId,
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
    availability_status: "available",
    discipline: "model",
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

  await knex("talent_submission_packages").insert({
    id: BO.packageId,
    application_id: BO.applicationId,
    user_id: null,
    profile_id: null,
    applicant_identity_id: BO.identityId,
    payload: JSON.stringify(submissionPayload()),
    created_at: "2026-08-02T10:05:00.000Z",
  });
}

const load = (applicationId) =>
  knex("applications").where({ id: applicationId }).first();

beforeAll(async () => {
  await migrate(knex);
  await seedFixtures();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

// ---------------------------------------------------------------------------

describe("buildTalentDossier — identity-backed application", () => {
  let dossier;

  beforeAll(async () => {
    dossier = await buildTalentDossier(knex, {
      application: await load(BO.applicationId),
      agencyId: AGENCY_ID,
    });
  });

  test("builds a dossier instead of returning null", () => {
    // THE assertion this lane exists for: null here is a 404 at the route.
    expect(dossier).not.toBeNull();
    expect(dossier.application.id).toBe(BO.applicationId);
    expect(dossier.application.status).toBe("shortlisted");
  });

  test("carries the applicant's identity and stats from the frozen snapshot", () => {
    expect(dossier.talent.first_name).toBe("Bo");
    expect(dossier.talent.last_name).toBe("Baptiste");
    expect(dossier.talent.city).toBe("Queens");
    expect(dossier.talent.gender).toBe("female");
    expect(dossier.talent.height_cm).toBe(179);
    expect(dossier.talent.stats.height.cm).toBe(179);
    expect(dossier.talent.social[0]).toMatchObject({
      platform: "instagram",
      handle: "@bo",
    });
  });

  test("attaches the frozen package as the primary content, with contact", () => {
    expect(dossier.submissionPackage.id).toBe(BO.packageId);
    expect(dossier.submissionPackage.submittedAt).toBe("2026-08-15T12:00:00.000Z");
    expect(dossier.submissionPackage.images).toHaveLength(2);
    expect(dossier.images.map((i) => i.shot_type)).toEqual([
      "headshot",
      "full_length",
    ]);
    expect(dossier.images[0].url).toBe("https://cdn.example.test/headshot.jpg");
    expect(dossier.contact).toEqual({
      email: "bo@applicant.test",
      phone: "+1 (718) 555-0134",
    });
  });

  test("carries the truth fields as plain data, never a badge", () => {
    expect(dossier.identityClaimed).toBe(false);
    expect(dossier.emailVerified).toBe(false);
    expect(dossier.identityDisputed).toBe(false);
    expect(dossier.identitySource).toBe("submission");
  });

  test("answers null — never undefined, never invented — where only a live profile can", () => {
    expect(dossier.talent.market).toBeNull();
    expect(dossier.talent.availability_status).toBeNull();
    expect(dossier.talent.bio_curated).toBeNull();
    // The professional record keeps its keys so `professional.x` reads survive.
    expect(dossier.talent.professional.discipline).toBeNull();
    expect(dossier.talent.professional.specialties).toEqual([]);
    // Pholio holds no representation record for someone with no profile.
    expect(dossier.representation).toEqual({
      status: null,
      represented_by: null,
      lines: [],
    });
    expect(dossier.availability.bookouts).toEqual([]);
    expect(dossier.availability.commitments).toEqual([]);
    expect(dossier.availability.status).toBeNull();
    expect(dossier.availability.window_days).toBeGreaterThan(0);
  });

  test("treats an attested applicant as an adult and never runs minor redaction", () => {
    // The event spec collects an 18+ attestation, not a date of birth (design
    // §3.1, ruling Q1). A null DOB must not be read as "unknown, assume minor"
    // and must not be fabricated into one either.
    expect(dossier.compliance.is_minor).toBe(false);
    expect(dossier.compliance.age_band).toBeNull();
    expect(dossier.compliance.guardian_consent_at).toBeNull();
    expect(dossier.talent.age).toBeNull();
    // Minor redaction would have nulled contact and social.
    expect(dossier.contact.email).toBe("bo@applicant.test");
    expect(dossier.talent.social).toHaveLength(1);
  });

  test("carries standing with this agency, same as a profile-backed row", () => {
    expect(dossier.standing.tags).toEqual([]);
    expect(dossier.standing.notes).toEqual([]);
    expect(dossier.standing.timeline).toEqual([]);
    expect(dossier.standing.submitted_at).toBeTruthy();
    expect(dossier.standing.days_since_submitted).toBeGreaterThanOrEqual(0);
    expect(dossier.standing.invited).toBe(false);
  });

  test("never leaks a date of birth", () => {
    const seen = new Set();
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          seen.add(key);
          walk(value);
        }
      }
      return undefined;
    })(dossier);
    expect(seen.has("date_of_birth")).toBe(false);
    expect(seen.has("dob")).toBe(false);
  });
});

describe("buildTalentDossier — identity-backed application with no snapshot", () => {
  let dossier;

  beforeAll(async () => {
    dossier = await buildTalentDossier(knex, {
      application: await load(CY.applicationId),
      agencyId: AGENCY_ID,
    });
  });

  test("still opens, falling back to the identity's own email", () => {
    expect(dossier).not.toBeNull();
    expect(dossier.contact.email).toBe("cy@applicant.test");
    expect(dossier.talent.first_name).toBeNull();
    expect(dossier.images).toEqual([]);
  });

  test("carries a package shell rather than null, so the organizer sees the ask", () => {
    expect(dossier.submissionPackage.id).toBeNull();
    expect(dossier.submissionPackage.images).toEqual([]);
    expect(dossier.submissionPackage.contact.email).toBe("cy@applicant.test");
  });

  test("surfaces the dispute (§5.5) as plain data", () => {
    expect(dossier.identityDisputed).toBe(true);
    expect(dossier.identityClaimed).toBe(false);
    expect(dossier.identitySource).toBe("submission");
  });
});

describe("buildTalentDossier — profile-backed application (regression)", () => {
  let dossier;

  beforeAll(async () => {
    dossier = await buildTalentDossier(knex, {
      application: await load(ADA.applicationId),
      agencyId: AGENCY_ID,
    });
  });

  test("is unchanged: live profile, derived representation, real availability", () => {
    expect(dossier.talent.first_name).toBe("Ada");
    expect(dossier.talent.height_cm).toBe(178);
    expect(dossier.talent.professional.discipline).toBe("model");
    expect(dossier.talent.bio_curated).toBe("Runway and editorial.");
    expect(dossier.talent.availability_status).toBe("available");
    expect(dossier.representation.status).toBe("unrepresented");
    expect(dossier.availability.status).toBe("available");
    expect(dossier.compliance.is_minor).toBe(false);
    expect(dossier.contact.email).toBe("ada@talent.test");
  });

  test("carries the same truth-field keys, answered from the account", () => {
    expect(dossier.identitySource).toBe("profile");
    expect(dossier.identityClaimed).toBe(true);
    expect(dossier.emailVerified).toBe(true);
    expect(dossier.identityDisputed).toBe(false);
  });

  test("both branches return the same top-level shape", async () => {
    const identityDossier = await buildTalentDossier(knex, {
      application: await load(BO.applicationId),
      agencyId: AGENCY_ID,
    });
    expect(Object.keys(identityDossier).sort()).toEqual(
      Object.keys(dossier).sort(),
    );
    expect(Object.keys(identityDossier.talent).sort()).toEqual(
      Object.keys(dossier.talent).sort(),
    );
  });
});

describe("GET /api/agency/applications/:applicationId/dossier", () => {
  test("opens an identity-backed application instead of 404ing", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${BO.applicationId}/dossier`,
    );
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.talent.first_name).toBe("Bo");
    expect(response.body.data.images).toHaveLength(2);
    expect(response.body.data.identitySource).toBe("submission");
  });

  test("marks the submission as read, same as a profile-backed row", async () => {
    await request(app).get(
      `/api/agency/applications/${CY.applicationId}/dossier`,
    );
    const row = await load(CY.applicationId);
    expect(row.viewed_at).toBeTruthy();
  });

  test("still 404s for an application belonging to another agency", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${uuidv4()}/dossier`,
    );
    expect(response.status).toBe(404);
  });

  test("still 410s once the submission is withdrawn", async () => {
    const withdrawn = uuidv4();
    const identityId = uuidv4();
    await knex("applicant_identities").insert({
      id: identityId,
      email_normalized: "gone@applicant.test",
    });
    await knex("applications").insert({
      id: withdrawn,
      profile_id: null,
      applicant_identity_id: identityId,
      agency_id: AGENCY_ID,
      status: "withdrawn",
      open_call_link_id: LINK_ID,
      call_purpose: CALL_KINDS.EVENT_CASTING,
    });
    const response = await request(app).get(
      `/api/agency/applications/${withdrawn}/dossier`,
    );
    expect(response.status).toBe(410);
    expect(response.body.error).toBe("application_withdrawn");
  });
});
