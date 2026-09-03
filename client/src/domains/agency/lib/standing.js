/**
 * standing — the agency's one standing model.
 *
 * Pure, no JSX, no React. Everything the submissions desk, the signing wall,
 * the ledger, the shelves, the review queue and the verdict bar need to agree
 * on lives here, because the one thing two working surfaces cannot afford is
 * disagreeing about what standing a person is in. Lifted out of
 * pages/signing/boardModel so Submissions prints the same words the wall does
 * (talent-card-metadata spec §9, defect 1).
 *
 * The model is derived from `applications.status` (canonical list in
 * src/shared/constants/application-status.js). Sections are stacked in
 * DECISION ORDER — what needs a decision first, what is settled last — never
 * as pipeline columns: a status change here notifies the talent, so it is a
 * decision, not a drag.
 *
 * See docs/superpowers/specs/2026-09-01-signing-board-design.md §2.1, §5.1.
 */

import { calendarDate } from '../components/meta/metaFormat';

/* ── section membership ───────────────────────────────────────────── */

const SECTION_BY_STATUS = {
  /* decide — the agency holds the next move */
  shortlisted: 'decide',
  submitted: 'decide',
  pending: 'decide',
  new: 'decide',

  /* waiting — the talent holds the next move */
  requested_more: 'waiting',
  meeting_requested: 'waiting',

  /* offer — an offer is out and sitting */
  accepted: 'offer',
  development: 'offer',

  /* settled, on the board */
  represented: 'represented',
  /* An event slot confirmation is the package board's equivalent standing.
     It is not `represented` in the database and must never be treated as
     representation, but on a package board it is the settled outcome the
     board is measured by, so it renders in the same section under the
     package vocabulary. */
  confirmed: 'represented',

  /* shelves */
  kept_on_file: 'file',
  passed: 'passed',
  declined: 'passed',
  archived: 'passed',
  withdrawn: 'closed',
  closed_no_response: 'closed',
  declined_by_talent: 'closed',
};

/**
 * Sections in decision order. `title` takes the board vocabulary because a
 * package board confirms talent for a client brief rather than representing
 * them, and the section is the one place that difference is visible.
 */
export const SECTIONS = Object.freeze([
  { key: 'decide', title: () => 'Needs a decision', shelf: false },
  { key: 'waiting', title: () => 'Waiting on talent', shelf: false },
  { key: 'offer', title: () => 'Offer out', shelf: false },
  { key: 'represented', title: (vocab) => vocab?.decided || 'Represented', shelf: false },
  { key: 'file', title: () => 'On file', shelf: true },
  { key: 'passed', title: () => 'Passed', shelf: true },
  { key: 'closed', title: () => 'Closed', shelf: true },
]);

export const SECTION_KEYS = SECTIONS.map((s) => s.key);

/**
 * Which section a status belongs to. An unrecognised status lands in
 * `decide` rather than vanishing: an unknown standing is precisely the thing
 * a booker has to look at.
 */
export function sectionOf(status) {
  const key = String(status || '').toLowerCase();
  return SECTION_BY_STATUS[key] || 'decide';
}

/* ── standing text ────────────────────────────────────────────────── */

const STANDING_TEXT = {
  submitted: 'Filed',
  pending: 'Filed',
  new: 'Filed',
  shortlisted: 'Shortlisted',
  requested_more: 'Digitals requested',
  meeting_requested: 'Meeting requested',
  accepted: 'Offer out',
  development: 'Development offer',
  kept_on_file: 'On file',
  passed: 'Passed',
  declined: 'Passed',
  archived: 'Passed',
  withdrawn: 'Withdrawn',
  closed_no_response: 'No response',
  declined_by_talent: 'Declined by talent',
};

const SETTLED_SECTIONS = new Set(['represented', 'file', 'passed', 'closed']);

const DAY = 86_400_000;

export function timestampOf(candidate) {
  return (
    candidate?.statusChangedAt
    || candidate?.status_changed_at
    || candidate?.submittedAt
    || candidate?.created_at
    || null
  );
}

export function msOf(value) {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * How long a candidate has been sitting in their current standing, in the
 * board's own vocabulary: days for the first week, weeks to two months, then
 * months. Deliberately terse — it is set in mono beside the standing text and
 * has to stay narrower than the words it qualifies.
 */
export function elapsedLabel(ts, now) {
  const t = msOf(ts);
  if (t == null) return null;
  const days = Math.max(0, Math.floor((now - t) / DAY));
  /* Something filed this morning has not been waiting for a number of days,
     and "0d" reads as a measurement rather than as today. */
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w`;
  return `${Math.max(1, Math.round(days / 30))}mo`;
}

/**
 * The standing line under a face.
 *
 * @returns {{ text: string, since: string|null, settled: boolean }}
 */
export function standingOf(candidate, vocab, now = Date.now()) {
  const status = String(candidate?.backendStatus || candidate?.status || 'submitted').toLowerCase();
  const section = sectionOf(status);
  const settled = SETTLED_SECTIONS.has(section);

  /* `confirmed` is the talent's answer to an event slot, not representation:
     it sits in the settled section but must never borrow the division's word
     for it, on any board. Everything else settled takes the board's own
     vocabulary. */
  let text;
  if (status === 'confirmed') text = 'Confirmed';
  else if (section === 'represented') text = vocab?.decided || 'Represented';
  else text = STANDING_TEXT[status] || 'Filed';

  const ts = timestampOf(candidate);
  /* A settled outcome is a date in the record, not a stopwatch. "Passed ·
     3mo" invites a booker to read elapsed time as pressure on a decision
     that was already made. */
  const since = settled ? calendarDate(ts, now) : elapsedLabel(ts, now);

  return { text, since, settled };
}

/**
 * The standing word for a status on its own, with no record to read it from —
 * what Undo names when it says which standing it put back.
 */
export function standingWord(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'represented') return 'Represented';
  return STANDING_TEXT[s] || 'Filed';
}

/**
 * What Undo can actually write back.
 *
 * `WRITABLE_APPLICATION_STATUSES` (src/shared/constants/application-status.js)
 * is the server's list of standings an agency may set by hand, and Undo is an
 * ordinary PATCH: a prior standing outside that list cannot be restored, so it
 * must not be offered. `pending` is the one prior with an honest equivalent —
 * it is the pre-review standing `submitted` already means on these surfaces.
 *
 * The rest — a talent's withdrawal, their confirmation of an event slot, their
 * decline, and the auto-close job's silence — were never the agency's to write
 * in the first place. Those decisions get a toast with no Undo rather than an
 * Undo that fails at the API.
 */
const UNDO_WRITABLE = new Set([
  'submitted', 'shortlisted', 'requested_more', 'meeting_requested',
  'development', 'accepted', 'represented',
  'passed', 'declined', 'archived', 'kept_on_file',
]);

const UNDO_ALIAS = { pending: 'submitted', new: 'submitted' };

/** The standing Undo would write for a prior, or null when it cannot. */
export function restorableStatus(status) {
  const s = String(status || '').toLowerCase();
  const mapped = UNDO_ALIAS[s] || s;
  return UNDO_WRITABLE.has(mapped) ? mapped : null;
}

/**
 * The stable key for a candidate everywhere on this surface: selection,
 * focus, the review queue, the lineup. Board rows carry both `applicationId`
 * and a legacy `id`; a surface that picked one in the wall and the other in
 * the ledger would silently lose the selection when the view toggled.
 */
export function candidateId(candidate) {
  return String(candidate?.applicationId ?? candidate?.id ?? '');
}

/* ── legality ─────────────────────────────────────────────────────── */

export const ACTION_KEYS = Object.freeze([
  'open', 'lineup', 'shortlist', 'request_digitals', 'invite_meeting',
  'offer', 'development', 'represent', 'keep_on_file', 'pass', 'reopen',
]);

const OPEN_STATUSES = new Set([
  'submitted', 'pending', 'new', 'shortlisted', 'requested_more', 'meeting_requested',
]);
const SHELVED = new Set([
  'kept_on_file', 'passed', 'declined', 'archived',
  'withdrawn', 'closed_no_response', 'declined_by_talent',
]);

/**
 * The actions legal on one status.
 *
 * Legality here is about the ladder, not about permissions — the page
 * intersects this with `useAgencyPermissions` before anything renders. An
 * action a status makes meaningless (offering representation to someone who
 * already has an offer out) is simply absent, never a disabled control: a
 * greyed row of eight buttons is how a verdict bar stops being readable.
 */
function actionsForStatus(status) {
  const s = String(status || '').toLowerCase();
  const set = new Set(['open', 'lineup']);
  const section = sectionOf(s);

  if (OPEN_STATUSES.has(s)) {
    if (s !== 'shortlisted') set.add('shortlist');
    if (s !== 'requested_more') set.add('request_digitals');
    if (s !== 'meeting_requested') set.add('invite_meeting');
    set.add('offer');
    set.add('development');
    set.add('keep_on_file');
    set.add('pass');
  }

  if (section === 'offer') {
    /* An offer that is out can be upgraded to the signed record, softened to
       a file, or withdrawn — but not re-offered. */
    set.add('represent');
    set.add('keep_on_file');
    set.add('pass');
    if (s === 'accepted') set.add('development');
    if (s === 'development') set.add('offer');
  }

  if (SHELVED.has(s)) set.add('reopen');

  return set;
}

/**
 * Actions legal for EVERY status in the selection. An empty selection has no
 * legal actions; the bar does not render at all.
 */
export function legalActions(statuses) {
  const list = Array.isArray(statuses) ? statuses : [];
  if (list.length === 0) return new Set();

  let legal = null;
  list.forEach((status) => {
    const forStatus = actionsForStatus(status);
    if (legal === null) {
      legal = forStatus;
      return;
    }
    legal = new Set([...legal].filter((a) => forStatus.has(a)));
  });
  return legal || new Set();
}

/**
 * The age notation a face carries, or none.
 *
 * "Under 18" is a compliance fact. "Age not recorded" is its honest absence:
 * the server withholds measurements for a candidate whose date of birth it
 * cannot read (src/shared/lib/talent-age.js — age unknown is not cleared),
 * and the tile has to say why rather than read as an ordinary adult.
 */
export function ageNotation(candidate) {
  if (candidate?.isMinor) return 'Under 18';
  if (candidate?.ageUnknown) return 'Age not recorded';
  return null;
}

/**
 * A face whose file is gone should sink into its ground, never show the
 * browser's broken-image glyph. Keeps the box so the layout does not shift.
 */
export function hideBrokenImage(event) {
  event.currentTarget.style.opacity = '0';
}
