"use strict";

const crypto = require("crypto");

const { canonicalJson } = require("./canonical-json");
const { jsonForDb, parseJsonColumn } = require("./db-json");

class ApplicationSpecSnapshotConflictError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApplicationSpecSnapshotConflictError";
    this.code = code;
  }
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapDataset(row) {
  if (!row) return null;
  return {
    datasetVersion: row.dataset_version,
    schemaVersion: row.schema_version,
    taxonomyVersion: row.taxonomy_version,
    publishedOn: dateOnly(row.published_on),
    manifestSha256: row.manifest_sha256,
    taxonomySha256: row.taxonomy_sha256,
    packageSha256: row.package_sha256,
    manifest: parseJsonColumn(row.manifest_json, {}),
    taxonomy: parseJsonColumn(row.taxonomy_json, {}),
    activatedAt: row.activated_at || null,
    syncRunId: row.sync_run_id || null,
  };
}

function mapRoute(row) {
  return {
    seriesId: row.series_id,
    revisionId: row.revision_id,
    revision: row.revision_number,
    organizationName: row.organization_name,
    market: {
      kind: row.market_kind,
      code: row.market_code || null,
    },
    channelType: row.channel_type,
    channelUrl: row.channel_url,
    status: row.status,
    evaluationMode: row.evaluation_mode,
    enforcementAuthorized: Boolean(row.enforcement_authorized),
    observedOn: dateOnly(row.observed_on),
    reviewedOn: dateOnly(row.reviewed_on),
    nextReviewOn: dateOnly(row.next_review_on),
    payloadSha256: row.payload_sha256,
    priority: row.priority === null || row.priority === undefined
      ? null
      : Number(row.priority),
  };
}

async function getCurrentDataset(db) {
  const row = await db({ state: "spec_registry_state" })
    .join(
      { dataset: "spec_registry_datasets" },
      "dataset.dataset_version",
      "state.dataset_version",
    )
    .where("state.state_key", "current")
    .first(
      "dataset.dataset_version",
      "dataset.schema_version",
      "dataset.taxonomy_version",
      "dataset.published_on",
      "dataset.manifest_sha256",
      "dataset.taxonomy_sha256",
      "dataset.package_sha256",
      "dataset.manifest_json",
      "dataset.taxonomy_json",
      "state.activated_at",
      "state.sync_run_id",
    );
  return mapDataset(row);
}

const ROUTE_COLUMNS = [
  "revision.revision_number",
  "revision.organization_name",
  "revision.market_kind",
  "revision.market_code",
  "revision.channel_type",
  "revision.channel_url",
  "revision.status",
  "revision.evaluation_mode",
  "revision.enforcement_authorized",
  "revision.observed_on",
  "revision.reviewed_on",
  "revision.next_review_on",
  "revision.payload_sha256",
];

function currentRouteQuery(db, datasetVersion) {
  return db({ record: "spec_registry_dataset_records" })
    .join(
      { revision: "spec_registry_revisions" },
      "revision.revision_id",
      "record.revision_id",
    )
    .where("record.dataset_version", datasetVersion)
    .select("record.series_id", "record.revision_id", ...ROUTE_COLUMNS);
}

/**
 * Heads of agency-authored series.
 *
 * These never join the editorial dataset — that package is file-authored and
 * hash-locked as a whole — so the series row names its own current revision.
 */
function authoredRouteQuery(db) {
  return db({ series: "spec_registry_series" })
    .join(
      { revision: "spec_registry_revisions" },
      "revision.revision_id",
      "series.current_revision_id",
    )
    .where("series.origin", "agency")
    .whereNotNull("series.current_revision_id")
    .select("series.series_id", "series.current_revision_id as revision_id", ...ROUTE_COLUMNS);
}

async function listCurrentRoutes(db, { agencyId = null } = {}) {
  const dataset = await getCurrentDataset(db);
  if (!dataset) {
    return {
      available: false,
      datasetVersion: null,
      resolution: "unavailable",
      routes: [],
    };
  }

  let rows;
  let resolution = "all";
  if (agencyId) {
    const links = await db("spec_registry_agency_routes")
      .where({ agency_id: agencyId })
      .orderBy("priority", "asc")
      .orderBy("series_id", "asc")
      .select("series_id", "priority");
    if (links.length === 0) {
      return {
        available: false,
        datasetVersion: dataset.datasetVersion,
        resolution: "unmapped",
        routes: [],
      };
    }

    const seriesIds = links.map((link) => link.series_id);
    const authoredSeries = await db("spec_registry_series")
      .whereIn("series_id", seriesIds)
      .where("origin", "agency")
      .whereNotNull("current_revision_id")
      .pluck("series_id");

    // An agency that has published its own requirements has superseded whatever
    // Pholio observed about it from the outside. Its own words are the route.
    const authoredSet = new Set(authoredSeries);
    const effective = authoredSet.size
      ? seriesIds.filter((id) => authoredSet.has(id))
      : seriesIds;

    const priorityBySeries = new Map(
      links.map((link) => [link.series_id, Number(link.priority)]),
    );
    const [editorialRows, authoredRows] = await Promise.all([
      authoredSet.size
        ? []
        : currentRouteQuery(db, dataset.datasetVersion).whereIn(
            "record.series_id",
            effective,
          ),
      authoredSet.size
        ? authoredRouteQuery(db).whereIn("series.series_id", effective)
        : [],
    ]);
    rows = [...editorialRows, ...authoredRows];
    rows.forEach((row) => {
      row.priority = priorityBySeries.get(row.series_id);
    });
    rows.sort(
      (left, right) =>
        left.priority - right.priority || left.series_id.localeCompare(right.series_id),
    );
    resolution = rows.length === 1 ? "resolved" : "choice_required";
  } else {
    // The public directory is the editorial package plus every agency that has
    // published its own route. The registry compounds as agencies onboard.
    const [editorialRows, authoredRows] = await Promise.all([
      currentRouteQuery(db, dataset.datasetVersion),
      authoredRouteQuery(db),
    ]);
    rows = [...editorialRows, ...authoredRows].sort(
      (left, right) =>
        String(left.organization_name).localeCompare(String(right.organization_name)) ||
        left.series_id.localeCompare(right.series_id),
    );
  }

  return {
    available: rows.length > 0,
    datasetVersion: dataset.datasetVersion,
    resolution,
    routes: rows.map(mapRoute),
  };
}

async function getCurrentRevision(db, seriesId) {
  const series = await db("spec_registry_series")
    .where({ series_id: seriesId })
    .first("origin", "current_revision_id");

  // Agency-authored series resolve through their own pointer and belong to no
  // dataset, so `datasetVersion` is null rather than borrowed from the
  // editorial package.
  if (series?.origin === "agency") {
    if (!series.current_revision_id) return null;
    const authored = await db("spec_registry_revisions")
      .where({ revision_id: series.current_revision_id })
      .first();
    if (!authored) return null;
    return {
      datasetVersion: null,
      sourcePath: null,
      manifestStatus: null,
      ...mapRoute(authored),
      payload: parseJsonColumn(authored.payload_json, null),
    };
  }

  const dataset = await getCurrentDataset(db);
  if (!dataset) return null;
  const row = await db({ record: "spec_registry_dataset_records" })
    .join(
      { revision: "spec_registry_revisions" },
      "revision.revision_id",
      "record.revision_id",
    )
    .where({
      "record.dataset_version": dataset.datasetVersion,
      "record.series_id": seriesId,
    })
    .first("revision.*", "record.source_path", "record.manifest_status");
  if (!row) return null;
  return {
    datasetVersion: dataset.datasetVersion,
    sourcePath: row.source_path,
    manifestStatus: row.manifest_status,
    ...mapRoute(row),
    payload: parseJsonColumn(row.payload_json, null),
  };
}

async function getRevisionById(db, revisionId) {
  const row = await db("spec_registry_revisions")
    .where({ revision_id: revisionId })
    .first();
  if (!row) return null;
  return {
    ...mapRoute(row),
    payload: parseJsonColumn(row.payload_json, null),
  };
}

function mapApplicationSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    submissionRequestId: row.submission_request_id,
    datasetVersion: row.dataset_version,
    revisionId: row.revision_id,
    specPayloadSha256: row.spec_payload_sha256,
    evaluationEngineVersion: row.evaluation_engine_version,
    inputFingerprint: row.input_fingerprint,
    evaluation: parseJsonColumn(row.evaluation_json, null),
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
  };
}

function requiredSnapshotValue(snapshot, key) {
  const value = snapshot?.[key];
  if (value === null || value === undefined || value === "") {
    throw new TypeError(`Application spec snapshot requires ${key}`);
  }
  return value;
}

function snapshotsEqual(row, snapshot) {
  return (
    row.dataset_version === snapshot.datasetVersion &&
    row.application_id === snapshot.applicationId &&
    row.submission_request_id === snapshot.submissionRequestId &&
    row.revision_id === snapshot.revisionId &&
    row.spec_payload_sha256 === snapshot.specPayloadSha256 &&
    row.evaluation_engine_version === snapshot.evaluationEngineVersion &&
    row.input_fingerprint === snapshot.inputFingerprint &&
    canonicalJson(parseJsonColumn(row.evaluation_json, null)) ===
      canonicalJson(snapshot.evaluation)
  );
}

/**
 * Insert the immutable spec/evaluation record inside the caller's application
 * transaction. Exact idempotency retries return the existing row; a different
 * retry never overwrites what the application was evaluated against.
 */
async function saveApplicationSnapshot(trx, snapshot) {
  const normalized = {
    applicationId: String(requiredSnapshotValue(snapshot, "applicationId")),
    submissionRequestId: String(
      requiredSnapshotValue(snapshot, "submissionRequestId"),
    ),
    // Null for an agency-authored revision, which belongs to no dataset. The
    // pairing is verified below: a snapshot must be anchored by either a
    // dataset record or an agency-authored series, never by neither.
    datasetVersion:
      snapshot.datasetVersion === null || snapshot.datasetVersion === undefined
        ? null
        : String(snapshot.datasetVersion),
    revisionId: String(requiredSnapshotValue(snapshot, "revisionId")),
    specPayloadSha256: String(
      requiredSnapshotValue(snapshot, "specPayloadSha256"),
    ),
    evaluationEngineVersion: String(
      requiredSnapshotValue(snapshot, "evaluationEngineVersion"),
    ),
    inputFingerprint: String(requiredSnapshotValue(snapshot, "inputFingerprint")),
    evaluation: requiredSnapshotValue(snapshot, "evaluation"),
    evaluatedAt: requiredSnapshotValue(snapshot, "evaluatedAt"),
  };

  const submissionRequest = await trx("application_submission_requests")
    .where({ id: normalized.submissionRequestId })
    .first("application_id");
  if (!submissionRequest) {
    throw new ApplicationSpecSnapshotConflictError(
      "SNAPSHOT_SUBMISSION_REQUEST_MISSING",
      "Application snapshot requires an existing submission request",
    );
  }
  if (
    submissionRequest.application_id &&
    submissionRequest.application_id !== normalized.applicationId
  ) {
    throw new ApplicationSpecSnapshotConflictError(
      "SNAPSHOT_SUBMISSION_REQUEST_MISMATCH",
      "Submission request belongs to another application",
    );
  }

  const revision = await trx("spec_registry_revisions")
    .where({ revision_id: normalized.revisionId })
    .first("payload_sha256");
  if (!revision || revision.payload_sha256 !== normalized.specPayloadSha256) {
    throw new ApplicationSpecSnapshotConflictError(
      "SNAPSHOT_SPEC_HASH_MISMATCH",
      "Application snapshot does not match the immutable registry revision",
    );
  }
  if (normalized.datasetVersion === null) {
    // No dataset means this must be an agency's own current route. Anything
    // else is an unanchored snapshot and is refused.
    const authored = await trx({ series: "spec_registry_series" })
      .join(
        { revision: "spec_registry_revisions" },
        "revision.series_id",
        "series.series_id",
      )
      .where("revision.revision_id", normalized.revisionId)
      .where("series.origin", "agency")
      .where("series.current_revision_id", normalized.revisionId)
      .first("series.series_id");
    if (!authored) {
      throw new ApplicationSpecSnapshotConflictError(
        "SNAPSHOT_UNANCHORED_REVISION",
        "Registry revision is neither a dataset head nor an agency's current authored route",
      );
    }
  } else {
    const datasetRecord = await trx("spec_registry_dataset_records")
      .where({
        dataset_version: normalized.datasetVersion,
        revision_id: normalized.revisionId,
      })
      .first("revision_id");
    if (!datasetRecord) {
      throw new ApplicationSpecSnapshotConflictError(
        "SNAPSHOT_DATASET_REVISION_MISMATCH",
        "Registry revision is not a head in the stated dataset",
      );
    }
  }

  const existing = await trx("application_spec_snapshots")
    .where({ submission_request_id: normalized.submissionRequestId })
    .first();
  if (existing) {
    if (!snapshotsEqual(existing, normalized)) {
      throw new ApplicationSpecSnapshotConflictError(
        "APPLICATION_SPEC_SNAPSHOT_CONFLICT",
        "Application already has a different immutable spec snapshot",
      );
    }
    return mapApplicationSnapshot(existing);
  }

  await trx("application_spec_snapshots")
    .insert({
      id: crypto.randomUUID(),
      application_id: normalized.applicationId,
      submission_request_id: normalized.submissionRequestId,
      dataset_version: normalized.datasetVersion,
      revision_id: normalized.revisionId,
      spec_payload_sha256: normalized.specPayloadSha256,
      evaluation_engine_version: normalized.evaluationEngineVersion,
      input_fingerprint: normalized.inputFingerprint,
      evaluation_json: jsonForDb(trx, normalized.evaluation),
      evaluated_at: normalized.evaluatedAt,
      created_at: trx.fn.now(),
    })
    .onConflict("submission_request_id")
    .ignore();

  const stored = await trx("application_spec_snapshots")
    .where({ submission_request_id: normalized.submissionRequestId })
    .first();
  if (!stored || !snapshotsEqual(stored, normalized)) {
    throw new ApplicationSpecSnapshotConflictError(
      "APPLICATION_SPEC_SNAPSHOT_CONFLICT",
      "Concurrent submission stored a different immutable spec snapshot",
    );
  }
  return mapApplicationSnapshot(stored);
}

module.exports = {
  ApplicationSpecSnapshotConflictError,
  dateOnly,
  getCurrentDataset,
  getCurrentRevision,
  getRevisionById,
  listCurrentRoutes,
  mapApplicationSnapshot,
  mapRoute,
  saveApplicationSnapshot,
};
