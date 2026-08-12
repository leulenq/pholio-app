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

function marketLabel(market = {}) {
  if (market.city) return market.city;
  if (market.kind === "global") return "Global";
  if (market.kind === "selected_market") return "Selected market";
  return titleCaseToken(market.code || market.kind) || "Market not specified";
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

function routeDto(revision, referenceDate) {
  const spec = revision.payload;
  const scope = spec.scope;
  const lifecycle = spec.lifecycle || {};
  return {
    seriesId: spec.seriesId,
    revisionId: spec.revisionId,
    revision: spec.revision,
    datasetVersion: revision.datasetVersion || null,
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
        ? `The agency publishes “${label}” as guidance. Your current package differs, but this does not prevent sending.`
        : `“${label}” is published as optional information. Your current package differs, but this does not prevent sending.`;
    }
    return `Your current package conflicts with “${label}”. Review it before sending.`;
  }
  if (item.outcome === "unknown") {
    return "Pholio cannot verify this from your saved profile or selected images. Confirm it before sending.";
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

function findingDto(categoryKey, item, sourceUrl) {
  const severity = findingSeverity(item);
  return {
    id: `${categoryKey}:${item.id}`,
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
      return [{
        id: `sourceUnknown:${unknown.fact}:${index + 1}`,
        assertionId: null,
        categoryKey: "sourceUnknown",
        category: "Not published",
        outcome: "unknown",
        modality: null,
        basis: null,
        matchability: "manual_confirmation",
        field: unknown.fact,
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

function evaluationDto(revision, input, referenceDate) {
  const spec = revision.payload;
  const evaluation = evaluateSpecRevision({ spec, input, referenceDate });
  const evaluatedFindings = Object.entries(evaluation.outcomes).flatMap(
    ([categoryKey, items]) =>
      items.map((item) => findingDto(categoryKey, item, spec.scope.channel.url)),
  );
  const findings = [
    ...evaluatedFindings,
    ...sourceUnknownFindings(spec, input, referenceDate),
  ];

  return {
    available: true,
    ...routeDto(revision, referenceDate),
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

async function listRegistryRoutes(db, options = {}) {
  const referenceDate = options.referenceDate || utcDate(options.clock);
  const resolved = await resolveRevisions(db, { agencyId: options.agencyId });
  return {
    available: resolved.available,
    datasetVersion: resolved.datasetVersion,
    resolution: resolved.resolution,
    routes: resolved.revisions.map((revision) => routeDto(revision, referenceDate)),
  };
}

async function getRegistryRoute(db, seriesId, options = {}) {
  const referenceDate = options.referenceDate || utcDate(options.clock);
  const revision = await getCurrentRevision(db, seriesId);
  return revision ? routeDto(revision, referenceDate) : null;
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

  return {
    available: true,
    datasetVersion: resolved.datasetVersion,
    resolution: resolved.resolution,
    selectedImageIds: input.selection.selectedImageIds,
    results: resolved.revisions.map((revision) =>
      evaluationDto(revision, input, referenceDate),
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

  const evaluation = evaluationDto(revision, input, referenceDate);
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
  marketLabel,
  preflightRegistry,
  routeDto,
  snapshotApplicationSpec,
  sourceFreshness,
  utcDate,
};
