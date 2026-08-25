"use strict";

/**
 * The public face of the spec registry (§7 item 5, §9.6 #2).
 *
 * These are the honest per-agency requirement pages — "how do I apply to X",
 * answered truthfully, on a search term the space currently fills with liars.
 * Get Scouted publishes scraped requirements beside a fabricated rating;
 * ModelScouts charges $149 to spray photos at "250+ agencies". The whole
 * differentiator is that Pholio's version is dated, sourced, and willing to say
 * what it does not know.
 *
 * WHY THIS IS AN ALLOWLIST, LIKE `buildEventDesignerDTO`.
 *
 * The stored spec is a research artifact and it carries things that must not be
 * republished: reviewer identities, internal editorial notes, and the machinery
 * of how Pholio evaluates a talent's images. An unauthenticated endpoint that
 * spread whatever a spec happened to gain next would be a leak waiting on
 * someone else's commit. So nothing reaches the public because it was not
 * excluded; it reaches the public because it is named here.
 *
 * WHAT IS DELIBERATELY INCLUDED, AND WHY EACH ONE EARNS IT.
 *
 * `sourceLabel` — the agency's own sentence, kept verbatim beside Pholio's
 * reading of it. Short factual quotes from a public page, attributed and
 * linked, are ordinary citation, and showing the original next to the
 * interpretation is what separates this from a site that paraphrases until the
 * meaning drifts. A reader who thinks Pholio has it wrong can see the words and
 * judge.
 *
 * `notPublished` — the `unknowns` block, and the single most important field
 * here. "Their instructions do not publish a maximum number of images" is a
 * fact, and saying it is the difference between a registry and a guess. Every
 * competitor in this space fills that silence with an invention.
 *
 * `checked` — observed, reviewed and next-review dates. Requirements churn; the
 * plan budgets 20-40% of unmaintained entries wrong within a year. A date is
 * the reader's means of deciding how much to trust the row, and withholding it
 * would make the page exactly the thing it is meant to replace.
 *
 * `disclosure` — the not-affiliated line, on every record. Pholio lists
 * agencies it has no relationship with; a page about an agency that does not
 * say so is impersonation whatever its intent.
 *
 * WHAT IS DELIBERATELY EXCLUDED.
 *
 * Reviewer ids and review notes (internal editorial about how confident Pholio
 * is, and who looked); `evidence.excerpt`, `contentHash` and `archivedUrl`
 * (bulk source text is the part that is legally hostile to republish — several
 * of these agencies publish anti-mining policies, and citation metadata is
 * enough to let anyone check the claim themselves); `matchability` and
 * `evaluationMode` (how Pholio's matcher behaves is not the reader's business
 * and telling the world would help nobody but a scraper); and every trace of
 * any Pholio talent, of which a spec holds none and must continue to hold none.
 *
 * Delisting is handled upstream: `getCurrentRevision` returns null for a
 * delisted series, so a delisted agency is absent from here by construction
 * rather than by a filter this module could forget.
 */

const { registryTaxonomyLabels } = require("./taxonomy-labels");

/** A short, safe string, or null. Length caps are belt-and-braces on data we author. */
function text(value, max = 400) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Resolve one `match` condition into the product's own vocabulary.
 *
 * Returns null rather than a guess when the taxonomy has no entry: an
 * unlabelled condition is shown as the agency's own `sourceLabel` instead, and
 * inventing a phrase for a value Pholio has not defined is how a registry
 * starts saying things no source ever said.
 */
function conditionLabel(condition, labels) {
  const field = labels?.[condition?.field];
  if (!field) return null;
  const value = field.values?.[condition?.value];
  if (!value) return null;
  return `${field.label}: ${value.label}`;
}

function slotDto(slot, labels) {
  const conditions = Array.isArray(slot?.match?.all) ? slot.match.all : [];
  return {
    id: text(slot?.id, 80),
    // Pholio's reading, in the taxonomy's words. Empty when nothing resolved.
    reading: conditions.map((c) => conditionLabel(c, labels)).filter(Boolean),
    // The agency's own words, which outrank the reading if they disagree.
    sourceLabel: text(slot?.sourceLabel),
    modality: text(slot?.modality, 24),
    minimum: Number.isFinite(slot?.quantity?.minimum) ? slot.quantity.minimum : null,
    maximum: Number.isFinite(slot?.quantity?.maximum) ? slot.quantity.maximum : null,
  };
}

function eligibilityDto(rule) {
  const c = rule?.constraint || {};
  return {
    id: text(rule?.id, 80),
    modality: text(rule?.modality, 24),
    field: text(c.field, 80),
    operator: text(c.operator, 24),
    value: typeof c.value === "number" || typeof c.value === "string" ? c.value : null,
    unit: text(c.unit, 16),
    sourceLabel: text(rule?.sourceLabel),
  };
}

/**
 * File constraints — the ones that silently reject an iPhone photo.
 *
 * Shaped like `eligibility`: an array of constraint rules, not an object of
 * named caps. The first version of this assumed the latter, returned an object
 * of nulls, and the page quietly rendered no file section at all — which lost
 * Ford's 3MB limit and IMG's format list, the two most useful facts either page
 * had. Read the schema; do not infer it.
 *
 * `value` is a scalar for a size cap and an array for a format list, so both
 * pass through rather than being flattened into one assumed shape.
 */
function fileRuleDto(rule) {
  const c = rule?.constraint || {};
  const value = Array.isArray(c.value)
    ? c.value.map((v) => text(v, 60)).filter(Boolean)
    : typeof c.value === "number" || typeof c.value === "string"
      ? c.value
      : null;
  return {
    id: text(rule?.id, 80),
    modality: text(rule?.modality, 24),
    field: text(c.field, 80),
    operator: text(c.operator, 24),
    value,
    unit: text(c.unit, 16),
    sourceLabel: text(rule?.sourceLabel),
  };
}

/** Citation metadata only — enough to check the claim, not a copy of the page. */
function sourceDto(evidence) {
  return {
    publisher: text(evidence?.publisher, 160),
    title: text(evidence?.title, 240),
    url: text(evidence?.url, 500),
    retrievedOn: dateOnly(evidence?.retrievedOn),
    authority: text(evidence?.authority, 40),
  };
}

/**
 * One agency's published requirements, for an unauthenticated reader.
 *
 * @param {object} route  a `routeDto` from preflight-service
 * @param {object} spec   the stored spec revision payload
 * @returns {object}
 */
function publicAgencyDto(route, spec) {
  const labels = registryTaxonomyLabels();
  const rules = spec?.rules || {};
  const shots = rules.shots || {};
  const name = route?.organization?.name || route?.agencyName || null;

  return {
    seriesId: route?.seriesId || null,
    revision: Number.isFinite(spec?.revision) ? spec.revision : null,
    organization: { id: route?.organization?.id || null, name },
    office: route?.office?.name ? { name: text(route.office.name, 120) } : null,
    market: {
      label: text(route?.marketLabel, 120),
      city: text(route?.market?.city, 120),
      countryCodes: Array.isArray(route?.market?.countryCodes)
        ? route.market.countryCodes.slice(0, 8)
        : [],
    },
    // Where an applicant actually goes. The whole point of the page.
    channel: {
      type: text(route?.channel?.type, 40),
      url: text(route?.channel?.url, 500),
    },
    requirements: {
      shotCount: {
        minimum: Number.isFinite(shots?.count?.minimum) ? shots.count.minimum : null,
        maximum: Number.isFinite(shots?.count?.maximum) ? shots.count.maximum : null,
      },
      slots: Array.isArray(shots.slots) ? shots.slots.map((s) => slotDto(s, labels)) : [],
      files: Array.isArray(rules.files) ? rules.files.map(fileRuleDto) : [],
      eligibility: Array.isArray(rules.eligibility)
        ? rules.eligibility.map(eligibilityDto)
        : [],
    },
    // What this agency does NOT publish. See the header: this field is the
    // reason the page is worth reading.
    notPublished: Array.isArray(spec?.unknowns)
      ? spec.unknowns.map((u) => ({
          fact: text(u?.fact, 120),
          reason: text(u?.reason, 60),
          note: text(u?.note),
        }))
      : [],
    sources: Array.isArray(spec?.evidence) ? spec.evidence.map(sourceDto) : [],
    checked: {
      observedOn: dateOnly(route?.lifecycle?.observedOn),
      reviewedOn: dateOnly(route?.lifecycle?.reviewedOn),
      nextReviewOn: dateOnly(route?.lifecycle?.nextReviewOn),
      freshness: text(route?.sourceFreshness?.state || route?.sourceFreshness, 40),
    },
    // Positive-only (ruling R3). Null means Pholio holds no registry match; it
    // never means the agency is unverified, and the page must not render it as
    // though it did.
    verification: route?.verification || null,
    disclosure: name
      ? `Pholio is not affiliated with ${name}. These requirements are researched from their own published pages and are reproduced here so applicants can read them in one place.`
      : null,
  };
}

/** The index row — enough to list and link, nothing more. */
function publicAgencySummaryDto(route) {
  return {
    seriesId: route?.seriesId || null,
    organization: {
      id: route?.organization?.id || null,
      name: route?.organization?.name || route?.agencyName || null,
    },
    office: route?.office?.name ? { name: text(route.office.name, 120) } : null,
    market: { label: text(route?.marketLabel, 120), city: text(route?.market?.city, 120) },
    channel: { type: text(route?.channel?.type, 40) },
    checked: {
      reviewedOn: dateOnly(route?.lifecycle?.reviewedOn),
      freshness: text(route?.sourceFreshness?.state || route?.sourceFreshness, 40),
    },
    verification: route?.verification || null,
  };
}

module.exports = { publicAgencyDto, publicAgencySummaryDto };
