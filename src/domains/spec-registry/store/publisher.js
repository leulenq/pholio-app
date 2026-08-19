"use strict";

const crypto = require("crypto");

const { packageHash, sha256Canonical } = require("./canonical-json");
const { isPostgres, jsonForDb } = require("./db-json");

const PG_SYNC_LOCK_KEY = 807013371;

class SpecRegistryPublishError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SpecRegistryPublishError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SpecRegistryPublishError(code, message);
}

function assertValidatedRegistry(registry) {
  if (
    !registry ||
    !registry.manifest ||
    !registry.taxonomy ||
    !Array.isArray(registry.specs) ||
    !Array.isArray(registry.specPaths) ||
    !registry.summary
  ) {
    fail(
      "REGISTRY_NOT_VALIDATED",
      "Publisher requires the complete result returned by validateRegistry()",
    );
  }
  if (registry.specs.length !== registry.specPaths.length) {
    fail("REGISTRY_NOT_VALIDATED", "Spec paths do not align with validated specs");
  }
  if (registry.manifest.records.length !== registry.summary.currentSeries) {
    fail("REGISTRY_NOT_VALIDATED", "Validated manifest summary is inconsistent");
  }
}

function blockingAuthorized(spec) {
  if (spec.evaluationMode !== "blocking") return false;
  return Boolean(
    spec.status === "verified" &&
      spec.review?.authority === "agency_confirmed" &&
      spec.review?.method === "agency_confirmation" &&
      spec.evidence?.some((item) => item.authority === "agency_confirmed"),
  );
}

function packageFacts(registry) {
  return {
    datasetVersion: registry.manifest.datasetVersion,
    manifestSha256: sha256Canonical(registry.manifest),
    taxonomySha256: sha256Canonical(registry.taxonomy),
    packageSha256: packageHash(registry),
  };
}

function sameValues(row, expected, keys) {
  return keys.every((key) => String(row[key] ?? "") === String(expected[key] ?? ""));
}

function compareDatasetVersions(left, right) {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

async function acquirePublishLock(trx) {
  if (isPostgres(trx)) {
    await trx.raw("select pg_advisory_xact_lock(?)", [PG_SYNC_LOCK_KEY]);
  }
}

function dateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

async function assertForwardActivation(trx, targetDatasetVersion, targetPublishedOn) {
  const current = await trx({ state: "spec_registry_state" })
    .join(
      { dataset: "spec_registry_datasets" },
      "dataset.dataset_version",
      "state.dataset_version",
    )
    .where("state.state_key", "current")
    .first("state.dataset_version", "dataset.published_on");
  if (
    current &&
    current.dataset_version !== targetDatasetVersion &&
    (
      compareDatasetVersions(targetDatasetVersion, current.dataset_version) <= 0 ||
      dateKey(targetPublishedOn) < dateKey(current.published_on)
    )
  ) {
    fail(
      "DATASET_ROLLBACK_FORBIDDEN",
      `Refusing to activate ${targetDatasetVersion} over current dataset ${current.dataset_version}`,
    );
  }
}

async function insertOrVerifyDataset(trx, registry, facts) {
  const expected = {
    dataset_version: facts.datasetVersion,
    schema_version: registry.manifest.schemaVersion,
    taxonomy_version: registry.manifest.taxonomyVersion,
    published_on: registry.manifest.publishedOn,
    manifest_sha256: facts.manifestSha256,
    taxonomy_sha256: facts.taxonomySha256,
    package_sha256: facts.packageSha256,
  };
  const existing = await trx("spec_registry_datasets")
    .where({ dataset_version: facts.datasetVersion })
    .first();
  if (existing) {
    const immutableKeys = [
      "schema_version",
      "taxonomy_version",
      "published_on",
      "manifest_sha256",
      "taxonomy_sha256",
      "package_sha256",
    ];
    if (!sameValues(existing, expected, immutableKeys)) {
      fail(
        "IMMUTABLE_DATASET_COLLISION",
        `Dataset ${facts.datasetVersion} already exists with different content`,
      );
    }
    return false;
  }

  await trx("spec_registry_datasets").insert({
    ...expected,
    manifest_json: jsonForDb(trx, registry.manifest),
    taxonomy_json: jsonForDb(trx, registry.taxonomy),
    created_at: trx.fn.now(),
  });
  return true;
}

async function insertOrVerifySeries(trx, spec) {
  const existing = await trx("spec_registry_series")
    .where({ series_id: spec.seriesId })
    .first();
  const organizationKey = spec.scope.organization.id;
  if (existing) {
    if (existing.organization_key !== organizationKey) {
      fail(
        "IMMUTABLE_SERIES_COLLISION",
        `Series ${spec.seriesId} changed organization identity`,
      );
    }
    return false;
  }
  await trx("spec_registry_series").insert({
    series_id: spec.seriesId,
    organization_key: organizationKey,
    created_at: trx.fn.now(),
  });
  return true;
}

function revisionRow(trx, spec, payloadSha256) {
  const enforcementAuthorized = blockingAuthorized(spec);
  if (spec.evaluationMode === "blocking" && !enforcementAuthorized) {
    fail(
      "UNAUTHORIZED_BLOCKING_REVISION",
      `Blocking revision ${spec.revisionId} lacks agency-confirmed authorization`,
    );
  }
  return {
    revision_id: spec.revisionId,
    series_id: spec.seriesId,
    revision_number: spec.revision,
    supersedes_revision_id: spec.supersedesRevisionId,
    schema_version: spec.schemaVersion,
    taxonomy_version: spec.taxonomyVersion,
    status: spec.status,
    evaluation_mode: spec.evaluationMode,
    enforcement_authorized: enforcementAuthorized,
    organization_name: spec.scope.organization.name,
    market_kind: spec.scope.market.kind,
    market_code: spec.scope.market.code,
    channel_type: spec.scope.channel.type,
    channel_url: spec.scope.channel.url,
    observed_on: spec.lifecycle.observedOn,
    effective_from: spec.lifecycle.effectiveFrom,
    effective_until: spec.lifecycle.effectiveUntil,
    reviewed_on: spec.lifecycle.reviewedOn,
    next_review_on: spec.lifecycle.nextReviewOn,
    payload_sha256: payloadSha256,
    payload_json: jsonForDb(trx, spec),
    imported_at: trx.fn.now(),
  };
}

async function insertOrVerifyRevision(trx, spec) {
  const payloadSha256 = sha256Canonical(spec);
  const existing = await trx("spec_registry_revisions")
    .where({ revision_id: spec.revisionId })
    .first();
  if (existing) {
    if (
      existing.series_id !== spec.seriesId ||
      Number(existing.revision_number) !== spec.revision ||
      existing.payload_sha256 !== payloadSha256
    ) {
      fail(
        "IMMUTABLE_REVISION_COLLISION",
        `Revision ${spec.revisionId} already exists with different content`,
      );
    }
    return false;
  }
  await trx("spec_registry_revisions").insert(
    revisionRow(trx, spec, payloadSha256),
  );
  return true;
}

async function insertOrVerifyDatasetRecord(trx, datasetVersion, record, spec) {
  if (!spec) {
    fail(
      "MANIFEST_REVISION_MISSING",
      `Manifest points to missing revision ${record.currentRevisionId}`,
    );
  }
  if (spec.seriesId !== record.seriesId || spec.status !== record.status) {
    fail(
      "MANIFEST_REVISION_MISMATCH",
      `Manifest record ${record.seriesId} disagrees with its revision`,
    );
  }
  const expected = {
    dataset_version: datasetVersion,
    series_id: record.seriesId,
    revision_id: record.currentRevisionId,
    manifest_status: record.status,
    source_path: record.path,
  };
  const existing = await trx("spec_registry_dataset_records")
    .where({ dataset_version: datasetVersion, series_id: record.seriesId })
    .first();
  if (existing) {
    if (
      !sameValues(existing, expected, [
        "revision_id",
        "manifest_status",
        "source_path",
      ])
    ) {
      fail(
        "IMMUTABLE_MANIFEST_RECORD_COLLISION",
        `Dataset ${datasetVersion} already has another head for ${record.seriesId}`,
      );
    }
    return false;
  }
  await trx("spec_registry_dataset_records").insert(expected);
  return true;
}

async function activateDataset(trx, datasetVersion, syncRunId) {
  const current = await trx("spec_registry_state")
    .where({ state_key: "current" })
    .first();
  if (current?.dataset_version === datasetVersion) return false;

  const row = {
    dataset_version: datasetVersion,
    sync_run_id: syncRunId,
    activated_at: trx.fn.now(),
  };
  if (current) {
    await trx("spec_registry_state").where({ state_key: "current" }).update(row);
  } else {
    await trx("spec_registry_state").insert({ state_key: "current", ...row });
  }
  return true;
}

function safeErrorDetail(error) {
  return String(error?.message || "Spec Registry publish failed").slice(0, 2000);
}

async function publishRegistry(db, validatedRegistry) {
  assertValidatedRegistry(validatedRegistry);
  const facts = packageFacts(validatedRegistry);
  const runId = crypto.randomUUID();
  await db("spec_registry_sync_runs").insert({
    id: runId,
    dataset_version: facts.datasetVersion,
    manifest_sha256: facts.manifestSha256,
    package_sha256: facts.packageSha256,
    status: "started",
    started_at: db.fn.now(),
  });

  try {
    const result = await db.transaction(async (trx) => {
      await acquirePublishLock(trx);
      await assertForwardActivation(
        trx,
        facts.datasetVersion,
        validatedRegistry.manifest.publishedOn,
      );
      let changed = false;
      changed = (await insertOrVerifyDataset(trx, validatedRegistry, facts)) || changed;

      const sortedSpecs = [...validatedRegistry.specs].sort(
        (left, right) =>
          left.revision - right.revision || left.revisionId.localeCompare(right.revisionId),
      );
      for (const spec of sortedSpecs) {
        changed = (await insertOrVerifySeries(trx, spec)) || changed;
        changed = (await insertOrVerifyRevision(trx, spec)) || changed;
      }

      const specsByRevision = new Map(
        validatedRegistry.specs.map((spec) => [spec.revisionId, spec]),
      );
      for (const record of validatedRegistry.manifest.records) {
        changed =
          (await insertOrVerifyDatasetRecord(
            trx,
            facts.datasetVersion,
            record,
            specsByRevision.get(record.currentRevisionId),
          )) || changed;
      }

      const recordCountRow = await trx("spec_registry_dataset_records")
        .where({ dataset_version: facts.datasetVersion })
        .count("series_id as count")
        .first();
      const recordCount = Number(recordCountRow?.count || 0);
      if (recordCount !== validatedRegistry.manifest.records.length) {
        fail(
          "DATASET_RECORD_COUNT_MISMATCH",
          `Dataset ${facts.datasetVersion} has ${recordCount} records; expected ${validatedRegistry.manifest.records.length}`,
        );
      }

      changed = (await activateDataset(trx, facts.datasetVersion, runId)) || changed;
      return {
        changed,
        datasetVersion: facts.datasetVersion,
        packageSha256: facts.packageSha256,
        counts: {
          currentSeries: validatedRegistry.manifest.records.length,
          revisions: validatedRegistry.specs.length,
          taxonomyFields: validatedRegistry.taxonomy.fields.length,
          unknownFacts: validatedRegistry.taxonomy.unknownFacts.length,
        },
      };
    });

    const status = result.changed ? "succeeded" : "unchanged";
    await db("spec_registry_sync_runs").where({ id: runId }).update({
      status,
      completed_at: db.fn.now(),
      counts_json: jsonForDb(db, result.counts),
    });
    return { ...result, runId, status };
  } catch (error) {
    try {
      await db("spec_registry_sync_runs").where({ id: runId }).update({
        status: "failed",
        completed_at: db.fn.now(),
        error_code: String(error.code || "PUBLISH_FAILED").slice(0, 80),
        error_detail: safeErrorDetail(error),
      });
    } catch {
      // Preserve the original publish failure if failure auditing is unavailable.
    }
    throw error;
  }
}

module.exports = {
  PG_SYNC_LOCK_KEY,
  SpecRegistryPublishError,
  assertValidatedRegistry,
  assertForwardActivation,
  blockingAuthorized,
  compareDatasetVersions,
  packageFacts,
  publishRegistry,
};
