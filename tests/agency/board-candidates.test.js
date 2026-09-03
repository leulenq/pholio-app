"use strict";

/**
 * `GET /api/agency/boards/:boardId/candidates` — the Signing Board data
 * contract (`docs/superpowers/specs/2026-09-01-signing-board-design.md` §3).
 *
 * Run against a REAL migrated schema — like the identity resolver and
 * dossier suites next door — because the fields under test
 * (`applications.status_changed_at`, `applications.decline_reason`,
 * `profiles.date_of_birth`, `application_notes.deleted_at`) all arrived by
 * migration after the original hand-built board fixtures, and a partial
 * schema would let a wrong column name pass silently.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

// MUST run before `src/shared/db/knex` is required anywhere.
const DB_FILE = useIsolatedDatabase("board-candidates");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const castingRouter = require("../../src/domains/agency/routes/casting");

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();
const BOARD_ID = uuidv4();

/** Adult, profile-backed, full digitals + a note + two tags. */
const AVA = {
  userId: uuidv4(),
  profileId: uuidv4(),
  applicationId: uuidv4(),
  headshotId: uuidv4(),
  fullLengthId: uuidv4(),
};
/** Minor, profile-backed — measurements must be withheld at the data layer. */
const MIA = {
  userId: uuidv4(),
  profileId: uuidv4(),
  applicationId: uuidv4(),
};
/** Identity-backed, unclaimed open-call applicant — no `profiles` row. */
const BO = {
  identityId: uuidv4(),
  applicationId: uuidv4(),
};
/** Waiting-on-talent status, for the board count. */
const CAM = {
  userId: uuidv4(),
  profileId: uuidv4(),
  applicationId: uuidv4(),
};
/** Offer-out status, for the board count. */
const DEV = {
  userId: uuidv4(),
  profileId: uuidv4(),
  applicationId: uuidv4(),
};
/** Profile-backed with NO date of birth — age unknown, not age cleared. */
const NOA = {
  userId: uuidv4(),
  profileId: uuidv4(),
  applicationId: uuidv4(),
};
/** Kept-on-file status, for the board count. */
const FIL = {
  userId: uuidv4(),
  profileId: uuidv4(),
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
app.use(castingRouter);

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** A DOB that is reliably under 18 today regardless of when this test runs. */
function minorDob() {
  const now = new Date();
  return `${now.getUTCFullYear() - 15}-01-01`;
}

async function seedFixtures() {
  await knex("users").insert([
    { id: OWNER_USER_ID, email: "owner@signing-board.test", role: "AGENCY", email_verified: true },
    { id: AVA.userId, email: "ava@talent.test", role: "TALENT", email_verified: true },
    { id: MIA.userId, email: "mia@talent.test", role: "TALENT", email_verified: true },
    { id: CAM.userId, email: "cam@talent.test", role: "TALENT", email_verified: true },
    { id: DEV.userId, email: "dev@talent.test", role: "TALENT", email_verified: true },
    { id: NOA.userId, email: "noa@talent.test", role: "TALENT", email_verified: true },
    { id: FIL.userId, email: "fil@talent.test", role: "TALENT", email_verified: true },
  ]);

  await knex("agencies").insert({ id: AGENCY_ID, name: "Signing Board Test Agency" });
  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: OWNER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });

  await knex("boards").insert({ id: BOARD_ID, agency_id: AGENCY_ID, name: "Women — New Faces" });

  await knex("profiles").insert([
    {
      id: AVA.profileId,
      user_id: AVA.userId,
      slug: "ava-star",
      first_name: "Ava",
      last_name: "Star",
      city: "New York",
      height_cm: 176,
      bust_cm: 84,
      waist_cm: 61,
      hips_cm: 90,
      gender: "female",
      date_of_birth: "1999-06-01",
      bio_raw: "",
      bio_curated: "",
    },
    {
      id: MIA.profileId,
      user_id: MIA.userId,
      slug: "mia-frost",
      first_name: "Mia",
      last_name: "Frost",
      city: "Chicago",
      height_cm: 170,
      bust_cm: 80,
      waist_cm: 58,
      hips_cm: 86,
      gender: "female",
      date_of_birth: minorDob(),
      bio_raw: "",
      bio_curated: "",
    },
    {
      id: CAM.profileId,
      user_id: CAM.userId,
      slug: "cam-reyes",
      first_name: "Cam",
      last_name: "Reyes",
      city: "Los Angeles",
      height_cm: 182,
      gender: "male",
      date_of_birth: "1997-02-14",
      bio_raw: "",
      bio_curated: "",
    },
    {
      id: DEV.profileId,
      user_id: DEV.userId,
      slug: "dev-nolan",
      first_name: "Dev",
      last_name: "Nolan",
      city: "Miami",
      height_cm: 180,
      gender: "male",
      date_of_birth: "1996-03-20",
      bio_raw: "",
      bio_curated: "",
    },
    {
      id: NOA.profileId,
      user_id: NOA.userId,
      slug: "noa-vance",
      first_name: "Noa",
      last_name: "Vance",
      city: "Berlin",
      height_cm: 178,
      bust_cm: 82,
      waist_cm: 60,
      hips_cm: 88,
      gender: "female",
      date_of_birth: null,
      bio_raw: "",
      bio_curated: "",
    },
    {
      id: FIL.profileId,
      user_id: FIL.userId,
      slug: "fil-sato",
      first_name: "Fil",
      last_name: "Sato",
      city: "Tokyo",
      height_cm: 184,
      gender: "male",
      date_of_birth: "1995-05-05",
      bio_raw: "",
      bio_curated: "",
    },
  ]);

  await knex("images").insert([
    {
      id: AVA.headshotId,
      profile_id: AVA.profileId,
      path: "https://cdn.example.test/ava-headshot.jpg",
      is_primary: true,
      sort: 0,
      image_type: "digital",
      shot_type: "headshot",
      captured_at: daysAgoIso(5),
    },
    {
      id: AVA.fullLengthId,
      profile_id: AVA.profileId,
      path: "https://cdn.example.test/ava-full.jpg",
      is_primary: false,
      sort: 1,
      image_type: "digital",
      shot_type: "full_length",
      captured_at: daysAgoIso(5),
    },
  ]);

  await knex("applicant_identities").insert({
    id: BO.identityId,
    email_normalized: "bo@applicant.test",
    profile_id: null,
    claimed_at: null,
    disowned_at: null,
  });

  await knex("applications").insert([
    {
      id: AVA.applicationId,
      profile_id: AVA.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      status_changed_at: daysAgoIso(3),
      created_at: daysAgoIso(10),
    },
    {
      id: MIA.applicationId,
      profile_id: MIA.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      status_changed_at: daysAgoIso(2),
      created_at: daysAgoIso(8),
    },
    {
      id: CAM.applicationId,
      profile_id: CAM.profileId,
      agency_id: AGENCY_ID,
      status: "requested_more",
      status_changed_at: daysAgoIso(6),
      created_at: daysAgoIso(12),
    },
    {
      id: DEV.applicationId,
      profile_id: DEV.profileId,
      agency_id: AGENCY_ID,
      status: "development",
      status_changed_at: daysAgoIso(1),
      created_at: daysAgoIso(20),
    },
    {
      id: NOA.applicationId,
      profile_id: NOA.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      status_changed_at: daysAgoIso(2),
      created_at: daysAgoIso(7),
    },
    {
      id: FIL.applicationId,
      profile_id: FIL.profileId,
      agency_id: AGENCY_ID,
      status: "kept_on_file",
      status_changed_at: daysAgoIso(30),
      created_at: daysAgoIso(60),
    },
    {
      id: BO.applicationId,
      profile_id: null,
      applicant_identity_id: BO.identityId,
      agency_id: AGENCY_ID,
      status: "passed",
      decline_reason: "not_the_right_fit",
      status_changed_at: daysAgoIso(4),
      created_at: daysAgoIso(9),
    },
  ]);

  await knex("board_applications").insert(
    [AVA, MIA, CAM, DEV, NOA, FIL, BO].map((entry) => ({
      id: uuidv4(),
      board_id: BOARD_ID,
      application_id: entry.applicationId,
    })),
  );

  const noteId = uuidv4();
  await knex("application_notes").insert([
    {
      id: noteId,
      application_id: AVA.applicationId,
      note: "Great fit for the editorial package.",
      created_by_user_id: OWNER_USER_ID,
    },
    {
      // A deleted (tombstoned) note must not count.
      id: uuidv4(),
      application_id: AVA.applicationId,
      note: "Retracted comment.",
      created_by_user_id: OWNER_USER_ID,
      deleted_at: new Date().toISOString(),
    },
  ]);

  await knex("application_tags").insert([
    { id: uuidv4(), application_id: AVA.applicationId, agency_id: AGENCY_ID, tag: "priority", color: "gold" },
    { id: uuidv4(), application_id: AVA.applicationId, agency_id: AGENCY_ID, tag: "editorial", color: null },
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

describe("GET /api/agency/boards/:boardId/candidates", () => {
  let body;
  let byId;

  beforeAll(async () => {
    const response = await request(app).get(
      `/api/agency/boards/${BOARD_ID}/candidates`,
    );
    expect(response.status).toBe(200);
    body = response.body;
    byId = new Map(body.candidates.map((c) => [c.applicationId, c]));
  });

  test("keeps every existing key", () => {
    const ava = byId.get(AVA.applicationId);
    for (const key of [
      "id",
      "applicationId",
      "profileId",
      "name",
      "avatar",
      "stage",
      "backendStatus",
      "height",
      "location",
      "measurements",
      "portfolio",
      "created_at",
    ]) {
      expect(ava).toHaveProperty(key);
    }
  });

  test("includes the identity-only applicant (LEFT JOIN, not dropped)", () => {
    expect(byId.has(BO.applicationId)).toBe(true);
  });

  test("adds submittedAt / statusChangedAt as ISO strings", () => {
    const ava = byId.get(AVA.applicationId);
    expect(new Date(ava.submittedAt).toISOString()).toBe(ava.submittedAt);
    expect(new Date(ava.statusChangedAt).toISOString()).toBe(ava.statusChangedAt);
  });

  test("adds declineReason, null unless declined", () => {
    expect(byId.get(AVA.applicationId).declineReason).toBeNull();
    expect(byId.get(BO.applicationId).declineReason).toBe("not_the_right_fit");
  });

  test("adds city as the same value as location", () => {
    const ava = byId.get(AVA.applicationId);
    expect(ava.city).toBe(ava.location);
    expect(ava.city).toBe("New York");
  });

  test("adult profile-backed candidate: real age, isMinor false, measurements present", () => {
    const ava = byId.get(AVA.applicationId);
    expect(ava.isMinor).toBe(false);
    expect(typeof ava.age).toBe("number");
    expect(ava.age).toBeGreaterThanOrEqual(26);
    expect(ava.measurements).toBe("84-61-90");
  });

  test("minor candidate: isMinor true and measurements withheld at the data layer", () => {
    const mia = byId.get(MIA.applicationId);
    expect(mia.isMinor).toBe(true);
    expect(mia.age).toBeLessThan(18);
    expect(mia.measurements).toBeNull();
  });

  test("identity-only candidate: age and digitalsFreshness are null, never fabricated", () => {
    const bo = byId.get(BO.applicationId);
    expect(bo.age).toBeNull();
    expect(bo.isMinor).toBe(false);
    expect(bo.digitalsFreshness).toBeNull();
  });

  test("no recorded DOB: age unknown is flagged and measurements are withheld", () => {
    const noa = byId.get(NOA.applicationId);
    // Age unknown is not age cleared: the row carries stats in the database
    // and must still not ship them.
    expect(noa.age).toBeNull();
    expect(noa.isMinor).toBe(false);
    expect(noa.ageUnknown).toBe(true);
    expect(noa.measurements).toBeNull();
  });

  test("a recorded DOB is never flagged as unknown", () => {
    expect(byId.get(AVA.applicationId).ageUnknown).toBe(false);
    expect(byId.get(MIA.applicationId).ageUnknown).toBe(false);
    // The identity-only applicant carries no DOB either.
    expect(byId.get(BO.applicationId).ageUnknown).toBe(true);
  });

  test("headshot prefers the digital headshot frame, same path field as avatar", () => {
    const ava = byId.get(AVA.applicationId);
    expect(ava.headshot).toBe("https://cdn.example.test/ava-headshot.jpg");
    expect(ava.avatar).toBe("https://cdn.example.test/ava-headshot.jpg");
  });

  test("digitalsFreshness for a profile-backed candidate uses the dossier engine's shape", () => {
    const ava = byId.get(AVA.applicationId);
    expect(ava.digitalsFreshness).not.toBeNull();
    expect(ava.digitalsFreshness).toHaveProperty("state");
    expect(ava.digitalsFreshness).toHaveProperty("hasDigitals", true);
    expect(ava.digitalsFreshness.state).toBe("current");
  });

  test("digitalsFreshness is null for a candidate with no dated frames", () => {
    const cam = byId.get(CAM.applicationId);
    expect(cam.digitalsFreshness).toBeNull();
  });

  test("notesCount excludes deleted notes and aggregates without N+1", () => {
    expect(byId.get(AVA.applicationId).notesCount).toBe(1);
    expect(byId.get(MIA.applicationId).notesCount).toBe(0);
  });

  test("tags aggregate as { id, tag, color }", () => {
    const tags = byId.get(AVA.applicationId).tags;
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.tag).sort()).toEqual(["editorial", "priority"]);
    expect(tags[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), tag: expect.any(String) }),
    );
    expect(byId.get(MIA.applicationId).tags).toEqual([]);
  });

  test("board counts: waiting, offer, on-file", () => {
    expect(body.board.waiting_count).toBe(1); // CAM: requested_more
    expect(body.board.offer_count).toBe(1); // DEV: development
    expect(body.board.on_file_count).toBe(1); // FIL: kept_on_file
  });

  test("existing board counts are unchanged", () => {
    expect(body.board.application_count).toBe(7);
    expect(typeof body.board.submitted_count).toBe("number");
    expect(typeof body.board.represented_count).toBe("number");
  });
});
