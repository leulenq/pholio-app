/**
 * The spec-registry wire contract, in one place.
 *
 * Both registry surfaces — the Agency requirements page and the preflight panel
 * inside the apply workspace — previously guessed at this shape independently,
 * reading each field through a chain like
 * `finding.label || finding.requirement || finding.sourceLabel || 'Published requirement'`.
 * Only the third branch ever matched. The cost was not a runtime bug, it was
 * that no one could tell what actually rendered, a backend rename would fall
 * through to a generic label instead of failing loudly, and the two surfaces
 * could drift apart while both looked defensive and safe.
 *
 * Server source of truth: `src/domains/spec-registry/preflight-service.js`
 * (`routeDto`, `findingDto`, `countSummary`, `shotCoverage`, `evaluationDto`).
 * If a field moves there, it moves here, and both surfaces move with it.
 */

/** `findingDto.outcome` */
export const OUTCOME = {
  SATISFIED: 'satisfied',
  MISSING: 'missing',
  VIOLATES: 'violates',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'not_applicable',
};

/** `sourceFreshness.state` */
export const FRESHNESS = {
  CHECKED: 'checked',
  REVIEW_DUE: 'review_due',
  EXPIRED: 'expired',
  UNKNOWN: 'unknown',
};

/**
 * `lifecycle.reviewedOn` / `observedOn` / `nextReviewOn` are calendar dates
 * (`YYYY-MM-DD`), not timestamps — so format them without a timezone shift.
 * Parsing "2026-08-09" with `new Date()` yields UTC midnight, which renders as
 * the previous day west of Greenwich.
 */
export function formatRegistryDate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return String(value);
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** A published route, as `routeDto` sends it. */
export function readRoute(route) {
  if (!route?.seriesId) return null;
  return {
    seriesId: route.seriesId,
    revisionId: route.revisionId ?? null,
    agencyName: route.agencyName || route.organization?.name || 'Agency route',
    marketLabel: route.marketLabel || null,
    sourceUrl: route.sourceUrl ?? null,
    sourceStatus: route.sourceStatus ?? null,
    sourceCheckedOn: route.sourceCheckedOn ?? null,
    sourceFreshness: route.sourceFreshness ?? null,
    evaluationMode: route.evaluationMode ?? null,
    // Whether Pholio can actually deliver an application here, as opposed to
    // merely knowing what this agency publishes. The registry carries the whole
    // researched market on purpose — that dataset is the point — but a talent
    // must never build a package against a destination Pholio cannot send to
    // and only find out at the end.
    acceptsPholioSubmissions: route.acceptsPholioSubmissions === true,
  };
}

export function readRoutes(payload) {
  return (Array.isArray(payload?.routes) ? payload.routes : [])
    .map(readRoute)
    .filter(Boolean);
}

/**
 * Submission destinations first, reference entries second. Both are useful —
 * knowing you already satisfy Storm is worth something even though Storm is not
 * on Pholio — but only one of them ends in an application.
 */
export function partitionRoutes(routes) {
  return {
    submittable: routes.filter((route) => route.acceptsPholioSubmissions),
    reference: routes.filter((route) => !route.acceptsPholioSubmissions),
  };
}

/**
 * The evaluation for one route out of a multi-route preflight response.
 *
 * `preflightRegistry` answers a `seriesIds` request with `results`, one
 * `evaluationDto` per route, inside the standard `{ success, data }` envelope.
 * Picking the right entry is wire-contract knowledge, so it lives here rather
 * than being re-derived by whichever surface happens to need it.
 */
export function readEvaluationFor(payload, seriesId) {
  const envelope = payload?.data ?? payload;
  const results = Array.isArray(envelope?.results) ? envelope.results : [];
  return results.find((result) => result?.seriesId === seriesId) || null;
}

/** A single published requirement, as `findingDto` sends it. */
export function readFinding(finding) {
  return {
    id: finding.id,
    category: finding.category || null,
    outcome: finding.outcome,
    severity: finding.severity ?? null,
    requiresAttention: finding.requiresAttention === true,
    label: finding.sourceLabel,
    guidance: finding.guidance ?? null,
    target: finding.target?.href ? finding.target : null,
  };
}

/**
 * `countSummary` already counts every bucket the UI needs. Re-deriving them in
 * the component was how the header ended up with no counts at all.
 */
export function readSummary(summary) {
  if (!summary) return null;
  return {
    needsAttention: summary.needsAttention ?? 0,
    informational: summary.informational ?? 0,
    confirm: summary.confirm ?? 0,
    included: summary.included ?? 0,
  };
}

/**
 * `matched` is the number of selected images that landed in a published shot
 * slot — the one figure here that describes the talent's own package rather
 * than the agency's requirements. The previous reader dropped it.
 */
export function readShotCoverage(coverage) {
  if (!coverage) return null;
  const { selected, published, matched } = coverage;
  if (selected == null && published == null) return null;
  return {
    selected: selected ?? null,
    published: published ?? null,
    matched: matched ?? null,
  };
}

/** Freshness is advisory: it tells the talent when to go read the agency's page. */
export function readFreshnessNotice(route) {
  const state = route?.sourceFreshness?.state;
  const nextReviewOn = formatRegistryDate(route?.sourceFreshness?.nextReviewOn);
  if (state === FRESHNESS.REVIEW_DUE) {
    return nextReviewOn
      ? `Due for review on ${nextReviewOn}. Confirm on the agency's site.`
      : `Due for review. Confirm on the agency's site.`;
  }
  if (state === FRESHNESS.EXPIRED) {
    return `The recorded effective period has ended. Confirm on the agency's site.`;
  }
  if (state === FRESHNESS.UNKNOWN) return `Source freshness is not yet recorded.`;
  return null;
}

/** True when the published detail itself is shaky, separate from the package. */
export function sourceNeedsReview(route) {
  return (
    route?.sourceStatus === 'provisional' ||
    route?.sourceStatus === 'conflicting' ||
    route?.sourceFreshness?.state === FRESHNESS.REVIEW_DUE ||
    route?.sourceFreshness?.state === FRESHNESS.EXPIRED
  );
}

/**
 * Findings in presentation order. `not_applicable` never reaches the talent:
 * a requirement that does not apply to them is noise, not information.
 */
export function groupFindings(findings) {
  const list = (Array.isArray(findings) ? findings : []).map(readFinding);
  return {
    attention: list.filter((f) => f.requiresAttention),
    confirm: list.filter((f) => f.outcome === OUTCOME.UNKNOWN),
    guidance: list.filter((f) => f.severity === 'informational'),
    included: list.filter((f) => f.outcome === OUTCOME.SATISFIED),
  };
}
