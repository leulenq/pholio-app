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
 * (`routeDto`, `findingDto`, `countSummary`, `shotCoverage`, `evaluationDto`,
 * `verificationDto`, `callWindowDto`).
 * If a field moves there, it moves here, and both surfaces move with it.
 */
import {
  DEFAULT_CALL_WINDOW_TIMEZONE,
  DEFAULT_VERIFICATION_REGISTRY_STATUS,
  isIsoWeekday,
} from '../../../shared/constants/submissionTracker';

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
 * (`YYYY-MM-DD`), not timestamps — so read them without a timezone shift.
 * Parsing "2026-08-09" with `new Date()` yields UTC midnight, which renders as
 * the previous day west of Greenwich.
 */
function calendarDate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRegistryDate(value) {
  if (!value) return null;
  const date = calendarDate(value);
  if (!date) return String(value);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * "July 2028" — the same UTC-safe parse at month precision.
 *
 * A registration's expiry is read as a season, not as a deadline: the day a
 * certificate lapses is the registry's business, and printing it invites the
 * talent to diarise a date that is not theirs to act on.
 */
export function formatRegistryMonth(value) {
  if (!value) return null;
  const date = calendarDate(value);
  if (!date) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

/**
 * `scope.channel.type` — the spec pack's channel vocabulary.
 *
 * `TRACKER_CHANNELS` in `shared/constants/submissionTracker.js` mirrors this
 * list (minus `pholio_open_call`, plus `other`); the plate branches on a name
 * from here rather than on a bare string, and
 * `__tests__/specRegistry.test.js` asserts every member is still a member of
 * that shared vocabulary, so the two cannot drift silently.
 */
export const CHANNEL_TYPE = Object.freeze({
  OFFICIAL_WEB_FORM: 'official_web_form',
  OFFICIAL_EMAIL: 'official_email',
  OFFICIAL_WALK_IN: 'official_walk_in',
  AGENCY_BRANDED_THIRD_PARTY_FORM: 'agency_branded_third_party_form',
});

/**
 * How each registry is named to a talent. Keyed by
 * `agency_verifications.registry`; the same drift test asserts every registry
 * in the shared vocabulary has a label, because an unlabelled registry renders
 * as no claim at all.
 */
export const REGISTRY_LABEL = Object.freeze({
  ny_dol: 'NYSDOL-registered',
});

/**
 * The registration a claim has to be in to be worth stating. `active` is also
 * the column default — a lapsed or revoked row is data, but it is not a
 * positive claim, and ruling R3 only ever displays positive claims.
 */
const LIVE_REGISTRY_STATUS = DEFAULT_VERIFICATION_REGISTRY_STATUS;

/** A registry match, as `verificationDto` sends it. Null when Pholio holds none. */
export function readVerification(verification) {
  if (!verification?.certificateNumber) return null;
  return {
    registry: verification.registry ?? null,
    certificateNumber: verification.certificateNumber,
    expiresOn: verification.expiresOn ?? null,
    registryStatus: verification.registryStatus ?? LIVE_REGISTRY_STATUS,
    verifiedOn: verification.verifiedOn ?? null,
  };
}

/**
 * The registry claim as one line:
 * "NYSDOL-registered · Cert 26-69YIX-LSFW · expires July 2028".
 *
 * Positive-only (ruling R3). Null means Pholio holds no live registry match for
 * this agency and the surface renders *nothing* — never "unverified", which
 * would turn a young registry's gaps into an accusation.
 */
export function readVerificationNotice(verification) {
  const record = readVerification(verification);
  if (!record) return null;
  if (record.registryStatus !== LIVE_REGISTRY_STATUS) return null;
  const registry = REGISTRY_LABEL[record.registry];
  if (!registry) return null;
  const parts = [registry, `Cert ${record.certificateNumber}`];
  const expires = formatRegistryMonth(record.expiresOn);
  if (expires) parts.push(`expires ${expires}`);
  return parts.join(' · ');
}

/**
 * One recurring open-call window, as `callWindowDto` (inside a route) and
 * `GET /api/talent/call-windows` (standalone) send it. The standalone payload
 * carries `organizationId`/`agencyId`/`verifiedOn` too; a route's copy does
 * not, so those read as null rather than being demanded.
 *
 * Times stay as wall-clock minutes in the window's own zone — formatting is
 * `utils/callWindows.js`'s job, not this module's.
 */
export function readCallWindow(window) {
  if (!window?.id) return null;
  const weekday = Number(window.weekday);
  // A window that cannot be placed in a week cannot be read out as one.
  if (!isIsoWeekday(weekday)) return null;
  return {
    id: window.id,
    organizationId: window.organizationId ?? null,
    agencyId: window.agencyId ?? null,
    displayName: window.displayName || null,
    label: window.label || null,
    weekday,
    startMinute: window.startMinute ?? null,
    endMinute: window.endMinute ?? null,
    timezone: window.timezone || DEFAULT_CALL_WINDOW_TIMEZONE,
    location: window.location ?? null,
    instructions: window.instructions ?? null,
    sourceUrl: window.sourceUrl ?? null,
    verifiedOn: window.verifiedOn ?? null,
  };
}

/** `GET /api/talent/call-windows`, whether the envelope was unwrapped or not. */
export function readCallWindows(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.callWindows)
        ? payload.callWindows
        : [];
  return list.map(readCallWindow).filter(Boolean);
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
    // How this agency takes applications (`scope.channel.type`). The plate has
    // to say "by email" or "on their site" *before* the talent builds a set,
    // and the two are not the same errand.
    channelType: route.channelType ?? route.channel?.type ?? null,
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
    // Trust overlay. Both are positive-only: no registry match is null, and no
    // published open call is an empty list — neither states an absence.
    verification: readVerification(route.verification),
    callWindows: readCallWindows(route.callWindows),
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
