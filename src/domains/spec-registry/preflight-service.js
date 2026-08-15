"use strict";

const { evaluateExpression, evaluateSpecRevision, talentFact } = require("./matcher");
const { buildMatcherInput } = require("./matcher-input");
const {
  getCurrentDataset,
  getCurrentRevision,
  listCurrentRoutes,
  saveApplicationSnapshot,
} = require("./store");
const { sha256Canonical } = require("./store/canonical-json");
const {
  registryTaxonomyLabels,
  registryTaxonomyLabelsVersion,
} = require("./taxonomy-labels");

const EVALUATION_ENGINE_VERSION = "1.0.0";
const ATTENTION_MODALITIES = new Set(["required", "requested", "prohibited"]);

class SpecRegistryServiceError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = "SpecRegistryServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function utcDate(clock = () => new Date()) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  return date.toISOString().slice(0, 10);
}

function titleCaseToken(value) {
  return String(value || "")
    .replace(/[._:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function regionName(code) {
  if (!/^[a-zA-Z]{2}$/.test(String(code || ""))) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(
      String(code).toUpperCase(),
    );
    // Intl echoes unknown codes back; an echo is not a name.
    return name && name.toUpperCase() !== String(code).toUpperCase() ? name : null;
  } catch {
    return null;
  }
}

function marketLabel(market = {}) {
  if (market.city) return market.city;
  if (market.kind === "global") return "Global";
  // "Selected market" is registry vocabulary, not a place a talent recognizes —
  // and a bare ISO code ("Gb") is worse. Prefer the real region name; otherwise
  // say nothing and let the client omit the line.
  const region = regionName(market.code);
  if (region) return region;
  if (market.kind === "selected_market") return null;
  return titleCaseToken(market.code) || null;
}

function sourceFreshness(spec, referenceDate) {
  const lifecycle = spec.lifecycle || {};
  if (lifecycle.effectiveUntil && lifecycle.effectiveUntil < referenceDate) {
    return { state: "expired", nextReviewOn: lifecycle.nextReviewOn || null };
  }
  if (lifecycle.nextReviewOn && lifecycle.nextReviewOn < referenceDate) {
    return { state: "review_due", nextReviewOn: lifecycle.nextReviewOn };
  }
  if (lifecycle.reviewedOn || lifecycle.observedOn) {
    return { state: "checked", nextReviewOn: lifecycle.nextReviewOn || null };
  }
  return { state: "unknown", nextReviewOn: null };
}

function publicEvidence(spec) {
  return (Array.isArray(spec.evidence) ? spec.evidence : []).map((item) => ({
    id: item.id,
    authority: item.authority,
    publisher: item.publisher,
    title: item.title,
    url: item.url,
    locale: item.locale,
    retrievedOn: item.retrievedOn,
    archivedUrl: item.archivedUrl || null,
  }));
}

/** PostgreSQL returns Date objects for `date` columns; SQLite returns text. */
function dateOnly(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * The registry claim, exactly as `docs/talent-trust-loop-design-2026-08.md` §(c)
 * specifies it. Deliberately narrow: the plate states "NYSDOL-registered · Cert
 * … · expires …" and nothing more. Legal name and evidence URL stay server-side
 * — a talent-facing surface that reprinted the registry's copy of an agency's
 * legal entity would invite the reader to reconcile two names, which is not the
 * question the line answers.
 */
function verificationDto(row) {
  if (!row) return null;
  return {
    registry: row.registry,
    certificateNumber: row.certificate_number,
    expiresOn: dateOnly(row.expires_on),
    registryStatus: row.registry_status,
    verifiedOn: dateOnly(row.verified_on),
  };
}

function callWindowDto(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    label: row.label,
    weekday: Number(row.weekday),
    startMinute: row.start_minute === null ? null : Number(row.start_minute),
    endMinute: row.end_minute === null ? null : Number(row.end_minute),
    timezone: row.timezone,
    location: row.location || null,
    instructions: row.instructions || null,
    sourceUrl: row.source_url || null,
  };
}

/**
 * One row per organisation wins the verification line.
 *
 * The natural key is (registry, certificate_number), so an organisation can
 * legitimately carry more than one row — a second registry, or a renewal pulled
 * before the superseded certificate lapsed. The plate shows a single claim, so
 * the choice has to be deterministic rather than "whatever the database
 * returned first": a live registration beats a dead one, and among equals the
 * one that expires last is the one still worth stating.
 */
function preferredVerification(left, right) {
  const liveness = (row) => (row.registry_status === "active" ? 0 : 1);
  if (liveness(left) !== liveness(right)) return liveness(left) < liveness(right) ? left : right;
  const leftExpiry = dateOnly(left.expires_on) || "";
  const rightExpiry = dateOnly(right.expires_on) || "";
  if (leftExpiry !== rightExpiry) return leftExpiry > rightExpiry ? left : right;
  return left.certificate_number <= right.certificate_number ? left : right;
}

/**
 * Batch-load the trust overlay for a set of organisation slugs.
 *
 * Two queries for any number of routes — the listing path renders the whole
 * registry, so a per-route lookup would be a guaranteed N+1 on the directory's
 * hottest read.
 *
 * Guarded with hasTable because the tables arrive in a later migration than the
 * spec-registry ones, and several suites build a minimal runtime schema without
 * them. A missing table means "no trust data yet", which renders as nothing at
 * all (ruling R3) — not as an error.
 */
async function loadTrustOverlay(db, organizationIds = []) {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  const overlay = { verifications: new Map(), callWindows: new Map() };
  if (!ids.length) return overlay;

  const [hasVerifications, hasCallWindows] = await Promise.all([
    db.schema.hasTable("agency_verifications"),
    db.schema.hasTable("agency_call_windows"),
  ]);

  if (hasVerifications) {
    const rows = await db("agency_verifications")
      .whereIn("organization_id", ids)
      .select("*");
    for (const row of rows) {
      const current = overlay.verifications.get(row.organization_id);
      overlay.verifications.set(
        row.organization_id,
        current ? preferredVerification(current, row) : row,
      );
    }
  }

  if (hasCallWindows) {
    const rows = await db("agency_call_windows")
      .whereIn("organization_id", ids)
      .where("active", true)
      .orderBy([
        { column: "weekday", order: "asc" },
        { column: "start_minute", order: "asc" },
        { column: "display_name", order: "asc" },
      ]);
    for (const row of rows) {
      const list = overlay.callWindows.get(row.organization_id) || [];
      list.push(row);
      overlay.callWindows.set(row.organization_id, list);
    }
  }

  return overlay;
}

function routeDto(revision, referenceDate, trust = null) {
  const spec = revision.payload;
  const scope = spec.scope;
  const lifecycle = spec.lifecycle || {};
  const organizationId = scope.organization.id;
  return {
    seriesId: spec.seriesId,
    revisionId: spec.revisionId,
    revision: spec.revision,
    datasetVersion: revision.datasetVersion || null,
    // Provenance, and only provenance: "agency" means a Pholio agency wrote
    // this spec themselves, "editorial" means Pholio researched it from their
    // public site. It says nothing about whether the talent can submit — an
    // agency can be on Pholio while Pholio still researched their spec.
    origin: revision.origin === "agency" ? "agency" : "editorial",
    organization: {
      id: scope.organization.id,
      name: scope.organization.name,
    },
    agencyName: scope.organization.name,
    office: scope.office,
    market: scope.market,
    marketLabel: marketLabel(scope.market),
    channel: scope.channel,
    sourceUrl: scope.channel.url,
    status: spec.status,
    sourceStatus: spec.status,
    evaluationMode: spec.evaluationMode,
    lifecycle,
    sourceCheckedOn: lifecycle.reviewedOn || lifecycle.observedOn || null,
    sourceFreshness: sourceFreshness(spec, referenceDate),
    // Positive-only (ruling R3): null means Pholio holds no registry match, and
    // the client renders nothing. It never means "unverified".
    verification: verificationDto(trust?.verifications?.get(organizationId) || null),
    callWindows: (trust?.callWindows?.get(organizationId) || []).map(callWindowDto),
  };
}

function actionForFinding(categoryKey, field, sourceUrl) {
  if (["shots", "shotCount", "setWide", "files"].includes(categoryKey)) {
    return { href: "/dashboard/talent/media", label: "Open the book" };
  }
  if (categoryKey === "eligibility" || categoryKey === "applicationFields") {
    return { href: "/dashboard/talent/profile", label: "Open profile" };
  }
  if (field?.startsWith("social.")) {
    return { href: "/dashboard/talent/profile", label: "Open profile" };
  }
  return sourceUrl ? { href: sourceUrl, label: "View agency source" } : null;
}

/**
 * What Pholio knows about this requirement, stated as a fact.
 *
 * Two surfaces render this: the apply workspace, where the talent really is
 * sending a package to a Pholio agency, and the requirements directory, where
 * nothing is sent at all — most of those agencies cannot receive a Pholio
 * submission. So the guidance says what is true of the talent's set and stops
 * there; the instruction ("confirm before sending") belongs to the surface
 * where sending is a real action, and the apply workspace supplies it.
 */
function guidanceForOutcome(item) {
  const label = item.sourceLabel || "this published item";
  const requiresAttention = ATTENTION_MODALITIES.has(item.modality);
  const isPreference = ["preferred", "encouraged"].includes(item.modality);
  if (item.outcome === "missing") {
    if (!requiresAttention) {
      return isPreference
        ? `The agency publishes “${label}” as guidance. Pholio did not find a confirmed match in this package.`
        : `“${label}” is published as optional information. Pholio did not find a confirmed match in this package.`;
    }
    return `Your current package has no confirmed match for “${label}”.`;
  }
  if (item.outcome === "violates") {
    if (!requiresAttention) {
      return isPreference
        ? `The agency publishes “${label}” as guidance. Your current package differs, which is worth knowing but is not a requirement.`
        : `“${label}” is published as optional information. Your current package differs, which is worth knowing but is not a requirement.`;
    }
    return `Your current package conflicts with “${label}”. Check it against the agency’s own page.`;
  }
  if (item.outcome === "unknown") {
    return "Pholio cannot verify this from your saved profile or selected images. Confirm it yourself.";
  }
  if (item.outcome === "satisfied") {
    return "Matched by a confirmed fact in your current package.";
  }
  return null;
}

function findingSeverity(item) {
  if (!['missing', 'violates'].includes(item.outcome)) return null;
  return ATTENTION_MODALITIES.has(item.modality)
    ? 'attention'
    : 'informational';
}

/**
 * The row identity a surface can key on, for every finding.
 *
 * Series-scoped rather than global: two agencies can both publish a slot called
 * `full-length`, and they are not the same requirement unless their taxonomy
 * terms say so (that is `matchKey`'s job). Derived only from the immutable
 * series id and the authored assertion id, so it survives a redeploy, a
 * reordering, and a dataset republish unchanged.
 */
function slotKeyFor(categoryKey, assertionId, seriesId) {
  const local = `${categoryKey}:${assertionId}`;
  return seriesId ? `${seriesId}#${local}` : local;
}

function findingDto(categoryKey, item, sourceUrl, seriesId = null) {
  const severity = findingSeverity(item);
  return {
    id: `${categoryKey}:${item.id}`,
    // Never null, for simple and compound slots alike. A compound slot has no
    // single `matchValue`, so anything keying rows by that field dropped it and
    // the surface silently under-reported an agency's published shot list.
    slotKey: slotKeyFor(categoryKey, item.id, seriesId),
    assertionId: item.id,
    categoryKey,
    category: {
      shotCount: "Shot count",
      shots: "Shots",
      setWide: "Presentation",
      files: "Files",
      eligibility: "Eligibility",
      applicationFields: "Application fields",
    }[categoryKey] || titleCaseToken(categoryKey),
    outcome: item.outcome,
    modality: item.modality,
    severity,
    requiresAttention: severity === "attention",
    basis: item.basis,
    matchability: item.matchability,
    field: item.field,
    // Lets a surface align one agency's shot list with another's. Agencies
    // publish the same shot under different words; the taxonomy value is what
    // makes them comparable.
    matchValue: item.matchValue ?? null,
    // The compound form of the same comparison: every taxonomy term the slot
    // requires, in published order, plus the order-independent key two agencies
    // publishing the same requirement will share. Null `matchKey` means the
    // slot is not comparable across agencies and stands as its own row.
    matchValues: Array.isArray(item.matchValues) ? item.matchValues : [],
    matchKey: item.matchKey ?? null,
    sourceLabel: item.sourceLabel || titleCaseToken(item.field || item.id),
    guidance: guidanceForOutcome(item),
    target:
      item.outcome === "satisfied" || item.outcome === "not_applicable"
        ? null
        : actionForFinding(categoryKey, item.field, sourceUrl),
    evidenceIds: item.evidenceIds || [],
    actual: item.actual ?? null,
    minimum: item.minimum ?? null,
    maximum: item.maximum ?? null,
    assignments: item.assignments || [],
    imageIds: item.imageIds || [],
    candidateImageIds: item.candidateImageIds || [],
    unknownCandidateImageIds: item.unknownCandidateImageIds || [],
    unresolvedShotIds: item.unresolvedShotIds || [],
    factStates: (item.facts || []).map((fact) => ({
      field: fact.field,
      state: fact.state,
      source: fact.source,
    })),
  };
}

function sourceUnknownFindings(spec, input, referenceDate) {
  return (Array.isArray(spec.unknowns) ? spec.unknowns : []).flatMap(
    (unknown, index) => {
      const applicable = evaluateExpression(
        unknown.appliesWhen,
        (field) => talentFact(input, field, new Date(`${referenceDate}T00:00:00.000Z`)),
      );
      if (applicable.state === "false") return [];
      const assertionId = `${unknown.fact}:${index + 1}`;
      return [{
        id: `sourceUnknown:${assertionId}`,
        slotKey: slotKeyFor("sourceUnknown", assertionId, spec.seriesId ?? null),
        assertionId: null,
        categoryKey: "sourceUnknown",
        category: "Not published",
        outcome: "unknown",
        modality: null,
        basis: null,
        matchability: "manual_confirmation",
        field: unknown.fact,
        matchValue: null,
        matchValues: [],
        matchKey: null,
        sourceLabel: titleCaseToken(unknown.fact),
        guidance:
          unknown.note ||
          "The agency has not published enough detail for Pholio to verify this fact.",
        target: spec.scope?.channel?.url
          ? { href: spec.scope.channel.url, label: "View agency source" }
          : null,
        evidenceIds: unknown.evidenceIds || [],
        sourceUnknown: true,
        reason: unknown.reason,
        appliesWhenState: applicable.state,
        actual: null,
        minimum: null,
        maximum: null,
        assignments: [],
        imageIds: [],
        candidateImageIds: [],
        unknownCandidateImageIds: [],
        factStates: [],
      }];
    },
  );
}

function countSummary(findings) {
  const byOutcome = {
    satisfied: 0,
    missing: 0,
    violates: 0,
    unknown: 0,
    not_applicable: 0,
  };
  for (const finding of findings) {
    if (Object.hasOwn(byOutcome, finding.outcome)) byOutcome[finding.outcome] += 1;
  }
  return {
    ...byOutcome,
    needsAttention: findings.filter((finding) => finding.requiresAttention).length,
    informational: findings.filter((finding) => finding.severity === "informational").length,
    confirm: byOutcome.unknown,
    included: byOutcome.satisfied,
  };
}

function shotCoverage(spec, input, findings) {
  const slots = spec.rules?.shots?.slots || [];
  const published = slots.reduce(
    (total, slot) => total + (Number(slot.quantity?.minimum) || 1),
    0,
  );
  const matchedIds = new Set(
    findings.flatMap((finding) =>
      (finding.assignments || []).map((assignment) => assignment.imageId),
    ),
  );
  return {
    selected: input.selection?.selectedImageIds?.length ?? input.images?.length ?? 0,
    published,
    matched: matchedIds.size,
  };
}

function evaluationDto(revision, input, referenceDate, trust = null) {
  const spec = revision.payload;
  const evaluation = evaluateSpecRevision({ spec, input, referenceDate });
  const evaluatedFindings = Object.entries(evaluation.outcomes).flatMap(
    ([categoryKey, items]) =>
      items.map((item) =>
        findingDto(categoryKey, item, spec.scope.channel.url, spec.seriesId ?? null),
      ),
  );
  const findings = [
    ...evaluatedFindings,
    ...sourceUnknownFindings(spec, input, referenceDate),
  ];

  return {
    available: true,
    ...routeDto(revision, referenceDate, trust),
    referenceDate,
    findings,
    unknownFacts: spec.unknowns || [],
    summary: countSummary(findings),
    shotCoverage: shotCoverage(spec, input, findings),
    evidence: publicEvidence(spec),
    submission: {
      canProceed: true,
      advisoryOnly: true,
      blockingEligible: false,
    },
  };
}

async function resolveRevisions(db, { agencyId, seriesId, seriesIds } = {}) {
  const dataset = await getCurrentDataset(db);
  if (!dataset) {
    return {
      available: false,
      datasetVersion: null,
      resolution: "unavailable",
      revisions: [],
    };
  }

  if (agencyId) {
    const mapped = await listCurrentRoutes(db, { agencyId });
    const revisions = await Promise.all(
      mapped.routes.map((route) => getCurrentRevision(db, route.seriesId)),
    );
    return {
      available: mapped.available,
      datasetVersion: dataset.datasetVersion,
      resolution: mapped.resolution,
      revisions: revisions.filter(Boolean),
    };
  }

  const requested = seriesId ? [seriesId] : seriesIds;
  if (Array.isArray(requested)) {
    const revisions = await Promise.all(
      requested.map((id) => getCurrentRevision(db, id)),
    );
    const missing = requested.filter((id, index) => !revisions[index]);
    if (missing.length) {
      throw new SpecRegistryServiceError(
        "SPEC_REGISTRY_ROUTE_NOT_FOUND",
        "One or more registry routes are not available in the current dataset",
        404,
        { seriesIds: missing },
      );
    }
    return {
      available: revisions.length > 0,
      datasetVersion: dataset.datasetVersion,
      resolution: revisions.length === 1 ? "resolved" : "choice_required",
      revisions,
    };
  }

  const all = await listCurrentRoutes(db);
  const revisions = await Promise.all(
    all.routes.map((route) => getCurrentRevision(db, route.seriesId)),
  );
  return {
    available: all.available,
    datasetVersion: dataset.datasetVersion,
    resolution: "all",
    revisions: revisions.filter(Boolean),
  };
}

/**
 * Which of these series a talent can actually submit to through Pholio.
 *
 * The registry deliberately carries the whole researched market — Elite, Ford,
 * Storm, Models 1, The Society — because that dataset is the product's moat,
 * not just the agencies who happen to have signed up. But most of those cannot
 * receive a Pholio application, and a directory that presents both kinds
 * identically tells a talent to build a package for a destination Pholio
 * cannot deliver to.
 *
 * The predicate is the `spec_registry_agency_routes` mapping to a live
 * `agencies` row — not who authored the spec. A Pholio agency whose spec
 * Pholio researched is still a real destination.
 */
async function deliverableSeriesIds(db, seriesIds) {
  if (!seriesIds.length) return new Map();
  const rows = await db("spec_registry_agency_routes as r")
    .join("agencies as a", "a.id", "r.agency_id")
    .whereIn("r.series_id", seriesIds)
    .where("a.status", "ACTIVE")
    .select("r.series_id", "a.id as agency_id", "a.name as agency_name");
  return new Map(
    rows.map((row) => [
      row.series_id,
      { agencyId: row.agency_id, agencyName: row.agency_name },
    ]),
  );
}

async function listRegistryRoutes(db, options = {}) {
  const referenceDate = options.referenceDate || utcDate(options.clock);
  const resolved = await resolveRevisions(db, { agencyId: options.agencyId });
  const trust = await loadTrustOverlay(
    db,
    resolved.revisions.map((revision) => revision.payload?.scope?.organization?.id),
  );
  const routes = resolved.revisions.map((revision) =>
    routeDto(revision, referenceDate, trust),
  );
  const deliverable = await deliverableSeriesIds(
    db,
    routes.map((route) => route.seriesId),
  );
  return {
    available: resolved.available,
    datasetVersion: resolved.datasetVersion,
    resolution: resolved.resolution,
    // The vocabulary every finding is written in, in the product's own words.
    // Sent once per response rather than per finding: the same field and value
    // recur across every route, and the client resolves them by lookup.
    labels: registryTaxonomyLabels(),
    labelsVersion: registryTaxonomyLabelsVersion(),
    routes: routes.map((route) => {
      const match = deliverable.get(route.seriesId) || null;
      return {
        ...route,
        acceptsPholioSubmissions: Boolean(match),
        pholioAgencyId: match?.agencyId || null,
      };
    }),
  };
}

async function getRegistryRoute(db, seriesId, options = {}) {
  const referenceDate = options.referenceDate || utcDate(options.clock);
  const revision = await getCurrentRevision(db, seriesId);
  if (!revision) return null;
  const trust = await loadTrustOverlay(db, [
    revision.payload?.scope?.organization?.id,
  ]);
  return routeDto(revision, referenceDate, trust);
}

async function preflightRegistry(
  db,
  { profileId, imageIds = [], agencyId, seriesId, seriesIds, expectedRevisionId } = {},
  options = {},
) {
  const referenceDate = options.referenceDate || utcDate(options.clock);
  const resolved = await resolveRevisions(db, { agencyId, seriesId, seriesIds });
  if (!resolved.available) {
    return {
      available: false,
      datasetVersion: resolved.datasetVersion,
      resolution: resolved.resolution,
      labels: registryTaxonomyLabels(),
      labelsVersion: registryTaxonomyLabelsVersion(),
      results: [],
      submission: { canProceed: true, advisoryOnly: true, blockingEligible: false },
    };
  }
  if (expectedRevisionId) {
    if (resolved.revisions.length !== 1) {
      throw new SpecRegistryServiceError(
        "EXPECTED_REVISION_REQUIRES_ONE_ROUTE",
        "expectedRevisionId can only be used with one resolved route",
        422,
      );
    }
    if (resolved.revisions[0].revisionId !== expectedRevisionId) {
      throw new SpecRegistryServiceError(
        "SPEC_REGISTRY_REVISION_CHANGED",
        "Published requirements changed. Review the current revision before sending.",
        409,
        { currentRevisionId: resolved.revisions[0].revisionId },
      );
    }
  }

  const input = await buildMatcherInput(db, {
    profileId,
    selectedImageIds: imageIds,
  });
  if (input.selection.rejectedImageIds.length) {
    throw new SpecRegistryServiceError(
      "SELECTED_IMAGES_UNAVAILABLE",
      "One or more selected images are unavailable for agency submission",
      422,
      { rejectedCount: input.selection.rejectedImageIds.length },
    );
  }

  const trust = await loadTrustOverlay(
    db,
    resolved.revisions.map((revision) => revision.payload?.scope?.organization?.id),
  );

  return {
    available: true,
    datasetVersion: resolved.datasetVersion,
    resolution: resolved.resolution,
    labels: registryTaxonomyLabels(),
    labelsVersion: registryTaxonomyLabelsVersion(),
    selectedImageIds: input.selection.selectedImageIds,
    results: resolved.revisions.map((revision) =>
      evaluationDto(revision, input, referenceDate, trust),
    ),
    submission: { canProceed: true, advisoryOnly: true, blockingEligible: false },
  };
}

async function snapshotApplicationSpec(
  trx,
  {
    applicationId,
    submissionRequestId,
    profileId,
    agencyId,
    imageIds = [],
    expectedRevisionId = null,
  },
  options = {},
) {
  const referenceDate = options.referenceDate || utcDate(options.clock);
  const resolved = await resolveRevisions(trx, { agencyId });
  if (!resolved.available) return null;

  let revision = null;
  if (expectedRevisionId) {
    revision = resolved.revisions.find(
      (candidate) => candidate.revisionId === expectedRevisionId,
    );
  } else if (resolved.revisions.length === 1) {
    revision = resolved.revisions[0];
  }
  if (!revision) return null;

  const input = await buildMatcherInput(trx, {
    profileId,
    selectedImageIds: imageIds,
  });
  if (input.selection.rejectedImageIds.length) return null;

  // The snapshot records what the talent was shown, and the verification line
  // was part of that.
  const trust = await loadTrustOverlay(trx, [
    revision.payload?.scope?.organization?.id,
  ]);
  const evaluation = evaluationDto(revision, input, referenceDate, trust);
  const inputFingerprint = sha256Canonical({
    referenceDate,
    talent: input.talent,
    images: input.images,
    selection: input.selection,
  });
  const evaluatedAt = options.evaluatedAt || new Date(`${referenceDate}T00:00:00.000Z`);
  await saveApplicationSnapshot(trx, {
    applicationId,
    submissionRequestId,
    datasetVersion: revision.datasetVersion,
    revisionId: revision.revisionId,
    specPayloadSha256: revision.payloadSha256,
    evaluationEngineVersion: EVALUATION_ENGINE_VERSION,
    inputFingerprint,
    evaluation,
    evaluatedAt,
  });
  return evaluation;
}

module.exports = {
  EVALUATION_ENGINE_VERSION,
  SpecRegistryServiceError,
  countSummary,
  evaluationDto,
  findingDto,
  findingSeverity,
  getRegistryRoute,
  listRegistryRoutes,
  loadTrustOverlay,
  marketLabel,
  preflightRegistry,
  routeDto,
  snapshotApplicationSpec,
  sourceFreshness,
  utcDate,
  verificationDto,
};
