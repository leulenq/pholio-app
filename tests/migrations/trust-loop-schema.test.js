"use strict";

/**
 * Lane 0 contract test for the talent trust loop schema
 * (`docs/talent-trust-loop-design-2026-08.md` §(a) M1–M4, §(e), rulings
 * R1/R2/R4/R5).
 *
 * Every later lane builds against the column names, the three status strings,
 * the channel vocabulary and the ISO weekday constant asserted here, so this
 * suite is the thing that has to fail first if any of them move.
 *
 * Like `event-casting-schema.test.js` it migrates a throwaway SQLite file all
 * the way to latest rather than calling `up()` in isolation — the interesting
 * failures are ordering failures, and those only appear in a real run. The one
 * exception is M4, a data migration that necessarily found nothing to convert
 * on an unseeded database: its fixtures are built after the run and `up()` is
 * driven directly, which is also the only way to assert the down/up round trip
 * of a conversion without rolling three table creations back with it.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const esbuild = require("esbuild");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("trust-loop-schema");
const db = require("../../src/shared/db/knex");

const conversion = require("../../migrations/20260815103000_reference_agency_conversion");

const serverConstants = require("../../src/shared/constants/submission-tracker");
const {
  DEFAULT_TRACKER_WINDOW_DAYS,
  ISO_WEEKDAYS,
  REAPPLY_CONVENTION_MONTHS,
  TRACKER_CHANNELS,
  TRACKER_STATUSES,
  VERIFICATION_REGISTRIES,
  isIsoWeekday,
  isTrackerStatus,
  isoWeekdayFromDate,
} = serverConstants;

const {
  DEFAULT_REVIEW_WINDOW_DAYS,
} = require("../../src/shared/lib/application-auto-close");

const uuid = () => crypto.randomUUID();

const profileId = uuid();

async function insertProfile(id, slug) {
  const userId = uuid();
  await db("users").insert({ id: userId, email: `${slug}@example.test`, role: "TALENT" });
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

async function columnInfo(table) {
  const rows = await db.raw(`PRAGMA table_info('${table}')`);
  return new Map(rows.map((row) => [row.name, row]));
}

async function indexNames(table) {
  const rows = await db("sqlite_master")
    .select("name")
    .where({ type: "index", tbl_name: table });
  return rows.map((row) => row.name);
}

async function foreignKeys(table) {
  const rows = await db.raw(`PRAGMA foreign_key_list('${table}')`);
  return new Map(rows.map((row) => [row.from, row]));
}

/** Compile the browser ESM mirror into something jest can require. */
function loadBrowserMirror() {
  const entry = path.resolve(
    __dirname,
    "../../client/src/shared/constants/submissionTracker.js",
  );
  const outfile = path.join(os.tmpdir(), `submission-tracker.${Date.now()}.cjs`);
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile,
    logLevel: "silent",
  });
  const mirror = require(outfile);
  fs.unlinkSync(outfile);
  return mirror;
}

describe("trust loop schema (migrations M1–M3)", () => {
  beforeAll(async () => {
    await migrate(db);
    await insertProfile(profileId, "trust-loop-talent");
  }, 120000);

  describe("M1 off_platform_submissions", () => {
    test("carries every column from design (a) M1", async () => {
      const columns = await columnInfo("off_platform_submissions");
      expect([...columns.keys()].sort()).toEqual([
        "agency_name",
        "channel",
        "created_at",
        "destination_url",
        "id",
        "note",
        "outcome_note",
        "profile_id",
        "review_window_days",
        "sent_summary",
        "series_id",
        "status",
        "status_changed_at",
        "submitted_on",
        "updated_at",
      ]);
    });

    test("nullability matches the design", async () => {
      const columns = await columnInfo("off_platform_submissions");
      // `id` is asserted as the primary key instead: SQLite reports a non-
      // INTEGER primary key column as notnull=0 even though it rejects NULLs.
      expect(columns.get("id").pk).toBe(1);
      const required = [
        "profile_id",
        "agency_name",
        "channel",
        "submitted_on",
        "status",
        "review_window_days",
        "status_changed_at",
        "created_at",
        "updated_at",
      ];
      for (const name of required) {
        expect(`${name}:${columns.get(name).notnull}`).toBe(`${name}:1`);
      }
      // Optional by design: a hand-logged row knows only a name and a date.
      for (const name of [
        "series_id",
        "destination_url",
        "sent_summary",
        "note",
        "outcome_note",
      ]) {
        expect(`${name}:${columns.get(name).notnull}`).toBe(`${name}:0`);
      }
    });

    test("defaults are the tracker constants", async () => {
      const id = uuid();
      await db("off_platform_submissions").insert({
        id,
        profile_id: profileId,
        agency_name: "An Agency With No Spec",
        submitted_on: "2026-08-01",
      });
      const row = await db("off_platform_submissions").where({ id }).first();
      expect(row.status).toBe("awaiting");
      expect(row.channel).toBe("official_web_form");
      expect(row.review_window_days).toBe(DEFAULT_TRACKER_WINDOW_DAYS);
      expect(row.status_changed_at).toBeTruthy();
      expect(row.series_id).toBeNull();
      expect(row.sent_summary).toBeNull();
    });

    test("no lapse column exists — ruling R1 computes it at display time", async () => {
      const columns = await columnInfo("off_platform_submissions");
      for (const name of [...columns.keys()]) {
        expect(name).not.toMatch(/laps|reapply|re_apply/i);
      }
    });

    test("sent_summary round-trips a JSON payload (ruling R2)", async () => {
      const id = uuid();
      const summary = { revisionId: "wilhelmina:selected-market-online--r1", fileCount: 4, exportEventId: uuid() };
      await db("off_platform_submissions").insert({
        id,
        profile_id: profileId,
        agency_name: "Wilhelmina Models",
        submitted_on: "2026-08-02",
        sent_summary: JSON.stringify(summary),
      });
      const row = await db("off_platform_submissions").where({ id }).first();
      expect(JSON.parse(row.sent_summary)).toEqual(summary);
    });

    test("both design indexes exist", async () => {
      expect(await indexNames("off_platform_submissions")).toEqual(
        expect.arrayContaining([
          "idx_off_platform_profile_date",
          "idx_off_platform_profile_status",
        ]),
      );
    });

    test("foreign keys cascade from the profile and release the series", async () => {
      const keys = await foreignKeys("off_platform_submissions");
      expect(keys.get("profile_id").table).toBe("profiles");
      expect(keys.get("profile_id").on_delete).toBe("CASCADE");
      // A delisted series must not take the talent's own record with it.
      expect(keys.get("series_id").table).toBe("spec_registry_series");
      expect(keys.get("series_id").on_delete).toBe("SET NULL");
    });
  });

  describe("M2 agency_verifications", () => {
    test("carries every column from design (a) M2", async () => {
      const columns = await columnInfo("agency_verifications");
      expect([...columns.keys()].sort()).toEqual([
        "agency_id",
        "certificate_number",
        "created_at",
        "dba",
        "evidence_url",
        "expires_on",
        "id",
        "legal_name",
        "notes",
        "official_apply_url",
        "official_site_url",
        "organization_id",
        "registered_on",
        "registry",
        "registry_status",
        "retrieved_on",
        "updated_at",
        "verified_on",
      ]);
    });

    test("both owner columns are nullable — the populations are disjoint", async () => {
      const columns = await columnInfo("agency_verifications");
      expect(columns.get("organization_id").notnull).toBe(0);
      expect(columns.get("agency_id").notnull).toBe(0);
      // The claim itself is not optional.
      for (const name of [
        "registry",
        "legal_name",
        "certificate_number",
        "registry_status",
        "retrieved_on",
        "verified_on",
      ]) {
        expect(`${name}:${columns.get(name).notnull}`).toBe(`${name}:1`);
      }
    });

    test("registry_status defaults to active", async () => {
      const id = uuid();
      await db("agency_verifications").insert({
        id,
        registry: VERIFICATION_REGISTRIES[0],
        organization_id: "wilhelmina",
        legal_name: "Wilhelmina International, Ltd.",
        certificate_number: "TEST-0001",
        retrieved_on: "2026-08-15",
        verified_on: "2026-08-15",
      });
      const row = await db("agency_verifications").where({ id }).first();
      expect(row.registry_status).toBe("active");
      expect(row.agency_id).toBeNull();
    });

    test("(registry, certificate_number) is unique — the sync upsert key", async () => {
      expect(await indexNames("agency_verifications")).toContain(
        "uq_agency_verifications_registry_certificate",
      );
      await expect(
        db("agency_verifications").insert({
          id: uuid(),
          registry: VERIFICATION_REGISTRIES[0],
          organization_id: "someone-else",
          legal_name: "A Different Company",
          certificate_number: "TEST-0001",
          retrieved_on: "2026-08-15",
          verified_on: "2026-08-15",
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    test("the same certificate number in another registry is allowed", async () => {
      await expect(
        db("agency_verifications").insert({
          id: uuid(),
          registry: "other_registry",
          organization_id: "wilhelmina",
          legal_name: "Wilhelmina International, Ltd.",
          certificate_number: "TEST-0001",
          retrieved_on: "2026-08-15",
          verified_on: "2026-08-15",
        }),
      ).resolves.toBeDefined();
    });

    test("both design indexes exist", async () => {
      expect(await indexNames("agency_verifications")).toEqual(
        expect.arrayContaining([
          "idx_agency_verifications_agency",
          "idx_agency_verifications_organization",
        ]),
      );
    });

    test("a removed agency does not delete its verification", async () => {
      const keys = await foreignKeys("agency_verifications");
      expect(keys.get("agency_id").table).toBe("agencies");
      expect(keys.get("agency_id").on_delete).toBe("SET NULL");
    });
  });

  describe("M3 agency_call_windows", () => {
    test("carries every column from design (a) M3", async () => {
      const columns = await columnInfo("agency_call_windows");
      expect([...columns.keys()].sort()).toEqual([
        "active",
        "agency_id",
        "created_at",
        "display_name",
        "end_minute",
        "id",
        "instructions",
        "label",
        "location",
        "organization_id",
        "source_url",
        "start_minute",
        "timezone",
        "updated_at",
        "verified_on",
        "weekday",
      ]);
    });

    test("a day-without-a-time window is representable", async () => {
      // MSA publishes "Tuesdays" and no hour. Refusing that row would mean
      // dropping a true fact rather than showing a partial one.
      const id = uuid();
      await db("agency_call_windows").insert({
        id,
        organization_id: "msa-models",
        display_name: "MSA Models",
        label: "Walk-in open call",
        weekday: ISO_WEEKDAYS.TUESDAY,
        verified_on: "2026-08-15",
      });
      const row = await db("agency_call_windows").where({ id }).first();
      expect(row.start_minute).toBeNull();
      expect(row.end_minute).toBeNull();
      expect(row.timezone).toBe("America/New_York");
      expect(Boolean(row.active)).toBe(true);
      expect(isIsoWeekday(row.weekday)).toBe(true);
    });

    test("weekday is ISO — Thursday is 4, not 3", async () => {
      const id = uuid();
      await db("agency_call_windows").insert({
        id,
        organization_id: "muse-management",
        display_name: "Muse Management",
        label: "Walk-in open call",
        weekday: ISO_WEEKDAYS.THURSDAY,
        start_minute: 15 * 60,
        end_minute: 16 * 60,
        verified_on: "2026-08-15",
      });
      const row = await db("agency_call_windows").where({ id }).first();
      expect(row.weekday).toBe(4);
      expect(row.start_minute).toBe(900);
      expect(row.end_minute).toBe(960);
    });

    test("all three design indexes exist", async () => {
      expect(await indexNames("agency_call_windows")).toEqual(
        expect.arrayContaining([
          "idx_agency_call_windows_organization",
          "idx_agency_call_windows_agency",
          "idx_agency_call_windows_active_weekday",
        ]),
      );
    });

    test("required fields are the ones a card cannot render without", async () => {
      const columns = await columnInfo("agency_call_windows");
      for (const name of [
        "display_name",
        "label",
        "weekday",
        "timezone",
        "verified_on",
        "active",
      ]) {
        expect(`${name}:${columns.get(name).notnull}`).toBe(`${name}:1`);
      }
    });
  });

  describe("re-running migrations", () => {
    test("migrate.latest is a no-op the second time", async () => {
      const [, log] = await db.migrate.latest();
      expect(log).toEqual([]);
    });
  });
});

describe("M4 reference agency conversion (ruling R5)", () => {
  const wilhelminaId = uuid();
  const liveNamesakeId = uuid();
  const unrelatedId = uuid();
  const seriesId = "wilhelmina:selected-market-online";

  beforeAll(async () => {
    // The migration ran during `migrate()` against an unseeded database and
    // correctly found nothing. Rebuild the seeded shape here and drive it.
    await db("spec_registry_series").insert({
      series_id: seriesId,
      organization_key: "wilhelmina",
    });
    await db("agencies").insert([
      { id: wilhelminaId, name: "Wilhelmina Models", status: "ACTIVE" },
      { id: liveNamesakeId, name: "IMG Models", status: "ACTIVE" },
      { id: unrelatedId, name: "Lumen Model Management", status: "ACTIVE" },
    ]);
    await db("spec_registry_agency_routes").insert({
      agency_id: wilhelminaId,
      series_id: seriesId,
      priority: 100,
    });

    // A namesake that is a real Pholio account: it has a member.
    const memberUserId = uuid();
    await db("users").insert({
      id: memberUserId,
      email: "member@example.test",
      role: "AGENCY",
    });
    await db("agency_memberships").insert({
      id: uuid(),
      agency_id: liveNamesakeId,
      user_id: memberUserId,
      membership_role: "OWNER",
      status: "ACTIVE",
    });
  }, 30000);

  test("the seeded names and the five seeded routes are frozen in the migration", () => {
    expect(conversion.REFERENCE_AGENCY_NAMES).toHaveLength(8);
    expect(conversion.REFERENCE_AGENCY_NAMES).toEqual(
      expect.arrayContaining([
        "Wilhelmina Models",
        "IMG Models",
        "Elite Model Management",
        "Ford Models",
        "DNA Model Management",
        "The Society Management",
        "Next Management",
        "Marilyn Agency",
      ]),
    );
    expect(conversion.SEEDED_ROUTES).toHaveLength(5);
    expect(conversion.SEEDED_ROUTES.map(([, series]) => series)).toEqual([
      "wilhelmina:selected-market-online",
      "img-models-global:online",
      "elite-model-management-global:online",
      "ford-models:selected-city-online",
      "the-society-management-nyc:online",
    ]);
  });

  test("up() converts the seeded agency and drops its route", async () => {
    await conversion.up(db);

    const wilhelmina = await db("agencies").where({ id: wilhelminaId }).first();
    expect(wilhelmina.status).toBe("REFERENCE");

    // Deliverability is derived from ACTIVE + a route row; both are now gone.
    const routes = await db("spec_registry_agency_routes")
      .where({ agency_id: wilhelminaId })
      .select("series_id");
    expect(routes).toEqual([]);
  });

  test("an agency with members is never demoted, whatever it is called", async () => {
    const namesake = await db("agencies").where({ id: liveNamesakeId }).first();
    expect(namesake.status).toBe("ACTIVE");
  });

  test("agencies outside the seeded list are untouched", async () => {
    const unrelated = await db("agencies").where({ id: unrelatedId }).first();
    expect(unrelated.status).toBe("ACTIVE");
  });

  test("up() is idempotent", async () => {
    await expect(conversion.up(db)).resolves.toBeUndefined();
    const wilhelmina = await db("agencies").where({ id: wilhelminaId }).first();
    expect(wilhelmina.status).toBe("REFERENCE");
  });

  test("down() restores ACTIVE and re-inserts the mapping", async () => {
    await conversion.down(db);

    const wilhelmina = await db("agencies").where({ id: wilhelminaId }).first();
    expect(wilhelmina.status).toBe("ACTIVE");

    const routes = await db("spec_registry_agency_routes")
      .where({ agency_id: wilhelminaId })
      .select("series_id");
    expect(routes.map((row) => row.series_id)).toEqual([seriesId]);
  });

  test("down() only re-inserts mappings whose series still exists", async () => {
    // Four of the five seeded series were never published into this database;
    // re-inserting them would violate the route table's series FK.
    const all = await db("spec_registry_agency_routes").select("series_id");
    expect(all.map((row) => row.series_id)).toEqual([seriesId]);
  });

  test("down() is idempotent and does not duplicate the mapping", async () => {
    await conversion.up(db);
    await conversion.down(db);
    await conversion.down(db);
    const routes = await db("spec_registry_agency_routes")
      .where({ agency_id: wilhelminaId })
      .select("series_id");
    expect(routes).toHaveLength(1);
  });

  test("up() on a database with no seeded agencies is a silent no-op", async () => {
    await db("spec_registry_agency_routes").del();
    await db("agencies").whereIn("id", [wilhelminaId, liveNamesakeId]).update({
      name: "Renamed Away",
    });
    await expect(conversion.up(db)).resolves.toBeUndefined();
    await expect(conversion.down(db)).resolves.toBeUndefined();
  });
});

/**
 * Runs last: it takes the schema down and back up, so nothing may depend on it
 * having finished in the state it started.
 */
describe("rolling M1–M4 back", () => {
  test("rollback drops the three tables", async () => {
    for (let step = 0; step < 4; step += 1) await db.migrate.down();

    expect(await db.schema.hasTable("off_platform_submissions")).toBe(false);
    expect(await db.schema.hasTable("agency_verifications")).toBe(false);
    expect(await db.schema.hasTable("agency_call_windows")).toBe(false);
    // The rollback must not have taken unrelated rows with it: these are plain
    // DROP TABLEs and one UPDATE, not the SQLite table rebuild that emptied
    // `applications` in the event-casting lane.
    expect(await db("profiles").where({ id: profileId }).first()).toBeDefined();
  }, 60000);

  test("and re-applies cleanly", async () => {
    const [, log] = await db.migrate.latest();
    expect(log).toHaveLength(4);
    expect(await db.schema.hasTable("off_platform_submissions")).toBe(true);
    expect(await db.schema.hasTable("agency_verifications")).toBe(true);
    expect(await db.schema.hasTable("agency_call_windows")).toBe(true);
  }, 60000);
});

afterAll(async () => {
  await db.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("submission tracker constants", () => {
  test("the three tracker statuses, in order, with no lapse member", () => {
    expect(TRACKER_STATUSES).toEqual(["awaiting", "heard_back", "closed_by_talent"]);
    expect(TRACKER_STATUSES).not.toContain("lapsed");
    expect(isTrackerStatus("HEARD_BACK")).toBe(true);
    expect(isTrackerStatus("lapsed")).toBe(false);
  });

  test("the convention windows match the design", () => {
    expect(DEFAULT_TRACKER_WINDOW_DAYS).toBe(30);
    expect(REAPPLY_CONVENTION_MONTHS).toBe(6);
  });

  test("the tracker window matches the on-Pholio auto-close window", () => {
    // The merged ledger shows both kinds of row on one chronology; two
    // different "no answer means no" clocks would read as a bug.
    expect(DEFAULT_TRACKER_WINDOW_DAYS).toBe(DEFAULT_REVIEW_WINDOW_DAYS);
  });

  test("channels are the spec-pack vocabulary minus pholio_open_call, plus other", () => {
    const schema = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "..",
          "data",
          "spec-registry",
          "v1",
          "schemas",
          "spec-revision.schema.json",
        ),
        "utf8",
      ),
    );
    const packChannels =
      schema.$defs.scope.properties.channel.properties.type.enum;

    expect(TRACKER_CHANNELS).toEqual([
      "official_web_form",
      "official_email",
      "official_walk_in",
      "agency_branded_third_party_form",
      "other",
    ]);
    // A submission through Pholio's own intake link is an `applications` row.
    expect(TRACKER_CHANNELS).not.toContain("pholio_open_call");
    for (const channel of packChannels) {
      if (channel === "pholio_open_call") continue;
      expect(TRACKER_CHANNELS).toContain(channel);
    }
  });

  test("the registry vocabulary is closed to what a snapshot exists for", () => {
    expect(VERIFICATION_REGISTRIES).toEqual(["ny_dol"]);
  });

  test("ISO weekdays are 1=Monday..7=Sunday, not getDay()", () => {
    expect(ISO_WEEKDAYS).toEqual({
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    });
    // 2026-08-16 is a Sunday. getDay() says 0; ISO says 7.
    const sunday = new Date(2026, 7, 16);
    expect(sunday.getDay()).toBe(0);
    expect(isoWeekdayFromDate(sunday)).toBe(7);
    expect(isoWeekdayFromDate(new Date(2026, 7, 13))).toBe(ISO_WEEKDAYS.THURSDAY);
    expect(isIsoWeekday(0)).toBe(false);
    expect(isIsoWeekday(8)).toBe(false);
  });
});

describe("server / client constant parity", () => {
  const client = loadBrowserMirror();

  test("every shared vocabulary is byte-identical", () => {
    for (const key of [
      "TRACKER_STATUSES",
      "TRACKER_STATUS",
      "TRACKER_CHANNELS",
      "VERIFICATION_REGISTRIES",
      "VERIFICATION_REGISTRY_STATUSES",
      "ISO_WEEKDAYS",
      "ISO_WEEKDAY_VALUES",
    ]) {
      expect(`${key}:${JSON.stringify(client[key])}`).toBe(
        `${key}:${JSON.stringify(serverConstants[key])}`,
      );
    }
  });

  test("every shared scalar is identical", () => {
    for (const key of [
      "DEFAULT_TRACKER_STATUS",
      "DEFAULT_TRACKER_CHANNEL",
      "DEFAULT_TRACKER_WINDOW_DAYS",
      "DEFAULT_VERIFICATION_REGISTRY_STATUS",
      "DEFAULT_CALL_WINDOW_TIMEZONE",
      "REAPPLY_CONVENTION_MONTHS",
    ]) {
      expect(`${key}:${client[key]}`).toBe(`${key}:${serverConstants[key]}`);
    }
  });

  test("the mirror's predicates agree with the server's", () => {
    for (const value of [...TRACKER_STATUSES, "lapsed", "", null]) {
      expect(client.isTrackerStatus(value)).toBe(serverConstants.isTrackerStatus(value));
    }
    for (const value of [...TRACKER_CHANNELS, "pholio_open_call", null]) {
      expect(client.isTrackerChannel(value)).toBe(
        serverConstants.isTrackerChannel(value),
      );
    }
    for (const value of ["ny_dol", "NY_DOL", "ca_dol", null]) {
      expect(client.isVerificationRegistry(value)).toBe(
        serverConstants.isVerificationRegistry(value),
      );
    }
    for (const value of [0, 1, 4, 7, 8, 1.5]) {
      expect(client.isIsoWeekday(value)).toBe(serverConstants.isIsoWeekday(value));
    }
    expect(client.isoWeekdayFromDate(new Date(2026, 7, 16))).toBe(7);
  });

  test("the mirror exports nothing the server does not", () => {
    for (const key of Object.keys(client)) {
      expect(`${key}:${key in serverConstants}`).toBe(`${key}:true`);
    }
  });
});
