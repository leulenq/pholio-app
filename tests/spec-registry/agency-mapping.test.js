"use strict";

const crypto = require("crypto");
const path = require("path");
const knexFactory = require("knex");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const {
  applyAgencyMappings,
  loadMappingDocument,
  validateMappingDocument,
} = require("../../scripts/map-spec-registry-agencies");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");

const registryRoot = path.join(__dirname, "..", "..", "data", "spec-registry", "v1");

function mapping(routes) {
  return { schemaVersion: "1.0.0", routes };
}

describe("Spec Registry production agency mappings", () => {
  let db;
  let registry;
  let firstAgencyId;
  let secondAgencyId;

  beforeAll(() => {
    registry = validateRegistry({
      registryRoot,
      asOf: new Date("2026-08-10T12:00:00.000Z"),
    });
  });

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.raw("PRAGMA foreign_keys = ON");
    await db.schema.createTable("agencies", (table) => {
      table.uuid("id").primary();
      table.string("name").notNullable();
    });
    await db.schema.createTable("users", (table) => {
      table.uuid("id").primary();
    });
    await db.schema.createTable("applications", (table) => {
      table.uuid("id").primary();
    });
    await db.schema.createTable("application_submission_requests", (table) => {
      table.uuid("id").primary();
      table.uuid("application_id").nullable();
    });
    await persistenceMigration.up(db);
    await agencyAuthoredMigration.up(db);
    await publishRegistry(db, registry);

    firstAgencyId = crypto.randomUUID();
    secondAgencyId = crypto.randomUUID();
    await db("agencies").insert([
      { id: firstAgencyId, name: "Production Agency One" },
      { id: secondAgencyId, name: "Production Agency Two" },
    ]);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("reconciles configured UUID routes idempotently and removes stale routes only for configured agencies", async () => {
    const initial = mapping([
      {
        agencyId: firstAgencyId,
        seriesId: "models1-uk:online",
        priority: 10,
      },
      {
        agencyId: firstAgencyId,
        seriesId: "storm-management-uk:online",
        priority: 20,
      },
      {
        agencyId: secondAgencyId,
        seriesId: "img-models-global:online",
        priority: 10,
      },
    ]);

    await expect(applyAgencyMappings(db, initial)).resolves.toMatchObject({
      status: "mapped",
      agencies: 2,
      routes: 3,
    });
    await expect(applyAgencyMappings(db, initial)).resolves.toMatchObject({
      status: "mapped",
      agencies: 2,
      routes: 3,
    });
    expect(Number((await db("spec_registry_agency_routes").count("* as n").first()).n)).toBe(3);

    const replacement = mapping([
      {
        agencyId: firstAgencyId,
        seriesId: "models1-uk:online",
        priority: 5,
      },
      {
        agencyId: secondAgencyId,
        seriesId: "img-models-global:online",
        priority: 10,
      },
    ]);
    await applyAgencyMappings(db, replacement);
    await expect(
      applyAgencyMappings(db, replacement, { verifyOnly: true }),
    ).resolves.toMatchObject({ status: "verified", routes: 2 });
    const expectedRows = [
      {
        agency_id: firstAgencyId,
        series_id: "models1-uk:online",
        priority: 5,
      },
      {
        agency_id: secondAgencyId,
        series_id: "img-models-global:online",
        priority: 10,
      },
    ].sort((left, right) => left.agency_id.localeCompare(right.agency_id));
    expect(
      await db("spec_registry_agency_routes")
        .orderBy("agency_id", "asc")
        .select("agency_id", "series_id", "priority"),
    ).toEqual(expectedRows);
  });

  test("verification is read-only and fails closed on mapping drift", async () => {
    const document = mapping([
      {
        agencyId: firstAgencyId,
        seriesId: "models1-uk:online",
        priority: 10,
      },
    ]);
    await applyAgencyMappings(db, document);
    await db("spec_registry_agency_routes")
      .where({ agency_id: firstAgencyId, series_id: "models1-uk:online" })
      .update({ priority: 99 });

    await expect(
      applyAgencyMappings(db, document, { verifyOnly: true }),
    ).rejects.toMatchObject({ code: "AGENCY_MAPPING_DRIFT" });
    expect(
      await db("spec_registry_agency_routes")
        .where({ agency_id: firstAgencyId })
        .first("priority"),
    ).toEqual({ priority: 99 });
  });

  test("rejects missing agency UUIDs and series outside the current dataset without partial writes", async () => {
    await expect(
      applyAgencyMappings(
        db,
        mapping([
          {
            agencyId: crypto.randomUUID(),
            seriesId: "models1-uk:online",
            priority: 10,
          },
        ]),
      ),
    ).rejects.toMatchObject({ code: "MAPPING_AGENCY_MISSING" });

    await expect(
      applyAgencyMappings(
        db,
        mapping([
          {
            agencyId: firstAgencyId,
            seriesId: "retired-or-invented:online",
            priority: 10,
          },
        ]),
      ),
    ).rejects.toMatchObject({ code: "MAPPING_SERIES_NOT_CURRENT" });
    expect(Number((await db("spec_registry_agency_routes").count("* as n").first()).n)).toBe(0);
  });

  test("requires explicit nonempty UUID configuration and supports the production JSON environment input", () => {
    expect(() => loadMappingDocument({ argv: [], env: {} })).toThrow(
      expect.objectContaining({ code: "MAPPING_CONFIG_REQUIRED" }),
    );
    expect(() =>
      validateMappingDocument(mapping([
        {
          agencyId: "not-a-uuid",
          seriesId: "models1-uk:online",
          priority: 10,
        },
      ])),
    ).toThrow(expect.objectContaining({ code: "INVALID_MAPPING_CONFIG" }));

    const loaded = loadMappingDocument({
      argv: ["--verify-only"],
      env: {
        SPEC_REGISTRY_AGENCY_ROUTES_JSON: JSON.stringify(
          mapping([
            {
              agencyId: firstAgencyId,
              seriesId: "models1-uk:online",
              priority: 10,
            },
          ]),
        ),
      },
    });
    expect(loaded).toMatchObject({
      source: "SPEC_REGISTRY_AGENCY_ROUTES_JSON",
      verifyOnly: true,
      document: { routes: [{ agencyId: firstAgencyId }] },
    });
  });

  test("wires mapping reconciliation and read-only verification into the release gate", () => {
    const scripts = require("../../package.json").scripts;
    expect(scripts["map:spec-registry-agencies"]).toBe(
      "node scripts/map-spec-registry-agencies.js",
    );
    expect(scripts["verify:spec-registry-release"]).toBe(
      "node scripts/map-spec-registry-agencies.js --verify-only",
    );
    expect(scripts["release:spec-registry"]).toBe(
      "npm run migrate && npm run sync:spec-registry && npm run map:spec-registry-agencies && npm run verify:spec-registry-release",
    );
  });
});
