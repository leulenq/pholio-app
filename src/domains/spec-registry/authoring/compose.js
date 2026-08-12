"use strict";

/*
 * Compose an agency's draft into a full, schema-valid spec revision.
 *
 * The agency edits a deliberately small shape: shot slots, presentation rules,
 * file limits, eligibility floors. Everything the registry schema also needs —
 * evidence records, basis, matchability, review provenance, shot-count
 * derivation — is filled in here, from facts we actually hold, never invented.
 *
 * Three enum values in the v1 schema were reserved for this path and are unused
 * by the ten researched routes: `authority: "agency_confirmed"`,
 * `review.method: "agency_confirmation"`, and `channel.type: "pholio_open_call"`.
 */

const { refusalReason, canScopeBy } = require("./authorable-fields");

const DRAFT_VERSION = 1;
const EVIDENCE_ID = "agency-authored-open-call";
const SCHEMA_REF = "../schemas/spec-revision.schema.json";

class SpecAuthoringError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {*} details
   * @param {number} status
   *   422 by default: almost every authoring failure is something the agency
   *   stated and can restate. Environment problems pass 503 so the panel can
   *   tell "not released here" apart from "you got this wrong".
   */
  constructor(code, message, details = null, status = 422) {
    super(message);
    this.name = "SpecAuthoringError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Lowercase, hyphenated, and legal against the schema's `id` pattern. */
function toId(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  if (slug && /^[a-z0-9]/.test(slug)) return slug;
  return fallback;
}

function uniqueIds(items, prefix) {
  const seen = new Set();
  return items.map((item, index) => {
    const base = toId(item.id || item.label, `${prefix}-${index + 1}`);
    let id = base;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    return id;
  });
}

/** The same calendar day one year on, as YYYY-MM-DD. */
function addYear(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  // Feb 29 has no counterpart in a common year; Date normalises it to Mar 1,
  // which is the behaviour we want rather than an invalid date.
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  return next.toISOString().slice(0, 10);
}

function hostnameOf(website) {
  const raw = String(website || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./i, "");
    return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** An empty draft, shaped so the builder can bind to it directly. */
function emptyDraft() {
  return {
    version: DRAFT_VERSION,
    office: { id: null, name: null },
    market: { kind: "unspecified", code: null, countryCodes: [], city: null },
    shots: { allowImageReuseAcrossSlots: null, slots: [] },
    presentation: [],
    files: [],
    eligibility: [],
    notes: null,
  };
}

function assertField(group, fieldId, taxonomyByField, location) {
  if (!taxonomyByField.has(fieldId)) {
    throw new SpecAuthoringError(
      "UNKNOWN_FIELD",
      `${location}: ${fieldId} is not a field in the active taxonomy.`,
    );
  }
  const reason = refusalReason(group, fieldId);
  if (reason) {
    throw new SpecAuthoringError("FIELD_NOT_AUTHORABLE", `${location}: ${reason}`, {
      field: fieldId,
      group,
    });
  }
}

function matchabilityFor(fieldId, taxonomyByField) {
  return taxonomyByField.get(fieldId)?.matchabilityDefault || "manual_confirmation";
}

function normalizeExpression(appliesWhen, taxonomyByField, location) {
  if (!appliesWhen || !appliesWhen.field) return null;
  if (!canScopeBy(appliesWhen.field)) {
    throw new SpecAuthoringError(
      "SCOPE_NOT_AUTHORABLE",
      `${location}: ${appliesWhen.field} cannot scope a requirement.`,
      { field: appliesWhen.field },
    );
  }
  if (!taxonomyByField.has(appliesWhen.field)) {
    throw new SpecAuthoringError(
      "UNKNOWN_FIELD",
      `${location}: ${appliesWhen.field} is not a field in the active taxonomy.`,
    );
  }
  return {
    field: appliesWhen.field,
    operator: appliesWhen.operator || "equals",
    value: appliesWhen.value ?? null,
    unit: appliesWhen.unit ?? null,
  };
}

function composeShots(draft, taxonomyByField) {
  const slots = Array.isArray(draft.shots?.slots) ? draft.shots.slots : [];
  const ids = uniqueIds(slots, "shot");

  const composed = slots.map((slot, index) => {
    const location = `shots/${index + 1}`;
    assertField("shots", slot.field, taxonomyByField, location);
    const minimum = Number.isFinite(Number(slot.minimum)) ? Number(slot.minimum) : 1;
    const maximum =
      slot.maximum === null || slot.maximum === undefined
        ? minimum
        : Number(slot.maximum);
    if (minimum < 0 || maximum < minimum) {
      throw new SpecAuthoringError(
        "INVALID_QUANTITY",
        `${location}: the maximum cannot be below the minimum.`,
      );
    }
    return {
      id: ids[index],
      quantity: { minimum, maximum },
      modality: slot.modality || "required",
      basis: "explicit_text",
      sourceLabel: String(slot.label || "").trim() || null,
      match: {
        field: slot.field,
        operator: "equals",
        value: slot.value,
        unit: null,
      },
      appliesWhen: normalizeExpression(slot.appliesWhen, taxonomyByField, location),
      evidenceIds: [EVIDENCE_ID],
      matchability: matchabilityFor(slot.field, taxonomyByField),
    };
  });

  const minimum = composed.reduce((total, slot) => total + slot.quantity.minimum, 0);
  const maximum = composed.reduce((total, slot) => total + slot.quantity.maximum, 0);

  return {
    count: {
      minimum: composed.length ? minimum : null,
      maximum: composed.length ? maximum : null,
      basis: "derived_from_explicit_assertions",
      appliesWhen: null,
      evidenceIds: [EVIDENCE_ID],
    },
    allowImageReuseAcrossSlots:
      draft.shots?.allowImageReuseAcrossSlots === undefined
        ? null
        : draft.shots.allowImageReuseAcrossSlots,
    slots: composed,
  };
}

function composeSetWide(draft, taxonomyByField, shotIds) {
  const rules = Array.isArray(draft.presentation) ? draft.presentation : [];
  const ids = uniqueIds(rules, "presentation");

  return rules.map((rule, index) => {
    const location = `presentation/${index + 1}`;
    assertField("presentation", rule.field, taxonomyByField, location);
    const selected = Array.isArray(rule.shotIds) ? rule.shotIds.filter((id) => shotIds.includes(id)) : [];
    return {
      id: ids[index],
      modality: rule.modality || "required",
      basis: "explicit_text",
      constraint: {
        field: rule.field,
        operator: rule.operator || "equals",
        value: rule.value ?? null,
        unit: rule.unit ?? null,
      },
      appliesWhen: normalizeExpression(rule.appliesWhen, taxonomyByField, location),
      appliesTo: selected.length
        ? { mode: "selected_shots", shotIds: selected }
        : { mode: "all_shots", shotIds: [] },
      sourceLabel: String(rule.label || "").trim() || null,
      evidenceIds: [EVIDENCE_ID],
      matchability: matchabilityFor(rule.field, taxonomyByField),
    };
  });
}

function composeFiles(draft, taxonomyByField) {
  const rules = Array.isArray(draft.files) ? draft.files : [];
  const ids = uniqueIds(rules, "file");

  return rules.map((rule, index) => {
    const location = `files/${index + 1}`;
    assertField("files", rule.field, taxonomyByField, location);
    return {
      id: ids[index],
      modality: rule.modality || "required",
      basis: "explicit_text",
      constraint: {
        field: rule.field,
        operator: rule.operator || "lte",
        value: rule.value ?? null,
        unit: rule.unit ?? null,
      },
      appliesWhen: normalizeExpression(rule.appliesWhen, taxonomyByField, location),
      sourceLabel: String(rule.label || "").trim() || null,
      evidenceIds: [EVIDENCE_ID],
      matchability: matchabilityFor(rule.field, taxonomyByField),
      scope: rule.scope === "whole_package" ? "whole_package" : "per_file",
      sourceValue: rule.sourceValue || null,
    };
  });
}

function composeEligibility(draft, taxonomyByField) {
  const rules = Array.isArray(draft.eligibility) ? draft.eligibility : [];
  const ids = uniqueIds(rules, "eligibility");

  return rules.map((rule, index) => {
    const location = `eligibility/${index + 1}`;
    assertField("eligibility", rule.field, taxonomyByField, location);
    return {
      id: ids[index],
      modality: rule.modality || "required",
      basis: "explicit_text",
      constraint: {
        field: rule.field,
        operator: rule.operator || "gte",
        value: rule.value ?? null,
        unit: rule.unit ?? null,
      },
      appliesWhen: normalizeExpression(rule.appliesWhen, taxonomyByField, location),
      sourceLabel: String(rule.label || "").trim() || null,
      evidenceIds: [EVIDENCE_ID],
      matchability: matchabilityFor(rule.field, taxonomyByField),
    };
  });
}

/**
 * Build the immutable revision payload an agency is about to publish.
 *
 * @param {object} params
 * @param {object} params.draft         the agency-edited draft
 * @param {object} params.agency        agencies row (name, slug, website, ...)
 * @param {object} params.taxonomy      the active taxonomy
 * @param {string} params.seriesId
 * @param {number} params.revision      1-based revision number
 * @param {string|null} params.supersedesRevisionId
 * @param {string} params.openCallUrl   https URL applicants arrive through
 * @param {string} params.publishedOn   YYYY-MM-DD
 * @param {string} params.reviewerId    who confirmed it, as a stable id
 * @param {string} params.schemaVersion
 * @param {string} params.taxonomyVersion
 */
function composeRevision({
  draft,
  agency,
  taxonomy,
  seriesId,
  revision,
  supersedesRevisionId = null,
  openCallUrl,
  publishedOn,
  reviewerId,
  schemaVersion,
  taxonomyVersion,
}) {
  const taxonomyByField = new Map(
    (taxonomy?.fields || []).map((field) => [field.id, field]),
  );

  const domain = hostnameOf(agency.website);
  if (!domain) {
    throw new SpecAuthoringError(
      "AGENCY_DOMAIN_REQUIRED",
      "Add your agency website in Settings before publishing requirements. The registry records which organisation a requirement belongs to.",
    );
  }

  const organizationId = toId(agency.slug || agency.name, "agency");
  const shots = composeShots(draft, taxonomyByField);
  const shotIds = shots.slots.map((slot) => slot.id);

  return {
    $schema: SCHEMA_REF,
    schemaVersion,
    taxonomyVersion,
    seriesId,
    revisionId: `${seriesId}@${revision}`,
    revision,
    supersedesRevisionId,
    status: "verified",
    // Advisory always. A1 invariant 3 — the open-call path is free and
    // unlimited — means a published requirement informs the applicant, it never
    // stops them sending. `blockingAuthorized()` stays dormant by design.
    evaluationMode: "advisory",
    scope: {
      organization: {
        id: organizationId,
        name: agency.name,
        legalName: null,
        officialDomains: [domain],
      },
      office: {
        id: draft.office?.id ? toId(draft.office.id, null) : null,
        name: draft.office?.name || null,
      },
      market: {
        kind: draft.market?.kind && draft.market.kind !== "unspecified"
          ? draft.market.kind
          : "selected_market",
        code: draft.market?.code
          ? toId(draft.market.code, organizationId)
          : organizationId,
        countryCodes: Array.isArray(draft.market?.countryCodes)
          ? draft.market.countryCodes.filter((code) => /^[A-Z]{2}$/.test(code))
          : [],
        city: draft.market?.city || null,
      },
      channel: {
        id: `${organizationId}-pholio-open-call`,
        type: "pholio_open_call",
        url: openCallUrl,
      },
      divisions: { mode: "unspecified", values: [] },
      applicantTracks: { mode: "unspecified", values: [] },
      evidenceIds: [EVIDENCE_ID],
    },
    lifecycle: {
      observedOn: publishedOn,
      effectiveFrom: publishedOn,
      effectiveUntil: null,
      reviewedOn: publishedOn,
      // A verified revision must carry a freshness deadline, and an agency's
      // own spec should age like any other. After a year `sourceFreshness()`
      // reports `review_due`, and the agency is asked to re-confirm rather than
      // applicants being quietly measured against stale requirements.
      nextReviewOn: addYear(publishedOn),
    },
    rules: {
      shots,
      setWide: composeSetWide(draft, taxonomyByField, shotIds),
      files: composeFiles(draft, taxonomyByField),
      eligibility: composeEligibility(draft, taxonomyByField),
      // Pholio owns the application form; the agency states requirements, not
      // which boxes exist. Left empty rather than mirrored from our own schema.
      applicationFields: [],
    },
    // A third party's spec has gaps because we observed it from outside. An
    // agency authoring its own has none by construction: anything it did not
    // state is simply not a requirement.
    unknowns: [],
    evidence: [
      {
        id: EVIDENCE_ID,
        authority: "agency_confirmed",
        publisher: agency.name,
        url: openCallUrl,
        title: `${agency.name} open call requirements`,
        locale: "en",
        retrievedOn: publishedOn,
        locator: { kind: "whole_page", value: null },
        excerpt:
          String(draft.notes || "").trim() ||
          `Requirements published by ${agency.name} through its Pholio open call.`,
        archivedUrl: null,
        contentHash: null,
      },
    ],
    review: {
      authority: "agency_confirmed",
      method: "agency_confirmation",
      reviewers: [{ id: reviewerId, reviewedOn: publishedOn }],
      notes:
        "Authored and confirmed by the agency in Pholio. Advisory only: it informs applicants and never blocks a submission.",
    },
  };
}

module.exports = {
  DRAFT_VERSION,
  EVIDENCE_ID,
  SpecAuthoringError,
  composeRevision,
  emptyDraft,
  hostnameOf,
  toId,
};
