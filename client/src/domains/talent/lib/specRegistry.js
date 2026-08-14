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
    // The machine-readable bucket (`shots`, `files`, `eligibility`,
    // `applicationFields`, …). `category` is its display name; a surface that
    // wants to reason about *which* kind of requirement this is has to read the
    // key, not the label.
    categoryKey: finding.categoryKey ?? null,
    // The canonical taxonomy value (`close_up`, `full_length`, `profile`).
    // `label` is the agency's own wording and differs between agencies for the
    // same shot; this is what makes two agencies' lists comparable.
    matchValue: finding.matchValue ?? null,
    field: finding.field ?? null,
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

/* ------------------------------------------------------------------ *
 * The market, as one grid.
 *
 * Every other view of this data answers "what does Elite want?" one
 * agency at a time. The question a talent actually has is the inverse —
 * *which shot should I take next* — and that is only answerable across
 * agencies at once. B2 of the plan promises exactly this: "shoot your
 * digitals once, we know what every agency wants."
 * ------------------------------------------------------------------ */

/** Canonical identity of a shot, independent of the agency's wording. */
function shotKey(finding) {
  if (!finding.matchValue) return null;
  return `${finding.field || 'shot'}:${finding.matchValue}`;
}

/**
 * Prefer the shortest label agencies use for a shot.
 *
 * Elite calls it "close-up"; Elite Models calls the same taxonomy value
 * "Close up (hair pulled back)". The row has to be named once, and the plain
 * one reads better as a row heading — the agency's own full wording is still
 * shown verbatim in that agency's own plate.
 */
function preferredLabel(current, candidate) {
  if (!current) return candidate;
  return candidate.length < current.length ? candidate : current;
}

const COVERED = 'covered';
const WANTED = 'wanted';
const NOT_ASKED = 'not_asked';

export const MATRIX_CELL = { COVERED, WANTED, NOT_ASKED };

/**
 * @param {Array} routes       from `readRoutes`
 * @param {Map|Object} byId    seriesId -> evaluationDto
 * @returns {{ shots: Array, columns: Array, recommendation: object|null }}
 */
export function buildSpecMatrix(routes, evaluationFor) {
  const columns = routes.map((route) => ({
    seriesId: route.seriesId,
    agencyName: route.agencyName,
    acceptsPholioSubmissions: route.acceptsPholioSubmissions,
  }));

  const shots = new Map();

  routes.forEach((route) => {
    const evaluation = evaluationFor(route.seriesId);
    const findings = Array.isArray(evaluation?.findings) ? evaluation.findings : [];
    findings.map(readFinding).forEach((finding) => {
      if (finding.categoryKey !== 'shots') return;
      const key = shotKey(finding);
      if (!key) return;
      if (!shots.has(key)) shots.set(key, { key, label: null, cells: new Map() });
      const row = shots.get(key);
      row.label = preferredLabel(row.label, finding.label || finding.matchValue);
      row.cells.set(
        route.seriesId,
        finding.outcome === OUTCOME.SATISFIED ? COVERED : WANTED,
      );
    });
  });

  const rows = [...shots.values()].map((row) => {
    const wantedBy = columns.filter((column) => row.cells.has(column.seriesId));
    const coveredFor = wantedBy.filter((column) => row.cells.get(column.seriesId) === COVERED);
    return {
      key: row.key,
      label: row.label,
      cells: columns.map((column) => ({
        seriesId: column.seriesId,
        state: row.cells.get(column.seriesId) || NOT_ASKED,
      })),
      wantedBy: wantedBy.length,
      coveredFor: coveredFor.length,
      // How many agencies this one shot would newly satisfy.
      unlocks: wantedBy.length - coveredFor.length,
    };
  });

  // Most-demanded first: the top of the grid is where the leverage is.
  rows.sort(
    (left, right) =>
      right.unlocks - left.unlocks ||
      right.wantedBy - left.wantedBy ||
      String(left.label).localeCompare(String(right.label)),
  );

  const best = rows.find((row) => row.unlocks > 0) || null;

  return {
    shots: rows,
    columns,
    /** The sentence no directory of agencies can produce. */
    recommendation: best
      ? { label: best.label, unlocks: best.unlocks, key: best.key }
      : null,
  };
}
