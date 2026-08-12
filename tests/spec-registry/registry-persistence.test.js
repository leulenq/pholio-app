"use strict";

const crypto = require("crypto");
const path = require("path");
const knexFactory = require("knex");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const deliveryMigration = require("../../migrations/20260810121000_spec_registry_delivery_metadata");
const requestCascadeMigration = require("../../migrations/20260810122000_application_spec_snapshot_request_cascade");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const {
  getCurrentDataset,
  getCurrentRevision,
  listCurrentRoutes,
  saveApplicationSnapshot,
} = require("../../src/domains/spec-registry/store");
const {
  publishRegistry,
} = require("../../src/domains/spec-registry/store/publisher");

const registryRoot = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "spec-registry",
  "v1",
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function submissionRequestDeleteAction(db) {
  const foreignKeys = await db.raw(
    "PRAGMA foreign_key_list('application_spec_snapshots')",
  );
  return foreignKeys.find(
    (foreignKey) =>
      foreignKey.table === "application_submission_requests" &&
      foreignKey.from === "submission_request_id",
  )?.on_delete;
}

describe("Spec Registry persistence and publication", () => {
  let db;
  let registry;

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
      table
        .uuid("application_id")
        .nullable()
        .references("id")
        .inTable("applications")
        .onDelete("SET NULL");
    });
    await db.schema.createTable("images", (table) => {
      table.uuid("id").primary();
    });
    await persistenceMigration.up(db);
    await requestCascadeMigration.up(db);
    await deliveryMigration.up(db);
    await agencyAuthoredMigration.up(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("migration creates the historical store, snapshot table, and both delivery fact sets", async () => {
    for (const table of [
      "spec_registry_datasets",
      "spec_registry_series",
      "spec_registry_revisions",
      "spec_registry_dataset_records",
      "spec_registry_sync_runs",
      "spec_registry_state",
      "spec_registry_agency_routes",
      "application_spec_snapshots",
    ]) {
      expect(await db.schema.hasTable(table)).toBe(true);
    }

    for (const column of deliveryMigration.DELIVERY_COLUMNS) {
      expect(await db.schema.hasColumn("images", column)).toBe(true);
    }
    expect(await submissionRequestDeleteAction(db)).toBe("CASCADE");

    const indexNames = (await db.raw("PRAGMA index_list('application_spec_snapshots')"))
      .map((index) => index.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_app_spec_snapshots_application",
        "idx_app_spec_snapshots_revision",
        "idx_app_spec_snapshots_dataset",
      ]),
    );

    await deliveryMigration.down(db);
    for (const column of deliveryMigration.DELIVERY_COLUMNS) {
      expect(await db.schema.hasColumn("images", column)).toBe(false);
    }
    await requestCascadeMigration.down(db);
    expect(await submissionRequestDeleteAction(db)).toBe("RESTRICT");
    await persistenceMigration.down(db);
    expect(await db.schema.hasTable("spec_registry_datasets")).toBe(false);
    expect(await db.schema.hasTable("application_spec_snapshots")).toBe(false);
  });

  test("missing current state is explicit and never falls back to package files", async () => {
    expect(await getCurrentDataset(db)).toBeNull();
    await expect(listCurrentRoutes(db)).resolves.toEqual({
      available: false,
      datasetVersion: null,
      resolution: "unavailable",
      routes: [],
    });
  });

  test("publishes once, parses SQLite JSON, and is idempotent on repeat", async () => {
    const first = await publishRegistry(db, registry);
    const second = await publishRegistry(db, registry);

    expect(first).toMatchObject({
      changed: true,
      status: "succeeded",
      datasetVersion: "2026.08.09.2",
    });
    expect(second).toMatchObject({
      changed: false,
      status: "unchanged",
      datasetVersion: "2026.08.09.2",
    });
    expect(Number((await db("spec_registry_datasets").count("* as n").first()).n)).toBe(1);
    expect(Number((await db("spec_registry_revisions").count("* as n").first()).n)).toBe(10);
    expect(Number((await db("spec_registry_dataset_records").count("* as n").first()).n)).toBe(10);

    const current = await getCurrentDataset(db);
    expect(current.manifest).toMatchObject({ datasetVersion: "2026.08.09.2" });
    expect(current.taxonomy.fields).toHaveLength(88);
    expect(current.packageSha256).toMatch(/^[a-f0-9]{64}$/);

    const revision = await getCurrentRevision(
      db,
      "elite-models-na:online-general",
    );
    expect(revision.payload).toMatchObject({
      revisionId: "elite-models-na:online-general@1",
      evaluationMode: "advisory",
    });

    const runs = await db("spec_registry_sync_runs").orderBy("started_at", "asc");
    expect(runs.map((run) => run.status).sort()).toEqual(["succeeded", "unchanged"]);
    expect(JSON.parse(runs.find((run) => run.status === "succeeded").counts_json)).toMatchObject({
      currentSeries: 10,
      revisions: 10,
    });
  });

  test("keeps historical manifests while atomically moving the current pointer", async () => {
    await publishRegistry(db, registry);
    const next = clone(registry);
    next.manifest.datasetVersion = "2026.08.10.1";
    next.manifest.publishedOn = "2026-08-10";
    next.summary = clone(registry.summary);

    await publishRegistry(db, next);

    const datasets = await db("spec_registry_datasets")
      .orderBy("dataset_version", "asc")
      .pluck("dataset_version");
    expect(datasets).toEqual(["2026.08.09.2", "2026.08.10.1"]);
    expect(Number((await db("spec_registry_dataset_records").count("* as n").first()).n)).toBe(20);
    expect(Number((await db("spec_registry_revisions").count("* as n").first()).n)).toBe(10);
    expect((await getCurrentDataset(db)).datasetVersion).toBe("2026.08.10.1");
  });

  test("refuses to reactivate a stale historical dataset", async () => {
    await publishRegistry(db, registry);
    const next = clone(registry);
    next.manifest.datasetVersion = "2026.08.10.1";
    next.manifest.publishedOn = "2026-08-10";
    next.summary = clone(registry.summary);
    await publishRegistry(db, next);

    await expect(publishRegistry(db, registry)).rejects.toMatchObject({
      code: "DATASET_ROLLBACK_FORBIDDEN",
    });

    const misleadingVersion = clone(registry);
    misleadingVersion.manifest.datasetVersion = "2026.08.11.1";
    misleadingVersion.manifest.publishedOn = "2026-08-08";
    misleadingVersion.summary = clone(registry.summary);
    await expect(publishRegistry(db, misleadingVersion)).rejects.toMatchObject({
      code: "DATASET_ROLLBACK_FORBIDDEN",
    });
    expect((await getCurrentDataset(db)).datasetVersion).toBe("2026.08.10.1");
    expect(
      await db("spec_registry_sync_runs")
        .where({ dataset_version: "2026.08.09.2", status: "failed" })
        .first("error_code"),
    ).toEqual({ error_code: "DATASET_ROLLBACK_FORBIDDEN" });
  });

  test("revision collision rolls back a staged dataset and preserves the current pointer", async () => {
    await publishRegistry(db, registry);
    const invalidNext = clone(registry);
    invalidNext.manifest.datasetVersion = "2026.08.10.9";
    invalidNext.manifest.publishedOn = "2026-08-10";
    invalidNext.specs[0].review.notes = `${invalidNext.specs[0].review.notes || ""} changed`;
    invalidNext.summary = clone(registry.summary);

    await expect(publishRegistry(db, invalidNext)).rejects.toMatchObject({
      code: "IMMUTABLE_REVISION_COLLISION",
    });

    expect(
      await db("spec_registry_datasets")
        .where({ dataset_version: "2026.08.10.9" })
        .first(),
    ).toBeUndefined();
    expect((await getCurrentDataset(db)).datasetVersion).toBe("2026.08.09.2");
    expect(
      await db("spec_registry_sync_runs")
        .where({ dataset_version: "2026.08.10.9" })
        .first("status", "error_code"),
    ).toEqual({
      status: "failed",
      error_code: "IMMUTABLE_REVISION_COLLISION",
    });
  });

  test("resolves agencies only through explicit series links", async () => {
    await publishRegistry(db, registry);
    const agencyId = crypto.randomUUID();
    await db("agencies").insert({ id: agencyId, name: "Mapped Agency" });

    expect(await listCurrentRoutes(db, { agencyId })).toMatchObject({
      available: false,
      resolution: "unmapped",
    });

    await db("spec_registry_agency_routes").insert({
      agency_id: agencyId,
      series_id: "models1-uk:online",
      priority: 10,
    });
    expect(await listCurrentRoutes(db, { agencyId })).toMatchObject({
      available: true,
      resolution: "resolved",
      routes: [{ seriesId: "models1-uk:online", priority: 10 }],
    });

    await db("spec_registry_agency_routes").insert({
      agency_id: agencyId,
      series_id: "elite-models-na:online-general",
      priority: 20,
    });
    expect(await listCurrentRoutes(db, { agencyId })).toMatchObject({
      available: true,
      resolution: "choice_required",
      routes: [
        { seriesId: "models1-uk:online", priority: 10 },
        { seriesId: "elite-models-na:online-general", priority: 20 },
      ],
    });
  });

  test("application snapshots are immutable, revision-bound, and idempotent", async () => {
    await publishRegistry(db, registry);
    const applicationId = crypto.randomUUID();
    const submissionRequestId = crypto.randomUUID();
    const secondSubmissionRequestId = crypto.randomUUID();
    await db("applications").insert({ id: applicationId });
    await db("application_submission_requests").insert([
      { id: submissionRequestId, application_id: applicationId },
      { id: secondSubmissionRequestId, application_id: applicationId },
    ]);
    const revision = await getCurrentRevision(
      db,
      "the-society-management-nyc:online",
    );
    const snapshot = {
      applicationId,
      submissionRequestId,
      datasetVersion: revision.datasetVersion,
      revisionId: revision.revisionId,
      specPayloadSha256: revision.payloadSha256,
      evaluationEngineVersion: "1.0.0",
      inputFingerprint: "a".repeat(64),
      evaluation: { outcomes: [] },
      evaluatedAt: "2026-08-10T12:00:00.000Z",
    };
    const first = await db.transaction((trx) => saveApplicationSnapshot(trx, snapshot));
    const retry = await db.transaction((trx) => saveApplicationSnapshot(trx, snapshot));
    expect(first).toMatchObject(snapshot);
    expect(retry).toMatchObject(snapshot);
    expect(
      Number((await db("application_spec_snapshots").count("* as n").first()).n),
    ).toBe(1);

    await expect(
      db.transaction((trx) =>
        saveApplicationSnapshot(trx, {
          ...snapshot,
          evaluation: { outcomes: [{ assertionId: "changed" }] },
        }),
      ),
    ).rejects.toMatchObject({ code: "APPLICATION_SPEC_SNAPSHOT_CONFLICT" });

    const secondAttempt = await db.transaction((trx) =>
      saveApplicationSnapshot(trx, {
        ...snapshot,
        submissionRequestId: secondSubmissionRequestId,
        inputFingerprint: "b".repeat(64),
        evaluation: { outcomes: [{ assertionId: "second-send" }] },
        evaluatedAt: "2026-08-10T13:00:00.000Z",
      }),
    );
    expect(secondAttempt).toMatchObject({
      applicationId,
      submissionRequestId: secondSubmissionRequestId,
      evaluation: { outcomes: [{ assertionId: "second-send" }] },
    });
    expect(secondAttempt.id).not.toBe(first.id);
    expect(
      Number((await db("application_spec_snapshots").count("* as n").first()).n),
    ).toBe(2);

    // Exercise the forward migration against existing immutable history, not
    // only an empty fresh install. The table rebuild must preserve both rows.
    await requestCascadeMigration.down(db);
    expect(await submissionRequestDeleteAction(db)).toBe("RESTRICT");
    await requestCascadeMigration.up(db);
    expect(await submissionRequestDeleteAction(db)).toBe("CASCADE");
    expect(
      Number((await db("application_spec_snapshots").count("* as n").first()).n),
    ).toBe(2);

    const stored = await db("application_spec_snapshots")
      .where({ submission_request_id: submissionRequestId })
      .first();
    expect(JSON.parse(stored.evaluation_json)).toEqual({ outcomes: [] });
    await expect(
      db("spec_registry_revisions")
        .where({ revision_id: revision.revisionId })
        .del(),
    ).rejects.toThrow();

    await db("applications").where({ id: applicationId }).del();
    expect(
      Number((await db("application_spec_snapshots").count("* as n").first()).n),
    ).toBe(0);
    expect(
      await db("application_submission_requests")
        .where({ id: submissionRequestId })
        .first("application_id"),
    ).toEqual({ application_id: null });
  });
});
