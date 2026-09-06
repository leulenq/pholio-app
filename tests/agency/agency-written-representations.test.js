"use strict";

/**
 * The signing loop (industry audit §3.2, decision §7.6).
 *
 * Before this lane, moving an application to `represented` wrote one string on
 * the application row. `talent_representations` — the table Discover and the
 * dossier actually read representation from — was writable only by the talent,
 * so the signing agency read its own signed model as UNREPRESENTED.
 *
 * This suite pins the whole loop:
 *   migration      the widened vocabulary and its uniqueness decision, both ways
 *   recordSigning  idempotent, scoped, agency-originated
 *   the route      writes the row inside the SAME transaction as the status
 *   the reads      pending is not representation; confirmed is
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

// `useIsolatedDatabase` rewrites process.env.DATABASE_URL for the whole
// process, and Jest does not reset the environment between test files. Suites
// that share the run database would then resolve to this suite's file — which
// afterAll deletes. Capture the previous value and put it back.
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const DB_FILE = useIsolatedDatabase("agency-written-representations");

function restoreDatabaseUrl() {
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
}

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/shared/lib/email", () => ({
  ...jest.requireActual("../../src/shared/lib/email"),
  sendApplicationStatusEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("../../src/shared/services/notify-talent-application", () => ({
  notifyTalentForApplicationStatus: jest.fn().mockResolvedValue(undefined),
}));

// Wraps the real service so the route exercises production behaviour, while
// one test can make `recordSigning` blow up on demand to prove the status
// update rolls back with it.
// `mock`-prefixed so Jest's out-of-scope guard allows the factory to close
// over it.
const mockSigningFailure = { error: null };
jest.mock("../../src/domains/agency/services/representations", () => {
  const actual = jest.requireActual(
    "../../src/domains/agency/services/representations",
  );
  return {
    ...actual,
    recordSigning: jest.fn(async (args) => {
      if (mockSigningFailure.error) throw mockSigningFailure.error;
      return actual.recordSigning(args);
    }),
  };
});

const knex = require("../../src/shared/db/knex");
const migration = require("../../migrations/20260906123000_agency_written_representations");
const {
  recordSigning,
  endRepresentation,
} = require("../../src/domains/agency/services/representations");
const {
  attachImagesAndInvites,
} = require("../../src/domains/agency/services/discover-search");
const {
  loadRepresentationRecord,
  buildRepresentationLines,
} = require("../../src/domains/agency/services/talent-dossier");
const {
  deriveRepresentationStatus,
} = require("../../src/shared/lib/audience-dto");

const AGENCY_ID = uuidv4();
const AGENCY_USER_ID = uuidv4();
const RIVAL_AGENCY_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const BOARD_ID = uuidv4();

let app;

async function seed() {
  await knex("users").insert([
    {
      id: AGENCY_USER_ID,
      email: `signing-agency-${AGENCY_USER_ID}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    },
    {
      id: TALENT_USER_ID,
      email: `signing-talent-${TALENT_USER_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
    },
  ]);
  await knex("agencies").insert([
    {
      id: AGENCY_ID,
      name: "Meridian Management",
      status: "ACTIVE",
      location: "New York",
    },
    { id: RIVAL_AGENCY_ID, name: "Rival Board", status: "ACTIVE" },
  ]);
  await knex("agency_memberships").insert({
    id: uuidv4(),
    agency_id: AGENCY_ID,
    user_id: AGENCY_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });
  await knex("boards").insert({
    id: BOARD_ID,
    agency_id: AGENCY_ID,
    name: "Women — Main",
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    slug: `signing-talent-${PROFILE_ID}`,
    first_name: "Nadia",
    last_name: "Ferreira",
    city: "Brooklyn",
    date_of_birth: "1998-07-11",
    gender: "Female",
    height_cm: 179,
    bio_raw: "",
    bio_curated: "",
    is_discoverable: true,
    onboarding_completed_at: new Date().toISOString(),
  });
}

/** `applications` is UNIQUE(profile_id, agency_id), so replace rather than add. */
async function makeApplication(status = "shortlisted", boardId = BOARD_ID) {
  await knex("applications")
    .where({ profile_id: PROFILE_ID, agency_id: AGENCY_ID })
    .del();
  const id = uuidv4();
  await knex("applications").insert({
    id,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status,
    board_id: boardId,
  });
  return id;
}

async function clearRepresentations() {
  await knex("talent_representations").where({ profile_id: PROFILE_ID }).del();
  await knex("profiles").where({ id: PROFILE_ID }).update({ current_agency: null });
}

function agencyRow(overrides = {}) {
  return {
    id: uuidv4(),
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    external_agency_name: null,
    external_agency_key: null,
    relationship_type: "placement",
    market: "New York",
    territory: null,
    scope_key: "new york|",
    division: null,
    board_name: "Women — Main",
    is_exclusive: false,
    status: "pending",
    started_on: "2026-09-06",
    ended_on: null,
    source: "agency",
    ...overrides,
  };
}

beforeAll(async () => {
  await migrate(knex);
  await seed();

  const inboxRouter = require("../../src/domains/agency/routes/inbox");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      userId: AGENCY_ID,
      memberUserId: AGENCY_USER_ID,
      role: "AGENCY",
      agencyId: AGENCY_ID,
      agencyMembershipRole: "OWNER",
      agencyOnboardingCompletedAt: new Date().toISOString(),
    };
    next();
  });
  app.use(inboxRouter);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
  restoreDatabaseUrl();
});

beforeEach(async () => {
  mockSigningFailure.error = null;
  await clearRepresentations();
});

// ---------------------------------------------------------------------------

describe("migration 20260906123000_agency_written_representations", () => {
  test("admits pending + agency rows and scopes pending uniqueness separately", async () => {
    // The vocabulary the prior CHECK constraints rejected outright.
    await knex("talent_representations").insert(agencyRow());
    const stored = await knex("talent_representations")
      .where({ profile_id: PROFILE_ID })
      .first();
    expect(stored).toMatchObject({
      status: "pending",
      source: "agency",
      board_name: "Women — Main",
    });
    expect(stored.ended_on).toBeNull();

    // A second pending proposal from the same agency for the same scope is a
    // duplicate — the partial unique index is the backstop under recordSigning.
    await expect(
      knex("talent_representations").insert(agencyRow()),
    ).rejects.toThrow();

    // ...but pending does NOT occupy the active scope, so the active row the
    // confirmation will eventually produce is not pre-blocked.
    await knex("talent_representations").insert(
      agencyRow({ status: "active", agency_id: RIVAL_AGENCY_ID }),
    );

    // Lifecycle: pending, like active, must carry no end date.
    await expect(
      knex("talent_representations").insert(
        agencyRow({
          agency_id: RIVAL_AGENCY_ID,
          scope_key: "paris|",
          market: "Paris",
          ended_on: "2026-09-06",
        }),
      ),
    ).rejects.toThrow();
  });

  test("down closes pending rows rather than promoting them, and up restores", async () => {
    await knex("talent_representations").insert(agencyRow());

    await migration.down(knex);

    const collapsed = await knex("talent_representations")
      .where({ profile_id: PROFILE_ID })
      .first();
    // Lossy on purpose: the talent never confirmed, so rollback must not
    // invent an active relationship.
    expect(collapsed.status).toBe("ended");
    expect(collapsed.ended_on).toBeTruthy();
    expect(collapsed.source).toBe("profile");
    expect(
      await knex.schema.hasColumn("talent_representations", "board_name"),
    ).toBe(false);
    expect(
      await knex.schema.hasColumn("talent_representations", "confirmed_at"),
    ).toBe(false);

    await migration.up(knex);

    expect(
      await knex.schema.hasColumn("talent_representations", "board_name"),
    ).toBe(true);
    // The surviving row is carried across both rebuilds intact.
    const survived = await knex("talent_representations")
      .where({ profile_id: PROFILE_ID })
      .first();
    expect(survived).toMatchObject({ status: "ended", relationship_type: "placement" });
  }, 30000);
});

// ---------------------------------------------------------------------------

describe("recordSigning", () => {
  test("writes one pending placement row carrying the agency's market and board", async () => {
    const applicationId = await makeApplication("accepted");

    const row = await knex.transaction((trx) =>
      recordSigning({
        trx,
        applicationId,
        agencyId: AGENCY_ID,
        actorUserId: AGENCY_USER_ID,
      }),
    );

    expect(row).toMatchObject({
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      relationship_type: "placement",
      status: "pending",
      source: "agency",
      market: "New York", // agencies.location, not a guess
      board_name: "Women — Main", // snapshot of the board at signing
      originating_application_id: applicationId,
    });
    expect(row.is_exclusive === false || row.is_exclusive === 0).toBe(true);
    expect(row.started_on).toBeTruthy();

    // A pending proposal is not an active relationship, so the legacy
    // projection stays empty.
    const profile = await knex("profiles")
      .where({ id: PROFILE_ID })
      .first("current_agency");
    expect(profile.current_agency).toBeNull();
  });

  test("is idempotent per scope — repeat signings converge on one row", async () => {
    const applicationId = await makeApplication("accepted");

    const first = await knex.transaction((trx) =>
      recordSigning({ trx, applicationId, agencyId: AGENCY_ID }),
    );
    const second = await knex.transaction((trx) =>
      recordSigning({ trx, applicationId, agencyId: AGENCY_ID }),
    );

    expect(second.id).toBe(first.id);
    expect(
      await knex("talent_representations")
        .where({ profile_id: PROFILE_ID })
        .count({ n: "*" })
        .first(),
    ).toMatchObject({ n: 1 });

    // Still one row once the talent has confirmed it: an already-active
    // relationship is not re-proposed.
    await knex("talent_representations")
      .where({ id: first.id })
      .update({ status: "active", confirmed_at: knex.fn.now() });
    const third = await knex.transaction((trx) =>
      recordSigning({ trx, applicationId, agencyId: AGENCY_ID }),
    );
    expect(third.id).toBe(first.id);
    expect(third.status).toBe("active");
  });

  test("signs nobody when the application carries no profile", async () => {
    const row = await knex.transaction((trx) =>
      recordSigning({ trx, applicationId: uuidv4(), agencyId: AGENCY_ID }),
    );
    expect(row).toBeNull();
  });

  test("endRepresentation closes only the rows this agency originated", async () => {
    const applicationId = await makeApplication("represented");
    const mine = await knex.transaction((trx) =>
      recordSigning({ trx, applicationId, agencyId: AGENCY_ID }),
    );
    // A relationship the talent recorded themselves, with another agency.
    const theirs = agencyRow({
      agency_id: RIVAL_AGENCY_ID,
      market: "Paris",
      scope_key: "paris|",
      status: "active",
      source: "profile",
      board_name: null,
      originating_application_id: null,
    });
    await knex("talent_representations").insert(theirs);

    const ended = await knex.transaction((trx) =>
      endRepresentation({ trx, applicationId, agencyId: AGENCY_ID }),
    );

    expect(ended).toBe(1);
    expect(
      await knex("talent_representations").where({ id: mine.id }).first(),
    ).toMatchObject({ status: "ended" });
    expect(
      await knex("talent_representations").where({ id: theirs.id }).first(),
    ).toMatchObject({ status: "active" });
  });
});

// ---------------------------------------------------------------------------

describe("PATCH /api/agency/applications/:id/status", () => {
  test("represented writes the pending representation row", async () => {
    const applicationId = await makeApplication("accepted");

    const response = await request(app)
      .patch(`/api/agency/applications/${applicationId}/status`)
      .set("Accept", "application/json")
      .send({ status: "represented" });

    expect(response.status).toBe(200);
    const row = await knex("talent_representations")
      .where({ profile_id: PROFILE_ID })
      .first();
    expect(row).toMatchObject({
      agency_id: AGENCY_ID,
      status: "pending",
      source: "agency",
      originating_application_id: applicationId,
      board_name: "Women — Main",
    });
  });

  test("leaving represented ends the row this agency wrote", async () => {
    const applicationId = await makeApplication("accepted");
    await request(app)
      .patch(`/api/agency/applications/${applicationId}/status`)
      .send({ status: "represented" })
      .expect(200);

    await request(app)
      .patch(`/api/agency/applications/${applicationId}/status`)
      .send({ status: "kept_on_file" })
      .expect(200);

    const row = await knex("talent_representations")
      .where({ profile_id: PROFILE_ID })
      .first();
    expect(row).toMatchObject({ status: "ended" });
    expect(row.ended_on).toBeTruthy();
  });

  test("a failed signing rolls the status change back with it", async () => {
    const applicationId = await makeApplication("accepted");
    mockSigningFailure.error = new Error("signing write failed");

    const response = await request(app)
      .patch(`/api/agency/applications/${applicationId}/status`)
      .set("Accept", "application/json")
      .send({ status: "represented" });

    expect(response.status).toBe(500);
    // The whole decision is one transaction: no half-signed application.
    const application = await knex("applications")
      .where({ id: applicationId })
      .first("status");
    expect(application.status).toBe("accepted");
    expect(
      await knex("talent_representations").where({ profile_id: PROFILE_ID }).first(),
    ).toBeUndefined();
  });
});

describe("PATCH /api/agency/applications/bulk-status", () => {
  test("a bulk signing signs for real", async () => {
    const applicationId = await makeApplication("shortlisted");

    await request(app)
      .patch("/api/agency/applications/bulk-status")
      .set("Accept", "application/json")
      .send({ applicationIds: [applicationId], status: "represented" })
      .expect(200);

    expect(
      await knex("talent_representations").where({ profile_id: PROFILE_ID }).first(),
    ).toMatchObject({ status: "pending", source: "agency" });

    await request(app)
      .patch("/api/agency/applications/bulk-status")
      .send({ applicationIds: [applicationId], status: "archived" })
      .expect(200);

    expect(
      await knex("talent_representations").where({ profile_id: PROFILE_ID }).first(),
    ).toMatchObject({ status: "ended" });
  });
});

// ---------------------------------------------------------------------------

describe("agency reads", () => {
  async function discoverStatus() {
    const profiles = await knex("profiles").where({ id: PROFILE_ID });
    const [dto] = await attachImagesAndInvites(
      knex,
      profiles,
      new Map(),
      AGENCY_ID,
    );
    return dto.representation_status;
  }

  test("a pending signing is not representation; a confirmed one is", async () => {
    const applicationId = await makeApplication("accepted");
    await request(app)
      .patch(`/api/agency/applications/${applicationId}/status`)
      .send({ status: "represented" })
      .expect(200);

    // The talent has not answered — nobody, including the signing agency,
    // may read this as representation.
    expect(await discoverStatus()).toBe("unrepresented");

    const row = await knex("talent_representations")
      .where({ profile_id: PROFILE_ID })
      .first();
    await knex("talent_representations").where({ id: row.id }).update({
      status: "active",
      confirmed_at: knex.fn.now(),
      confirmed_by_user_id: TALENT_USER_ID,
    });

    // This is the bug the lane exists to fix: the signing agency used to read
    // its own signed model as unrepresented.
    expect(await discoverStatus()).toBe("represented");
  });

  test("a pending row does not suppress the legacy current_agency fallback", async () => {
    await knex("profiles")
      .where({ id: PROFILE_ID })
      .update({ current_agency: "Legacy Management" });
    try {
      await knex("talent_representations").insert(agencyRow());
      // deriveRepresentationStatus falls back on current_agency only when it
      // sees NO rows, so the pending row has to be filtered out before it,
      // not merely treated as inactive.
      expect(await discoverStatus()).toBe("represented");
    } finally {
      await knex("profiles")
        .where({ id: PROFILE_ID })
        .update({ current_agency: null });
    }
  });

  test("the dossier shows a pending signing to its author and to nobody else", async () => {
    await knex("talent_representations").insert(agencyRow());
    const rows = await loadRepresentationRecord(knex, PROFILE_ID);

    expect(
      deriveRepresentationStatus(
        { id: PROFILE_ID },
        rows.filter((row) => row.status !== "pending"),
      ).representation_status,
    ).toBe("unrepresented");

    const mine = buildRepresentationLines(
      rows.filter((row) => row.status !== "pending" || row.agency_id === AGENCY_ID),
      AGENCY_ID,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      status: "pending",
      pending_confirmation: true,
      is_this_agency: true,
      board_name: "Women — Main",
      agency_name: "Meridian Management",
    });

    const rival = buildRepresentationLines(
      rows.filter(
        (row) => row.status !== "pending" || row.agency_id === RIVAL_AGENCY_ID,
      ),
      RIVAL_AGENCY_ID,
    );
    expect(rival).toHaveLength(0);
  });
});
