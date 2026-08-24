"use strict";

/**
 * An invitation is not an application.
 *
 * The regression under test is a real disclosure defect: the Discover invite
 * endpoints recorded an agency's interest by inserting an `applications` row on
 * the talent's behalf. That row then satisfied the ownership check in
 * `GET /api/agency/applications/:applicationId/details`, which serves the
 * submission-grade profile — `AGENCY_SUBMISSION_SELECT` includes
 * `AGE_GATING_COLUMNS`, i.e. exact `date_of_birth` — together with the talent's
 * email. The agency got all of that for someone who had never applied to them,
 * from a Discover view that deliberately shows `age_band` and no contact.
 *
 * The same row also made `alreadyAppliedToTarget` self-fulfilling, so an invited
 * talent was told they had already applied somewhere they had not.
 *
 * See migrations/20260820100000_create_agency_invitations.js.
 */

const { v4: uuidv4 } = require("uuid");
const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("agency-invitations");
const knex = require("../../src/shared/db/knex");

const {
  hasInvitationsSchema,
  resetInvitationsSchemaCache,
  findInvitation,
  latestInvitationForProfile,
  invitedProfileIds,
  createInvitation,
} = require("../../src/domains/agency/services/agency-invitations");

const AGENCY_A = uuidv4();
const AGENCY_B = uuidv4();
const PROFILE_ID = uuidv4();
const USER_ID = uuidv4();

beforeAll(async () => {
  await migrate(knex);

  await knex("agencies").insert([
    { id: AGENCY_A, name: "Agency A", slug: `agency-a-${AGENCY_A.slice(0, 8)}` },
    { id: AGENCY_B, name: "Agency B", slug: `agency-b-${AGENCY_B.slice(0, 8)}` },
  ]);
  await knex("users").insert({
    id: USER_ID,
    email: `talent-${USER_ID.slice(0, 8)}@example.com`,
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: USER_ID,
    slug: `ada-editorial-${PROFILE_ID.slice(0, 8)}`,
    first_name: "Ada",
    last_name: "Editorial",
    city: "New York",
    height_cm: 178,
    bio_raw: "Editorial and runway.",
    bio_curated: "Editorial and runway.",
    date_of_birth: "1999-04-02",
    is_discoverable: true,
  });
}, 60000);

afterEach(async () => {
  await knex("agency_invitations").del();
  await knex("applications").del();
});

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("agency_invitations schema", () => {
  test("the table exists after migrating to latest", async () => {
    expect(await knex.schema.hasTable("agency_invitations")).toBe(true);
    expect(await hasInvitationsSchema(knex)).toBe(true);
  });

  test("one standing invitation per (agency, profile)", async () => {
    await createInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });

    await expect(
      createInvitation(knex, {
        agencyId: AGENCY_A,
        profileId: PROFILE_ID,
        id: uuidv4(),
      }),
    ).rejects.toThrow();
  });

  test("different agencies may each invite the same talent", async () => {
    await createInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });
    await createInvitation(knex, {
      agencyId: AGENCY_B,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });

    expect(await knex("agency_invitations").count({ n: "*" }).first()).toEqual(
      expect.objectContaining({ n: 2 }),
    );
  });
});

describe("an invitation grants no application-grade access", () => {
  test("inviting writes no applications row at all", async () => {
    await createInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });

    // This is the exact query the details endpoint uses to decide whether this
    // agency may open this application. With no row, there is nothing to open.
    const owned = await knex("applications")
      .where({ profile_id: PROFILE_ID, agency_id: AGENCY_A })
      .first();

    expect(owned).toBeUndefined();
    expect(await knex("applications").count({ n: "*" }).first()).toEqual(
      expect.objectContaining({ n: 0 }),
    );
  });

  test("an invited talent has not 'already applied' to the inviting agency", async () => {
    await createInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });

    const signal = await latestInvitationForProfile(knex, PROFILE_ID);
    expect(signal.invited_by_agency_id).toBe(AGENCY_A);

    // The talent-dashboard prompt derives this from `applications`, which the
    // invitation no longer populates.
    const existing = await knex("applications")
      .where({ profile_id: PROFILE_ID, agency_id: signal.invited_by_agency_id })
      .first();
    expect(Boolean(existing)).toBe(false);
  });
});

describe("provenance survives on a real application", () => {
  test("applying after an invitation credits invited_by_agency_id", async () => {
    await createInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });

    const invitation = await findInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
    });
    await knex("applications").insert({
      id: uuidv4(),
      profile_id: PROFILE_ID,
      agency_id: AGENCY_A,
      status: "pending",
      invited_by_agency_id: invitation ? AGENCY_A : null,
    });

    const row = await knex("applications")
      .where({ profile_id: PROFILE_ID, agency_id: AGENCY_A })
      .first();
    expect(row.invited_by_agency_id).toBe(AGENCY_A);
  });

  test("applying with no invitation leaves invited_by_agency_id null", async () => {
    const invitation = await findInvitation(knex, {
      agencyId: AGENCY_B,
      profileId: PROFILE_ID,
    });
    expect(invitation).toBeNull();

    await knex("applications").insert({
      id: uuidv4(),
      profile_id: PROFILE_ID,
      agency_id: AGENCY_B,
      status: "pending",
      invited_by_agency_id: invitation ? AGENCY_B : null,
    });

    const row = await knex("applications")
      .where({ profile_id: PROFILE_ID, agency_id: AGENCY_B })
      .first();
    expect(row.invited_by_agency_id).toBeNull();
  });
});

describe("Discover still knows who it has reached", () => {
  test("invitedProfileIds returns this agency's invitations only", async () => {
    await createInvitation(knex, {
      agencyId: AGENCY_A,
      profileId: PROFILE_ID,
      id: uuidv4(),
    });

    expect(await invitedProfileIds(knex, AGENCY_A)).toEqual([PROFILE_ID]);
    expect(await invitedProfileIds(knex, AGENCY_B)).toEqual([]);
  });

  test("latestInvitationForProfile returns the most recent, with agency identity", async () => {
    await knex("agency_invitations").insert([
      {
        id: uuidv4(),
        agency_id: AGENCY_A,
        profile_id: PROFILE_ID,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: uuidv4(),
        agency_id: AGENCY_B,
        profile_id: PROFILE_ID,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    ]);

    const signal = await latestInvitationForProfile(knex, PROFILE_ID);
    expect(signal.invited_by_agency_id).toBe(AGENCY_B);
    expect(signal.agency_name).toBe("Agency B");
  });
});

describe("deploy-before-migrate guard", () => {
  // The talent dashboard prompt calls latestInvitationForProfile on the first
  // screen after login. If the deploy lands before the migration, an unguarded
  // query takes that screen down for every talent until migrate finishes.
  const absentSchemaDb = () => {
    const db = () => {
      throw new Error("must not query agency_invitations when it is absent");
    };
    db.schema = { hasTable: async () => false };
    db.fn = { now: () => new Date().toISOString() };
    return db;
  };

  beforeEach(() => resetInvitationsSchemaCache());
  afterEach(() => resetInvitationsSchemaCache());

  test("reads answer safely and writes report failure when the table is absent", async () => {
    const db = absentSchemaDb();

    expect(await hasInvitationsSchema(db)).toBe(false);
    expect(await findInvitation(db, { agencyId: AGENCY_A, profileId: PROFILE_ID })).toBeNull();
    expect(await latestInvitationForProfile(db, PROFILE_ID)).toBeNull();
    expect(await invitedProfileIds(db, AGENCY_A)).toEqual([]);
    // Null, not a fabricated id — the caller must not email an invitation that
    // nothing recorded.
    expect(
      await createInvitation(db, {
        agencyId: AGENCY_A,
        profileId: PROFILE_ID,
        id: uuidv4(),
      }),
    ).toBeNull();
  });
});
