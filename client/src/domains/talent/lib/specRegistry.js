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
 * It is also where the *presentation vocabulary* is decided. Every rule the
 * matcher evaluates is written in taxonomy terms (`close_up`, `shot.frame`,
 * `appearance.hair_state`) and every agency labels the same requirement in its
 * own words ("upload profile", "Mid length *", "Close up profile (hair pulled
 * back)"). Neither is product copy. `labelFor` turns the taxonomy identifier
 * into the product's own wording, and the agency's wording is demoted to
 * marginalia — quoted, attributed, never spoken in Pholio's voice.
 *
 * Server source of truth: `src/domains/spec-registry/preflight-service.js`
 * (`routeDto`, `findingDto`, `countSummary`, `shotCoverage`, `evaluationDto`,
 * `verificationDto`, `callWindowDto`, `registryTaxonomyLabels`).
 * If a field moves there, it moves here, and both surfaces move with it.
 */
import { labelForShot } from '../../../shared/constants/frameTaxonomy';
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
 * `findingDto.categoryKey` — the machine-readable bucket. The requirements
 * detail is organised by this and nothing else: a talent reads "shots", "set
 * rules", "files", not "attention" and "confirm", which described how sure
 * Pholio was rather than what the agency asked for.
 */
export const CATEGORY = {
  SHOTS: 'shots',
  SHOT_COUNT: 'shotCount',
  SET_WIDE: 'setWide',
  FILES: 'files',
  ELIGIBILITY: 'eligibility',
  APPLICATION_FIELDS: 'applicationFields',
  SOURCE_UNKNOWN: 'sourceUnknown',
};

/**
 * One vocabulary, everywhere (ruling R-D).
 *
 * The requirements page, the cross-market shot strip and the apply workspace's
 * preflight panel all answer the same question about the same shot, so they
 * answer it in the same three words. "Covered", "matched", "Attention",
 * "Confirm" and "Still needed by 3" are all gone.
 */
export const SLOT_STATE = Object.freeze({
  IN_SET: 'in_set',
  NEEDED: 'needed',
  NOT_ASKED: 'not_asked',
});

export const SLOT_STATE_WORD = Object.freeze({
  [SLOT_STATE.IN_SET]: 'In your set',
  [SLOT_STATE.NEEDED]: 'Still needed',
  [SLOT_STATE.NOT_ASKED]: 'Not asked for',
});

/**
 * A finding's outcome, as one of the three states.
 *
 * `unknown` is deliberately the quiet state rather than the one that asks for
 * action: Pholio could not verify it from the saved profile, which is not the
 * same as the agency asking for something the talent has not shot. Treating it
 * as "still needed" would put the accent on work that may already be done.
 */
export function slotStateForOutcome(outcome) {
  if (outcome === OUTCOME.SATISFIED) return SLOT_STATE.IN_SET;
  // An unverifiable slot is still a PUBLISHED slot — the agency asked for it.
  // Live verification caught the earlier unknown→not-asked mapping rendering
  // "Not asked for" under "0 of 3 in your current set", a factual error. The
  // conservative truth is "Still needed": the shot is asked for and Pholio has
  // no confirmed match; per-slot guidance carries the "confirm yourself" nuance.
  if (outcome === OUTCOME.NOT_APPLICABLE) return SLOT_STATE.NOT_ASKED;
  return SLOT_STATE.NEEDED;
}

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
 * list (minus `pholio_open_call`, plus `other`); the detail branches on a name
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
    /*
      The house this route belongs to. Elite publishes four routes — Paris,
      Tokyo, Global, North America — and they are four ways into ONE house, not
      four agencies. The market groups on this so a talent reads Elite once.
    */
    organizationId: route.organization?.id || null,
    marketLabel: route.marketLabel || null,
    /*
      The market as the registry actually types it, not just its label. `kind`
      is one of city | country | region | global | selected_market, and a
      selected-market route has no single label at all — Ford publishes one
      route covering US, FR and ES. A directory that flattens all of this into
      one location string says "Global" where the agency said nothing, so the
      shape travels and the surface decides how to say it.
    */
    market: route.market
      ? {
          kind: route.market.kind || null,
          city: route.market.city || null,
          code: route.market.code || null,
          countryCodes: Array.isArray(route.market.countryCodes)
            ? route.market.countryCodes
            : [],
        }
      : null,
    /* The physical office that receives applications, when one is named. */
    office: route.office?.name || null,
    sourceUrl: route.sourceUrl ?? null,
    // How this agency takes applications (`scope.channel.type`). The rail has
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
    // Which Pholio agency this route belongs to, when it belongs to one. The
    // market directory joins on this so a house Pholio delivers to never draws
    // twice — once as an agency and once as a researched route.
    pholioAgencyId: route.pholioAgencyId ?? null,
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
 * The taxonomy label map (`labels`) travels on the routes response and on every
 * preflight response. Either is authoritative; the page reads whichever it has.
 */
export function readLabels(...payloads) {
  for (const payload of payloads) {
    const envelope = payload?.data ?? payload;
    const labels = envelope?.labels;
    if (labels && typeof labels === 'object') return labels;
  }
  return {};
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
    /**
     * The row identity, for every finding — simple and compound slots alike.
     * Never null. Keying on `matchValue` was what silently dropped every
     * compound slot: Elite publishes six shots and four of them are
     * conjunctions, so the old grid drew two.
     */
    slotKey: finding.slotKey || finding.id,
    // The machine-readable bucket (`shots`, `files`, `eligibility`,
    // `applicationFields`, …). `category` is its display name; a surface that
    // wants to reason about *which* kind of requirement this is has to read the
    // key, not the label.
    categoryKey: finding.categoryKey ?? null,
    category: finding.category || null,
    // The canonical taxonomy value (`close_up`, `full_length`, `profile`) and,
    // for a conjunction, every term of it in published order. `matchKey` is the
    // order-independent identity two agencies publishing the same requirement
    // share; null means the slot stands as its own row.
    matchValue: finding.matchValue ?? null,
    matchValues: Array.isArray(finding.matchValues) ? finding.matchValues : [],
    matchKey: finding.matchKey ?? null,
    field: finding.field ?? null,
    modality: finding.modality ?? null,
    outcome: finding.outcome,
    severity: finding.severity ?? null,
    requiresAttention: finding.requiresAttention === true,
    /**
     * The agency's own wording. Marginalia only (ruling R-E) — it is an
     * excerpt of someone else's page, sometimes elided ("avoid ... make-up"),
     * sometimes shouted, sometimes not in English.
     */
    sourceLabel: finding.sourceLabel ?? null,
    guidance: finding.guidance ?? null,
    target: finding.target?.href ? finding.target : null,
    // Which of the talent's images landed in this slot — the thumbnail source.
    assignments: Array.isArray(finding.assignments) ? finding.assignments : [],
    actual: finding.actual ?? null,
    minimum: finding.minimum ?? null,
    maximum: finding.maximum ?? null,
    // Whether Pholio actually held the facts it checked against. A fact it
    // never had is not a requirement the talent failed.
    factStates: Array.isArray(finding.factStates) ? finding.factStates : [],
  };
}

export function readFindings(evaluation) {
  return (Array.isArray(evaluation?.findings) ? evaluation.findings : []).map(readFinding);
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

/* ================================================================== *
 * The label resolver (ruling R-E)
 *
 * One place turns a taxonomy identifier into words. Everything the
 * talent reads on these surfaces comes through here or is written by
 * hand; nothing arrives from the wire and goes straight to the screen.
 * ================================================================== */

function titleCase(value) {
  return String(value ?? '')
    .replace(/[._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * A taxonomy value, in the product's words.
 *
 * taxonomy label → `frameTaxonomy.labelForShot` → Title Case, in that order.
 * The middle branch matters because the frame vocabulary is already named for
 * the talent everywhere else in the studio, and one shot should not be called
 * "Close-up" in Media and "Close Up" here.
 */
export function labelFor(labels, field, value) {
  const taxonomy = labels?.[field]?.values?.[value]?.label;
  if (taxonomy) return taxonomy;
  if (value === null || value === undefined || value === '') {
    return fieldLabel(labels, field);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const framed = labelForShot(value);
  if (framed) return framed;
  return titleCase(value);
}

/** A taxonomy field, in the product's words. */
export function fieldLabel(labels, field) {
  return labels?.[field]?.label || titleCase(field) || 'Published requirement';
}

/**
 * Qualifier nouns the taxonomy value alone does not carry.
 *
 * `appearance.hair_state: pulled_back` is labelled "Pulled back", which reads
 * as a shot name rather than as a note about hair. One noun, added only when
 * the value's own label does not already say it.
 */
const QUALIFIER_NOUN = Object.freeze({
  'appearance.hair_state': 'hair',
  'appearance.makeup_level': 'makeup',
  'clothing.fit': 'clothing',
});

function qualifierPhrase(labels, term) {
  const phrase = labelFor(labels, term.field, term.value).toLowerCase();
  const noun = QUALIFIER_NOUN[term.field];
  return noun && !phrase.includes(noun) ? `${noun} ${phrase}` : phrase;
}

/**
 * The canonical name of a published shot: "Close-up profile, hair pulled back".
 *
 * The frame is the head of the phrase, the view rides with it as one shot name
 * ("Full length profile"), and everything else follows as a qualifier. A slot
 * with no frame at all is named for what it is instead — "Profile shot",
 * "Personality shot" — because "Profile" alone is not the name of a picture.
 */
export function canonicalShotLabel(finding, labels) {
  const terms = finding.matchValues?.length
    ? finding.matchValues
    : finding.field && finding.matchValue != null
      ? [{ field: finding.field, operator: 'equals', value: finding.matchValue }]
      : [];

  if (!terms.length) return fieldLabel(labels, finding.field);

  const frame = terms.find((term) => term.field === 'shot.frame');
  const view = terms.find((term) => term.field === 'shot.view');
  const purpose = terms.find((term) => term.field === 'shot.purpose');
  const spent = new Set();

  let head;
  if (frame) {
    spent.add(frame);
    head = labelFor(labels, frame.field, frame.value);
    if (view) {
      spent.add(view);
      head = `${head} ${labelFor(labels, view.field, view.value).toLowerCase()}`;
    }
  } else if (view) {
    spent.add(view);
    head = `${labelFor(labels, view.field, view.value)} shot`;
  } else if (purpose) {
    spent.add(purpose);
    head = `${labelFor(labels, purpose.field, purpose.value)} shot`;
  } else {
    spent.add(terms[0]);
    head = labelFor(labels, terms[0].field, terms[0].value);
  }

  const qualifiers = terms
    .filter((term) => !spent.has(term))
    .map((term) => qualifierPhrase(labels, term));

  return qualifiers.length ? `${head}, ${qualifiers.join(', ')}` : head;
}

/**
 * The agency's own wording, when it says something the canonical name does not.
 *
 * Storm's "Mid length *" and the canonical "Mid-length" are the same string
 * once punctuation is dropped, and printing both would only ask the reader to
 * reconcile them. IMG's "upload profile" genuinely differs — that is the label
 * on the button they will click — so it is kept, as marginalia.
 */
export function marginaliaFor(sourceLabel, canonical) {
  const wording = publishedWording(sourceLabel);
  if (!wording) return null;
  const reduce = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const left = reduce(wording);
  const right = reduce(canonical);
  if (!left || !right) return null;
  if (left === right || left.includes(right) || right.includes(left)) return null;
  return wording;
}

/**
 * An excerpt of an agency's page, made safe to set on ours.
 *
 * The registry records what the source said, which means elisions
 * ("avoid ... make-up"), shouting ("DO NOT wear: HEELS") and mid-sentence
 * starts. It is still the most useful thing a talent can read about a set rule,
 * so it is quoted and attributed rather than paraphrased — but the page speaks
 * in one voice, so the shouting is settled and the ellipsis is typeset.
 */
export function publishedWording(value) {
  const text = String(value ?? '')
    .replace(/\s*\.\.\.\s*/g, ' … ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const shouted = text.split(' ').filter((word) => /^[A-Z]{2,}$/.test(word));
  const settled =
    shouted.length >= 2
      ? text.replace(/\b[A-Z]{2,}\b/g, (word) => word.toLowerCase())
      : text;

  return settled.charAt(0).toUpperCase() + settled.slice(1);
}

/* ================================================================== *
 * The market, as the talent reads it.
 *
 * Two views, both built from the same findings: one agency in full,
 * and one canonical shot across every agency. There is no matrix —
 * shots are eight rows, agencies are a count, and the twenty-five
 * column grid answered neither question.
 * ================================================================== */

/** The published shot slots for one route, in the order the server listed them. */
function shotFindings(findings) {
  return findings.filter(
    (finding) =>
      finding.categoryKey === CATEGORY.SHOTS &&
      finding.outcome !== OUTCOME.NOT_APPLICABLE,
  );
}

/** "a, b and c" / "a, b or c" — never a bare comma list ending. */
export function joinPhrases(items, conjunction = 'and') {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${list[list.length - 1]}`;
}

const MODALITY_WORD = Object.freeze({
  required: 'Required',
  requested: 'They ask for this',
  prohibited: 'Not allowed',
  preferred: 'They prefer this',
  encouraged: 'They encourage this',
  allowed: 'Allowed',
  not_required: 'Not required',
  optional: 'Optional',
});

/**
 * The three file facts, named for a talent rather than for a validator.
 * "File MIME type" is the taxonomy's word and it is not a person's.
 */
const FILE_SUBJECT = Object.freeze({
  'file.size_bytes': 'file size',
  'file.count': 'how many images',
  'file.mime_type': 'image format',
});

/**
 * Form fields whose taxonomy label is precise but not conversational. Anything
 * absent falls through to the taxonomy label, so a new field is never a crash
 * and never a slug — only slightly stiffer wording than these.
 */
const FORM_FIELD_WORD = Object.freeze({
  'measurements.height': 'height',
  'applicant.story': 'something about yourself',
  'applicant.message': 'a message to them',
  'applicant.current_representation': 'whether you have representation',
  'consent.image_submission_authority': 'permission to submit your images',
  'application.password': 'a password for their site',
  'application.work_authorization': 'your work authorization',
  'guardian.identity_document': "a guardian's ID",
});

/** Facts a source never published, grouped into the few things a talent cares about. */
const UNPUBLISHED_GROUPS = [
  ['files.', 'file limits'],
  ['shots.', 'shot details'],
  ['presentation.', 'shoot guidance'],
  ['eligibility.', 'eligibility details'],
  ['scope.', 'which office receives applications'],
  ['application.', 'some of their form fields'],
];

function formFieldWord(labels, finding) {
  const override = FORM_FIELD_WORD[finding.field];
  if (override) return override;
  const label = fieldLabel(labels, finding.field);
  // Social handles are proper nouns; everything else reads as running prose.
  if (String(finding.field || '').startsWith('social.')) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * One agency, by category — the shape ruling R-C describes.
 *
 * Nothing here is a confidence bucket. Every section answers "what did they
 * ask for", and the talent's own state rides along inside it.
 */
export function buildAgencyView({ route, evaluation, labels }) {
  const findings = readFindings(evaluation);
  const coverage = readShotCoverage(evaluation?.shotCoverage);
  const summary = readSummary(evaluation?.summary);

  const shots = shotFindings(findings).map((finding) => {
    const label = canonicalShotLabel(finding, labels);
    return {
      key: finding.slotKey,
      label,
      marginalia: marginaliaFor(finding.sourceLabel, label),
      state: slotStateForOutcome(finding.outcome),
      imageId: finding.assignments.find((entry) => entry?.imageId)?.imageId || null,
      target: finding.target,
    };
  });
  const covered = shots.filter((shot) => shot.state === SLOT_STATE.IN_SET);
  /*
    Only what is genuinely still needed. A slot Pholio could not evaluate reads
    as "Not asked for" beside its own row, so listing it under "Missing:" would
    have the same shot say two different things in one pane.
  */
  const missing = shots.filter((shot) => shot.state === SLOT_STATE.NEEDED);

  const shotCountFinding = findings.find(
    (finding) => finding.categoryKey === CATEGORY.SHOT_COUNT,
  );

  const setRules = findings
    .filter((finding) => finding.categoryKey === CATEGORY.SET_WIDE)
    .map((finding) => ({
      key: finding.slotKey,
      subject: fieldLabel(labels, finding.field),
      text: publishedWording(finding.sourceLabel),
      modality: MODALITY_WORD[finding.modality] || null,
    }))
    .filter((rule) => rule.text);

  const fileFindings = findings.filter(
    (finding) =>
      finding.categoryKey === CATEGORY.FILES &&
      finding.outcome !== OUTCOME.NOT_APPLICABLE,
  );
  const files = fileFindings.length
    ? {
        subjects: [
          ...new Set(
            fileFindings.map(
              (finding) =>
                FILE_SUBJECT[finding.field] ||
                fieldLabel(labels, finding.field).toLowerCase(),
            ),
          ),
        ],
        published: fileFindings
          .map((finding) => publishedWording(finding.sourceLabel))
          .filter(Boolean),
      }
    : null;

  const eligibility = findings
    .filter(
      (finding) =>
        finding.categoryKey === CATEGORY.ELIGIBILITY &&
        finding.outcome !== OUTCOME.NOT_APPLICABLE,
    )
    .map((finding) => {
      const subject = fieldLabel(labels, finding.field);
      const unheld =
        finding.outcome === OUTCOME.UNKNOWN ||
        finding.factStates.some((fact) => fact.state && fact.state !== 'known');
      /*
        The mirror, gently. An eligibility rule Pholio could not check is a gap
        in Pholio's knowledge, never a verdict on the talent — and `missing`
        here usually means exactly that, since the matcher reports a fact it
        never held as a miss.
      */
      const sentence = unheld
        ? `${subject} — Pholio can’t check this from your profile.`
        : finding.outcome === OUTCOME.SATISFIED
          ? `${subject} — your profile is inside what they publish.`
          : `${subject} — your profile sits outside what they publish.`;
      return {
        key: finding.slotKey,
        sentence,
        marginalia: marginaliaFor(finding.sourceLabel, subject),
        target: finding.target,
      };
    });

  const formFindings = findings.filter(
    (finding) =>
      finding.categoryKey === CATEGORY.APPLICATION_FIELDS &&
      finding.outcome !== OUTCOME.NOT_APPLICABLE,
  );
  const formFields = formFindings.length
    ? {
        list: [...new Set(formFindings.map((finding) => formFieldWord(labels, finding)))],
        /*
          One sentence for the whole group, not one row each. Against the real
          registry this bucket runs to thirty-three entries, every one of them
          carrying the identical "Pholio cannot verify this" — which buried the
          two lines on the page that were worth reading.
        */
        unverifiable:
          (summary?.confirm ?? 0) > 0 ||
          formFindings.some((finding) => finding.outcome === OUTCOME.UNKNOWN),
      }
    : null;

  const unpublished = findings.filter(
    (finding) => finding.categoryKey === CATEGORY.SOURCE_UNKNOWN,
  );
  const unpublishedGroups = UNPUBLISHED_GROUPS.filter(([prefix]) =>
    unpublished.some((finding) => String(finding.field || '').startsWith(prefix)),
  ).map(([, phrase]) => phrase);
  const notPublished = unpublishedGroups.length
    ? `${route.agencyName} doesn’t publish ${joinPhrases(unpublishedGroups, 'or')}.`
    : null;

  return {
    shots,
    published: shots.length,
    covered: covered.length,
    missingLabels: missing.map((shot) => shot.label),
    shotCount: shotCountFinding
      ? {
          minimum: shotCountFinding.minimum,
          maximum: shotCountFinding.maximum,
          actual: shotCountFinding.actual,
        }
      : null,
    setRules,
    files,
    eligibility,
    formFields,
    notPublished,
    coverage,
    summary,
    hasAnything: findings.length > 0,
  };
}
