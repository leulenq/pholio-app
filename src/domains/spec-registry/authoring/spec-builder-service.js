"use strict";

/*
 * Draft → publish lifecycle for an agency's own registry route.
 *
 * A draft is mutable and private. Publishing mints an immutable, hashed
 * revision in the same table the editorial package writes to, then advances the
 * series pointer. Nothing already published is ever rewritten: correcting a
 * requirement produces revision N+1, and any submission already evaluated keeps
 * pointing at the revision it was actually measured against.
 */

const crypto = require("crypto");

const { dateOnly, getCurrentDataset } = require("../store");
const { sha256Canonical } = require("../store/canonical-json");
const { jsonForDb, parseJsonColumn } = require("../store/db-json");
const { composeRevision, emptyDraft, SpecAuthoringError } = require("./compose");
const { authorableTaxonomy } = require("./authorable-fields");
const { validateAuthoredRevision } = require("./validate-authored");

const OPEN_CALL_LINK_ACTIVE = "active";

/*
 * Deploy-before-migrate guard, matching `hasOpenCallSchema`.
 *
 * Code reaches an environment before its migration does. Without this the whole
 * panel answers 500 on a missing column, which reads as broken rather than as
 * not-yet-released. Checked once per process, and reset on failure so a later
 * migration is picked up without a restart.
 */
let specBuilderSchemaPromise = null;
function hasSpecBuilderSchema(db) {
  if (!specBuilderSchemaPromise) {
    specBuilderSchemaPromise = Promise.all([
      db.schema.hasTable("agency_spec_drafts"),
      db.schema.hasColumn("spec_registry_series", "origin"),
      db.schema.hasColumn("spec_registry_series", "current_revision_id"),
    ])
      .then((checks) => checks.every(Boolean))
      .catch(() => {
        specBuilderSchemaPromise = null;
        return false;
      });
  }
  return specBuilderSchemaPromise;
}

/** Raised as 503 by the route: not an error the agency caused or can fix. */
async function assertSpecBuilderSchema(db) {
  if (!(await hasSpecBuilderSchema(db))) {
    throw new SpecAuthoringError(
      "SPEC_BUILDER_UNAVAILABLE",
      "Requirements are not available in this environment yet.",
      null,
      503,
    );
  }
}

/**
 * Deterministic per agency, so a series is found again without a lookup table.
 *
 * Keyed on the immutable id rather than the slug: a slug can be edited, and a
 * series id that moved with it would orphan every revision already published
 * under the old one. Readable identity lives in `scope.organization`, which is
 * what anyone actually reads.
 */
function seriesIdFor(agency) {
  return `agency:${String(agency.id).toLowerCase()}:open-call`;
}

function utcToday(clock = () => new Date()) {
  return clock().toISOString().slice(0, 10);
}

function appOrigin() {
  return (process.env.APP_URL || "https://app.pholio.studio").replace(/\/+$/, "");
}

async function loadAgency(db, agencyId) {
  const agency = await db("agencies").where({ id: agencyId }).first();
  if (!agency) {
    throw new SpecAuthoringError("AGENCY_NOT_FOUND", "Agency not found", null);
  }
  return agency;
}

/**
 * The URL applicants arrive through, which is what the published spec describes.
 *
 * Requiring a live open call is the point rather than a limitation: a set of
 * requirements with no route for anyone to meet them is not a published spec.
 */
async function openCallUrl(db, agencyId) {
  const link = await db("agency_open_call_links")
    .where({ agency_id: agencyId, status: OPEN_CALL_LINK_ACTIVE })
    .orderBy("created_at", "asc")
    .first("code");
  if (!link) {
    throw new SpecAuthoringError(
      "OPEN_CALL_LINK_REQUIRED",
      "Create an open call link before publishing requirements. Requirements describe what applicants arriving through that link must send.",
    );
  }
  return `${appOrigin()}/opencall/${link.code}`;
}

/** The taxonomy currently in force, which authored rules are checked against. */
async function activeTaxonomy(db) {
  const dataset = await getCurrentDataset(db);
  if (!dataset) {
    throw new SpecAuthoringError(
      "SPEC_REGISTRY_UNAVAILABLE",
      "The Spec Registry is not published in this environment yet.",
      null,
      503,
    );
  }
  return {
    taxonomy: dataset.taxonomy,
    schemaVersion: dataset.schemaVersion,
    taxonomyVersion: dataset.taxonomyVersion,
  };
}

async function currentRevisionFor(db, seriesId) {
  const series = await db("spec_registry_series")
    .where({ series_id: seriesId })
    .first();
  if (!series?.current_revision_id) return null;
  const revision = await db("spec_registry_revisions")
    .where({ revision_id: series.current_revision_id })
    .first();
  if (!revision) return null;
  return { ...revision, payload: parseJsonColumn(revision.payload_json, null) };
}

/**
 * Whether a draft would produce a different revision than the one published.
 *
 * Composed against the *current* revision's own number, dates and URL, so only
 * the agency's choices can move the hash. This is the single definition of
 * "changed": the builder's dirty indicator and the publish no-op both use it,
 * and cannot drift apart.
 */
function composesToCurrent({ draft, agency, taxonomy, seriesId, current, schemaVersion, taxonomyVersion }) {
  try {
    const candidate = composeRevision({
      draft,
      agency,
      taxonomy,
      seriesId,
      revision: current.revision_number,
      supersedesRevisionId: current.payload?.supersedesRevisionId || null,
      openCallUrl: current.channel_url,
      publishedOn: dateOnly(current.observed_on),
      reviewerId: `agency-${agency.id}`,
      schemaVersion,
      taxonomyVersion,
    });
    return sha256Canonical(candidate) === current.payload_sha256;
  } catch {
    // A draft that cannot even be composed is certainly not what is published.
    return false;
  }
}

/**
 * The agency's draft, its published revision, and the vocabulary it may use.
 */
async function loadBuilderState(db, agencyId, options = {}) {
  await assertSpecBuilderSchema(db);

  const agency = await loadAgency(db, agencyId);
  const seriesId = seriesIdFor(agency);
  const { taxonomy, schemaVersion, taxonomyVersion } = await activeTaxonomy(db);

  const [draftRow, current, activeLink] = await Promise.all([
    db("agency_spec_drafts").where({ agency_id: agencyId }).first(),
    currentRevisionFor(db, seriesId),
    db("agency_open_call_links")
      .where({ agency_id: agencyId, status: OPEN_CALL_LINK_ACTIVE })
      .orderBy("created_at", "asc")
      .first("code"),
  ]);

  const draft = draftRow
    ? parseJsonColumn(draftRow.draft_json, emptyDraft())
    : current?.payload
      ? draftFromRevision(current.payload)
      : emptyDraft();

  return {
    seriesId,
    taxonomyVersion,
    vocabulary: authorableTaxonomy(taxonomy),
    draft,
    hasUnpublishedChanges: !draftRow
      ? false
      : !current ||
        !composesToCurrent({
          draft,
          agency,
          taxonomy,
          seriesId,
          current,
          schemaVersion,
          taxonomyVersion,
        }),
    published: current
      ? {
          revisionId: current.revision_id,
          revision: current.revision_number,
          status: current.status,
          evaluationMode: current.evaluation_mode,
          publishedOn: dateOnly(current.observed_on),
          nextReviewOn: dateOnly(current.next_review_on),
          channelUrl: current.channel_url,
        }
      : null,
    openCall: activeLink
      ? { code: activeLink.code, url: `${appOrigin()}/opencall/${activeLink.code}` }
      : null,
    // Stated rather than inferred, so the surface never implies otherwise.
    advisoryOnly: true,
    updatedAt: draftRow?.updated_at || null,
    ...options,
  };
}

/**
 * Recover the editable draft from a published revision.
 *
 * Publishing is lossy in one direction only — composition adds provenance the
 * agency never typed. Reversing it drops exactly that generated material and
 * keeps what the agency actually chose.
 */
function draftFromRevision(spec) {
  if (!spec) return emptyDraft();
  const rules = spec.rules || {};
  return {
    version: 1,
    office: { id: spec.scope?.office?.id || null, name: spec.scope?.office?.name || null },
    market: {
      kind: spec.scope?.market?.kind || "unspecified",
      code: spec.scope?.market?.code || null,
      countryCodes: spec.scope?.market?.countryCodes || [],
      city: spec.scope?.market?.city || null,
    },
    shots: {
      allowImageReuseAcrossSlots: rules.shots?.allowImageReuseAcrossSlots ?? null,
      slots: (rules.shots?.slots || []).map((slot) => ({
        id: slot.id,
        label: slot.sourceLabel,
        field: slot.match.field,
        value: slot.match.value,
        minimum: slot.quantity.minimum,
        maximum: slot.quantity.maximum,
        modality: slot.modality,
        appliesWhen: slot.appliesWhen,
      })),
    },
    presentation: (rules.setWide || []).map((rule) => ({
      id: rule.id,
      label: rule.sourceLabel,
      field: rule.constraint.field,
      operator: rule.constraint.operator,
      value: rule.constraint.value,
      unit: rule.constraint.unit,
      modality: rule.modality,
      appliesWhen: rule.appliesWhen,
      shotIds: rule.appliesTo?.mode === "selected_shots" ? rule.appliesTo.shotIds : [],
    })),
    files: (rules.files || []).map((rule) => ({
      id: rule.id,
      label: rule.sourceLabel,
      field: rule.constraint.field,
      operator: rule.constraint.operator,
      value: rule.constraint.value,
      unit: rule.constraint.unit,
      modality: rule.modality,
      scope: rule.scope,
      sourceValue: rule.sourceValue,
      appliesWhen: rule.appliesWhen,
    })),
    eligibility: (rules.eligibility || []).map((rule) => ({
      id: rule.id,
      label: rule.sourceLabel,
      field: rule.constraint.field,
      operator: rule.constraint.operator,
      value: rule.constraint.value,
      unit: rule.constraint.unit,
      modality: rule.modality,
      appliesWhen: rule.appliesWhen,
    })),
    notes: spec.evidence?.[0]?.excerpt || null,
  };
}

/**
 * Compose and fully validate without writing anything.
 *
 * The builder calls this on every change so an agency sees a refusal while it
 * is still editing, not at the moment it presses publish.
 */
async function checkDraft(db, agencyId, draft, options = {}) {
  await assertSpecBuilderSchema(db);

  const agency = await loadAgency(db, agencyId);
  const { taxonomy, schemaVersion, taxonomyVersion } = await activeTaxonomy(db);
  const seriesId = seriesIdFor(agency);
  const publishedOn = options.publishedOn || utcToday(options.clock);

  const current = await currentRevisionFor(db, seriesId);
  const url = options.openCallUrl || (await openCallUrl(db, agencyId));

  const spec = composeRevision({
    draft,
    agency,
    taxonomy,
    seriesId,
    revision: (current?.revision_number || 0) + 1,
    supersedesRevisionId: current?.revision_id || null,
    openCallUrl: url,
    publishedOn,
    reviewerId: options.reviewerId || `agency-${agency.id}`,
    schemaVersion,
    taxonomyVersion,
  });

  return {
    spec,
    errors: validateAuthoredRevision({
      spec,
      taxonomy,
      publishedOn,
      predecessor: current?.payload || null,
    }),
  };
}

async function saveDraft(db, { agencyId, userId, draft }) {
  await assertSpecBuilderSchema(db);

  const agency = await loadAgency(db, agencyId);
  const seriesId = seriesIdFor(agency);
  const existing = await db("agency_spec_drafts").where({ agency_id: agencyId }).first();
  const current = await currentRevisionFor(db, seriesId);

  const row = {
    agency_id: agencyId,
    series_id: seriesId,
    base_revision_id: current?.revision_id || null,
    draft_json: jsonForDb(db, draft),
    updated_by_user_id: userId || null,
    updated_at: db.fn.now(),
  };

  if (existing) {
    await db("agency_spec_drafts").where({ agency_id: agencyId }).update(row);
  } else {
    await db("agency_spec_drafts").insert({
      id: crypto.randomUUID(),
      created_at: db.fn.now(),
      ...row,
    });
  }
  return loadBuilderState(db, agencyId);
}

/**
 * Publish the draft as the agency's current registry route.
 *
 * Republishing an unchanged draft is a no-op: the candidate is composed against
 * the *current* revision's number and dates, so an identical draft hashes
 * identically and no empty revision is minted.
 */
async function publishDraft(db, { agencyId, userId }, options = {}) {
  await assertSpecBuilderSchema(db);

  const agency = await loadAgency(db, agencyId);
  const seriesId = seriesIdFor(agency);
  const { taxonomy, schemaVersion, taxonomyVersion } = await activeTaxonomy(db);
  const url = await openCallUrl(db, agencyId);
  const publishedOn = options.publishedOn || utcToday(options.clock);
  const reviewerId = `agency-${agency.id}`;

  const draftRow = await db("agency_spec_drafts").where({ agency_id: agencyId }).first();
  if (!draftRow) {
    throw new SpecAuthoringError("NO_DRAFT", "There is nothing to publish yet.");
  }
  const draft = parseJsonColumn(draftRow.draft_json, emptyDraft());

  const current = await currentRevisionFor(db, seriesId);
  if (
    current &&
    composesToCurrent({
      draft,
      agency,
      taxonomy,
      seriesId,
      current,
      schemaVersion,
      taxonomyVersion,
    })
  ) {
    return { published: false, reason: "unchanged", revisionId: current.revision_id };
  }

  const spec = composeRevision({
    draft,
    agency,
    taxonomy,
    seriesId,
    revision: (current?.revision_number || 0) + 1,
    supersedesRevisionId: current?.revision_id || null,
    openCallUrl: url,
    publishedOn,
    reviewerId,
    schemaVersion,
    taxonomyVersion,
  });

  const errors = validateAuthoredRevision({
    spec,
    taxonomy,
    publishedOn,
    predecessor: current?.payload || null,
  });
  if (errors.length) {
    throw new SpecAuthoringError(
      "INVALID_SPEC",
      "These requirements cannot be published yet.",
      errors,
    );
  }

  const payloadSha256 = sha256Canonical(spec);

  await db.transaction(async (trx) => {
    // The series row must exist before the revision that references it, and the
    // pointer is set afterwards — the two tables reference each other.
    const series = await trx("spec_registry_series").where({ series_id: seriesId }).first();
    if (!series) {
      await trx("spec_registry_series").insert({
        series_id: seriesId,
        organization_key: spec.scope.organization.id,
        origin: "agency",
        agency_id: agencyId,
        current_revision_id: null,
        created_at: trx.fn.now(),
      });
    } else if (series.origin !== "agency" || series.agency_id !== agencyId) {
      throw new SpecAuthoringError(
        "SERIES_NOT_AGENCY_AUTHORED",
        "This registry route is not authored by your agency.",
      );
    }

    await trx("spec_registry_revisions").insert({
      revision_id: spec.revisionId,
      series_id: seriesId,
      revision_number: spec.revision,
      supersedes_revision_id: spec.supersedesRevisionId,
      schema_version: spec.schemaVersion,
      taxonomy_version: spec.taxonomyVersion,
      status: spec.status,
      evaluation_mode: spec.evaluationMode,
      // Advisory by construction, so this stays false and the enforcement path
      // in the publisher remains unreachable for agency-authored routes.
      enforcement_authorized: false,
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
    });

    await trx("spec_registry_series")
      .where({ series_id: seriesId })
      .update({ current_revision_id: spec.revisionId });

    // Priority 0: the agency's own words outrank anything Pholio observed about
    // it from outside.
    const existingRoute = await trx("spec_registry_agency_routes")
      .where({ agency_id: agencyId, series_id: seriesId })
      .first();
    if (existingRoute) {
      await trx("spec_registry_agency_routes")
        .where({ agency_id: agencyId, series_id: seriesId })
        .update({ priority: 0, updated_at: trx.fn.now() });
    } else {
      await trx("spec_registry_agency_routes").insert({
        agency_id: agencyId,
        series_id: seriesId,
        priority: 0,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }

    await trx("agency_spec_drafts")
      .where({ agency_id: agencyId })
      .update({ base_revision_id: spec.revisionId, updated_at: trx.fn.now() });
  });

  return { published: true, revisionId: spec.revisionId, revision: spec.revision };
}

async function listRevisions(db, agencyId) {
  await assertSpecBuilderSchema(db);

  const agency = await loadAgency(db, agencyId);
  const rows = await db("spec_registry_revisions")
    .where({ series_id: seriesIdFor(agency) })
    .orderBy("revision_number", "desc")
    .select(
      "revision_id",
      "revision_number",
      "status",
      "evaluation_mode",
      "observed_on",
      "next_review_on",
      "channel_url",
    );
  return rows.map((row) => ({
    revisionId: row.revision_id,
    revision: row.revision_number,
    status: row.status,
    evaluationMode: row.evaluation_mode,
    publishedOn: dateOnly(row.observed_on),
    nextReviewOn: dateOnly(row.next_review_on),
    channelUrl: row.channel_url,
  }));
}

module.exports = {
  SpecAuthoringError,
  hasSpecBuilderSchema,
  checkDraft,
  draftFromRevision,
  listBuilderRevisions: listRevisions,
  loadBuilderState,
  publishDraft,
  saveDraft,
  seriesIdFor,
};
