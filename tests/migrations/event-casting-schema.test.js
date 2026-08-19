"use strict";

/**
 * Lane 0 contract test for the event-casting schema
 * (`docs/event-casting-design-2026-08.md` §(a), §(g), rulings R2/R5/R6).
 *
 * Every other lane builds against the column names, the two status strings and
 * the constants exports asserted here, so this suite is the thing that has to
 * fail first if any of them move.
 *
 * It migrates a throwaway SQLite file all the way to latest rather than
 * calling `migration.up()` in isolation: the interesting failures in M1 and M2
 * are ordering failures — a table rebuild that drops a partial index, a
 * uniqueness swap applied before the column it filters on exists — and those
 * only show up in a real migration run.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("event-casting-schema");
const db = require("../../src/shared/db/knex");

const statusMigration = require("../../migrations/20260815090000_event_casting_application_statuses");

const {
  ALL_APPLICATION_STATUSES,
  AWAITING_AGENCY_APPLICATION_STATUSES,
  TALENT_WRITABLE_APPLICATION_STATUSES,
  WRITABLE_APPLICATION_STATUSES,
} = require("../../src/shared/constants/application-status");

const {
  CALL_KINDS,
  COMPENSATION_TYPES,
  FUNNEL_EVENT_TYPES,
  MAX_LINKS_BY_ORG_KIND,
  PICK_LIST_STATUSES,
  PICK_MARKS,
  maxOpenCallLinksForOrgKind,
} = require("../../src/shared/constants/event-casting");

const uuid = () => crypto.randomUUID();

const agencyId = uuid();
const otherAgencyId = uuid();
const profileId = uuid();
const otherProfileId = uuid();
const linkOneId = uuid();
const linkTwoId = uuid();

async function insertProfile(id, userId, slug) {
  await db("users").insert({
    id: userId,
    email: `${slug}@example.test`,
    role: "TALENT",
  });
  await db("profiles").insert({
    id,
    user_id: userId,
    slug,
    first_name: "Test",
    city: "New York",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
  });
}

function application(overrides = {}) {
  return {
    id: uuid(),
    profile_id: profileId,
    agency_id: agencyId,
    status: "pending",
    call_purpose: "representation",
    ...overrides,
  };
}

async function indexNames(table) {
  const rows = await db("sqlite_master")
    .select("name")
    .where({ type: "index", tbl_name: table });
  return rows.map((row) => row.name);
}

describe("event casting schema (migrations M1–M5)", () => {
  beforeAll(async () => {
    await migrate(db);

    await db("agencies").insert([
      { id: agencyId, name: "Fashion Week Brooklyn" },
      { id: otherAgencyId, name: "Second Organizer" },
    ]);
    await insertProfile(profileId, uuid(), "test-talent");
    await insertProfile(otherProfileId, uuid(), "second-talent");
    await db("agency_open_call_links").insert([
      {
        id: linkOneId,
        agency_id: agencyId,
        code: "fwb-brooklyn",
        label: "Brooklyn edition",
        call_kind: CALL_KINDS.EVENT_CASTING,
      },
      {
        id: linkTwoId,
        agency_id: agencyId,
        code: "fwb-queens",
        label: "Queens edition",
        call_kind: CALL_KINDS.EVENT_CASTING,
      },
    ]);
  }, 120000);

  afterEach(async () => {
    await db("applications").del();
  });

  describe("columns and tables", () => {
    test("applications carries the event call link and purpose", async () => {
      expect(await db.schema.hasColumn("applications", "open_call_link_id")).toBe(true);
      expect(await db.schema.hasColumn("applications", "call_purpose")).toBe(true);
    });

    test("call_purpose defaults to representation for existing rows", async () => {
      const id = uuid();
      await db("applications").insert({
        id,
        profile_id: profileId,
        agency_id: agencyId,
        status: "pending",
      });
      const row = await db("applications").where({ id }).first();
      expect(row.call_purpose).toBe("representation");
      expect(row.open_call_link_id).toBeNull();
    });

    test("agency_open_call_links carries every event field", async () => {
      const columns = [
        "call_kind",
        "compensation_type",
        "compensation_details",
        "event_name",
        "event_starts_on",
        "event_ends_on",
        "event_location",
        "requires_walk_video",
        "requires_availability",
        "requires_measurements",
        "review_window_days",
        "offer_response_window_hours",
      ];
      for (const column of columns) {
        expect(
          `${column}:${await db.schema.hasColumn("agency_open_call_links", column)}`,
        ).toBe(`${column}:true`);
      }
    });

    test("event call defaults match the design", async () => {
      const link = await db("agency_open_call_links").where({ id: linkOneId }).first();
      expect(link.offer_response_window_hours).toBe(72);
      expect(link.review_window_days).toBeNull();
      // Booleans round-trip as 0/1 on SQLite.
      expect(Boolean(link.requires_walk_video)).toBe(false);
      expect(Boolean(link.requires_availability)).toBe(false);
      expect(Boolean(link.requires_measurements)).toBe(false);
    });

    test("agencies carry org_kind defaulting to agency", async () => {
      expect(await db.schema.hasColumn("agencies", "org_kind")).toBe(true);
      const agency = await db("agencies").where({ id: agencyId }).first();
      expect(agency.org_kind).toBe("agency");
    });

    test("consent events carry purpose, link and frozen compensation", async () => {
      const table = "application_submission_consent_events";
      expect(await db.schema.hasColumn(table, "purpose")).toBe(true);
      expect(await db.schema.hasColumn(table, "open_call_link_id")).toBe(true);
      expect(await db.schema.hasColumn(table, "compensation_disclosure")).toBe(true);
    });

    test("pick list and funnel tables exist", async () => {
      for (const table of [
        "event_pick_lists",
        "event_pick_list_items",
        "event_pick_selections",
        "event_casting_funnel_events",
      ]) {
        expect(`${table}:${await db.schema.hasTable(table)}`).toBe(`${table}:true`);
      }
    });

    test("one live slot offer per applicant is a partial unique", async () => {
      expect(await indexNames("event_pick_selections")).toContain(
        "uq_event_pick_selections_offered_application",
      );
    });
  });

  describe("uniqueness swap", () => {
    test("the blanket profile+agency unique is gone", async () => {
      expect(await indexNames("applications")).not.toContain(
        "applications_profile_id_agency_id_unique",
      );
    });

    test("both partial unique indexes exist", async () => {
      const names = await indexNames("applications");
      expect(names).toEqual(
        expect.arrayContaining([
          "uq_applications_profile_agency_repr",
          "uq_applications_profile_event_call",
        ]),
      );
    });

    test("a second representation application to the same agency is rejected", async () => {
      await db("applications").insert(application());
      await expect(db("applications").insert(application())).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    test("representation uniqueness is still per agency", async () => {
      await db("applications").insert(application());
      await expect(
        db("applications").insert(application({ agency_id: otherAgencyId })),
      ).resolves.toBeDefined();
    });

    test("the same profile may apply to two editions of one organizer", async () => {
      // The bug the swap exists to fix: Brooklyn must not block Queens.
      await db("applications").insert(
        application({ call_purpose: "event_casting", open_call_link_id: linkOneId }),
      );
      await expect(
        db("applications").insert(
          application({ call_purpose: "event_casting", open_call_link_id: linkTwoId }),
        ),
      ).resolves.toBeDefined();
    });

    test("an event application does not block a representation application", async () => {
      await db("applications").insert(
        application({ call_purpose: "event_casting", open_call_link_id: linkOneId }),
      );
      await expect(db("applications").insert(application())).resolves.toBeDefined();
    });

    test("the same profile cannot apply twice to one edition", async () => {
      await db("applications").insert(
        application({ call_purpose: "event_casting", open_call_link_id: linkOneId }),
      );
      await expect(
        db("applications").insert(
          application({ call_purpose: "event_casting", open_call_link_id: linkOneId }),
        ),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    test("two profiles may share one edition", async () => {
      await db("applications").insert(
        application({ call_purpose: "event_casting", open_call_link_id: linkOneId }),
      );
      await expect(
        db("applications").insert(
          application({
            profile_id: otherProfileId,
            call_purpose: "event_casting",
            open_call_link_id: linkOneId,
          }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("status CHECK on SQLite (ruling R2)", () => {
    test.each(TALENT_WRITABLE_APPLICATION_STATUSES)(
      "%s is writable",
      async (status) => {
        await expect(
          db("applications").insert(application({ status })),
        ).resolves.toBeDefined();
      },
    );

    test("closed_no_response is writable — the divergence M1 repairs", async () => {
      // `20260814120000` added it on PostgreSQL only, so the SQLite CHECK has
      // been rejecting a status the auto-close job writes.
      await expect(
        db("applications").insert(application({ status: "closed_no_response" })),
      ).resolves.toBeDefined();
    });

    test("every canonical status is accepted", async () => {
      for (const status of ALL_APPLICATION_STATUSES) {
        const row = application({ status, agency_id: uuid() });
        // Distinct agencies keep the representation unique out of the way;
        // FK enforcement is off for this column's parent on SQLite.
        await db("agencies").insert({ id: row.agency_id, name: `A-${row.agency_id}` });
        await expect(db("applications").insert(row)).resolves.toBeDefined();
      }
    });

    test("an unknown status is still rejected", async () => {
      await expect(
        db("applications").insert(application({ status: "definitely_not_a_status" })),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    test("the rebuild preserved every column and index", async () => {
      // `20260701111000` rebuilt this table from a hardcoded column list. If M1
      // had copied that mistake, the columns added after it would be gone.
      const info = await db.raw("PRAGMA table_info('applications')");
      const columns = info.map((column) => column.name);
      expect(columns).toEqual(
        expect.arrayContaining([
          "id",
          "profile_id",
          "agency_id",
          "status",
          "board_id",
          "match_score",
          "minor_at_submission",
          "guardian_consent_grant_id",
          "minor_access_revocation_reason",
          "status_changed_at",
          "auto_closed_at",
          "open_call_link_id",
          "call_purpose",
        ]),
      );

      const names = await indexNames("applications");
      expect(names).toEqual(
        expect.arrayContaining([
          "applications_agency_id_index",
          "applications_profile_id_index",
          "applications_status_index",
          "applications_board_id_index",
          "applications_match_score_index",
          "idx_applications_open_status_changed",
          "idx_applications_minor_access",
        ]),
      );
    });
  });

  describe("re-running migrations", () => {
    test("migrate.latest is a no-op the second time", async () => {
      const [, log] = await db.migrate.latest();
      expect(log).toEqual([]);
    });
  });
});

/**
 * Runs last: it takes the schema down and back up, so nothing may depend on it
 * having finished in the state it started.
 */
describe("rolling M1–M5 back", () => {
  const survivorId = uuid();

  /**
   * How many steps down it takes to unwind M1–M5.
   *
   * Not the literal 5 it used to be: later lanes add migrations on top of
   * these, and a hardcoded count then rolls back *their* work instead and
   * leaves M1–M5 applied — which fails here as a confusing assertion about
   * application statuses rather than as "the count is stale". Derived from the
   * ledger, it stays correct however many migrations land after.
   */
  let steps = 0;

  test("rollback keeps the data it is not asked to remove", async () => {
    await db("applications").insert(
      application({
        id: survivorId,
        status: "confirmed",
        call_purpose: "event_casting",
        open_call_link_id: linkOneId,
      }),
    );

    const applied = (await db("knex_migrations").orderBy("id", "asc")).map(
      (row) => row.name,
    );
    const firstEventCasting = applied.findIndex((name) =>
      name.startsWith("20260815090000_event_casting_application_statuses"),
    );
    expect(firstEventCasting).toBeGreaterThan(-1);
    steps = applied.length - firstEventCasting;
    expect(steps).toBeGreaterThanOrEqual(5);

    for (let step = 0; step < steps; step += 1) await db.migrate.down();

    // The regression: knex implements a SQLite column drop as
    // create-copy-drop-rename and guards it with `PRAGMA foreign_keys = OFF`,
    // which SQLite ignores inside a transaction. With these migrations left
    // transactional, dropping `agencies.org_kind` cascaded through
    // `applications.agency_id` and emptied the table.
    const survivor = await db("applications").where({ id: survivorId }).first();
    expect(survivor).toBeDefined();
    // Lossy by design: a confirmation collapses back to the offer behind it.
    expect(survivor.status).toBe("accepted");
    expect("call_purpose" in survivor).toBe(false);

    expect(await db.schema.hasColumn("agencies", "org_kind")).toBe(false);
    expect(await db.schema.hasTable("event_pick_lists")).toBe(false);
    expect(await indexNames("applications")).toContain(
      "applications_profile_id_agency_id_unique",
    );
  }, 60000);

  test("and re-applies cleanly", async () => {
    const [, log] = await db.migrate.latest();
    expect(log).toHaveLength(steps);

    const survivor = await db("applications").where({ id: survivorId }).first();
    expect(survivor.call_purpose).toBe("representation");
    expect(await db.schema.hasTable("event_casting_funnel_events")).toBe(true);
  }, 60000);
});

afterAll(async () => {
  await db.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("status constant drift guard (ruling R2)", () => {
  test("M1 builds its CHECK from the canonical constant", () => {
    expect(statusMigration.STATUS_CHECK_ALLOWED).toEqual([...ALL_APPLICATION_STATUSES]);
  });

  test("the CHECK list covers both new statuses", () => {
    expect(statusMigration.STATUS_CHECK_ALLOWED).toEqual(
      expect.arrayContaining(["confirmed", "declined_by_talent"]),
    );
  });

  test("the CHECK list never narrows", () => {
    // The real guard. M1 generates its list from the constants module, so
    // comparing the two would be circular; the honest baseline is the list the
    // *previous* status migration froze as a literal. Drop a status from the
    // constants and a fresh database silently starts rejecting rows that
    // production still holds — this is what catches that.
    const previousSource = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "migrations",
        "20260814120000_application_auto_close.js",
      ),
      "utf8",
    );
    const literal = previousSource.slice(
      previousSource.indexOf("const ALLOWED = ["),
      previousSource.indexOf("];", previousSource.indexOf("const ALLOWED = [")),
    );
    const previous = (literal.match(/"([a-z_]+)"/g) || []).map((raw) => raw.slice(1, -1));
    expect(previous).toHaveLength(14);

    expect(new Set(statusMigration.STATUS_CHECK_ALLOWED)).toEqual(
      new Set([...previous, "confirmed", "declined_by_talent"]),
    );
  });

  test("the down list is exactly the prior vocabulary", () => {
    expect(new Set(statusMigration.STATUS_CHECK_PRIOR)).toEqual(
      new Set(
        ALL_APPLICATION_STATUSES.filter(
          (status) => !TALENT_WRITABLE_APPLICATION_STATUSES.includes(status),
        ),
      ),
    );
  });
});

describe("event casting constants", () => {
  test("the new statuses are talent-written only", () => {
    expect(TALENT_WRITABLE_APPLICATION_STATUSES).toEqual([
      "confirmed",
      "declined_by_talent",
    ]);
    for (const status of TALENT_WRITABLE_APPLICATION_STATUSES) {
      expect(WRITABLE_APPLICATION_STATUSES).not.toContain(status);
      expect(AWAITING_AGENCY_APPLICATION_STATUSES).not.toContain(status);
    }
  });

  test("the withdrawable set is untouched by the new statuses", () => {
    // Owned by Lane B (`routes/applications.js:122`); asserted here because
    // design §(c) requires the exclusion and Lane 0 must not edit that file.
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "src",
        "domains",
        "talent",
        "routes",
        "applications.js",
      ),
      "utf8",
    );
    const block = source.slice(
      source.indexOf("const WITHDRAWABLE_STATUSES"),
      source.indexOf("]);", source.indexOf("const WITHDRAWABLE_STATUSES")),
    );
    expect(block).not.toMatch(/confirmed|declined_by_talent/);
  });

  test("call kinds, compensation, marks and pick list statuses", () => {
    expect(Object.values(CALL_KINDS)).toEqual(["representation", "event_casting"]);
    expect(Object.values(COMPENSATION_TYPES)).toEqual(["paid", "unpaid", "stipend"]);
    expect(Object.values(PICK_MARKS)).toEqual(["pick", "maybe", "pass"]);
    expect(Object.values(PICK_LIST_STATUSES)).toEqual([
      "draft",
      "open",
      "closed",
      "revoked",
    ]);
  });

  test("the eight funnel event types from design (g), plus the four claim-flow types", () => {
    expect(Object.values(FUNNEL_EVENT_TYPES)).toEqual([
      "call_viewed",
      "application_started",
      "application_completed",
      "intake_blocked",
      "profile_completed_at_submit",
      "payoff_viewed",
      "second_recipient_submitted",
      "returned_d30",
      // Applicant-flow additions (open-call design 8 step 7): the receipt/claim
      // funnel that stitches an anonymous submission to a claimed profile.
      "claim_sent",
      "claimed",
      "materials_requested",
      "materials_fulfilled",
    ]);
  });

  test("link ceilings follow ruling R6", () => {
    expect(MAX_LINKS_BY_ORG_KIND).toEqual({ agency: 20, event_organizer: 60 });
    expect(maxOpenCallLinksForOrgKind("event_organizer")).toBe(60);
    expect(maxOpenCallLinksForOrgKind("agency")).toBe(20);
    // Unknown kinds fall back to the stricter ceiling rather than to undefined.
    expect(maxOpenCallLinksForOrgKind(null)).toBe(20);
    expect(maxOpenCallLinksForOrgKind("nonsense")).toBe(20);
  });
});
