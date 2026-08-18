#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const db = require("../src/shared/db/knex");
const { isPostgres } = require("../src/domains/spec-registry/store/db-json");
const { PG_SYNC_LOCK_KEY } = require("../src/domains/spec-registry/store/publisher");

const MAPPING_SCHEMA_VERSION = "1.0.0";
const PG_MAPPING_LOCK_KEY = 807013372;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AgencyMappingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgencyMappingError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AgencyMappingError(code, message);
}

function exactKeys(value, allowed, location) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    fail("INVALID_MAPPING_CONFIG", `${location} has unknown field(s): ${extras.join(", ")}`);
  }
}

function validateMappingDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail("INVALID_MAPPING_CONFIG", "Agency mapping config must be a JSON object");
  }
  exactKeys(document, ["schemaVersion", "routes"], "mapping config");
  if (document.schemaVersion !== MAPPING_SCHEMA_VERSION) {
    fail(
      "INVALID_MAPPING_CONFIG",
      `Agency mapping schemaVersion must be ${MAPPING_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(document.routes) || document.routes.length === 0) {
    fail("INVALID_MAPPING_CONFIG", "Agency mapping config requires at least one route");
  }

  const pairs = new Set();
  const routes = document.routes.map((route, index) => {
    const location = `routes[${index}]`;
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      fail("INVALID_MAPPING_CONFIG", `${location} must be an object`);
    }
    exactKeys(route, ["agencyId", "seriesId", "priority"], location);
    if (!UUID_PATTERN.test(route.agencyId || "")) {
      fail("INVALID_MAPPING_CONFIG", `${location}.agencyId must be a UUID`);
    }
    if (
      typeof route.seriesId !== "string" ||
      !/^[a-z0-9][a-z0-9._:-]*$/.test(route.seriesId)
    ) {
      fail("INVALID_MAPPING_CONFIG", `${location}.seriesId is invalid`);
    }
    if (!Number.isInteger(route.priority) || route.priority < 0 || route.priority > 10000) {
      fail(
        "INVALID_MAPPING_CONFIG",
        `${location}.priority must be an integer from 0 through 10000`,
      );
    }
    const normalized = {
      agencyId: route.agencyId.toLowerCase(),
      seriesId: route.seriesId,
      priority: route.priority,
    };
    const pair = `${normalized.agencyId}\0${normalized.seriesId}`;
    if (pairs.has(pair)) {
      fail("INVALID_MAPPING_CONFIG", `${location} duplicates an agency/series pair`);
    }
    pairs.add(pair);
    return normalized;
  });

  routes.sort(
    (left, right) =>
      left.agencyId.localeCompare(right.agencyId) ||
      left.priority - right.priority ||
      left.seriesId.localeCompare(right.seriesId),
  );
  return { schemaVersion: MAPPING_SCHEMA_VERSION, routes };
}

function parseArgs(argv) {
  const result = { mappingFile: null, verifyOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--verify-only") {
      result.verifyOnly = true;
    } else if (argument === "--mapping-file") {
      const value = argv[index + 1];
      if (!value) fail("INVALID_ARGUMENT", "--mapping-file requires a path");
      result.mappingFile = value;
      index += 1;
    } else {
      fail("INVALID_ARGUMENT", `Unknown argument: ${argument}`);
    }
  }
  return result;
}

function loadMappingDocument({ argv = [], env = process.env, cwd = process.cwd() } = {}) {
  const args = parseArgs(argv);
  const configuredFile = args.mappingFile || env.SPEC_REGISTRY_AGENCY_ROUTES_FILE || null;
  const configuredJson = env.SPEC_REGISTRY_AGENCY_ROUTES_JSON || null;
  if (configuredFile && configuredJson) {
    fail(
      "AMBIGUOUS_MAPPING_CONFIG",
      "Set only one of a mapping file and SPEC_REGISTRY_AGENCY_ROUTES_JSON",
    );
  }
  if (!configuredFile && !configuredJson) {
    fail(
      "MAPPING_CONFIG_REQUIRED",
      "Provide --mapping-file, SPEC_REGISTRY_AGENCY_ROUTES_FILE, or SPEC_REGISTRY_AGENCY_ROUTES_JSON",
    );
  }

  let raw;
  let source;
  if (configuredFile) {
    const absolutePath = path.resolve(cwd, configuredFile);
    source = absolutePath;
    try {
      raw = fs.readFileSync(absolutePath, "utf8");
    } catch (error) {
      fail("MAPPING_CONFIG_UNREADABLE", `Cannot read ${absolutePath}: ${error.message}`);
    }
  } else {
    source = "SPEC_REGISTRY_AGENCY_ROUTES_JSON";
    raw = configuredJson;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail("INVALID_MAPPING_CONFIG", `${source} is not valid JSON: ${error.message}`);
  }
  return {
    document: validateMappingDocument(parsed),
    source,
    verifyOnly: args.verifyOnly,
  };
}

async function requireMappingTables(trx) {
  for (const table of [
    "agencies",
    "spec_registry_state",
    "spec_registry_dataset_records",
    "spec_registry_agency_routes",
  ]) {
    if (!(await trx.schema.hasTable(table))) {
      fail("MAPPING_DATABASE_NOT_READY", `Required table ${table} is missing; run migrations first`);
    }
  }
}

async function currentMappingTargets(trx, document) {
  await requireMappingTables(trx);
  const state = await trx("spec_registry_state")
    .where({ state_key: "current" })
    .first("dataset_version");
  if (!state) {
    fail("REGISTRY_NOT_PUBLISHED", "No current Spec Registry dataset is active");
  }

  const agencyIds = [...new Set(document.routes.map((route) => route.agencyId))];
  const seriesIds = [...new Set(document.routes.map((route) => route.seriesId))];
  const existingAgencies = new Set(
    (await trx("agencies").whereIn("id", agencyIds).pluck("id")).map((id) =>
      String(id).toLowerCase(),
    ),
  );
  const missingAgencies = agencyIds.filter((id) => !existingAgencies.has(id));
  if (missingAgencies.length > 0) {
    fail(
      "MAPPING_AGENCY_MISSING",
      `Agency UUID(s) do not exist: ${missingAgencies.join(", ")}`,
    );
  }

  const currentSeries = new Set(
    await trx("spec_registry_dataset_records")
      .where({ dataset_version: state.dataset_version })
      .whereIn("series_id", seriesIds)
      .pluck("series_id"),
  );
  const unavailableSeries = seriesIds.filter((id) => !currentSeries.has(id));
  if (unavailableSeries.length > 0) {
    fail(
      "MAPPING_SERIES_NOT_CURRENT",
      `Series ID(s) are not in current dataset ${state.dataset_version}: ${unavailableSeries.join(", ")}`,
    );
  }
  return { agencyIds, datasetVersion: state.dataset_version };
}

function comparableRoutes(rows) {
  return rows
    .map((row) => ({
      agencyId: String(row.agency_id).toLowerCase(),
      seriesId: row.series_id,
      priority: Number(row.priority),
    }))
    .sort(
      (left, right) =>
        left.agencyId.localeCompare(right.agencyId) ||
        left.priority - right.priority ||
        left.seriesId.localeCompare(right.seriesId),
    );
}

async function assertMappingMatches(trx, document, agencyIds) {
  const actual = comparableRoutes(
    await trx("spec_registry_agency_routes")
      .whereIn("agency_id", agencyIds)
      .select("agency_id", "series_id", "priority"),
  );
  const expected = document.routes;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      "AGENCY_MAPPING_DRIFT",
      `Stored routes for ${agencyIds.length} configured agency UUID(s) do not match the release mapping`,
    );
  }
}

async function acquireMappingLock(trx) {
  if (isPostgres(trx)) {
    // Serialize against dataset activation first, then against another mapping
    // reconciliation. This keeps the verified "current" membership stable.
    await trx.raw("select pg_advisory_xact_lock(?)", [PG_SYNC_LOCK_KEY]);
    await trx.raw("select pg_advisory_xact_lock(?)", [PG_MAPPING_LOCK_KEY]);
  }
}

async function applyAgencyMappings(database, rawDocument, { verifyOnly = false } = {}) {
  const document = validateMappingDocument(rawDocument);
  return database.transaction(async (trx) => {
    await acquireMappingLock(trx);
    const targets = await currentMappingTargets(trx, document);

    if (!verifyOnly) {
      for (const agencyId of targets.agencyIds) {
        const desiredSeries = document.routes
          .filter((route) => route.agencyId === agencyId)
          .map((route) => route.seriesId);
        await trx("spec_registry_agency_routes")
          .where({ agency_id: agencyId })
          .whereNotIn("series_id", desiredSeries)
          .del();
      }
      await trx("spec_registry_agency_routes")
        .insert(
          document.routes.map((route) => ({
            agency_id: route.agencyId,
            series_id: route.seriesId,
            priority: route.priority,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          })),
        )
        .onConflict(["agency_id", "series_id"])
        .merge(["priority", "updated_at"]);
    }

    await assertMappingMatches(trx, document, targets.agencyIds);
    return {
      status: verifyOnly ? "verified" : "mapped",
      datasetVersion: targets.datasetVersion,
      agencies: targets.agencyIds.length,
      routes: document.routes.length,
    };
  });
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const loaded = loadMappingDocument({ argv, env });
  const result = await applyAgencyMappings(db, loaded.document, {
    verifyOnly: loaded.verifyOnly,
  });
  console.log(
    `Spec Registry agency mappings ${result.status}: ${result.agencies} agencies, ` +
      `${result.routes} routes, dataset ${result.datasetVersion}.`,
  );
  return result;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[${error.code || "AGENCY_MAPPING_FAILED"}] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.destroy();
    });
}

module.exports = {
  AgencyMappingError,
  MAPPING_SCHEMA_VERSION,
  PG_MAPPING_LOCK_KEY,
  applyAgencyMappings,
  loadMappingDocument,
  main,
  parseArgs,
  validateMappingDocument,
};
