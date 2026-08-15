"use strict";

/**
 * Derivation-matrix unit tests for WS6.1 (representation_status) and WS6.2
 * (adult-only tattoos/piercings), plus a batch-loader contract test against
 * an ephemeral in-memory sqlite DB (never the shared `shared/db/knex`
 * instance — passed in via `{ db }` so this stays isolated).
 *
 * Council review reference: tasks/discover-search-council-review.md LB-5.
 */

const knexLib = require("knex");
const {
  deriveRepresentationStatus,
  loadTalentRepresentationsForProfiles,
  buildAgencyDiscoveryDTO,
  AGENCY_DISCOVERY_FIELDS,
} = require("../../src/shared/lib/audience-dto");

function baseProfile(overrides = {}) {
  return {
    id: "profile-1",
    first_name: "Jane",
    last_name: "Doe",
    date_of_birth: "1998-05-15", // adult
    seeking_representation: false,
    current_agency: null,
    tattoos: "small script on wrist",
    piercings: "ears",
    ...overrides,
  };
}

describe("deriveRepresentationStatus (pure derivation matrix)", () => {
  test("exclusive_elsewhere: any active representation with is_exclusive=true", () => {
    const result = deriveRepresentationStatus(baseProfile(), [
      { status: "active", is_exclusive: true, external_agency_name: "Rival Co" },
    ]);
    expect(result).toEqual({
      representation_status: "exclusive_elsewhere",
      represented_by: null,
    });
  });

  test("represented + disclosed: names the agency (external name preferred)", () => {
    const result = deriveRepresentationStatus(baseProfile(), [
      {
        status: "active",
        is_exclusive: false,
        disclose_agency_name: true,
        external_agency_name: "Elite Model Management",
        agency_name: "Should not win",
      },
    ]);
    expect(result).toEqual({
      representation_status: "represented",
      represented_by: "Elite Model Management",
    });
  });

  test("represented + disclosed: falls back to joined agency_name when no external name", () => {
    const result = deriveRepresentationStatus(baseProfile(), [
      {
        status: "active",
        is_exclusive: false,
        disclose_agency_name: true,
        agency_id: "agency-1",
        external_agency_name: null,
        agency_name: "In-House Agency",
      },
    ]);
    expect(result.representation_status).toBe("represented");
    expect(result.represented_by).toBe("In-House Agency");
  });

  test("represented + undisclosed: disclose_agency_name false hides the name", () => {
    const result = deriveRepresentationStatus(baseProfile(), [
      {
        status: "active",
        is_exclusive: false,
        disclose_agency_name: false,
        external_agency_name: "Secret Agency",
      },
    ]);
    expect(result).toEqual({
      representation_status: "represented",
      represented_by: "undisclosed",
    });
  });

  test("represented + missing disclose_agency_name column data defaults to undisclosed", () => {
    // Deploy-before-migrate: loader shapes missing column to `false`, but a
    // caller could hand rows without the key at all — must still fail closed.
    const result = deriveRepresentationStatus(baseProfile(), [
      { status: "active", is_exclusive: false, external_agency_name: "X Agency" },
    ]);
    expect(result.represented_by).toBe("undisclosed");
  });

  test("seeking: no active representations and seeking_representation truthy", () => {
    const result = deriveRepresentationStatus(
      baseProfile({ seeking_representation: true }),
      [],
    );
    expect(result).toEqual({
      representation_status: "seeking",
      represented_by: null,
    });
  });

  test("seeking: ended-only representations still count as 'no active' for seeking", () => {
    const result = deriveRepresentationStatus(
      baseProfile({ seeking_representation: true }),
      [{ status: "ended", is_exclusive: true, external_agency_name: "Old Agency" }],
    );
    expect(result.representation_status).toBe("seeking");
  });

  test("unrepresented: no representations, not seeking, no legacy current_agency", () => {
    const result = deriveRepresentationStatus(baseProfile(), []);
    expect(result).toEqual({
      representation_status: "unrepresented",
      represented_by: null,
    });
  });

  test("legacy fallback: no talent_representations rows but current_agency is set", () => {
    const result = deriveRepresentationStatus(
      baseProfile({ current_agency: "Legacy Agency Name" }),
      [],
    );
    expect(result).toEqual({
      representation_status: "represented",
      represented_by: "undisclosed",
    });
  });

  test("legacy fallback does NOT fire when representation rows exist (even if all ended)", () => {
    const result = deriveRepresentationStatus(
      baseProfile({ current_agency: "Stale Legacy Name" }),
      [{ status: "ended", is_exclusive: false }],
    );
    // Real (if ended) rows exist, so the legacy free-text column is stale —
    // must not be resurrected as "represented".
    expect(result.representation_status).toBe("unrepresented");
  });

  test("legacy fallback is skipped when current_agency is blank/whitespace", () => {
    const result = deriveRepresentationStatus(
      baseProfile({ current_agency: "   " }),
      [],
    );
    expect(result.representation_status).toBe("unrepresented");
  });

  test("exclusive takes precedence over a simultaneous disclosed represented row", () => {
    const result = deriveRepresentationStatus(baseProfile(), [
      {
        status: "active",
        is_exclusive: false,
        disclose_agency_name: true,
        external_agency_name: "Placement Agency",
      },
      {
        status: "active",
        is_exclusive: true,
        external_agency_name: "Exclusive Mother Agency",
      },
    ]);
    expect(result.representation_status).toBe("exclusive_elsewhere");
  });

  test("a row with status=null is treated defensively as active", () => {
    const result = deriveRepresentationStatus(baseProfile(), [
      { status: null, is_exclusive: false, disclose_agency_name: true, external_agency_name: "No Status Co" },
    ]);
    expect(result.representation_status).toBe("represented");
    expect(result.represented_by).toBe("No Status Co");
  });
});

describe("buildAgencyDiscoveryDTO — representation_status + tattoos/piercings gating", () => {
  test("adult profile surfaces tattoos/piercings and the derived representation fields", () => {
    const dto = buildAgencyDiscoveryDTO(baseProfile(), {
      images: [],
      representations: [
        {
          status: "active",
          is_exclusive: false,
          disclose_agency_name: true,
          external_agency_name: "Elite Model Management",
        },
      ],
    });

    expect(dto.tattoos).toBe("small script on wrist");
    expect(dto.piercings).toBe("ears");
    expect(dto.representation_status).toBe("represented");
    expect(dto.represented_by).toBe("Elite Model Management");
  });

  test("minor profile never exposes tattoos/piercings even when the columns are populated", () => {
    const minor = baseProfile({ date_of_birth: "2012-05-15" }); // under 18
    const dto = buildAgencyDiscoveryDTO(minor, { images: [] });

    expect(dto.is_minor).toBe(true);
    expect(dto.tattoos).toBeNull();
    expect(dto.piercings).toBeNull();
    // Minor gate on social must still hold too (regression guard).
    expect(dto.social).toEqual([]);
  });

  test("AGENCY_DISCOVERY_FIELDS allowlist includes the new WS6 raw columns", () => {
    expect(AGENCY_DISCOVERY_FIELDS).toContain("tattoos");
    expect(AGENCY_DISCOVERY_FIELDS).toContain("piercings");
    expect(AGENCY_DISCOVERY_FIELDS).toContain("measurements_updated_at");
  });

  test("AGENCY_DISCOVERY_FIELDS drops measured_in_person_at — it has no writer", () => {
    // The roster endpoint that set `measured_in_person_at` was removed with
    // roster-as-system-of-record. Exposing a column nothing can ever populate
    // makes every DTO carry a field that is always null, so it is gone from the
    // allowlist rather than left as permanent dead weight.
    expect(AGENCY_DISCOVERY_FIELDS).not.toContain("measured_in_person_at");
  });

  test("defaults to unrepresented when no representations opt is passed and no legacy agency", () => {
    const dto = buildAgencyDiscoveryDTO(baseProfile(), { images: [] });
    expect(dto.representation_status).toBe("unrepresented");
    expect(dto.represented_by).toBeNull();
  });
});

describe("loadTalentRepresentationsForProfiles (batch loader, ephemeral sqlite)", () => {
  let db;

  beforeAll(async () => {
    db = knexLib({ client: "sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });

    await db.schema.createTable("agencies", (t) => {
      t.string("id", 36).primary();
      t.string("name", 200).nullable();
    });

    await db.schema.createTable("talent_representations", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).notNullable();
      t.string("agency_id", 36).nullable();
      t.string("external_agency_name", 160).nullable();
      t.string("relationship_type", 20).notNullable();
      t.boolean("is_exclusive").notNullable().defaultTo(false);
      t.string("status", 20).notNullable().defaultTo("active");
      t.boolean("disclose_agency_name").notNullable().defaultTo(false);
    });

    await db("agencies").insert({ id: "agency-1", name: "In-House Agency" });
    await db("talent_representations").insert([
      {
        id: "rep-1",
        profile_id: "profile-a",
        agency_id: "agency-1",
        relationship_type: "mother",
        is_exclusive: true,
        status: "active",
        disclose_agency_name: true,
      },
      {
        id: "rep-2",
        profile_id: "profile-b",
        agency_id: null,
        external_agency_name: "Freelance Co",
        relationship_type: "placement",
        is_exclusive: false,
        status: "ended",
        disclose_agency_name: false,
      },
    ]);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("batch-loads rows for many profiles in one query, grouped by profile_id", async () => {
    const byProfile = await loadTalentRepresentationsForProfiles(
      ["profile-a", "profile-b", "profile-missing"],
      { db },
    );

    expect(byProfile.size).toBe(2);
    expect(byProfile.get("profile-a")).toHaveLength(1);
    expect(byProfile.get("profile-a")[0].agency_name).toBe("In-House Agency");
    expect(byProfile.get("profile-b")).toHaveLength(1);
    expect(byProfile.get("profile-missing")).toBeUndefined();
  });

  test("feeds deriveRepresentationStatus correctly end-to-end for a batch-loaded profile", async () => {
    const byProfile = await loadTalentRepresentationsForProfiles(["profile-a"], { db });
    const result = deriveRepresentationStatus(
      baseProfile({ id: "profile-a" }),
      byProfile.get("profile-a"),
    );
    expect(result.representation_status).toBe("exclusive_elsewhere");
  });

  test("returns an empty Map without querying when given no profile ids", async () => {
    const byProfile = await loadTalentRepresentationsForProfiles([], { db });
    expect(byProfile.size).toBe(0);
  });

  test("degrades to an empty Map (no throw) when talent_representations does not exist", async () => {
    const emptyDb = knexLib({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    const byProfile = await loadTalentRepresentationsForProfiles(["profile-a"], {
      db: emptyDb,
    });
    expect(byProfile.size).toBe(0);
    await emptyDb.destroy();
  });

  test("degrades disclose_agency_name to false when the column doesn't exist yet (deploy-before-migrate)", async () => {
    const legacyDb = knexLib({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await legacyDb.schema.createTable("agencies", (t) => {
      t.string("id", 36).primary();
      t.string("name", 200).nullable();
    });
    await legacyDb.schema.createTable("talent_representations", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).notNullable();
      t.string("agency_id", 36).nullable();
      t.string("external_agency_name", 160).nullable();
      t.string("relationship_type", 20).notNullable();
      t.boolean("is_exclusive").notNullable().defaultTo(false);
      t.string("status", 20).notNullable().defaultTo("active");
      // No `disclose_agency_name` column — simulates pre-migration deploy.
    });
    await legacyDb("talent_representations").insert({
      id: "rep-legacy",
      profile_id: "profile-c",
      agency_id: null,
      external_agency_name: "Pre-Migration Agency",
      relationship_type: "mother",
      is_exclusive: false,
      status: "active",
    });

    const byProfile = await loadTalentRepresentationsForProfiles(["profile-c"], {
      db: legacyDb,
    });
    const rows = byProfile.get("profile-c");
    expect(rows).toHaveLength(1);
    expect(rows[0].disclose_agency_name).toBe(false);

    const result = deriveRepresentationStatus(baseProfile({ id: "profile-c" }), rows);
    expect(result.representation_status).toBe("represented");
    expect(result.represented_by).toBe("undisclosed");

    await legacyDb.destroy();
  });
});
